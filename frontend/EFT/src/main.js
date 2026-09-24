import { createGameController } from './controller.js';
import { PlayerGame } from './game.js';
import { FORMAL_LEVEL_COUNT, FORMAL_LEVEL_DURATION_SECONDS, PRACTICE_DURATION_SECONDS, } from './game-config.js';
import { CanvasPlayerRenderer } from './renderer.js';
import { beaconSessions, buildSessionPayloads, createPairId, readLoginContext, submitSessions, } from './session.js';
import { createAppElements, GameView } from './ui.js';
const view = new GameView(createAppElements());
const mode = document.body.dataset.gameMode === 'double' ? 'multi' : 'single';
const players = createPlayers();
let controller;
let phase = 'setup';
let loginContext;
let pairId;
let runStartedAt = 0;
let countdownTimeoutId;
let submitted = false;
/** 建立左右玩家及各自的 Canvas renderer 與按鍵配置。 */
function createPlayers() {
    return [
        new PlayerGame('left', new CanvasPlayerRenderer(view.elements.leftArena), {
            ArrowUp: 'KeyW', ArrowDown: 'KeyS',
            ArrowLeft: 'KeyA', ArrowRight: 'KeyD',
        }, (correct) => { view.showFeedback('left', correct); updateScores(); }),
        new PlayerGame('right', new CanvasPlayerRenderer(view.elements.rightArena), {
            ArrowUp: 'ArrowUp', ArrowDown: 'ArrowDown',
            ArrowLeft: 'ArrowLeft', ArrowRight: 'ArrowRight',
        }, (correct) => { view.showFeedback('right', correct); updateScores(); }),
    ];
}
/** 讀取登入資料並進入固定頁面模式的操作說明。 */
function beginGameFlow() {
    try {
        loginContext = readLoginContext(mode);
    }
    catch (error) {
        window.alert(error instanceof Error ? error.message : '無法讀取登入資料。');
        return;
    }
    controller?.reset();
    controller = undefined;
    pairId = mode === 'multi' ? createPairId() : undefined;
    runStartedAt = Date.now();
    submitted = false;
    phase = 'instructions';
    view.showPlay(mode);
    view.setPracticeMode(false);
    view.setResultSaveStatus('');
    view.showInstructions();
    updateScores();
}
/** 操作說明確認後開始 30 秒練習。 */
function startPractice() {
    view.hideInstructions();
    phase = 'practice';
    view.setPracticeMode(true);
    controller = createGameController(PRACTICE_DURATION_SECONDS, activePlayers(), { timerDisplay: view.elements.timerDisplay, onFinish: startFormalCountdown }, 'test');
    controller.start();
    updateScores();
}
/** 略過操作說明與練習，直接開始正式遊戲。 */
function skipInstructionsAndPractice() {
    view.hideInstructions();
    startGame();
}
/** 結束剩餘練習時間並進入正式開始倒數。 */
function skipPractice() {
    if (phase !== 'practice')
        return;
    controller?.reset();
    startFormalCountdown();
}
/** 顯示三秒倒數，完成後啟動正式遊戲。 */
function startFormalCountdown() {
    controller?.reset();
    controller = undefined;
    phase = 'countdown';
    view.setPracticeMode(false);
    updateScores();
    let seconds = 3;
    view.showStartCountdown(seconds);
    clearCountdownTimer();
    const tick = () => {
        seconds -= 1;
        if (seconds === 0) {
            startGame();
            return;
        }
        view.showStartCountdown(seconds);
        countdownTimeoutId = window.setTimeout(tick, 1000);
    };
    countdownTimeoutId = window.setTimeout(tick, 1000);
}
/** 清除尚未完成的正式遊戲倒數。 */
function clearCountdownTimer() {
    if (countdownTimeoutId !== undefined)
        window.clearTimeout(countdownTimeoutId);
    countdownTimeoutId = undefined;
}
/** 啟動十關正式遊戲。 */
function startGame() {
    clearCountdownTimer();
    controller?.reset();
    phase = 'game';
    view.hideInstructions();
    view.hideStartCountdown();
    view.setPracticeMode(false);
    controller = createGameController(FORMAL_LEVEL_COUNT * FORMAL_LEVEL_DURATION_SECONDS, activePlayers(), {
        timerDisplay: view.elements.timerDisplay,
        onFinish: finishGame,
        onLevelPause: (level) => view.showLevelPause(level, mode === 'multi' ? '請確認兩位玩家都準備好，再一起進入下一關。' : undefined),
    }, 'formal', FORMAL_LEVEL_COUNT, FORMAL_LEVEL_DURATION_SECONDS);
    controller.start();
    updateScores();
}
/** 正式遊戲完成後顯示結果並傳送每位學生資料。 */
function finishGame() {
    phase = 'results';
    view.hideLevelPause();
    view.setPracticeMode(false);
    view.showResults(mode, players);
    view.setResultSaveStatus('正在儲存並傳送結果…');
    void submitCurrentResults();
}
/** 依目前正式遊戲進度建立 API payload。 */
function currentPayloads() {
    if (!loginContext || runStartedAt <= 0)
        return [];
    const isFormalProgress = phase === 'game' || phase === 'results';
    return buildSessionPayloads({
        mode,
        pairId,
        login: loginContext,
        startTime: runStartedAt,
        endTime: Date.now(),
        stage: isFormalProgress ? controller?.currentLevel ?? 1 : 0,
        players: activePlayers(),
    });
}
/** 傳送目前遊戲結果到後端 API。 */
async function submitCurrentResults() {
    if (submitted)
        return true;
    const payloads = currentPayloads();
    if (payloads.length === 0)
        return false;
    const apiResult = await Promise.allSettled([submitSessions(payloads)]);
    const apiSaved = apiResult[0].status === 'fulfilled';
    submitted = apiSaved;
    if (apiSaved) {
        view.setResultSaveStatus('結果已傳送。');
    }
    else {
        view.setResultSaveStatus('結果傳送失敗。', true);
    }
    return apiSaved;
}
/** 頁面實際離開時以 sendBeacon 傳送當前進度。 */
function sendCurrentResultsOnExit() {
    if (submitted)
        return;
    const payloads = currentPayloads();
    if (payloads.length === 0)
        return;
    beaconSessions(payloads);
    submitted = true;
}
/** 回傳目前頁面模式會參與遊戲的玩家。 */
function activePlayers() {
    return mode === 'single' ? [players[0]] : players;
}
/** 將玩家分數同步到目前模式可見的分數欄。 */
function updateScores() {
    const primaryScore = players[0].stats.score;
    const secondaryScore = mode === 'single' ? primaryScore : players[1].stats.score;
    view.updateScores(primaryScore, secondaryScore);
}
/** 傳送當前進度後返回本頁開始畫面。 */
async function leaveGame() {
    if (!window.confirm('中途離開會送出目前進度，確定要離開嗎？'))
        return;
    view.setResultSaveStatus('正在傳送目前進度…');
    await submitCurrentResults();
    returnToSetup();
}
/** 停止目前流程並返回開始畫面。 */
function returnToSetup() {
    clearCountdownTimer();
    controller?.reset();
    controller = undefined;
    phase = 'setup';
    loginContext = undefined;
    pairId = undefined;
    runStartedAt = 0;
    view.setPracticeMode(false);
    view.setResultSaveStatus('');
    view.showSetup();
}
/** 處理遊戲與練習中的鍵盤操作。 */
function handleKeyDown(event) {
    if (event.repeat)
        return;
    if (controller?.state !== 'running' || (phase !== 'practice' && phase !== 'game'))
        return;
    if (routeGameInput(event))
        event.preventDefault();
}
/** 依單雙人頁面把按鍵送給正確玩家。 */
function routeGameInput(event) {
    if (mode === 'single') {
        const arrowAliases = {
            ArrowUp: 'KeyW', ArrowDown: 'KeyS', ArrowLeft: 'KeyA', ArrowRight: 'KeyD',
        };
        return players[0].handleKey(arrowAliases[event.code] ?? event.code, event.key);
    }
    const player = event.code.startsWith('Arrow') ? players[1] : players[0];
    return player.handleKey(event.code, event.key);
}
/** 流程進行中關閉或重新整理頁面時要求確認。 */
function handleBeforeUnload(event) {
    if (phase === 'setup' || phase === 'results')
        return;
    event.preventDefault();
    event.returnValue = '';
}
/** 隱藏關卡提示並繼續下一關。 */
function advanceToNextLevel() {
    view.hideLevelPause();
    controller?.advanceToNextLevel();
}
document.addEventListener('keydown', handleKeyDown);
window.addEventListener('beforeunload', handleBeforeUnload);
window.addEventListener('pagehide', sendCurrentResultsOnExit);
view.elements.startButton.addEventListener('click', beginGameFlow);
view.elements.closeInstructionsButton.addEventListener('click', startPractice);
view.elements.instructionSkipButton.addEventListener('click', skipInstructionsAndPractice);
view.elements.practiceSkipButton.addEventListener('click', skipPractice);
view.elements.leaveGameButton.addEventListener('click', () => { void leaveGame(); });
view.elements.nextLevelButton.addEventListener('click', advanceToNextLevel);
view.elements.restartButton.addEventListener('click', returnToSetup);
