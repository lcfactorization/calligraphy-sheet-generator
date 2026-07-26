// src/modules/fabDrag.js
// v2.9.5：桌面端 FAB 拖拽功能
// 技术方案：原生 JS + Pointer Events + 5px 位移阈值防误触
// 启用条件：window.matchMedia('(min-width: 681px)').matches
// 位置持久化：localStorage key = calligraphy_fab_positions
// 注意：不替代 FAB 现有 click 事件，仅通过位移阈值区分 click/drag

const STORAGE_KEY = 'calligraphy_fab_positions';
const DRAG_THRESHOLD = 5;     // 位移阈值 px，< 5px 视为 click
const EDGE_MARGIN = 8;        // 视口安全边距 px
const GRID_SIZE = 8;          // 拖拽结束时吸附网格

// 所有可拖拽 FAB 的选择器（class 名同时作为 localStorage 的 key）
const FAB_SELECTORS = [
    '.fab-settings',
    '.fab-theme',
    '.fab-puppeteer',
    '.fab-print',
    '.history-fab'
];

// 状态
let mqDesktop = null;             // matchMedia 句柄
let resizeListenerBound = false;
let enabled = false;              // 当前是否已启用拖拽
const dragState = new WeakMap();  // 每个元素的拖拽状态

// ───────────────────────── 工具函数 ─────────────────────────

/** 从元素 classList 中提取 FAB 标识 key（如 'fab-settings' / 'history-fab'） */
function getFabKey(el) {
    for (const cls of el.classList) {
        if (FAB_SELECTORS.includes('.' + cls)) return cls;
    }
    return null;
}

/** 读取所有 FAB 持久化位置 */
function loadPositions() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        return (parsed && typeof parsed === 'object') ? parsed : {};
    } catch (e) {
        console.warn('[fabDrag] 位置存储读取失败，已忽略:', e);
        return {};
    }
}

/** 保存单个 FAB 位置 */
function savePosition(key, left, top) {
    if (!key) return;
    const all = loadPositions();
    all[key] = { left, top };
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
    } catch (e) {
        console.warn('[fabDrag] 位置存储失败:', e);
    }
}

/** 清除所有 FAB 位置 */
function clearAllPositions() {
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* noop */ }
}

/** 数值边界约束 */
function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

/** 应用 left/top，同时清除 right/bottom（避免双定位冲突） */
function applyLeftTop(el, left, top) {
    el.style.right = 'auto';
    el.style.bottom = 'auto';
    el.style.left = left + 'px';
    el.style.top = top + 'px';
}

/** 吸附到 8px 网格 */
function snapToGrid(value) {
    return Math.round(value / GRID_SIZE) * GRID_SIZE;
}

/** 视口边界约束（基于元素当前 offset 尺寸） */
function clampToViewport(left, top, el) {
    const maxX = window.innerWidth - el.offsetWidth - EDGE_MARGIN;
    const maxY = window.innerHeight - el.offsetHeight - EDGE_MARGIN;
    return {
        left: clamp(left, EDGE_MARGIN, Math.max(EDGE_MARGIN, maxX)),
        top: clamp(top, EDGE_MARGIN, Math.max(EDGE_MARGIN, maxY))
    };
}

// ───────────────────────── 拖拽状态 ─────────────────────────

function createDragState() {
    return {
        pointerId: null,
        startX: 0,
        startY: 0,
        originLeft: 0,
        originTop: 0,
        isDragging: false
    };
}

// ───────────────────────── Pointer 事件处理 ─────────────────────────

function onPointerDown(e) {
    // 鼠标右键/中键不响应（pointerType === 'mouse' 时校验 button）
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const el = e.currentTarget;
    let st = dragState.get(el);
    if (!st) {
        st = createDragState();
        dragState.set(el, st);
    }
    st.pointerId = e.pointerId;
    st.startX = e.clientX;
    st.startY = e.clientY;
    // 记录拖拽起始时元素相对于视口的实际位置
    const rect = el.getBoundingClientRect();
    st.originLeft = rect.left;
    st.originTop = rect.top;
    st.isDragging = false;
    // 捕获指针，确保 pointermove/up 即使移出元素也能持续接收
    try { el.setPointerCapture(e.pointerId); } catch (_) { /* noop */ }
}

function onPointerMove(e) {
    const el = e.currentTarget;
    const st = dragState.get(el);
    if (!st || st.pointerId !== e.pointerId) return;

    const dx = e.clientX - st.startX;
    const dy = e.clientY - st.startY;

    // 阈值判断：累计位移 < 5px 时仍视为 click，不进入拖拽
    if (!st.isDragging) {
        if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
        // 首次超过阈值：切换定位体系（从 right/top → left/top，基于当前 rect 不会跳变）
        st.isDragging = true;
        el.classList.add('dragging');
        applyLeftTop(el, st.originLeft, st.originTop);
    }

    // 边界约束 + 应用新位置
    const { left, top } = clampToViewport(st.originLeft + dx, st.originTop + dy, el);
    el.style.left = left + 'px';
    el.style.top = top + 'px';
}

function onPointerUp(e) {
    const el = e.currentTarget;
    const st = dragState.get(el);
    if (!st || st.pointerId !== e.pointerId) return;
    try { el.releasePointerCapture(e.pointerId); } catch (_) { /* noop */ }

    if (st.isDragging) {
        // 吸附到 8px 网格（视觉整齐）
        const rect = el.getBoundingClientRect();
        const { left, top } = clampToViewport(
            snapToGrid(rect.left),
            snapToGrid(rect.top),
            el
        );
        el.style.left = left + 'px';
        el.style.top = top + 'px';

        // 持久化
        savePosition(getFabKey(el), left, top);

        // 关键：阻止紧随其后的 click 事件触发按钮原有行为
        // 在捕获阶段 once 拦截，避免影响后续正常 click
        suppressNextClick(el);

        // 移除 .dragging 类（用 rAF 让 scale(1.05) → 1 的过渡有动效）
        requestAnimationFrame(() => el.classList.remove('dragging'));
    }

    st.isDragging = false;
    st.pointerId = null;
}

/**
 * 拦截下一次 click 事件（捕获阶段，once）
 * 用于拖拽结束后防止误触发按钮的 click 行为
 */
function suppressNextClick(el) {
    const handler = (e) => {
        e.stopPropagation();
        e.preventDefault();
    };
    el.addEventListener('click', handler, { capture: true, once: true });
    // 兜底：150ms 后强制移除（防止某些环境 click 未触发导致监听器残留）
    setTimeout(() => el.removeEventListener('click', handler, true), 150);
}

// ───────────────────────── 对外 API ─────────────────────────

/**
 * 给单个 FAB 启用拖拽
 * @param {HTMLElement} el
 * @param {object} [options] 预留扩展位
 */
export function enableDragFor(el, options = {}) {
    if (!el || el._fabDragEnabled) return;
    el._fabDragEnabled = true;
    el.classList.add('draggable');
    dragState.set(el, createDragState());
    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('pointermove', onPointerMove);
    el.addEventListener('pointerup', onPointerUp);
    el.addEventListener('pointercancel', onPointerUp);

    // 应用持久化位置（如有）
    const key = getFabKey(el);
    if (!key) return;
    const positions = loadPositions();
    const pos = positions[key];
    if (pos && Number.isFinite(pos.left) && Number.isFinite(pos.top)) {
        const { left, top } = clampToViewport(pos.left, pos.top, el);
        applyLeftTop(el, left, top);
    }
}

/**
 * 禁用单个 FAB 拖拽，清除内联定位，恢复 CSS 默认布局
 */
export function disableDragFor(el) {
    if (!el || !el._fabDragEnabled) return;
    el._fabDragEnabled = false;
    el.classList.remove('draggable');
    el.classList.remove('dragging');
    // 清除内联定位，让 CSS（top/right 或 bottom/right）接管
    el.style.left = '';
    el.style.top = '';
    el.style.right = '';
    el.style.bottom = '';
    el.removeEventListener('pointerdown', onPointerDown);
    el.removeEventListener('pointermove', onPointerMove);
    el.removeEventListener('pointerup', onPointerUp);
    el.removeEventListener('pointercancel', onPointerUp);
    dragState.delete(el);
}

/**
 * 重置所有 FAB 到默认位置（清 localStorage + 清内联样式）
 * 调用后需刷新页面或重新启用拖拽以应用默认布局
 */
export function resetFabPositions() {
    clearAllPositions();
    FAB_SELECTORS.forEach(sel => {
        document.querySelectorAll(sel).forEach(el => {
            el.style.left = '';
            el.style.top = '';
            el.style.right = '';
            el.style.bottom = '';
            el.classList.remove('dragging');
            // 如果当前已启用拖拽，重新走一次 enableDragFor（不会应用任何位置，因 localStorage 已清）
            if (el._fabDragEnabled && mqDesktop && mqDesktop.matches) {
                disableDragFor(el);
                enableDragFor(el);
            }
        });
    });
}

// ───────────────────────── 全局启停 ─────────────────────────

function enableAll() {
    FAB_SELECTORS.forEach(sel => {
        document.querySelectorAll(sel).forEach(el => enableDragFor(el));
    });
    enabled = true;
}

function disableAll() {
    FAB_SELECTORS.forEach(sel => {
        document.querySelectorAll(sel).forEach(el => disableDragFor(el));
    });
    enabled = false;
}

// ───────────────────────── resize / 断点切换 ─────────────────────────

let resizeRafId = 0;
function onResize() {
    // 用 rAF 节流，避免 resize 高频触发
    if (resizeRafId) cancelAnimationFrame(resizeRafId);
    resizeRafId = requestAnimationFrame(() => {
        resizeRafId = 0;
        const isDesktop = mqDesktop.matches;
        if (isDesktop && !enabled) {
            enableAll();
        } else if (!isDesktop && enabled) {
            // 窗口缩小到移动端：禁用拖拽并恢复 CSS 默认布局
            disableAll();
        } else if (isDesktop && enabled) {
            // 桌面端窗口尺寸变化：仅 clamp 超出视口的 FAB（不重置已存储位置）
            FAB_SELECTORS.forEach(sel => {
                document.querySelectorAll(sel).forEach(el => {
                    const rect = el.getBoundingClientRect();
                    const { left, top } = clampToViewport(rect.left, rect.top, el);
                    if (Math.abs(left - rect.left) > 1 || Math.abs(top - rect.top) > 1) {
                        applyLeftTop(el, left, top);
                    }
                });
            });
        }
    });
}

// ───────────────────────── 主入口 ─────────────────────────

/**
 * 初始化桌面端 FAB 拖拽
 * 仅在 (min-width: 681px) 匹配时启用；监听断点变化自动启停
 */
export function initFabDrag() {
    if (typeof window === 'undefined') return;
    mqDesktop = window.matchMedia('(min-width: 681px)');

    if (mqDesktop.matches) {
        // 等 DOM 渲染完成后再启用，确保 offsetWidth/Height 准确
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', enableAll, { once: true });
        } else {
            requestAnimationFrame(enableAll);
        }
    }

    if (!resizeListenerBound) {
        // 断点变化（681px 临界）→ 启停切换
        mqDesktop.addEventListener('change', onResize);
        // 窗口尺寸变化 → clamp 越界 FAB
        window.addEventListener('resize', onResize, { passive: true });
        resizeListenerBound = true;
    }
}
