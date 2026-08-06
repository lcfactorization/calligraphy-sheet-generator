import HanziWriter from 'hanzi-writer';
// v2.9.8：离线字符数据源 — 通过 charDataLoader 注入，彻底脱离 CDN
// getCharDataAsync 支持网络备选（冷僻字在线获取并缓存）
import { getCharDataAsync, isReady, ready as hanziDataReady } from './hanziDataStore.js';

export function createStrokeSVG(strokes, currentIndex) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("width", "18.72");
    svg.setAttribute("height", "18.72");
    svg.setAttribute("viewBox", "0 0 1024 1024");
    svg.setAttribute("preserveAspectRatio", "xMidYMid meet");

    const fullCharGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
    fullCharGroup.setAttribute("transform", "scale(1, -1) translate(0, -1024)");
    strokes.forEach(stroke => {
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", stroke.path);
        path.setAttribute("fill", "#ccc");
        fullCharGroup.appendChild(path);
    });
    svg.appendChild(fullCharGroup);

    const completedGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
    completedGroup.setAttribute("transform", "scale(1, -1) translate(0, -1024)");
    for (let i = 0; i < currentIndex; i++) {
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", strokes[i].path);
        path.setAttribute("fill", "black");
        completedGroup.appendChild(path);
    }
    svg.appendChild(completedGroup);

    if (currentIndex < strokes.length) {
        const currentPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
        currentPath.setAttribute("d", strokes[currentIndex].path);
        currentPath.setAttribute("fill", "#ff4444");
        currentPath.setAttribute("transform", "scale(1, -1) translate(0, -1024)");
        svg.appendChild(currentPath);
    }

    return svg;
}

// v2.4.5：笔画加载队列 — 逐字加载避免并发卡顿
const strokeQueue = [];
let strokeLoading = false;
let strokeLoadPromise = null;

function loadStrokesDirect(char, strokeContainer) {
    const tempDiv = document.createElement('div');
    document.body.appendChild(tempDiv);
    const writer = new HanziWriter(tempDiv, {
        width: 60,
        height: 60,
        showOutline: false,
        // v2.9.8：离线字符数据加载器，彻底脱离 jsdelivr CDN
        // getCharDataAsync 含网络备选，冷僻字在线获取并缓存
        charDataLoader: (ch, onComplete, onError) => {
            getCharDataAsync(ch).then(data => {
                if (data) {
                    onComplete(data);
                } else {
                    onError(new Error(`无"${ch}"笔画数据（本地+网络均无）`));
                }
            }).catch(err => {
                onError(err);
            });
        },
    });
    return writer.setCharacter(char).then(() => {
        const strokes = writer._character.strokes;
        const strokeCount = strokes.length;
        const strokeCountSpan = document.createElement('span');
        strokeCountSpan.textContent = `${strokeCount}画`;
        strokeCountSpan.style.marginRight = '6px';
        strokeContainer.appendChild(strokeCountSpan);
        for (let k = 0; k < strokeCount; k++) {
            const svg = createStrokeSVG(strokes, k);
            svg.classList.add('stroke-svg');
            strokeContainer.appendChild(svg);
        }
        document.body.removeChild(tempDiv);
    }).catch(error => {
        console.error(`无法加载汉字"${char}"的笔画数据：`, error);
        if (tempDiv.parentNode) document.body.removeChild(tempDiv);
    });
}

function processStrokeQueue() {
    if (strokeLoading || strokeQueue.length === 0) return;
    // v2.9.8：确保离线汉字数据已加载完成，否则等待就绪后再处理队列
    if (!isReady()) {
        hanziDataReady().then(processStrokeQueue).catch(() => {
            // 数据加载失败也清空队列，避免无限等待
            strokeQueue.length = 0;
        });
        return;
    }
    strokeLoading = true;
    const { char, container } = strokeQueue.shift();
    loadStrokesDirect(char, container).finally(() => {
        strokeLoading = false;
        if (strokeQueue.length > 0) {
            const rId = typeof requestIdleCallback === 'function'
                ? requestIdleCallback(processStrokeQueue)
                : setTimeout(processStrokeQueue, 0);
        } else {
            // 队列清空，resolve 等待中的 promise
            if (strokeLoadPromise) {
                strokeLoadPromise.resolve();
                strokeLoadPromise = null;
            }
        }
    });
}

/** 清空笔画加载队列（重新生成字帖时调用，避免旧任务积压） */
export function clearStrokeQueue() {
    strokeQueue.length = 0;
    // 注意：当前正在加载的任务无法中断，
    // 但它完成后会因队列为空而停止
}

/** 等待所有笔画加载完成（用于打印前等待） */
export function waitForStrokes(timeoutMs = 10000) {
    if (strokeQueue.length === 0 && !strokeLoading) return Promise.resolve();
    return new Promise((resolve) => {
        strokeLoadPromise = { resolve };
        setTimeout(resolve, timeoutMs);
    });
}

// v2.4.18：暴露到全局，供 Puppeteer 等外部环境调用等待笔画加载
if (typeof window !== 'undefined') {
    window.__waitForStrokes = waitForStrokes;
    window.__clearStrokeQueue = clearStrokeQueue;
    window.__getStrokeQueueStatus = () => ({
        pending: strokeQueue.length,
        loading: strokeLoading,
        firstChars: strokeQueue.slice(0, 10).map(item => item.char),
        lastChars: strokeQueue.slice(-5).map(item => item.char)
    });
}

export function loadStrokes(char, strokeContainer) {
    strokeQueue.push({ char, container: strokeContainer });
    const rId = typeof requestIdleCallback === 'function'
        ? requestIdleCallback(processStrokeQueue)
        : setTimeout(processStrokeQueue, 0);
}
