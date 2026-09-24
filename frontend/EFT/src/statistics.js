/** 建立一份歸零的玩家統計。 */
export function createEmptyPlayerStats() {
    return { score: 0, totalRounds: 0, totalReactionTimeMs: 0, correctReactionTimeMs: 0, maxCombo: 0 };
}
/** 將既有玩家統計重設為零。 */
export function resetPlayerStats(stats) {
    stats.score = 0;
    stats.totalRounds = 0;
    stats.totalReactionTimeMs = 0;
    stats.correctReactionTimeMs = 0;
    stats.maxCombo = 0;
}
/** 計算答題正確率。 */
export function calculateAccuracy(stats) {
    return stats.totalRounds === 0 ? 0 : stats.score / stats.totalRounds;
}
/** 計算所有作答的平均反應時間。 */
export function calculateAverageReactionTime(stats) {
    return stats.totalRounds === 0 ? undefined : stats.totalReactionTimeMs / stats.totalRounds;
}
/** 計算答對題目的平均反應時間。 */
export function calculateCorrectAverageReactionTime(stats) {
    return stats.score === 0 ? undefined : stats.correctReactionTimeMs / stats.score;
}
