// ============================================================================
// AI 控制台 · 全功能新窗口（v1.5.6）
// ============================================================================
//
// 设计参照：zai-org/ZCode 的「模型设置」页（`packages/ui/src/settings/
// model-provider-section/`，开源）。
//
// v1.5.6 重做说明（用户反馈「没有真的借鉴到 ZCode 的界面和方式」）
//   v1.5.5 只借到了**布局骨架**（双栏），却把详情区做成了「卡片 + 徽章 + 芯片」
//   的堆叠，与 ZCode 的实际范式相差很远。本轮按 ZCode 截图逐项对齐：
//     ① 页头 = 标题 + 一句话说明（说明里带实时统计）；右侧只有
//        「↻ 刷新」圆形图标按钮 + 「＋ 添加供应商」实心按钮（次要动作收进 ⋯）。
//     ② 左栏 = 分组列表，每项「图标 + 名称 …… 状态点（右对齐）」。
//     ③ 详情 = **扁平表单**，字段顺序 Base URL → API 格式 → API Key → 模型列表。
//     ④ 详情头 = 图标 + 名称 + **参与自动优选开关** + **⋯ 更多菜单**。
//     ⑤ 列表区块的标题行右侧放新增按钮（`模型列表` …… `＋ 添加模型`）。
//     ⑥ 列表行 = 名称 + 灰色能力标签 + **行内图标动作** + 开关。
//   与 ZCode 的**有意的差异**（都是被本项目的数据模型决定的，不是偷懒）：
//     · ZCode 每个供应商只有一把 Key；本项目支持「一把 Key 一个模型」多条，
//       因此 `API Key` 区块是一份**行式列表**（沿用与模型列表相同的行惯用法）。
//     · ZCode 的模型标签是 `1M`（上下文窗口）与 `视觉`；本项目注册表**没有**
//       这两个字段，因此标签显示我们**真实拥有**的事实：免费/低价/付费、
//       JSON 模式、全量检查、实测较慢。不编造不存在的元数据。
//     · 「体检」是 ZCode 没有的（它面向本项目的具体痛点），收进 ⋯ 菜单与
//       折叠区，不占据表单主视线。
//
// 安全：本模块**零 innerHTML**（连静态骨架也不用），全部走
//   createElement / textContent / setAttribute —— 引擎名、Base URL、模型 ID、
//   Key 掩码、体检详情全部是用户输入或服务端返回，属于不可信数据。

import { staticNodes, svgNode } from '../utils/staticMarkup.js';
import { safeText, clearChildren } from '../utils/sanitize.js';
import { renderDiagResult, verdictBadge } from './aiDiagView.js';

export const AI_CONSOLE_ID = 'aiConsolePanel';

// ---------------------------------------------------------------------------
// 静态骨架（编译期常量，零插值）
// ---------------------------------------------------------------------------
const SHELL = `
<div class="aic-modal" role="dialog" aria-modal="true" aria-labelledby="aicTitle">
    <header class="aic-header">
        <div class="aic-head-text">
            <h1 class="aic-title" id="aicTitle">模型设置</h1>
            <p class="aic-subtitle" id="aicSubtitle">管理 AI 引擎与 API Key，配置后可在组词补齐与拼音纠错时使用。</p>
        </div>
        <div class="aic-head-actions">
            <button type="button" class="aic-icon-round" id="aicRefresh" title="重新读取引擎与 Key 状态" aria-label="刷新">↻</button>
            <button type="button" class="aic-btn-solid" id="aicAddProvider" title="添加供应商（内置引擎模板或从零自定义）">＋ 添加供应商</button>
            <button type="button" class="aic-icon-round" id="aicMore" title="更多操作" aria-label="更多操作" aria-haspopup="true" aria-expanded="false">⋯</button>
            <input type="file" id="aicImportFile" accept=".txt,.md,.csv,.json,.docx,text/plain,text/markdown,text/csv,application/json,application/vnd.openxmlformats-officedocument.wordprocessingml.document" hidden>
        </div>
        <div class="sc-window-controls aic-window-controls">
            <button type="button" class="sc-btn-min" id="aicMin" aria-label="最小化" title="最小化">▁</button>
            <button type="button" class="sc-btn-max" id="aicMax" aria-label="最大化" title="最大化">□</button>
            <button type="button" class="sc-close" id="aicClose" aria-label="关闭" title="关闭">✕</button>
        </div>
    </header>
    <div class="aic-body">
        <aside class="aic-nav" id="aicNav" aria-label="供应商导航"></aside>
        <section class="aic-detail" id="aicDetail" aria-live="polite"></section>
    </div>
    <footer class="aic-footer">
        <span class="aic-footer-status" id="aicFooterStatus"></span>
        <span class="aic-footer-spacer"></span>
        <span class="aic-footer-hint" id="aicFooterHint"></span>
        <button type="button" class="aic-btn-solid aic-btn-sm" id="aicDone">完成</button>
    </footer>
</div>
`;

// ---------------------------------------------------------------------------
// 常量
// ---------------------------------------------------------------------------

/** 状态点四态 —— 判定在数据层，UI 只做展示映射 */
const STATUS_PRESENTATION = {
    ready: { label: '可用', cls: 'aic-status-ready' },
    unavailable: { label: '待验证', cls: 'aic-status-unavailable' },
    disabled: { label: '未配置', cls: 'aic-status-disabled' },
    off: { label: '不参与自动优选', cls: 'aic-status-off' }
};

/** 档位 → 中文短标签（与注册表的 tier 一一对应） */
const TIER_LABEL = { free: '免费', cheap: '低价', paid: '付费' };

/** 协议 → 展示名。**与 ZCode 的写法一致**：`Anthropic Messages (/v1/messages)` */
const PROTOCOL_DISPLAY = {
    openai: { name: 'Chat Completions', path: '/chat/completions' },
    anthropic: { name: 'Anthropic Messages', path: '/v1/messages' }
};

/** 协议选项文案（协议选错是 401/404 头号原因，选项里直接标出端点路径） */
function protocolOptionLabel(value) {
    const p = PROTOCOL_DISPLAY[value] || PROTOCOL_DISPLAY.openai;
    return `${p.name} (${p.path})`;
}

/** 字段帮助文案 */
const FIELD_HELP = {
    protocol: '决定请求的形状，选错会 401 或 404。\n\n'
        + '- **Chat Completions**：POST `/chat/completions`，`Authorization: Bearer` 鉴权，system 放在 messages 数组里。\n'
        + '- **Anthropic Messages**：POST `/v1/messages`，`x-api-key` 头 + 必填 `anthropic-version`，system 是顶层字段，`max_tokens` 必填。\n\n'
        + '内置引擎全部是 Chat Completions，无需改动。',
    baseUrl: '只填到版本号，**不要**把 `/chat/completions` 写进来 —— 本应用会按协议自动补上，'
        + '重复拼接会变成 `/v1/chat/completions/chat/completions` 而 404。\n\n'
        + '正确：`https://api.example.com/v1`',
    models: '发送给接口的模型 ID 原值，区分大小写。多个用逗号分隔。\n\n'
        + '同一把 Key 可以挂多个模型，随时切换。',
    maxTokens: '单次回复的最大 token 数，留空即采用模型提供商的默认值。\n'
        + '合法区间 1–200000，越界会被静默忽略。\n\n'
        + 'Anthropic 协议下该字段**必填**，未配置时兜底 4096。',
    temperature: '随机性，0 最确定、2 最发散。留空即不发送该字段。合法区间 0–2。',
    topP: '核采样阈值，留空即不发送该字段。合法区间 0–1。',
    extraParams: '以 JSON 对象给出的额外请求体字段，会并入请求（同名时覆盖默认值）。\n\n'
        + '键名必须是合法标识符，`__proto__` / `constructor` / `prototype` 会被拒绝。',
    storage: '客户端加密只能防「翻磁盘」，防不住同源脚本执行。\n\n'
        + '- **仅本次会话**：不落盘，最安全。\n'
        + '- **标签页**：sessionStorage，关标签即消失。\n'
        + '- **明文**：localStorage 不加密，最方便也最容易被读走。\n'
        + '- **口令加密**：localStorage + PBKDF2，重开浏览器需解锁。',
    autoPick: '关闭后，该供应商**不参与自动优选** —— 自动选择不会再挑它的 Key。\n\n'
        + '它并不会被删除：你显式选中它的 Key 时照常可用。\n'
        + '典型用途：手上有多个供应商，其中一家不稳定但不想删掉。',
    modelToggle: '关闭后，该模型**不参与自动优选** —— 自动选择不会再挑中它。\n\n'
        + '典型用途：某款免费模型实测很慢，不想被自动挑中。',
    tier: '档位只影响自动优选的打分权重（免费 > 低价 > 付费），不影响能否调用。',
    jsonMode: '该模型是否支持 `response_format: {"type":"json_object"}`。\n\n'
        + '未知时仍会尝试，失败后自动降级重试（去掉该字段再发一次）。',
    fullCheck: '标记后，执行「全量检查」时会优先使用该模型（更强的模型更适合深度校验）。',
    slow: '标记后，自动优选不再按探测延迟给它速度分 —— 探测只有 3 个 token，'
        + '对推理型模型毫无代表性。\n\n只对**实测过**的模型标记，不凭猜测。'
};

// ---------------------------------------------------------------------------
// 运行期状态
// ---------------------------------------------------------------------------
const STATE = {
    /** { type: 'provider'|'templates'|'unattributed'|'storage'|'diagAll', id? } */
    view: null,
    probeRunning: false,
    diagRunning: false,
    /** 引擎模板选择页是否展开「从零自定义」表单（纯展示状态，不落盘） */
    showCustomForm: false,
    /** 每个引擎一把的「高级请求参数」展开记忆（纯展示状态，不落盘） */
    advancedOpen: new Set(),
    /** 「全部 Key 体检结果」缓存（放在 STATE 里，才能经得起重绘） */
    diagAllResults: null,
    /** 当前打开的弹层（⋯ 菜单 / 模型设置对话框），同一时刻只允许一个 */
    openPopover: null
};

let _overlay = null;
let _navEl = null;
let _detailEl = null;
let _storeApi = null;
let _provApi = null;
let _healthApi = null;
let _diagApi = null;
let _importerApi = null;

// ---------------------------------------------------------------------------
// DOM 小工具
// ---------------------------------------------------------------------------

/** 创建元素（文本一律 textContent —— 入参大量来自用户输入） */
function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
}

/** 创建 `<button type=button>` */
function btn(className, text, title) {
    const node = el('button', className, text);
    node.type = 'button';
    if (title) node.title = title;
    return node;
}

/** 图标按钮（行内动作） */
function iconBtn(glyph, title, onClick, danger) {
    const node = btn('aic-icon-btn' + (danger ? ' aic-icon-danger' : ''), glyph, title);
    node.setAttribute('aria-label', title);
    if (onClick) node.addEventListener('click', onClick);
    return node;
}

/** 灰色小标签（ZCode 的 `1M` / `视觉` 同款样式） */
function tag(text, tone) {
    return el('span', 'aic-tag' + (tone ? ` aic-tag-${tone}` : ''), text);
}

/**
 * 字段标题行：标题文字 + (?) 帮助。
 *
 * ⚠ 帮助气泡必须是**标题文字的兄弟**，不能嵌进标题里 —— ZCode 的
 *   `ModelConfigInputLabel` 明确写了这一条，原因有二：
 *     ① 标题若是 `<label>`，气泡嵌进去会抢走输入关联与标题点击的焦点；
 *     ② 气泡正文（几百字说明）会变成标题 `textContent` 的一部分，
 *        读屏软件会把「API 格式决定请求的形状，选错会 401…」整段当作字段名念出来。
 *   因此这里用 `<span>` 作标题（本项目的输入框是块级兄弟节点，不需要 label 关联），
 *   气泡挂在标题行里、标题文字之外。
 */
function fieldHead(labelText, helpKey) {
    const head = el('div', 'aic-field-head');
    head.appendChild(el('span', 'aic-field-label', labelText));
    if (helpKey && FIELD_HELP[helpKey]) head.appendChild(helpButton(labelText, FIELD_HELP[helpKey]));
    return head;
}

/** 字段容器：标题行 + 控件 */
function field(labelText, helpKey) {
    const wrap = el('div', 'aic-field');
    wrap.appendChild(fieldHead(labelText, helpKey));
    return wrap;
}

/** 字段行：标题在左、动作按钮在右（ZCode 的 `模型列表 …… ＋ 添加模型`） */
function fieldRow(labelText, helpKey, actionNode) {
    const row = el('div', 'aic-field-row');
    row.appendChild(fieldHead(labelText, helpKey));
    row.appendChild(el('span', 'aic-grow'));
    if (actionNode) row.appendChild(actionNode);
    return row;
}

/** 只把定稿帮助文案里的 `**加粗**` 与 `` `代码` `` 转成元素 */
function emphasis(text) {
    const frag = document.createDocumentFragment();
    for (const part of String(text).split(/(\*\*[^*]+\*\*|`[^`]+`)/g)) {
        if (!part) continue;
        if (part.length > 4 && part.startsWith('**') && part.endsWith('**')) {
            const strong = document.createElement('strong');
            strong.textContent = part.slice(2, -2);
            frag.appendChild(strong);
        } else if (part.length > 2 && part.startsWith('`') && part.endsWith('`')) {
            const code = document.createElement('code');
            code.textContent = part.slice(1, -1);
            frag.appendChild(code);
        } else {
            frag.appendChild(document.createTextNode(part));
        }
    }
    return frag;
}

/**
 * 把帮助气泡摆到触发点附近。
 * 气泡在 `.aic-detail` 这个滚动容器里：用 absolute 向上展开会被容器的 overflow
 * 裁掉上半截（实测 Base URL 那条说明第一行完全看不见）。fixed 的包含块是最近的
 * 有 transform 的祖先（`.aic-modal`），因此能逃出 .aic-detail 的裁剪。
 */
function placeHelpPopover(wrap, pop) {
    const trigger = wrap.querySelector('.aic-help-trigger');
    if (!trigger || typeof trigger.getBoundingClientRect !== 'function') return;
    const r = trigger.getBoundingClientRect();
    const vw = window.innerWidth || 1024;
    const vh = window.innerHeight || 768;
    const width = Math.min(300, vw - 24);
    pop.style.position = 'fixed';
    pop.style.transform = 'none';
    pop.style.bottom = 'auto';
    pop.style.width = width + 'px';
    let left = r.left + r.width / 2 - width / 2;
    left = Math.max(12, Math.min(left, vw - width - 12));
    pop.style.left = left + 'px';
    pop.style.top = (r.bottom + 6) + 'px';
    const h = pop.offsetHeight;
    const spaceBelow = vh - r.bottom - 12;
    const spaceAbove = r.top - 12;
    if (h > spaceBelow && spaceAbove > spaceBelow) {
        pop.style.top = Math.max(12, r.top - 6 - h) + 'px';
    }
}

/** 帮助气泡（hover / focus / 点击均可打开，触屏可用） */
function helpButton(fieldName, copy) {
    const wrap = el('span', 'aic-help');
    const trigger = btn('aic-help-trigger', '?', `关于「${fieldName}」`);
    trigger.setAttribute('aria-label', `关于「${fieldName}」的说明`);
    const pop = el('div', 'aic-help-pop');
    pop.setAttribute('role', 'tooltip');
    for (const paragraph of String(copy).split('\n\n')) {
        if (paragraph.startsWith('- ')) {
            const ul = el('ul', 'aic-help-list');
            for (const line of paragraph.split('\n')) {
                const li = document.createElement('li');
                li.appendChild(emphasis(line.replace(/^- /, '')));
                ul.appendChild(li);
            }
            pop.appendChild(ul);
        } else {
            const p = document.createElement('p');
            p.appendChild(emphasis(paragraph));
            pop.appendChild(p);
        }
    }
    let pinned = false;
    const show = () => {
        wrap.classList.add('open');
        placeHelpPopover(wrap, pop);
    };
    const hide = () => { if (!pinned) wrap.classList.remove('open'); };
    trigger.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') show(); });
    trigger.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') hide(); });
    trigger.addEventListener('focus', show);
    trigger.addEventListener('blur', () => { pinned = false; hide(); });
    trigger.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        pinned = !pinned;
        if (pinned) show(); else hide();
    });
    wrap.append(trigger, pop);
    return wrap;
}

/** 开关（ZCode 详情头与模型行右侧那种胶囊开关） */
function switchControl(checked, title, onChange) {
    const label = el('label', 'aic-switch');
    label.title = title || '';
    const input = el('input');
    input.type = 'checkbox';
    input.checked = !!checked;
    input.setAttribute('aria-label', title || '开关');
    input.addEventListener('change', () => onChange(input.checked));
    label.append(input, el('span', 'aic-slider'));
    return label;
}

/** 眼睛图标（内嵌在输入框右侧） */
const EYE_OFF_SVG = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';
const EYE_ON_SVG = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';

/** 用静态 SVG 常量替换按钮内容（svgNode 解析，零 innerHTML） */
function setEyeIcon(node, visible) {
    if (!node) return;
    const holder = el('span', 'aic-icon');
    const svg = svgNode(visible ? EYE_ON_SVG : EYE_OFF_SVG);
    if (svg) holder.appendChild(svg);
    node.replaceChildren(holder);
}

/** 带内嵌眼睛按钮的输入框 */
function eyeInput({ value = '', placeholder = '' } = {}) {
    const wrap = el('div', 'aic-input-wrap');
    const input = el('input', 'aic-input');
    input.type = 'password';
    input.value = value;
    input.placeholder = placeholder;
    input.autocomplete = 'off';
    input.spellcheck = false;
    const eye = btn('aic-icon-btn aic-input-eye', '', '显示 / 隐藏');
    setEyeIcon(eye, false);
    let visible = false;
    eye.addEventListener('click', () => {
        visible = !visible;
        input.type = visible ? 'text' : 'password';
        setEyeIcon(eye, visible);
    });
    wrap.append(input, eye);
    return { wrap, input };
}

/** 从 id 派生稳定色相（同一引擎永远同色） */
function hueOf(id) {
    let h = 0;
    for (let i = 0; i < String(id).length; i++) h = (h * 31 + String(id).charCodeAt(i)) % 360;
    return h;
}

/**
 * 供应商图标（ZCode 用打包好的品牌 logo；本项目没有这些素材，
 * 用确定性色相 + 首字符的字母块代替 —— 同一引擎每次都是同一个图标）。
 */
function providerAvatar(provider, size = 'md') {
    const node = el('span', `aic-avatar aic-avatar-${size}`);
    node.style.setProperty('--aic-avatar-hue', String(hueOf(provider.id)));
    node.textContent = String(provider.label || provider.id || '?').slice(0, 1).toUpperCase();
    node.setAttribute('aria-hidden', 'true');
    return node;
}

// ---------------------------------------------------------------------------
// 弹层（⋯ 菜单 / 模型设置面板）
// ---------------------------------------------------------------------------

/** 关掉当前打开的弹层 */
function closePopover() {
    const cur = STATE.openPopover;
    if (!cur) return;
    if (cur.root && cur.root.parentNode) cur.root.parentNode.removeChild(cur.root);
    document.removeEventListener('mousedown', cur.onDocClick, true);
    document.removeEventListener('keydown', cur.onKey, true);
    if (cur.anchor && cur.anchor.setAttribute) cur.anchor.setAttribute('aria-expanded', 'false');
    STATE.openPopover = null;
}

/**
 * 在锚点旁打开一个弹层。
 *
 * ⚠ 宽度必须在**追加到 body 之前**由 CSS 约束成内容宽度（见 .aic-menu 的
 *   width:max-content）。否则块级弹层会撑满 body，`offsetWidth` 量到整屏宽，
 *   `left = rect.right - offsetWidth` 变负数并被钳到 12px —— 菜单跑到视口最左边。
 *   这个问题 jsdom 测不出来（rect 恒为 0），只能靠真实浏览器截图发现。
 *
 * @param {HTMLElement} anchor
 * @param {HTMLElement} panel
 * @param {{align?: 'right'|'left'}} [opts]
 */
function openPopover(anchor, panel, opts = {}) {
    closePopover();
    panel.classList.add('aic-popover');
    // 先隐藏再入 DOM：避免在测量期间闪一下未定位的弹层
    panel.style.visibility = 'hidden';
    document.body.appendChild(panel);

    const r = anchor.getBoundingClientRect();
    const vw = window.innerWidth || 1024;
    const vh = window.innerHeight || 768;
    const w = Math.min(panel.offsetWidth || 220, vw - 24);
    const h = panel.offsetHeight || 120;
    let left = opts.align === 'left' ? r.left : r.right - w;
    left = Math.max(12, Math.min(left, vw - w - 12));
    let top = r.bottom + 6;
    if (top + h > vh - 12) top = Math.max(12, r.top - 6 - h);
    panel.style.position = 'fixed';
    panel.style.left = left + 'px';
    panel.style.top = top + 'px';
    panel.style.visibility = '';

    const onDocClick = (e) => {
        if (panel.contains(e.target) || anchor.contains(e.target)) return;
        closePopover();
    };
    const onKey = (e) => {
        if (e.key === 'Escape') {
            e.stopPropagation();
            closePopover();
        }
    };
    document.addEventListener('mousedown', onDocClick, true);
    document.addEventListener('keydown', onKey, true);
    STATE.openPopover = { root: panel, onDocClick, onKey, anchor };

    if (anchor.setAttribute) anchor.setAttribute('aria-expanded', 'true');
    return panel;
}

/**
 * ⋯ 更多菜单。
 * @param {Array<{label:string, onClick?:Function, danger?:boolean, disabled?:boolean}>} items
 */
function menuPanel(items) {
    const panel = el('div', 'aic-menu');
    panel.setAttribute('role', 'menu');
    for (const it of items) {
        const node = btn('aic-menu-item' + (it.danger ? ' aic-menu-danger' : ''), it.label);
        node.setAttribute('role', 'menuitem');
        if (it.disabled) {
            node.disabled = true;
        } else {
            node.addEventListener('click', () => {
                closePopover();
                it.onClick();
            });
        }
        panel.appendChild(node);
    }
    return panel;
}

// ---------------------------------------------------------------------------
// 懒加载数据模块
// ---------------------------------------------------------------------------
function getStoreApi() { if (!_storeApi) _storeApi = import('./aiKeyStore.js'); return _storeApi; }
function getProvApi() { if (!_provApi) _provApi = import('./aiProviders.js'); return _provApi; }
function getHealthApi() { if (!_healthApi) _healthApi = import('./aiKeyHealth.js'); return _healthApi; }
function getDiagApi() { if (!_diagApi) _diagApi = import('./aiDiagnostics.js'); return _diagApi; }
function getImporterApi() { if (!_importerApi) _importerApi = import('./aiKeyImporter.js'); return _importerApi; }

// ---------------------------------------------------------------------------
// 数据层：视图模型
// ---------------------------------------------------------------------------

/**
 * 判定一把 Key 的引擎归属**及其可信度**。
 *
 * `resolveProviderId()` 为兼容旧版对 sk- 家族有**前缀兜底**（sk- → deepseek）。
 * 于是 Moonshot / 硅基流动 / 百炼 / Agnes 的 sk- Key 会被静默归到 DeepSeek，
 * 请求发到 api.deepseek.com 后 401。本函数不改那条兜底（改它会改变 AI 管线的
 * 真实路由），而是把「这个归属是**确定的**还是**猜的**」如实标出来：
 *   · explicit —— 用户显式指定过 providerId；
 *   · shape    —— 形状唯一可判定（如 ark- / ms- / sk-or-v1-）；
 *   · fallback —— 只有前缀兜底给出的答案，**需要用户确认**。
 *
 * @returns {{pid: string|null, confidence: 'explicit'|'shape'|'fallback'|'none'}}
 */
function classifyKey(entry, apis) {
    if (!entry) return { pid: null, confidence: 'none' };
    if (entry.providerId) return { pid: entry.providerId, confidence: 'explicit' };
    const byShape = apis.detectProviderId(entry.key);
    if (byShape) return { pid: byShape, confidence: 'shape' };
    const byFallback = apis.resolveProviderId(entry.key, null);
    if (byFallback) return { pid: byFallback, confidence: 'fallback' };
    return { pid: null, confidence: 'none' };
}

/** 构建控制台视图模型（每次都从 store / 注册表重读，保证与内联面板一致） */
async function buildModel() {
    const [provApi, store, health] = await Promise.all([getProvApi(), getStoreApi(), getHealthApi()]);
    const { listProviders, detectProviderId, resolveProviderId, isProviderEnabled } = provApi;
    const keys = store.getAllKeys();
    const providers = listProviders();
    const apis = { detectProviderId, resolveProviderId };

    const byProvider = new Map();
    const unattributed = [];
    for (const entry of keys) {
        const { pid, confidence } = classifyKey(entry, apis);
        if (pid) {
            if (!byProvider.has(pid)) byProvider.set(pid, []);
            byProvider.get(pid).push(entry);
        }
        if (confidence === 'fallback' || confidence === 'none') {
            unattributed.push({ entry, confidence, pid });
        }
    }

    // 状态点：数据层判定，UI 只做展示映射
    const statusOf = new Map();
    for (const p of providers) {
        if (!isProviderEnabled(p.id)) { statusOf.set(p.id, 'off'); continue; }
        const own = byProvider.get(p.id) || [];
        if (own.length === 0) { statusOf.set(p.id, 'disabled'); continue; }
        const anyOk = own.some((k) => {
            const v = health.getVerdict(k.id);
            return !!(v && v.ok);
        });
        statusOf.set(p.id, anyOk ? 'ready' : 'unavailable');
    }

    return {
        providers, keys, byProvider, unattributed, statusOf, store, apis, provApi,
        enabledCount: providers.filter((p) => isProviderEnabled(p.id)).length
    };
}

/** 默认视图：第一个已配置供应商；没有则进「添加供应商」页 */
function defaultView(model) {
    const configured = model.providers.find((p) => (model.byProvider.get(p.id) || []).length > 0);
    if (configured) return { type: 'provider', id: configured.id };
    return { type: 'templates' };
}

// ---------------------------------------------------------------------------
// 左栏：供应商导航
// ---------------------------------------------------------------------------

function navItem(model, provider) {
    const status = model.statusOf.get(provider.id) || 'disabled';
    const count = (model.byProvider.get(provider.id) || []).length;
    const node = btn('aic-nav-item', '', provider.label);
    node.dataset.navId = provider.id;
    const active = STATE.view && STATE.view.type === 'provider' && STATE.view.id === provider.id;
    if (active) node.classList.add('active');
    node.setAttribute('aria-current', active ? 'true' : 'false');

    node.appendChild(providerAvatar(provider, 'sm'));
    const main = el('span', 'aic-nav-main');
    main.appendChild(el('span', 'aic-nav-label', provider.label));
    node.appendChild(main);
    if (count > 0) node.appendChild(el('span', 'aic-nav-count', String(count)));

    const dot = el('span', `aic-dot ${STATUS_PRESENTATION[status].cls}`);
    dot.title = STATUS_PRESENTATION[status].label;
    dot.setAttribute('aria-label', STATUS_PRESENTATION[status].label);
    node.appendChild(dot);

    node.addEventListener('click', () => {
        STATE.view = { type: 'provider', id: provider.id };
        renderAll();
    });
    return node;
}

/** 一个导航分组（标题 + 若干项）。空分组不渲染。 */
function navGroup(title, items, badge) {
    if (items.length === 0) return null;
    const group = el('div', 'aic-nav-group');
    const head = el('div', 'aic-nav-group-head');
    head.appendChild(el('h2', null, title));
    if (badge) head.appendChild(el('span', 'aic-nav-group-badge', badge));
    group.appendChild(head);
    const list = el('div', 'aic-nav-list');
    for (const item of items) list.appendChild(item);
    group.appendChild(list);
    return group;
}

function renderNav(model) {
    if (!_navEl) return;
    clearChildren(_navEl);

    const configured = model.providers.filter((p) => (model.byProvider.get(p.id) || []).length > 0);
    const restBuiltin = model.providers.filter(
        (p) => !p.custom && (model.byProvider.get(p.id) || []).length === 0
    );
    const customs = model.providers.filter((p) => p.custom);

    // 需要注意：归属待确认
    if (model.unattributed.length > 0) {
        const item = btn('aic-nav-item', '', '归属待确认');
        item.dataset.navId = 'unattributed';
        if (STATE.view && STATE.view.type === 'unattributed') item.classList.add('active');
        item.appendChild(el('span', 'aic-nav-glyph', '❓'));
        const main = el('span', 'aic-nav-main');
        main.appendChild(el('span', 'aic-nav-label', '归属待确认'));
        item.appendChild(main);
        item.appendChild(el('span', 'aic-nav-count', String(model.unattributed.length)));
        const dot = el('span', 'aic-dot aic-status-unavailable');
        dot.title = '归属为推断值，建议确认';
        item.appendChild(dot);
        item.addEventListener('click', () => { STATE.view = { type: 'unattributed' }; renderAll(); });
        const g = navGroup('需要注意', [item]);
        if (g) _navEl.appendChild(g);
    }

    for (const [title, list, badge] of [
        ['已配置', configured, String(configured.length)],
        ['内置引擎', restBuiltin, String(restBuiltin.length)],
        ['自定义供应商', customs, String(customs.length)]
    ]) {
        const g = navGroup(title, list.map((p) => navItem(model, p)), badge);
        if (g) _navEl.appendChild(g);
    }

    // 全局
    const storage = btn('aic-nav-item', '', 'Key 存储方式');
    storage.dataset.navId = 'storage';
    if (STATE.view && STATE.view.type === 'storage') storage.classList.add('active');
    storage.appendChild(el('span', 'aic-nav-glyph', '🔐'));
    const sMain = el('span', 'aic-nav-main');
    sMain.appendChild(el('span', 'aic-nav-label', 'Key 存储方式'));
    storage.appendChild(sMain);
    const modeLabel = { memory: '会话', session: '标签页', plain: '明文', persistent: '加密' };
    storage.appendChild(el('span', 'aic-nav-count', modeLabel[model.store.getKeyPersistenceMode()] || '—'));
    storage.addEventListener('click', () => { STATE.view = { type: 'storage' }; renderAll(); });
    const gGlobal = navGroup('全局', [storage]);
    if (gGlobal) _navEl.appendChild(gGlobal);
}

// ---------------------------------------------------------------------------
// 右栏：供应商详情（ZCode 的扁平表单）
// ---------------------------------------------------------------------------

function renderProviderDetail(model, providerId) {
    const provider = model.providers.find((p) => p.id === providerId);
    if (!provider) {
        const wrap = el('div', 'aic-view');
        wrap.appendChild(el('p', 'aic-hint', `供应商「${providerId}」已不存在（可能刚被删除）。`));
        const back = btn('aic-btn', '← 回到列表');
        back.addEventListener('click', () => { STATE.view = defaultView(model); renderAll(); });
        wrap.appendChild(back);
        return wrap;
    }

    const wrap = el('div', 'aic-view');
    const keys = model.byProvider.get(provider.id) || [];

    wrap.appendChild(renderDetailHead(model, provider, keys));
    wrap.appendChild(renderBaseUrlField(model, provider));
    wrap.appendChild(renderProtocolField(model, provider));
    if (provider.custom) wrap.appendChild(renderAdvancedParams(model, provider));
    wrap.appendChild(renderKeySection(model, provider, keys));
    wrap.appendChild(renderModelSection(model, provider));
    wrap.appendChild(renderDiagSection(model, provider, keys));
    return wrap;
}

function renderDetailHead(model, provider, keys) {
    const head = el('div', 'aic-detail-head');
    head.appendChild(providerAvatar(provider, 'md'));
    const nameBox = el('div', 'aic-detail-namebox');
    nameBox.appendChild(el('h2', 'aic-detail-name', provider.label));
    const tags = el('div', 'aic-detail-tags');
    tags.appendChild(tag(provider.custom ? '自定义' : '内置'));
    const proto = provider.protocol === 'anthropic' ? 'anthropic' : 'openai';
    tags.appendChild(tag(PROTOCOL_DISPLAY[proto].name));
    if (!provider.custom) {
        tags.appendChild(tag(
            provider.cors === 'verified' ? 'CORS 已验证'
                : (provider.cors === 'failed' ? 'CORS 不可用' : 'CORS 未核实'),
            provider.cors === 'failed' ? 'warn' : null
        ));
    }
    nameBox.appendChild(tags);
    head.appendChild(nameBox);
    head.appendChild(el('span', 'aic-grow'));

    // 参与自动优选开关（ZCode 的供应商开关）。
    // ⚠ 帮助气泡必须放在开关的 `<label>` **外面** —— 放里面的话，
    //   点一下「?」会连带切换开关（label 会转发点击到自己的控件）。
    const isOn = model.provApi.isProviderEnabled(provider.id);
    const swWrap = el('span', 'aic-switch-wrap');
    const sw = switchControl(isOn, '参与自动优选', async (checked) => {
        const { setProviderEnabled } = await getProvApi();
        setProviderEnabled(provider.id, checked);
        toast(checked
            ? `「${provider.label}」已参与自动优选`
            : `「${provider.label}」不再参与自动优选`, checked ? 'ok' : 'warn');
        renderAll();
    });
    swWrap.append(sw, helpButton('参与自动优选', FIELD_HELP.autoPick));
    head.appendChild(swWrap);

    // ⋯ 更多菜单
    const more = iconBtn('⋯', '更多操作');
    more.id = 'aicProviderMore';
    more.setAttribute('aria-haspopup', 'true');
    more.setAttribute('aria-expanded', 'false');
    more.addEventListener('click', () => {
        const items = [];
        if (provider.baseUrl) {
            items.push({
                label: '📋 复制 Base URL',
                onClick: async () => {
                    try { await navigator.clipboard.writeText(provider.baseUrl); toast('已复制 Base URL', 'ok'); }
                    catch { toast('复制失败：浏览器拒绝了剪贴板访问', 'warn'); }
                }
            });
        }
        if (provider.signupUrl) {
            items.push({
                label: '↗ 去申请 / 管理 Key',
                onClick: () => window.open(provider.signupUrl, '_blank', 'noopener,noreferrer')
            });
        }
        if (keys.length > 0) {
            items.push({ label: '🩺 体检该供应商全部 Key', onClick: () => runDiagOne(model, provider, keys) });
        }
        if (provider.custom) {
            items.push({
                label: '✏️ 重命名该供应商',
                // 菜单项点击时 menuPanel 会先 closePopover()，所以这里再开一个新弹层；
                // 锚点用表头的 ⋯ 按钮（它一直在 DOM 里）。
                onClick: () => openPopover(more, providerRenamePanel(provider), { align: 'right' })
            });
            items.push({ label: '🗑 删除该供应商', danger: true, onClick: () => deleteCustomProvider(provider, model) });
        }
        if (items.length === 0) items.push({ label: '（暂无可执行操作）', disabled: true });
        openPopover(more, menuPanel(items));
    });
    head.appendChild(more);
    return head;
}

function renderBaseUrlField(model, provider) {
    const box = field('Base URL', provider.custom ? 'baseUrl' : null);
    const input = el('input', 'aic-input');
    input.type = 'text';
    input.value = provider.baseUrl || '';
    if (provider.custom) {
        input.spellcheck = false;
        input.id = 'aicBaseUrlInput';
    } else {
        input.readOnly = true;
        input.classList.add('aic-input-readonly');
    }
    box.appendChild(input);
    if (provider.custom) {
        // ⚠ 必须「失焦即存」：这两个字段在表单最上面，而显式保存按钮原先只存在于
        //   折叠的「高级请求参数」里 —— 用户改了 Base URL 却看不到任何保存入口，
        //   一刷新就白改。ZCode 的模型设置页同样没有保存按钮（改完即生效），
        //   这里照同一范式，并用行内状态把结果说清楚。
        const msg = el('p', 'aic-hint aic-field-msg');
        box.appendChild(msg);
        const commit = async () => {
            const { validateBaseUrl, getCustomProviders, setCustomProviders } = await getProvApi();
            const v = validateBaseUrl(input.value);
            if (!v.ok) {
                safeText(msg, v.error);
                msg.className = 'aic-hint aic-field-msg aic-msg-fail';
                return;   // 非法值不落库，用户可继续改；输入框保留原值以便修正
            }
            if (v.normalized === provider.baseUrl) {
                safeText(msg, '');
                msg.className = 'aic-hint aic-field-msg';
                return;
            }
            setCustomProviders(getCustomProviders().map((p) => (
                p.id === provider.id ? Object.assign({}, p, { baseUrl: v.normalized }) : p
            )));
            input.value = v.normalized;
            safeText(msg, '已保存');
            msg.className = 'aic-hint aic-field-msg aic-msg-ok';
            toast('Base URL 已保存', 'ok');
            renderAll();
        };
        input.addEventListener('change', commit);
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); input.blur(); } });
    } else {
        box.appendChild(el('p', 'aic-hint',
            '内置引擎的地址是经过验证的固定值，不开放修改 —— 改错会直接导致 401/404。'
            + '需要自定义地址请用「＋ 添加供应商」。'));
    }
    return box;
}

function renderProtocolField(model, provider) {
    const box = field('API 格式', 'protocol');
    const proto = provider.protocol === 'anthropic' ? 'anthropic' : 'openai';
    if (provider.custom) {
        const select = el('select', 'aic-input');
        select.id = 'aicProtocolSelect';
        for (const value of ['openai', 'anthropic']) {
            const opt = el('option', null, protocolOptionLabel(value));
            opt.value = value;
            select.appendChild(opt);
        }
        select.value = proto;
        box.appendChild(select);
        // 同样「改完即存」：协议决定了端点路径与鉴权方式，切换后必须立刻落库，
        // 否则下一次体检/调用仍按旧协议发请求。
        select.addEventListener('change', async () => {
            const { getCustomProviders, setCustomProviders, PROTOCOL_DEFAULT_CHAT_PATH } = await getProvApi();
            const next = select.value === 'anthropic' ? 'anthropic' : 'openai';
            if (next === proto) return;
            setCustomProviders(getCustomProviders().map((p) => (p.id !== provider.id ? p : Object.assign({}, p, {
                protocol: next,
                chatPath: PROTOCOL_DEFAULT_CHAT_PATH[next]
            }))));
            toast(`API 格式已切换为 ${PROTOCOL_DISPLAY[next].name}`, 'ok');
            renderAll();
        });
    } else {
        const ro = el('input', 'aic-input aic-input-readonly');
        ro.type = 'text';
        ro.readOnly = true;
        ro.value = protocolOptionLabel(proto);
        box.appendChild(ro);
    }
    return box;
}

function renderAdvancedParams(model, provider) {
    const wrap = el('div', 'aic-advanced');
    const open = STATE.advancedOpen.has(provider.id);
    if (open) wrap.classList.add('open');
    const trigger = btn('aic-advanced-trigger');
    trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
    trigger.appendChild(el('span', 'aic-chevron', '›'));
    trigger.appendChild(el('span', null, '高级请求参数（留空即用模型提供商默认值）'));
    trigger.addEventListener('click', () => {
        // 折叠是纯展示状态：不触发重绘、不写历史
        const isOpen = wrap.classList.toggle('open');
        trigger.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
        if (isOpen) STATE.advancedOpen.add(provider.id); else STATE.advancedOpen.delete(provider.id);
    });

    const body = el('div', 'aic-advanced-body');
    const grid = el('div', 'aic-param-grid');
    const inputs = {};
    for (const [key, label, helpKey, attrs] of [
        ['maxTokens', 'max_tokens', 'maxTokens', { min: '1', max: '200000', step: '1' }],
        ['temperature', 'temperature', 'temperature', { min: '0', max: '2', step: '0.1' }],
        ['topP', 'top_p', 'topP', { min: '0', max: '1', step: '0.05' }]
    ]) {
        const cell = field(label, helpKey);
        const input = el('input', 'aic-input');
        input.type = 'number';
        for (const [k, v] of Object.entries(attrs)) input.setAttribute(k, v);
        input.placeholder = '留空 = 默认';
        input.id = `aicParam-${key}`;
        if (provider[key] !== undefined && provider[key] !== null) input.value = String(provider[key]);
        inputs[key] = input;
        cell.appendChild(input);
        grid.appendChild(cell);
    }
    body.appendChild(grid);

    const extraBox = field('其它请求体参数（JSON）', 'extraParams');
    const extra = el('textarea', 'aic-input aic-textarea');
    extra.rows = 3;
    extra.spellcheck = false;
    extra.id = 'aicParamExtra';
    extra.placeholder = '{"top_k": 40, "frequency_penalty": 0.2}';
    if (provider.extraParams && Object.keys(provider.extraParams).length > 0) {
        extra.value = JSON.stringify(provider.extraParams, null, 2);
    }
    extraBox.appendChild(extra);
    body.appendChild(extraBox);

    const row = el('div', 'aic-add-row');
    const save = btn('aic-btn-solid aic-btn-sm', '保存参数');
    const msg = el('span', 'aic-inline-msg');
    row.append(save, msg);
    body.appendChild(el('p', 'aic-hint',
        'Base URL 与 API 格式在上方，**改完失焦即存**；本组只管请求参数。'));

    // 只保存**请求参数**。
    // Base URL 与 API 格式由它们自己的字段「失焦即存」，这里不再重复写 ——
    // 否则同一份数据有两个写入方，折叠区里那份还会用旧的 provider.baseUrl 覆盖掉
    // 用户刚刚在上面改好的值。
    save.addEventListener('click', async () => {
        const { getCustomProviders, setCustomProviders, normalizeParam, normalizeExtraParams } = await getProvApi();
        let extraParams;
        const rawExtra = extra.value.trim();
        if (rawExtra) {
            // normalizeExtraParams 的返回是 { ok, value, error }（不是裸对象），
            // 且它同时负责拦 __proto__ / constructor / prototype 等原型污染键。
            const norm = normalizeExtraParams
                ? normalizeExtraParams(rawExtra)
                : { ok: false, error: '参数校验器不可用' };
            if (!norm.ok) {
                safeText(msg, norm.error || '其它参数不是合法 JSON 对象');
                msg.className = 'aic-inline-msg aic-msg-fail';
                return;
            }
            extraParams = norm.value;
        }
        setCustomProviders(getCustomProviders().map((p) => (p.id !== provider.id ? p : Object.assign({}, p, {
            maxTokens: normalizeParam ? normalizeParam('maxTokens', inputs.maxTokens.value) : undefined,
            temperature: normalizeParam ? normalizeParam('temperature', inputs.temperature.value) : undefined,
            topP: normalizeParam ? normalizeParam('topP', inputs.topP.value) : undefined,
            extraParams
        }))));
        safeText(msg, '已保存');
        msg.className = 'aic-inline-msg aic-msg-ok';
        toast('请求参数已保存', 'ok');
        renderAll();
    });

    wrap.append(trigger, body);
    return wrap;
}

// ---------------------------------------------------------------------------
// API Key 列表
// ---------------------------------------------------------------------------

function renderKeySection(model, provider, keys) {
    const section = el('section', 'aic-section');

    const addBtn = btn('aic-btn aic-btn-sm', '＋ 添加 Key');
    addBtn.id = 'aicAddKey';
    section.appendChild(fieldRow('API Key', null, addBtn));

    const addRow = el('div', 'aic-add-row');
    addRow.id = 'aicAddKeyRow';
    addRow.style.display = 'none';
    const { wrap: inputWrap, input } = eyeInput({
        placeholder: `粘贴 ${provider.label} 的 Key${provider.keyShape && provider.keyShape.hint ? `（${provider.keyShape.hint}）` : ''}`
    });
    input.id = 'aicNewKeyInput';
    const confirm = btn('aic-btn-solid aic-btn-sm', '添加');
    addRow.append(inputWrap, confirm);
    section.appendChild(addRow);

    addBtn.addEventListener('click', () => {
        const showing = addRow.style.display !== 'none';
        addRow.style.display = showing ? 'none' : 'flex';
        addBtn.textContent = showing ? '＋ 添加 Key' : '取消';
        if (!showing) input.focus();
    });

    const submit = async () => {
        const value = input.value.trim();
        if (!value) { toast('请先粘贴 API Key', 'warn'); input.focus(); return; }
        if (value.length < 8 || /\s/.test(value)) {
            toast('Key 看起来不完整（不应含空格，且至少 8 位）', 'warn');
            input.focus();
            return;
        }
        const store = model.store;
        const added = store.addKey({ key: value, providerId: provider.id });
        const { bindKeyToProvider, resolveProviderId } = await getProvApi();
        const guessed = resolveProviderId(value, null);
        if (added && added.id) {
            // 内置引擎走 store 的校验路径，自定义引擎走 raw 路径（store 不认运行时 id）
            if (provider.custom) {
                if (typeof store.setKeyProviderRaw === 'function') store.setKeyProviderRaw(added.id, provider.id);
            } else if (guessed === provider.id) {
                store.setKeyProvider(added.id, provider.id);
            } else if (typeof bindKeyToProvider === 'function') {
                bindKeyToProvider(added.id, provider.id);   // 用户在此供应商下添加 → 尊重用户意图
            }
        }
        input.value = '';
        addRow.style.display = 'none';
        addBtn.textContent = '＋ 添加 Key';
        toast(guessed === provider.id
            ? '已添加并绑定到该供应商'
            : '已添加。该 Key 前缀有歧义，已按你的选择绑定到当前供应商', 'ok');
        renderAll();
    };
    confirm.addEventListener('click', submit);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } });

    if (keys.length === 0) {
        section.appendChild(el('p', 'aic-hint', '该供应商还没有 Key。点右上角「＋ 添加 Key」粘贴一个即可启用。'));
    } else {
        const list = el('div', 'aic-list');
        for (const entry of keys) list.appendChild(renderKeyRow(model, provider, entry));
        section.appendChild(list);
    }
    return section;
}

function renderKeyRow(model, provider, entry) {
    const store = model.store;
    const verdict = model.health && model.health.getVerdict ? model.health.getVerdict(entry.id) : null;
    const active = store.getActiveKey();
    const isActive = !!active && active.id === entry.id;

    const row = el('div', 'aic-list-row');
    if (isActive) row.classList.add('active');

    // 生效单选（ZCode 每个供应商只有一把 Key，因此没有这一列；
    // 本项目支持多把 Key，必须让用户能指定哪把生效）
    const pick = el('input', 'aic-radio');
    pick.type = 'radio';
    pick.name = 'aic-active-key';
    pick.checked = isActive;
    pick.title = '设为生效 Key';
    pick.setAttribute('aria-label', '设为生效 Key');
    pick.addEventListener('change', () => {
        store.setKeyMode('manual');
        store.setActiveKey(entry.id);
        toast('已切换生效 Key', 'ok');
        renderAll();
    });
    row.appendChild(pick);

    const val = el('code', 'aic-row-name aic-mono', store.maskKey(entry.key));
    row.appendChild(val);

    const badgeText = verdictBadge(verdict);
    if (badgeText) row.appendChild(tag(badgeText, verdict && verdict.ok ? 'ok' : 'warn'));
    if (entry.modelId) row.appendChild(tag(entry.modelId));

    row.appendChild(el('span', 'aic-grow'));

    // 行内动作：眼睛 / 复制 / 删除
    const eye = iconBtn('', '显示 / 隐藏完整 Key');
    setEyeIcon(eye, false);
    let shown = false;
    eye.addEventListener('click', () => {
        shown = !shown;
        val.textContent = shown ? entry.key : store.maskKey(entry.key);
        val.classList.toggle('revealed', shown);
        setEyeIcon(eye, shown);
    });
    row.appendChild(eye);

    row.appendChild(iconBtn('📋', '复制该 Key', async () => {
        try { await navigator.clipboard.writeText(entry.key); toast('已复制到剪贴板', 'ok'); }
        catch { toast('复制失败：浏览器拒绝了剪贴板访问', 'warn'); }
    }));

    row.appendChild(iconBtn('🗑', '删除该 Key', () => {
        store.removeKey(entry.id);
        toast('已删除该 Key', 'ok');
        renderAll();
    }, true));

    return row;
}

// ---------------------------------------------------------------------------
// 模型列表
// ---------------------------------------------------------------------------

function renderModelSection(model, provider) {
    const section = el('section', 'aic-section');
    const models = Array.isArray(provider.models) ? provider.models : [];

    const addBtn = btn('aic-btn aic-btn-sm', '＋ 添加模型');
    addBtn.id = 'aicAddModel';
    section.appendChild(fieldRow('模型列表', 'models', addBtn));

    const addRow = el('div', 'aic-add-row');
    addRow.id = 'aicAddModelRow';
    addRow.style.display = 'none';
    const input = el('input', 'aic-input');
    input.type = 'text';
    input.spellcheck = false;
    input.id = 'aicNewModelInput';
    input.placeholder = '模型 ID，多个用逗号分隔（如 glm-4.7-flash, MiniCPM5-2B）';
    const confirm = btn('aic-btn-solid aic-btn-sm', '添加');
    addRow.append(input, confirm);
    section.appendChild(addRow);

    addBtn.addEventListener('click', () => {
        if (!provider.custom) {
            toast('内置引擎的模型清单由注册表维护，请用「＋ 添加供应商」建一个自定义供应商', 'warn');
            return;
        }
        const showing = addRow.style.display !== 'none';
        addRow.style.display = showing ? 'none' : 'flex';
        addBtn.textContent = showing ? '＋ 添加模型' : '取消';
        if (!showing) input.focus();
    });

    const submit = async () => {
        const raw = input.value.trim();
        if (!raw) { toast('请填写模型 ID', 'warn'); return; }
        const { addModelToCustomProvider, parseModelIds } = await getProvApi();
        const ids = parseModelIds(raw);
        if (!ids || ids.length === 0) { toast('没有解析出合法模型 ID', 'warn'); return; }
        let added = 0;
        for (const id of ids) if (addModelToCustomProvider(provider.id, id)) added++;
        input.value = '';
        addRow.style.display = 'none';
        addBtn.textContent = '＋ 添加模型';
        toast(added > 0 ? `已添加 ${added} 个模型` : '模型已存在，未重复添加', added > 0 ? 'ok' : 'warn');
        renderAll();
    };
    confirm.addEventListener('click', submit);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } });

    if (models.length === 0) {
        section.appendChild(el('p', 'aic-hint',
            provider.custom
                ? '该供应商还没有登记模型。点右上角「＋ 添加模型」填一个模型 ID。'
                : '注册表里没有该引擎的模型记录。'));
        return section;
    }

    const active = model.store.getEffectiveKeyEntry();
    const list = el('div', 'aic-list');
    for (const m of models) list.appendChild(renderModelRow(model, provider, m, active));
    section.appendChild(list);

    if (!provider.custom) {
        section.appendChild(el('p', 'aic-hint',
            '内置引擎的模型清单由注册表（源码）维护，不能在界面上增删。'
            + '若需要清单外的模型，请用「＋ 添加供应商」建一个自定义供应商。'));
    }
    return section;
}

function renderModelRow(model, provider, m, active) {
    const row = el('div', 'aic-list-row');
    const isCurrent = !!active && active.modelId === m.id
        && classifyKey(active, model.apis).pid === provider.id;
    if (isCurrent) row.classList.add('active');

    row.appendChild(el('code', 'aic-row-name aic-mono', m.id));

    // 标签只显示我们**真实拥有**的事实（不编造上下文窗口 / 视觉能力）
    if (m.tier && TIER_LABEL[m.tier]) row.appendChild(tag(TIER_LABEL[m.tier], m.tier === 'free' ? 'ok' : null));
    if (m.jsonMode === true) row.appendChild(tag('JSON'));
    if (m.fullCheck) row.appendChild(tag('全量检查', 'info'));
    if (m.slow) row.appendChild(tag('较慢', 'warn'));
    if (isCurrent) row.appendChild(tag('当前使用', 'ok'));

    row.appendChild(el('span', 'aic-grow'));

    // 行内动作：设为当前模型 / 高级设置 / 编辑 / 删除 / 开关
    const useBtn = iconBtn('◎', isCurrent ? '已是当前 Key 使用的模型' : '设为当前 Key 使用的模型', () => {
        if (!active) { toast('请先添加并选中一把 Key', 'warn'); return; }
        if (classifyKey(active, model.apis).pid !== provider.id) {
            toast('当前生效的 Key 不属于该供应商，请先在左侧选中它并把一把 Key 设为生效', 'warn');
            return;
        }
        model.store.setKeyModel(active.id, m.id);
        toast(`已把当前 Key 的模型设为 ${m.id}`, 'ok');
        renderAll();
    });
    if (isCurrent) useBtn.classList.add('aic-icon-active');
    row.appendChild(useBtn);

    row.appendChild(iconBtn('⚙', '模型高级设置', (e) => {
        openPopover(e.currentTarget, modelMetaPanel(provider, m), { align: 'right' });
    }));

    if (provider.custom) {
        row.appendChild(iconBtn('✏️', '编辑模型 ID', (e) => {
            openPopover(e.currentTarget, modelRenamePanel(provider, m), { align: 'right' });
        }));
        row.appendChild(iconBtn('🗑', '删除该模型', async () => {
            const { removeCustomModel } = await getProvApi();
            if (removeCustomModel(provider.id, m.id)) {
                toast(`已删除模型 ${m.id}`, 'ok');
                renderAll();
            } else {
                toast('删除失败：模型不存在', 'warn');
            }
        }, true));
    }

    const sw = switchControl(model.provApi.isModelEnabled(provider.id, m.id), '参与自动优选', async (checked) => {
        const { setModelEnabled } = await getProvApi();
        setModelEnabled(provider.id, m.id, checked);
        toast(checked ? `${m.id} 已参与自动优选` : `${m.id} 不再参与自动优选`, checked ? 'ok' : 'warn');
        renderAll();
    });
    row.appendChild(sw);

    return row;
}

/** 模型高级设置面板（ZCode 的 ProviderModelMetadataDialog 的轻量版） */
function modelMetaPanel(provider, m) {
    const panel = el('div', 'aic-pop-panel');
    panel.appendChild(el('div', 'aic-pop-title', m.id));

    const editable = !!provider.custom;
    if (!editable) {
        panel.appendChild(el('p', 'aic-hint', '内置引擎的模型元数据来自注册表（源码），此处只读。'));
    }

    const tierBox = field('档位', editable ? 'tier' : null);
    const tierSel = el('select', 'aic-input');
    for (const t of ['free', 'cheap', 'paid']) {
        const opt = el('option', null, TIER_LABEL[t]);
        opt.value = t;
        tierSel.appendChild(opt);
    }
    tierSel.value = TIER_LABEL[m.tier] ? m.tier : 'cheap';
    tierSel.disabled = !editable;
    tierBox.appendChild(tierSel);
    panel.appendChild(tierBox);

    const jsonBox = field('JSON 模式', editable ? 'jsonMode' : null);
    const jsonSel = el('select', 'aic-input');
    for (const [v, label] of [['unknown', '未知（尝试后自动降级）'], ['true', '支持'], ['false', '不支持']]) {
        const opt = el('option', null, label);
        opt.value = v;
        jsonSel.appendChild(opt);
    }
    jsonSel.value = m.jsonMode === true ? 'true' : (m.jsonMode === false ? 'false' : 'unknown');
    jsonSel.disabled = !editable;
    jsonBox.appendChild(jsonSel);
    panel.appendChild(jsonBox);

    const flags = el('div', 'aic-flag-list');
    const fullWrap = el('label', 'aic-flag');
    const fullCb = el('input');
    fullCb.type = 'checkbox';
    fullCb.checked = !!m.fullCheck;
    fullCb.disabled = !editable;
    fullWrap.append(fullCb, el('span', null, '用于「全量检查」'));
    fullWrap.appendChild(helpButton('全量检查', FIELD_HELP.fullCheck));
    flags.appendChild(fullWrap);

    const slowWrap = el('label', 'aic-flag');
    const slowCb = el('input');
    slowCb.type = 'checkbox';
    slowCb.checked = !!m.slow;
    slowCb.disabled = !editable;
    slowWrap.append(slowCb, el('span', null, '实测较慢（不给速度分）'));
    slowWrap.appendChild(helpButton('实测较慢', FIELD_HELP.slow));
    flags.appendChild(slowWrap);
    panel.appendChild(flags);

    if (editable) {
        const row = el('div', 'aic-add-row');
        const save = btn('aic-btn-solid aic-btn-sm', '保存');
        const msg = el('span', 'aic-inline-msg');
        save.addEventListener('click', async () => {
            const { updateCustomModel } = await getProvApi();
            const jsonVal = jsonSel.value === 'true' ? true : (jsonSel.value === 'false' ? false : null);
            const ok = updateCustomModel(provider.id, m.id, {
                tier: tierSel.value,
                jsonMode: jsonVal,
                fullCheck: fullCb.checked,
                slow: slowCb.checked
            });
            if (ok) {
                closePopover();
                toast(`已保存 ${m.id} 的设置`, 'ok');
                renderAll();
            } else {
                safeText(msg, '保存失败');
                msg.className = 'aic-inline-msg aic-msg-fail';
            }
        });
        row.append(save, msg);
        panel.appendChild(row);
    }
    return panel;
}

/** 供应商重命名面板（仅自定义供应商） */
function providerRenamePanel(provider) {
    const panel = el('div', 'aic-pop-panel');
    panel.appendChild(el('div', 'aic-pop-title', '重命名供应商'));
    const box = field('名称');
    const input = el('input', 'aic-input');
    input.type = 'text';
    input.spellcheck = false;
    input.value = provider.label || '';
    input.maxLength = 40;
    box.appendChild(input);
    panel.appendChild(box);
    panel.appendChild(el('p', 'aic-hint',
        '只改显示名，不影响 id / Base URL / 模型与已绑定的 Key。'));
    const row = el('div', 'aic-add-row');
    const save = btn('aic-btn-solid aic-btn-sm', '保存');
    const msg = el('span', 'aic-inline-msg');
    save.addEventListener('click', async () => {
        const { renameCustomProvider } = await getProvApi();
        const res = renameCustomProvider(provider.id, input.value);
        if (res.ok) {
            closePopover();
            toast('已重命名供应商', 'ok');
            renderAll();
        } else {
            safeText(msg, res.error || '重命名失败');
            msg.className = 'aic-inline-msg aic-msg-fail';
        }
    });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); save.click(); } });
    row.append(save, msg);
    panel.appendChild(row);
    return panel;
}

/** 模型重命名面板 */
function modelRenamePanel(provider, m) {
    const panel = el('div', 'aic-pop-panel');
    panel.appendChild(el('div', 'aic-pop-title', '编辑模型 ID'));
    const box = field('模型 ID');
    const input = el('input', 'aic-input aic-mono');
    input.type = 'text';
    input.spellcheck = false;
    input.value = m.id;
    box.appendChild(input);
    panel.appendChild(box);
    const row = el('div', 'aic-add-row');
    const save = btn('aic-btn-solid aic-btn-sm', '保存');
    const msg = el('span', 'aic-inline-msg');
    save.addEventListener('click', async () => {
        const { renameCustomModel } = await getProvApi();
        const res = renameCustomModel(provider.id, m.id, input.value);
        if (res.ok) {
            closePopover();
            toast('已重命名模型', 'ok');
            renderAll();
        } else {
            safeText(msg, res.error || '重命名失败');
            msg.className = 'aic-inline-msg aic-msg-fail';
        }
    });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); save.click(); } });
    row.append(save, msg);
    panel.appendChild(row);
    return panel;
}

// ---------------------------------------------------------------------------
// 体检（折叠区）
// ---------------------------------------------------------------------------

function renderDiagSection(model, provider, keys) {
    const details = el('details', 'aic-fold');
    const summary = el('summary');
    summary.appendChild(el('span', null, '🩺 体检'));
    summary.appendChild(el('span', 'aic-fold-badge', keys.length > 0 ? `${keys.length} 把 Key` : '无 Key'));
    details.appendChild(summary);

    const body = el('div', 'aic-fold-body');
    body.appendChild(el('p', 'aic-hint',
        '体检会**真实发起一次极小的调用**（max_tokens ≤ 8）来验证 Key 确实可用，'
        + '因此会消耗极少量额度。逐项报告 Key / 地址 / 模型 / 协议 / 联网实测，'
        + '成功也给结论，失败会带上可执行的修正建议。'));

    const actions = el('div', 'aic-add-row');
    const runOne = btn('aic-btn aic-btn-sm', '体检当前生效的 Key');
    runOne.disabled = keys.length === 0;
    runOne.addEventListener('click', () => runDiagOne(model, provider, null));
    const runAll = btn('aic-btn aic-btn-sm', `体检全部 ${keys.length} 把 Key`);
    runAll.disabled = keys.length === 0;
    runAll.addEventListener('click', () => runDiagOne(model, provider, keys));
    actions.append(runOne, runAll);
    body.appendChild(actions);

    const sum = el('div', 'aic-diag-summary');
    sum.id = `aicDiagSummary-${provider.id}`;
    sum.style.display = 'none';
    body.appendChild(sum);
    const results = el('div', 'aic-diag-results');
    results.id = `aicDiagResults-${provider.id}`;
    body.appendChild(results);

    details.appendChild(body);
    return details;
}

/** 删除自定义供应商 */
async function deleteCustomProvider(provider, model) {
    const { removeCustomProvider } = await getProvApi();
    const store = model.store;
    // Key 写入函数由控制台注入 —— aiProviders 不依赖 aiKeyStore，避免新增反向依赖边
    const writeProvider = typeof store.setKeyProviderRaw === 'function'
        ? (id, pid) => store.setKeyProviderRaw(id, pid)
        : null;
    const res = removeCustomProvider(provider.id, store.getAllKeys(), writeProvider);
    if (!res.ok) { toast(res.error || '删除失败', 'warn'); return; }
    toast(res.detached > 0
        ? `已删除「${provider.label}」，${res.detached} 个 Key 已退回「归属待确认」`
        : `已删除供应商「${provider.label}」`, 'ok');
    STATE.view = defaultView(model);
    renderAll();
}

// ---------------------------------------------------------------------------
// 归属待确认
// ---------------------------------------------------------------------------

function renderUnattributedView(model) {
    const wrap = el('div', 'aic-view');
    const head = el('div', 'aic-detail-head');
    head.appendChild(el('span', 'aic-nav-glyph', '❓'));
    const nameBox = el('div', 'aic-detail-namebox');
    nameBox.appendChild(el('h2', 'aic-detail-name', '归属待确认'));
    head.appendChild(nameBox);
    wrap.appendChild(head);

    wrap.appendChild(el('p', 'aic-hint',
        '这些 Key 的引擎归属**不是确定的**，而是推断出来的：它们的前缀被多个引擎共用'
        + '（典型是 sk- 家族 —— DeepSeek / Kimi / 硅基流动 / 阿里百炼 / Agnes 都用它），'
        + '形状无法唯一判定。本应用为兼容旧版仍会按前缀兜底（sk- → DeepSeek），'
        + '但那个答案可能是错的：请求会发到 api.deepseek.com 并返回 401。'
        + '请在下面确认或改成正确的供应商 —— 指定一次即可永久生效。'));

    if (model.unattributed.length === 0) {
        wrap.appendChild(el('p', 'aic-hint', '目前没有需要确认归属的 Key。'));
        return wrap;
    }

    const list = el('div', 'aic-list');
    for (const item of model.unattributed) {
        const { entry, confidence, pid } = item;
        const row = el('div', 'aic-list-row');
        row.appendChild(el('code', 'aic-row-name aic-mono', model.store.maskKey(entry.key)));
        const assumed = pid ? model.providers.find((p) => p.id === pid) : null;
        row.appendChild(tag(
            confidence === 'fallback' ? `兜底推断：${assumed ? assumed.label : pid}` : '无法判定',
            'warn'
        ));
        row.appendChild(el('span', 'aic-grow'));

        const select = el('select', 'aic-input aic-select-inline');
        const none = el('option', null, '— 请选择供应商 —');
        none.value = '';
        select.appendChild(none);
        for (const p of model.providers) {
            if (p.cors === 'failed') continue;
            const opt = el('option', null,
                (p.custom ? `🧩 ${p.label}` : p.label) + (p.id === pid ? '（当前推断值）' : ''));
            opt.value = p.id;
            if (p.id === pid) opt.selected = true;
            select.appendChild(opt);
        }
        select.addEventListener('change', async () => {
            const nextPid = select.value;
            if (!nextPid) return;
            const { bindKeyToProvider, getProvider } = await getProvApi();
            if (typeof bindKeyToProvider === 'function') bindKeyToProvider(entry.id, nextPid);
            const p = getProvider(nextPid);
            toast(`已把该 Key 指定为「${p ? p.label : nextPid}」`, 'ok');
            STATE.view = { type: 'provider', id: nextPid };
            renderAll();
        });
        row.appendChild(select);
        list.appendChild(row);
    }
    wrap.appendChild(list);

    const actions = el('div', 'aic-add-row');
    const run = btn('aic-btn-solid aic-btn-sm', '🩺 逐个体检这些 Key');
    run.addEventListener('click', () => { runDiagAll(); });
    actions.appendChild(run);
    wrap.appendChild(actions);
    return wrap;
}

// ---------------------------------------------------------------------------
// 添加供应商（模板选择 + 从零自定义）
// ---------------------------------------------------------------------------

function renderTemplatePicker(model) {
    const wrap = el('div', 'aic-view');
    const head = el('div', 'aic-detail-head');
    const back = iconBtn('←', '返回');
    back.addEventListener('click', () => { STATE.view = defaultView(model); renderAll(); });
    head.appendChild(back);
    const nameBox = el('div', 'aic-detail-namebox');
    nameBox.appendChild(el('h2', 'aic-detail-name', '添加供应商'));
    nameBox.appendChild(el('p', 'aic-hint',
        '选一个内置引擎模板即可直接添加（只需再填一把 Key）；'
        + '注册表里没有的厂商请用「从零自定义供应商」。'));
    head.appendChild(nameBox);
    wrap.appendChild(head);

    const customSection = el('section', 'aic-section');
    customSection.appendChild(el('h3', 'aic-section-title', '自定义'));
    const customGrid = el('div', 'aic-picker-grid');
    customGrid.appendChild(pickerCard({
        glyph: '＋',
        label: '从零自定义供应商',
        sub: '名称 + Base URL + 模型 + API 格式，一次收齐 Key',
        onClick: () => {
            // 只改状态再重绘 —— 不要在 renderAll() 之后往详情区 insertBefore：
            // renderAll 是异步的，插进去的节点会被随后到来的 replaceChildren 抹掉。
            STATE.showCustomForm = true;
            renderAll();
        }
    }));
    customSection.appendChild(customGrid);
    wrap.appendChild(customSection);
    if (STATE.showCustomForm) wrap.appendChild(buildCustomProviderForm(model));

    const already = new Set([...model.byProvider.keys()]);
    const builtins = model.providers.filter((p) => !p.custom);
    for (const g of [
        { title: '内置引擎（尚未添加）', items: builtins.filter((p) => !already.has(p.id)) },
        { title: '内置引擎（已添加过，再选即复用）', items: builtins.filter((p) => already.has(p.id)) }
    ]) {
        if (g.items.length === 0) continue;
        const section = el('section', 'aic-section');
        section.appendChild(el('h3', 'aic-section-title', g.title));
        const grid = el('div', 'aic-picker-grid');
        for (const p of g.items) {
            grid.appendChild(pickerCard({
                provider: p,
                label: p.label,
                sub: p.baseUrl,
                onClick: () => {
                    STATE.view = { type: 'provider', id: p.id };
                    renderAll();
                    toast(`请在「${p.label}」里粘贴 Key 完成配置`, 'ok');
                }
            }));
        }
        section.appendChild(grid);
        wrap.appendChild(section);
    }
    return wrap;
}

function pickerCard({ provider, glyph, label, sub, onClick }) {
    const card = btn('aic-picker-card', '', label);
    if (provider) card.appendChild(providerAvatar(provider, 'md'));
    else card.appendChild(el('span', 'aic-picker-glyph', glyph));
    const main = el('span', 'aic-picker-main');
    main.appendChild(el('span', 'aic-picker-label', label));
    if (sub) main.appendChild(el('span', 'aic-picker-sub', sub));
    card.appendChild(main);
    card.appendChild(el('span', 'aic-picker-arrow', '›'));
    card.addEventListener('click', onClick);
    return card;
}

/** 「从零自定义供应商」表单（纯构建函数：只返回节点，不碰 STATE、不触发重绘） */
function buildCustomProviderForm(model) {
    const card = el('div', 'aic-card aic-card-focus');
    const head = el('div', 'aic-card-head');
    head.appendChild(el('h3', null, '＋ 从零自定义供应商'));
    head.appendChild(iconBtn('✕', '收起表单', () => { STATE.showCustomForm = false; renderAll(); }));
    card.appendChild(head);

    const inputs = {};
    for (const [name, label, type, placeholder, helpKey] of [
        ['key', 'API Key', 'password', '完整的 API Key（如 sk-… / sk-ant-…）', null],
        ['baseUrl', 'Base URL', 'text', 'https://api.example.com/v1（不要带 /chat/completions）', 'baseUrl'],
        ['modelId', '模型 ID', 'text', '如 claude-sonnet-4-5；多个用逗号分隔', 'models'],
        ['label', '名称（可选）', 'text', '留空则自动取域名', null]
    ]) {
        const box = field(label, helpKey);
        const input = el('input', 'aic-input');
        input.type = type;
        if (type === 'password') input.autocomplete = 'off';
        input.spellcheck = false;
        input.placeholder = placeholder;
        inputs[name] = input;
        box.appendChild(input);
        card.appendChild(box);
    }

    const protoBox = field('API 格式', 'protocol');
    const proto = el('select', 'aic-input');
    for (const value of ['openai', 'anthropic']) {
        const opt = el('option', null, protocolOptionLabel(value));
        opt.value = value;
        proto.appendChild(opt);
    }
    protoBox.appendChild(proto);
    card.appendChild(protoBox);

    const row = el('div', 'aic-add-row');
    const submit = btn('aic-btn-solid aic-btn-sm', '＋ 添加并使用');
    const msg = el('span', 'aic-inline-msg');
    row.append(submit, msg);
    card.appendChild(row);

    submit.addEventListener('click', async () => {
        const { addCustomProviderWithKey } = await getProvApi();
        const store = model.store;
        const res = addCustomProviderWithKey({
            key: inputs.key.value.trim(),
            baseUrl: inputs.baseUrl.value.trim(),
            modelId: inputs.modelId.value.trim(),
            label: inputs.label.value.trim(),
            protocol: proto.value
        });
        if (!res.ok) {
            safeText(msg, res.error);
            msg.className = 'aic-inline-msg aic-msg-fail';
            return;
        }
        const added = store.addKey({ key: inputs.key.value.trim(), providerId: res.providerId });
        if (added && added.id && typeof store.setKeyProviderRaw === 'function') {
            store.setKeyProviderRaw(added.id, res.providerId);
        }
        store.setKeyMode('manual');
        if (added && added.id) store.setActiveKey(added.id);
        safeText(msg, res.reused ? '已复用同地址的供应商并合并模型' : '已创建');
        msg.className = 'aic-inline-msg aic-msg-ok';
        toast('供应商已添加并设为当前使用', 'ok');
        STATE.showCustomForm = false;
        STATE.view = { type: 'provider', id: res.providerId };
        renderAll();
    });

    return card;
}

// ---------------------------------------------------------------------------
// Key 存储方式
// ---------------------------------------------------------------------------

function renderStorageView(model) {
    const store = model.store;
    const wrap = el('div', 'aic-view');
    const head = el('div', 'aic-detail-head');
    head.appendChild(el('span', 'aic-nav-glyph', '🔐'));
    const nameBox = el('div', 'aic-detail-namebox');
    nameBox.appendChild(el('h2', 'aic-detail-name', 'Key 存储方式'));
    nameBox.appendChild(el('p', 'aic-hint',
        '四种方式任选：不保存 / 会话级 / 明文 / 口令加密。'
        + '客户端加密只能防「翻磁盘」，防不住同源脚本执行。'));
    head.appendChild(nameBox);
    wrap.appendChild(head);

    const card = el('div', 'aic-card');
    const mode = store.getKeyPersistenceMode();
    const OPTIONS = [
        { value: 'memory', label: '仅本次会话（内存）', sub: '最安全，默认。刷新页面后需重新输入。' },
        { value: 'session', label: '记住到本标签页关闭', sub: 'sessionStorage。关闭标签页即消失。' },
        { value: 'plain', label: '明文保存在本机', sub: 'localStorage，不加密。最方便，也最容易被读走。', warn: true },
        { value: 'persistent', label: '长期记住（口令加密）', sub: 'localStorage + PBKDF2 派生密钥。重开浏览器需解锁。' }
    ];
    const group = el('div', 'aic-radio-group');
    group.setAttribute('role', 'radiogroup');
    group.setAttribute('aria-label', 'API Key 存储方式');

    const passWrap = el('div', 'aic-add-row');
    passWrap.style.display = 'none';
    const passInput = el('input', 'aic-input');
    passInput.type = 'password';
    passInput.autocomplete = 'new-password';
    passInput.placeholder = '设置口令（至少 8 位）';

    for (const opt of OPTIONS) {
        const label = el('label', `aic-radio-card${opt.warn ? ' aic-radio-card-warn' : ''}`);
        const radio = el('input', 'aic-radio');
        radio.type = 'radio';
        radio.name = 'aicStorage';
        radio.value = opt.value;
        radio.checked = mode === opt.value;
        radio.addEventListener('change', () => {
            if (opt.value !== 'persistent') {
                store.setKeyPersistenceMode(opt.value);
                toast(`存储方式已切换为「${opt.label}」`, 'ok');
                renderAll();
                return;
            }
            passWrap.style.display = 'flex';
            passInput.focus();
        });
        const body = el('span', 'aic-radio-body');
        body.appendChild(el('span', 'aic-radio-label', opt.label));
        body.appendChild(el('span', 'aic-radio-sub', opt.sub));
        label.append(radio, body);
        group.appendChild(label);
    }
    card.appendChild(group);

    const plainWarn = el('div', 'aic-warn-box');
    plainWarn.style.display = mode === 'plain' ? 'block' : 'none';
    plainWarn.textContent = '⚠ 明文保存意味着：任何能在本页执行脚本的东西（被注入的第三方脚本、'
        + '恶意浏览器扩展、共用这台电脑的下一个人）都能直接读走你的 Key。'
        + '请只在**自己的电脑**上、且愿意用便利换取这层风险时使用。';
    card.appendChild(plainWarn);

    const passApply = btn('aic-btn-solid aic-btn-sm', '启用');
    passApply.addEventListener('click', () => {
        const pass = passInput.value;
        if (pass.length < 8) { toast('口令至少 8 位', 'warn'); passInput.focus(); return; }
        store.setKeyPersistenceMode('persistent', pass);
        passInput.value = '';
        toast('已启用口令加密', 'ok');
        renderAll();
    });
    passWrap.append(passInput, passApply);
    card.appendChild(passWrap);

    if (mode === 'persistent' && store.isKeyPersisted()) {
        const unlockWrap = el('div', 'aic-add-row');
        const unlockInput = el('input', 'aic-input');
        unlockInput.type = 'password';
        unlockInput.autocomplete = 'current-password';
        unlockInput.placeholder = '输入口令解锁已保存的 Key';
        const unlockBtn = btn('aic-btn-solid aic-btn-sm', '解锁');
        unlockBtn.addEventListener('click', async () => {
            const ok = await store.unlockPersistentKeys(unlockInput.value);
            if (ok) { unlockInput.value = ''; toast('已解锁', 'ok'); renderAll(); }
            else toast('口令错误，无法解锁', 'warn');
        });
        unlockWrap.append(unlockInput, unlockBtn);
        card.appendChild(unlockWrap);
        card.appendChild(el('p', 'aic-hint', '口令只用于本地加密，不会上传。遗忘口令将无法恢复已保存的 Key。'));
    }

    const modeLabel = OPTIONS.find((o) => o.value === mode);
    const keyCount = model.keys.length;
    let tail;
    if (mode === 'memory') {
        tail = keyCount > 0
            ? `内存中现有 ${keyCount} 个 Key，刷新页面后需重新输入。`
            : '当前没有已保存的 Key，刷新页面后需重新输入。';
    } else if (mode === 'session') {
        tail = `现有 ${keyCount} 个 Key 在本标签页内保留，关闭标签页即消失。`;
    } else if (mode === 'plain') {
        tail = keyCount > 0
            ? `现有 ${keyCount} 个 Key 以明文保存在本机，刷新与重开浏览器都还在。`
            : '当前没有已保存的 Key；添加后会以明文写入本机。';
    } else {
        tail = keyCount > 0
            ? `现有 ${keyCount} 个 Key 已加密保存，重开浏览器后需用口令解锁。`
            : '磁盘上已有加密的 Key，请输入口令解锁。';
    }
    card.appendChild(el('p', 'aic-hint', `当前：${modeLabel ? modeLabel.label : mode}。${tail}`));
    card.appendChild(field('存储方式说明', 'storage'));

    wrap.appendChild(card);
    return wrap;
}

// ---------------------------------------------------------------------------
// 渲染调度
// ---------------------------------------------------------------------------

function renderDetail(model) {
    if (!_detailEl) return;
    if (!STATE.view) STATE.view = defaultView(model);
    let view;
    switch (STATE.view.type) {
        case 'templates': view = renderTemplatePicker(model); break;
        case 'storage': view = renderStorageView(model); break;
        case 'unattributed': view = renderUnattributedView(model); break;
        case 'diagAll': view = renderDiagAllView(model); break;
        default: view = renderProviderDetail(model, STATE.view.id); break;
    }
    _detailEl.replaceChildren(view);
    // 详情切换后滚回顶部（否则会停在上一页的滚动位置）
    _detailEl.scrollTop = 0;
}

/**
 * 「全部 Key 体检结果」视图。
 * 结果缓存在 STATE 里，而不是渲染完直接往 _detailEl 塞 ——
 * 否则任何一次 renderAll（例如体检结束后的刷新）都会把它冲掉，
 * 且 STATE.view.type='diagAll' 会掉进 default 分支去渲染一个不存在的供应商。
 */
function renderDiagAllView(model) {
    const store = model.store;
    const list = STATE.diagAllResults || [];
    const wrap = el('div', 'aic-view');
    const head = el('div', 'aic-detail-head');
    const nameBox = el('div', 'aic-detail-namebox');
    nameBox.appendChild(el('h2', 'aic-detail-name', '全部 Key 体检结果'));
    nameBox.appendChild(el('p', 'aic-hint', `共 ${list.length} 个 Key。逐项结论如下。`));
    head.appendChild(nameBox);
    wrap.appendChild(head);

    if (list.length === 0) {
        wrap.appendChild(el('p', 'aic-hint', '还没有体检结果。'));
        return wrap;
    }
    const card = el('div', 'aic-card');
    for (const item of list) {
        const block = el('div', 'aic-diag-block');
        const entry = item && item.entry ? item.entry : null;
        renderDiagResult(block, null, item && item.result ? item.result : item,
            entry ? store.maskKey(entry.key) : '');
        card.appendChild(block);
    }
    wrap.appendChild(card);
    return wrap;
}

/** 全量重绘（导航 + 详情 + 页头统计）。数据每次都从 store 重读。 */
async function renderAll() {
    if (!_overlay) return;
    try {
        closePopover();
        const model = await buildModel();
        model.health = await getHealthApi();
        // 视图可能指向一个已被删除的供应商 → 回落到默认视图
        if (STATE.view && STATE.view.type === 'provider'
            && !model.providers.some((p) => p.id === STATE.view.id)) {
            STATE.view = defaultView(model);
        }
        renderNav(model);
        renderDetail(model);
        renderHeaderSummary(model);
        renderFooter(model);
    } catch (err) {
        console.warn('[aiConsole] 渲染失败:', err);
        if (_detailEl) {
            const box = el('div', 'aic-view');
            box.appendChild(el('p', 'aic-hint aic-hint-warn', '加载引擎与 Key 数据失败，请关闭后重试。'));
            _detailEl.replaceChildren(box);
        }
    }
}

/** 页头说明 = 实时统计（ZCode 的说明文字位置） */
function renderHeaderSummary(model) {
    const node = _overlay && _overlay.querySelector('#aicSubtitle');
    if (!node) return;
    const readyCount = [...model.statusOf.values()].filter((s) => s === 'ready').length;
    const configured = model.providers.filter((p) => (model.byProvider.get(p.id) || []).length > 0).length;
    const parts = [
        `${model.keys.length} 个 Key`,
        `${configured} 个已配置供应商`,
        `${readyCount} 个已验证可用`,
        `${model.enabledCount} / ${model.providers.length} 参与自动优选`
    ];
    if (model.unattributed.length > 0) parts.push(`${model.unattributed.length} 个归属待确认`);
    safeText(node, parts.join(' · '));
}

function renderFooter(model) {
    const status = _overlay.querySelector('#aicFooterStatus');
    const hint = _overlay.querySelector('#aicFooterHint');
    if (status) {
        const eff = model.store.getEffectiveKeyEntry();
        const pid = eff ? classifyKey(eff, model.apis).pid : null;
        const p = pid ? model.providers.find((x) => x.id === pid) : null;
        status.textContent = eff
            ? `当前生效：${p ? p.label : '归属未定'} · ${model.store.maskKey(eff.key)}${eff.modelId ? ` · ${eff.modelId}` : ''}`
            : '当前没有生效的 Key';
    }
    if (hint) {
        const modeLabel = { memory: '仅本次会话', session: '标签页', plain: '明文', persistent: '口令加密' };
        hint.textContent = `存储：${modeLabel[model.store.getKeyPersistenceMode()] || '—'}`;
    }
}

// ---------------------------------------------------------------------------
// 探测 / 体检 / 导入
// ---------------------------------------------------------------------------

async function refresh() {
    toast('已重新读取引擎与 Key 状态', 'ok');
    await renderAll();
}

async function runProbeAll() {
    if (STATE.probeRunning) return;
    const store = await getStoreApi();
    const keys = store.getAllKeys();
    if (keys.length === 0) { toast('还没有任何 Key 可检测', 'warn'); return; }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        toast('当前离线，无法检测。请连网后重试', 'warn');
        return;
    }
    STATE.probeRunning = true;
    setBusy(true, `正在检测 ${keys.length} 个 Key…`);
    try {
        const { probeAll } = await getHealthApi();
        await probeAll(keys);
        toast(`检测完成（${keys.length} 个 Key）`, 'ok');
    } catch (err) {
        console.warn('[aiConsole] 探测失败:', err);
        toast('检测过程出错，请查看控制台日志', 'warn');
    } finally {
        STATE.probeRunning = false;
        setBusy(false);
        await renderAll();
    }
}

async function runDiagOne(model, provider, entries) {
    if (STATE.diagRunning) return;
    const store = model.store;
    const list = entries && entries.length > 0
        ? entries
        : (() => { const eff = store.getEffectiveKeyEntry(); return eff ? [eff] : []; })();
    if (list.length === 0) { toast('没有可体检的 Key', 'warn'); return; }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        toast('当前离线，无法体检。请连网后重试', 'warn');
        return;
    }
    // 体检结果落在折叠区里：先展开，否则用户看不到任何反馈
    const fold = _detailEl && _detailEl.querySelector('.aic-fold');
    if (fold) fold.open = true;
    STATE.diagRunning = true;
    setBusy(true, `正在体检 ${list.length} 个 Key…`);
    const sum = _detailEl ? _detailEl.querySelector(`#aicDiagSummary-${provider.id}`) : null;
    const results = _detailEl ? _detailEl.querySelector(`#aicDiagResults-${provider.id}`) : null;
    try {
        const { diagnose } = await getDiagApi();
        for (const entry of list) {
            // diagnose 的入参字段名是 key / providerId / modelId（与 store 的 entry 同名）。
            // 写成 apiKey 会让 checkKey 拿到空值 → 体检恒报「未填写 Key」。
            const result = await diagnose({
                key: entry.key,
                providerId: provider.id,
                modelId: entry.modelId || ''
            });
            renderDiagResult(results, sum, result, store.maskKey(entry.key));
        }
        toast('体检完成', 'ok');
    } catch (err) {
        console.warn('[aiConsole] 体检失败:', err);
        toast('体检过程出错，请查看控制台日志', 'warn');
    } finally {
        STATE.diagRunning = false;
        setBusy(false);
        await renderAll();
    }
}

async function runDiagAll() {
    if (STATE.diagRunning) return;
    const store = await getStoreApi();
    const keys = store.getAllKeys();
    if (keys.length === 0) { toast('还没有任何 Key 可体检', 'warn'); return; }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        toast('当前离线，无法体检。请连网后重试', 'warn');
        return;
    }
    STATE.diagRunning = true;
    setBusy(true, `正在逐个体检 ${keys.length} 个 Key…`);
    try {
        const { diagnoseAll } = await getDiagApi();
        // diagnoseAll 返回 [{ entry, result }]
        STATE.diagAllResults = await diagnoseAll(keys);
        STATE.view = { type: 'diagAll' };
        toast('体检完成', 'ok');
    } catch (err) {
        console.warn('[aiConsole] 批量体检失败:', err);
        toast('体检过程出错，请查看控制台日志', 'warn');
    } finally {
        STATE.diagRunning = false;
        setBusy(false);
        await renderAll();
    }
}

/**
 * 从文件导入 Key。
 * importKeysFromFile() **只解析、不入库** —— 落库是调用方的责任，
 * 顺序必须是「先建自定义供应商 → 再 addKey」，否则这些 Key 会以「未知引擎」入库。
 */
async function runImport(file) {
    if (!file) return;
    setBusy(true, '正在解析文件…');
    try {
        const { importKeysFromFile } = await getImporterApi();
        const store = await getStoreApi();
        const provApi = await getProvApi();
        const result = await importKeysFromFile(file);
        if (!result || !result.ok) {
            toast(`导入失败：${(result && result.error) || '无法解析该文件'}`, 'warn');
            return;
        }
        if (!result.count) {
            toast(`${result.filename} 中未找到 API Key（支持正则提取，或 key,baseUrl,modelId 结构化格式）`, 'warn');
            return;
        }
        let createdProviders = 0;
        let rejected = 0;
        for (const k of result.keys) {
            let providerId = k.providerId || null;
            if (!providerId && k.baseUrl) {
                const before = provApi.getCustomProviders().length;
                const p = provApi.ensureCustomProviderByBaseUrl(k.baseUrl, k.label);
                if (p) {
                    providerId = p.id;
                    if (k.modelId) provApi.addModelToCustomProvider(p.id, k.modelId);
                    if (provApi.getCustomProviders().length > before) createdProviders++;
                }
            }
            const entry = store.addKey({
                key: k.key,
                type: providerId || k.type,
                label: k.label,
                providerId,
                modelId: k.modelId
            });
            if (!entry) rejected++;
        }
        const extra = [];
        if (createdProviders > 0) extra.push(`新建 ${createdProviders} 个自定义供应商`);
        if (rejected > 0) extra.push(`${rejected} 条因超出上限被跳过`);
        toast(`已导入 ${result.count} 个 Key${extra.length ? `（${extra.join('，')}）` : ''}`, 'ok');

        if (typeof navigator === 'undefined' || navigator.onLine !== false) {
            try {
                const health = await getHealthApi();
                await health.probeAll(store.getAllKeys());
                store.setKeyMode('auto');
            } catch (e) {
                console.warn('[aiConsole] 导入后自动探测失败:', e);
            }
        }
    } catch (err) {
        console.warn('[aiConsole] 导入失败:', err);
        toast('导入失败：无法解析该文件', 'warn');
    } finally {
        setBusy(false);
        await renderAll();
    }
}

// ---------------------------------------------------------------------------
// 底栏提示 / 忙碌态
// ---------------------------------------------------------------------------

let _toastTimer = null;
function toast(text, tone) {
    const node = _overlay ? _overlay.querySelector('#aicFooterStatus') : null;
    if (!node) return;
    node.textContent = text;
    node.className = 'aic-footer-status' + (tone ? ` aic-msg-${tone}` : '');
    if (_toastTimer) clearTimeout(_toastTimer);
    _toastTimer = setTimeout(() => { renderFooterRefreshOnly(); }, 4000);
}

function renderFooterRefreshOnly() {
    if (!_overlay) return;
    const node = _overlay.querySelector('#aicFooterStatus');
    if (node) node.className = 'aic-footer-status';
    buildModel()
        .then((m) => { m.health = {}; renderFooter(m); })
        .catch(() => { /* 忽略 */ });
}

function setBusy(busy, text) {
    if (!_overlay) return;
    _overlay.classList.toggle('aic-busy', !!busy);
    const node = _overlay.querySelector('#aicFooterStatus');
    if (busy && node) {
        node.textContent = text || '处理中…';
        node.className = 'aic-footer-status aic-msg-busy';
    }
}

// ---------------------------------------------------------------------------
// 窗口生命周期
// ---------------------------------------------------------------------------

function createPanel() {
    const existing = document.getElementById(AI_CONSOLE_ID);
    if (existing) return existing;
    const overlay = el('div', 'aic-overlay');
    overlay.id = AI_CONSOLE_ID;
    overlay.appendChild(staticNodes(SHELL));
    document.body.appendChild(overlay);

    _overlay = overlay;
    _navEl = overlay.querySelector('#aicNav');
    _detailEl = overlay.querySelector('#aicDetail');

    bindWindowEvents(overlay);
    return overlay;
}

function bindWindowEvents(overlay) {
    const modal = overlay.querySelector('.aic-modal');
    const open = () => {
        overlay.style.display = 'flex';
        void overlay.offsetWidth; // 强制重排以触发过渡
        overlay.classList.add('open');
        renderAll();
    };
    const close = () => {
        closePopover();
        overlay.classList.remove('open');
        setTimeout(() => { overlay.style.display = 'none'; }, 220);
    };
    overlay._open = open;
    overlay._close = close;

    const min = overlay.querySelector('#aicMin');
    const max = overlay.querySelector('#aicMax');
    const closeBtn = overlay.querySelector('#aicClose');
    const done = overlay.querySelector('#aicDone');
    if (min) min.addEventListener('click', () => { if (modal) modal.classList.toggle('minimized'); });
    if (max) max.addEventListener('click', () => { if (modal) modal.classList.toggle('maximized'); });
    if (closeBtn) closeBtn.addEventListener('click', close);
    if (done) done.addEventListener('click', close);

    overlay.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !overlay.classList.contains('aic-busy')) {
            e.stopPropagation();
            close();
        }
    });

    const refreshBtn = overlay.querySelector('#aicRefresh');
    if (refreshBtn) refreshBtn.addEventListener('click', () => { refresh(); });

    const addProvider = overlay.querySelector('#aicAddProvider');
    if (addProvider) {
        addProvider.addEventListener('click', () => {
            STATE.view = { type: 'templates' };
            // 每次都从「模板列表」进入，不继承上次展开的自定义表单
            STATE.showCustomForm = false;
            renderAll();
        });
    }

    // 页头 ⋯ 菜单（全局次要动作）
    const moreBtn = overlay.querySelector('#aicMore');
    const importFile = overlay.querySelector('#aicImportFile');
    if (moreBtn) {
        moreBtn.addEventListener('click', () => {
            const panel = menuPanel([
                { label: '📂 从文件导入 Key', onClick: () => { if (importFile) importFile.click(); } },
                { label: '🔍 检测全部 Key 可用性', onClick: () => runProbeAll() },
                { label: '🩺 逐个体检全部 Key', onClick: () => runDiagAll() },
                { label: '🔐 Key 存储方式', onClick: () => { STATE.view = { type: 'storage' }; renderAll(); } }
            ]);
            openPopover(moreBtn, panel);
        });
    }
    if (importFile) {
        importFile.addEventListener('change', () => {
            const f = importFile.files && importFile.files[0];
            importFile.value = '';
            if (f) runImport(f);
        });
    }

    overlay.addEventListener('mousedown', (e) => {
        if (e.target === overlay && !overlay.classList.contains('aic-busy')) close();
    });
}

/**
 * 打开 AI 控制台（对外唯一入口）。
 * 面板已存在时复用，不重建 —— 重建会丢失滚动位置与展开状态。
 */
export function openAiConsole() {
    const panel = createPanel();
    if (panel && typeof panel._open === 'function') panel._open();
    return panel;
}

/** 供设置中心显示入口徽章：Key 数 / 已配置供应商数 / 供应商总数 */
export async function getAiConsoleSummary() {
    try {
        const model = await buildModel();
        const configured = model.providers.filter((p) => (model.byProvider.get(p.id) || []).length > 0).length;
        return { keys: model.keys.length, configured, providers: model.providers.length };
    } catch {
        return { keys: 0, configured: 0, providers: 0 };
    }
}
