// 设置中心模块（C-1）
// localStorage key: calligraphy_settings
// 设置变更后触发事件 'calligraphy:settings-updated'，通知其他模块更新预览

import { toggleTheme } from './settings.js';
// v2.8.3：导入网格颜色预设，用于把页眉页脚颜色同步到 CSS 变量
// 不从 GridEngine.js import getActiveGridColors（会造成循环依赖：GridEngine 已 import 本模块的 getSettings）
import { GRID_COLORS, GRID_COLOR_PRESETS } from '../contracts/interfaces.js';

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
                <button class="sc-close" id="scClose" aria-label="关闭" title="关闭">✕</button>
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
                <div class="sc-section">
                    <div class="sc-section-title">🤖 AI 组词补齐（可选）</div>
                    <div class="sc-toggle-row">
                        <span>启用 AI 补齐</span>
                        <label class="sc-switch">
                            <input type="checkbox" id="scAiZuci" ${settings.aiZuciEnabled ? 'checked' : ''}>
                            <span class="sc-slider"></span>
                        </label>
                    </div>
                    <div id="scAiConfig" style="display:${settings.aiZuciEnabled ? 'block' : 'none'};margin-top:10px;">
                        <div class="sc-field">
                            <label>DeepSeek API Key</label>
                            <div style="display:flex;gap:6px;align-items:center;">
                                <input type="password" id="scAiKey" placeholder="sk-..." value="${(localStorage.getItem('deepseek_api_key') || '').replace(/"/g, '&quot;')}" style="flex:1;padding:6px 8px;border:1px solid var(--border,#e5e7eb);border-radius:6px;font-size:13px;">
                                <button class="btn btn-ghost" id="scAiKeySave" type="button" style="padding:6px 12px;font-size:12px;">保存</button>
                            </div>
                            <div class="sc-hint" style="font-size:11px;color:#6b7280;margin-top:4px;">API Key 存储在本地 localStorage，不会上传</div>
                        </div>
                        <button class="btn btn-primary" id="scAiRun" type="button" style="width:100%;margin-top:8px;">▶ 补齐组词</button>
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

    const aiKeySaveBtn = overlay.querySelector('#scAiKeySave');
    if (aiKeySaveBtn) {
        aiKeySaveBtn.addEventListener('click', () => {
            const input = overlay.querySelector('#scAiKey');
            const status = overlay.querySelector('#scAiStatus');
            const key = (input?.value || '').trim();
            if (!key) {
                localStorage.removeItem('deepseek_api_key');
                if (status) { status.textContent = '✓ 已清除 API Key'; status.style.color = '#16a34a'; }
            } else {
                localStorage.setItem('deepseek_api_key', key);
                if (status) { status.textContent = '✓ API Key 已保存到本地'; status.style.color = '#16a34a'; }
            }
        });
    }

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

            const apiKey = (localStorage.getItem('deepseek_api_key') || '').trim();
            if (!apiKey) {
                setStatus('⚠ 请先填写并保存 DeepSeek API Key', '#ef4444');
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
            setStatus(`正在补齐 ${chars.length} 个字的组词…`, '#6366f1');

            try {
                const { fillMissingZuci } = await import('./aiZuci.js');
                const result = await fillMissingZuci(chars, { apiKey, signal: aiAbortCtrl.signal });
                // v2.9.9：构建含拼音纠错报告的状态消息
                let msg = `✓ 完成：共 ${result.total} 字 · 默认 ${result.default} · AI 补齐 ${result.ai} · 缺失 ${result.missing}（${result.elapsed}ms）`;
                if (result.pinyinFixed > 0) {
                    msg += `\n📌 拼音纠错 ${result.pinyinFixed} 次：`;
                    result.fixes.forEach(f => {
                        msg += `\n  ${f.char}：${f.from} → ${f.to}（${f.reason}）`;
                    });
                } else if (result.pinyinChecked > 0) {
                    msg += `\n📌 拼音核对 ${result.pinyinChecked} 字，均无误`;
                }
                if (status) status.style.whiteSpace = 'pre-line';
                setStatus(msg, '#16a34a');
                // 触发重渲染，使 AI 缓存生效（消除 "组词" 占位 + 纠正拼音）
                document.dispatchEvent(new CustomEvent('calligraphy:settings-updated'));
            } catch (err) {
                if (err && err.name === 'AbortError') {
                    setStatus('已中断', '#6b7280');
                } else {
                    console.error('[AI组词] 失败:', err);
                    setStatus(`✗ 失败：${err.message || err}`, '#ef4444');
                }
            } finally {
                aiAbortCtrl = null;
                aiRunBtn.textContent = '▶ 补齐组词';
            }
        });
    }
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
