const MAX_BUBBLE_SIZE = 112;
const MIN_BUBBLE_SIZE = 72;
const DEFAULT_ARROW_IMAGE_INDEX = 3;
const rotationForDirection = {
    ArrowUp: 0,
    ArrowRight: Math.PI / 2,
    ArrowDown: Math.PI,
    ArrowLeft: Math.PI * 1.5,
};
/** 建立相對於目前模組位置的圖片網址。 */
function imagePath(name) {
    return new URL('../public/images/' + name, import.meta.url).href;
}
/** 建立圖片物件，載入完成後要求 Canvas 重繪。 */
function loadImage(path, onLoad) {
    const image = new Image();
    image.addEventListener('load', onLoad);
    image.src = path;
    return image;
}
export class CanvasPlayerRenderer {
    /** 初始化 Canvas、圖片資源與尺寸監聽。 */
    constructor(canvas) {
        Object.defineProperty(this, "canvas", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: canvas
        });
        Object.defineProperty(this, "context", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "emptyImage", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "targetImage", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "arrowImages", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "resizeObserver", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "bubbles", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: []
        });
        Object.defineProperty(this, "arrowImageIndex", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: DEFAULT_ARROW_IMAGE_INDEX
        });
        Object.defineProperty(this, "width", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        Object.defineProperty(this, "height", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        const context = canvas.getContext('2d');
        if (!context)
            throw new Error('瀏覽器不支援 Canvas 2D');
        this.context = context;
        const redraw = () => this.render(this.bubbles);
        this.emptyImage = loadImage(imagePath('empty.png'), redraw);
        this.targetImage = loadImage(imagePath('target.png'), redraw);
        this.arrowImages = [0, 1, 2, 3].map((index) => loadImage(imagePath('arrow_' + index + '_up.PNG'), redraw));
        this.resizeObserver = new ResizeObserver(() => this.resize());
        this.resizeObserver.observe(canvas);
        this.resize();
    }
    /** 清空目前玩家的畫布與可存取性描述。 */
    clear() {
        this.bubbles = [];
        this.canvas.setAttribute('aria-label', this.playerLabel() + '遊戲區域');
        this.context.clearRect(0, 0, this.width, this.height);
    }
    /** 設定新回合泡泡與本回合箭頭圖片。 */
    setBubbles(bubbles, arrowImageIndex) {
        this.bubbles = bubbles;
        this.arrowImageIndex = arrowImageIndex;
        this.render(bubbles);
    }
    /** 使用 Canvas API 繪製目前回合的所有泡泡。 */
    render(bubbles) {
        this.bubbles = bubbles;
        this.context.clearRect(0, 0, this.width, this.height);
        bubbles.forEach((bubble) => this.drawBubble(bubble));
        this.updateAccessibleLabel();
    }
    /** 依照裝置像素比例同步 Canvas 的實際與顯示尺寸。 */
    resize() {
        const rect = this.canvas.getBoundingClientRect();
        const ratio = Math.max(1, window.devicePixelRatio || 1);
        this.width = Math.max(1, rect.width);
        this.height = Math.max(1, rect.height);
        this.canvas.width = Math.round(this.width * ratio);
        this.canvas.height = Math.round(this.height * ratio);
        this.context.setTransform(ratio, 0, 0, ratio, 0, 0);
        this.render(this.bubbles);
    }
    /** 在正規化座標位置繪製單一泡泡底圖與方向箭頭。 */
    drawBubble(bubble) {
        const size = Math.min(MAX_BUBBLE_SIZE, Math.max(MIN_BUBBLE_SIZE, Math.min(this.width * 0.18, this.height * 0.23)));
        const x = bubble.x * Math.max(0, this.width - size);
        const y = bubble.y * Math.max(0, this.height - size);
        const base = bubble.isTarget && bubble.isRevealed ? this.targetImage : this.emptyImage;
        const arrow = this.arrowImages[this.arrowImageIndex]
            ?? this.arrowImages[DEFAULT_ARROW_IMAGE_INDEX];
        this.context.save();
        this.context.filter = 'saturate(0.55) brightness(0.86)';
        if (base.complete && base.naturalWidth > 0)
            this.context.drawImage(base, x, y, size, size);
        this.context.restore();
        if (!arrow.complete || arrow.naturalWidth === 0)
            return;
        this.context.save();
        this.context.translate(x + size / 2, y + size / 2);
        this.context.rotate(rotationForDirection[bubble.direction]);
        this.context.drawImage(arrow, -size / 2, -size / 2, size, size);
        this.context.restore();
    }
    /** 將揭示後的目標方向同步到 Canvas 的 aria-label。 */
    updateAccessibleLabel() {
        const target = this.bubbles.find((bubble) => bubble.isTarget && bubble.isRevealed);
        const label = target
            ? this.playerLabel() + '遊戲區域，目標方向為 ' + target.direction
            : this.playerLabel() + '遊戲區域';
        this.canvas.setAttribute('aria-label', label);
    }
    /** 從 Canvas id 取得畫面上的玩家名稱。 */
    playerLabel() {
        return this.canvas.id.startsWith('right') ? '右側玩家' : '左側玩家';
    }
}
