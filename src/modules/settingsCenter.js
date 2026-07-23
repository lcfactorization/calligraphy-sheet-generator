// 设置中心模块（C-1）
// localStorage key: calligraphy_settings
// 设置变更后触发事件 'calligraphy:settings-updated'，通知其他模块更新预览

import { toggleTheme } from './settings.js';

const SETTINGS_KEY = 'calligraphy_settings';

const DEFAULT_SETTINGS = {
    gridSize: 60,            // 格子大小 px (40-80)
    charsPerRow: 11,         // 每行字数 (4-12)
    rowsPerPage: 5,          // 每页行数 (5-15)
    showPinyin: true,        // 显示拼音
    showZuci: true,          // 显示组词
    showStrokes: true,       // 显示笔画
    showStrokeOrder: true,   // 显示笔顺编号
    theme: 'light',          // 'light' | 'dark' | 'system'
    fontSize: 43             // 字体大小 px (24-60)
};

/** 读取设置 */
export function getSettings() {
    try {
        const raw = localStorage.getItem(SETTINGS_KEY);
        if (!raw) return { ...DEFAULT_SETTINGS };
        const parsed = JSON.parse(raw);
        return { ...DEFAULT_SETTINGS, ...parsed };
    } catch (e) {
        return { ...DEFAULT_SETTINGS };
    }
}

function saveSettings(settings) {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

/** 应用设置到界面（CSS 变量 + body 类名） */
function applySettings(settings) {
    const root = document.documentElement;
    root.style.setProperty('--sc-grid-size', settings.gridSize + 'px');
    root.style.setProperty('--sc-font-size', settings.fontSize + 'px');
    root.style.setProperty('--sc-row-width', (settings.gridSize * settings.charsPerRow) + 'px');

    document.body.classList.toggle('sc-hide-pinyin', !settings.showPinyin);
    document.body.classList.toggle('sc-hide-zuci', !settings.showZuci);
    document.body.classList.toggle('sc-hide-strokes', !settings.showStrokes);
    document.body.classList.toggle('sc-hide-stroke-order', !settings.showStrokeOrder);

    applyThemeSetting(settings.theme);
}

/** 应用主题设置（与现有 settings.js 协同） */
let systemThemeMQL = null;
function applyThemeSetting(theme) {
    // 清理之前的系统主题监听
    if (systemThemeMQL) {
        systemThemeMQL.removeEventListener('change', onSystemThemeChange);
        systemThemeMQL = null;
    }
    const currentIsDark = document.documentElement.getAttribute('data-theme') === 'dark';
    let targetIsDark;
    if (theme === 'system') {
        systemThemeMQL = window.matchMedia('(prefers-color-scheme: dark)');
        targetIsDark = systemThemeMQL.matches;
        systemThemeMQL.addEventListener('change', onSystemThemeChange);
    } else {
        targetIsDark = (theme === 'dark');
    }
    if (currentIsDark !== targetIsDark) {
        toggleTheme();
    }
}

function onSystemThemeChange(e) {
    const currentIsDark = document.documentElement.getAttribute('data-theme') === 'dark';
    if (currentIsDark !== e.matches) {
        toggleTheme();
    }
}

/** 通知其他模块设置已更新 */
function notifySettingsUpdated(settings) {
    document.dispatchEvent(new CustomEvent('calligraphy:settings-updated', { detail: settings }));
}

/** 更新单个设置项 */
export function updateSetting(key, value) {
    const settings = getSettings();
    settings[key] = value;
    saveSettings(settings);
    applySettings(settings);
    notifySettingsUpdated(settings);
}

/** 创建设置面板 DOM */
function createPanel() {
    if (document.getElementById('settingsPanel')) return;
    const settings = getSettings();

    const overlay = document.createElement('div');
    overlay.className = 'sc-overlay';
    overlay.id = 'settingsPanel';
    overlay.innerHTML = `
        <div class="sc-modal" role="dialog" aria-modal="true" aria-labelledby="scTitle">
            <div class="sc-header">
                <span class="sc-title" id="scTitle">⚙️ 设置中心</span>
                <button class="sc-close" id="scClose" aria-label="关闭" title="关闭">✕</button>
            </div>
            <div class="sc-body">
                <div class="sc-section">
                    <div class="sc-section-title">📐 格子与排版</div>
                    <div class="sc-field">
                        <label>格子大小 <span class="sc-value" id="scGridSizeVal">${settings.gridSize}px</span></label>
                        <input type="range" id="scGridSize" min="40" max="80" step="2" value="${settings.gridSize}">
                    </div>
                    <div class="sc-field">
                        <label>每行字数 <span class="sc-value" id="scCharsPerRowVal">${settings.charsPerRow}</span></label>
                        <input type="range" id="scCharsPerRow" min="4" max="12" step="1" value="${settings.charsPerRow}">
                    </div>
                    <div class="sc-field">
                        <label>每页行数 <span class="sc-value" id="scRowsPerPageVal">${settings.rowsPerPage}</span></label>
                        <input type="range" id="scRowsPerPage" min="5" max="15" step="1" value="${settings.rowsPerPage}">
                    </div>
                    <div class="sc-field">
                        <label>字体大小 <span class="sc-value" id="scFontSizeVal">${settings.fontSize}px</span></label>
                        <input type="range" id="scFontSize" min="24" max="60" step="1" value="${settings.fontSize}">
                    </div>
                </div>
                <div class="sc-section">
                    <div class="sc-section-title">👁️ 显示开关</div>
                    <div class="sc-toggle-row">
                        <span>拼音</span>
                        <label class="sc-switch">
                            <input type="checkbox" id="scShowPinyin" ${settings.showPinyin ? 'checked' : ''}>
                            <span class="sc-slider"></span>
                        </label>
                    </div>
                    <div class="sc-toggle-row">
                        <span>组词</span>
                        <label class="sc-switch">
                            <input type="checkbox" id="scShowZuci" ${settings.showZuci ? 'checked' : ''}>
                            <span class="sc-slider"></span>
                        </label>
                    </div>
                    <div class="sc-toggle-row">
                        <span>笔画</span>
                        <label class="sc-switch">
                            <input type="checkbox" id="scShowStrokes" ${settings.showStrokes ? 'checked' : ''}>
                            <span class="sc-slider"></span>
                        </label>
                    </div>
                    <div class="sc-toggle-row">
                        <span>笔顺编号</span>
                        <label class="sc-switch">
                            <input type="checkbox" id="scShowStrokeOrder" ${settings.showStrokeOrder ? 'checked' : ''}>
                            <span class="sc-slider"></span>
                        </label>
                    </div>
                </div>
                <div class="sc-section">
                    <div class="sc-section-title">🎨 主题</div>
                    <div class="sc-theme-row">
                        <label class="sc-theme-opt ${settings.theme === 'light' ? 'active' : ''}">
                            <input type="radio" name="scTheme" value="light" ${settings.theme === 'light' ? 'checked' : ''}>
                            <span>☀️ 日间</span>
                        </label>
                        <label class="sc-theme-opt ${settings.theme === 'dark' ? 'active' : ''}">
                            <input type="radio" name="scTheme" value="dark" ${settings.theme === 'dark' ? 'checked' : ''}>
                            <span>🌙 夜间</span>
                        </label>
                        <label class="sc-theme-opt ${settings.theme === 'system' ? 'active' : ''}">
                            <input type="radio" name="scTheme" value="system" ${settings.theme === 'system' ? 'checked' : ''}>
                            <span>🖥️ 跟随系统</span>
                        </label>
                    </div>
                </div>
                <div class="sc-footer">
                    <button class="btn btn-ghost" id="scReset">恢复默认</button>
                    <button class="btn btn-primary" id="scDone">完成</button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
    bindPanelEvents(overlay);
}

function bindPanelEvents(overlay) {
    const close = () => {
        overlay.classList.remove('open');
        setTimeout(() => { overlay.style.display = 'none'; }, 250);
    };
    const open = () => {
        overlay.style.display = 'flex';
        // 强制重排以触发动画
        void overlay.offsetWidth;
        overlay.classList.add('open');
    };
    overlay._open = open;
    overlay._close = close;

    overlay.querySelector('#scClose').addEventListener('click', close);
    overlay.querySelector('#scDone').addEventListener('click', close);
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) close();
    });

    // 滑块绑定
    const sliders = [
        { id: 'scGridSize', valId: 'scGridSizeVal', key: 'gridSize', suffix: 'px' },
        { id: 'scCharsPerRow', valId: 'scCharsPerRowVal', key: 'charsPerRow', suffix: '' },
        { id: 'scRowsPerPage', valId: 'scRowsPerPageVal', key: 'rowsPerPage', suffix: '' },
        { id: 'scFontSize', valId: 'scFontSizeVal', key: 'fontSize', suffix: 'px' }
    ];
    sliders.forEach(s => {
        const input = overlay.querySelector('#' + s.id);
        const valEl = overlay.querySelector('#' + s.valId);
        input.addEventListener('input', () => {
            const v = Number(input.value);
            valEl.textContent = v + s.suffix;
            updateSetting(s.key, v);
        });
    });

    // Toggle 开关
    const toggles = [
        { id: 'scShowPinyin', key: 'showPinyin' },
        { id: 'scShowZuci', key: 'showZuci' },
        { id: 'scShowStrokes', key: 'showStrokes' },
        { id: 'scShowStrokeOrder', key: 'showStrokeOrder' }
    ];
    toggles.forEach(t => {
        overlay.querySelector('#' + t.id).addEventListener('change', (e) => {
            updateSetting(t.key, e.target.checked);
        });
    });

    // 主题单选
    overlay.querySelectorAll('input[name="scTheme"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            overlay.querySelectorAll('.sc-theme-opt').forEach(o => o.classList.remove('active'));
            radio.parentElement.classList.add('active');
            updateSetting('theme', e.target.value);
        });
    });

    // 恢复默认
    overlay.querySelector('#scReset').addEventListener('click', () => {
        saveSettings({ ...DEFAULT_SETTINGS });
        applySettings({ ...DEFAULT_SETTINGS });
        notifySettingsUpdated({ ...DEFAULT_SETTINGS });
        // 重新渲染面板
        overlay.remove();
        createPanel();
        document.getElementById('settingsPanel')._open();
    });
}

/** 打开设置面板 */
export function openSettings() {
    let panel = document.getElementById('settingsPanel');
    if (!panel) {
        createPanel();
        panel = document.getElementById('settingsPanel');
    }
    // 重新读取设置同步 UI
    panel.remove();
    createPanel();
    panel = document.getElementById('settingsPanel');
    panel._open();
}

/** 初始化设置中心 */
export function initSettingsCenter() {
    // 应用持久化设置
    const settings = getSettings();
    applySettings(settings);

    // 绑定设置按钮
    const btn = document.getElementById('settingsBtn');
    if (btn) {
        btn.addEventListener('click', openSettings);
    }

    // 监听其他模块的设置更新需求（可选）
    document.addEventListener('calligraphy:request-settings', () => {
        notifySettingsUpdated(getSettings());
    });
}
