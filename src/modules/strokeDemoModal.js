// 笔画笔顺动态演示弹窗模块（v3.0.4 触屏/平板自适应重构）
// ============================================================================
// 功能：
//   - 点击字格弹出标准窗口式弹窗，动态演示汉字笔画笔顺
//   - 汉字默认黑色、偏旁默认红色
//   - 双图层结构
//       · 底层 .sd-stage-bg：始终显示完整汉字（opacity 0.25），不参与动画
//       · 顶层 .sd-stage-fg：初始为空，点击播放时 animateCharacter 绘制笔画（opacity 1）
//   - 默认速度1x（可调1x-5x，5档，持久化到 localStorage）
//   - 播放按钮支持播放/暂停状态切换
//   - 标准弹窗（最小化/最大化/关闭/拖拽）
//   - 最多同时 4 个弹窗；相同字点击切换到已有弹窗（高亮闪烁）
//
// v3.0.4 触屏/平板重构（契约 §3.8，缺陷 S1-S10）：
//   - 布局模型：.sd-overlay 由 flex 改为 CSS Grid
//       · 每个窗口包在 .sd-slot 中；插槽尺寸 = calc(340px * var(--sd-s)) × calc(440px * var(--sd-s))
//       · .sd-window 保持冻结的 340×440 内部几何，用 transform: scale(var(--sd-s)) 缩放
//         （transform-origin: top left，因此左上角对齐插槽，插槽尺寸即"视觉尺寸"）
//       · --sd-cols / --sd-s 由 JS 求解后写在 overlay 上
//   - solveLayout()：纯函数布局求解器（导出，便于单测/验证脚本调用）
//   - 桌面 sMax = 1.0 → 只要 1×N 横排放得下，s 恒为 1，布局与旧版逐像素一致
//   - 触摸/平板 sMax = 1.6；空间不足时（s < MIN_S=0.72）自动把最旧窗口收成药丸
//   - S3 拖拽 clamp 到视口 + 视口变化重新 clamp + 双击标题栏复位
//   - S4 改用内联 zIndex，不再 appendChild 重排（避免重播入场动画）
//   - S5 补齐 .sd-flash / .dragging 样式；入场动画迁到 .sd-slot.sd-open
//   - S6 关闭时插槽立即脱离网格，残影固定定位淡出，animationend 后移除
//   - S9 拖拽的 document 级监听在拖拽结束 / 窗口关闭时移除
//   - S10 打开新窗口 / 最大化某窗口时，重置其它窗口的 maximized 状态
// ============================================================================

import HanziWriter from 'hanzi-writer';
import { getCharDataAsync, ready as hanziDataReady, isReady } from './hanziDataStore.js';
import { getSettings, updateSetting } from './settingsCenter.js';
import { isCoarsePointer, getViewportRect, onViewportChange } from '../utils/deviceEnv.js';
import '../styles/strokeDemoModal.css';

const MAX_WINDOWS = 4;
const STAGE_SIZE = 300;        // 演示舞台尺寸（viewBox 基准，CSS 自适应缩放）

// ── 冻结的布局常量（契约 §3.8；改动会破坏桌面 1:1 复现） ──
const WIN_W = 340;             // 窗口布局宽（缩放前）
const WIN_H = 440;             // 窗口布局高（缩放前）
const PILL_W = 240;            // 最小化药丸宽
const PILL_H = 40;             // 最小化药丸高
const GAP = 12;                // 网格间距（与旧版 flex gap 一致）
const MARGIN = 20;             // 视口边距（旧版 max-width: calc(100vw - 40px) 的等价物）
const MIN_S = 0.72;            // 粗略指针下的最小可读缩放
const S_MAX_COARSE = 1.6;      // 触摸/平板缩放上限
const S_MAX_FINE = 1.0;        // 桌面缩放上限（保证桌面不放大、s=1）
const DOUBLE_TAP_MS = 320;     // 双击标题栏复位的时间窗
const DRAG_THRESHOLD_PX = 3;   // 超过该位移才判定为"拖拽"（避免轻点即脱离排列）

/**
 * 布局求解器（纯函数，契约 §3.8 冻结签名）。
 *
 * 规则：
 *   WIN_W=340, WIN_H=440, GAP=12
 *   对 cols = 1..n：rows = ceil(n/cols)
 *     s = min(sMax, availW/(cols*340+(cols-1)*12), availH/(rows*440+(rows-1)*12))
 *   取 s 最大者；并列时取 cols 最大（→ 桌面 4 窗口复现 1×4 横排）
 *
 * @param {number} n      窗口数 1..4
 * @param {number} availW 可用宽（可视视口宽 - 2*MARGIN）
 * @param {number} availH 可用高
 * @param {number} sMax   缩放上限
 * @returns {{cols:number, rows:number, s:number}}
 */
export function solveLayout(n, availW, availH, sMax) {
    const count = Math.max(1, Math.floor(Number(n)) || 1);
    const maxScale = (Number.isFinite(sMax) && sMax > 0) ? sMax : 1;
    const w = (Number.isFinite(availW) && availW > 0) ? availW : WIN_W;
    const h = (Number.isFinite(availH) && availH > 0) ? availH : WIN_H;

    let best = { cols: 1, rows: count, s: 0 };
    for (let cols = 1; cols <= count; cols++) {
        const rows = Math.ceil(count / cols);
        const s = Math.min(
            maxScale,
            w / (cols * WIN_W + (cols - 1) * GAP),
            h / (rows * WIN_H + (rows - 1) * GAP)
        );
        // 取 s 更大者；并列时取列数更多者（复现桌面 1×N 横排）
        if (s > best.s + 1e-9 || (Math.abs(s - best.s) <= 1e-9 && cols > best.cols)) {
            best = { cols, rows, s };
        }
    }
    return best;
}

/**
 * 混合尺寸排列求解（内部使用）：窗口 340×440 与药丸 240×40 混排时，
 * solveLayout 的"等高行"假设不成立。
 *
 * 尺寸模型必须与 CSS Grid 的实际渲染一致，否则求出的 s 会偏大 → 溢出：
 *   - 列宽 = max-content = **该列所有条目的最大宽**；网格总宽 = Σ列宽 + (cols-1)*gap
 *   - 行高 = **该行所有条目的最大高**；网格总高 = Σ行高 + (rows-1)*gap
 * 早前版本用"最宽一行的行内宽度之和"当总宽，但混排时窄条目（药丸）所在列
 * 会被同列的宽条目（窗口）撑宽，真实总宽 > 最宽行 → 实测溢出并触发意外换行。
 *
 * 当所有条目尺寸相同时，两种模型等价，结果与 solveLayout 完全一致。
 * @param {{w:number,h:number}[]} sizes
 * @returns {{cols:number, rows:number, s:number}}
 */
function _solveMixed(sizes, availW, availH, sMax) {
    const n = sizes.length;
    if (n === 0) return { cols: 1, rows: 0, s: sMax };
    const maxScale = (Number.isFinite(sMax) && sMax > 0) ? sMax : 1;
    let best = { cols: 1, rows: n, s: 0 };
    for (let cols = 1; cols <= n; cols++) {
        const rows = Math.ceil(n / cols);
        // Σ 每列最大宽（= max-content 轨道宽之和）
        const colMax = new Array(cols).fill(0);
        const rowMax = new Array(rows).fill(0);
        for (let i = 0; i < n; i++) {
            const c = i % cols;
            const r = Math.floor(i / cols);
            colMax[c] = Math.max(colMax[c], sizes[i].w);
            rowMax[r] = Math.max(rowMax[r], sizes[i].h);
        }
        const totalW = colMax.reduce((a, b) => a + b, 0) + (cols - 1) * GAP;
        const totalH = rowMax.reduce((a, b) => a + b, 0) + (rows - 1) * GAP;
        const s = Math.min(
            maxScale,
            availW / Math.max(1, totalW),
            availH / Math.max(1, totalH)
        );
        if (s > best.s + 1e-9 || (Math.abs(s - best.s) <= 1e-9 && cols > best.cols)) {
            best = { cols, rows, s };
        }
    }
    return best;
}

/** 依据条目尺寸选择求解器：尺寸统一走冻结的 solveLayout，混排走 _solveMixed */
function _solveItems(items, availW, availH, sMax) {
    if (items.length === 0) return { cols: 1, rows: 0, s: sMax };
    const first = items[0];
    const uniform = items.every(it => it.w === first.w && it.h === first.h);
    if (uniform && first.w === WIN_W && first.h === WIN_H) {
        return solveLayout(items.length, availW, availH, sMax);
    }
    return _solveMixed(items.map(it => ({ w: it.w, h: it.h })), availW, availH, sMax);
}

/** 缩放上限：粗略指针 1.6，桌面 1.0（桌面恒 s=1 的根因保证） */
function _sMax() {
    return isCoarsePointer() ? S_MAX_COARSE : S_MAX_FINE;
}

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
    } catch { /* 静默降级 */ }
}

let _overlay = null;
const _windows = new Map();    // char -> { win, bgWriter, fgWriter, speed }（插入顺序 = 创建顺序 = 网格顺序）
const _zOrder = [];            // S4：聚焦顺序（末尾 = 最上层），z-index 归一化到 10003..10006
let _unsubViewport = null;     // 视口变化订阅的取消函数

/** 确保遮罩层存在 */
function _ensureOverlay() {
    if (_overlay && _overlay.isConnected) return _overlay;
    _overlay = document.createElement('div');
    _overlay.className = 'sd-overlay';
    _overlay.setAttribute('aria-hidden', 'true');
    document.body.appendChild(_overlay);
    if (!_unsubViewport) {
        _unsubViewport = onViewportChange(() => { _reflow(); });
    }
    return _overlay;
}

/** 当前生效缩放（overlay 上的 --sd-s，未设置时为 1） */
function _currentScale() {
    if (!_overlay) return 1;
    const v = parseFloat(_overlay.style.getPropertyValue('--sd-s'));
    return (Number.isFinite(v) && v > 0) ? v : 1;
}

/**
 * 把窗口提到最上层（S4：内联 zIndex，不移动 DOM —— appendChild 会重排网格并重播入场动画）。
 * z-index 归一化到既有的 10003..10006 阶梯（窗口数 ≤ MAX_WINDOWS=4），
 * 聚焦窗口恒为最大，且不随开关窗口无限增长。
 */
function _bringToFront(win) {
    if (!win) return;
    for (let i = _zOrder.length - 1; i >= 0; i--) {
        if (_zOrder[i] === win || !_zOrder[i].isConnected) _zOrder.splice(i, 1);
    }
    _zOrder.push(win);
    for (let i = 0; i < _zOrder.length; i++) {
        _zOrder[i].style.zIndex = String(10003 + i);
    }
}

/** 取最上层窗口（ESC 关闭"最上层"，不再依赖 lastElementChild） */
function _topWindow() {
    for (let i = _zOrder.length - 1; i >= 0; i--) {
        const w = _zOrder[i];
        if (w && w.isConnected && !w.classList.contains('closing')) return w;
    }
    return null;
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
    // v2.9.9：根据数据就绪状态选择路径
    if (isReady()) {
        getCharDataAsync(ch)
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
    } else {
        // 数据未就绪 — 立即创建加载态弹窗，避免"点击后迟迟无反馈"
        _createLoadingWindow(ch);
    }
}

/** 关闭所有演示弹窗 */
export function closeAllStrokeDemo() {
    const wins = [..._windows.values()].map(e => e.win).filter(Boolean);
    _windows.clear();
    _zOrder.length = 0;
    for (const win of wins) _closeWindow(win, false);
    if (_overlay) {
        _overlay.style.display = 'none';
        _overlay.setAttribute('aria-hidden', 'true');
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

/**
 * 创建插槽 + 窗口骨架，并完成公共装配。
 * 插槽是网格条目（尺寸由 CSS 依据 --sd-s 计算），窗口是插槽内的冻结 340×440 盒子。
 * @returns {{slot:HTMLElement, win:HTMLElement}}
 */
/**
 * 写入窗口标题。
 *
 * 刻意用 textContent 而不是把汉字拼进 innerHTML 模板：
 * 弹窗骨架是编译期常量（零插值），所有来自数据的字符一律经 DOM API 写入。
 * 这样 innerHTML 汇聚点永远是静态字面量，可被 no-unsanitized 一类静态门禁机械校验。
 *
 * @param {HTMLElement} win .sd-window 元素
 * @param {string} char 单个汉字
 */
function _fillWindowTitle(win, char) {
    const title = win.querySelector('.sd-window-title');
    if (!title) return;
    title.textContent = char + ' · 笔画笔顺';
    title.title = char + ' 的笔画笔顺演示';
}

/**
 * 把初始播放速度写入速度滑块与数值标签（同样不拼进标记字符串）。
 * @param {HTMLElement} win .sd-window 元素
 * @param {number} initialSpeed 1–5
 */
function _fillSpeedDisplay(win, initialSpeed) {
    const slider = win.querySelector('.sd-speed-slider');
    if (slider) slider.value = String(initialSpeed);
    const val = win.querySelector('.sd-speed-val');
    if (val) val.textContent = initialSpeed + 'x';
}

function _createSlotAndWindow(char, extraWinClass) {
    const overlay = _ensureOverlay();
    overlay.style.display = 'grid';
    overlay.setAttribute('aria-hidden', 'false');

    const slot = document.createElement('div');
    slot.className = 'sd-slot';

    const win = document.createElement('div');
    win.className = 'sd-window' + (extraWinClass ? ' ' + extraWinClass : '');
    win.dataset.char = char;
    win._sdSlot = slot;          // 供 _closeWindow / _syncSlotState 使用
    slot._sdWin = win;
    slot.appendChild(win);
    overlay.appendChild(slot);

    // S5：入场动画挂在插槽上（窗口自身带 scale 变换，动画若挂窗口会与缩放互相覆盖）
    // 与插入同一任务内添加 .sd-open，动画从首帧开始，无闪帧
    slot.classList.add('sd-open');

    // S10：新窗口打开时，重置其它窗口的最大化状态（避免 190vw×180vh 叠加）
    for (const { win: w } of _windows.values()) {
        if (w && w.classList.contains('maximized')) {
            w.classList.remove('maximized');
            _syncSlotState(w);
        }
    }

    _bringToFront(win);
    return { slot, win };
}

/** 创建单个演示弹窗 */
function _createWindow(char, data) {
    // v2.9.8：初始速度从 localStorage 持久化读取（用户上次调整的值）
    const initialSpeed = _getPersistedSpeed();
    const { win } = _createSlotAndWindow(char, '');

    win.innerHTML = `
        <div class="sd-window-header" role="toolbar" aria-label="弹窗控制">
            <span class="sd-window-title"></span>
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
                    <input type="range" class="sd-speed-slider" min="1" max="5" step="1">
                    <span class="sd-speed-val"></span>
                </div>
            </div>
            <div class="sd-info"></div>
        </div>
    `;

    _fillWindowTitle(win, char);
    _fillSpeedDisplay(win, initialSpeed);

    // v2.9.9：抽取窗口控件绑定与主体设置（与 _createLoadingWindow 共用）
    _bindWindowControls(win);
    _setupWindowBody(win, char, data, initialSpeed);
    _syncSlotState(win);
    _reflow();

    // v2.9.8：不自动播放，仅显示 0.25 不透明度的汉字轮廓（底层始终显示）
}

/**
 * 同步插槽状态类（S-min / 最大化）：
 *   - 处于"自由拖拽"状态（.sd-free）的窗口不改变插槽尺寸 ——
 *     其内联 left/top 是相对 overlay 的，若插槽尺寸变化会触发网格重排 → overlay 原点移动 → 药丸漂移，
 *     破坏 dataset.preMin* 的"精确还原位置"。
 * @param {HTMLElement} win
 */
function _syncSlotState(win) {
    const slot = win && win._sdSlot;
    if (!slot) return;
    const free = win.classList.contains('sd-free');
    const isMin = win.classList.contains('minimized') && !free;
    const isMax = win.classList.contains('maximized');
    slot.classList.toggle('sd-slot--min', isMin);
    slot.classList.toggle('sd-slot--max', isMax);
}

/**
 * 切换最小化状态（复用既有 dataset.preMin* 精确还原机制）。
 * 本函数**不**触发 _reflow，由调用方决定重排时机（自动收纳循环需要批量处理）。
 * @param {HTMLElement} win
 * @param {boolean} flag
 */
function _setMinimized(win, flag) {
    if (!win) return;
    if (flag) {
        if (win.classList.contains('minimized')) return;
        // 记录最小化前的状态（用于最大化按钮精确恢复）
        win.dataset.preMinState = win.classList.contains('maximized') ? 'maximized' : 'normal';
        win.dataset.preMinLeft = win.style.left || '';
        win.dataset.preMinTop = win.style.top || '';
        win.dataset.preMinPosition = win.style.position || '';
        win.dataset.preMinRight = win.style.right || '';
        win.dataset.preMinBottom = win.style.bottom || '';
        win.dataset.preMinMargin = win.style.margin || '';
        win.classList.remove('maximized');
        win.classList.add('minimized');
    } else {
        if (!win.classList.contains('minimized')) return;
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
    }
    _syncSlotState(win);
}

/** 切换最大化（S10：同一时刻只允许一个窗口最大化） */
function _toggleMaximized(win) {
    const next = !win.classList.contains('maximized');
    if (next) {
        for (const { win: w } of _windows.values()) {
            if (w !== win && w.classList.contains('maximized')) {
                w.classList.remove('maximized');
                _syncSlotState(w);
            }
        }
        win.classList.add('maximized');
    } else {
        win.classList.remove('maximized');
    }
    _syncSlotState(win);
    _bringToFront(win);
    _reflow();
}

/**
 * v2.9.9：抽取窗口控件绑定（关闭/最小化/最大化按钮 + 标题栏拖拽）。
 * 在 _createWindow 与 _createLoadingWindow 中共用。
 * @param {HTMLElement} win .sd-window 元素
 */
function _bindWindowControls(win) {
    win.querySelector('.sd-btn-close').addEventListener('click', () => _closeWindow(win, true));

    win.querySelector('.sd-btn-min').addEventListener('click', () => {
        if (win.classList.contains('minimized')) return;
        _setMinimized(win, true);
        _reflow();
    });

    win.querySelector('.sd-btn-max').addEventListener('click', () => {
        if (win.classList.contains('minimized')) {
            // 从最小化恢复 — 精确还原到最小化前的位置和尺寸；
            // 药丸按 LRU 恢复：空间不足时把最旧的"其它"展开窗口收成药丸
            _setMinimized(win, false);
            _reflow({ exclude: win });
        } else {
            _toggleMaximized(win);
        }
    });

    // ── 拖拽（标题栏） ──
    _enableDrag(win, win.querySelector('.sd-window-header'));
}

/**
 * v2.9.9：抽取弹窗主体设置（HanziWriter 双图层 + 播放按钮 + 速度滑块）。
 * @param {HTMLElement} win .sd-window 元素（body 内容已就绪）
 * @param {string} char 单个汉字
 * @param {object} data 笔画数据
 * @param {number} initialSpeed 初始播放速度（1-5）
 */
function _setupWindowBody(win, char, data, initialSpeed) {
    // ── 双图层 HanziWriter 实例 ──
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
        showCharacter: true,
        strokeColor: '#000000',
        radicalColor: '#d32f2f',
        charDataLoader: makeCharDataLoader()
    });
    _ensureViewBox(stageBg);

    // 顶层：初始为空（由 CSS .sd-stage-fg opacity:0 控制），点击播放时动画
    const fgWriter = HanziWriter.create(fgId, char, {
        width: STAGE_SIZE,
        height: STAGE_SIZE,
        padding: 8,
        showOutline: false,
        showCharacter: true,
        strokeColor: '#000000',
        radicalColor: '#d32f2f',
        strokeAnimationSpeed: currentSpeed,
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

    // ── 播放按钮（支持播放/暂停切换） ──
    const playBtn = win.querySelector('.sd-play-btn');
    const playIcon = win.querySelector('.sd-play-icon');
    const pauseIcon = win.querySelector('.sd-pause-icon');
    const playText = win.querySelector('.sd-play-text');
    const stageFgEl = stageFg;

    const _showPauseState = () => {
        playIcon.style.display = 'none';
        pauseIcon.style.display = '';
        playText.textContent = '暂停';
        playBtn.title = '暂停播放';
        playBtn.setAttribute('aria-label', '暂停播放');
        playBtn.classList.add('playing');
    };
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
            if (isPaused) {
                isPaused = false;
                _showPauseState();
                try { fgWriter.resumeAnimation(); } catch { /* 静默 */ }
            } else {
                isPaused = true;
                _showPlayState();
                try { fgWriter.pauseAnimation(); } catch { /* 静默 */ }
            }
            return;
        }
        isPlaying = true;
        isPaused = false;
        _showPauseState();
        stageFgEl.classList.add('sd-playing');
        fgWriter.animateCharacter({
            onComplete: () => {
                isPlaying = false;
                isPaused = false;
                _showPlayState();
            }
        });
    });

    // ── 速度滑块 ──
    // hanzi-writer@3.7.3 没有 updateOptions()，直接赋值 _options.strokeAnimationSpeed
    const slider = win.querySelector('.sd-speed-slider');
    const speedVal = win.querySelector('.sd-speed-val');
    slider.addEventListener('input', (e) => {
        currentSpeed = parseFloat(e.target.value);
        try {
            fgWriter._options.strokeAnimationSpeed = currentSpeed;
        } catch (err) {
            console.warn('[strokeDemo] 更新速度失败:', err);
        }
        speedVal.textContent = currentSpeed + 'x';
        const entry = _windows.get(char);
        if (entry) entry.speed = currentSpeed;
        _persistSpeed(currentSpeed);
    });
}

/**
 * v2.9.9：创建带加载动画的弹窗。
 * @param {string} char 单个汉字
 */
function _createLoadingWindow(char) {
    const initialSpeed = _getPersistedSpeed();
    const { win } = _createSlotAndWindow(char, 'loading');

    win.innerHTML = `
        <div class="sd-window-header" role="toolbar" aria-label="弹窗控制">
            <span class="sd-window-title"></span>
            <div class="sd-window-controls">
                <button type="button" class="sd-btn-min" title="最小化" aria-label="最小化">▱</button>
                <button type="button" class="sd-btn-max" title="最大化" aria-label="最大化">▢</button>
                <button type="button" class="sd-btn-close" title="关闭" aria-label="关闭">✕</button>
            </div>
        </div>
        <div class="sd-window-body">
            <div class="sd-loading-spinner" aria-hidden="true"></div>
            <div class="sd-loading-text">正在加载笔画数据...</div>
        </div>
    `;

    _fillWindowTitle(win, char);
    _bindWindowControls(win);

    // 占位注册到 _windows，避免数据未就绪期间相同字重复打开新弹窗
    _windows.set(char, { win, bgWriter: null, fgWriter: null, speed: initialSpeed });
    _syncSlotState(win);
    _reflow();

    let cancelled = false;
    win.querySelector('.sd-btn-close').addEventListener('click', () => { cancelled = true; });
    const isCancelled = () => cancelled || !win.isConnected || win.classList.contains('closing');

    hanziDataReady()
        .then(() => getCharDataAsync(char))
        .then(data => {
            if (isCancelled()) return;
            if (!data) {
                _showLoadingError(win, `无"${char}"的笔画数据（本地+网络均无）`);
                _windows.delete(char);
                return;
            }
            _promoteLoadingWindow(win, char, data, initialSpeed);
        })
        .catch(() => {
            if (isCancelled()) return;
            _showLoadingError(win, '笔画数据加载失败，请刷新页面重试');
            _windows.delete(char);
        });
}

/**
 * v2.9.9：将加载态弹窗升级为正常弹窗（复用 win 元素，避免视觉跳动）。
 */
function _promoteLoadingWindow(win, char, data, initialSpeed) {
    win.classList.remove('loading', 'sd-loading-error');
    const body = win.querySelector('.sd-window-body');
    if (!body) return;
    body.innerHTML = `
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
                <input type="range" class="sd-speed-slider" min="1" max="5" step="1">
                <span class="sd-speed-val"></span>
            </div>
        </div>
        <div class="sd-info"></div>
    `;
    _fillSpeedDisplay(win, initialSpeed);
    _setupWindowBody(win, char, data, initialSpeed);
}

/**
 * v2.9.9：在加载态弹窗中显示错误信息。
 */
function _showLoadingError(win, msg) {
    win.classList.remove('loading');
    win.classList.add('sd-loading-error');
    const body = win.querySelector('.sd-window-body');
    if (body) {
        // 错误文案可能来自底层异常（不可信），一律 textContent 写入，不拼 HTML
        const box = document.createElement('div');
        box.className = 'sd-loading-error-text';
        box.textContent = msg;
        body.replaceChildren(box);
    }
}

/**
 * 关闭单个弹窗（S6：不再有 160ms 死等）。
 *
 * 步骤：
 *   1. 立刻把窗口从网格中摘出（插槽立即移除）→ 网格瞬时重排，不留占位
 *   2. 窗口以视口固定定位的"残影"淡出（移到 body，脱离 .sd-overlay 的 transform 包含块）
 *   3. animationend 时移除元素；setTimeout 兜底（reduced-motion / 动画被跳过时）
 */
function _closeWindow(win, removeFromMap = true) {
    if (!win || win.classList.contains('closing')) return;
    const char = win.dataset.char;
    const slot = win._sdSlot || null;

    // S9：移除拖拽期间挂在 document 上的监听
    if (typeof win._sdDetachDrag === 'function') {
        try { win._sdDetachDrag(); } catch { /* 静默 */ }
        win._sdDetachDrag = null;
    }

    if (removeFromMap && char) {
        const entry = _windows.get(char);
        if (entry && entry.win === win) _windows.delete(char);
    }
    // 移出聚焦顺序（残影保留自身 z-index，仍会盖在 overlay 之上）
    for (let i = _zOrder.length - 1; i >= 0; i--) {
        if (_zOrder[i] === win) _zOrder.splice(i, 1);
    }

    // 记录当前可视位置（视口坐标）与缩放，用于固定定位残影
    const rect = win.getBoundingClientRect();
    const z = win.style.zIndex;
    const s = _currentScale();

    win.classList.add('closing');
    win.style.setProperty('--sd-s', String(s));
    win.style.position = 'fixed';
    win.style.left = rect.left + 'px';
    win.style.top = rect.top + 'px';
    win.style.margin = '0';
    if (z) win.style.zIndex = z;

    // 立刻脱离网格：插槽从布局中移除（S6）
    if (slot && slot.parentNode) slot.parentNode.removeChild(slot);

    // 残影移到 body → 不再受 overlay 的 transform 包含块影响，位置固定在视口上
    document.body.appendChild(win);

    let done = false;
    const cleanup = () => {
        if (done) return;
        done = true;
        if (win.isConnected) win.remove();
        _maybeHideOverlay();
    };
    win.addEventListener('animationend', cleanup, { once: true });
    setTimeout(cleanup, 400);   // 兜底

    // 网格瞬时重排
    _reflow();
    _maybeHideOverlay();
}

/** 没有存活窗口时隐藏遮罩 */
function _maybeHideOverlay() {
    if (!_overlay) return;
    let alive = false;
    for (const { win } of _windows.values()) {
        if (win && win.isConnected && !win.classList.contains('closing')) { alive = true; break; }
    }
    if (!alive) {
        _overlay.style.display = 'none';
        _overlay.setAttribute('aria-hidden', 'true');
    }
}

/** 聚焦已有弹窗（高亮闪烁，不自动播放动画） */
function _focusWindow(win) {
    if (!win || !win.isConnected) return;
    _bringToFront(win);
    // 聚焦时若处于最小化状态，自动恢复显示（恢复时若空间不足则收最旧的其它展开窗口）
    if (win.classList.contains('minimized')) {
        _setMinimized(win, false);
        _reflow({ exclude: win });
    } else {
        _reflow();
    }
    // 闪烁高亮（提示用户此弹窗已存在）
    _flash(win);
    // 不自动播放动画。用户要求"不点击弹窗中的演示按钮则不开始动态演示"
}

/** 高亮闪烁提示（S5：.sd-flash 此前无任何 CSS） */
function _flash(win) {
    if (!win) return;
    win.classList.remove('sd-flash');
    // 强制重排以便重复触发同一次闪烁
    void win.offsetWidth;
    win.classList.add('sd-flash');
    setTimeout(() => win.classList.remove('sd-flash'), 620);
}

/**
 * 把窗口从"自由拖拽"状态复位回自动排列（双击标题栏触发，S3）。
 */
function _resetWindow(win) {
    if (!win || !win.isConnected) return;
    if (!win.classList.contains('sd-free')) {
        _flash(win);
        return;
    }
    win.classList.remove('sd-free', 'dragging');
    win.style.position = '';
    win.style.left = '';
    win.style.top = '';
    win.style.right = '';
    win.style.bottom = '';
    win.style.margin = '';
    _syncSlotState(win);
    _reflow();
    _flash(win);
}

/**
 * 启用标题栏拖拽（S3 + S9）。
 *   - 首次位移超过阈值才脱离自动排列（轻点标题栏不再改变布局）
 *   - 拖拽期间 clamp 到视口内
 *   - document 级监听在按下时挂载、抬起时卸载，不泄漏
 *   - 双击标题栏复位回自动排列
 */
function _enableDrag(win, handle) {
    if (!handle) return;

    let pending = false;      // 已按下但尚未超过位移阈值
    let dragging = false;     // 已进入拖拽
    let startX = 0, startY = 0;
    let origLeft = 0, origTop = 0;
    let winW = WIN_W, winH = WIN_H;
    let overlayRect = null;
    let lastTapAt = 0;

    const attachDoc = () => {
        document.addEventListener('mousemove', onMove);
        document.addEventListener('touchmove', onMove, { passive: false });
        document.addEventListener('mouseup', onUp);
        document.addEventListener('touchend', onUp);
        document.addEventListener('touchcancel', onUp);
    };
    const detachDoc = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('touchmove', onMove);
        document.removeEventListener('mouseup', onUp);
        document.removeEventListener('touchend', onUp);
        document.removeEventListener('touchcancel', onUp);
    };

    const onDown = (e) => {
        if (e.target.closest('.sd-window-controls')) return; // 控制按钮不触发拖拽
        if (win.classList.contains('maximized')) return;     // 最大化不可拖拽

        // 双击标题栏 → 复位回自动排列
        const now = Date.now();
        if (now - lastTapAt < DOUBLE_TAP_MS) {
            lastTapAt = 0;
            if (e.cancelable) e.preventDefault();
            _resetWindow(win);
            return;
        }
        lastTapAt = now;

        const pt = e.touches ? e.touches[0] : e;
        if (!pt) return;
        pending = true;
        dragging = false;
        startX = pt.clientX;
        startY = pt.clientY;

        const rect = win.getBoundingClientRect();
        overlayRect = _overlay ? _overlay.getBoundingClientRect() : { left: 0, top: 0 };
        origLeft = rect.left - overlayRect.left;
        origTop = rect.top - overlayRect.top;
        // 用 offsetWidth/Height × 当前缩放计算 clamp 尺寸，而不是 getBoundingClientRect().width：
        // 入场动画（transform）尚未提交帧时 rect 会偏小 5%，会导致拖拽边界算松、窗口探出屏幕。
        const sc = _currentScale();
        winW = win.offsetWidth * sc;
        winH = win.offsetHeight * sc;

        _bringToFront(win);
        attachDoc();
        if (e.cancelable) e.preventDefault();
    };

    const onMove = (e) => {
        if (!pending) return;
        const pt = e.touches ? e.touches[0] : e;
        if (!pt) return;
        const dx = pt.clientX - startX;
        const dy = pt.clientY - startY;

        if (!dragging) {
            if (Math.abs(dx) < DRAG_THRESHOLD_PX && Math.abs(dy) < DRAG_THRESHOLD_PX) return;
            dragging = true;
            // 脱离自动排列（插槽保留占位，避免网格抖动 / overlay 原点漂移）
            win.classList.add('sd-free', 'dragging');
            win.style.position = 'absolute';
            win.style.right = 'auto';
            win.style.bottom = 'auto';
            win.style.margin = '0';
            win.style.left = origLeft + 'px';
            win.style.top = origTop + 'px';
            _syncSlotState(win);
        }

        const vp = getViewportRect();
        const b = _freeBounds(vp, overlayRect, winW, winH);
        const nl = Math.min(b.maxLeft, Math.max(b.minLeft, origLeft + dx));
        const nt = Math.min(b.maxTop, Math.max(b.minTop, origTop + dy));
        win.style.left = nl + 'px';
        win.style.top = nt + 'px';
        if (e.cancelable) e.preventDefault();
    };

    const onUp = () => {
        if (!pending) return;
        pending = false;
        dragging = false;
        win.classList.remove('dragging');
        detachDoc();
    };

    handle.addEventListener('mousedown', onDown);
    handle.addEventListener('touchstart', onDown, { passive: false });

    // S9：窗口关闭时移除句柄监听，杜绝监听泄漏
    win._sdDetachDrag = () => {
        detachDoc();
        pending = false;
        dragging = false;
        handle.removeEventListener('mousedown', onDown);
        handle.removeEventListener('touchstart', onDown);
    };
}

/**
 * 自由拖拽窗口的合法 left/top 区间（overlay 局部坐标系）。
 *
 * 边界取「可视视口」而非「布局视口」：free 窗口的 left/top 是相对 overlay 的，
 * 而 overlay 锚在可视视口中心，因此要把可视视口的原点偏移一并折算进来，
 * 否则双指缩放平移后 clamp 会把窗口夹到一个用户看不见的位置。
 *
 * @param {{left:number,top:number,w:number,h:number}} vp 可视视口几何
 * @param {{left:number,top:number}} overlayRect overlay 的 boundingClientRect
 * @param {number} winW 窗口视觉宽（已乘缩放）
 * @param {number} winH 窗口视觉高（已乘缩放）
 */
function _freeBounds(vp, overlayRect, winW, winH) {
    const minLeft = vp.left + MARGIN - overlayRect.left;
    const minTop = vp.top + MARGIN - overlayRect.top;
    return {
        minLeft,
        minTop,
        maxLeft: Math.max(minLeft, vp.left + vp.w - MARGIN - winW - overlayRect.left),
        maxTop: Math.max(minTop, vp.top + vp.h - MARGIN - winH - overlayRect.top),
    };
}

/**
 * 视口变化时把"自由拖拽"的窗口重新 clamp 回可视区（S3）。
 * @param {{left:number,top:number,w:number,h:number}} vp
 */
function _clampFreeWindows(vp) {
    if (!_overlay) return;
    const overlayRect = _overlay.getBoundingClientRect();
    const sc = _currentScale();
    for (const { win } of _windows.values()) {
        if (!win || !win.isConnected || !win.classList.contains('sd-free')) continue;
        if (win.classList.contains('closing')) continue;
        const winW = win.offsetWidth * sc;
        const winH = win.offsetHeight * sc;
        const curL = parseFloat(win.style.left);
        const curT = parseFloat(win.style.top);
        if (!Number.isFinite(curL) || !Number.isFinite(curT)) continue;

        const b = _freeBounds(vp, overlayRect, winW, winH);
        const nl = Math.min(b.maxLeft, Math.max(b.minLeft, curL));
        const nt = Math.min(b.maxTop, Math.max(b.minTop, curT));
        if (nl !== curL) win.style.left = nl + 'px';
        if (nt !== curT) win.style.top = nt + 'px';
    }
}

/** 参与网格排列的条目（最大化窗口用 display:contents 退出网格，不计入） */
function _arrangementItems(wins) {
    const items = [];
    for (const win of wins) {
        if (win.classList.contains('maximized')) continue;
        const free = win.classList.contains('sd-free');
        const isMin = win.classList.contains('minimized') && !free;
        items.push(isMin ? { win, w: PILL_W, h: PILL_H } : { win, w: WIN_W, h: WIN_H });
    }
    return items;
}

/**
 * 把 overlay 锚定到「可视视口」的正中心（无条件）。
 *
 * 为什么不能只靠 CSS 的 left/top:50% + translate(-50%,-50%)：
 * fixed 元素的百分比基准是**初始包含块（布局视口）**，而 visualViewport 才是
 * 用户真正看得到的区域。二者在以下场景不重合：
 *   - 软键盘弹出（可视高度骤减，布局视口不变 → 弹窗中心落到键盘后面）
 *   - 双指缩放后平移（offsetLeft/offsetTop 非 0）
 *   - 移动端地址栏收放、无头浏览器 isMobile 模拟
 * 此时 left:50% 会把弹窗推出可见区或偏离中心 —— 正是"单窗口不在正中央"的成因。
 *
 * 为什么无条件写死（而不是"发现跑出去了才纠偏"）：
 * 用户诉求是**总在正中央**，"在可视区内但偏心"同样是缺陷；条件式纠偏只保证前者。
 * 且该式在布局视口与可视视口重合时与 CSS 基线**逐像素等价**：
 *   桌面 left:50% = clientWidth/2（不含滚动条）= visualViewport.width/2 + offsetLeft(0)，
 * 因此对桌面与真实手机都不引入偏移，无回归。
 *
 * @param {{left:number,top:number,w:number,h:number}} vp 可视视口几何
 */
function _anchorOverlay(vp) {
    if (!_overlay) return;
    _overlay.style.left = (vp.left + vp.w / 2) + 'px';
    _overlay.style.top = (vp.top + vp.h / 2) + 'px';
}

/**
 * 重排 + 求解（核心布局入口）。
 *
 * 粗略指针下若最优 s < MIN_S，则把"最旧的展开窗口"收成药丸，
 * 直到 s >= MIN_S 或仅剩 1 个展开窗口（契约 §3.8 / §2.2 手机策略）。
 * 药丸按 LRU 恢复：opts.exclude 指定"刚刚被恢复的窗口"，
 * 收纳时跳过它（避免刚展开就被立刻收回）。
 *
 * @param {{exclude?:HTMLElement}} [opts]
 */
function _reflow(opts = {}) {
    if (!_overlay || !_overlay.isConnected) return;
    const all = [];
    for (const { win } of _windows.values()) {
        if (win && win.isConnected && !win.classList.contains('closing')) all.push(win);
    }
    if (all.length === 0) { _maybeHideOverlay(); return; }

    const vp = getViewportRect();
    // 注意：下界取 40px 而非"恰好放得下一个窗口"，是为了在极端小视口下宁可把窗口缩得很小，
    // 也不让它溢出屏幕（S1/S2 的硬要求：任何情况下都可触达）。
    const availW = Math.max(40, vp.w - MARGIN * 2);
    const availH = Math.max(40, vp.h - MARGIN * 2);
    const sMax = _sMax();

    // ── 粗略指针：空间不足则自动收药丸 ──
    if (isCoarsePointer()) {
        for (let guard = 0; guard <= MAX_WINDOWS; guard++) {
            const items = _arrangementItems(all);
            if (items.length === 0) break;
            const { s } = _solveItems(items, availW, availH, sMax);
            if (s >= MIN_S) break;
            const expanded = all.filter(w =>
                !w.classList.contains('minimized') && !w.classList.contains('maximized'));
            if (expanded.length <= 1) break;
            const victim = expanded.find(w => w !== opts.exclude) || null;
            if (!victim) break;
            _setMinimized(victim, true);
        }
    }

    const items = _arrangementItems(all);
    const solved = _solveItems(items, availW, availH, sMax);
    // 向下取整到 1e-4：宁可略小，也不要因浮点误差溢出可用区
    const s = Math.max(0.05, Math.floor(solved.s * 1e4) / 1e4);

    const cols = Math.max(1, solved.cols);
    _overlay.style.setProperty('--sd-cols', String(cols));
    _overlay.style.setProperty('--sd-s', String(s));
    // 可用区交给 CSS：max-width/max-height 与"最大化"尺寸都必须以**可视视口**为准。
    // 用 100vw/100vh 会取到布局视口（移动端 = 大视口），比真正可见的区域高出一截。
    _overlay.style.setProperty('--sd-avail-w', availW + 'px');
    _overlay.style.setProperty('--sd-avail-h', availH + 'px');
    _overlay.style.display = 'grid';
    _anchorOverlay(vp);

    _placeLastRow(items, cols);
    _clampFreeWindows(vp);
}

/**
 * 末行居中。
 *
 * 网格自动放置会把不满一行的"孤行"贴在最左侧列，视觉上明显偏斜
 * （实测 iPad 竖屏 3 窗口时孤行偏离视口中心 198px）。
 *
 * 单个孤行条目（MAX_WINDOWS=4 时这是唯一会出现的不满行形态：3窗/2列、4窗/3列）
 * 让它横跨所有列并 justify-self:center —— 这是**精确**居中。
 * 仅靠整数列起点做不到：列起点只能对齐到整条轨道，奇数条目放进偶数列必然偏半格。
 *
 * @param {{win:HTMLElement}[]} items 参与排列的条目（DOM 顺序）
 * @param {number} cols 求解出的列数
 */
function _placeLastRow(items, cols) {
    const n = items.length;
    const rows = Math.max(1, Math.ceil(n / cols));
    const lastRowCount = n - (rows - 1) * cols;
    const incomplete = lastRowCount < cols;
    const offset = Math.floor((cols - lastRowCount) / 2);

    items.forEach((it, i) => {
        const slot = it.win && it.win._sdSlot;
        if (!slot) return;
        const inLastRow = Math.floor(i / cols) === rows - 1;
        const orphan = inLastRow && incomplete;
        // 单条目孤行：跨满所有列后居中（精确）
        slot.classList.toggle('sd-slot--orphan', orphan && lastRowCount === 1);
        if (orphan && lastRowCount > 1) {
            slot.style.gridColumnStart = String(offset + (i - (rows - 1) * cols) + 1);
        } else if (slot.style.gridColumnStart) {
            slot.style.gridColumnStart = '';
        }
    });
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

/** ESC 关闭最上层弹窗（按内联 zIndex 判定，不再依赖 DOM 顺序） */
document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || _windows.size === 0) return;
    const top = _topWindow();
    if (top) _closeWindow(top, true);
});

/**
 * 初始化字格点击事件委托。
 */
export function initStrokeDemoClick() {
    const container = document.getElementById('grid-container');
    if (!container) return;
    container.addEventListener('click', (e) => {
        const settings = getSettings();
        if (!settings.showStrokeDemo) return;
        if (e.target.closest('.char-feedback-btn')) return;

        let cell = null;
        if (e.target.closest) {
            cell = e.target.closest('.grid-svg-cell[data-char]');
        }
        if (!cell) {
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
        if (!/[\u4e00-\u9fa5]/.test(ch.charAt(0))) return;
        openStrokeDemo(ch);
    });
}

/**
 * 初始化工具栏"笔顺演示"开关按钮（含数据就绪徽章）。
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

    const settings = getSettings();
    syncState(settings.showStrokeDemo !== false);

    btn.addEventListener('click', () => {
        const current = getSettings().showStrokeDemo !== false;
        updateSetting('showStrokeDemo', !current);
    });

    document.addEventListener('calligraphy:settings-updated', (e) => {
        const s = e.detail || {};
        if ('showStrokeDemo' in s) {
            syncState(s.showStrokeDemo !== false);
        }
    });

    // 数据就绪徽章（小圆点指示器）
    const badge = document.createElement('span');
    badge.className = 'sd-toolbar-badge';
    badge.setAttribute('aria-hidden', 'true');
    btn.appendChild(badge);

    const setBadgeLoading = () => {
        badge.classList.remove('ready');
        badge.classList.add('loading');
    };
    const setBadgeReady = () => {
        badge.classList.remove('loading');
        badge.classList.add('ready');
        setTimeout(() => {
            badge.classList.remove('ready');
        }, 1500);
    };

    if (isReady()) {
        setBadgeReady();
    } else {
        setBadgeLoading();
        hanziDataReady().then(() => {
            setBadgeReady();
        }).catch(() => {
            // 加载失败 — 保持 loading 脉冲，提示数据不可用
        });
    }
}
