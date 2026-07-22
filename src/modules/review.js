// 复习计划模块（A-3）
// 复习规则：mastered→7天 / review→3天 / error→1天
// 基于单字反馈数据（calligraphy_char_feedback）生成今日待复习列表

import { getCharFeedbackData, setCharFeedbackData } from './feedback.js';

const INTERVAL_DAYS = { mastered: 7, review: 3, error: 1 };

function todayStr() {
    const n = new Date();
    const p = x => String(x).padStart(2, '0');
    return `${n.getFullYear()}-${p(n.getMonth() + 1)}-${p(n.getDate())}`;
}

function parseDate(dateStr) {
    if (!dateStr) return null;
    const d = new Date(dateStr + 'T00:00:00');
    return isNaN(d.getTime()) ? null : d;
}

function addDays(date, days) {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d;
}

function getReviewDate(charData) {
    const last = parseDate(charData.lastPractice);
    if (!last) return null;
    const interval = INTERVAL_DAYS[charData.status] || 1;
    return addDays(last, interval);
}

function isDueForReview(charData) {
    if (!charData.lastPractice) return false;
    const reviewDate = getReviewDate(charData);
    if (!reviewDate) return false;
    const today = parseDate(todayStr());
    return reviewDate <= today;
}

/** 获取今日待复习字列表 */
export function getTodayReviewChars() {
    const data = getCharFeedbackData();
    const today = todayStr();
    const todayDate = parseDate(today);
    const due = [];
    for (const char in data) {
        if (!Object.prototype.hasOwnProperty.call(data, char)) continue;
        const info = data[char];
        if (!info || !info.status) continue;
        if (isDueForReview(info)) {
            const last = parseDate(info.lastPractice);
            const daysSince = last ? Math.floor((todayDate - last) / (1000 * 60 * 60 * 24)) : 0;
            due.push({
                char,
                status: info.status,
                lastPractice: info.lastPractice,
                daysSince: daysSince
            });
        }
    }
    return due;
}

function renderReview() {
    const charsEl = document.getElementById('reviewChars');
    const statsEl = document.getElementById('reviewStats');
    const startBtn = document.getElementById('reviewStartBtn');
    const countEl = document.getElementById('reviewCount');
    if (!charsEl) return;

    const due = getTodayReviewChars();
    const data = getCharFeedbackData();

    // 统计信息
    let mastered = 0, review = 0, error = 0;
    for (const c in data) {
        if (!Object.prototype.hasOwnProperty.call(data, c)) continue;
        const s = data[c] && data[c].status;
        if (s === 'mastered') mastered++;
        else if (s === 'review') review++;
        else if (s === 'error') error++;
    }
    if (statsEl) {
        statsEl.innerHTML =
            `已掌握 <b class="st mastered">${mastered}</b> · ` +
            `待复习 <b class="st review">${review}</b> · ` +
            `错字 <b class="st error">${error}</b>`;
    }
    if (countEl) countEl.textContent = due.length;

    if (due.length === 0) {
        charsEl.innerHTML = '<div class="review-empty">🎉 今日无待复习字，继续练习新字吧！</div>';
        if (startBtn) { startBtn.disabled = true; startBtn.textContent = '暂无待复习'; }
    } else {
        charsEl.innerHTML = due.map(d => `
            <span class="review-char ${d.status}" title="上次练习：${d.lastPractice}（${d.daysSince}天前）· 状态：${statusLabel(d.status)}">
                <span class="rc-char">${d.char}</span>
                <span class="rc-days">${d.daysSince}天</span>
            </span>
        `).join('');
        if (startBtn) { startBtn.disabled = false; startBtn.textContent = `开始复习（${due.length} 字）`; }
    }
}

function statusLabel(s) {
    return ({ mastered: '已掌握', review: '待复习', error: '总是写错' })[s] || '';
}

/** 开始复习：加载待复习字到输入框并生成字帖，更新 lastPractice */
function startReview() {
    const due = getTodayReviewChars();
    if (due.length === 0) return;
    const text = due.map(d => d.char).join('');
    const input = document.getElementById('inputText');
    input.value = text;
    input.dispatchEvent(new Event('input'));

    // 复习完成：更新这些字的 lastPractice 为今天（重新计算下次复习时间）
    const data = getCharFeedbackData();
    const today = todayStr();
    due.forEach(d => {
        if (data[d.char]) {
            data[d.char].lastPractice = today;
            data[d.char].practiceCount = (data[d.char].practiceCount || 0) + 1;
        }
    });
    setCharFeedbackData(data);

    // 触发字帖生成（复用主流程：保存历史 + 显示反馈区）
    document.getElementById('generate-btn').click();

    // 刷新复习区
    document.dispatchEvent(new CustomEvent('calligraphy:char-feedback-updated'));

    // 滚动到字帖区
    const grid = document.getElementById('grid-container');
    if (grid) grid.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/** 初始化复习区域 */
export function initReview() {
    const area = document.getElementById('reviewArea');
    if (!area) return;
    const startBtn = document.getElementById('reviewStartBtn');
    if (startBtn) startBtn.addEventListener('click', startReview);

    // 监听反馈/历史变化，自动刷新
    document.addEventListener('calligraphy:char-feedback-updated', renderReview);
    document.addEventListener('calligraphy:history-updated', renderReview);

    renderReview();
}
