import './styles/main.css';
import { loadFonts, handleFontUpload, detectSystemFonts } from './modules/fontManager.js';
import { applyTheme, toggleTheme, updateCharCounter, resetHF } from './modules/settings.js';
// v2.4.0：切换到新 SVG 矢量字格引擎 + jsPDF/svg2pdf 双轨 PDF（保留旧模块作回退）
// v3.0.7：额外引入三个定向重绘 API —— 换字体/换网格色/换网格式样不再全量重建字帖
import { renderSheet, applySheetFont, applySheetTraceOpacity, repaintSheetGrid } from './components/GridEngine.js';
import { exportPDF } from './utils/pdfExport.js';
import { initSidebar, getSidebarState } from './components/Sidebar.js';
import './modules/puppeteerClient.js'; // side-effect 导入
import { initHistory, saveHistory } from './modules/history.js';
import { initSettingsCenter, getSettings } from './modules/settingsCenter.js';
import { initDifficulty } from './modules/difficulty.js';
import { registerFileImporter } from './modules/fileImporter.js';
import { registerRecommender } from './modules/recommender.js';
import { registerReportPanel } from './modules/reportPanel.js';
// v2.9.5：移动端首次使用引导 + 滚动边角提示
import { initOnboarding, initScrollHints } from './modules/onboarding.js';
// v2.9.5：桌面端 FAB 拖拽
import { initFabDrag } from './modules/fabDrag.js';
// v2.9.8：离线汉字笔画数据 + 点选单字演示笔画笔顺弹窗
import { initHanziData } from './modules/hanziDataStore.js';
import { initStrokeDemoClick, initStrokeDemoToolbar } from './modules/strokeDemoModal.js';
// 手动修改拼音与组词（点击字帖行右侧弹出编辑浮层）
import { initManualEdit } from './modules/manualEdit.js';

// 初始化
applyTheme();
initHistory();
initSettingsCenter();
initDifficulty();
registerFileImporter();
registerRecommender();
registerReportPanel();
initSidebar();
// v2.9.5：引导浮层（首次访问）+ 滚动边角提示（老用户）+ 桌面端 FAB 拖拽
// 放在 initSidebar 之后，确保 .sidebar-drawer-toggle 已生成可被引导定位
initOnboarding();
initScrollHints();
initFabDrag();
// v2.9.8：启动离线汉字数据加载（Web Worker 后台解压）+ 字格点击弹窗 + 工具栏"笔顺演示"开关
initHanziData();
initStrokeDemoClick();
initStrokeDemoToolbar();
// 手动修改拼音与组词初始化
initManualEdit();

// v3.0.5：自行注册 Service Worker（vite.config.js 已设 injectRegister: false）。
// 为什么不用插件自动注入：自动注入的 registerSW.js 只判断 `'serviceWorker' in navigator`，
// 而该判断在 file:// 下为真 —— 双击打开时会发起一次注定失败的注册
// （"The URL protocol of the current origin ('file://') is not supported"），
// 且生成的脚本没有 .catch()，于是抛出未捕获的 Promise 拒绝。
//
// 两个必须的前置条件：
//   · `import.meta.env.PROD` —— vite-plugin-pwa 的 devOptions.enabled 默认 false，
//     即**开发模式下根本没有 sw.js**（dev server 会回退返回 index.html，MIME 为 text/html）。
//     不加此判断会在 dev 下报 "The script has an unsupported MIME type ('text/html')"。
//   · `location.protocol !== 'file:'` —— file:// 不支持 Service Worker。
if (import.meta.env.PROD && location.protocol !== 'file:' && 'serviceWorker' in navigator) {
    window.addEventListener('load', function () {
        navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(function (err) {
            // 注册失败不影响离线数据与全部核心功能（离线数据走 embedded.js，不依赖 SW）
            console.warn('[PWA] Service Worker 注册失败（不影响功能）:', err && err.message);
        });
    });
}

// v3.0.5：向父窗口（字帖生成器.html 启动器）报告「应用已就绪」。
// 为什么需要显式信标：在 file:// 协议下，iframe 的 load 事件**即使目标文件不存在也会触发**
// （Chrome 会为失败的导航加载自己的错误页），因此启动器无法用 load 事件区分
// 「应用加载成功」与「dist/index.html 缺失」。一个显式的就绪消息才能准确判定。
// 同步初始化到此已完成，界面骨架已存在，此时切换显示不会出现空白帧。
try {
    if (window.parent && window.parent !== window) {
        // v3.0.7：版本号改由 vite define 从 package.json 注入（原先硬编码，v3.0.6 漏改）
        const reportedVersion = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev';
        window.parent.postMessage({ type: 'calligraphy:ready', version: reportedVersion }, '*');
    }
} catch (e) { /* 跨源限制下忽略：启动器会走超时兜底 */ }

// 读取当前渲染选项（合并侧栏状态 + 字体选择 + 契约默认值）
// v2.4.4：新增 gridType 传递，描红透明度默认 0.1
function getRenderOptions() {
    const sb = getSidebarState();
    const fontSelect = document.getElementById('font-select');
    return {
        gridType: sb.gridType || 'mizi',
        fontFamily: fontSelect ? fontSelect.value : 'TW-Kai',
        traceOpacity: sb.traceOpacity != null ? sb.traceOpacity : 0.1
    };
}

function getGridContainer() {
    return document.getElementById('grid-container');
}

/** 字帖容器是否已有内容（决定能否走定向重绘；空容器只能全量生成） */
function hasRenderedSheet(container) {
    return !!container && container.childElementCount > 0;
}

/** 视觉反馈：字格容器边框闪一下 */
function flashUpdated(container) {
    if (!container) return;
    container.classList.add('just-updated');
    setTimeout(() => container.classList.remove('just-updated'), 400);
}

/** 保存历史记录（全量生成与切换字体共用） */
function recordHistory() {
    const inputEl = document.getElementById('inputText');
    const fontSelect = document.getElementById('font-select');
    if (!inputEl || !fontSelect) return;
    saveHistory(inputEl.value, fontSelect.value, fontSelect.options[fontSelect.selectedIndex].text);
}

// ── v3.0.7：外观变更 vs 内容变更的分流 ──────────────────────────
// 背景：'calligraphy:settings-updated' 原先是一个被**多方复用**的事件 ——
//   设置中心改网格/颜色/透明度会发它，手动改拼音组词、导入生字、AI 组词补齐
//   完成后也发它（后三者派发时不带任何设置变化）。
//   原先 main.js 一律全量重绘，于是「换个网格颜色」也要把每个汉字的拼音
//   重新过一遍 pinyin-pro、组词重新查库、笔画重新排进 hanzi-writer 异步队列。
//
// v3.0.7 的分工：
//   · 内容变更（生字 / 拼音 / 组词）一律派发**显式**信号 'calligraphy:content-updated'
//     → 全量重生成。派发方：fileImporter、manualEdit、settingsCenter 的 AI 组词补齐。
//   · 设置变更仍走 'calligraphy:settings-updated'，用「设置快照 diff」判断改了什么：
//       - diff 全部落在外观键内（网格颜色 / 网格式样 / 描红透明度）→ 定向重绘；
//       - diff 含任何非外观键（显示开关、格子尺寸等）或没有基线 → 全量重绘；
//       - diff 为空 → 什么都不做（设置没变就没有要重绘的东西）。
//   用快照 diff 而不是事件 detail：detail 的六个派发点载荷形状不一致，靠不住。
const GRID_REPAINT_KEYS = ['gridColorPreset', 'gridType'];
const APPEARANCE_KEYS = new Set([...GRID_REPAINT_KEYS, 'traceOpacity']);

let settingsSnapshot = null;

function takeSettingsSnapshot() {
    try {
        settingsSnapshot = JSON.stringify(getSettings());
    } catch {
        settingsSnapshot = null;
    }
}

/** @returns {string[]|null} 相对上次全量渲染变化的设置键；null = 无基线 */
function diffSettings() {
    if (!settingsSnapshot) return null;
    let prev;
    try {
        prev = JSON.parse(settingsSnapshot);
    } catch {
        return null;
    }
    const cur = getSettings();
    const keys = new Set([...Object.keys(prev), ...Object.keys(cur)]);
    const changed = [];
    for (const k of keys) {
        if (prev[k] !== cur[k]) changed.push(k);
    }
    return changed;
}

// 生成字帖（新 SVG 引擎）—— 全量重建，含拼音/组词/笔画
function handleGenerate() {
    const input = document.getElementById('inputText').value;
    const container = getGridContainer();
    if (!container) return;
    container.innerHTML = '';
    container.classList.add('svg-mode');
    const frag = renderSheet(input, getRenderOptions());
    container.appendChild(frag);

    recordHistory();
    takeSettingsSnapshot();
}

// 字体加载完成后首屏生成
loadFonts().then(() => {
    // v2.5.2：自动检测系统楷体字体（最多2种，性能开销 < 10ms）
    try { detectSystemFonts(); } catch(e) { console.warn('系统字体检测失败:', e); }
    updateCharCounter();
    handleGenerate();
});

// 事件绑定
document.getElementById('themeToggle').addEventListener('click', toggleTheme);

// v2.8.5：检测微信/QQ 内置浏览器（X5 内核拦截 window.print()）
// 在这些浏览器中打印按钮不响应，需引导用户在外部浏览器打开
function isWeChatX5Browser() {
    const ua = navigator.userAgent || '';
    return /MicroMessenger|QQBrowser\/[0-9]\.|QQ\//i.test(ua) && !/Windows NT|Macintosh/i.test(ua);
}

function handlePrintClick() {
    if (isWeChatX5Browser()) {
        console.warn('[main] 检测到微信/QQ 内置浏览器，window.print() 被 X5 内核拦截');
        // 用 toast 提示用户在外部浏览器打开
        const existing = document.querySelector('.puppeteer-toast');
        if (existing) existing.remove();
        const t = document.createElement('div');
        t.className = 'puppeteer-toast info';
        t.style.cssText = 'max-width:90vw;line-height:1.6;padding:16px 20px;text-align:left;';
        t.innerHTML = '<div style="font-size:14px;font-weight:bold;margin-bottom:8px;">⚠ 微信/QQ 内置浏览器不支持打印</div>' +
            '<div style="font-size:13px;">请按以下步骤操作：<br>' +
            '1. 点击右上角「⋯」菜单<br>' +
            '2. 选择「在浏览器中打开」<br>' +
            '3. 在新打开的浏览器中再点打印按钮</div>';
        document.body.appendChild(t);
        setTimeout(() => {
            t.style.opacity = '0';
            setTimeout(() => { if (t.parentNode) t.remove(); }, 300);
        }, 8000);
        return;
    }
    return exportPDF({ track: 'client-print' });
}

// 打印按钮：浏览器原生打印（轨 1a）
document.getElementById('printBtn').addEventListener('click', handlePrintClick);

// v2.4.11：快捷工具栏 — 生成 + 打印（主题用右上角☀）
document.getElementById('quick-generate-btn').addEventListener('click', handleGenerate);
document.getElementById('quick-print-btn').addEventListener('click', handlePrintClick);

document.getElementById('fontUpload').addEventListener('change', function(e) {
    handleFontUpload(e.target.files[0]);
    e.target.value = '';
});
document.getElementById('generate-btn').addEventListener('click', handleGenerate);
document.getElementById('clear-btn').addEventListener('click', function() {
    document.getElementById('inputText').value = '';
    document.getElementById('grid-container').innerHTML = '';
    document.getElementById('inputText').focus();
    updateCharCounter();
});
document.getElementById('hf-reset').addEventListener('click', function() {
    resetHF();
    this.style.background = 'rgba(239,68,68,0.3)';
    var self = this;
    setTimeout(function(){ self.style.background = ''; }, 300);
});
document.getElementById('inputText').addEventListener('input', updateCharCounter);

// v3.0.7：切换字体 → 定向重绘，不再全量重建。
// 两个原先的问题：
//   ① #font-select 在全仓**没有任何 change 监听**，换字体后必须手动点「刷新字帖」才生效；
//   ② 即便点了，走的也是 handleGenerate 全量重建 —— 拼音、组词、笔画全部重算重载。
// 字体只影响带 data-ge-font="user" 的文字节点（范字/描红/组词汉字）；
// 拼音文字固定用 TeXGyreAdventor、笔画是 hanzi-writer 的路径数据、网格线是几何线条，
// 三者都与字体无关，因此这里只写 font-family 属性，一个节点都不重建。
const fontSelectEl = document.getElementById('font-select');
if (fontSelectEl) {
    fontSelectEl.addEventListener('change', () => {
        const container = getGridContainer();
        if (!hasRenderedSheet(container)) {
            handleGenerate();
            return;
        }
        const { texts } = applySheetFont(container, fontSelectEl.value);
        recordHistory();
        flashUpdated(container);
        console.log(`[main] 字体切换 → 定向重绘 ${texts} 个文字节点（拼音/组词/笔画/网格均未重建）`);
    });
}

// 侧栏状态变化（预设模板）时实时重渲染
// v3.0.7：模板改的是**输入框里的生字**，属于内容变更，必须全量重建
document.addEventListener('calligraphy:sidebar-updated', () => {
    handleGenerate();
});

// v2.4.7：设置中心状态变化时实时重渲染
// v3.0.7：改为按「外观 / 内容」分流，只改网格颜色或式样时不再动生字、组词、拼音、笔画
document.addEventListener('calligraphy:settings-updated', () => {
    const container = getGridContainer();
    const changed = diffSettings();
    const appearanceOnly = !!changed && changed.length > 0 && changed.every(k => APPEARANCE_KEYS.has(k));

    if (appearanceOnly && hasRenderedSheet(container)) {
        if (changed.some(k => GRID_REPAINT_KEYS.includes(k))) {
            const r = repaintSheetGrid(container);
            console.log(`[main] 网格颜色/式样变更 → 重画 ${r.repainted} 个网格层，` +
                `其中 ${r.rebuiltContent} 格因式样改变而重建内容层（拼音/组词/笔画未重算）`);
        }
        if (changed.includes('traceOpacity')) {
            const r = applySheetTraceOpacity(container, getSettings().traceOpacity);
            console.log(`[main] 描红透明度变更 → 改写 ${r.texts} 个节点的 opacity 属性`);
        }
        takeSettingsSnapshot();
        flashUpdated(container);
        return;
    }

    // diff 为空 = 这次事件里设置一个字都没变（同一个值重复写入、或派发方根本不是在改设置）。
    // 此时什么都不做：内容变更有它自己的显式信号 'calligraphy:content-updated'，
    // 不靠"diff 为空"去反推。反推很脆 —— 滑块连发两次同值 input 就会误触发一次全量重建。
    if (changed && changed.length === 0) return;

    // diff 含非外观键（显示开关、格子大小、每字格数等）或没有基线
    // → 这些确实会改变字帖结构，保持原有的全量重绘行为
    handleGenerate();
    flashUpdated(container);
});

// v3.0.7：显式的「生字内容已变更」信号。派发方：导入生字（写入输入框之后）、
// 手动编辑拼音/组词、AI 组词补齐完成。不依赖任何推断，直接全量重生成整张字帖。
document.addEventListener('calligraphy:content-updated', () => {
    const container = getGridContainer();
    handleGenerate();
    flashUpdated(container);
});

// ── Lucide 图标：替换打印按钮图标为标准 Lucide printer SVG ──
const printBtn = document.getElementById('printBtn');
if (printBtn) {
    printBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>';
}

// v3.0.6：一次性告知用户 API Key 已不再明文写入本地存储（aiKeyStore 迁移的副作用）。
// 借鉴 shuaixiaodai-calligraphy v1.3.0 的存储模型：默认只存内存，
// 「记住 Key」需用户显式开启（sessionStorage / 明文 / PBKDF2+AES-GCM 口令加密三档）。
// 用动态 import：settingsCenter 也是懒加载 aiKeyStore，这里同样不把它提前拉进首屏依赖图。
import('./modules/aiKeyStore.js').then((m) => {
    try {
        if (typeof m.consumeKeyMigrationNotice !== 'function' || !m.consumeKeyMigrationNotice()) return;
        const t = document.createElement('div');
        t.className = 'puppeteer-toast info';
        t.style.cssText = 'max-width:90vw;line-height:1.6;padding:16px 20px;text-align:left;cursor:pointer;';
        // 纯 textContent，不拼 HTML
        const title = document.createElement('div');
        title.style.cssText = 'font-size:14px;font-weight:bold;margin-bottom:8px;';
        title.textContent = '🔒 安全提示：API Key 已从本地明文存储迁入内存';
        const body = document.createElement('div');
        body.style.cssText = 'font-size:13px;';
        body.textContent = '检测到旧版本保存在本地的 API Key，已迁入内存并从本地存储中删除。' +
            '刷新后默认不再保留；如需长期记住，请在「设置 → AI 控制台」中显式选择保存方式' +
            '（标签页级 / 明文 / 口令加密）。点击此处关闭。';
        t.append(title, body);
        const dismiss = () => {
            t.style.opacity = '0';
            setTimeout(() => { if (t.parentNode) t.remove(); }, 300);
        };
        t.addEventListener('click', dismiss);
        document.body.appendChild(t);
        setTimeout(dismiss, 12000);
    } catch { /* 忽略 */ }
}).catch(() => { /* aiKeyStore 不可用时静默跳过 */ });

// v2.8.0：PWA 更新提示，避免旧访客持续跑老代码
// v2.9.0：toast 改为常驻直到用户点击，防止真机长期运行旧代码导致版本归因失真
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('controllerchange', () => {
        const toast = document.createElement('div');
        toast.textContent = '✨ 已升级到新版本（当前运行的是旧版），点击此处刷新';
        toast.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);z-index:10001;padding:12px 20px;background:#22c55e;color:#fff;border-radius:8px;cursor:pointer;box-shadow:0 4px 16px rgba(0,0,0,0.2);font-size:14px';
        toast.onclick = () => location.reload();
        document.body.appendChild(toast);
        // v2.9.0：删除 setTimeout，常驻直到用户点击
    });
}

// v2.8.7：?printdebug=1 时注入页内日志浮层，真机验证打印管线行为
// v2.9.0：补充 hook console.warn / console.error，确保 iframe 打印路径的警告/异常在真机浮层可见
if (/[?&]printdebug=1/.test(location.search)) {
    const box = document.createElement('pre');
    box.id = 'printdebug-log';
    box.style.cssText = 'position:fixed;left:0;right:0;bottom:0;max-height:40vh;overflow:auto;' +
        'background:rgba(0,0,0,.85);color:#0f0;font:10px/1.4 monospace;z-index:999999;' +
        'margin:0;padding:6px;white-space:pre-wrap;pointer-events:auto;';
    document.body.appendChild(box);
    const fmt = (a) => a.map(x => { try { return typeof x === 'object' ? JSON.stringify(x) : String(x); } catch { return '[obj]'; } }).join(' ');
    const origLog = console.log;
    const origWarn = console.warn;
    const origErr = console.error;
    console.log = function(...a) {
        box.textContent += fmt(a) + '\n';
        box.scrollTop = box.scrollHeight;
        origLog.apply(console, a);
    };
    console.warn = function(...a) {
        box.textContent += '[WARN] ' + fmt(a) + '\n';
        box.scrollTop = box.scrollHeight;
        origWarn.apply(console, a);
    };
    console.error = function(...a) {
        box.textContent += '[ERROR] ' + fmt(a) + '\n';
        box.scrollTop = box.scrollHeight;
        origErr.apply(console, a);
    };
    const mq = window.matchMedia('print');
    mq.addEventListener('change', e => console.log('[printdebug] matchMedia print =', e.matches));
    window.addEventListener('afterprint', () => console.log('[printdebug] afterprint fired'));
    window.addEventListener('beforeprint', () => console.log('[printdebug] beforeprint fired'));
}
