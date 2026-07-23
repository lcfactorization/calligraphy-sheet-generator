import './styles/main.css';
import { loadFonts, handleFontUpload } from './modules/fontManager.js';
import { applyTheme, toggleTheme, updateCharCounter, resetHF } from './modules/settings.js';
import { generateGrid } from './modules/gridRenderer.js';
import { printToPDF } from './modules/pdfExport.js';
import './modules/puppeteerClient.js'; // side-effect导入
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

// 生成字帖钩子：在 generateGrid 后保存历史记录
function handleGenerate() {
    generateGrid();
    const text = document.getElementById('inputText').value;
    const fontSelect = document.getElementById('font-select');
    const fontValue = fontSelect.value;
    const fontName = fontSelect.options[fontSelect.selectedIndex].text;
    saveHistory(text, fontValue, fontName);
}

loadFonts().then(() => {
    updateCharCounter();
    generateGrid();
});

// 事件绑定
document.getElementById('themeToggle').addEventListener('click', toggleTheme);
document.getElementById('printBtn').addEventListener('click', printToPDF);
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

// ── Lucide 图标：替换打印按钮图标为标准 Lucide printer SVG ──
const printBtn = document.getElementById('printBtn');
if (printBtn) {
    printBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>';
}
