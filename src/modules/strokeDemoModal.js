// 笔画笔顺动态演示弹窗模块（v2.9.8 双图层重构）
// ============================================================================
// 功能：
//   - 点击字格弹出标准窗口式弹窗，动态演示汉字笔画笔顺
//   - 汉字默认黑色、偏旁默认红色
//   - v2.9.8：双图层结构
//       · 底层 .sd-stage-bg：始终显示完整汉字（opacity 0.25），不参与动画
//       · 顶层 .sd-stage-fg：初始为空，点击播放时 animateCharacter 绘制笔画（opacity 1）
//       · 播放过程中：顶层笔画逐笔覆盖底层对应位置
//       · 播放完成：顶层完全显示，完全遮挡底层
//       · 重新播放：animateCharacter 先清除再绘制，清除时底层 0.25 轮廓显现
//   - 默认速度1x（可调1x-5x，5档）；播放按钮可重复演示
//   - v2.9.8：速度调整后持久化到 localStorage，后续新弹窗默认采用此速度
//   - v2.9.8：播放按钮支持播放/暂停状态切换（pauseAnimation/resumeAnimation）
//   - 标准弹窗（最小化/最大化/关闭/拖拽）
//   - 最多同时 4 个弹窗；相同字点击切换到已有弹窗（高亮闪烁）
//
// v2.9.8 修复：
//   - 0.25 轮廓始终显示，包括动画过程中（位于底层，被笔画遮挡）
//   - 最小化/最大化按钮失效：原使用 width:100%/height:100% 在 flex 容器中无效，
//     改用固定 vw/vh 尺寸 + aspect-ratio
//   - 弹窗固定宽高比与汉字（1:1 stage）匹配
// ============================================================================

import HanziWriter from 'hanzi-writer';
import { getCharDataAsync, ready as hanziDataReady } from './hanziDataStore.js';
import { getSettings, updateSetting } from './settingsCenter.js';
import '../styles/strokeDemoModal.css';

const MAX_WINDOWS = 4;
const STAGE_SIZE = 300;        // 演示舞台尺寸（viewBox 基准，CSS 自适应缩放）

/**
 * v2.9.8：获取笔顺演示默认播放速度（从 localStorage 持久化读取）
 * @returns {number} 1-5
 */
function _getPersistedSpeed() {
    const s = getSettings();
    let v = Number(s.strokeDemoSpeed);
    if (!Number.isFinite(v) || v < 1) v = 1;
    if (v > 5) v = 5;
    return v;
}

/**
 * v2.9.8：持久化播放速度到 localStorage
 * @param {number} speed 1-5
 */
function _persistSpeed(speed) {
    try {
        updateSetting('strokeDemoSpeed', speed);
    } catch (e) { /* 静默降级 */ }
}

let _overlay = null;
const _windows = new Map();    // char -> { win, bgWriter, fgWriter, speed }

/** 确保遮罩层存在 */
function _ensureOverlay() {
    if (_overlay && _overlay.isConnected) return _overlay;
    _overlay = document.createElement('div');
    _overlay.className = 'sd-overlay';
    _overlay.setAttribute('aria-hidden', 'true');
    document.body.appendChild(_overlay);
    return _overlay;
}

/**
 * 打开（或聚焦）某字的演示弹窗。
 * @param {string} char 单个汉字
 */
export function openStrokeDemo(char) {
    if (!char) return;
    const ch = String(char).charAt(0);
    // 相同字：切换到已有弹窗
    if (_windows.has(ch)) {
        _focusWindow(_windows.get(ch).win);
        return;
    }
    // 达上限
    if (_windows.size >= MAX_WINDOWS) {
        _toast(`最多同时演示 ${MAX_WINDOWS} 个汉字，请先关闭部分弹窗`);
        return;
    }
    // 等待离线数据就绪，再用 getCharDataAsync 查询（含网络备选）
    hanziDataReady()
        .then(() => getCharDataAsync(ch))
        .then(data => {
            if (!data) {
                _toast(`无"${ch}"的笔画数据（本地+网络均无）`);
                return;
            }
            _createWindow(ch, data);
        })
        .catch(err => {
            _toast(`数据加载失败：${err.message || err}`);
        });
}

/** 关闭所有演示弹窗 */
export function closeAllStrokeDemo() {
    for (const { win } of _windows.values()) {
        _closeWindow(win, false);
    }
    _windows.clear();
    if (_overlay) {
        _overlay.style.display = 'none';
    }
}

/**
 * v2.9.8：为 SVG 添加 viewBox，使其自适应缩放。
 * HanziWriter 创建的 SVG 默认无 viewBox，需手动添加。
 */
function _ensureViewBox(stageEl) {
    requestAnimationFrame(() => {
        const svg = stageEl.querySelector('svg');
        if (svg && !svg.getAttribute('viewBox')) {
            svg.setAttribute('viewBox', `0 0 ${STAGE_SIZE} ${STAGE_SIZE}`);
            svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
        }
    });
}

/** 创建单个演示弹窗 */
function _createWindow(char, data) {
    const overlay = _ensureOverlay();
    overlay.style.display = 'flex';
    overlay.setAttribute('aria-hidden', 'false');

    // v2.9.8：初始速度从 localStorage 持久化读取（用户上次调整的值）
    const initialSpeed = _getPersistedSpeed();

    const win = document.createElement('div');
    win.className = 'sd-window';
    win.dataset.char = char;
    win.innerHTML = `
        <div class="sd-window-header" role="toolbar" aria-label="弹窗控制">
            <span class="sd-window-title" title="${char} 的笔画笔顺演示">${char} · 笔画笔顺</span>
            <div class="sd-window-controls">
                <button type="button" class="sd-btn-min" title="最小化" aria-label="最小化">▱</button>
                <button type="button" class="sd-btn-max" title="最大化" aria-label="最大化">▢</button>
                <button type="button" class="sd-btn-close" title="关闭" aria-label="关闭">✕</button>
            </div>
        </div>
        <div class="sd-window-body">
            <div class="sd-stage">
                <div class="sd-stage-bg"></div>
                <div class="sd-stage-fg"></div>
            </div>
            <div class="sd-controls">
                <button type="button" class="sd-play-btn" title="播放笔顺动画" aria-label="播放笔顺动画">
                    <svg class="sd-play-icon" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                        <path d="M8 5v14l11-7z" fill="currentColor"/>
                    </svg>
                    <svg class="sd-pause-icon" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" style="display:none;">
                        <path d="M6 5h4v14H6zm8 0h4v14h-4z" fill="currentColor"/>
                    </svg>
                    <span class="sd-play-text">播放</span>
                </button>
                <div class="sd-speed-row">
                    <span>速度</span>
                    <input type="range" class="sd-speed-slider" min="1" max="5" step="1" value="${initialSpeed}">
                    <span class="sd-speed-val">${initialSpeed}x</span>
                </div>
            </div>
            <div class="sd-info"></div>
        </div>
    `;
    overlay.appendChild(win);

    // 触发出现动画
    requestAnimationFrame(() => win.classList.add('sd-open'));

    // ── 双图层 HanziWriter 实例 ──
    // 底层：静态显示完整汉字（opacity 0.25，CSS 控制），不参与动画
    // 顶层：初始为空（showCharacter:false），点击播放时 animateCharacter
    const stageBg = win.querySelector('.sd-stage-bg');
    const stageFg = win.querySelector('.sd-stage-fg');
    const bgId = 'sd-bg-' + char.charCodeAt(0) + '-' + Date.now();
    const fgId = 'sd-fg-' + char.charCodeAt(0) + '-' + Date.now();
    stageBg.id = bgId;
    stageFg.id = fgId;

    let currentSpeed = initialSpeed;   // v2.9.8：初始速度来自持久化设置
    let isPlaying = false;
    let isPaused = false;              // v2.9.8：播放暂停状态

    // 共享 charDataLoader（getCharDataAsync 内部有缓存，两次调用返回相同深拷贝）
    const makeCharDataLoader = () => (ch, onComplete, onError) => {
        getCharDataAsync(ch).then(d => {
            if (d) {
                onComplete(d);
            } else {
                onError(new Error(`无"${ch}"数据`));
            }
        }).catch(onError);
    };

    // 底层：完整字静态显示
    const bgWriter = HanziWriter.create(bgId, char, {
        width: STAGE_SIZE,
        height: STAGE_SIZE,
        padding: 8,
        showOutline: false,
        showCharacter: true,        // v2.9.8：底层始终显示完整字
        strokeColor: '#000000',
        radicalColor: '#d32f2f',
        charDataLoader: makeCharDataLoader()
    });
    _ensureViewBox(stageBg);

    // 顶层：初始为空，点击播放时动画
    // v2.9.8 修复：不再调用 hideCharacter()（会干扰 animateCharacter 的笔画显示）
    // 改为通过 CSS .sd-stage-fg opacity:0 控制初始不可见
    // animateCharacter 内部会先隐藏所有笔画再逐笔动画，无需手动 hideCharacter
    const fgWriter = HanziWriter.create(fgId, char, {
        width: STAGE_SIZE,
        height: STAGE_SIZE,
        padding: 8,
        showOutline: false,
        showCharacter: true,        // v2.9.8：保持 true，由 CSS opacity 控制可见性
        strokeColor: '#000000',
        radicalColor: '#d32f2f',
        strokeAnimationSpeed: currentSpeed,   // v2.9.8：初始速度来自持久化设置
        delayBetweenStrokes: 0.15,
        charDataLoader: makeCharDataLoader()
    });
    _ensureViewBox(stageFg);

    _windows.set(char, { win, bgWriter, fgWriter, speed: currentSpeed });

    // ── 信息区 ──
    const info = win.querySelector('.sd-info');
    const strokeCount = data.strokes.length;
    const radCount = data.radStrokes ? data.radStrokes.length : 0;
    info.textContent = `共 ${strokeCount} 画` + (radCount > 0 ? ` · 偏旁 ${radCount} 画（红色）` : '');

    // ── 播放按钮（v2.9.8：支持播放/暂停切换） ──
    const playBtn = win.querySelector('.sd-play-btn');
    const playIcon = win.querySelector('.sd-play-icon');
    const pauseIcon = win.querySelector('.sd-pause-icon');
    const playText = win.querySelector('.sd-play-text');
    const stageFgEl = stageFg;  // 引用顶层 DOM 元素

    // v2.9.8：切换到暂停状态（图标||、文字"暂停"）
    const _showPauseState = () => {
        playIcon.style.display = 'none';
        pauseIcon.style.display = '';
        playText.textContent = '暂停';
        playBtn.title = '暂停播放';
        playBtn.setAttribute('aria-label', '暂停播放');
        playBtn.classList.add('playing');
    };
    // v2.9.8：切换到播放状态（图标▶、文字"播放"）
    const _showPlayState = () => {
        playIcon.style.display = '';
        pauseIcon.style.display = 'none';
        playText.textContent = '播放';
        playBtn.title = '播放笔顺动画';
        playBtn.setAttribute('aria-label', '播放笔顺动画');
        playBtn.classList.remove('playing');
    };

    playBtn.addEventListener('click', () => {
        if (isPlaying) {
            // v2.9.8：正在播放 → 暂停
            if (isPaused) {
                // 已暂停 → 恢复播放
                isPaused = false;
                _showPauseState();
                try { fgWriter.resumeAnimation(); } catch (e) { /* 静默 */ }
            } else {
                // 播放中 → 暂停
                isPaused = true;
                _showPlayState();
                try { fgWriter.pauseAnimation(); } catch (e) { /* 静默 */ }
            }
            return;
        }
        // 未播放 → 开始新播放
        isPlaying = true;
        isPaused = false;
        _showPauseState();
        // v2.9.8：顶层添加 .sd-playing 类 → opacity:1（变为可见）
        // 然后 animateCharacter 会先隐藏已有笔画再逐笔绘制
        stageFgEl.classList.add('sd-playing');
        fgWriter.animateCharacter({
            onComplete: () => {
                isPlaying = false;
                isPaused = false;
                _showPlayState();
                // 保留 .sd-playing 类，顶层保持可见状态
                // 下次点击播放时 animateCharacter 会先隐藏笔画再重新绘制
            }
        });
    });

    // ── 速度滑块 ──
    // v2.9.8 修复：hanzi-writer@3.7.3 没有 updateOptions() 方法，调用会抛 TypeError
    //   导致 speedVal 不更新、currentSpeed 不生效，滑块完全失效（只有1档）
    //   修复方式：直接赋值 fgWriter._options.strokeAnimationSpeed
    //   原理：animateCharacter() 在调用时从 this._options.strokeAnimationSpeed 读取速度
    //         所以播放前赋值即可在下次播放生效
    // v2.9.8：滑块变化时持久化到 localStorage，后续新弹窗默认采用此速度
    const slider = win.querySelector('.sd-speed-slider');
    const speedVal = win.querySelector('.sd-speed-val');
    slider.addEventListener('input', (e) => {
        currentSpeed = parseFloat(e.target.value);
        // v2.9.8：直接更新内部 _options，替代不存在的 updateOptions()
        try {
            fgWriter._options.strokeAnimationSpeed = currentSpeed;
        } catch (err) {
            console.warn('[strokeDemo] 更新速度失败:', err);
        }
        speedVal.textContent = currentSpeed + 'x';
        _windows.get(char).speed = currentSpeed;
        // v2.9.8：持久化到 localStorage，后续新弹窗默认采用此速度
        _persistSpeed(currentSpeed);
    });

    // ── 窗口控制按钮 ──
    // v2.9.8：重写最小化/最大化逻辑
    //   - 最小化（▱）：隐藏主体，仅保留标题栏；记录最小化前的状态（位置+尺寸）
    //   - 最大化（▢）：从最小化恢复时，精确还原到最小化前的位置和尺寸
    //                  非最小化状态下，切换最大化（放大/还原）
    //   - 关闭（✕）：关闭弹窗
    win.querySelector('.sd-btn-close').addEventListener('click', () => _closeWindow(win, true));

    win.querySelector('.sd-btn-min').addEventListener('click', () => {
        if (win.classList.contains('minimized')) return; // 已最小化，不重复操作
        // v2.9.8：记录最小化前的状态（用于最大化按钮精确恢复）
        win.dataset.preMinState = win.classList.contains('maximized') ? 'maximized' : 'normal';
        // 记录内联位置样式（拖拽后的位置）
        win.dataset.preMinLeft = win.style.left || '';
        win.dataset.preMinTop = win.style.top || '';
        win.dataset.preMinPosition = win.style.position || '';
        win.dataset.preMinRight = win.style.right || '';
        win.dataset.preMinBottom = win.style.bottom || '';
        win.dataset.preMinMargin = win.style.margin || '';
        // 切换到最小化（清除最大化状态）
        win.classList.remove('maximized');
        win.classList.add('minimized');
    });

    win.querySelector('.sd-btn-max').addEventListener('click', () => {
        if (win.classList.contains('minimized')) {
            // v2.9.8：从最小化恢复 — 精确还原到最小化前的位置和尺寸
            win.classList.remove('minimized');
            if (win.dataset.preMinState === 'maximized') {
                win.classList.add('maximized');
            }
            // 恢复内联位置样式（如果有）
            win.style.left = win.dataset.preMinLeft || '';
            win.style.top = win.dataset.preMinTop || '';
            win.style.position = win.dataset.preMinPosition || '';
            win.style.right = win.dataset.preMinRight || '';
            win.style.bottom = win.dataset.preMinBottom || '';
            win.style.margin = win.dataset.preMinMargin || '';
        } else {
            // v2.9.8：非最小化状态 — 切换最大化（放大/还原）
            win.classList.toggle('maximized');
        }
    });

    // ── 拖拽（标题栏） ──
    _enableDrag(win, win.querySelector('.sd-window-header'));

    // v2.9.8：不自动播放，仅显示 0.25 不透明度的汉字轮廓（底层始终显示）
}

/** 关闭单个弹窗 */
function _closeWindow(win, removeFromMap = true) {
    const char = win.dataset.char;
    win.classList.add('closing');
    win.classList.remove('sd-open');
    setTimeout(() => {
        if (win.isConnected) win.remove();
        if (removeFromMap && char) {
            _windows.delete(char);
        }
        // 无弹窗时隐藏遮罩
        if (_overlay && _windows.size === 0) {
            _overlay.style.display = 'none';
            _overlay.setAttribute('aria-hidden', 'true');
        }
    }, 160);
}

/** 聚焦已有弹窗（高亮闪烁，不自动播放动画） */
function _focusWindow(win) {
    if (!win || !win.isConnected) return;
    // v2.9.8：聚焦时若处于最小化状态，自动恢复显示
    win.classList.remove('minimized');
    // 置顶（多个弹窗时移到最后）
    if (win.parentNode) {
        win.parentNode.appendChild(win);
    }
    // 闪烁高亮（提示用户此弹窗已存在）
    win.classList.add('sd-flash');
    setTimeout(() => win.classList.remove('sd-flash'), 600);
    // v2.9.8：不自动播放动画。用户要求"不点击弹窗中的演示按钮则不开始动态演示"
    // 仅置顶 + 闪烁提示，保留未播放的 0.25 不透明度轮廓显示状态
}

/** 启用标题栏拖拽 */
function _enableDrag(win, handle) {
    if (!handle) return;
    let dragging = false;
    let startX = 0, startY = 0;
    let origLeft = 0, origTop = 0;

    const onDown = (e) => {
        if (e.target.closest('.sd-window-controls')) return; // 控制按钮不触发拖拽
        if (win.classList.contains('maximized')) return;     // 最大化不可拖拽
        dragging = true;
        const pt = e.touches ? e.touches[0] : e;
        startX = pt.clientX;
        startY = pt.clientY;
        const rect = win.getBoundingClientRect();
        const overlayRect = _overlay.getBoundingClientRect();
        origLeft = rect.left - overlayRect.left;
        origTop = rect.top - overlayRect.top;
        win.style.position = 'absolute';
        win.style.left = origLeft + 'px';
        win.style.top = origTop + 'px';
        win.style.right = 'auto';
        win.style.bottom = 'auto';
        win.style.margin = '0';
        win.classList.add('dragging');
        e.preventDefault();
    };
    const onMove = (e) => {
        if (!dragging) return;
        const pt = e.touches ? e.touches[0] : e;
        const dx = pt.clientX - startX;
        const dy = pt.clientY - startY;
        win.style.left = (origLeft + dx) + 'px';
        win.style.top = (origTop + dy) + 'px';
    };
    const onUp = () => {
        if (!dragging) return;
        dragging = false;
        win.classList.remove('dragging');
    };

    handle.addEventListener('mousedown', onDown);
    handle.addEventListener('touchstart', onDown, { passive: false });
    document.addEventListener('mousemove', onMove);
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('mouseup', onUp);
    document.addEventListener('touchend', onUp);
}

/** 简易 toast 提示 */
function _toast(msg) {
    const t = document.createElement('div');
    t.className = 'sd-toast';
    t.textContent = msg;
    t.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);z-index:10010;' +
        'padding:10px 18px;background:#1f2937;color:#fff;border-radius:8px;font-size:13px;' +
        'box-shadow:0 4px 16px rgba(0,0,0,0.2);opacity:0;transition:opacity .25s;';
    document.body.appendChild(t);
    requestAnimationFrame(() => { t.style.opacity = '1'; });
    setTimeout(() => {
        t.style.opacity = '0';
        setTimeout(() => { if (t.parentNode) t.remove(); }, 300);
    }, 2400);
}

/** ESC 关闭最上层弹窗 */
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && _windows.size > 0) {
        // 关闭最后一个（最上层）
        const lastWin = _overlay ? _overlay.lastElementChild : null;
        if (lastWin && lastWin.classList.contains('sd-window')) {
            _closeWindow(lastWin, true);
        }
    }
});

/**
 * 初始化字格点击事件委托。
 * 在 #grid-container 上监听 click，通过 closest 找到带 data-char 的字格。
 * v2.9.8：增强 SVG 子元素点击兼容性，添加 closest 失败时的向上遍历回退。
 */
export function initStrokeDemoClick() {
    const container = document.getElementById('grid-container');
    if (!container) return;
    container.addEventListener('click', (e) => {
        // 检查设置是否开启"点选单字演示笔画笔顺"
        const settings = getSettings();
        if (!settings.showStrokeDemo) return;
        // 排除反馈按钮点击
        if (e.target.closest('.char-feedback-btn')) return;

        // v2.9.8：查找带 data-char 的 .grid-svg-cell
        // 优先用 closest（现代浏览器 SVG 也支持），失败则手动向上遍历
        let cell = null;
        if (e.target.closest) {
            cell = e.target.closest('.grid-svg-cell[data-char]');
        }
        if (!cell) {
            // 回退：手动向上遍历 DOM（兼容旧浏览器或 SVG 边界情况）
            let node = e.target;
            while (node && node !== container) {
                if (node.classList && node.classList.contains('grid-svg-cell') &&
                    node.getAttribute && node.getAttribute('data-char')) {
                    cell = node;
                    break;
                }
                node = node.parentNode;
            }
        }
        if (!cell) return;

        const ch = cell.getAttribute('data-char');
        if (!ch) return;
        // 仅处理单个汉字
        if (!/[\u4e00-\u9fa5]/.test(ch.charAt(0))) return;
        openStrokeDemo(ch);
    });
}

/**
 * v2.9.8+：初始化工具栏"笔顺演示"开关按钮。
 * 按钮位于 .quick-toolbar 中（字体下拉菜单下方，与"刷新""打印"按钮平齐）。
 * 图标-only，开启时 btn-primary 高亮，关闭时 btn-secondary 暗淡。
 * 功能说明通过 title 属性在鼠标悬停/长按时显示（tooltip）。
 */
export function initStrokeDemoToolbar() {
    const btn = document.getElementById('strokeDemoToolbarBtn');
    if (!btn) return;

    const ON_TITLE = '点击单字动态演示笔画笔顺（当前：开启，点击切换为关闭）';
    const OFF_TITLE = '点击单字动态演示笔画笔顺（当前：关闭，点击切换为开启）';

    const syncState = (on) => {
        if (on) {
            btn.classList.add('btn-primary');
            btn.classList.remove('btn-secondary');
            btn.setAttribute('aria-pressed', 'true');
            btn.title = ON_TITLE;
        } else {
            btn.classList.remove('btn-primary');
            btn.classList.add('btn-secondary');
            btn.setAttribute('aria-pressed', 'false');
            btn.title = OFF_TITLE;
        }
    };

    // 初始状态
    const settings = getSettings();
    syncState(settings.showStrokeDemo !== false);

    // 点击切换
    btn.addEventListener('click', () => {
        const current = getSettings().showStrokeDemo !== false;
        updateSetting('showStrokeDemo', !current);
    });

    // 监听设置中心变化，同步按钮状态（设置中心恢复默认时联动）
    document.addEventListener('calligraphy:settings-updated', (e) => {
        const s = e.detail || {};
        if ('showStrokeDemo' in s) {
            syncState(s.showStrokeDemo !== false);
        }
    });
}
