import { calculateAccuracy, calculateAverageReactionTime, calculateCorrectAverageReactionTime, } from './statistics.js';
/** 取得必要的 DOM 元素，缺少時立即提供明確錯誤。 */
function requiredElement(selector) {
    const element = document.querySelector(selector);
    if (!element)
        throw new Error('Missing required element: ' + selector);
    return element;
}
/** 將毫秒轉成結果畫面使用的秒數文字。 */
function formatReactionTime(milliseconds) {
    return milliseconds === undefined ? '--' : (milliseconds / 1000).toFixed(2) + ' 秒';
}
/** 收集指定玩家的結果欄位。 */
function resultElements(id) {
    return {
        finalScore: requiredElement('#' + id + '-final-score'),
        accuracy: requiredElement('#' + id + '-accuracy-display'),
        averageReaction: requiredElement('#' + id + '-average-reaction-display'),
        correctAverageReaction: requiredElement('#' + id + '-correct-reaction-display'),
        maxCombo: requiredElement('#' + id + '-max-combo-display'),
    };
}
/** 收集應用程式會使用的所有 DOM 元素。 */
export function createAppElements() {
    return {
        startScreen: requiredElement('#start-screen'),
        playScreen: requiredElement('#play-screen'),
        startButton: requiredElement('#start-button'),
        restartButton: requiredElement('#restart-button'),
        leaveGameButton: requiredElement('#leave-game-button'),
        instructionsOverlay: requiredElement('#instructions-overlay'),
        closeInstructionsButton: requiredElement('#close-instructions-button'),
        instructionSkipButton: requiredElement('#instruction-skip-button'),
        practiceSkipButton: requiredElement('#practice-skip-button'),
        startCountdownOverlay: requiredElement('#start-countdown-overlay'),
        startCountdownValue: requiredElement('#start-countdown-value'),
        levelOverlay: requiredElement('#level-overlay'),
        levelTitle: requiredElement('#level-title'),
        levelMessage: requiredElement('#level-message'),
        nextLevelButton: requiredElement('#next-level-button'),
        timerDisplay: requiredElement('#timer-display'),
        timerLabel: requiredElement('#timer-label'),
        resultOverlay: requiredElement('#result-overlay'),
        resultSaveStatus: requiredElement('#result-save-status'),
        leftScoreDisplay: requiredElement('#left-score-display'),
        rightScoreDisplay: requiredElement('#right-score-display'),
        rightScoreLabel: requiredElement('#right-score-label'),
        instructionDisplay: requiredElement('#instruction-display'),
        leftFeedback: requiredElement('#left-feedback'),
        rightFeedback: requiredElement('#right-feedback'),
        leftArena: requiredElement('#left-arena'),
        rightArena: requiredElement('#right-arena'),
        rightResult: requiredElement('#right-result'),
        rightPlayerPanel: requiredElement('.player-panel--right'),
        resultsGrid: requiredElement('.results-grid'),
        leftResultTitle: requiredElement('#left-result-title'),
        rightResultTitle: requiredElement('#right-result-title'),
        resultElements: {
            left: resultElements('left'),
            right: resultElements('right'),
        },
    };
}
export class GameView {
    /** 建立負責畫面切換與文字更新的檢視層。 */
    constructor(elements) {
        Object.defineProperty(this, "elements", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: elements
        });
        Object.defineProperty(this, "feedbackTimeoutIds", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: {}
        });
    }
    /** 顯示每次遊戲開始前的操作說明。 */
    showInstructions() {
        this.elements.instructionsOverlay.classList.remove('is-hidden');
        this.elements.closeInstructionsButton.focus();
    }
    /** 隱藏操作說明。 */
    hideInstructions() {
        this.elements.instructionsOverlay.classList.add('is-hidden');
    }
    /** 顯示正式遊戲開始前的倒數數字。 */
    showStartCountdown(seconds) {
        this.elements.startCountdownValue.value = String(seconds);
        this.elements.startCountdownOverlay.classList.remove('is-hidden');
    }
    /** 隱藏正式遊戲開始倒數。 */
    hideStartCountdown() {
        this.elements.startCountdownOverlay.classList.add('is-hidden');
    }
    /** 顯示關卡結束提示。 */
    showLevelPause(level, message = '準備進入下一關。') {
        this.elements.levelTitle.textContent = '第 ' + level + ' 關完成';
        this.elements.levelMessage.textContent = message;
        this.elements.levelOverlay.classList.remove('is-hidden');
        this.elements.nextLevelButton.focus();
    }
    /** 隱藏關卡結束提示。 */
    hideLevelPause() {
        this.elements.levelOverlay.classList.add('is-hidden');
    }
    /** 依單人或雙人模式切換遊戲畫面。 */
    showPlay(mode) {
        const isSingle = mode === 'single';
        this.elements.rightResult.classList.toggle('is-hidden', isSingle);
        this.elements.rightPlayerPanel.classList.toggle('is-hidden', isSingle);
        this.elements.playScreen.classList.toggle('play-screen--single', isSingle);
        this.elements.startScreen.classList.add('is-hidden');
        this.elements.playScreen.classList.remove('is-hidden');
        this.elements.resultOverlay.classList.add('is-hidden');
        this.elements.resultsGrid.classList.remove('results-grid--single');
        this.elements.instructionDisplay.textContent = isSingle
            ? '操作：WASD 或方向鍵'
            : '左側：WASD；右側：方向鍵';
        this.elements.rightScoreLabel.textContent = isSingle ? '分數' : '右側分數';
    }
    /** 切換練習階段的標示與 Skip 按鈕。 */
    setPracticeMode(isPractice) {
        this.elements.timerLabel.textContent = isPractice ? '練習時間' : '剩餘時間';
        this.elements.practiceSkipButton.classList.toggle('is-hidden', !isPractice);
    }
    /** 顯示結果 JSON 的儲存狀態。 */
    setResultSaveStatus(message, isError = false) {
        this.elements.resultSaveStatus.textContent = message;
        this.elements.resultSaveStatus.dataset.state = isError ? 'error' : 'success';
    }
    /** 返回開始設定畫面。 */
    showSetup() {
        this.elements.resultOverlay.classList.add('is-hidden');
        this.hideInstructions();
        this.hideStartCountdown();
        this.hideLevelPause();
        this.setPracticeMode(false);
        this.elements.playScreen.classList.add('is-hidden');
        this.elements.playScreen.classList.remove('play-screen--single');
        this.elements.startScreen.classList.remove('is-hidden');
        this.elements.startButton.focus();
    }
    /** 更新遊戲中的左右分數。 */
    updateScores(leftScore, rightScore) {
        this.elements.leftScoreDisplay.value = String(leftScore);
        this.elements.rightScoreDisplay.value = String(rightScore);
    }
    /** 顯示玩家本題正確或錯誤的短暫回饋。 */
    showFeedback(playerId, isCorrect) {
        const element = playerId === 'left' ? this.elements.leftFeedback : this.elements.rightFeedback;
        const previousTimeout = this.feedbackTimeoutIds[playerId];
        if (previousTimeout !== undefined)
            window.clearTimeout(previousTimeout);
        element.textContent = isCorrect ? '正確' : '錯誤';
        element.className = 'player-feedback '
            + (isCorrect ? 'player-feedback--correct' : 'player-feedback--incorrect');
        this.feedbackTimeoutIds[playerId] = window.setTimeout(() => {
            element.textContent = '';
            element.className = 'player-feedback';
        }, 800);
    }
    /** 顯示單人或雙人的最終統計。 */
    showResults(mode, players) {
        this.renderPlayerResult('left', players[0].stats);
        this.renderPlayerResult('right', players[1].stats);
        const isSingle = mode === 'single';
        this.elements.rightResult.classList.toggle('is-hidden', isSingle);
        this.elements.resultsGrid.classList.toggle('results-grid--single', isSingle);
        this.elements.leftResultTitle.textContent = isSingle ? '玩家' : '左側玩家';
        this.elements.rightResultTitle.textContent = '右側玩家';
        this.elements.resultOverlay.classList.remove('is-hidden');
        this.elements.restartButton.focus();
    }
    /** 將單一玩家的統計填入結果欄位。 */
    renderPlayerResult(id, stats) {
        const elements = this.elements.resultElements[id];
        elements.finalScore.value = String(stats.score);
        elements.accuracy.textContent = (calculateAccuracy(stats) * 100).toFixed(1) + '%';
        elements.averageReaction.textContent = formatReactionTime(calculateAverageReactionTime(stats));
        elements.correctAverageReaction.textContent =
            formatReactionTime(calculateCorrectAverageReactionTime(stats));
        elements.maxCombo.textContent = String(stats.maxCombo);
    }
}
