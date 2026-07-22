// 历史记录模块（A-1）
// localStorage key: calligraphy_history，最多 20 条

const HISTORY_KEY = 'calligraphy_history';
const MAX_HISTORY = 20;

// 当前记录 ID（供 feedback 模块读取，用于整体反馈绑定）
let currentRecordId = null;
let sidebarOpen = false;

/** 读取全部历史记录 */
export function getHistory() {
    try {
        const raw = localStorage.getItem(HISTORY_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch (e) {
        return [];
    }
}

function setHistory(list) {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(list));
}

/** 获取当前记录 ID（供 feedback 模块使用） */
export function getCurrentRecordId() {
    return currentRecordId;
}

/** 保存一条历史记录，返回新记录的 id */
export function saveHistory(text, fontValue, fontName) {
    if (!text) return null;
    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    const record = {
        id: now.getTime(),
        date: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
        time: `${pad(now.getHours())}:${pad(now.getMinutes())}`,
        textPreview: text.substring(0, 20),
        fullText: text,
        font: fontName,
        fontValue: fontValue,
        charCount: text.length,
        feedback: null
    };
    let list = getHistory();
    list.unshift(record);
    if (list.length > MAX_HISTORY) list = list.slice(0, MAX_HISTORY);
    setHistory(list);
    currentRecordId = record.id;
    renderHistory();
    document.dispatchEvent(new CustomEvent('calligraphy:history-updated'));
    return record.id;
}

/** 更新某条记录的整体反馈字段（供 feedback 模块调用） */
export function updateRecordFeedback(recordId, feedback) {
    if (recordId === null || recordId === undefined) return;
    const list = getHistory();
    const idx = list.findIndex(r => r.id === recordId);
    if (idx !== -1) {
        list[idx].feedback = feedback;
        setHistory(list);
        renderHistory();
    }
}

function feedbackLabel(f) {
    return ({ mastered: '已掌握', review: '待复习', error: '需巩固' })[f] || '';
}

function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}

function renderHistory() {
    const listEl = document.getElementById('historyList');
    if (!listEl) return;
    const records = getHistory();
    if (records.length === 0) {
        listEl.innerHTML = '<div class="history-empty">暂无历史记录</div>';
        return;
    }
    listEl.innerHTML = records.map(r => `
        <div class="history-item ${r.id === currentRecordId ? 'current' : ''}" data-id="${r.id}">
            <div class="history-item-top">
                <span class="history-date">${r.date} ${r.time}</span>
                <span class="history-font">${escapeHtml(r.font || '')}</span>
            </div>
            <div class="history-preview">${escapeHtml(r.textPreview || '')}${r.charCount > 20 ? '…' : ''}</div>
            <div class="history-meta">
                <span class="history-count">${r.charCount} 字</span>
                ${r.feedback ? `<span class="history-feedback ${r.feedback}">${feedbackLabel(r.feedback)}</span>` : ''}
            </div>
            <div class="history-item-actions">
                <button class="history-btn history-regen" data-action="regen" data-id="${r.id}">重新生成</button>
                <button class="history-btn history-del" data-action="delete" data-id="${r.id}">删除</button>
            </div>
        </div>
    `).join('');
}

function openSidebar() {
    sidebarOpen = true;
    const sb = document.getElementById('historySidebar');
    const fab = document.getElementById('historyFab');
    if (sb) sb.classList.add('open');
    if (fab) fab.classList.add('hidden');
}

function closeSidebar() {
    sidebarOpen = false;
    const sb = document.getElementById('historySidebar');
    const fab = document.getElementById('historyFab');
    if (sb) sb.classList.remove('open');
    if (fab) fab.classList.remove('hidden');
}

function deleteRecord(id) {
    let list = getHistory();
    list = list.filter(r => r.id !== id);
    setHistory(list);
    if (currentRecordId === id) {
        const records = getHistory();
        currentRecordId = records.length > 0 ? records[0].id : null;
    }
    renderHistory();
    document.dispatchEvent(new CustomEvent('calligraphy:history-updated'));
}

/** 从历史记录恢复文本与字体并重新生成字帖 */
function regenerate(id) {
    const list = getHistory();
    const record = list.find(r => r.id === id);
    if (!record) return;
    const input = document.getElementById('inputText');
    input.value = record.fullText || '';
    input.dispatchEvent(new Event('input'));
    const fontSelect = document.getElementById('font-select');
    if (fontSelect) {
        for (const opt of fontSelect.options) {
            if (opt.value === record.fontValue) {
                opt.selected = true;
                break;
            }
        }
    }
    closeSidebar();
    document.getElementById('generate-btn').click();
}

/** 初始化历史记录侧边栏 */
export function initHistory() {
    const fab = document.getElementById('historyFab');
    const toggle = document.getElementById('historyToggle');
    const listEl = document.getElementById('historyList');
    const clearBtn = document.getElementById('historyClearBtn');

    if (fab) fab.addEventListener('click', openSidebar);
    if (toggle) toggle.addEventListener('click', closeSidebar);

    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            if (confirm('确定清空所有历史记录？此操作不可撤销。')) {
                setHistory([]);
                currentRecordId = null;
                renderHistory();
                document.dispatchEvent(new CustomEvent('calligraphy:history-updated'));
            }
        });
    }

    if (listEl) {
        listEl.addEventListener('click', (e) => {
            const btn = e.target.closest('button[data-action]');
            if (!btn) return;
            const action = btn.dataset.action;
            const id = Number(btn.dataset.id);
            if (action === 'delete') deleteRecord(id);
            else if (action === 'regen') regenerate(id);
        });
    }

    renderHistory();
}
