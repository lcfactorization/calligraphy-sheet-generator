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

export function toggleTheme() {
    isDark = !isDark;
    applyTheme();
}

export function updateCharCounter() {
    const input = document.getElementById('inputText');
    const counter = document.getElementById('charCounter');
    const len = input.value.length;
    counter.textContent = len + ' / 200';
    counter.classList.toggle('over', len >= 200);
}

const hfDefaults = {
    headerLeft: '',
    headerCenter: '练习字帖',
    headerRight: '字体练习',
    footerText: '评分：☆☆☆☆☆　___年___月___日'
};

export function resetHF() {
    document.getElementById('headerLeft').value = hfDefaults.headerLeft;
    document.getElementById('headerCenter').value = hfDefaults.headerCenter;
    document.getElementById('headerRight').value = hfDefaults.headerRight;
    document.getElementById('footerText').value = hfDefaults.footerText;
}
