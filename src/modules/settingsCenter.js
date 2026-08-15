// 设置中心模块（C-1）
// localStorage key: calligraphy_settings
// 设置变更后触发事件 'calligraphy:settings-updated'，通知其他模块更新预览

import { toggleTheme } from './settings.js';
// v2.8.3：导入网格颜色预设，用于把页眉页脚颜色同步到 CSS 变量
// 不从 GridEngine.js import getActiveGridColors（会造成循环依赖：GridEngine 已 import 本模块的 getSettings）
import { GRID_COLORS, GRID_COLOR_PRESETS } from '../contracts/interfaces.js';

// v3.0.0：低调暗淡的眼睛 SVG 图标（隐藏态=带斜线眼-off，显示态=眼-on）
const EYE_OFF_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';
const EYE_ON_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
// v3.0.0：小型旋转图标（SMIL animateTransform，无需 CSS keyframes）
const SPINNER_SVG = '<svg width="14" height="14" viewBox="0 0 24 24" style="vertical-align:-2px;"><circle cx="12" cy="12" r="9" fill="none" stroke="#6366f1" stroke-width="3" stroke-dasharray="40 20" stroke-linecap="round"><animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="0.8s" repeatCount="indefinite"/></circle></svg>';

const SETTINGS_KEY = 'calligraphy_settings';

const DEFAULT_SETTINGS = {
    gridSize: 60,            // 格子大小 px (40-80)
    charsPerRow: 11,         // 每行字数 (4-12)
    rowsPerPage: 5,          // 每页行数 (5-15)
    showPinyin: true,        // 显示拼音
    showZuci: true,          // 显示组词
    showStrokes: true,       // 显示笔画
    showStrokeOrder: true,   // 显示笔顺编号
    showStrokeDemo: true,    // v2.9.8：点选单字演示笔画笔顺（默认勾选）
    strokeDemoSpeed: 1,      // v2.9.8：笔顺演示默认播放速度（1-5，对应 1x-5x）
    theme: 'light',          // 'light' | 'dark' | 'system'
    fontSize: 43,            // 字体大小 px (24-60)
    // v2.4.7：从 Sidebar.js 合并到设置中心，统一全局状态管理
    gridType: 'mizi',        // 网格类型: 'tian' | 'mizi' | 'hui' | 'pinyin-tian' | 'jiugong'
    traceOpacity: 0.1,       // 描红透明度 (0.05-0.3)
    // v2.5.3：网格颜色预设（'green' | 'red' | 'blue' | 'ink'），见 interfaces.js GRID_COLOR_PRESETS
    gridColorPreset: 'green',
    // v2.9.9 模块B：AI 组词补齐开关（默认关；API Key 独立存于 localStorage deepseek_api_key）
    aiZuciEnabled: false
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

    // v2.8.3：颜色预设切换时同步 CSS 变量，确保页眉页脚颜色跟随
    // 复用 GridEngine.getActiveGridColors 的等价逻辑（避免循环依赖而就地实现）
    // 修复根因：print.css 的 .page-section-header/footer 原硬编码 #2E7D32，
    //   切换朱砂红/靛青蓝/墨黑时页眉页脚不跟随。改用 var(--grid-primary-color)。
    const presetId = settings.gridColorPreset;
    let primaryColor = GRID_COLORS.primary;
    if (presetId && presetId !== 'green') {
        const preset = GRID_COLOR_PRESETS.find(p => p.id === presetId);
        if (preset && preset.colors && preset.colors.primary) {
            primaryColor = preset.colors.primary;
        }
    }
    // v2.8.5-hotfix：同时设置 --grid-theme-color 和 --grid-primary-color（向后兼容）
    //   页眉页脚颜色与网格线条颜色保持完全同步
    root.style.setProperty('--grid-primary-color', primaryColor);
    root.style.setProperty('--grid-theme-color', primaryColor);
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

// v1.2.0：懒加载 aiKeyStore 模块 API（顶部不 import，避免加重首屏/循环依赖风险）
let _keyStorePromise = null;
function getKeyStoreApi() {
    if (!_keyStorePromise) {
        // v1.2.1（问题6）：resolve 时写入模块内共享引用，供 refreshKeyUI/眼睛预览等同步使用
        _keyStorePromise = import('./aiKeyStore.js').then(m => {
            aiKeyStoreApiRef = m;
            return m;
        });
    }
    return _keyStorePromise;
}
// 模块内共享的 store API 引用（首次 getKeyStoreApi() resolve 后注入；未就绪时 UI 刷新显示空态）
let aiKeyStoreApiRef = null;

// v1.2.1（问题6）：刷新 AI Key 区 UI —— 单下拉菜单结构
//   - 下拉始终显示（不隐藏）
//   - 0 Key：仅一个 disabled 占位 option「尚未添加 API Key」
//   - ≥1 Key：`${label} · ${maskKey}`（label 按前缀自动分类：sk- → DeepSeek / ark- → 火山引擎豆包）
//   - 末尾固定 option「＋ 添加新 Key…」（value="__add_new__"）
//   - 眼睛/复制/删除按钮：0 Key 时隐藏，≥1 Key 时显示（眼睛同步复位为隐藏态）
function refreshKeyUI(overlay) {
    const keys = aiKeyStoreApiRef ? aiKeyStoreApiRef.getAllKeys() : [];
    const active = aiKeyStoreApiRef ? aiKeyStoreApiRef.getActiveKey() : null;
    const select = overlay.querySelector('#scAiKeySelect');
    if (select) {
        const opts = [];
        if (keys.length === 0) {
            // 0 Key：禁用占位
            opts.push('<option value="" disabled selected>尚未添加 API Key</option>');
        } else {
            keys.forEach(k => {
                const sel = active && k.id === active.id ? ' selected' : '';
                opts.push(`<option value="${k.id}"${sel}>${k.label} · ${aiKeyStoreApiRef.maskKey(k.key)}</option>`);
            });
        }
        // 末尾固定「＋ 添加新 Key…」（0 Key 时也保留，作为唯一可操作入口）
        opts.push('<option value="__add_new__">＋ 添加新 Key…</option>');
        select.innerHTML = opts.join('');
        select.style.display = 'block'; // v1.2.1：始终显示
    }

    // 眼睛/复制/删除按钮：0 Key 时隐藏（无值可看/可删）；≥1 Key 时显示
    const hasKeys = keys.length > 0;
    ['#scAiKeyToggle', '#scAiKeyCopy', '#scAiKeyRemove'].forEach(sel => {
        const el = overlay.querySelector(sel);
        if (el) el.style.display = hasKeys ? '' : 'none';
    });
    const rm = overlay.querySelector('#scAiKeyRemove');
    if (rm) rm.disabled = !active;

    // 眼睛复位：隐藏态图标 + 收起临时预览（切换/删除/新增后保持遮码）
    const toggleBtn = overlay.querySelector('#scAiKeyToggle');
    if (toggleBtn) {
        toggleBtn.innerHTML = EYE_OFF_SVG;
        toggleBtn.style.color = '#9ca3af';
    }
    const preview = overlay.querySelector('#scAiKeyPreview');
    if (preview) {
        preview.value = active ? active.key : '';
        preview.style.display = 'none';
    }
    // 收起「＋ 添加新 Key…」的内联输入行
    const inlineRow = overlay.querySelector('#scAiKeyInlineRow');
    if (inlineRow) inlineRow.style.display = 'none';
}

/** 更新单个设置项 */
export function updateSetting(key, value) {
    const settings = getSettings();
    settings[key] = value;
    saveSettings(settings);
    applySettings(settings);
    notifySettingsUpdated(settings);
}

/** 创建设置面板 DOM
 *  v2.5.3：移除字号控件（字号修改需联动网格/SVG/分页，工作量巨大且意义不大）
 *         新增九宫格选项 + 线框颜色预设选择器
 */
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
                <div class="sc-window-controls">
                    <button type="button" class="sc-btn-min" id="scMin" aria-label="最小化" title="最小化">▁</button>
                    <button type="button" class="sc-btn-max" id="scMax" aria-label="最大化" title="最大化">□</button>
                    <button class="sc-close" id="scClose" aria-label="关闭" title="关闭">✕</button>
                </div>
            </div>
            <div class="sc-body">
                <div class="sc-section">
                    <div class="sc-section-title">🔲 网格类型</div>
                    <div class="sc-grid-type-group" role="group" aria-label="网格类型切换">
                        ${[
                            {id:'tian',label:'田字格'},
                            {id:'mizi',label:'米字格'},
                            {id:'jiugong',label:'九宫格'},
                            {id:'hui',label:'回字格'},
                            {id:'pinyin-tian',label:'拼音田'}
                        ].map(t => `
                            <button type="button"
                                class="sc-grid-type-btn ${settings.gridType === t.id ? 'active' : ''}"
                                data-grid-type="${t.id}"
                                aria-pressed="${settings.gridType === t.id}">${t.label}</button>
                        `).join('')}
                    </div>
                    <div class="sc-field" style="margin-top:12px">
                        <label>描红透明度 <span class="sc-value" id="scTraceOpacityVal">${settings.traceOpacity.toFixed(2)}</span></label>
                        <input type="range" id="scTraceOpacity" min="0.05" max="0.3" step="0.05" value="${settings.traceOpacity}">
                    </div>
                </div>
                <div class="sc-section">
                    <div class="sc-section-title">🎨 线框颜色</div>
                    <div class="sc-color-preset-group" role="group" aria-label="网格颜色切换">
                        ${[
                            {id:'green',label:'传统绿',color:'#2E7D32'},
                            {id:'red',label:'朱砂红',color:'#9E2A2B'},
                            {id:'blue',label:'靛青蓝',color:'#1565C0'},
                            {id:'ink',label:'墨黑',color:'#1F2937'}
                        ].map(p => `
                            <button type="button"
                                class="sc-color-preset-btn ${settings.gridColorPreset === p.id ? 'active' : ''}"
                                data-color-preset="${p.id}"
                                title="${p.label}"
                                aria-pressed="${settings.gridColorPreset === p.id}"
                                style="--swatch-color: ${p.color};">
                                <span class="sc-color-swatch"></span>
                            </button>
                        `).join('')}
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
                <div class="sc-section">
                    <div class="sc-section-title">🎓 新手引导</div>
                    <div class="sc-toggle-row">
                        <span>启动时自动显示</span>
                        <label class="sc-switch">
                            <input type="checkbox" id="scAutoOnboarding" ${localStorage.getItem('onboarding_never_show') !== 'true' ? 'checked' : ''}>
                            <span class="sc-slider"></span>
                        </label>
                    </div>
                    <button class="btn btn-ghost sc-restart-ob" id="scRestartOb" type="button" title="重新查看首次使用引导" style="margin-top:8px;width:100%;">
                        重新查看新手引导
                    </button>
                </div>
                <div class="sc-section" id="scAiSection">
                    <div class="sc-section-title">🤖 AI 辅助（可选）</div>
                    <div class="sc-toggle-row">
                        <span>启用 AI 辅助</span>
                        <label class="sc-switch">
                            <input type="checkbox" id="scAiZuci" ${settings.aiZuciEnabled ? 'checked' : ''}>
                            <span class="sc-slider"></span>
                        </label>
                    </div>
                    <div id="scAiConfig" style="display:${settings.aiZuciEnabled ? 'block' : 'none'};margin-top:10px;">
                        <div class="sc-field">
                            <label>API Key（可存多个，选中即生效）</label>
                            <!-- v1.2.1（问题6）：单下拉菜单结构：下拉 + 眼睛 + 复制 + 删除 一行；文件导入全宽一行 -->
                            <div style="display:flex;gap:6px;align-items:center;width:100%;">
                                <select id="scAiKeySelect" style="display:block;flex:1;min-width:0;padding:6px 8px;border:1px solid var(--border,#e5e7eb);border-radius:6px;font-size:13px;background:var(--bg,#fff);color:var(--text,#1f2937);">
                                    <!-- 由 refreshKeyUI 动态填充：
                                         <option value="k_xxx">DeepSeek · sk-1234…abcd</option>
                                         <option value="__add_new__">＋ 添加新 Key…</option> -->
                                </select>
                                <button class="btn btn-ghost" id="scAiKeyToggle" type="button" title="显示/隐藏当前 Key 完整值" aria-label="显示/隐藏 API Key" style="padding:6px 10px;color:#9ca3af;line-height:0;flex-shrink:0;">${EYE_OFF_SVG}</button>
                                <button class="btn btn-ghost" id="scAiKeyCopy" type="button" title="复制当前 Key" aria-label="复制 API Key" style="padding:6px 10px;font-size:13px;color:#6b7280;flex-shrink:0;">📋</button>
                                <button class="btn btn-ghost" id="scAiKeyRemove" type="button" style="padding:6px 10px;font-size:12px;color:#ef4444;flex-shrink:0;" title="删除当前 Key">🗑</button>
                            </div>
                            <!-- v1.2.1：眼睛展开的临时完整值预览（默认隐藏，readonly 防编辑） -->
                            <input type="text" id="scAiKeyPreview" readonly value="" style="display:none;width:100%;box-sizing:border-box;margin-top:6px;padding:6px 8px;border:1px dashed var(--border,#e5e7eb);border-radius:6px;font-size:12px;color:#6b7280;background:var(--bg,#fff);word-break:break-all;">
                            <!-- v1.2.1：下拉选中「＋ 添加新 Key…」后展开的内联输入行（默认隐藏） -->
                            <div id="scAiKeyInlineRow" style="display:none;gap:6px;align-items:center;margin-top:6px;width:100%;">
                                <input type="password" id="scAiKeyInlineNew" placeholder="粘贴新 Key：sk-… (DeepSeek) 或 ark-… (火山引擎)" style="flex:1;min-width:0;padding:6px 8px;border:1px solid var(--border,#e5e7eb);border-radius:6px;font-size:13px;">
                                <button class="btn btn-ghost" id="scAiKeyInlineAdd" type="button" style="padding:6px 12px;font-size:12px;flex-shrink:0;">确认</button>
                            </div>
                            <div class="sc-hint" style="font-size:11px;color:#6b7280;margin-top:4px;">API Key 仅存本地。自动识别：sk- → DeepSeek（推荐），ark- → 火山引擎豆包（免费）。下拉选中即生效并自动匹配大模型。</div>
                            <!-- v1.2.1：文件导入与下拉同列，全宽一行 -->
                            <div style="display:flex;gap:6px;align-items:center;margin-top:6px;width:100%;">
                                <input type="file" id="scAiKeyFile" accept=".txt,.md,.csv,.docx,text/plain,text/markdown,text/csv,application/vnd.openxmlformats-officedocument.wordprocessingml.document" style="display:none;">
                                <button class="btn btn-ghost" id="scAiKeyImport" type="button" style="padding:4px 10px;font-size:11px;">📂 从文件添加 Key</button>
                                <span id="scAiKeyImportInfo" style="font-size:11px;color:#9ca3af;"></span>
                            </div>
                        </div>

                        <!-- v3.0.0：级联开关，默认只勾组词补齐 -->
                        <div class="sc-toggle-row" style="margin-top:8px;">
                            <span>📝 组词补齐（仅缺失二字词） <span style="color:#6366f1;font-size:11px;">默认</span></span>
                            <label class="sc-switch">
                                <input type="checkbox" id="scAiFillMissing" checked>
                                <span class="sc-slider"></span>
                            </label>
                        </div>
                        <div class="sc-toggle-row" style="margin-top:8px;">
                            <span>🔤 拼音纠错（核对多音字/误读） <span style="color:#9ca3af;font-size:11px;">可选</span></span>
                            <label class="sc-switch">
                                <input type="checkbox" id="scAiFixPinyin">
                                <span class="sc-slider"></span>
                            </label>
                        </div>
                        <div class="sc-toggle-row" style="margin-top:8px;">
                            <span>🔍 全量检查（核验所有字词） <span style="color:#f59e0b;font-size:11px;">耗时·高级模型</span></span>
                            <label class="sc-switch">
                                <input type="checkbox" id="scAiFullCheck">
                                <span class="sc-slider"></span>
                            </label>
                        </div>
                        <!-- v3.0.0：全量检查警告提示（默认隐藏，勾选时显示） -->
                        <div id="scAiFullCheckWarn" style="display:none;margin-top:6px;padding:6px 10px;background:#fffbeb;border:1px solid #fcd34d;border-radius:6px;font-size:11px;color:#92400e;line-height:1.5;">
                            ⚠ 全量检查将核验所有汉字（含已有组词），处理量大时可能耗时数分钟，且会调用高级大模型（豆包 Turbo / DeepSeek）。建议字数较多时分批处理。
                        </div>
                        <div class="sc-hint" style="font-size:11px;color:#9ca3af;margin-top:6px;">启用 AI 辅助后默认开启「组词补齐」。勾选「全量检查」时自动包含其余两项。</div>
                        <button class="btn btn-primary" id="scAiRun" type="button" style="width:100%;margin-top:8px;">▶ AI 检查与补齐</button>
                        <div id="scAiStatus" class="sc-hint" style="font-size:12px;margin-top:6px;"></div>
                    </div>
                </div>
                <div class="sc-section">
                    <div class="sc-section-title">📐 控件位置</div>
                    <button class="btn btn-ghost" id="scResetFab" type="button" title="重置浮动按钮位置">
                        重置控件位置
                    </button>
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
    const modal = overlay.querySelector('.sc-modal');
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

    // v3.0.2：窗口控制按钮（最小化/最大化/关闭）
    const toggleMin = () => {
        if (!modal) return;
        if (modal.classList.contains('minimized')) {
            modal.classList.remove('minimized');
        } else {
            modal.classList.add('minimized');
        }
    };
    const toggleMax = () => {
        if (!modal) return;
        if (modal.classList.contains('minimized')) {
            // 最小化时点击最大化：先恢复再最大化
            modal.classList.remove('minimized');
            modal.classList.add('maximized');
        } else {
            modal.classList.toggle('maximized');
        }
    };
    const minBtn = overlay.querySelector('#scMin');
    const maxBtn = overlay.querySelector('#scMax');
    if (minBtn) minBtn.addEventListener('click', toggleMin);
    if (maxBtn) maxBtn.addEventListener('click', toggleMax);

    overlay.querySelector('#scClose').addEventListener('click', close);
    overlay.querySelector('#scDone').addEventListener('click', close);
    // v3.0.2：移除"点击遮罩外部关闭"逻辑（与笔顺演示弹窗行为一致，点击外部不关闭弹窗）
    // overlay.addEventListener('click', (e) => {
    //     if (e.target === overlay) close();
    // });

    // 滑块绑定（v2.5.3：移除 scFontSize 条目，因面板 UI 已删除字号控件；
    //   残留引用会导致 querySelector 返回 null，throw TypeError 中断后续事件绑定
    // v2.5.4：移除 scGridSize/scCharsPerRow/scRowsPerPage 条目，SVG引擎用静态
    //   SHEET_LAYOUT，这些控件不生效；保留 DEFAULT_SETTINGS 字段作为兼容）
    const sliders = [
        { id: 'scTraceOpacity', valId: 'scTraceOpacityVal', key: 'traceOpacity', suffix: '', isFloat: true }
    ];
    sliders.forEach(s => {
        const input = overlay.querySelector('#' + s.id);
        const valEl = overlay.querySelector('#' + s.valId);
        // 防御：元素不存在则跳过（避免未来类似回归导致整面板失效）
        if (!input || !valEl) return;
        input.addEventListener('input', () => {
            const v = s.isFloat ? parseFloat(input.value) : Number(input.value);
            valEl.textContent = s.isFloat ? v.toFixed(2) : v + s.suffix;
            updateSetting(s.key, v);
        });
    });

    // v2.4.7：网格类型按钮绑定（与侧栏按钮等效，改同一全局变量）
    overlay.querySelectorAll('.sc-grid-type-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const type = btn.dataset.gridType;
            overlay.querySelectorAll('.sc-grid-type-btn').forEach(b => {
                const isActive = b === btn;
                b.classList.toggle('active', isActive);
                b.setAttribute('aria-pressed', isActive);
            });
            updateSetting('gridType', type);
        });
    });

    // v2.5.3：线框颜色预设按钮绑定（与侧栏按钮等效，改同一全局变量）
    overlay.querySelectorAll('.sc-color-preset-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const presetId = btn.dataset.colorPreset;
            overlay.querySelectorAll('.sc-color-preset-btn').forEach(b => {
                const isActive = b === btn;
                b.classList.toggle('active', isActive);
                b.setAttribute('aria-pressed', isActive);
            });
            updateSetting('gridColorPreset', presetId);
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

    // v2.9.7：启动时自动显示新手引导开关（与 localStorage.onboarding_never_show 双向绑定）
    const autoObToggle = overlay.querySelector('#scAutoOnboarding');
    if (autoObToggle) {
        autoObToggle.addEventListener('change', (e) => {
            const enabled = e.target.checked;
            import('./onboarding.js').then(m => {
                if (m && typeof m.setNeverShow === 'function') {
                    m.setNeverShow(!enabled); // 开关开 = never_show=false
                }
                const tip = document.createElement('div');
                tip.textContent = enabled ? '✓ 已启用启动时自动显示引导' : '✓ 已关闭启动时自动显示引导';
                tip.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);z-index:10002;padding:10px 18px;background:#22c55e;color:#fff;border-radius:8px;font-size:13px;box-shadow:0 4px 16px rgba(0,0,0,0.2)';
                document.body.appendChild(tip);
                setTimeout(() => {
                    tip.style.opacity = '0';
                    tip.style.transition = 'opacity .3s';
                    setTimeout(() => { if (tip.parentNode) tip.remove(); }, 300);
                }, 1500);
            }).catch(err => console.warn('[settingsCenter] 加载 onboarding 模块失败:', err));
        });
    }

    // v2.9.5：重新查看新手引导
    // 用动态 import 避免静态循环依赖（onboarding.js 已被 main.js 静态 import）
    const restartObBtn = overlay.querySelector('#scRestartOb');
    if (restartObBtn) {
        restartObBtn.addEventListener('click', () => {
            close(); // 先关闭设置面板
            import('./onboarding.js').then(m => {
                if (m && typeof m.restartOnboarding === 'function') {
                    m.restartOnboarding();
                }
            }).catch(e => console.warn('[settingsCenter] 加载 onboarding 模块失败:', e));
        });
    }

    // v2.9.5：重置浮动按钮位置（清 localStorage + 清内联样式）
    const resetFabBtn = overlay.querySelector('#scResetFab');
    if (resetFabBtn) {
        resetFabBtn.addEventListener('click', () => {
            import('./fabDrag.js').then(m => {
                if (m && typeof m.resetFabPositions === 'function') {
                    m.resetFabPositions();
                    // 简短提示
                    const tip = document.createElement('div');
                    tip.textContent = '✓ 控件位置已重置';
                    tip.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);z-index:10002;padding:10px 18px;background:#22c55e;color:#fff;border-radius:8px;font-size:13px;box-shadow:0 4px 16px rgba(0,0,0,0.2)';
                    document.body.appendChild(tip);
                    setTimeout(() => {
                        tip.style.opacity = '0';
                        tip.style.transition = 'opacity .3s';
                        setTimeout(() => { if (tip.parentNode) tip.remove(); }, 300);
                    }, 1500);
                }
            }).catch(e => console.warn('[settingsCenter] 加载 fabDrag 模块失败:', e));
        });
    }

    // v2.9.9 模块B：AI 组词补齐 — 启用开关 / API Key 保存 / 触发补齐（支持中断）
    const aiZuciToggle = overlay.querySelector('#scAiZuci');
    if (aiZuciToggle) {
        aiZuciToggle.addEventListener('change', (e) => {
            const enabled = e.target.checked;
            updateSetting('aiZuciEnabled', enabled);
            const cfg = overlay.querySelector('#scAiConfig');
            if (cfg) cfg.style.display = enabled ? 'block' : 'none';
        });
    }

    // v3.0.0：AI 功能开关联动逻辑
    // 规则：启用总开关→默认勾组词补齐；勾全量检查→自动勾其余两项并禁用；取消全量→恢复可编辑
    const fullCheckCb = overlay.querySelector('#scAiFullCheck');
    const fillMissingCb = overlay.querySelector('#scAiFillMissing');
    const fixPinyinCb = overlay.querySelector('#scAiFixPinyin');
    const fullCheckWarn = overlay.querySelector('#scAiFullCheckWarn');

    if (fullCheckCb) {
        fullCheckCb.addEventListener('change', (e) => {
            const isFull = e.target.checked;
            if (isFull) {
                if (fillMissingCb) { fillMissingCb.checked = true; fillMissingCb.disabled = true; }
                if (fixPinyinCb) { fixPinyinCb.checked = true; fixPinyinCb.disabled = true; }
                if (fullCheckWarn) fullCheckWarn.style.display = 'block';
            } else {
                if (fillMissingCb) { fillMissingCb.disabled = false; }
                if (fixPinyinCb) { fixPinyinCb.disabled = false; }
                if (fullCheckWarn) fullCheckWarn.style.display = 'none';
            }
        });
    }

    // v3.0.0：面板展开时若三个开关都未勾且非全量，确保组词补齐勾选
    // （HTML checked 属性只在首次渲染生效，重复打开需手动同步）
    if (aiZuciToggle) {
        const syncDefault = () => {
            const isFull = fullCheckCb?.checked;
            if (isFull) return;
            const anyChecked = fillMissingCb?.checked || fixPinyinCb?.checked;
            if (!anyChecked && fillMissingCb) {
                fillMissingCb.checked = true;
            }
        };
        aiZuciToggle.addEventListener('change', syncDefault);
    }

    // v1.1.0：从文件导入 API Key（txt/md/csv/docx，正则匹配 sk-/ark-）
    // v1.2.0：改为批量入库（全部 addKey），不再"填第一个"
    const aiKeyImportBtn = overlay.querySelector('#scAiKeyImport');
    const aiKeyFileInput = overlay.querySelector('#scAiKeyFile');
    const aiKeyImportInfo = overlay.querySelector('#scAiKeyImportInfo');
    if (aiKeyImportBtn && aiKeyFileInput) {
        aiKeyImportBtn.addEventListener('click', () => { aiKeyFileInput.click(); });
        aiKeyFileInput.addEventListener('change', async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            try {
                const { importKeysFromFile } = await import('./aiKeyImporter.js');
                const { addKey } = await import('./aiKeyStore.js');
                const result = await importKeysFromFile(file);
                if (!result.ok) {
                    if (aiKeyImportInfo) { aiKeyImportInfo.textContent = `⚠ ${result.error}`; aiKeyImportInfo.style.color = '#ef4444'; }
                    return;
                }
                if (result.count === 0) {
                    if (aiKeyImportInfo) { aiKeyImportInfo.textContent = `⚠ ${result.filename} 中未找到 sk- 或 ark- 开头的 API Key`; aiKeyImportInfo.style.color = '#f59e0b'; }
                } else {
                    // v1.2.0：全部加入 Key 列表，最后一个置活跃（addKey 每次都会置活跃，故按文件顺序最后一个生效）
                    let lastEntry = null;
                    result.keys.forEach(k => { lastEntry = addKey(k); });
                    if (aiKeyImportInfo) { aiKeyImportInfo.textContent = `✓ 已导入 ${result.count} 个 Key（当前生效：${lastEntry ? lastEntry.label : ''}）`; aiKeyImportInfo.style.color = '#16a34a'; }
                    refreshKeyUI(overlay);
                }
            } catch (err) {
                console.error('[Key导入] 失败:', err);
                if (aiKeyImportInfo) { aiKeyImportInfo.textContent = `✗ 解析失败：${err.message || err}`; aiKeyImportInfo.style.color = '#ef4444'; }
            } finally {
                // 允许重复选择同一文件
                e.target.value = '';
            }
        });
    }

    // v3.0.0：API Key 显示/隐藏切换（低调暗淡 SVG 眼睛图标）
    // v1.2.1（问题6）：改为切换下拉旁 #scAiKeyPreview 的显示/隐藏，value 为当前选中 Key 完整值
    const aiKeyToggleBtn = overlay.querySelector('#scAiKeyToggle');
    if (aiKeyToggleBtn) {
        aiKeyToggleBtn.addEventListener('click', () => {
            const preview = overlay.querySelector('#scAiKeyPreview');
            const select = overlay.querySelector('#scAiKeySelect');
            if (!preview || !select) return;
            // 未选中实际 Key（如 0 Key 或处于「＋ 添加新 Key…」态）时无值可看
            const selVal = select.value;
            if (!selVal || selVal === '__add_new__') return;
            if (preview.style.display === 'none') {
                // 取当前选中 Key 的完整值：优先活跃 Key，兜底按下拉选中 id 查找
                let fullKey = '';
                const activeEntry = aiKeyStoreApiRef ? aiKeyStoreApiRef.getActiveKey() : null;
                if (activeEntry) {
                    fullKey = activeEntry.key;
                } else if (aiKeyStoreApiRef && select.value) {
                    const selKey = aiKeyStoreApiRef.getAllKeys().find(k => k.id === select.value);
                    fullKey = selKey ? selKey.key : '';
                }
                preview.value = fullKey;
                preview.style.display = 'block';
                aiKeyToggleBtn.innerHTML = EYE_ON_SVG;
                aiKeyToggleBtn.style.color = '#6b7280';
            } else {
                preview.style.display = 'none';
                aiKeyToggleBtn.innerHTML = EYE_OFF_SVG;
                aiKeyToggleBtn.style.color = '#9ca3af';
            }
        });
    }

    // v1.2.1（问题6）：复制当前选中 Key 到剪贴板，成功后短暂提示「✓ 已复制」
    const aiKeyCopyBtn = overlay.querySelector('#scAiKeyCopy');
    if (aiKeyCopyBtn) {
        aiKeyCopyBtn.addEventListener('click', async () => {
            const select = overlay.querySelector('#scAiKeySelect');
            const status = overlay.querySelector('#scAiStatus');
            const id = select?.value;
            if (!id || id === '__add_new__') {
                if (status) { status.textContent = '⚠ 请先选择要复制的 Key'; status.style.color = '#f59e0b'; }
                return;
            }
            const api = await getKeyStoreApi();
            const entry = api.getAllKeys().find(k => k.id === id);
            if (!entry) {
                if (status) { status.textContent = '⚠ 未找到该 Key'; status.style.color = '#f59e0b'; }
                return;
            }
            try {
                await navigator.clipboard.writeText(entry.key);
            } catch (err) {
                // 剪贴板 API 不可用（非安全上下文等）时降级为 textarea 复制
                console.warn('[复制Key] clipboard API 不可用，降级复制:', err);
                const ta = document.createElement('textarea');
                ta.value = entry.key;
                ta.style.position = 'fixed';
                ta.style.opacity = '0';
                document.body.appendChild(ta);
                ta.select();
                try { document.execCommand('copy'); } catch (e2) { /* ignore */ }
                ta.remove();
            }
            const orig = aiKeyCopyBtn.textContent;
            aiKeyCopyBtn.textContent = '✓ 已复制';
            aiKeyCopyBtn.style.color = '#16a34a';
            setTimeout(() => {
                aiKeyCopyBtn.textContent = orig;
                aiKeyCopyBtn.style.color = '#6b7280';
            }, 1500);
            if (status) { status.textContent = `✓ 已复制：${entry.label}（${api.maskKey(entry.key)}）`; status.style.color = '#16a34a'; }
        });
    }

    // v1.2.0：多 Key 支持 —— 下拉选择器：选中即生效（无需保存按钮）
    // v1.2.1（问题6）：选中「＋ 添加新 Key…」→ 展开内联输入行；选中已有 Key → 即时生效
    const aiKeySelect = overlay.querySelector('#scAiKeySelect');
    if (aiKeySelect) {
        aiKeySelect.addEventListener('change', async () => {
            const id = aiKeySelect.value;
            const inlineRow = overlay.querySelector('#scAiKeyInlineRow');
            const status = overlay.querySelector('#scAiStatus');
            // 隐藏完整值预览（切换 Key 时同步收起眼睛态）
            const preview = overlay.querySelector('#scAiKeyPreview');
            if (preview) preview.style.display = 'none';
            if (aiKeyToggleBtn) { aiKeyToggleBtn.innerHTML = EYE_OFF_SVG; aiKeyToggleBtn.style.color = '#9ca3af'; }

            if (id === '__add_new__') {
                // 添加模式：展开内联输入行，聚焦输入框
                if (inlineRow) {
                    inlineRow.style.display = 'flex';
                    const inputNew = overlay.querySelector('#scAiKeyInlineNew');
                    if (inputNew) setTimeout(() => { try { inputNew.focus(); } catch (e) { /* ignore */ } }, 0);
                }
                return;
            }
            if (inlineRow) inlineRow.style.display = 'none'; // 切回已有 Key → 收起添加行
            if (!id) return;
            const api = await getKeyStoreApi();
            api.setActiveKey(id); // 选中即生效：写 ai_active_key_id
            const entry = api.getAllKeys().find(k => k.id === id);
            if (status && entry) {
                status.textContent = `✓ 已切换：${entry.label}（${api.maskKey(entry.key)}），AI 检查将自动使用该引擎`;
                status.style.color = '#16a34a';
            }
            refreshKeyUI(overlay); // 刷新下拉选中态/预览值
        });
    }

    // v1.2.1（问题6）：内联「确认」按钮 —— 添加新 Key 后 addKey 并刷新（复用原 #scAiKeyAdd 逻辑）
    const aiKeyInlineAddBtn = overlay.querySelector('#scAiKeyInlineAdd');
    if (aiKeyInlineAddBtn) {
        aiKeyInlineAddBtn.addEventListener('click', async () => {
            const inputNew = overlay.querySelector('#scAiKeyInlineNew');
            const status = overlay.querySelector('#scAiStatus');
            const key = (inputNew?.value || '').trim();
            if (!key) {
                if (status) { status.textContent = '⚠ 请先粘贴 API Key'; status.style.color = '#f59e0b'; }
                return;
            }
            // v3.0.0 延续：未知前缀给出警告（但同样入库，便于用户自行判断）
            const { getAiProvider } = await import('./aiZuci.js');
            const providerInfo = getAiProvider(key);
            const api = await getKeyStoreApi();
            const entry = api.addKey({ key });
            if (inputNew) inputNew.value = '';
            if (status) {
                if (providerInfo.type === 'unknown') {
                    status.textContent = `⚠ 已添加但无法识别类型：${key.slice(0, 4)}…（请确认 sk- 或 ark- 开头；当前已生效）`;
                    status.style.color = '#f59e0b';
                } else {
                    status.textContent = `✓ 已添加并生效：${entry.label}（${api.maskKey(entry.key)}）`;
                    status.style.color = '#16a34a';
                }
            }
            refreshKeyUI(overlay); // 刷新后下拉回落到新添加的 Key
        });
    }

    // v1.2.0：删除当前活跃 Key（删空清两把键，删活跃自动切第一个）
    const aiKeyRemoveBtn = overlay.querySelector('#scAiKeyRemove');
    if (aiKeyRemoveBtn) {
        aiKeyRemoveBtn.addEventListener('click', async () => {
            const api = await getKeyStoreApi();
            const active = api.getActiveKey();
            const status = overlay.querySelector('#scAiStatus');
            if (!active) {
                if (status) { status.textContent = '⚠ 当前没有可删除的 Key'; status.style.color = '#f59e0b'; }
                return;
            }
            api.removeKey(active.id);
            const rest = api.getAllKeys();
            if (status) {
                status.textContent = rest.length > 0
                    ? `✓ 已删除 ${active.label}，当前生效：${rest[0].label}`
                    : '✓ 已删除所有 API Key';
                status.style.color = '#16a34a';
            }
            refreshKeyUI(overlay);
        });
    }

    // v1.2.1（问题6）：添加新 Key 功能已合并进下拉菜单「＋ 添加新 Key…」内联输入行（见 #scAiKeyInlineAdd），此处不再单独绑定 #scAiKeyAdd/#scAiKeyNew

    const aiRunBtn = overlay.querySelector('#scAiRun');
    let aiAbortCtrl = null; // v2.9.9：支持再次点击中断
    if (aiRunBtn) {
        aiRunBtn.addEventListener('click', async () => {
            const status = overlay.querySelector('#scAiStatus');
            const setStatus = (text, color) => { if (status) { status.textContent = text; status.style.color = color; } };

            // 正在运行时再次点击 → 中断
            if (aiAbortCtrl) {
                aiAbortCtrl.abort();
                return;
            }

            // v1.2.0：从活跃键取值（内部自动迁移旧键）；不再直接读 deepseek_api_key
            const api = await getKeyStoreApi();
            const apiKey = api.getActiveKeyValue();
            if (!apiKey) {
                setStatus('⚠ 请先添加并选择 DeepSeek 或火山引擎 API Key', '#ef4444');
                return;
            }
            // v3.0.0：拦截无法识别的 API Key 前缀
            const { getAiProvider } = await import('./aiZuci.js');
            const providerInfo = getAiProvider(apiKey);
            if (providerInfo.type === 'unknown') {
                setStatus('⚠ 无法识别 API Key 类型：请输入 sk- 开头（DeepSeek）或 ark- 开头（火山引擎）的 Key', '#ef4444');
                return;
            }
            const text = (document.getElementById('inputText')?.value || '');
            // 提取去重汉字
            const chars = [...new Set((text.match(/[\u4e00-\u9fa5]/g) || []))];
            if (chars.length === 0) {
                setStatus('⚠ 字帖中没有汉字，请先输入文字并生成', '#ef4444');
                return;
            }

            aiAbortCtrl = new AbortController();
            aiRunBtn.textContent = '⏹ 中断';
            // v3.0.0：读取开关（组词补齐默认勾选；全量检查已联动勾选其余两项并禁用）
            const fullCheck = !!overlay.querySelector('#scAiFullCheck')?.checked;
            const fillMissing = !!overlay.querySelector('#scAiFillMissing')?.checked;
            const fixPinyin = !!overlay.querySelector('#scAiFixPinyin')?.checked;
            const anyOn = fullCheck || fillMissing || fixPinyin;
            // v3.0.0：全量检查时豆包自动升级 turbo 强模型，重新获取 providerInfo 以显示正确标签
            const providerInfoFull = getAiProvider(apiKey, fullCheck);
            const opts = {
                fullCheck,
                fillMissing: anyOn ? fillMissing : true,  // 都不勾选时默认补齐
                fixPinyin,
                apiKey,
                signal: aiAbortCtrl.signal
            };
            // v3.0.0：模式标签（简短，不重复引擎详情）
            const modeParts = [];
            if (fullCheck) modeParts.push('全量');
            if (fillMissing || !anyOn) modeParts.push('补齐');
            if (fixPinyin) modeParts.push('纠音');
            const modeLabel = modeParts.join('+');
            // v3.0.0：旋转图标 + 进度提示
            const setProgress = (text) => {
                if (status) {
                    status.innerHTML = `${SPINNER_SVG} <span style="vertical-align:-1px;">${text}</span>`;
                    status.style.color = '#6366f1';
                }
            };
            setProgress(`正在${modeLabel} ${chars.length} 字 [${providerInfoFull.label}]…`);
            opts.onProgress = (info) => {
                if (info && info.total > 0) {
                    setProgress(`正在${modeLabel} [${providerInfoFull.label}]… ${info.processed}/${info.total} 字（批次 ${info.batchIndex}/${info.totalBatches}）`);
                }
            };

            try {
                const { fillMissingZuci } = await import('./aiZuci.js');
                const result = await fillMissingZuci(chars, opts);

                // 构建状态消息
                let msg = `✓ ${result.providerLabel}：共 ${result.total} · 默认 ${result.default} · AI ${result.ai} · 缺失 ${result.missing}（${result.elapsed}ms）`;

                // 超时/部分成功提示
                if (result.timedOut) {
                    if (result.partialSuccess) {
                        msg = `⏱ 处理超时（5分钟），已部分完成：AI ${result.ai}/${result.total} 字\n` + msg;
                    } else {
                        msg = `⏱ 处理超时（5分钟），未获得有效结果\n可能原因：${result.timeoutError || '网络或模型响应过慢'}\n建议：${result.suggestion || '减少单次处理字数或更换 API 提供商'}`;
                        if (status) status.style.whiteSpace = 'pre-line';
                        setStatus(msg, '#f59e0b');
                        return;
                    }
                }

                // v1.1.0：无需 AI 处理（所有字默认词库已足够 或 已有缓存）→ 提示正常而非误报
                if (result.noWorkNeeded && result.total > 0) {
                    msg = `✓ ${result.providerLabel}：共 ${result.total} 字，默认词库均已足够，无需 AI 处理（${result.elapsed}ms）`;
                    if (result.pinyinChecked > 0) {
                        msg += `\n📌 纠音核对 ${result.pinyinChecked} 字，均无误`;
                    }
                    if (status) status.style.whiteSpace = 'pre-line';
                    setStatus(msg, '#16a34a');
                    return;
                }

                // 无有效结果
                if (result.ai === 0 && result.total > 0 && !result.timedOut) {
                    msg = `✗ 未能处理任何字\n${result.suggestion || '请检查 API Key 和网络连接后重试'}`;
                    if (status) status.style.whiteSpace = 'pre-line';
                    setStatus(msg, '#ef4444');
                    return;
                }

                // 拼音纠错报告
                if (result.pinyinFixed > 0) {
                    msg += `\n📌 纠音 ${result.pinyinFixed} 次：`;
                    result.fixes.forEach(f => {
                        msg += `\n  ${f.char}：${f.from} → ${f.to}（${f.reason}）`;
                    });
                } else if (result.pinyinChecked > 0) {
                    msg += `\n📌 纠音核对 ${result.pinyinChecked} 字，均无误`;
                }

                if (status) status.style.whiteSpace = 'pre-line';
                setStatus(msg, result.timedOut ? '#f59e0b' : '#16a34a');

                // 触发重渲染
                document.dispatchEvent(new CustomEvent('calligraphy:settings-updated'));
            } catch (err) {
                if (err && err.name === 'AbortError') {
                    setStatus('已中断', '#6b7280');
                } else {
                    console.error('[AI组词] 失败:', err);
                    let errMsg = `✗ 失败：${err.message || err}`;
                    if (err.message && err.message.includes('401')) {
                        errMsg += '\n建议：API Key 无效，请检查设置';
                    } else if (err.message && err.message.includes('403')) {
                        errMsg += '\n建议：无该模型权限或额度耗尽，请更换模型或充值';
                    } else if (err.message && err.message.includes('429')) {
                        errMsg += '\n建议：请求过频，请等待 30 秒后重试';
                    } else if (err.message && err.message.includes('Failed to fetch')) {
                        errMsg += '\n建议：网络连接失败，请检查网络';
                    }
                    if (status) status.style.whiteSpace = 'pre-line';
                    setStatus(errMsg, '#ef4444');
                }
            } finally {
                aiAbortCtrl = null;
                aiRunBtn.textContent = '▶ AI 检查与补齐';
            }
        });
    }

    // v1.2.1（问题6）：面板创建后异步加载 Key 列表并刷新下拉
    //   修复既有 bug：原代码 refreshKeyUI 仅由用户交互触发，首次打开面板时下拉为空
    getKeyStoreApi()
        .then(() => refreshKeyUI(overlay))
        .catch(err => console.warn('[settingsCenter] 加载 aiKeyStore 失败:', err));
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
