// v3.1.0 生字卡表格版式（block-table）：组词面板手动编辑浮层
// 点击 .bt-zuci 区域（.bt-zhead 上的档位 pill 除外，档位切换由设置侧逻辑接管）
// → 弹出编辑浮层（拼音 + 组词 1/2，各 2–4 字）→ updateAiZuciMulti 写缓存
// → dispatch calligraphy:content-updated 全量重生成（与经典 manualEdit 同模式）。
// 复用 .sc-overlay / .sc-modal / .sc-field 样式（settingsCenter.css），交互骨架参照
// manualEdit.js；本模块只负责浮层交互，不做任何渲染（渲染是 BlockTableEngine 的职责）。
//
// 与笔顺演示弹窗（strokeDemoModal）的隔离是双保险：
//   ① 块帖组词格类名为 .bt-zcell、且不带 data-char 属性（渲染契约），strokeDemoModal 的
//      #grid-container 委托只认 .grid-svg-cell[data-char]，命中不到组词区；
//   ② 本模块接管点击后调用 e.stopPropagation()，阻断其他 document 级委托再响应。

import { updateAiZuciMulti, clearUserEditMulti } from './aiZuci.js';
import { convert } from './pinyin.js';
import { sanitizeChar } from '../utils/sanitize.js';

let currentEditChar = null;

function openEditModal(char, pinyin, zuciMulti) {
    // 字符必须经 sanitizeChar 清洗成单汉字才可插值进模板（数据管线铁律）
    const safeChar = sanitizeChar(char);
    if (!safeChar) return;
    // 复用 .sc-overlay/.sc-modal 样式；若已打开先关旧
    closeEditModal();
    const [w1 = '', w2 = ''] = Array.isArray(zuciMulti) ? zuciMulti : [];
    const overlay = document.createElement('div');
    overlay.className = 'sc-overlay';
    overlay.id = 'btManualEditOverlay';
    // 模板只含固定结构（无任何数据插值）；标题走 textContent、输入框初值挂载后用
    // .value 属性写入——任何用户数据都不经过 HTML 解析（遵守 sanitize.js 管线）
    overlay.innerHTML = `
        <div class="sc-modal" role="dialog" aria-modal="true">
            <div class="sc-header">
                <span class="sc-title" id="btmeTitle"></span>
                <div class="sc-window-controls">
                    <button type="button" class="sc-btn-min" id="btmeMin" aria-label="最小化" title="最小化">▁</button>
                    <button type="button" class="sc-btn-max" id="btmeMax" aria-label="最大化" title="最大化">□</button>
                    <button class="sc-close" id="btmeClose" aria-label="关闭">✕</button>
                </div>
            </div>
            <div class="sc-body">
                <div class="sc-field"><label>拼音（支持数字声调，如 xian1 或 xiān）</label>
                    <input id="btmePinyin" placeholder="自动识别可留空，支持 xian1 或 xiān"></div>
                <div class="sc-field"><label>组词 1</label>
                    <input id="btmeZuci1" placeholder="2–4 字词"></div>
                <div class="sc-field"><label>组词 2</label>
                    <input id="btmeZuci2" placeholder="2–4 字词"></div>
                <div class="sc-hint" style="font-size:11px;color:#6b7280;margin-top:4px;">
                    保存后仅影响生字卡版式的组词面板与拼音；手动修改优先于 AI 与默认词库。
                </div>
            </div>
            <div class="sc-footer">
                <button class="btn btn-ghost" id="btmeClear" type="button">清除手动修改</button>
                <button class="btn btn-ghost" id="btmeCancel" type="button">取消</button>
                <button class="btn btn-primary" id="btmeSave" type="button">保存</button>
            </div>
        </div>`;
    document.body.appendChild(overlay);
    // 挂载后写入动态值（textContent / .value，不拼 HTML）
    overlay.querySelector('#btmeTitle').textContent = `✏️ 编辑生字卡「${safeChar}」`;
    overlay.querySelector('#btmePinyin').value = pinyin || '';
    overlay.querySelector('#btmeZuci1').value = w1;
    overlay.querySelector('#btmeZuci2').value = w2;
    // 与 settingsCenter 相同的打开方式：默认 display:none，显式置 flex + .open 触发动画
    overlay.style.display = 'flex';
    void overlay.offsetWidth; // 强制重排以触发过渡动画
    overlay.classList.add('open');
    currentEditChar = safeChar;

    overlay.querySelector('#btmeClose').addEventListener('click', closeEditModal);
    overlay.querySelector('#btmeCancel').addEventListener('click', closeEditModal);
    // 最小化/最大化按钮（与 manualEdit 同款交互）
    const btmeModal = overlay.querySelector('.sc-modal');
    overlay.querySelector('#btmeMin').addEventListener('click', () => {
        btmeModal.classList.toggle('minimized');
    });
    overlay.querySelector('#btmeMax').addEventListener('click', () => {
        if (btmeModal.classList.contains('minimized')) {
            btmeModal.classList.remove('minimized');
            btmeModal.classList.add('maximized');
        } else {
            btmeModal.classList.toggle('maximized');
        }
    });
    overlay.querySelector('#btmeSave').addEventListener('click', () => {
        const rawPy = overlay.querySelector('#btmePinyin').value.trim();
        // 自动转换数字声调为符号（xian1 → xiān），兼容已带声调或空值
        const py = rawPy ? convert(rawPy, { format: 'numToSymbol' }) : '';
        const z1 = overlay.querySelector('#btmeZuci1').value.trim();
        const z2 = overlay.querySelector('#btmeZuci2').value.trim();
        // 两词允许留空：清洗（sanitizeZuci 丢空/非法词）与"保留旧值"语义在 aiZuci 侧处理
        updateAiZuciMulti(currentEditChar, {
            pinyin: py,
            zuciMulti: [z1, z2]
        });
        closeEditModal();
        document.dispatchEvent(new CustomEvent('calligraphy:content-updated'));
    });
    overlay.querySelector('#btmeClear').addEventListener('click', () => {
        clearUserEditMulti(currentEditChar);
        closeEditModal();
        document.dispatchEvent(new CustomEvent('calligraphy:content-updated'));
    });
    // 自动聚焦拼音框
    overlay.querySelector('#btmePinyin').focus();
}

function closeEditModal() {
    const el = document.getElementById('btManualEditOverlay');
    if (el) el.remove();
    currentEditChar = null;
}

/** 初始化：document 级事件委托，点击块帖组词面板 → 弹出编辑浮层 */
export function initBtManualEdit() {
    document.addEventListener('click', (e) => {
        // 只接管组词面板；.bt-zhead 上的档位 pill 点击留给档位切换逻辑
        if (!e.target.closest?.('.bt-zuci')) return;
        if (e.target.closest?.('.bt-zhead')) return;
        // 词源数据在块根节点：data-char / data-pinyin / data-zuci-multi（'|' 分隔）
        const block = e.target.closest?.('.bt-block');
        const char = sanitizeChar(block?.getAttribute('data-char'));
        if (!char) return;
        // 避免与其他弹窗冲突：已有可见 modal 打开则跳过（与 manualEdit 互斥逻辑一致；
        // 隐藏的已关闭弹窗不应阻塞）
        const openModal = [...document.querySelectorAll('.sc-modal[aria-modal="true"]')]
            .find(m => m.offsetParent !== null || (m.getBoundingClientRect().width > 0 && m.getBoundingClientRect().height > 0));
        if (openModal) return;
        const pinyin = block.getAttribute('data-pinyin') || '';
        const zuciMulti = (block.getAttribute('data-zuci-multi') || '').split('|').filter(Boolean);
        // 阻断其他委托再响应（笔顺演示隔离的第二重保险，见文件头注释）
        e.stopPropagation();
        openEditModal(char, pinyin, zuciMulti);
    });
}
