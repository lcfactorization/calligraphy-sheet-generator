// 体检结果的**共享渲染层**（v1.5.5）
//
// 为什么单独抽出来：
//   体检（aiDiagnostics）的结论此前只由设置中心的 renderDiagResult 呈现。
//   v1.5.5 新增「AI 控制台」窗口后，同一个结论要在两处展示 —— 若各写一份，
//   必然漂移成「设置中心说 Key 无效、控制台说 Key 有效」这类无法复现的现象
//   （与 v1.5.4 抽出 aiProbeHttp 的动因完全相同：同一份逻辑两处实现迟早分叉）。
//
// 边界：本模块**只做呈现**。不做任何网络请求、不读 localStorage、不判定业务。
//   数据来源必须是 aiDiagnostics.diagnose() / diagnoseAll() 的返回值。
//
// 安全：全程 DOM API（createElement + textContent），零 innerHTML ——
//   体检详情里可能带服务端返回的原文片段，属于不可信数据。

import { clearChildren } from '../utils/sanitize.js';

/** 体检级别 → 颜色（与全站既有色板一致：绿/黄/红） */
export const DIAG_COLORS = { ok: '#16a34a', warn: '#f59e0b', fail: '#ef4444' };
/** 体检级别 → 图标 */
export const DIAG_ICONS = { ok: '✓', warn: '⚠', fail: '✗' };

/**
 * 把探测裁决（aiKeyHealth.getVerdict）转成短徽章文本。
 * 无裁决返回空串，不干扰旧 UI。
 * @param {{ok:boolean,free?:boolean,kind?:string}|null} v
 * @returns {string}
 */
export function verdictBadge(v) {
    if (!v) return '';
    // 注意：429 的裁决是 ok:true + kind:'ratelimit'（限流 ≠ Key 不可用），
    //   必须先判 kind，否则「⚠限流」分支永远不可达。
    if (v.kind === 'ratelimit') return '⚠限流';
    if (v.ok) return v.free ? '✓免费' : '✓可用';
    switch (v.kind) {
        case 'unreachable': return '⚠不可达';
        case 'auth': return '✗Key无效';
        case 'quota': return '✗额度耗尽';
        case 'model': return '✗模型不存在';
        case 'unsupported': return '⚠需手动指定引擎';
        default: return '✗不可用';
    }
}

/** 体检级别 → 语义色（供状态点、边框复用） */
export function diagColor(level) {
    return DIAG_COLORS[level] || '#6b7280';
}

/**
 * 渲染一次体检结果。
 * 结构：
 *   [总结条]   ← 绿/黄/红底色 + 一句话结论
 *   [逐项卡片] ← 每项：图标 + 标题 + 级别徽章 + 详情；
 *                 有 hints 则列成「怎么办」，有 evidence 则折叠展示
 *
 * @param {HTMLElement|null} container 逐项结果的容器
 * @param {HTMLElement|null} summaryEl 总结条容器（可为 null）
 * @param {{level:string, headline:string, steps?:Array, elapsed?:number}} result
 * @param {string} [label] 前缀标签（如 Key 掩码 / 引擎名）
 */
export function renderDiagResult(container, summaryEl, result, label) {
    if (!result) return;
    if (container) clearChildren(container);

    if (summaryEl) {
        summaryEl.style.display = 'block';
        const color = diagColor(result.level);
        const icon = DIAG_ICONS[result.level] || '•';
        const head = (label ? `【${label}】` : '') + `${icon} ${result.headline}`;
        summaryEl.replaceChildren(document.createTextNode(head));
        summaryEl.style.color = color;
        summaryEl.style.background = result.level === 'ok'
            ? 'rgba(22,163,74,0.10)'
            : (result.level === 'warn' ? 'rgba(245,158,11,0.10)' : 'rgba(239,68,68,0.10)');
        summaryEl.style.border = '1px solid ' + color;
    }
    if (!container) return;

    for (const step of (result.steps || [])) {
        const color = diagColor(step.level);
        const card = document.createElement('div');
        card.className = 'aic-diag-card';
        card.style.borderLeftColor = color;

        const titleRow = document.createElement('div');
        titleRow.className = 'aic-diag-title-row';
        const iconSpan = document.createElement('span');
        iconSpan.className = 'aic-diag-title';
        iconSpan.style.color = color;
        iconSpan.textContent = (DIAG_ICONS[step.level] || '•') + ' ' + step.title;
        titleRow.appendChild(iconSpan);
        if (step.code) {
            const codeSpan = document.createElement('span');
            codeSpan.className = 'aic-diag-code';
            codeSpan.textContent = 'HTTP ' + step.code;
            titleRow.appendChild(codeSpan);
        }
        card.appendChild(titleRow);

        const detail = document.createElement('div');
        detail.className = 'aic-diag-detail';
        detail.textContent = step.detail || '';
        card.appendChild(detail);

        if (Array.isArray(step.hints) && step.hints.length > 0) {
            const hintWrap = document.createElement('div');
            hintWrap.className = 'aic-diag-hints';
            for (const h of step.hints) {
                const line = document.createElement('div');
                line.className = 'aic-diag-hint';
                line.style.color = color;
                line.textContent = '→ ' + h;
                hintWrap.appendChild(line);
            }
            card.appendChild(hintWrap);
        }

        if (Array.isArray(step.evidence) && step.evidence.length > 0) {
            const det = document.createElement('details');
            det.className = 'aic-diag-evidence';
            const sum = document.createElement('summary');
            sum.textContent = '查看原始证据（请求地址 / 响应片段）';
            det.appendChild(sum);
            const evWrap = document.createElement('div');
            evWrap.className = 'aic-diag-evidence-body';
            for (const e of step.evidence) {
                const line = document.createElement('div');
                line.textContent = String(e);
                evWrap.appendChild(line);
            }
            det.appendChild(evWrap);
            card.appendChild(det);
        }
        container.appendChild(card);
    }

    if (typeof result.elapsed === 'number') {
        const foot = document.createElement('div');
        foot.className = 'aic-diag-elapsed';
        foot.textContent = `体检耗时 ${result.elapsed}ms`;
        container.appendChild(foot);
    }
}
