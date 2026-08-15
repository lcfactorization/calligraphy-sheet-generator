// v1.2.0 模块：手动修改模式（简化版）
// 点击字帖行右侧"拼音+组词"区域 → 弹出轻量编辑浮层 → 写 ai_zuci_cache_v1（userEdited 标记）
// → dispatch calligraphy:settings-updated 全量重绘。优先级：手动 > AI > 默认词库。
// 复用 .sc-overlay / .sc-modal / .sc-field 样式（settingsCenter.css），不依赖字格 DOM 节点。

import { updateAiZuciCache, clearUserEdit } from './aiZuci.js';
import { convert } from './pinyin.js';

let currentEditChar = null;

function openEditModal(char, pinyin, zuci) {
    // 复用 .sc-overlay/.sc-modal 样式；若已打开先关旧
    closeEditModal();
    const [w1 = '', w2 = ''] = Array.isArray(zuci) ? zuci : [];
    const overlay = document.createElement('div');
    overlay.className = 'sc-overlay';
    overlay.id = 'manualEditOverlay';
    overlay.innerHTML = `
        <div class="sc-modal" role="dialog" aria-modal="true">
            <div class="sc-header">
                <span class="sc-title">✏️ 手动修改「${char}」</span>
                <div class="sc-window-controls">
                    <button type="button" class="sc-btn-min" id="meMin" aria-label="最小化" title="最小化">▁</button>
                    <button type="button" class="sc-btn-max" id="meMax" aria-label="最大化" title="最大化">□</button>
                    <button class="sc-close" id="meClose" aria-label="关闭">✕</button>
                </div>
            </div>
            <div class="sc-body">
                <div class="sc-field"><label>拼音（支持数字声调，如 xian1 或 xiān）</label>
                    <input id="mePinyin" value="${pinyin || ''}" placeholder="自动识别可留空"></div>
                <div class="sc-field"><label>组词 1</label>
                    <input id="meZuci1" value="${w1}" placeholder="二字词"></div>
                <div class="sc-field"><label>组词 2</label>
                    <input id="meZuci2" value="${w2}" placeholder="二字词"></div>
                <div class="sc-hint" style="font-size:11px;color:#6b7280;margin-top:4px;">
                    保存后自动写入缓存并刷新字帖；手动修改优先于 AI 与默认词库。
                </div>
            </div>
            <div class="sc-footer">
                <button class="btn btn-ghost" id="meClear" type="button">清除手动修改</button>
                <button class="btn btn-ghost" id="meCancel" type="button">取消</button>
                <button class="btn btn-primary" id="meSave" type="button">保存</button>
            </div>
        </div>`;
    document.body.appendChild(overlay);
    // 与 settingsCenter 相同的打开方式：默认 display:none，显式置 flex + .open 触发动画
    overlay.style.display = 'flex';
    void overlay.offsetWidth; // 强制重排以触发过渡动画
    overlay.classList.add('open');
    currentEditChar = char;

    overlay.querySelector('#meClose').addEventListener('click', closeEditModal);
    overlay.querySelector('#meCancel').addEventListener('click', closeEditModal);
    // v3.0.2：最小化/最大化按钮
    const meModal = overlay.querySelector('.sc-modal');
    overlay.querySelector('#meMin').addEventListener('click', () => {
        meModal.classList.toggle('minimized');
    });
    overlay.querySelector('#meMax').addEventListener('click', () => {
        if (meModal.classList.contains('minimized')) {
            meModal.classList.remove('minimized');
            meModal.classList.add('maximized');
        } else {
            meModal.classList.toggle('maximized');
        }
    });
    // v3.0.2：移除"点击遮罩外部关闭"逻辑（与笔顺演示弹窗行为一致）
    // overlay.addEventListener('click', e => { if (e.target === overlay) closeEditModal(); });
    overlay.querySelector('#meSave').addEventListener('click', () => {
        const rawPy = overlay.querySelector('#mePinyin').value.trim();
        // 自动转换数字声调为符号（xian1 → xiān），兼容已带声调或空值
        const py = rawPy ? convert(rawPy, { format: 'numToSymbol' }) : '';
        const z1 = overlay.querySelector('#meZuci1').value.trim();
        const z2 = overlay.querySelector('#meZuci2').value.trim();
        updateAiZuciCache(char, {
            pinyin: py,
            zuci: [z1, z2].filter(Boolean)   // 留空字段由 updateAiZuciCache 保留旧值
        });
        closeEditModal();
        document.dispatchEvent(new CustomEvent('calligraphy:settings-updated'));
    });
    overlay.querySelector('#meClear').addEventListener('click', () => {
        clearUserEdit(char);
        closeEditModal();
        document.dispatchEvent(new CustomEvent('calligraphy:settings-updated'));
    });
    // 自动聚焦拼音框
    overlay.querySelector('#mePinyin').focus();
}

function closeEditModal() {
    const el = document.getElementById('manualEditOverlay');
    if (el) el.remove();
    currentEditChar = null;
}

/** 初始化：事件委托，点击字格行 → 弹出编辑浮层 */
export function initManualEdit() {
    document.addEventListener('click', (e) => {
        const row = e.target.closest?.('.grid-svg-row');
        if (!row) return;
        // 避开左侧字格点击（那是笔顺演示区，由 initStrokeDemoClick 接管）
        if (e.target.closest?.('.grid-svg-cell[data-char]') &&
            !e.target.closest?.('.grid-svg-cell[data-grid-type="pinyin-zuci"]')) {
            return;
        }
        const char = row.getAttribute('data-char');
        if (!char) return;
        // 避免与笔顺演示弹窗冲突：若已有其他可见 modal 打开则跳过
        // v3.0.2：改为仅当其他 modal 可见时才跳过（隐藏的已关闭弹窗不应阻塞）
        const openModal = [...document.querySelectorAll('.sc-modal[aria-modal="true"]')]
            .find(m => m.offsetParent !== null || (m.getBoundingClientRect().width > 0 && m.getBoundingClientRect().height > 0));
        if (openModal) return;
        const pinyin = row.getAttribute('data-pinyin') || '';
        const zuci = (row.getAttribute('data-zuci') || '').split('|');
        openEditModal(char, pinyin, zuci);
    });
}
