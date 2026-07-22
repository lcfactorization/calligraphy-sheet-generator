// 练习反馈模块（A-2）
// 整体反馈：更新当前历史记录的 feedback 字段
// 单字反馈：localStorage key: calligraphy_char_feedback
// 通过 DOM 事件委托实现，不修改 gridRenderer.js

import { getCurrentRecordId, updateRecordFeedback } from './history.js';

const CHAR_FEEDBACK_KEY = 'calligraphy_char_feedback';

const STATUS_LABELS = {
    mastered: '已掌握',
    review: '待复习',
    error: '总是写错'
};

// Lucide SVG 图标
const ICON_CHECK = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
const ICON_REFRESH = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>';
const ICON_X = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';

/** 读取单字反馈数据（供 review 模块使用） */
export function getCharFeedbackData() {
    try {
        const raw = localStorage.getItem(CHAR_FEEDBACK_KEY);
        return raw ? JSON.parse(raw) : {};
    } catch (e) {
        return {};
    }
}

/** 写入单字反馈数据（供 review 模块使用） */
export function setCharFeedbackData(data) {
    localStorage.setItem(CHAR_FEEDBACK_KEY, JSON.stringify(data));
}

function todayStr() {
    const n = new Date();
    const p = x => String(x).padStart(2, '0');
    return `${n.getFullYear()}-${p(n.getMonth() + 1)}-${p(n.getDate())}`;
}

function showStatus(msg) {
    const el = document.getElementById('feedbackStatus');
    if (el) el.textContent = msg;
}

/** 初始化反馈区域：整体反馈按钮 + 单字反馈事件委托 */
export function initFeedback() {
    const area = document.getElementById('feedbackArea');
    if (!area) return;

    // 整体反馈按钮
    area.addEventListener('click', (e) => {
        const btn = e.target.closest('.feedback-btn[data-feedback]');
        if (!btn) return;
        const feedback = btn.dataset.feedback;
        const recordId = getCurrentRecordId();
        if (recordId === null || recordId === undefined) {
            showStatus('请先点击「生成字帖」后再反馈');
            return;
        }
        updateRecordFeedback(recordId, feedback);
        area.querySelectorAll('.feedback-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        showStatus(`已标记：${STATUS_LABELS[feedback]}`);
    });

    // 单字反馈：事件委托在字帖容器上
    const grid = document.getElementById('grid-container');
    if (grid) {
        grid.addEventListener('click', onGridClick);
    }

    // 点击空白关闭单字反馈弹层
    document.addEventListener('click', (e) => {
        const pop = document.getElementById('charFeedbackPopover');
        if (!pop || pop.style.display === 'none') return;
        if (!pop.contains(e.target) && !e.target.closest('.char-feedback-btn')) {
            pop.style.display = 'none';
        }
    });

    // 窗口滚动/缩放时隐藏弹层
    window.addEventListener('scroll', hidePopover, true);
    window.addEventListener('resize', hidePopover);
}

/** 显示反馈区域并为字帖格子附加单字反馈按钮 */
export function showFeedbackUI(recordId) {
    const area = document.getElementById('feedbackArea');
    if (!area) return;
    area.style.display = '';

    // 重置整体反馈按钮高亮
    area.querySelectorAll('.feedback-btn').forEach(b => b.classList.remove('active'));

    // 若有当前记录且已有整体反馈，恢复高亮
    const rid = (recordId !== undefined && recordId !== null) ? recordId : getCurrentRecordId();
    if (rid !== null && rid !== undefined) {
        try {
            const records = JSON.parse(localStorage.getItem('calligraphy_history')) || [];
            const rec = records.find(r => r.id === rid);
            if (rec && rec.feedback) {
                const btn = area.querySelector(`.feedback-btn[data-feedback="${rec.feedback}"]`);
                if (btn) btn.classList.add('active');
                showStatus(`已标记：${STATUS_LABELS[rec.feedback]}`);
            } else {
                showStatus('');
            }
        } catch (e) {
            showStatus('');
        }
    } else {
        showStatus('');
    }

    attachCharFeedbackButtons();
}

/** 为每个字帖行的首个格子附加单字反馈按钮 */
function attachCharFeedbackButtons() {
    const rows = document.querySelectorAll('#grid-container .char-row');
    const data = getCharFeedbackData();
    rows.forEach(row => {
        const cell = row.querySelector('.cell.black');
        if (!cell) return;
        const span = cell.querySelector('span');
        if (!span) return;
        const char = span.textContent.trim();
        if (!char) return;
        if (cell.querySelector('.char-feedback-btn')) return; // 已添加
        cell.setAttribute('data-char', char);
        applyCharStatus(cell, char, data);
        const btn = document.createElement('button');
        btn.className = 'char-feedback-btn';
        btn.setAttribute('data-char', char);
        btn.setAttribute('aria-label', '标记单字反馈');
        btn.title = '标记单字状态';
        btn.innerHTML = ICON_CHECK;
        cell.appendChild(btn);
    });
}

function applyCharStatus(cell, char, data) {
    cell.classList.remove('char-mastered', 'char-review', 'char-error');
    const info = data[char];
    if (info && info.status) {
        cell.classList.add('char-' + info.status);
    }
}

let currentPopoverChar = null;

function onGridClick(e) {
    const btn = e.target.closest('.char-feedback-btn');
    if (!btn) return;
    e.stopPropagation();
    const char = btn.getAttribute('data-char');
    currentPopoverChar = char;
    showPopover(btn, char);
}

function showPopover(anchor, char) {
    let pop = document.getElementById('charFeedbackPopover');
    if (!pop) {
        pop = document.createElement('div');
        pop.id = 'charFeedbackPopover';
        pop.className = 'char-feedback-popover';
        document.body.appendChild(pop);
        pop.addEventListener('click', (ev) => {
            const b = ev.target.closest('button[data-status]');
            if (!b) return;
            ev.stopPropagation();
            const status = b.dataset.status;
            markChar(currentPopoverChar, status);
            hidePopover();
        });
    }
    const info = getCharFeedbackData()[char];
    const active = (s) => (info && info.status === s) ? 'active' : '';
    pop.innerHTML = `
        <div class="popover-title">「${char}」标记状态</div>
        <button class="popover-btn mastered ${active('mastered')}" data-status="mastered">${ICON_CHECK}<span>已掌握</span></button>
        <button class="popover-btn review ${active('review')}" data-status="review">${ICON_REFRESH}<span>需要复习</span></button>
        <button class="popover-btn error ${active('error')}" data-status="error">${ICON_X}<span>总是写错</span></button>
    `;
    const rect = anchor.getBoundingClientRect();
    pop.style.display = 'block';
    let left = rect.left + window.scrollX;
    const popWidth = 150;
    if (left + popWidth > window.innerWidth - 8) {
        left = window.innerWidth - popWidth - 8;
    }
    pop.style.left = Math.max(8, left) + 'px';
    pop.style.top = (rect.bottom + window.scrollY + 4) + 'px';
}

function hidePopover() {
    const pop = document.getElementById('charFeedbackPopover');
    if (pop) pop.style.display = 'none';
}

/** 标记单字状态并保存 */
function markChar(char, status) {
    if (!char) return;
    const data = getCharFeedbackData();
    const prev = data[char] || { status: null, lastPractice: null, practiceCount: 0 };
    data[char] = {
        status: status,
        lastPractice: todayStr(),
        practiceCount: (prev.practiceCount || 0) + 1
    };
    setCharFeedbackData(data);

    // 更新所有同字格子样式
    document.querySelectorAll(`#grid-container .cell[data-char="${char}"]`).forEach(cell => {
        applyCharStatus(cell, char, data);
    });

    // 通知复习模块刷新
    document.dispatchEvent(new CustomEvent('calligraphy:char-feedback-updated'));
}
