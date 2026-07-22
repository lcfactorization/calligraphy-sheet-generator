// 难度评估模块（C-4）
// 根据输入汉字的平均笔画数给出星级（1-5星）和难度等级
// 实时更新（输入时即评估）

import cnchar from 'cnchar';

// 难度分级规则（按平均笔画数）
// 1-5画=1星(初级) / 6-8画=2星(初级) / 9-12画=3星(中级) / 13-16画=4星(中级) / 17+画=5星(高级)
const LEVELS = [
    { max: 5,  stars: 1, level: '初级', cls: 'beginner', color: '#22c55e' },
    { max: 8,  stars: 2, level: '初级', cls: 'beginner', color: '#22c55e' },
    { max: 12, stars: 3, level: '中级', cls: 'intermediate', color: '#f59e0b' },
    { max: 16, stars: 4, level: '中级', cls: 'intermediate', color: '#f59e0b' },
    { max: Infinity, stars: 5, level: '高级', cls: 'advanced', color: '#ef4444' }
];

/** 判断字符是否为汉字 */
function isChinese(ch) {
    if (typeof cnchar.isCnChar === 'function') {
        return cnchar.isCnChar(ch);
    }
    // 兜底：CJK 统一汉字范围
    const code = ch.charCodeAt(0);
    return code >= 0x4e00 && code <= 0x9fff;
}

/** 获取单个汉字的笔画数 */
function getStrokeCount(char) {
    try {
        const result = cnchar.stroke(char);
        if (Array.isArray(result)) {
            return typeof result[0] === 'number' ? result[0] : 0;
        }
        return typeof result === 'number' ? result : 0;
    } catch (e) {
        return 0;
    }
}

/** 评估文本难度
 *  返回 { avg, stars, level, cls, color, count, details }
 */
export function assessDifficulty(text) {
    if (!text || typeof text !== 'string') {
        return { avg: 0, stars: 0, level: '—', cls: 'empty', color: 'var(--desc-color)', count: 0, details: [] };
    }
    const details = [];
    let total = 0;
    let count = 0;
    for (const ch of text) {
        if (!isChinese(ch)) continue;
        const sc = getStrokeCount(ch);
        details.push({ char: ch, strokes: sc });
        total += sc;
        count++;
    }
    if (count === 0) {
        return { avg: 0, stars: 0, level: '—', cls: 'empty', color: 'var(--desc-color)', count: 0, details: [] };
    }
    const avg = total / count;
    const level = LEVELS.find(l => avg <= l.max) || LEVELS[LEVELS.length - 1];
    return {
        avg: Math.round(avg * 10) / 10,
        stars: level.stars,
        level: level.level,
        cls: level.cls,
        color: level.color,
        count,
        details
    };
}

/** 渲染星级（★☆） */
function renderStars(stars) {
    const max = 5;
    return Array.from({ length: max }, (_, i) =>
        i < stars ? '<span class="diff-star filled">★</span>' : '<span class="diff-star">☆</span>'
    ).join('');
}

/** 渲染难度评估显示 */
function renderDifficulty(result) {
    const container = document.getElementById('difficultyArea');
    if (!container) return;

    if (result.count === 0) {
        container.innerHTML = '<span class="diff-empty">输入汉字后将显示难度评估</span>';
        container.classList.remove('has-result');
        return;
    }

    container.classList.add('has-result');
    const avgText = result.avg.toString();
    container.innerHTML = `
        <span class="diff-label">难度评估：</span>
        <span class="diff-stars">${renderStars(result.stars)}</span>
        <span class="diff-level ${result.cls}">${result.level}</span>
        <span class="diff-avg">平均 ${avgText} 画</span>
        <span class="diff-count">${result.count} 字</span>
    `;
}

/** 实时评估并渲染 */
function evaluateAndRender() {
    const input = document.getElementById('inputText');
    if (!input) return;
    const result = assessDifficulty(input.value);
    renderDifficulty(result);
}

/** 初始化难度评估显示 */
export function initDifficulty() {
    const input = document.getElementById('inputText');
    if (input) {
        input.addEventListener('input', evaluateAndRender);
    }
    // 初始渲染
    evaluateAndRender();
}
