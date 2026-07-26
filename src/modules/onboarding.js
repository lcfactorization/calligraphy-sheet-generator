// 移动端首次使用引导 + 滚动边角提示（v2.9.5）
// localStorage keys: onboarding_completed / onboarding_version
// 兼容现有 .puppeteer-toast 机制（fab.css 已定义 .info/.success/.error 变体）
// 防御性编程：每步前检查 document.querySelector(selector) 是否存在且可见（offsetParent !== null），不存在则跳过

import '../styles/onboarding.css';

const OB_COMPLETED_KEY = 'onboarding_completed';
const OB_VERSION_KEY = 'onboarding_version';
const OB_VERSION = 'v2.9.5';

// 引导步骤数据：每项含 selector、title、desc、position、hintCorner
const ONBOARDING_STEPS = [
    {
        selector: '#settingsBtn',
        title: '⚙️ 设置中心',
        desc: '右上角是设置中心，可调整字体、网格类型、颜色、显示开关等。',
        position: 'bottom',
        hintCorner: 'top-right'
    },
    {
        selector: '#printBtn',
        title: '🖨 打印 / 导出 PDF',
        desc: '右下角是主操作按钮，调用浏览器打印生成矢量 PDF。',
        position: 'top',
        hintCorner: 'bottom-right'
    },
    {
        selector: '.sidebar-drawer-toggle',
        title: '☰ 侧栏开关',
        desc: '左下角是侧栏开关，展开后可见更多设置（描红、预设等）。',
        position: 'right',
        hintCorner: 'bottom-left'
    },
    {
        selector: '#themeToggle',
        title: '☀ 主题切换',
        desc: '左上角是主题切换，日间 / 夜间模式一键切换。',
        position: 'bottom',
        hintCorner: 'top-left'
    },
    {
        selector: '#puppeteerBtn',
        title: '⬇ Puppeteer 矢量 PDF',
        desc: '右下角上方是高级导出，需先启动本地 Puppeteer 服务。',
        position: 'left',
        hintCorner: 'bottom-right'
    }
];

// 滚动提示目标（仅核心 3 个控件，避免边角箭头重叠）
const HINT_TARGETS = [
    { selector: '#settingsBtn', corner: 'top-right' },
    { selector: '#printBtn', corner: 'bottom-right' },
    { selector: '.sidebar-drawer-toggle', corner: 'bottom-left' }
];

let currentStep = -1;
let bubbleEl = null;
let highlightEl = null;
let resizeHandler = null; // 当前气泡的 resize 重定位处理器

// 滚动提示状态
const hintsState = {
    observer: null,
    scrollListener: null,
    scrollTimer: null,
    hints: new Map(),        // corner -> hintEl
    elementMap: new WeakMap(), // targetEl -> { selector, corner }
    initialized: false
};

// === 工具函数 ===

function isMobile() {
    return window.matchMedia('(max-width: 680px)').matches;
}

function isCompleted() {
    try {
        return localStorage.getItem(OB_COMPLETED_KEY) === 'true';
    } catch (e) {
        return false;
    }
}

function writeCompleted() {
    try {
        localStorage.setItem(OB_COMPLETED_KEY, 'true');
        localStorage.setItem(OB_VERSION_KEY, OB_VERSION);
    } catch (e) {
        console.warn('[onboarding] 写入 localStorage 失败:', e);
    }
}

// 复用项目现有 .puppeteer-toast 机制（fab.css 已定义样式）
function showToast(msg, type = 'info', duration = 2500) {
    const existing = document.querySelector('.puppeteer-toast.ob-toast');
    if (existing) existing.remove();
    const t = document.createElement('div');
    t.className = 'puppeteer-toast ob-toast ' + type;
    t.style.cssText = 'max-width:90vw;text-align:center;font-size:13px;padding:10px 18px;';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => {
        t.style.opacity = '0';
        setTimeout(() => { if (t.parentNode) t.remove(); }, 300);
    }, duration);
}

// 关闭可能打开的浮层，避免与引导冲突
function closeOtherOverlays() {
    const sc = document.getElementById('settingsPanel');
    if (sc && typeof sc._close === 'function') sc._close();
    const hs = document.getElementById('historySidebar');
    if (hs) hs.classList.remove('open');
    const backdrop = document.querySelector('.sidebar-backdrop');
    if (backdrop) backdrop.classList.remove('show');
    const sb = document.getElementById('appSidebar');
    if (sb) sb.classList.remove('open');
}

// 检查元素是否可见（offsetParent !== null 排除 display:none 与 position:fixed 的祖先隐藏）
// 注意：fixed 元素的 offsetParent 为 null（当祖先无 transform 时），但 fixed FAB 实际可见
// 因此对已知 fixed 的 FAB 用 getBoundingClientRect 判断，对其它用 offsetParent
function isElementVisible(el) {
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return false;
    // FAB 是 position:fixed，offsetParent 为 null 但实际可见
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return false;
    return true;
}

// === 引导浮层 ===

function clearHighlight() {
    if (highlightEl) {
        highlightEl.classList.remove('ob-spotlight');
        highlightEl = null;
    }
}

function clearBubble() {
    if (bubbleEl) {
        bubbleEl.remove();
        bubbleEl = null;
    }
    if (resizeHandler) {
        window.removeEventListener('resize', resizeHandler);
        resizeHandler = null;
    }
}

// 移动端：气泡贴近高亮控件
function positionBubble(target, position) {
    if (!bubbleEl || !target) return;
    const rect = target.getBoundingClientRect();
    const margin = 12;
    // 先让气泡可见以拿到尺寸
    bubbleEl.style.visibility = 'hidden';
    bubbleEl.style.top = '0px';
    bubbleEl.style.left = '0px';
    const bw = bubbleEl.offsetWidth;
    const bh = bubbleEl.offsetHeight;
    let top, left;

    switch (position) {
        case 'top':
            top = rect.top - bh - margin;
            left = rect.left + (rect.width - bw) / 2;
            break;
        case 'bottom':
            top = rect.bottom + margin;
            left = rect.left + (rect.width - bw) / 2;
            break;
        case 'left':
            top = rect.top + (rect.height - bh) / 2;
            left = rect.left - bw - margin;
            break;
        case 'right':
            top = rect.top + (rect.height - bh) / 2;
            left = rect.right + margin;
            break;
        default:
            top = rect.bottom + margin;
            left = rect.left;
    }

    // 边界检查：避免气泡超出视口
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (top < 12) top = 12;
    if (top + bh > vh - 12) top = vh - bh - 12;
    if (left < 12) left = 12;
    if (left + bw > vw - 12) left = vw - bw - 12;

    bubbleEl.style.top = top + 'px';
    bubbleEl.style.left = left + 'px';
    bubbleEl.style.visibility = '';
}

export function showOnboardingStep(stepIndex) {
    // 清理上一步
    clearHighlight();
    clearBubble();

    // 越界检查
    if (stepIndex < 0 || stepIndex >= ONBOARDING_STEPS.length) {
        completeOnboarding();
        return;
    }

    // 防御性编程：跳过目标不存在或不可见的步骤
    // （桌面端 .sidebar-drawer-toggle 是 display:none，会被 isElementVisible 排除）
    let step = ONBOARDING_STEPS[stepIndex];
    let actualIndex = stepIndex;
    while (step) {
        const target = document.querySelector(step.selector);
        if (target && isElementVisible(target)) break;
        console.warn('[onboarding] 步骤 ' + actualIndex + ' 目标 ' + step.selector + ' 不存在或不可见，跳过');
        actualIndex++;
        step = ONBOARDING_STEPS[actualIndex];
    }
    if (!step) {
        completeOnboarding();
        return;
    }
    currentStep = actualIndex;

    const target = document.querySelector(step.selector);
    if (!target) {
        completeOnboarding();
        return;
    }

    // 关闭其他浮层
    closeOtherOverlays();

    // 高亮目标
    target.classList.add('ob-spotlight');
    highlightEl = target;

    // 创建气泡
    const isLast = actualIndex === ONBOARDING_STEPS.length - 1;
    bubbleEl = document.createElement('div');
    bubbleEl.className = 'ob-bubble pos-' + step.position;
    bubbleEl.innerHTML = `
        <div class="ob-bubble-title">${step.title}</div>
        <div class="ob-bubble-desc">${step.desc}</div>
        <div class="ob-bubble-arrow"></div>
        <div class="ob-bubble-actions">
            <span class="ob-bubble-step">${actualIndex + 1} / ${ONBOARDING_STEPS.length}</span>
            <div class="ob-bubble-buttons">
                <button class="ob-btn ob-btn-skip" type="button">跳过引导</button>
                <button class="ob-btn ${isLast ? 'ob-btn-done' : 'ob-btn-next'}" type="button">
                    ${isLast ? '开始使用' : '下一步'}
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(bubbleEl);

    // 移动端：贴近目标定位；桌面端：CSS 强制居中
    if (isMobile()) {
        requestAnimationFrame(() => positionBubble(target, step.position));
        // 旋转屏幕/resize 时重新定位（避免气泡错位）
        resizeHandler = () => {
            if (bubbleEl && highlightEl) positionBubble(highlightEl, step.position);
        };
        window.addEventListener('resize', resizeHandler, { passive: true });
    }

    // 绑定按钮事件
    bubbleEl.querySelector('.ob-btn-skip').addEventListener('click', skipOnboarding);
    const nextBtn = bubbleEl.querySelector(isLast ? '.ob-btn-done' : '.ob-btn-next');
    nextBtn.addEventListener('click', () => {
        if (isLast) {
            completeOnboarding();
        } else {
            showOnboardingStep(actualIndex + 1);
        }
    });

    // 滚动目标到视口（确保可见，FAB 是 fixed 不受影响，但 .sidebar-drawer-toggle 等可能需要）
    try {
        target.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
    } catch (e) { /* 静默失败 */ }
}

export function skipOnboarding() {
    clearHighlight();
    clearBubble();
    writeCompleted();
    showToast('已跳过新手引导，可在设置中心重新查看', 'info', 3000);
    // 跳过也算完成，启用滚动提示
    initScrollHints();
}

export function completeOnboarding() {
    clearHighlight();
    clearBubble();
    writeCompleted();
    showToast('新手引导已完成，开始使用吧！', 'success', 2000);
    initScrollHints();
}

export function initOnboarding() {
    if (isCompleted()) {
        // 老用户：不展示引导
        return;
    }
    // 延迟启动，等待 FAB / 侧栏 / 字体加载完成
    setTimeout(() => {
        showOnboardingStep(0);
    }, 600);
}

export function restartOnboarding() {
    try {
        localStorage.removeItem(OB_COMPLETED_KEY);
        localStorage.removeItem(OB_VERSION_KEY);
    } catch (e) { /* 静默 */ }
    // 销毁滚动提示，避免与引导浮层冲突
    destroyScrollHints();
    showOnboardingStep(0);
}

// === 滚动边角提示 ===

// 根据边角方向生成指向屏幕内部的箭头 SVG
function createHintSVG(corner) {
    const arrows = {
        'top-left': '<svg viewBox="0 0 24 24"><path d="M7 7l10 10"/><path d="M17 17v-6"/><path d="M17 17h-6"/></svg>',
        'top-right': '<svg viewBox="0 0 24 24"><path d="M17 7L7 17"/><path d="M7 17v-6"/><path d="M7 17h6"/></svg>',
        'bottom-left': '<svg viewBox="0 0 24 24"><path d="M7 17l10-10"/><path d="M17 7v6"/><path d="M17 7h-6"/></svg>',
        'bottom-right': '<svg viewBox="0 0 24 24"><path d="M17 17L7 7"/><path d="M7 7v6"/><path d="M7 7h6"/></svg>'
    };
    return arrows[corner] || arrows['top-right'];
}

function createHintEl(corner, selector) {
    const hint = document.createElement('button');
    hint.className = 'ob-hint pos-' + corner;
    hint.type = 'button';
    hint.setAttribute('aria-label', '跳转到控件');
    hint.innerHTML = createHintSVG(corner);
    hint.addEventListener('click', () => {
        const el = document.querySelector(selector);
        if (!el) return;
        el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
        // 临时高亮目标，提示用户
        const origTransition = el.style.transition;
        const origShadow = el.style.boxShadow;
        el.style.transition = 'box-shadow 0.3s';
        el.style.boxShadow = '0 0 0 4px rgba(99,102,241,0.5), 0 0 0 9999px rgba(0,0,0,0.3)';
        setTimeout(() => {
            el.style.boxShadow = origShadow;
            el.style.transition = origTransition;
        }, 1200);
    });
    return hint;
}

function toggleHint(corner, selector, inViewport) {
    let hint = hintsState.hints.get(corner);
    if (!inViewport) {
        if (!hint) {
            hint = createHintEl(corner, selector);
            document.body.appendChild(hint);
            hintsState.hints.set(corner, hint);
            requestAnimationFrame(() => hint.classList.add('show'));
        }
    } else if (hint) {
        hint.classList.remove('show');
        const node = hint;
        setTimeout(() => {
            if (node.parentNode) node.remove();
            if (hintsState.hints.get(corner) === node) hintsState.hints.delete(corner);
        }, 300);
    }
}

// 降级方案：scroll 事件检测（无 IntersectionObserver 时使用）
function updateHintVisibilityFallback() {
    HINT_TARGETS.forEach(({ selector, corner }) => {
        const target = document.querySelector(selector);
        if (!target || !isElementVisible(target)) return;
        const rect = target.getBoundingClientRect();
        // 控件是否在视口内（含容差）
        const inViewport = rect.top >= -rect.height
            && rect.bottom <= window.innerHeight + rect.height
            && rect.left >= -rect.width
            && rect.right <= window.innerWidth + rect.width
            && rect.width > 0 && rect.height > 0;
        toggleHint(corner, selector, inViewport);
    });
}

export function initScrollHints() {
    // 仅当引导完成后才启用（避免与引导浮层冲突）
    if (!isCompleted()) return;
    if (hintsState.initialized) return;
    hintsState.initialized = true;

    // 优先用 IntersectionObserver（性能好）
    if ('IntersectionObserver' in window) {
        hintsState.observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                const info = hintsState.elementMap.get(entry.target);
                if (!info) return;
                toggleHint(info.corner, info.selector, entry.isIntersecting);
            });
        }, {
            root: null,
            rootMargin: '0px',
            threshold: 0.01
        });
        HINT_TARGETS.forEach(({ selector, corner }) => {
            const el = document.querySelector(selector);
            if (el && isElementVisible(el)) {
                hintsState.elementMap.set(el, { selector, corner });
                hintsState.observer.observe(el);
            }
        });
    } else {
        // 降级到 scroll 事件（防抖 100ms）
        hintsState.scrollListener = () => {
            if (hintsState.scrollTimer) clearTimeout(hintsState.scrollTimer);
            hintsState.scrollTimer = setTimeout(updateHintVisibilityFallback, 100);
        };
        window.addEventListener('scroll', hintsState.scrollListener, { passive: true });
        window.addEventListener('resize', hintsState.scrollListener, { passive: true });
        // 初始检测一次
        setTimeout(updateHintVisibilityFallback, 300);
    }
}

export function destroyScrollHints() {
    if (hintsState.observer) {
        hintsState.observer.disconnect();
        hintsState.observer = null;
    }
    if (hintsState.scrollListener) {
        window.removeEventListener('scroll', hintsState.scrollListener);
        window.removeEventListener('resize', hintsState.scrollListener);
        hintsState.scrollListener = null;
    }
    if (hintsState.scrollTimer) {
        clearTimeout(hintsState.scrollTimer);
        hintsState.scrollTimer = null;
    }
    hintsState.hints.forEach(hint => {
        if (hint.parentNode) hint.remove();
    });
    hintsState.hints.clear();
    hintsState.initialized = false;
}
