let isDark = false;

// Lucide 图标（太阳/月亮）—— 用于主题切换按钮
// 太阳图标（夜间模式时显示，点击切换到日间）
const sunIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>';
// 月亮图标（日间模式时显示，点击切换到夜间）
const moonIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>';

export function applyTheme() {
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
    const btn = document.getElementById('themeToggle');
    btn.innerHTML = isDark ? sunIcon : moonIcon;
    btn.title = isDark ? '点击切换日间模式' : '点击切换夜间模式';
}

/**
 * v2.7.0：切换主题并同步到 localStorage
 * 修复：fab-theme 按钮切换主题后不保存到 localStorage，导致页面刷新后主题丢失
 * 同时清除 'system' 主题监听（用户手动切换表示要覆盖系统主题）
 */
export function toggleTheme() {
    isDark = !isDark;
    applyTheme();
    // 同步主题到 localStorage（与 settingsCenter 使用相同的 key）
    try {
        const KEY = 'calligraphy_settings';
        const raw = localStorage.getItem(KEY);
        const settings = raw ? JSON.parse(raw) : {};
        settings.theme = isDark ? 'dark' : 'light';
        localStorage.setItem(KEY, JSON.stringify(settings));
    } catch (e) { /* 静默降级 */ }
}

// v2.7.1：字数上限从 200 扩展到 330（约 30 页，推荐上限）
// 超过 330 仍可输入（不强制截断），仅显示警告样式 + toast 提示
// 硬限制 1000 字（与 textarea maxlength="1000" 一致），超过显示错误样式
const RECOMMENDED_LIMIT = 330;
const HARD_LIMIT = 1000;
let prevLen = 0;

export function updateCharCounter() {
    const input = document.getElementById('inputText');
    const counter = document.getElementById('charCounter');
    // v2.8.2：字数计数器基于过滤后字数（仅汉字）
    // 用户原则：字帖里用不上标点/字母/数字等符号，计数应反映实际渲染的汉字数
    const raw = input.value || '';
    const filtered = (raw.match(/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/g) || []).join('');
    const len = filtered.length;
    counter.textContent = len + ' / ' + RECOMMENDED_LIMIT;
    // 三级样式：正常 / 警告（>330）/ 错误（>1000）
    counter.classList.toggle('over', len > HARD_LIMIT);
    counter.classList.toggle('warn', len > RECOMMENDED_LIMIT && len <= HARD_LIMIT);
    // 跨越 330 推荐上限时提示一次（仅向上跨越触发，避免每次按键都弹）
    if (prevLen <= RECOMMENDED_LIMIT && len > RECOMMENDED_LIMIT) {
        showCharToast('超过 30 页推荐上限（330 字），将生成更多页', 'warn');
    }
    prevLen = len;
}

/**
 * 字数超限 toast 提示（自包含，不依赖 fileImporter / puppeteerClient 的 toast）
 * @param {string} msg - 提示消息
 * @param {string} type - warn / error / info
 */
function showCharToast(msg, type) {
    const existing = document.querySelector('.char-limit-toast');
    if (existing) existing.remove();
    const toast = document.createElement('div');
    toast.className = 'char-limit-toast char-limit-toast-' + (type || 'info');
    toast.textContent = msg;
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

const hfDefaults = {
    headerLeft: '',
    headerCenter: '练习字帖',
    headerRight: '字体练习',
    footerText: '评分：☆☆☆☆☆　______年___月___日'
};

export function resetHF() {
    document.getElementById('headerLeft').value = hfDefaults.headerLeft;
    document.getElementById('headerCenter').value = hfDefaults.headerCenter;
    document.getElementById('headerRight').value = hfDefaults.headerRight;
    document.getElementById('footerText').value = hfDefaults.footerText;
}
