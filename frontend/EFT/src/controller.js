import { GameController } from './game.js';
/** 建立遊戲控制器，並把剩餘秒數格式化到畫面計時器。 */
export function createGameController(durationSeconds, players, elements, timingMode = 'test', levelCount = 1, levelDurationSeconds = durationSeconds) {
    return new GameController(durationSeconds, players, (seconds) => {
        const minutes = Math.floor(seconds / 60);
        const remainder = seconds % 60;
        const value = String(minutes).padStart(2, '0') + ':' + String(remainder).padStart(2, '0');
        elements.timerDisplay.textContent = value;
        elements.timerDisplay.dateTime = 'PT' + Math.max(0, seconds) + 'S';
    }, elements.onFinish, timingMode, elements.onLevelPause, levelCount, levelDurationSeconds);
}
