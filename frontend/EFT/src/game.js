import { BUBBLE_COUNT, DEFAULT_ARROW_IMAGE_INDEX, DIRECTIONS, POSITION_TRAVEL_TIME_SECONDS, REVEAL_DELAY_MS, ROUND_DELAY_MS, } from './game-config.js';
import { createEmptyPlayerStats, resetPlayerStats } from './statistics.js';
/** 產生指定範圍內的隨機小數。 */
function randomBetween(min, max) {
    return Math.random() * (max - min) + min;
}
export class PlayerGame {
    /** 建立單一玩家的遊戲狀態與按鍵配置。 */
    constructor(id, renderer, keyMap, onFeedback) {
        Object.defineProperty(this, "id", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: id
        });
        Object.defineProperty(this, "renderer", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: renderer
        });
        Object.defineProperty(this, "keyMap", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: keyMap
        });
        Object.defineProperty(this, "onFeedback", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: onFeedback
        });
        Object.defineProperty(this, "stats", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: createEmptyPlayerStats()
        });
        Object.defineProperty(this, "bubbles", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: []
        });
        Object.defineProperty(this, "successStreak", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        Object.defineProperty(this, "roundStartedAt", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        Object.defineProperty(this, "roundTransitioning", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: false
        });
        Object.defineProperty(this, "revealTimeoutId", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "roundDelayTimeoutId", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "arrowImageIndex", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: DEFAULT_ARROW_IMAGE_INDEX
        });
    }
    /** 清除畫面並重設統計資料。 */
    reset() {
        this.stop();
        resetPlayerStats(this.stats);
        this.successStreak = 0;
        this.arrowImageIndex = DEFAULT_ARROW_IMAGE_INDEX;
    }
    /** 從第一回合開始玩家遊戲。 */
    start() {
        this.reset();
        this.startRound();
    }
    /** 保留統計資料並開始下一關。 */
    continueLevel() {
        this.stop();
        this.startRound();
    }
    /** 停止回合計時並清除 Canvas。 */
    stop() {
        if (this.revealTimeoutId !== undefined)
            window.clearTimeout(this.revealTimeoutId);
        if (this.roundDelayTimeoutId !== undefined)
            window.clearTimeout(this.roundDelayTimeoutId);
        this.revealTimeoutId = undefined;
        this.roundDelayTimeoutId = undefined;
        this.roundTransitioning = false;
        this.bubbles = [];
        this.renderer.clear();
    }
    /** 更新所有泡泡位置並要求 Canvas 重繪。 */
    update(deltaSeconds) {
        for (const bubble of this.bubbles) {
            bubble.x += bubble.velocityX * deltaSeconds;
            bubble.y += bubble.velocityY * deltaSeconds;
            if (bubble.x <= 0 || bubble.x >= 1) {
                bubble.x = Math.max(0, Math.min(1, bubble.x));
                bubble.velocityX *= -1;
            }
            if (bubble.y <= 0 || bubble.y >= 1) {
                bubble.y = Math.max(0, Math.min(1, bubble.y));
                bubble.velocityY *= -1;
            }
        }
        this.renderer.render(this.bubbles);
    }
    /** 判定玩家按鍵並更新分數、連擊與反應時間。 */
    handleKey(code, key = '') {
        if (this.roundTransitioning || !this.bubbles.some((bubble) => bubble.isRevealed))
            return false;
        const normalizedKey = key.length === 1 ? key.toLowerCase() : key;
        const direction = Object.keys(this.keyMap).find((item) => {
            const value = this.keyMap[item];
            const configuredCodes = Array.isArray(value) ? value : [value];
            return configuredCodes.some((configuredCode) => {
                const configuredKey = configuredCode.startsWith('Key')
                    ? configuredCode.slice(3).toLowerCase()
                    : configuredCode;
                return configuredCode === code || configuredKey === normalizedKey;
            });
        });
        if (!direction)
            return false;
        const target = this.bubbles.find((bubble) => bubble.isTarget);
        const isCorrect = target?.direction === direction;
        const reactionTime = performance.now() - this.roundStartedAt;
        this.stats.totalRounds += 1;
        this.stats.totalReactionTimeMs += reactionTime;
        if (isCorrect) {
            this.stats.score += 1;
            this.successStreak += 1;
            this.stats.maxCombo = Math.max(this.stats.maxCombo, this.successStreak);
            this.stats.correctReactionTimeMs += reactionTime;
            this.arrowImageIndex = this.successStreak >= 5
                ? (this.successStreak - 5) % 3
                : DEFAULT_ARROW_IMAGE_INDEX;
        }
        else {
            this.successStreak = 0;
            this.arrowImageIndex = DEFAULT_ARROW_IMAGE_INDEX;
        }
        this.onFeedback(isCorrect);
        this.startNextRoundAfterDelay();
        return true;
    }
    /** 建立並顯示新回合的四個移動泡泡。 */
    startRound() {
        const targetIndex = Math.floor(Math.random() * BUBBLE_COUNT);
        this.bubbles = Array.from({ length: BUBBLE_COUNT }, (_, index) => ({
            id: index,
            x: randomBetween(0, 1),
            y: randomBetween(0, 1),
            velocityX: (Math.random() < 0.5 ? -1 : 1) / POSITION_TRAVEL_TIME_SECONDS,
            velocityY: (Math.random() < 0.5 ? -1 : 1) / POSITION_TRAVEL_TIME_SECONDS,
            direction: DIRECTIONS[Math.floor(Math.random() * DIRECTIONS.length)],
            isTarget: index === targetIndex,
            isRevealed: false,
        }));
        this.renderer.setBubbles(this.bubbles, this.arrowImageIndex);
        this.revealTimeoutId = window.setTimeout(() => {
            this.bubbles.forEach((bubble) => { bubble.isRevealed = true; });
            this.roundStartedAt = performance.now();
            this.renderer.render(this.bubbles);
        }, REVEAL_DELAY_MS);
    }
    /** 清除本回合並在短暫停頓後產生下一題。 */
    startNextRoundAfterDelay() {
        if (this.revealTimeoutId !== undefined)
            window.clearTimeout(this.revealTimeoutId);
        this.revealTimeoutId = undefined;
        this.renderer.clear();
        this.bubbles = [];
        this.roundTransitioning = true;
        this.roundDelayTimeoutId = window.setTimeout(() => {
            this.roundDelayTimeoutId = undefined;
            this.roundTransitioning = false;
            this.startRound();
        }, ROUND_DELAY_MS);
    }
}
export class GameController {
    /** 建立整場遊戲的計時、關卡與動畫控制器。 */
    constructor(durationSeconds, players, onTick, onFinish, timingMode = 'test', onLevelPause = () => { }, levelCount = 1, levelDurationSeconds = durationSeconds) {
        Object.defineProperty(this, "durationSeconds", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: durationSeconds
        });
        Object.defineProperty(this, "players", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: players
        });
        Object.defineProperty(this, "onTick", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: onTick
        });
        Object.defineProperty(this, "onFinish", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: onFinish
        });
        Object.defineProperty(this, "timingMode", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: timingMode
        });
        Object.defineProperty(this, "onLevelPause", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: onLevelPause
        });
        Object.defineProperty(this, "state", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 'idle'
        });
        Object.defineProperty(this, "secondsRemaining", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "currentLevel", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 1
        });
        Object.defineProperty(this, "timerId", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "animationFrameId", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "previousFrameTime", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        Object.defineProperty(this, "endTime", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        Object.defineProperty(this, "levelCount", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "levelDurationSeconds", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        this.secondsRemaining = durationSeconds;
        this.levelCount = levelCount;
        this.levelDurationSeconds = levelDurationSeconds;
    }
    /** 啟動第一關、倒數計時與動畫迴圈。 */
    start() {
        this.stopControllerResources();
        this.secondsRemaining = this.timingMode === 'formal' ? this.levelDurationSeconds : this.durationSeconds;
        this.currentLevel = 1;
        this.state = 'running';
        this.players.forEach((player) => player.start());
        this.endTime = performance.now() + this.secondsRemaining * 1000;
        this.onTick(this.secondsRemaining);
        this.previousFrameTime = performance.now();
        this.timerId = window.setInterval(() => this.tick(), 1000);
        this.animationFrameId = window.requestAnimationFrame((time) => this.animate(time));
    }
    /** 中止整場遊戲並回復初始狀態。 */
    reset() {
        this.stopControllerResources();
        this.secondsRemaining = this.timingMode === 'formal' ? this.levelDurationSeconds : this.durationSeconds;
        this.currentLevel = 1;
        this.state = 'idle';
        this.players.forEach((player) => player.reset());
        this.onTick(this.secondsRemaining);
    }
    /** 結束遊戲並顯示統計結果。 */
    finish() {
        if (this.state !== 'running' && this.state !== 'paused')
            return;
        this.stopControllerResources();
        this.state = 'finished';
        this.players.forEach((player) => player.stop());
        this.onFinish();
    }
    /** 從關卡暫停畫面開始下一關。 */
    advanceToNextLevel() {
        if (this.state !== 'paused')
            return;
        if (this.currentLevel >= this.levelCount) {
            this.finish();
            return;
        }
        this.currentLevel += 1;
        this.secondsRemaining = this.levelDurationSeconds;
        this.state = 'running';
        this.players.forEach((player) => player.continueLevel());
        this.endTime = performance.now() + this.levelDurationSeconds * 1000;
        this.onTick(this.secondsRemaining);
        this.previousFrameTime = performance.now();
        this.timerId = window.setInterval(() => this.tick(), 1000);
        this.animationFrameId = window.requestAnimationFrame((time) => this.animate(time));
    }
    /** 停止控制器建立的倒數與動畫資源。 */
    stopControllerResources() {
        if (this.timerId !== undefined)
            window.clearInterval(this.timerId);
        if (this.animationFrameId !== undefined)
            window.cancelAnimationFrame(this.animationFrameId);
        this.timerId = undefined;
        this.animationFrameId = undefined;
    }
    /** 更新剩餘時間並處理關卡結束。 */
    tick() {
        this.secondsRemaining = Math.max(0, Math.ceil((this.endTime - performance.now()) / 1000));
        this.onTick(this.secondsRemaining);
        if (this.secondsRemaining > 0)
            return;
        if (this.timingMode === 'formal' && this.currentLevel < this.levelCount) {
            this.stopControllerResources();
            this.players.forEach((player) => player.stop());
            this.state = 'paused';
            this.onLevelPause(this.currentLevel);
            return;
        }
        this.finish();
    }
    /** 執行逐幀位置更新並排定下一幀。 */
    animate(frameTime) {
        if (this.state !== 'running')
            return;
        const deltaSeconds = Math.min((frameTime - this.previousFrameTime) / 1000, 0.05);
        this.previousFrameTime = frameTime;
        this.players.forEach((player) => player.update(deltaSeconds));
        this.animationFrameId = window.requestAnimationFrame((time) => this.animate(time));
    }
}
