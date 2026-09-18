// ============================================================================
// deviceEnv.js — 设备 / 视口环境检测（v3.0.4 新增，契约 §3.1）
//
// 设计约束（契约 §3.1 / §5）：
//   - 仅使用 matchMedia / visualViewport / innerWidth（项目既有习惯）
//   - **不做** UA 嗅探（UA 字符串在平板/桌面模式下不可靠）
//   - 无副作用、无 DOM 依赖，可安全被任意模块导入
//
// 用途：笔顺演示弹窗（strokeDemoModal.js）依据"粗略指针"决定缩放上限
//       （触摸设备 sMax=1.6，桌面鼠标 sMax=1.0 → 桌面缩放恒为 1，行为不退化）。
// ============================================================================

/** 视口尺寸去抖时间（毫秒）：resize + orientationchange + visualViewport.resize 聚合 */
const VIEWPORT_DEBOUNCE_MS = 120;

/**
 * 粗略指针（触摸 / 笔）→ true；桌面鼠标 → false。
 *
 * 与 CSS 中的 `@media (hover: none), (pointer: coarse)` 保持同一判定口径：
 * 二者必须一致，否则"JS 认为桌面 / CSS 放大触摸目标"会错位。
 *
 * 注意：带触摸屏的笔记本（鼠标为主指针）→ matchMedia('(pointer: coarse)') 为 false
 *      → 走桌面路径（sMax=1.0），这是刻意的：这类设备上鼠标才是主操作方式。
 *
 * @returns {boolean}
 */
export function isCoarsePointer() {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
    try {
        return window.matchMedia('(pointer: coarse)').matches ||
               window.matchMedia('(hover: none)').matches;
    } catch (e) {
        return false;
    }
}

/**
 * 是否具备触摸能力（maxTouchPoints > 0 或 'ontouchstart' in window）。
 * 与 isCoarsePointer 的区别：本函数在"触摸屏笔记本"上返回 true，
 * 用于需要"有没有手指"而非"主指针是不是手指"的场景。
 * @returns {boolean}
 */
export function isTouchDevice() {
    if (typeof window === 'undefined') return false;
    try {
        if (typeof navigator !== 'undefined' && Number(navigator.maxTouchPoints) > 0) return true;
        return 'ontouchstart' in window;
    } catch (e) {
        return false;
    }
}

/**
 * 当前可视视口尺寸（优先 visualViewport，回退 innerWidth/Height）。
 *
 * 取整为整数像素：小数会在设置 CSS 变量时产生无意义的抖动。
 * 注意：visualViewport 会随双指缩放 / 地址栏收放而变化，
 *      因此布局会随之重解 —— 这是"保证弹窗永远在可视区内"的代价，可接受。
 *
 * @returns {{w:number, h:number}}
 */
export function getViewport() {
    if (typeof window === 'undefined') return { w: 1024, h: 768 };
    const vv = window.visualViewport;
    if (vv && vv.width > 0 && vv.height > 0) {
        return { w: Math.round(vv.width), h: Math.round(vv.height) };
    }
    return {
        w: Math.round(window.innerWidth || 1024),
        h: Math.round(window.innerHeight || 768)
    };
}

/**
 * 可视视口相对布局视口的偏移（双指缩放后平移时非 0）。
 * 无 visualViewport 或未缩放平移时为 {left:0, top:0}。
 * @returns {{left:number, top:number}}
 */
function getViewportOffset() {
    if (typeof window === 'undefined') return { left: 0, top: 0 };
    const vv = window.visualViewport;
    if (vv) {
        return {
            left: Math.round(vv.offsetLeft || 0),
            top: Math.round(vv.offsetTop || 0)
        };
    }
    return { left: 0, top: 0 };
}

/**
 * 订阅视口 / 方向变化（resize + orientationchange + visualViewport.resize + scroll，
 * 120ms 去抖）。返回取消订阅函数。
 *
 * v3.0.4 修复：原先只比较宽高，因此**纯平移**（双指缩放后拖动画面，
 * offsetLeft/Top 变化而宽高不变）不会触发回调，弹窗可能被可视视口边缘裁切。
 * 现在偏移量也纳入变化判定 —— 尺寸未变但偏移变了同样会通知调用方重排。
 *
 * @param {(vp:{w:number,h:number}) => void} cb 回调只接收宽高；
 *        偏移变化时也会触发（宽高与上次相同），调用方据此重排并重新约束位置即可。
 * @returns {() => void} 取消订阅
 */
export function onViewportChange(cb) {
    if (typeof window === 'undefined' || typeof cb !== 'function') return () => {};

    let timer = 0;
    let last = { ...getViewport(), ...getViewportOffset() };
    let disposed = false;

    const fire = () => {
        timer = 0;
        if (disposed) return;
        const vp = getViewport();
        const off = getViewportOffset();
        // 宽高与偏移都没变：不惊动调用方
        if (vp.w === last.w && vp.h === last.h && off.left === last.left && off.top === last.top) return;
        last = { ...vp, ...off };
        try { cb(vp); } catch (e) { console.warn('[deviceEnv] onViewportChange 回调异常:', e); }
    };

    const schedule = () => {
        if (disposed) return;
        if (timer) clearTimeout(timer);
        timer = setTimeout(fire, VIEWPORT_DEBOUNCE_MS);
    };

    window.addEventListener('resize', schedule);
    window.addEventListener('orientationchange', schedule);
    const vv = window.visualViewport;
    if (vv && typeof vv.addEventListener === 'function') {
        vv.addEventListener('resize', schedule);
        // 纯平移由 scroll 事件上报（visualViewport 不派发 resize）
        vv.addEventListener('scroll', schedule);
    }

    return () => {
        disposed = true;
        if (timer) { clearTimeout(timer); timer = 0; }
        window.removeEventListener('resize', schedule);
        window.removeEventListener('orientationchange', schedule);
        if (vv && typeof vv.removeEventListener === 'function') {
            vv.removeEventListener('resize', schedule);
            vv.removeEventListener('scroll', schedule);
        }
    };
}
