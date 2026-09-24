/** 從多個候選 sessionStorage 鍵讀取第一個非空值。 */
function firstStorageValue(keys) {
    for (const key of keys) {
        const value = sessionStorage.getItem(key)?.trim();
        if (value)
            return value;
    }
    return '';
}
/** 安全解析 sessionStorage 中的 JSON 物件。 */
function storedObject(keys) {
    const raw = firstStorageValue(keys);
    if (!raw)
        return {};
    try {
        const value = JSON.parse(raw);
        return value && typeof value === 'object' && !Array.isArray(value)
            ? value
            : {};
    }
    catch {
        return {};
    }
}
/** 將未知登入欄位轉成去除空白的字串。 */
function textValue(value) {
    return typeof value === 'string' ? value.trim() : '';
}
/** 從登入資料讀取指定玩家的年級、個案編號與學校。 */
function readStudent(playerNumber) {
    const prefix = 'student' + playerNumber;
    const stored = storedObject([prefix, prefix + '_context', prefix + '_data']);
    const studentKey = firstStorageValue([prefix + '_key'])
        || textValue(stored.studentKey)
        || textValue(stored.student_key);
    const separator = studentKey.indexOf('_');
    const grade = firstStorageValue([
        prefix + '_grade',
        playerNumber === 1 ? 'grade' : '',
    ].filter(Boolean)) || textValue(stored.grade)
        || (separator > 0 ? studentKey.slice(0, separator) : '');
    const caseId = firstStorageValue([
        prefix + '_case_id',
        prefix + '_caseId',
        playerNumber === 1 ? 'caseId' : '',
        playerNumber === 1 ? 'case_id' : '',
    ].filter(Boolean)) || textValue(stored.caseId) || textValue(stored.case_id)
        || (separator > 0 ? studentKey.slice(separator + 1) : '');
    const school = firstStorageValue([
        prefix + '_school',
        playerNumber === 1 ? 'school' : '',
    ].filter(Boolean)) || textValue(stored.school);
    return grade && caseId && school ? { grade, caseId, school } : undefined;
}
/** 讀取登入流程留下的學生資料與施測日。 */
export function readLoginContext(mode) {
    const studentCount = mode === 'multi' ? 2 : 1;
    const students = Array.from({ length: studentCount }, (_, index) => readStudent(index + 1));
    const loginData = storedObject(['login_context', 'loginData', 'login_data']);
    // const currentDayValue = firstStorageValue(['current_day', 'currentDay'])
    //     || String(loginData.currentDay ?? loginData.current_day ?? '');
    // const currentDay = Number(currentDayValue);
    const currentDay = parseInt(sessionStorage.getItem('currentDay') || '1', 10);
    if (students.some((student) => !student)) {
        throw new Error('缺少登入學生資料，請從登入頁重新進入遊戲。');
    }
    if (!Number.isInteger(currentDay) || currentDay < 1) {
        throw new Error('缺少有效的施測日資料，請從登入頁重新進入遊戲。' + {currentDay});
    }
    return {
        currentDay,
        students: students,
    };
}
/** 產生與 System.Guid.NewGuid().ToString() 等價的 UUID 字串。 */
export function createPairId() {
    if (typeof crypto.randomUUID === 'function')
        return crypto.randomUUID();
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
    return [
        hex.slice(0, 8),
        hex.slice(8, 12),
        hex.slice(12, 16),
        hex.slice(16, 20),
        hex.slice(20),
    ].join('-');
}
/** 將玩家遊戲統計轉成後端 api/sessions 所需格式。 */
export function buildSessionPayloads(source) {
    const duration = Math.max(0, source.endTime - source.startTime);
    return source.login.students.map((student, index) => {
        const stats = source.players[index].stats;
        const wrong = Math.max(0, stats.totalRounds - stats.score);
        const accuracy = stats.totalRounds === 0 ? 0 : stats.score / stats.totalRounds;
        return {
            lessonId: '1140908_EFT',
            data: {
                grade: student.grade,
                caseId: student.caseId,
                school: student.school,
                currentDay: source.login.currentDay,
                startTime: source.startTime,
                endTime: source.endTime,
                ...(source.mode === 'multi'
                    ? { mode: 'double', pairId: source.pairId }
                    : {}),
                stats: [
                    { apiname: 'EFT_correct', value: stats.score },
                    { apiname: 'EFT_wrong', value: wrong },
                    { apiname: 'EFT_accuracy', value: accuracy },
                    { apiname: 'EFT_duration', value: duration },
                    { apiname: 'EFT_stage', value: source.stage },
                ],
            },
        };
    });
}
/** 將每位學生的結果個別送到 api/sessions。 */
export async function submitSessions(payloads) {
    const outcomes = await Promise.allSettled(payloads.map(async (payload) => {
        const response = await fetch('/api/sessions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        if (!response.ok)
            throw new Error('api/sessions 回傳 ' + response.status);
    }));
    const failures = outcomes.filter((outcome) => outcome.status === 'rejected');
    if (failures.length > 0)
        throw new Error(failures.length + ' 筆遊戲結果傳送失敗');
}
/** 在頁面實際離開時使用 sendBeacon 傳送目前進度。 */
export function beaconSessions(payloads) {
    payloads.forEach((payload) => {
        const body = new Blob([JSON.stringify(payload)], { type: 'application/json' });
        navigator.sendBeacon('/api/sessions', body);
    });
}
