// 学习报告面板模块
// 接入 history.js + feedback.js 的统计数据，激活 report.css 已有样式
// 纯原生 JS + Canvas 实现，不引入图表库
// 仅创建本文件，不修改任何现有文件

import { getHistory } from './history.js';
import { getCharFeedbackData } from './feedback.js';

// localStorage 真实 key（与 history.js / feedback.js 一致）
const HISTORY_KEY = 'calligraphy_history';
const CHAR_FEEDBACK_KEY = 'calligraphy_char_feedback';

// 最近趋势天数
const TREND_DAYS = 7;

/* ───────── 工具函数 ───────── */

/** 读取 CSS 变量值（带回退） */
function cssVar(name, fallback) {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
}

/** 日期格式化为 YYYY-MM-DD */
function fmtDate(d) {
    const p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** 获取最近 n 天的日期字符串数组（含今天，升序） */
function recentDays(n) {
    const arr = [];
    const today = new Date();
    for (let i = n - 1; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        arr.push(fmtDate(d));
    }
    return arr;
}

/** 高分辨率 Canvas 初始化（适配 devicePixelRatio），返回 2D 上下文 */
function setupCanvas(canvas, w, h) {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(w * dpr));
    canvas.height = Math.max(1, Math.floor(h * dpr));
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    return ctx;
}

/* ───────── 数据统计 ───────── */

/** 计算报告所需的全部统计数据 */
function computeStats() {
    const history = getHistory() || [];
    const charFeedback = getCharFeedbackData() || {};

    // 练习统计
    const totalSessions = history.length;
    const totalChars = history.reduce((s, r) => {
        const n = r.charCount || (r.fullText ? r.fullText.length : 0);
        return s + (n || 0);
    }, 0);
    const dateSet = new Set(history.map(r => r.date).filter(Boolean));
    const practiceDays = dateSet.size;

    // 掌握情况（来自单字反馈）
    let mastered = 0, review = 0, error = 0;
    Object.values(charFeedback).forEach(info => {
        if (!info || !info.status) return;
        if (info.status === 'mastered') mastered++;
        else if (info.status === 'review') review++;
        else if (info.status === 'error') error++;
    });
    const totalCharFeedback = mastered + review + error;

    // 最近 7 天趋势
    const days = recentDays(TREND_DAYS);
    const trend = days.map(d => ({
        date: d,
        count: history.filter(r => r.date === d).length
    }));

    // 字体使用分布
    const fontMap = {};
    history.forEach(r => {
        const name = r.font || r.fontValue || '未指定';
        fontMap[name] = (fontMap[name] || 0) + 1;
    });
    const fontUsage = Object.entries(fontMap)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count);

    return {
        totalSessions, totalChars, practiceDays,
        mastered, review, error, totalCharFeedback,
        trend, fontUsage,
        hasData: totalSessions > 0 || totalCharFeedback > 0
    };
}

/* ───────── Canvas 绘图 ───────── */

/** 绘制掌握情况环形图（带图例） */
function drawMasteryDonut(canvas, stats) {
    const w = canvas.parentElement.clientWidth || 300;
    const h = 220;
    const ctx = setupCanvas(canvas, w, h);

    const colors = {
        mastered: cssVar('--green', '#339933'),
        review: cssVar('--accent3', '#f59e0b'),
        error: cssVar('--accent2', '#ec4899'),
        empty: cssVar('--border', 'rgba(15,23,42,0.08)'),
        bg: cssVar('--bg', '#f6f7fb')
    };

    const cx = 90, cy = h / 2;
    const radius = 72;   // 外半径
    const inner = 40;    // 内半径
    const total = stats.totalCharFeedback;

    const segments = [
        { label: '已掌握', value: stats.mastered, color: colors.mastered },
        { label: '待复习', value: stats.review, color: colors.review },
        { label: '错字', value: stats.error, color: colors.error }
    ];

    // 用粗描边 arc() 绘制环形图
    const lineW = Math.max(4, radius - inner);
    const ringR = (radius + inner) / 2;

    if (total === 0) {
        ctx.strokeStyle = colors.empty;
        ctx.lineWidth = lineW;
        ctx.beginPath();
        ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
        ctx.stroke();
    } else {
        let start = -Math.PI / 2;
        segments.forEach(seg => {
            if (seg.value <= 0) return;
            const angle = (seg.value / total) * Math.PI * 2;
            ctx.strokeStyle = seg.color;
            ctx.lineWidth = lineW;
            ctx.beginPath();
            ctx.arc(cx, cy, ringR, start, start + angle);
            ctx.stroke();
            start += angle;
        });
    }

    // 中心文字：总字数
    ctx.fillStyle = cssVar('--title-color', '#0f172a');
    ctx.font = '700 22px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(total), cx, cy - 6);
    ctx.font = '12px sans-serif';
    ctx.fillStyle = cssVar('--desc-color', '#64748b');
    ctx.fillText('单字总数', cx, cy + 14);

    // 图例
    const legendX = 180;
    let legendY = 56;
    ctx.font = '13px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    segments.forEach(seg => {
        ctx.fillStyle = seg.color;
        ctx.fillRect(legendX, legendY - 6, 12, 12);
        ctx.fillStyle = cssVar('--text-color', '#1e293b');
        const pct = total > 0 ? Math.round(seg.value / total * 100) : 0;
        ctx.fillText(`${seg.label}：${seg.value}（${pct}%）`, legendX + 18, legendY);
        legendY += 26;
    });
}

/** 绘制最近 7 天趋势柱状图（带坐标轴和数值标签） */
function drawTrendBar(canvas, stats) {
    const w = canvas.parentElement.clientWidth || 320;
    const h = 220;
    const ctx = setupCanvas(canvas, w, h);

    const padL = 36, padR = 12, padT = 16, padB = 36;
    const innerW = w - padL - padR;
    const innerH = h - padT - padB;

    const data = stats.trend;
    const maxVal = Math.max(1, ...data.map(d => d.count));
    const tickMax = Math.max(1, Math.ceil(maxVal));

    const accent = cssVar('--accent', '#6366f1');
    const accent2 = cssVar('--accent2', '#ec4899');
    const borderColor = cssVar('--border', 'rgba(15,23,42,0.08)');
    const descColor = cssVar('--desc-color', '#64748b');

    // Y 轴刻度与水平网格线
    ctx.strokeStyle = borderColor;
    ctx.fillStyle = descColor;
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    const ticks = Math.min(tickMax, 4);
    for (let i = 0; i <= ticks; i++) {
        const val = Math.round(tickMax * i / ticks);
        const y = padT + innerH - (innerH * i / ticks);
        ctx.beginPath();
        ctx.moveTo(padL, y);
        ctx.lineTo(w - padR, y);
        ctx.stroke();
        ctx.fillText(String(val), padL - 6, y);
    }

    // 柱子
    const barGap = 8;
    const barW = Math.max(4, (innerW - barGap * (data.length - 1)) / data.length);
    data.forEach((d, i) => {
        const x = padL + i * (barW + barGap);
        const barH = d.count === 0 ? 0 : (d.count / tickMax) * innerH;
        const y = padT + innerH - barH;
        if (barH > 0) {
            const grad = ctx.createLinearGradient(0, y, 0, padT + innerH);
            grad.addColorStop(0, accent);
            grad.addColorStop(1, accent2);
            ctx.fillStyle = grad;
            ctx.fillRect(x, y, barW, barH);
            // 数值标签
            ctx.fillStyle = descColor;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            ctx.fillText(String(d.count), x + barW / 2, y - 2);
        }
        // X 轴日期标签（MM-DD）
        ctx.fillStyle = descColor;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(d.date.slice(5), x + barW / 2, padT + innerH + 6);
    });
}

/** 绘制字体使用分布横向柱状图 */
function drawFontBar(canvas, stats) {
    const data = stats.fontUsage;
    const labelW = 96;
    const padL = 8, padR = 44, padT = 8, padB = 8;
    const rowH = 28;
    const w = canvas.parentElement.clientWidth || 320;
    const h = Math.max(60, data.length * rowH + padT + padB);
    const ctx = setupCanvas(canvas, w, h);

    const innerX = padL + labelW;
    const innerW = Math.max(20, w - innerX - padR);
    const maxVal = Math.max(1, ...data.map(d => d.count));

    const accent = cssVar('--accent', '#6366f1');
    const accent2 = cssVar('--accent2', '#ec4899');
    const textColor = cssVar('--text-color', '#1e293b');
    const descColor = cssVar('--desc-color', '#64748b');

    ctx.font = '12px sans-serif';
    ctx.textBaseline = 'middle';

    data.forEach((d, i) => {
        const y = padT + i * rowH + rowH / 2;
        // 字体名标签
        ctx.fillStyle = textColor;
        ctx.textAlign = 'left';
        let name = d.name;
        if (name.length > 8) name = name.slice(0, 8) + '…';
        ctx.fillText(name, padL, y);

        // 横向柱子
        const barH = 14;
        const barW = (d.count / maxVal) * innerW;
        if (barW > 0) {
            const grad = ctx.createLinearGradient(innerX, 0, innerX + innerW, 0);
            grad.addColorStop(0, accent);
            grad.addColorStop(1, accent2);
            ctx.fillStyle = grad;
            ctx.fillRect(innerX, y - barH / 2, barW, barH);
        }
        // 数值标签
        ctx.fillStyle = descColor;
        ctx.textAlign = 'left';
        ctx.fillText(String(d.count), innerX + barW + 4, y);
    });
}

/* ───────── 基础样式注入（仅模态框所需，一次性） ───────── */

function injectBaseStyles() {
    if (document.getElementById('report-panel-styles')) return;
    const style = document.createElement('style');
    style.id = 'report-panel-styles';
    style.textContent = `
        .report-modal-overlay {
            position: fixed; inset: 0; z-index: 9999;
            background: rgba(15, 23, 42, 0.45);
            backdrop-filter: blur(2px);
            -webkit-backdrop-filter: blur(2px);
            display: none;
            align-items: center; justify-content: center;
            padding: 24px;
        }
        .report-modal-overlay.open { display: flex; }
        .report-modal {
            background: var(--bg, #f6f7fb);
            border: 1px solid var(--border);
            border-radius: 16px;
            box-shadow: var(--shadow-card);
            width: 100%; max-width: 760px;
            max-height: 88vh; overflow: auto;
            display: flex; flex-direction: column;
        }
        .report-modal-header {
            display: flex; align-items: center; justify-content: space-between;
            padding: 18px 24px; border-bottom: 1px solid var(--border);
            position: sticky; top: 0;
            background: var(--bg, #f6f7fb);
        }
        .report-modal-title {
            font-size: 18px; font-weight: 700; color: var(--title-color);
            margin: 0;
        }
        .report-modal-close {
            background: transparent; border: none; cursor: pointer;
            font-size: 22px; line-height: 1; color: var(--desc-color);
            padding: 4px 10px; border-radius: 6px; transition: background .2s;
        }
        .report-modal-close:hover { background: rgba(99,102,241,0.1); }
        .report-modal-body { padding: 20px 24px; }
        .report-modal-footer {
            display: flex; gap: 10px; justify-content: flex-end;
            padding: 16px 24px; border-top: 1px solid var(--border);
            position: sticky; bottom: 0;
            background: var(--bg, #f6f7fb);
        }
        .report-canvas-wrap { width: 100%; margin-top: 8px; }
        .report-canvas-wrap canvas { display: block; max-width: 100%; }
        .report-empty {
            text-align: center; padding: 60px 20px;
            color: var(--desc-color); font-size: 15px;
        }
        .report-loading {
            text-align: center; padding: 40px; color: var(--desc-color);
        }
    `;
    document.head.appendChild(style);
}

/* ───────── DOM 构建 ───────── */

/** 创建"学习报告"按钮：优先注入 .app-header-actions，缺失时降级为浮动按钮 */
function createReportButton(onClick) {
    const btn = document.createElement('button');
    btn.className = 'demo-btn';
    btn.id = 'reportOpenBtn';
    btn.title = '查看学习报告';
    btn.innerHTML = '📊 学习报告';
    btn.addEventListener('click', onClick);

    const host = document.querySelector('.app-header-actions');
    if (host) {
        host.appendChild(btn);
    } else {
        // 降级：固定浮动按钮
        btn.style.cssText = 'position:fixed;top:16px;right:16px;z-index:9000;';
        document.body.appendChild(btn);
    }
    return btn;
}

/** 构建模态框 DOM */
function buildModal() {
    const overlay = document.createElement('div');
    overlay.className = 'report-modal-overlay';
    overlay.id = 'reportModalOverlay';

    const modal = document.createElement('div');
    modal.className = 'report-modal';
    modal.innerHTML = `
        <div class="report-modal-header">
            <h2 class="report-modal-title">📊 学习报告</h2>
            <button class="report-modal-close" id="reportModalClose" aria-label="关闭">✕</button>
        </div>
        <div class="report-modal-body" id="reportModalBody">
            <div class="report-loading">加载中…</div>
        </div>
        <div class="report-modal-footer">
            <button class="btn btn-ghost" id="reportExportBtn">📋 导出报告</button>
            <button class="btn btn-danger" id="reportResetBtn">🗑 重置统计数据</button>
        </div>
    `;
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    return overlay;
}

/* ───────── 渲染报告内容 ───────── */

function renderReport() {
    const body = document.getElementById('reportModalBody');
    if (!body) return;
    const stats = computeStats();

    // 空状态
    if (!stats.hasData) {
        body.innerHTML = `<div class="report-empty">暂无练习记录，开始练习吧！</div>`;
        return;
    }

    // 练习统计区
    const statsHtml = `
        <div class="report-card">
            <h3 class="report-card-title">练习统计</h3>
            <div class="report-stats">
                <div class="report-stat-item">
                    <div class="report-stat-value">${stats.totalSessions}</div>
                    <div class="report-stat-label">累计练习次数</div>
                </div>
                <div class="report-stat-item">
                    <div class="report-stat-value">${stats.totalChars}</div>
                    <div class="report-stat-label">累计练习字数</div>
                </div>
                <div class="report-stat-item">
                    <div class="report-stat-value">${stats.practiceDays}</div>
                    <div class="report-stat-label">练习天数</div>
                </div>
            </div>
        </div>
    `;

    // 掌握情况区
    const masteryHtml = `
        <div class="report-card">
            <h3 class="report-card-title">掌握情况</h3>
            <div class="report-stats">
                <div class="report-stat-item is-mastered">
                    <div class="report-stat-value">${stats.mastered}</div>
                    <div class="report-stat-label">已掌握字数</div>
                </div>
                <div class="report-stat-item is-review">
                    <div class="report-stat-value">${stats.review}</div>
                    <div class="report-stat-label">待复习字数</div>
                </div>
                <div class="report-stat-item is-error">
                    <div class="report-stat-value">${stats.error}</div>
                    <div class="report-stat-label">错字数</div>
                </div>
            </div>
            <div class="report-canvas-wrap">
                <canvas id="reportMasteryCanvas"></canvas>
            </div>
        </div>
    `;

    // 最近 7 天趋势区
    const trendHtml = `
        <div class="report-card">
            <h3 class="report-card-title">最近 7 天趋势</h3>
            <p class="report-card-subtitle">每日练习次数</p>
            <div class="report-canvas-wrap">
                <canvas id="reportTrendCanvas"></canvas>
            </div>
        </div>
    `;

    // 字体使用分布区（有数据才渲染）
    const fontHtml = stats.fontUsage.length > 0 ? `
        <div class="report-card">
            <h3 class="report-card-title">字体使用分布</h3>
            <div class="report-canvas-wrap">
                <canvas id="reportFontCanvas"></canvas>
            </div>
        </div>
    ` : '';

    body.innerHTML = statsHtml + masteryHtml + trendHtml + fontHtml;

    // DOM 插入后绘制 Canvas
    requestAnimationFrame(() => {
        const mCanvas = document.getElementById('reportMasteryCanvas');
        if (mCanvas) drawMasteryDonut(mCanvas, stats);

        const tCanvas = document.getElementById('reportTrendCanvas');
        if (tCanvas) drawTrendBar(tCanvas, stats);

        const fCanvas = document.getElementById('reportFontCanvas');
        if (fCanvas && stats.fontUsage.length > 0) drawFontBar(fCanvas, stats);
    });
}

/* ───────── 导出报告 / 重置数据 ───────── */

/** 生成文本摘要并复制到剪贴板 */
function exportReport() {
    const s = computeStats();
    const lines = [];
    lines.push('═══════════ 学习报告 ═══════════');
    lines.push(`生成时间：${new Date().toLocaleString()}`);
    lines.push('');
    lines.push('【练习统计】');
    lines.push(`  累计练习次数：${s.totalSessions}`);
    lines.push(`  累计练习字数：${s.totalChars}`);
    lines.push(`  练习天数：${s.practiceDays}`);
    lines.push('');
    lines.push('【掌握情况】');
    lines.push(`  已掌握：${s.mastered} 字`);
    lines.push(`  待复习：${s.review} 字`);
    lines.push(`  错字数：${s.error} 字`);
    lines.push('');
    lines.push('【最近 7 天趋势】');
    s.trend.forEach(d => lines.push(`  ${d.date}：${d.count} 次`));
    lines.push('');
    lines.push('【字体使用分布】');
    if (s.fontUsage.length === 0) {
        lines.push('  无数据');
    } else {
        s.fontUsage.forEach(f => lines.push(`  ${f.name}：${f.count} 次`));
    }
    lines.push('');
    lines.push('═══════════════════════════════');
    const text = lines.join('\n');

    // 优先使用 Clipboard API，失败则降级
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(
            () => alert('报告已复制到剪贴板！'),
            () => fallbackCopy(text)
        );
    } else {
        fallbackCopy(text);
    }
}

/** 兼容旧浏览器的复制降级方案 */
function fallbackCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try {
        document.execCommand('copy');
        alert('报告已复制到剪贴板！');
    } catch (e) {
        alert('复制失败，请手动复制：\n\n' + text);
    }
    document.body.removeChild(ta);
}

/** 重置统计数据：清空 history 与 char_feedback（二次确认） */
function resetStats() {
    if (!confirm('确定要清空全部练习历史与单字反馈吗？此操作不可撤销。')) return;
    if (!confirm('再次确认：所有练习记录与掌握情况统计将被永久删除。是否继续？')) return;
    localStorage.removeItem(HISTORY_KEY);
    localStorage.removeItem(CHAR_FEEDBACK_KEY);
    // 通知其他模块刷新
    document.dispatchEvent(new CustomEvent('calligraphy:history-updated'));
    document.dispatchEvent(new CustomEvent('calligraphy:char-feedback-updated'));
    renderReport();
    alert('统计数据已清空。');
}

/* ───────── 面板开关 ───────── */

function openPanel() {
    const overlay = document.getElementById('reportModalOverlay');
    if (!overlay) return;
    overlay.classList.add('open');
    renderReport(); // 每次打开重新读取 localStorage
}

function closePanel() {
    const overlay = document.getElementById('reportModalOverlay');
    if (!overlay) return;
    overlay.classList.remove('open');
}

/* ───────── 模块导出 ───────── */

export const ReportPanel = {
    /** 初始化：注入样式、创建按钮与模态框、绑定事件 */
    init() {
        injectBaseStyles();
        createReportButton(openPanel);
        buildModal();

        // 关闭事件：按钮 + 点击遮罩 + ESC
        const closeBtn = document.getElementById('reportModalClose');
        if (closeBtn) closeBtn.addEventListener('click', closePanel);
        const overlay = document.getElementById('reportModalOverlay');
        if (overlay) {
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) closePanel();
            });
        }
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && overlay && overlay.classList.contains('open')) {
                closePanel();
            }
        });

        // 操作按钮
        const exportBtn = document.getElementById('reportExportBtn');
        if (exportBtn) exportBtn.addEventListener('click', exportReport);
        const resetBtn = document.getElementById('reportResetBtn');
        if (resetBtn) resetBtn.addEventListener('click', resetStats);

        // 数据更新时刷新（若面板打开）
        document.addEventListener('calligraphy:history-updated', () => {
            if (overlay && overlay.classList.contains('open')) renderReport();
        });
        document.addEventListener('calligraphy:char-feedback-updated', () => {
            if (overlay && overlay.classList.contains('open')) renderReport();
        });

        // 窗口缩放时重绘 Canvas（仅面板打开时）
        let resizeTimer = null;
        window.addEventListener('resize', () => {
            if (!overlay || !overlay.classList.contains('open')) return;
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(renderReport, 150);
        });
    },

    /** 打开面板 */
    open() { openPanel(); },

    /** 关闭面板 */
    close() { closePanel(); },

    /** 刷新数据并重绘（面板打开时有效） */
    refresh() {
        const overlay = document.getElementById('reportModalOverlay');
        if (overlay && overlay.classList.contains('open')) renderReport();
    }
};

/** 供 main.js 调用的注册函数 */
export function registerReportPanel() {
    ReportPanel.init();
}

export default ReportPanel;
