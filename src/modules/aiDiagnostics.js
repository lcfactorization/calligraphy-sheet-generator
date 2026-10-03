// v1.5.3 新增：AI 接入「全面体检」—— 逐项定位失败原因。
//
// 为什么需要独立于 aiKeyHealth：
//   aiKeyHealth 的目标是「自动挑出最优可用 Key」（面向自动优选，返回单个裁定），
//   它把多个环节的失败压缩成一句 message，且失败时只报告"最有信息量的那一条"。
//   用户排查时需要的恰恰相反：**每个环节分别报告，且成功也要报告**。
//   因此这里做的是「诊断」而非「优选」：
//     · 逐项检查（顺序、各自状态、原始证据）
//     · 成功也产出可读结论（不只报失败）
//     · 失败时必须带上「够我改配置」的具体信息（状态码 / 原始响应片段 / 实际请求 URL）
//
// 设计约束（与全仓一致）：
//   · 绝不 throw：所有失败以 { ok:false, steps:[...] } 返回。
//   · 不使用 innerHTML 生成结果 —— 本模块只产出数据结构，DOM 由调用方用 DOM API 渲染。
//   · 不写 ai_zuci_cache_v1；不写健康裁决（那是 probeAll 的职责），避免污染自动优选。
//   · 探测会真实发起网络请求（1 次 chat，max_tokens 很小），因此必须明确告知用户。

import {
    getProvider, detectProviderId, resolveProviderId, providerLabel,
    validateBaseUrl, PROTOCOL_DEFAULT_CHAT_PATH, CHAT_PATH_SUFFIX_RE
} from './aiProviders.js';
// ⚠ 这里**不要**再 import withQueryKey —— 它是 aiKeyHealth 用的（query-key 鉴权的 URL 拼装），
//   本模块的联网实测走 buildAuthHeaders + 协议层自己的 chatPath，用不到它。
//   （曾长期挂着一个未使用的 import，属于死代码，已清理。）
import { joinUrl, isOnline, timedFetch, buildAuthHeaders } from './aiProbeHttp.js';

const DEFAULT_TIMEOUT_MS = 12000;

/** 单步结论的严重级别：ok=绿，warn=黄（能用但有隐患），fail=红（这一步真的错了） */
export const STEP_LEVEL = { OK: 'ok', WARN: 'warn', FAIL: 'fail' };

function now() {
    return Date.now();
}

function snippet(text, max = 300) {
    const s = String(text == null ? '' : text).replace(/\s+/g, ' ').trim();
    return s.length > max ? s.slice(0, max) + '…' : s;
}

/**
 * 构造一次「真实调用形状」的探测请求体。
 * 与 aiZuci.callDeepSeekDirect 保持同样的形状 —— 诊断必须复现真实调用，
 * 而不是构造一个只有诊断才会用到的"简化请求"（那就失去了诊断价值）。
 */
function buildProbeBody(provider, modelId, protocol) {
    const isAnth = protocol === 'anthropic';
    const defaults = isAnth
        ? {
            model: modelId,
            system: '你是汉字组词助手。',
            messages: [{ role: 'user', content: '1' }],
            max_tokens: 8
        }
        : {
            model: modelId,
            messages: [
                { role: 'system', content: '你是汉字组词助手。' },
                { role: 'user', content: '1' }
            ],
            max_tokens: 8,
            temperature: 0.1
        };
    const body = { ...defaults };
    if (provider) {
        // ⚠ 注册表 / _normalizeCustomProvider 用的是 camelCase `maxTokens`，
        //   请求体要写 snake_case `max_tokens`。此前的判断读 `provider.maxTokens`、
        //   赋值却读 `provider.max_tokens` —— 后者恒为 undefined，于是用户配的
        //   max_tokens 在体检时被静默丢弃，探测请求与真实调用形状不一致，
        //   「体检通过、实跑失败」便会由此产生。取一次值，两处共用。
        const maxTokens = provider.maxTokens;
        if (maxTokens !== undefined) body.max_tokens = maxTokens;
        if (provider.temperature !== undefined && !isAnth) body.temperature = provider.temperature;
        if (provider.topP !== undefined) body.top_p = provider.topP;
        if (provider.extraParams && typeof provider.extraParams === 'object') {
            for (const [k, v] of Object.entries(provider.extraParams)) body[k] = v;
        }
    }
    return body;
}

// 鉴权头统一走 aiProbeHttp.buildAuthHeaders（v1.5.4）。
// 这里把 protocol 覆盖进去：诊断的 protocol 可能来自用户的显式选择，
// 而 provider 对象未必已带上该字段，直接传 provider 会漏掉 anthropic 分支。
function buildHeaders(provider, key, protocol) {
    return buildAuthHeaders({ ...(provider || {}), protocol }, key);
}

// ---------------------------------------------------------------------------
// 单项检查
// ---------------------------------------------------------------------------

/** ① Key 形状 / 归属判定（不联网） */
function checkKey(input) {
    const key = String(input.key || '').trim();
    const step = {
        id: 'key', title: 'API Key', level: STEP_LEVEL.OK, detail: '', hints: []
    };
    if (!key) {
        step.level = STEP_LEVEL.FAIL;
        step.detail = '未填写 API Key';
        step.hints.push('请粘贴完整 Key（注意不要漏掉结尾字符、不要带引号或空格）。');
        return step;
    }
    if (/\s/.test(key)) {
        step.level = STEP_LEVEL.FAIL;
        step.detail = `Key 中含有空白字符（长度 ${key.length}），几乎可以确定是复制时带入了换行/空格`;
        step.hints.push('请重新复制，确保 Key 是一段连续的字符。');
        return step;
    }
    if (key.length < 8) {
        step.level = STEP_LEVEL.FAIL;
        step.detail = `Key 长度仅 ${key.length}，明显不完整`;
        return step;
    }

    const shapeId = detectProviderId(key);
    const resolved = resolveProviderId(key, input.providerId || null);
    step.detail = `已填写（长度 ${key.length}）`;

    if (input.providerId) {
        step.detail += `；引擎由你指定为「${providerLabel(input.providerId)}」`;
        step.level = STEP_LEVEL.OK;
    } else if (shapeId) {
        step.detail += `；由 Key 形状唯一识别为「${providerLabel(shapeId)}」`;
    } else {
        // 形状不唯一 —— 这是最重要的诊断信息之一
        const legacy = key.startsWith('sk-') ? 'deepseek'
            : key.startsWith('ark-') ? 'volcano' : null;
        if (legacy) {
            step.level = STEP_LEVEL.WARN;
            step.detail += `；形状无法唯一识别，将按旧前缀语义回落到「${providerLabel(legacy)}」`;
            step.hints.push(
                `⚠ 这是「好用的 Key 在这里不可用」最常见的原因：`
                + `${key.slice(0, 3)}… 这个前缀被多家引擎共用（DeepSeek / Moonshot / 硅基流动 / 阿里百炼 / Agnes）。`
                + `如果这把 Key 其实属于别家，请求会被发到 ${providerLabel(legacy)} 并返回 401。`
            );
            step.hints.push('请在下方的「引擎与模型」里手动指定你的真实引擎，然后重新体检。');
        } else {
            step.level = STEP_LEVEL.WARN;
            step.detail += '；形状完全无法识别，且无旧前缀可回落';
            step.hints.push('该 Key 没有稳定前缀，必须手动指定引擎（如 AMD Radeon / 阶跃 / 混元 / 商汤等）。');
        }
    }
    step.resolvedProviderId = resolved || null;
    return step;
}

/** ② Base URL（不联网） */
function checkBaseUrl(input) {
    const step = { id: 'baseUrl', title: 'Base URL / 端点地址', level: STEP_LEVEL.OK, detail: '', hints: [] };
    const explicitlyGiven = !!String(input.baseUrl || '').trim();

    // 用户显式给了地址 → 以它为准（这是"完整配置"路径）
    if (explicitlyGiven) {
        const r = validateBaseUrl(input.baseUrl);
        if (!r.ok) {
            step.level = STEP_LEVEL.FAIL;
            step.detail = `地址不合法：${r.error}`;
            // v1.5.4：chat 路径后缀现在由 validateBaseUrl 直接拒绝（创建入口同样拦），
            //   这里必须把「会拼成什么」讲清楚 —— 只报一句「地址不合法」，
            //   用户看到的是一个语法完全正确的 URL，只会更困惑。
            //   用未归一化的原值判断，因为拒绝时 normalized 是空串。
            if (CHAT_PATH_SUFFIX_RE.test(String(input.baseUrl || '').trim().replace(/\/+$/, ''))) {
                step.hints.push(
                    'Base URL 里已经包含了 chat 路径。本应用的 Base URL 应当**只到版本号**'
                    + '（如 https://api.example.com/v1），chat 路径会由协议自动补上；'
                    + '否则会拼成 /v1/chat/completions/chat/completions 而 404。'
                );
            } else {
                step.hints.push('需要形如 https://api.example.com/v1 的完整地址（必须带 http:// 或 https://）。');
            }
            return step;
        }
        step.detail = r.normalized;
        step.baseUrl = r.normalized;
        if (/^http:\/\//i.test(step.detail)) {
            step.level = STEP_LEVEL.WARN;
            step.hints.push('使用明文 http:// —— 部分引擎会拒绝，且 Key 会以明文传输。建议改为 https://。');
        }
        // 常见陷阱：把 /chat/completions 也写进了 Base URL。
        // v1.5.4：改用 aiProviders 导出的共用正则 —— 创建入口用的就是它，
        //   两处保持一致才不会出现「创建时说合法、体检时说非法」。
        //   上面 validateBaseUrl 已拒绝新输入，所以走到这里的多为**历史遗留**
        //   的自定义引擎（建于校验加强之前），这条检查正好用来救它们。
        if (CHAT_PATH_SUFFIX_RE.test(step.detail)) {
            step.level = STEP_LEVEL.FAIL;
            step.hints.push(
                'Base URL 里已经包含了 chat 路径。本应用的 Base URL 应当**只到版本号**'
                + '（如 https://api.example.com/v1），chat 路径会由协议自动补上；'
                + '否则会拼成 /v1/chat/completions/chat/completions 而 404。'
            );
        }
        return step;
    }

    // 未给地址 → 用引擎注册表里的地址
    const p = input.providerId ? getProvider(input.providerId) : null;
    if (!p) {
        step.level = STEP_LEVEL.FAIL;
        step.detail = '未提供 Base URL，且没有可用的内置引擎地址（引擎未识别）';
        step.hints.push('请在上方「引擎与模型」里选择引擎，或直接在「添加模型」里填写 Base URL。');
        return step;
    }
    step.detail = `${p.baseUrl}（来自内置引擎「${p.label}」）`;
    step.baseUrl = p.baseUrl;
    if (p.cors === 'unverified') {
        step.level = STEP_LEVEL.WARN;
        step.hints.push(
            `「${p.label}」尚未实测过浏览器直连（CORS 状态 unknown）。`
            + '即使 Key 完全正确，浏览器也可能因为它没返回跨域许可头而报 Failed to fetch。'
        );
    } else if (p.cors === 'failed') {
        step.level = STEP_LEVEL.FAIL;
        step.detail += ' —— 该引擎已知无法从浏览器直连';
        step.hints.push(`「${p.label}」实测浏览器直连失败（CORS 被拒），Key 正确也无法使用。`);
    }
    return step;
}

/** ③ 模型 ID（不联网） */
function checkModelId(input) {
    const step = { id: 'model', title: 'Model ID', level: STEP_LEVEL.OK, detail: '', hints: [] };
    const p = input.providerId ? getProvider(input.providerId) : null;
    const given = String(input.modelId || '').trim();

    if (given) {
        step.detail = given;
        step.modelId = given;
        const ms = (p && Array.isArray(p.models)) ? p.models : [];
        if (ms.length > 0 && !ms.some((m) => m.id === given)) {
            step.level = STEP_LEVEL.WARN;
            step.hints.push(
                `「${given}」不在内置引擎「${p.label}」的已知模型列表中（列表：`
                + ms.map((m) => m.id).join(' / ')
                + '）。这不代表一定错（引擎可能已新增模型），但如果调用返回 404，请优先换成列表里的模型。'
            );
        }
        return step;
    }

    if (!p) {
        step.level = STEP_LEVEL.WARN;
        step.detail = '未填写 Model ID，且无法从引擎推断';
        step.hints.push('请在「添加模型」里填写模型 ID，或在「引擎与模型」里选择引擎以使用其默认模型。');
        return step;
    }
    const ms = Array.isArray(p.models) ? p.models : [];
    const def = ms.find((m) => !m.fullCheck) || ms[0] || null;
    if (!def) {
        step.level = STEP_LEVEL.FAIL;
        step.detail = `未填写 Model ID，且内置引擎「${p.label}」没有默认模型`;
        step.hints.push('必须显式提供模型 ID。');
        return step;
    }
    step.level = STEP_LEVEL.WARN;
    step.detail = `未填写，将使用引擎默认模型「${def.id}」`;
    step.modelId = def.id;
    step.hints.push('如果该默认模型在你的账户下未开通，会返回 403/404 —— 显式填一个你确认可用的模型更稳妥。');
    return step;
}

/** ④ 协议（不联网） */
function checkProtocol(input) {
    const step = { id: 'protocol', title: '接口协议', level: STEP_LEVEL.OK, detail: '', hints: [] };
    const p = input.providerId ? getProvider(input.providerId) : null;
    const explicit = input.protocol;
    const protocol = explicit || (p && p.protocol) || 'openai';
    step.protocol = protocol;
    step.detail = protocol === 'anthropic'
        ? 'Anthropic 原生 Messages API（/v1/messages，x-api-key 鉴权）'
        : 'OpenAI 兼容（/chat/completions，Bearer 鉴权）';

    // 交叉验证：形状/地址暗示的协议与所选协议是否一致
    const key = String(input.key || '').trim();
    const hinted = key.startsWith('sk-ant-') ? 'anthropic'
        : (key.startsWith('sk-') || key.startsWith('ark-') || key.startsWith('gsk_')) ? 'openai'
            : null;
    if (hinted && hinted !== protocol) {
        step.level = STEP_LEVEL.FAIL;
        step.hints.push(
            `Key 的形状像是 **${hinted === 'anthropic' ? 'Anthropic' : 'OpenAI 兼容'}** 协议的，`
            + `但当前选的是 **${protocol === 'anthropic' ? 'Anthropic' : 'OpenAI 兼容'}**。`
            + '协议选错会直接返回 400/401，且报错信息通常很含糊。请确认。'
        );
    }
    return step;
}

/** ⑤ 网络可达性 + Key 真实性（真实联网：先 /models 快路径，再真实 chat） */
async function checkLive(input, steps, timeoutMs, signal) {
    const step = {
        id: 'live', title: '联网实测（真实发起一次调用）', level: STEP_LEVEL.FAIL,
        detail: '', hints: [], evidence: []
    };
    // steps 是数组，必须按 id 取；直接点属性会拿到 undefined（踩过）
    const pick = (id) => steps.find((s) => s.id === id) || {};
    const key = String(input.key || '').trim();
    const protocol = pick('protocol').protocol || 'openai';
    const modelId = pick('model').modelId || '';
    const provider = input.providerId ? getProvider(input.providerId) : null;

    let baseUrl = pick('baseUrl').baseUrl || '';
    if (!baseUrl) {
        step.detail = '前置检查未通过，无法实测';
        return step;
    }
    baseUrl = baseUrl.replace(/\/+$/, '');

    const chatPath = (provider && provider.chatPath) || PROTOCOL_DEFAULT_CHAT_PATH[protocol] || '/chat/completions';
    const endpoint = joinUrl(baseUrl, chatPath);
    step.endpoint = endpoint;
    step.evidence.push(`实际请求地址：${endpoint}`);

    if (!isOnline()) {
        step.level = STEP_LEVEL.FAIL;
        step.detail = '浏览器报告当前离线，无法实测';
        step.hints.push('请检查网络连接后重试。');
        return step;
    }

    const headers = buildHeaders(provider, key, protocol);
    // 证据里只展示鉴权头**存在与否**，绝不回显 Key 本身
    step.evidence.push(
        protocol === 'anthropic'
            ? '鉴权头：x-api-key（已设置）+ anthropic-version: 2023-06-01'
            : `鉴权头：Authorization: Bearer（已设置）`
    );

    const body = buildProbeBody(provider, modelId, protocol);
    const started = now();
    let resp;
    try {
        resp = await timedFetch(endpoint, {
            method: 'POST',
            headers,
            body: JSON.stringify(body)
        }, timeoutMs, signal);
    } catch (err) {
        const ms = now() - started;
        const aborted = !!(err && err.name === 'AbortError');
        step.level = STEP_LEVEL.FAIL;
        step.code = 0;
        step.detail = aborted
            ? `请求超时（${ms}ms > ${timeoutMs}ms），未收到响应`
            : `请求未能发出：${snippet(err && err.message ? err.message : String(err), 200)}`;
        if (!aborted) {
            step.hints.push(
                '浏览器在这一步能给出的信息很有限（出于安全，JS 读不到跨域的失败细节）。'
                + '最常见的两种原因是：① 该引擎不允许浏览器跨域调用（缺少 CORS 响应头）；'
                + '② 地址写错导致 DNS/连接失败。'
            );
            step.hints.push(
                '排查建议：先在浏览器地址栏直接打开上面的「实际请求地址」——'
                + '若返回 404/405 说明地址能连通（问题在 CORS）；'
                + '若完全打不开说明地址本身不对。'
            );
            step.hints.push('若确认是 CORS：把该地址填进「自定义引擎」也不行 —— 浏览器侧无解，需换支持 CORS 的引擎或自建中转。');
        } else {
            step.hints.push('超时通常意味着地址可达但响应极慢，或该地址被网络中间层丢弃。可稍后重试或换引擎。');
        }
        return step;
    }

    const latencyMs = now() - started;
    step.code = resp.status;
    step.latencyMs = latencyMs;

    // 读一次 body 文本：既用于错误分类的证据，也用于成功路径的 JSON 解析。
    // 必须只读一次 —— Response 的 body 是流，读过就没了。
    let rawText;
    try { rawText = await resp.text(); } catch { rawText = ''; }
    step.evidence.push(`HTTP ${resp.status} · ${latencyMs}ms`);
    if (rawText) step.evidence.push('响应片段：' + snippet(rawText, 400));

    if (resp.status === 401) {
        step.level = STEP_LEVEL.FAIL;
        step.detail = `Key 被拒绝（HTTP 401）—— 服务端认为这把 Key 无效或不属于该账户`;
        step.hints.push(
            '这是「Key 在别的 agent 里好用、在这里不好用」的头号原因：'
            + '**Key 本身没问题，是请求被发到了错误的引擎地址**。'
        );
        step.hints.push(
            `请核对：你期望的引擎是「${input.providerId ? providerLabel(input.providerId) : '未指定'}」，`
            + `而实际请求打到了 ${endpoint}。若两者不一致，请在上方「引擎与模型」里改正引擎。`
        );
        return step;
    }
    if (resp.status === 402) {
        step.level = STEP_LEVEL.FAIL;
        step.detail = '账户额度不足（HTTP 402）';
        step.hints.push('Key 有效但余额/额度为 0，请充值或换一把 Key。');
        return step;
    }
    if (resp.status === 403) {
        step.level = STEP_LEVEL.FAIL;
        step.detail = '无权限或额度耗尽（HTTP 403）';
        step.hints.push(
            'Key 有效但无权调用该模型，或该模型未开通、账户被限。'
            + '常见于：模型 ID 写错成同名的其它厂商模型、免费额度已用尽。'
        );
        return step;
    }
    if (resp.status === 404) {
        step.level = STEP_LEVEL.FAIL;
        step.detail = `地址或模型不存在（HTTP 404）`;
        step.hints.push(
            `两种可能：① Base URL 写错（当前 ${baseUrl}，补上的路径是 ${chatPath}）；`
            + `② 模型 ID「${modelId}」在该引擎下不存在或未开通。`
        );
        return step;
    }
    if (resp.status === 429) {
        step.level = STEP_LEVEL.WARN;
        step.detail = '触发限流（HTTP 429）—— Key 是有效的，只是此刻请求太频繁';
        step.hints.push('等待 30 秒后重试。这**不是** Key 或配置错误。');
        return step;
    }
    if (resp.status === 400 || resp.status === 422) {
        step.level = STEP_LEVEL.FAIL;
        step.detail = `请求被服务端拒绝（HTTP ${resp.status}）—— 请求格式不被接受`;
        step.hints.push(
            '最常见的原因：① 协议选错（OpenAI 兼容 vs Anthropic 原生）；'
            + '② 在「高级参数」里设了该模型不支持的字段；'
            + '③ 模型 ID 与协议不匹配。'
        );
        return step;
    }
    if (!resp.ok) {
        step.level = STEP_LEVEL.FAIL;
        step.detail = `服务端返回 HTTP ${resp.status}`;
        step.hints.push('请把上面的「响应片段」对照该引擎的官方文档排查。');
        return step;
    }

    // ── HTTP 200：还要验证响应**形状**正确，否则可能是被代理/错误地址返回了 HTML ──
    let data;
    try { data = JSON.parse(rawText); } catch { data = null; }

    const looksHtml = /^\s*</.test(rawText);
    if (looksHtml) {
        step.level = STEP_LEVEL.FAIL;
        step.detail = '端点返回了 HTML 而不是 API 响应 —— 地址很可能指向了网站首页而不是 API';
        step.hints.push(
            `请检查 Base URL 是否漏了路径（很多引擎需要 /v1 结尾）。当前拼出的地址是 ${endpoint}。`
        );
        return step;
    }
    if (!data || typeof data !== 'object') {
        step.level = STEP_LEVEL.FAIL;
        step.detail = '响应不是合法 JSON';
        step.hints.push('请查看上面的「响应片段」。');
        return step;
    }

    if (protocol === 'anthropic') {
        const okShape = Array.isArray(data.content) && data.content.length > 0;
        if (!okShape) {
            step.level = STEP_LEVEL.FAIL;
            step.detail = '响应不是 Anthropic Messages 格式（应为 {content:[{type:"text",...}]}）';
            step.hints.push('这通常意味着：协议应选「OpenAI 兼容」而不是 Anthropic，或 Base URL 指向了错误的端点。');
            return step;
        }
    } else {
        const okShape = Array.isArray(data.choices) && data.choices.length > 0
            && data.choices[0] && data.choices[0].message;
        if (!okShape) {
            step.level = STEP_LEVEL.FAIL;
            step.detail = '响应不是 OpenAI 兼容的 chat completion（缺少 choices[0].message）';
            step.hints.push(
                '这通常意味着：协议应选「Anthropic 原生」而不是 OpenAI 兼容，'
                + '或该地址其实不是标准的 /chat/completions 端点（例如是自建中转的自定义格式）。'
            );
            return step;
        }
    }

    step.level = STEP_LEVEL.OK;
    step.detail = `调用成功（HTTP 200 · ${latencyMs}ms，模型 ${modelId || '默认'}）`;
    step.evidence.push('响应形状校验通过 ✓');
    return step;
}

// ---------------------------------------------------------------------------
// 对外入口
// ---------------------------------------------------------------------------

/**
 * 对一组 AI 接入配置做全面体检。
 *
 * @param {{key:string, baseUrl?:string, modelId?:string, providerId?:string|null,
 *          protocol?:string|null, label?:string}} input
 * @param {{signal?:AbortSignal, timeoutMs?:number, skipLive?:boolean}} [opts]
 * @returns {Promise<{ok:boolean, level:string, headline:string, steps:Array,
 *                    fixed:object, elapsed:number}>}
 *   · ok      —— 是否可以进行真实调用（所有 fail 级别均已排除）
 *   · level   —— 总体级别 'ok' | 'warn' | 'fail'
 *   · steps   —— 逐项结论，每项含 {id,title,level,detail,hints,evidence,code,endpoint}
 *   · fixed   —— 应当写回 store 的修正值（仅含**被验证为有效**的字段）
 */
export async function diagnose(input, opts = {}) {
    const started = now();
    const timeoutMs = (typeof opts.timeoutMs === 'number' && opts.timeoutMs > 0)
        ? opts.timeoutMs : DEFAULT_TIMEOUT_MS;

    const steps = [
        checkKey(input),
        checkBaseUrl(input),
        checkModelId(input),
        checkProtocol(input)
    ];

    // 联网步骤：仅当不联网也不会白费时才跑 ——
    //   若 Key 为空或地址非法，实测必然失败，跑它只会给用户一条更混乱的错误。
    const preFailed = steps.some((s) => s.level === STEP_LEVEL.FAIL);
    if (opts.skipLive) {
        steps.push({
            id: 'live', title: '联网实测（真实发起一次调用）',
            level: STEP_LEVEL.WARN, detail: '已跳过（未启用联网实测）', hints: [], evidence: []
        });
    } else if (preFailed) {
        steps.push({
            id: 'live', title: '联网实测（真实发起一次调用）',
            level: STEP_LEVEL.WARN,
            detail: '已跳过 —— 上面有必须优先修正的问题',
            hints: ['请先按红色项修正配置，再重新体检。'], evidence: []
        });
    } else {
        steps.push(await checkLive(input, steps, timeoutMs, opts.signal));
    }

    const hasFail = steps.some((s) => s.level === STEP_LEVEL.FAIL);
    const hasWarn = steps.some((s) => s.level === STEP_LEVEL.WARN);
    const level = hasFail ? STEP_LEVEL.FAIL : (hasWarn ? STEP_LEVEL.WARN : STEP_LEVEL.OK);
    const live = steps.find((s) => s.id === 'live');
    const baseUrlStep = steps.find((s) => s.id === 'baseUrl') || {};
    const modelStep = steps.find((s) => s.id === 'model') || {};

    let headline;
    if (live && live.level === STEP_LEVEL.OK) {
        headline = `✓ 配置可用：${baseUrlStep.detail || ''} · ${modelStep.modelId || '默认模型'} 实测调用成功`;
    } else if (hasFail) {
        const firstFail = steps.find((s) => s.level === STEP_LEVEL.FAIL);
        headline = `✗ 不可用：${firstFail.title} —— ${firstFail.detail}`;
    } else if (hasWarn) {
        const firstWarn = steps.find((s) => s.level === STEP_LEVEL.WARN);
        headline = `⚠ 能用但需注意：${firstWarn.title} —— ${firstWarn.detail}`;
    } else {
        headline = '✓ 全部检查通过';
    }

    // 只有当实测成功时，才认为「引擎归属」已被证实可以写回 ——
    //   失败时绝不写回，否则会把错误的路由固化下来（比不写更糟）。
    const keyStep = steps.find((s) => s.id === 'key') || {};
    const fixed = {};
    if (live && live.level === STEP_LEVEL.OK) {
        if (input.providerId) fixed.providerId = input.providerId;
        else if (keyStep.resolvedProviderId) fixed.providerId = keyStep.resolvedProviderId;
        if (modelStep.modelId) fixed.modelId = modelStep.modelId;
    }

    return {
        ok: !hasFail,
        level,
        headline,
        steps,
        fixed,
        elapsed: now() - started
    };
}

/**
 * 体检若干条已存 Key（供「检测全部」使用）。
 * 串行执行，避免把用户的配额打满。
 * @param {Array} entries
 * @param {{onProgress?:(p:object)=>void, signal?:AbortSignal, timeoutMs?:number}} [opts]
 */
export async function diagnoseAll(entries, opts = {}) {
    const list = Array.isArray(entries) ? entries.filter((e) => e && e.key) : [];
    const out = [];
    const total = list.length;
    for (let i = 0; i < list.length; i++) {
        const e = list[i];
        if (opts.signal && opts.signal.aborted) break;
        if (typeof opts.onProgress === 'function') {
            try { opts.onProgress({ index: i, done: i, total, label: e.label || '(未命名)' }); } catch { /* 忽略 */ }
        }
        const result = await diagnose({
            key: e.key,
            modelId: e.modelId || '',
            providerId: e.providerId || null
        }, { signal: opts.signal, timeoutMs: opts.timeoutMs });
        out.push({ entry: e, result });
        if (typeof opts.onProgress === 'function') {
            try { opts.onProgress({ index: i, done: i + 1, total, label: e.label || '(未命名)', level: result.level }); } catch { /* 忽略 */ }
        }
    }
    return out;
}
