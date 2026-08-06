// 移动端首次使用引导 + 滚动边角提示（v2.9.5）
// localStorage keys: onboarding_completed / onboarding_version
// 兼容现有 .puppeteer-toast 机制（fab.css 已定义 .info/.success/.error 变体）
// 防御性编程：每步前检查 document.querySelector(selector) 是否存在且可见（offsetParent !== null），不存在则跳过
//
// v2.9.8 更新：
//   - 修正位置描述错误（theme/puppeteer 实际在右上角，非左上角/右下角上方）
//   - 添加 autoOpen 字段：介绍侧栏内部控件时主动打开抽屉（移动端），介绍历史记录时主动打开右侧栏
//   - 添加 tooltipText 字段：在气泡中显示控件鼠标悬停时的简短说明（即 title 属性内容）
//   - 新增侧栏内部控件引导步骤（网格类型、描红透明度、颜色预设、预设场景）
//   - 新增历史记录侧栏引导步骤
//   - 新增"笔顺演示介绍页"跳转步骤
// v2.9.9 更新：
//   - 新增 AI 组词补齐引导步骤（autoOpen: 'settings'，主动打开设置面板）
//   - 强调 AI 回答的概率属性：一次补齐未必能覆盖全部缺失字，多重复点击几次可逐步补齐

import '../styles/onboarding.css';
// v2.9.9：静态导入 openSettings（settingsCenter 仅动态 import onboarding，无静态循环依赖）
import { openSettings } from './settingsCenter.js';

const OB_COMPLETED_KEY = 'onboarding_completed';
const OB_VERSION_KEY = 'onboarding_version';
// v2.9.7：用户主动选择"不再弹出"。默认每次访问都自动弹出引导，
// 除非用户在引导浮层勾选"不再自动弹出"或在设置中心关闭"启动时自动显示"
const OB_NEVER_SHOW_KEY = 'onboarding_never_show';
const OB_VERSION = 'v2.9.9';

// 引导步骤数据：每项含 selector、title、desc、position、hintCorner
// v2.9.7：标注每个控件是否触发字帖自动刷新（🔄自动刷新 / ✋需手动点"生成"）
// v2.9.8：新增 autoOpen（'sidebar' / 'history' / null）和 tooltipText 字段
// v2.9.9：新增 autoOpen: 'settings'（主动打开设置面板，介绍 AI 组词补齐）
const ONBOARDING_STEPS = [
    {
        selector: '#settingsBtn',
        title: '⚙️ 设置中心 🔄',
        desc: '右上角是设置中心，可调整网格类型、颜色、显示开关等。改完关闭面板即自动刷新字帖，无需手动点"生成"。',
        tooltipText: '设置中心',
        position: 'bottom',
        hintCorner: 'top-right',
        autoOpen: null
    },
    {
        selector: '#themeToggle',
        title: '☀ 主题切换',
        desc: '右上角设置按钮下方是主题切换，日间 / 夜间模式一键切换。不影响字帖内容，范字颜色会随主题自动反色。',
        tooltipText: '点击切换日间/夜间模式',
        position: 'bottom',
        hintCorner: 'top-right',
        autoOpen: null
    },
    {
        selector: '#puppeteerBtn',
        title: '⬇ Puppeteer 矢量 PDF',
        desc: '右上角主题按钮下方是高级导出，需先启动本地 Puppeteer 服务。不会刷新字帖，直接导出当前预览。',
        tooltipText: 'Puppeteer 矢量PDF（需先启动本地服务）',
        position: 'left',
        hintCorner: 'top-right',
        autoOpen: null
    },
    {
        selector: '#printBtn',
        title: '🖨 打印 / 导出 PDF',
        desc: '右下角是主操作按钮，调用浏览器打印生成矢量 PDF。不会刷新字帖，直接打印当前预览。',
        tooltipText: '打印 / 导出PDF（矢量PDF）',
        position: 'top',
        hintCorner: 'bottom-right',
        autoOpen: null
    },
    {
        selector: '#historyFab',
        title: '📋 历史记录',
        desc: '左下角是历史记录入口，点击打开右侧边栏，可查看最近输入过的汉字、字体、字帖设置，一键恢复。',
        tooltipText: '历史记录',
        position: 'right',
        hintCorner: 'bottom-left',
        autoOpen: null
    },
    {
        selector: '.sidebar-drawer-toggle',
        title: '☰ 侧栏开关 🔄',
        desc: '移动端左下角是侧栏开关（桌面端不显示此按钮，左侧栏始终可见），展开后可见网格类型、描红透明度、颜色预设、预设场景等。预设场景切换会自动刷新字帖。',
        tooltipText: '打开侧栏',
        position: 'right',
        hintCorner: 'bottom-left',
        autoOpen: null
    },
    {
        selector: '#font-select',
        title: '🔤 字体选择 ✋',
        desc: '输入区上方是字体下拉框，可在霞鹜文楷、思源宋体等字体间切换。切换后需手动点"生成"或"🔄"按钮才生效。',
        tooltipText: '字体',
        position: 'bottom',
        hintCorner: 'top-right',
        autoOpen: null
    },
    {
        selector: '.font-upload-btn',
        title: '⬆ 自定义字体 ✋',
        desc: '字体下拉框右侧的上传按钮，支持 ttf/otf/woff/woff2 格式。加载后需手动点"生成"才生效。',
        tooltipText: '添加自己的字体文件（支持 ttf/otf/woff/woff2 格式，加载后可在字体下拉框中选择）',
        position: 'bottom',
        hintCorner: 'top-right',
        autoOpen: null
    },
    {
        selector: '#strokeDemoToolbarBtn',
        title: '✍️ 笔顺演示',
        desc: '工具栏"笔顺演示"按钮（默认开启，显示橙色高亮，点击切换为关闭灰色）。开启后点击任意汉字方格弹出动态演示窗口：汉字黑色、偏旁红色，未播放时 0.25 透明轮廓始终显示，点击"▶ 播放"逐笔演示，速度可调。内置 9574 字离线数据，无需联网；冷僻字联网时自动从网络备选加载并缓存。最多同时 4 个弹窗，相同字点击切换到已有弹窗。',
        tooltipText: '点击单字动态演示笔画笔顺（当前：开启，点击切换为关闭）',
        position: 'bottom',
        hintCorner: 'top-right',
        autoOpen: null
    },
    {
        selector: '#recommendBtn',
        title: '✨ 智能推荐 ✋',
        desc: '输入框下方按钮行最左侧是智能推荐，含按难度/主题/场景三个维度（离线规则，非 AI）。单字点击追加到输入框尾部，模板点击覆盖原内容。改完输入框不会自动刷新字帖，需手动点"生成"或"🔄"按钮。不影响任何设置（网格/颜色/字体等都不动）。',
        tooltipText: 'AI 智能推荐汉字与模板',
        position: 'top',
        hintCorner: 'bottom-left',
        autoOpen: null
    },
    {
        selector: '#fileImportBtn',
        title: '📁 导入生词文件 ✋',
        desc: '输入框下方按钮行中间是文件导入按钮，支持 txt/md/csv/xlsx/docx 格式，自动提取汉字填入输入框。填入后不会自动刷新字帖，需手动点"生成"或"🔄"按钮。',
        tooltipText: '导入 txt/md/csv/xlsx/docx 文件到输入框',
        position: 'top',
        hintCorner: 'bottom-left',
        autoOpen: null
    },
    // ── 侧栏内部控件（autoOpen: 'sidebar'，移动端会主动打开抽屉） ──
    {
        selector: '.grid-type-group',
        title: '📐 网格类型 🔄',
        desc: '左侧栏的"网格类型"切换组，支持田字格 / 米字格 / 九宫格 / 回字格 / 拼音田五种字格。点击立即刷新字帖。',
        tooltipText: '点击切换字格类型',
        position: 'right',
        hintCorner: 'top-left',
        autoOpen: 'sidebar'
    },
    {
        selector: '.opacity-slider-wrap',
        title: '🖌️ 描红透明度 🔄',
        desc: '左侧栏的"描红透明度"滑块，调整字帖中范字的透明度（0.05 ~ 0.30）。拖动立即刷新字帖。',
        tooltipText: '描红透明度',
        position: 'right',
        hintCorner: 'top-left',
        autoOpen: 'sidebar'
    },
    {
        selector: '.color-preset-group',
        title: '🎨 线框颜色 🔄',
        desc: '左侧栏的"线框颜色"快切，支持传统绿 / 朱砂红 / 靛青蓝 / 墨黑四种配色。点击立即刷新字帖（页眉页脚颜色同步）。',
        tooltipText: '点击切换线框颜色',
        position: 'right',
        hintCorner: 'top-left',
        autoOpen: 'sidebar'
    },
    {
        selector: '.preset-list',
        title: '📚 预设场景 🔄',
        desc: '左侧栏底部是"预设场景"列表，按年级 / 主题 / 场景分类。点击模板自动填入输入框并生成字帖。',
        tooltipText: '点击应用预设场景',
        position: 'right',
        hintCorner: 'top-left',
        autoOpen: 'sidebar'
    },
    // ── 历史记录侧栏（autoOpen: 'history'，会主动打开右侧栏） ──
    {
        selector: '#historySidebar',
        title: '📋 历史记录详情',
        desc: '右侧边栏显示最近输入过的汉字记录，包含输入内容、字体、时间。点击任意记录可一键恢复，底部"清空全部"可清除全部历史。历史记录保存在 localStorage 中，离线可用。',
        tooltipText: '历史记录侧边栏',
        position: 'left',
        hintCorner: 'top-right',
        autoOpen: 'history'
    },
    // ── v2.9.9 新增：AI 组词补齐（autoOpen: 'settings'，主动打开设置面板） ──
    {
        selector: '#scAiZuci',
        title: '🤖 AI 组词补齐（可选）',
        desc: '设置中心内的"AI 组词补齐"区域。字帖中每个汉字会配 2 个二字组词，默认由 cnchar 词库 + 自定义词库提供；对个别默认词库没有合适二字组词的汉字（会显示"组词"占位），可启用此功能调用 DeepSeek 大模型补齐，同时核对并纠正拼音（特别是多音字）。启用后填入 API Key，点"▶ 补齐组词"即可，结果缓存在本地 localStorage 下次直接使用，纠错后的拼音会自动替换字帖中的原拼音。⚠️ 注意：因 AI 回答具有概率属性，少数情形下一次补齐未必能覆盖全部缺失的字；这时多重复点击几次"补齐组词"按钮，大概率能逐步补齐全部词组。API Key 仅存本地，不上传。',
        tooltipText: 'AI 组词补齐（可选，需 DeepSeek API Key）',
        position: 'left',
        hintCorner: 'top-right',
        autoOpen: 'settings'
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

// v2.9.7：是否应该自动弹出引导（默认弹出，除非用户勾选"不再弹出"）
function shouldShowOnboarding() {
    try {
        return localStorage.getItem(OB_NEVER_SHOW_KEY) !== 'true';
    } catch (e) {
        return true;
    }
}

export function isNeverShow() {
    try {
        return localStorage.getItem(OB_NEVER_SHOW_KEY) === 'true';
    } catch (e) {
        return false;
    }
}

export function setNeverShow(never) {
    try {
        if (never) {
            localStorage.setItem(OB_NEVER_SHOW_KEY, 'true');
        } else {
            localStorage.removeItem(OB_NEVER_SHOW_KEY);
        }
    } catch (e) {
        console.warn('[onboarding] 写入 localStorage 失败:', e);
    }
}

// 从当前气泡复选框读取"不再弹出"选择
function getNeverShowFromBubble() {
    const cb = bubbleEl && bubbleEl.querySelector('.ob-nevershow-cb');
    return !!(cb && cb.checked);
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

// v2.9.8：根据 step.autoOpen 主动打开隐藏的浮层（移动端抽屉 / 历史记录侧栏）
// 解决问题：移动端触屏介绍左侧栏内部控件时，抽屉默认隐藏，需主动打开才能高亮被介绍的控件
// v2.9.9：新增 autoOpen: 'settings'，主动打开设置面板以介绍 AI 组词补齐
function openAutoOverlay(autoOpen) {
    if (autoOpen === 'sidebar') {
        const sb = document.getElementById('appSidebar');
        if (sb) {
            sb.classList.add('open');
            // 显示遮罩（与 Sidebar.js openDrawer 一致）
            const backdrop = document.querySelector('.sidebar-backdrop');
            if (backdrop) backdrop.classList.add('show');
            // 同步抽屉切换按钮文本（若存在）
            const toggle = document.querySelector('.sidebar-drawer-toggle');
            if (toggle) {
                toggle.textContent = '✕';
                toggle.setAttribute('aria-label', '关闭侧栏');
                toggle.title = '关闭侧栏';
            }
        }
    } else if (autoOpen === 'history') {
        const hs = document.getElementById('historySidebar');
        if (hs) hs.classList.add('open');
    } else if (autoOpen === 'settings') {
        // v2.9.9：打开设置面板（若已存在直接 _open，避免 openSettings 重建面板导致 target 引用失效）
        const panel = document.getElementById('settingsPanel');
        if (panel && typeof panel._open === 'function') {
            panel._open();
        } else if (typeof openSettings === 'function') {
            openSettings();
        }
    }
}

// v2.9.8：关闭由 autoOpen 打开的浮层（切换步骤或结束时调用）
function closeAutoOverlay(autoOpen) {
    if (autoOpen === 'sidebar') {
        const sb = document.getElementById('appSidebar');
        if (sb) sb.classList.remove('open');
        const backdrop = document.querySelector('.sidebar-backdrop');
        if (backdrop) backdrop.classList.remove('show');
        const toggle = document.querySelector('.sidebar-drawer-toggle');
        if (toggle) {
            toggle.textContent = '☰';
            toggle.setAttribute('aria-label', '打开侧栏');
            toggle.title = '打开侧栏';
        }
    } else if (autoOpen === 'history') {
        const hs = document.getElementById('historySidebar');
        if (hs) hs.classList.remove('open');
    } else if (autoOpen === 'settings') {
        // v2.9.9：关闭设置面板（通过面板自带的 _close 方法）
        const panel = document.getElementById('settingsPanel');
        if (panel && typeof panel._close === 'function') panel._close();
    }
}

// 记录当前步骤的 autoOpen 状态，便于切换/结束时清理
let _currentAutoOpen = null;

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
    // v2.9.8：先关闭上一步通过 autoOpen 打开的浮层
    if (_currentAutoOpen) {
        closeAutoOverlay(_currentAutoOpen);
        _currentAutoOpen = null;
    }
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
    // v2.9.8：对于 autoOpen='sidebar'/'history' 的步骤，先打开浮层再检测可见性
    let step = ONBOARDING_STEPS[stepIndex];
    let actualIndex = stepIndex;
    while (step) {
        // 对于需要 autoOpen 的步骤，先临时打开浮层以检测目标可见性
        if (step.autoOpen) openAutoOverlay(step.autoOpen);
        const target = document.querySelector(step.selector);
        if (target && isElementVisible(target)) break;
        console.warn('[onboarding] 步骤 ' + actualIndex + ' 目标 ' + step.selector + ' 不存在或不可见，跳过');
        // 跳过前关闭刚打开的浮层
        if (step.autoOpen) closeAutoOverlay(step.autoOpen);
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
        if (step.autoOpen) closeAutoOverlay(step.autoOpen);
        completeOnboarding();
        return;
    }

    // v2.9.8：关闭其他浮层（避免与引导冲突），但保留当前步骤需要的 autoOpen 浮层
    // 先关闭所有，再重新打开当前的
    closeOtherOverlays();
    if (step.autoOpen) {
        openAutoOverlay(step.autoOpen);
        _currentAutoOpen = step.autoOpen;
    }

    // 高亮目标
    target.classList.add('ob-spotlight');
    highlightEl = target;

    // 创建气泡
    const isLast = actualIndex === ONBOARDING_STEPS.length - 1;
    bubbleEl = document.createElement('div');
    bubbleEl.className = 'ob-bubble pos-' + step.position;

    // v2.9.8：构建 tooltip 显示区块（鼠标悬停状态的文字说明）
    const tooltipHtml = step.tooltipText
        ? `<div class="ob-bubble-tooltip"><span class="ob-tooltip-label">悬停说明：</span><span class="ob-tooltip-text">${step.tooltipText}</span></div>`
        : '';

    // v2.9.8：判断是否为"笔顺演示"步骤，添加"查看详细介绍页"按钮
    const isStrokeDemoStep = step.selector === '#strokeDemoToolbarBtn';
    const guideBtnHtml = isStrokeDemoStep
        ? `<button class="ob-btn ob-btn-guide" type="button" title="打开笔顺演示功能详细介绍页面">📖 查看详细介绍</button>`
        : '';

    bubbleEl.innerHTML = `
        <div class="ob-bubble-title">${step.title}</div>
        <div class="ob-bubble-desc">${step.desc}</div>
        ${tooltipHtml}
        <div class="ob-bubble-arrow"></div>
        <div class="ob-bubble-actions">
            <span class="ob-bubble-step">${actualIndex + 1} / ${ONBOARDING_STEPS.length}</span>
            <div class="ob-bubble-buttons">
                ${guideBtnHtml}
                <button class="ob-btn ob-btn-skip" type="button">跳过引导</button>
                <button class="ob-btn ${isLast ? 'ob-btn-done' : 'ob-btn-next'}" type="button">
                    ${isLast ? '开始使用' : '下一步'}
                </button>
            </div>
        </div>
        <label class="ob-bubble-nevershow" title="勾选后下次访问不再自动弹出引导">
            <input type="checkbox" class="ob-nevershow-cb" />
            <span>不再自动弹出</span>
        </label>
    `;
    document.body.appendChild(bubbleEl);

    // v2.9.8：绑定"查看详细介绍"按钮（跳转到独立介绍页）
    if (isStrokeDemoStep) {
        const guideBtn = bubbleEl.querySelector('.ob-btn-guide');
        if (guideBtn) {
            guideBtn.addEventListener('click', () => {
                // 在新标签页打开介绍页，保留当前字帖状态
                window.open('/stroke-demo-guide.html', '_blank');
            });
        }
    }

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
    // v2.9.8：对 autoOpen 打开的浮层，延迟滚动以确保浮层动画完成
    setTimeout(() => {
        try {
            target.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
        } catch (e) { /* 静默失败 */ }
    }, step.autoOpen ? 300 : 0);
}

export function skipOnboarding() {
    const never = getNeverShowFromBubble();
    // v2.9.8：关闭由 autoOpen 打开的浮层
    if (_currentAutoOpen) {
        closeAutoOverlay(_currentAutoOpen);
        _currentAutoOpen = null;
    }
    clearHighlight();
    clearBubble();
    if (never) setNeverShow(true);
    writeCompleted();
    showToast(never ? '已跳过新手引导，下次不再自动弹出' : '已跳过新手引导，可在设置中心重新查看', 'info', 3000);
    // 跳过也算完成，启用滚动提示
    initScrollHints();
}

export function completeOnboarding() {
    const never = getNeverShowFromBubble();
    // v2.9.8：关闭由 autoOpen 打开的浮层
    if (_currentAutoOpen) {
        closeAutoOverlay(_currentAutoOpen);
        _currentAutoOpen = null;
    }
    clearHighlight();
    clearBubble();
    if (never) setNeverShow(true);
    writeCompleted();
    showToast(never ? '新手引导已完成，下次不再自动弹出' : '新手引导已完成，开始使用吧！', 'success', 2000);
    initScrollHints();
}

export function initOnboarding() {
    // v2.9.7：默认每次访问都自动弹出，除非用户主动勾选"不再弹出"
    if (!shouldShowOnboarding()) {
        // 用户选择不再弹出：若曾完成过引导，启用滚动提示
        if (isCompleted()) initScrollHints();
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
        // v2.9.7：重新查看时清除"不再弹出"标记，否则下次访问仍不弹
        localStorage.removeItem(OB_NEVER_SHOW_KEY);
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
