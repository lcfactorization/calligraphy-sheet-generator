// 演示模式模块（C-3）
// 点击后加载示例文本/随机模板，自动生成字帖并滚动到显示区

import { templates } from '../data/templates.js';

const DEFAULT_DEMO_TEXT = '天地玄黄宇宙洪荒日月盈昃辰宿列张';
const DEFAULT_DEMO_FONT = 'LXGWWenKai';

let hintTimer = null;

/** 从模板库随机选择一个模板 */
function pickRandomTemplate() {
    if (!templates || templates.length === 0) return null;
    const idx = Math.floor(Math.random() * templates.length);
    return templates[idx];
}

/** 显示操作提示（3 秒后消失） */
function showHint(message) {
    let hint = document.getElementById('demoHint');
    if (!hint) {
        hint = document.createElement('div');
        hint.id = 'demoHint';
        hint.className = 'demo-hint';
        document.body.appendChild(hint);
    }
    hint.textContent = message;
    hint.classList.add('show');

    if (hintTimer) clearTimeout(hintTimer);
    hintTimer = setTimeout(() => {
        hint.classList.remove('show');
    }, 3000);
}

/** 开始演示 */
export function startDemo() {
    const input = document.getElementById('inputText');
    const fontSelect = document.getElementById('font-select');
    if (!input || !fontSelect) return;

    // 50% 概率使用默认示例，50% 概率从模板库随机选择
    const useTemplate = templates && templates.length > 0 && Math.random() < 0.5;
    let text = DEFAULT_DEMO_TEXT;
    let fontValue = DEFAULT_DEMO_FONT;
    let hintMsg = '演示已加载：千字文节选 · 霞鹜文楷';

    if (useTemplate) {
        const tpl = pickRandomTemplate();
        if (tpl && tpl.text) {
            text = tpl.text;
            hintMsg = `演示已加载：《${tpl.name}》${tpl.author ? ' · ' + tpl.author : ''}`;
        }
    }

    // 设置输入框
    input.value = text;
    input.dispatchEvent(new Event('input'));

    // 设置字体为霞鹜文楷
    for (const opt of fontSelect.options) {
        if (opt.value === fontValue) {
            opt.selected = true;
            break;
        }
    }

    // 自动生成字帖（复用主流程：保存历史 + 显示反馈区）
    const generateBtn = document.getElementById('generate-btn');
    if (generateBtn) {
        generateBtn.click();
    }

    // 滚动到字帖显示区
    setTimeout(() => {
        const grid = document.getElementById('grid-container');
        if (grid) grid.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);

    // 显示操作提示
    showHint(hintMsg);
}

/** 初始化演示按钮 */
export function initDemoMode() {
    const btn = document.getElementById('demoBtn');
    if (btn) {
        btn.addEventListener('click', startDemo);
    }
}
