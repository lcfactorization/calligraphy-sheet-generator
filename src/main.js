import './styles/main.css';
import { loadFonts, handleFontUpload, detectSystemFonts } from './modules/fontManager.js';
import { applyTheme, toggleTheme, updateCharCounter, resetHF } from './modules/settings.js';
// v2.4.0：切换到新 SVG 矢量字格引擎 + jsPDF/svg2pdf 双轨 PDF（保留旧模块作回退）
import { renderSheet } from './components/GridEngine.js';
import { exportPDF } from './utils/pdfExport.js';
import { initSidebar, getSidebarState } from './components/Sidebar.js';
import './modules/puppeteerClient.js'; // side-effect 导入
import { initHistory, saveHistory } from './modules/history.js';
import { initSettingsCenter } from './modules/settingsCenter.js';
import { initDifficulty } from './modules/difficulty.js';
import { registerFileImporter } from './modules/fileImporter.js';
import { registerRecommender } from './modules/recommender.js';
import { registerReportPanel } from './modules/reportPanel.js';

// 初始化
applyTheme();
initHistory();
initSettingsCenter();
initDifficulty();
registerFileImporter();
registerRecommender();
registerReportPanel();
initSidebar();

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

// 生成字帖（新 SVG 引擎）
function handleGenerate() {
    const input = document.getElementById('inputText').value;
    const container = document.getElementById('grid-container');
    if (!container) return;
    container.innerHTML = '';
    container.classList.add('svg-mode');
    const frag = renderSheet(input, getRenderOptions());
    container.appendChild(frag);

    // 保存历史记录
    const fontSelect = document.getElementById('font-select');
    const fontValue = fontSelect.value;
    const fontName = fontSelect.options[fontSelect.selectedIndex].text;
    saveHistory(input, fontValue, fontName);
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
// 打印按钮：浏览器原生打印（轨 1a）
document.getElementById('printBtn').addEventListener('click', () => exportPDF({ track: 'client-print' }));

// v2.4.11：快捷工具栏 — 生成 + 打印（主题用右上角☀）
document.getElementById('quick-generate-btn').addEventListener('click', handleGenerate);
document.getElementById('quick-print-btn').addEventListener('click', () => exportPDF({ track: 'client-print' }));

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

// 侧栏状态变化（预设模板）时实时重渲染
document.addEventListener('calligraphy:sidebar-updated', () => {
    handleGenerate();
});

// v2.4.7：设置中心状态变化（网格类型 / 描红透明度 / 格子大小等）时实时重渲染
// 与侧栏按钮等效，改的是同一全局变量（settingsCenter）
document.addEventListener('calligraphy:settings-updated', () => {
    handleGenerate();
    // 视觉反馈：字格容器边框闪一下
    const c = document.getElementById('grid-container');
    if (c) {
        c.classList.add('just-updated');
        setTimeout(() => c.classList.remove('just-updated'), 400);
    }
});

// ── Lucide 图标：替换打印按钮图标为标准 Lucide printer SVG ──
const printBtn = document.getElementById('printBtn');
if (printBtn) {
    printBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>';
}

// v2.8.0：PWA 更新提示，避免旧访客持续跑老代码
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('controllerchange', () => {
        const toast = document.createElement('div');
        toast.textContent = '✨ 已升级到新版本，点击刷新加载';
        toast.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);z-index:10001;padding:12px 20px;background:#22c55e;color:#fff;border-radius:8px;cursor:pointer;box-shadow:0 4px 16px rgba(0,0,0,0.2);font-size:14px';
        toast.onclick = () => location.reload();
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 10000);
    });
}
