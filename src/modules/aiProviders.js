// v3.0.4 新增：AI 引擎注册表（单一事实来源）
// 契约：docs/v304_升级方案与接口契约.md §3.2
//
// 设计要点
//  - PROVIDERS 是引擎配置的唯一事实来源，消灭 aiKeyStore / aiZuci 中重复的前缀识别。
//  - detectProviderId 对“形状有歧义”的 Key 返回 null（不猜）：
//      · 'sk-' 同时可能属于 DeepSeek / Moonshot / SiliconFlow / DashScope → null
//      · 'sk-or-v1-' 是 OpenRouter 专属 → 'openrouter'
//    用户可运行「检测全部 Key 可用性」来消歧。
//  - keyShape.pattern 与 keyShape.test 刻意分离：
//      · test   用于“形状判定”，对歧义形状返回 false（多个 provider 同时命中 → null）；
//      · pattern 用于“文件导入的文本提取”，尽量把 sk- 家族一把捞出（可重叠，导入侧按 source 去重）。
//  - 模型 ID 多数无法离线核实（本环境无网络）。凡未核实的模型一律 jsonMode:null，
//    由运行时探测（aiKeyHealth）验证真实可用性；注册表设计为可直接编辑。
//  - 向后兼容：detectApiKeyType 保持旧语义（sk-→deepseek / ark-→volcano / 其它→unknown）。

// ---------------------------------------------------------------------------
// 注册表
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} ProviderModel
 * @property {string} id            模型 ID（发送给 API 的原值）
 * @property {'free'|'cheap'|'paid'} tier
 * @property {boolean|null} jsonMode 是否支持 response_format json_object；null=未验证
 * @property {boolean} [fullCheck]  是否用于“全量检查/多音字深度校验”的强模型
 * @property {boolean} [slow]       v3.0.4 追加：**实测**在真实组词负载下明显慢（推理型模型）。
 *                                  标记后 aiKeyHealth.scoreEntry 不再按探测延迟给速度分，
 *                                  因为探测只有 3 token，对推理模型毫无代表性。
 *                                  只对**实测过**的模型设置，不得凭猜测标注。
 *
 * @typedef {Object} Provider
 * @property {string} id
 * @property {string} label
 * @property {string} baseUrl
 * @property {string} chatPath
 * @property {string|null} modelsPath
 * @property {ProviderModel[]} models
 * @property {'bearer'|'query-key'} authStyle
 * @property {{ test:(k:string)=>boolean, hint:string, pattern?:string }} keyShape
 * @property {boolean} modelsEndpointValidatesAuth
 * @property {'verified'|'unverified'|'failed'} cors
 * @property {number} priority
 * @property {string} signupUrl
 * @property {string} note
 */

// 不变量：modelsEndpointValidatesAuth 只有在 modelsPath != null 时才有意义。
// 没有可访问的 /models 端点时该标志恒为 false（否则会误导：既声明"端点能校验鉴权"
// 又声明"没有该端点"）。新引擎请遵守此约束。
//
// 通用 sk- 形状：DeepSeek / Moonshot / SiliconFlow / DashScope / Agnes 共用前缀。
// test 用负向先行断言把「有专属前缀的 sk- 家族」排除，让它们的专属形状可被唯一识别：
//   · sk-or-v1-  → OpenRouter
//   · sk-apx     → APINEX
// 注意：负向断言只影响 test（形状判定），不影响 pattern（文件导入的文本提取）——
//       导入侧仍用宽松的 SK_GENERIC_PATTERN 把整族 sk- 一把捞出，再按 detectProviderId 归属。
const SK_GENERIC_TEST = /^sk-(?!or-v1-|apx)[A-Za-z0-9_-]{16,}$/;
const SK_GENERIC_PATTERN = 'sk-[A-Za-z0-9_-]{16,}';
const SK_HINT = 'sk- 开头（该前缀被多个引擎共用，形状无法唯一判定，建议运行检测）';

/** @type {Provider[]} */
export const PROVIDERS = [
    {
        id: 'deepseek',
        label: 'DeepSeek',
        baseUrl: 'https://api.deepseek.com',
        chatPath: '/chat/completions',
        modelsPath: '/models',
        models: [
            // 该模型 ID 沿用自 v3.0.0 并在线上验证过（原 aiZuci.js 注释：2026-07-31 正式版公测）
            { id: 'deepseek-v4-flash', tier: 'cheap', jsonMode: true }
        ],
        authStyle: 'bearer',
        keyShape: { test: (k) => SK_GENERIC_TEST.test(k), hint: SK_HINT, pattern: SK_GENERIC_PATTERN },
        modelsEndpointValidatesAuth: true,
        cors: 'verified',
        priority: 90,
        signupUrl: 'https://platform.deepseek.com/api_keys',
        note: '付费但便宜；Key 为 sk- 开头'
    },
    {
        id: 'volcano',
        label: '火山引擎豆包',
        baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
        chatPath: '/chat/completions',
        modelsPath: null, // 实测 /models 无 ACAO
        models: [
            // 两个模型 ID 未离线核实；若账户无权限会报 403/404，可用 ai_model_override_volcano 换模型
            { id: 'doubao-seed-2-0-lite-260428', tier: 'cheap', jsonMode: true },
            { id: 'doubao-seed-2-1-turbo-260628', tier: 'paid', jsonMode: true, fullCheck: true }
        ],
        authStyle: 'bearer',
        keyShape: {
            test: (k) => /^ark-[A-Za-z0-9_-]{16,}$/.test(k),
            hint: 'ark- 开头（火山方舟 ARK Key）',
            pattern: 'ark-[A-Za-z0-9_-]{16,}'
        },
        modelsEndpointValidatesAuth: false, // 不变量：modelsPath=null ⇒ 无法用 /models 验鉴权
        cors: 'verified',
        priority: 85,
        signupUrl: 'https://console.volcengine.com/ark',
        note: '有免费额度；全量检查会自动使用 turbo 强模型'
    },
    {
        id: 'zhipu',
        label: '智谱 GLM',
        baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
        chatPath: '/chat/completions',
        modelsPath: '/models',
        models: [
            // 未核实；glm-4-flash 为智谱长期免费模型
            { id: 'glm-4-flash', tier: 'free', jsonMode: null }
        ],
        authStyle: 'bearer',
        keyShape: {
            test: (k) => /^[0-9a-f]{32}\.[A-Za-z0-9_-]{10,}$/i.test(k),
            hint: '形如 <32位十六进制>.<密钥段>',
            pattern: '[0-9a-f]{32}\\.[A-Za-z0-9_-]{10,}'
        },
        modelsEndpointValidatesAuth: true,
        cors: 'verified',
        priority: 80,
        signupUrl: 'https://open.bigmodel.cn/usercenter/apikeys',
        note: 'GLM-4-Flash 免费'
    },
    {
        id: 'moonshot',
        label: '月之暗面 Kimi',
        baseUrl: 'https://api.moonshot.cn/v1',
        chatPath: '/chat/completions',
        modelsPath: '/models',
        models: [
            // 未核实
            { id: 'moonshot-v1-8k', tier: 'cheap', jsonMode: null }
        ],
        authStyle: 'bearer',
        keyShape: { test: (k) => SK_GENERIC_TEST.test(k), hint: SK_HINT, pattern: SK_GENERIC_PATTERN },
        modelsEndpointValidatesAuth: true,
        cors: 'verified',
        priority: 70,
        signupUrl: 'https://platform.moonshot.cn/console/api-keys',
        note: 'Key 为 sk- 开头（与 DeepSeek 同前缀）'
    },
    {
        id: 'siliconflow',
        label: '硅基流动',
        baseUrl: 'https://api.siliconflow.cn/v1',
        chatPath: '/chat/completions',
        modelsPath: '/models',
        models: [
            // 未核实；SiliconFlow 长期提供部分免费小模型
            { id: 'Qwen/Qwen2.5-7B-Instruct', tier: 'free', jsonMode: null }
        ],
        authStyle: 'bearer',
        keyShape: { test: (k) => SK_GENERIC_TEST.test(k), hint: SK_HINT, pattern: SK_GENERIC_PATTERN },
        modelsEndpointValidatesAuth: true,
        cors: 'verified',
        priority: 78,
        signupUrl: 'https://cloud.siliconflow.cn/account/ak',
        note: '有免费模型；Key 为 sk- 开头'
    },
    {
        id: 'dashscope',
        label: '阿里云百炼（兼容模式）',
        baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
        chatPath: '/chat/completions',
        modelsPath: '/models',
        models: [
            // 未核实；契约要求 tier 记 cheap（免费为新用户 token 额度）
            { id: 'qwen-turbo', tier: 'cheap', jsonMode: null }
        ],
        authStyle: 'bearer',
        keyShape: { test: (k) => SK_GENERIC_TEST.test(k), hint: SK_HINT, pattern: SK_GENERIC_PATTERN },
        modelsEndpointValidatesAuth: true,
        cors: 'verified',
        priority: 60,
        signupUrl: 'https://bailian.console.aliyun.com/',
        note: '新用户 token 额度（trial）；Key 为 sk- 开头'
    },
    {
        id: 'openrouter',
        label: 'OpenRouter',
        baseUrl: 'https://openrouter.ai/api/v1',
        chatPath: '/chat/completions',
        modelsPath: '/models',
        models: [
            // 未核实；OpenRouter 有 :free 变体
            { id: 'meta-llama/llama-3.3-70b-instruct:free', tier: 'free', jsonMode: null }
        ],
        authStyle: 'bearer',
        keyShape: {
            test: (k) => /^sk-or-v1-[A-Za-z0-9_-]{16,}$/.test(k),
            hint: 'sk-or-v1- 开头（OpenRouter 专属）',
            pattern: SK_GENERIC_PATTERN
        },
        // /models 为公开端点，不带 Key 也能访问 → 无法据此校验鉴权
        modelsEndpointValidatesAuth: false,
        cors: 'verified',
        priority: 55,
        signupUrl: 'https://openrouter.ai/keys',
        note: '有 :free 免费模型；/models 公开，不能用于验 Key'
    },
    {
        id: 'minimax',
        label: 'MiniMax',
        baseUrl: 'https://api.minimax.chat/v1',
        chatPath: '/chat/completions',
        modelsPath: null,
        models: [
            // 未核实
            { id: 'MiniMax-Text-01', tier: 'cheap', jsonMode: null }
        ],
        authStyle: 'bearer',
        keyShape: {
            // MiniMax Key 形如 JWT（eyJ...）；未核实但形状足够特异
            test: (k) => /^eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}$/.test(k),
            hint: 'JWT 形式（eyJ 开头）；未核实，建议用检测确认',
            pattern: 'eyJ[A-Za-z0-9_-]{10,}\\.[A-Za-z0-9_-]{10,}\\.[A-Za-z0-9_-]{10,}'
        },
        modelsEndpointValidatesAuth: false, // 不变量：modelsPath=null ⇒ 无法用 /models 验鉴权
        cors: 'verified',
        priority: 35,
        signupUrl: 'https://platform.minimaxi.com/user-center/basic-information/interface-key',
        note: '模型 ID 未核实'
    },
    {
        id: 'stepfun',
        label: '阶跃星辰',
        baseUrl: 'https://api.stepfun.com/v1',
        chatPath: '/chat/completions',
        modelsPath: '/models',
        models: [
            // 未核实
            { id: 'step-1-8k', tier: 'cheap', jsonMode: null }
        ],
        authStyle: 'bearer',
        keyShape: {
            // Key 形状无稳定公开特征：不猜，返回 false（detectProviderId 不会命中该引擎）
            test: () => false,
            hint: 'Key 无稳定前缀特征，请在设置中手动指定引擎'
        },
        modelsEndpointValidatesAuth: true,
        cors: 'verified',
        priority: 40,
        signupUrl: 'https://platform.stepfun.com/interface-key',
        note: 'Key 形状未核实，无法自动识别'
    },
    {
        id: 'qianfan',
        label: '百度千帆 v2',
        baseUrl: 'https://qianfan.baidubce.com/v2',
        chatPath: '/chat/completions',
        modelsPath: '/models',
        models: [
            // 未核实；ernie-speed 为千帆较便宜/有免费额度的模型
            { id: 'ernie-speed-128k', tier: 'cheap', jsonMode: null }
        ],
        authStyle: 'bearer',
        keyShape: {
            test: (k) => /^bce-v3\/ALTAK-/.test(k),
            hint: '形如 bce-v3/ALTAK-...（未核实）',
            pattern: 'bce-v3/ALTAK-[A-Za-z0-9_-]{10,}(?:/[A-Za-z0-9_-]{10,})?'
        },
        modelsEndpointValidatesAuth: true,
        cors: 'verified',
        priority: 45,
        signupUrl: 'https://console.bce.baidu.com/qianfan/ais/console/applicationConsole/application',
        note: 'Key 形状未核实'
    },
    {
        id: 'hunyuan',
        label: '腾讯混元',
        baseUrl: 'https://api.hunyuan.cloud.tencent.com/v1',
        chatPath: '/chat/completions',
        modelsPath: '/models',
        models: [
            // 未核实；hunyuan-lite 长期免费
            { id: 'hunyuan-lite', tier: 'free', jsonMode: null }
        ],
        authStyle: 'bearer',
        keyShape: {
            // 混元 Key 可能为 sk- 前缀（与 DeepSeek 同形状），无法稳定区分 → 不猜
            test: () => false,
            hint: 'Key 形状无稳定公开特征（可能为 sk- 前缀），请手动指定引擎'
        },
        modelsEndpointValidatesAuth: true,
        cors: 'verified',
        priority: 50,
        signupUrl: 'https://console.cloud.tencent.com/hunyuan/api-key',
        note: 'hunyuan-lite 免费；Key 形状未核实'
    },
    {
        id: 'gemini',
        label: 'Google Gemini',
        baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
        chatPath: '/chat/completions',
        modelsPath: null,
        models: [
            // 未核实
            { id: 'gemini-2.0-flash', tier: 'cheap', jsonMode: null }
        ],
        authStyle: 'bearer',
        keyShape: {
            test: (k) => /^AIzaSy[A-Za-z0-9_-]{20,}$/.test(k),
            hint: 'AIzaSy 开头',
            pattern: 'AIzaSy[A-Za-z0-9_-]{20,}'
        },
        modelsEndpointValidatesAuth: false, // 不变量：modelsPath=null ⇒ 无法用 /models 验鉴权
        cors: 'unverified', // 沙箱网络受限，无法判定；不得谎报为 verified
        priority: 30,
        signupUrl: 'https://aistudio.google.com/app/apikey',
        note: 'CORS 未实测（沙箱受限）；有免费额度'
    },
    {
        id: 'groq',
        label: 'Groq',
        baseUrl: 'https://api.groq.com/openai/v1',
        chatPath: '/chat/completions',
        modelsPath: null,
        models: [
            // 未核实
            { id: 'llama-3.1-8b-instant', tier: 'free', jsonMode: null }
        ],
        authStyle: 'bearer',
        keyShape: {
            test: (k) => /^gsk_[A-Za-z0-9]{20,}$/.test(k),
            hint: 'gsk_ 开头',
            pattern: 'gsk_[A-Za-z0-9]{20,}'
        },
        modelsEndpointValidatesAuth: false, // 不变量：modelsPath=null ⇒ 无法用 /models 验鉴权
        cors: 'unverified', // 沙箱网络受限，无法判定；不得谎报为 verified
        priority: 25,
        signupUrl: 'https://console.groq.com/keys',
        note: 'CORS 未实测（沙箱受限）；有免费额度'
    },
    // -----------------------------------------------------------------------
    // v3.0.4 追加：由用户实测数据新增的三家引擎
    // 证据等级说明：以下 cors / modelsEndpointValidatesAuth / jsonMode 均为**实测**结论
    // （curl 直连 + 真实 Chromium 跨域 fetch 双重验证），而非推测。
    // -----------------------------------------------------------------------
    {
        id: 'agnes',
        label: 'Agnes AI',
        baseUrl: 'https://apihub.agnes-ai.com/v1',
        chatPath: '/chat/completions',
        modelsPath: '/models', // 实测：错 Key / 无 Key 均返回 401 ⇒ 可做零 token 鉴权快路径
        models: [
            // 实测 2026-09-18：HTTP 200 + 合法 chat completion，且 response_format
            // json_object 被接受并返回可解析 JSON（content='{"ok":1}'）
            { id: 'agnes-3.0-flash', tier: 'free', jsonMode: true },
            // 实测 200 但 max_tokens:3 下 content 为空（延迟 ~5.9s，明显慢于 3.0-flash）
            { id: 'agnes-2.5-flash', tier: 'free', jsonMode: null }
        ],
        authStyle: 'bearer',
        keyShape: { test: (k) => SK_GENERIC_TEST.test(k), hint: SK_HINT, pattern: SK_GENERIC_PATTERN },
        modelsEndpointValidatesAuth: true,
        cors: 'verified', // 实测 /models 与 /chat/completions 均返回 Access-Control-Allow-Origin: *
        priority: 88,
        signupUrl: 'https://agnes-ai.com/',
        note: 'agnes-3.0-flash 面向开发者免费（512K 上下文）；Key 为 sk- 开头，与 DeepSeek/Kimi 等共用前缀，需探测消歧；pro 系列对免费 Key 返回 403，故不收录'
    },
    {
        id: 'modelscope',
        label: 'ModelScope 魔搭',
        baseUrl: 'https://api-inference.modelscope.cn/v1',
        chatPath: '/chat/completions',
        // 实测：/models 是公开模型库，错 Key 甚至无 Key 也返回 200 ⇒ 不校验鉴权，
        // 因此不提供零 token 快路径（遵守不变量：无法验鉴权 ⇒ modelsPath=null）。
        modelsPath: null,
        models: [
            // 实测 2026-09-18：200 + 合法 chat completion；max_tokens:3 下仍返回非空 content，
            // 且 response_format json_object 被正确遵守（content='{"ok":1}'）。
            // ⚠ slow:true 的依据 —— 真实组词负载（4 字全量检查）实测 102–122s，
            //    而 agnes-3.0-flash 同一任务仅 12.9s（约 8–9 倍差）。属推理型模型：
            //    3 token 探测下秒回，真实负载下先生成大量 reasoning token。
            //    注意它同时还是 response_format 的"不合规"实现：max_tokens:3 时返回
            //    HTTP 200 + {"choices":null}，需靠 aiKeyHealth 的降级信号 2 才能识别。
            { id: 'Qwen/Qwen3.8-Flash-Next', tier: 'free', jsonMode: true, slow: true },
            // 实测 200；属推理型模型（max_tokens:3 时正文落在 reasoning_content、
            // content 为空）。端到端耗时未单独实测，故不标 slow（不臆造数据）。
            { id: 'deepseek-ai/DeepSeek-V4.1-Flash', tier: 'free', jsonMode: null },
            { id: 'Qwen/Qwen3.5-27B', tier: 'free', jsonMode: null }
        ],
        authStyle: 'bearer',
        keyShape: {
            test: (k) => /^ms-[0-9a-fA-F-]{20,}$/.test(k),
            hint: 'ms- 开头（魔搭 ModelScope 访问令牌）',
            pattern: 'ms-[0-9a-fA-F-]{20,}'
        },
        modelsEndpointValidatesAuth: false, // 不变量：无法用 /models 验鉴权 ⇒ false
        cors: 'verified', // 实测 /models 与 /chat/completions 均返回 Access-Control-Allow-Origin: *
        priority: 78,
        signupUrl: 'https://www.modelscope.cn/my/myaccesstoken',
        note: 'API-Inference 每日 2000 次免费额度；模型 ID 为「组织/模型」形式，与其它引擎命名风格不同；⚠ 现有可用模型均为推理型，真实组词负载明显慢（实测默认模型 4 字约 100–120s），建议作为备用引擎而非首选'
    },
    {
        id: 'apinex',
        label: 'APINEX',
        baseUrl: 'https://api.apinex.bond/v1',
        chatPath: '/chat/completions',
        modelsPath: null, // /models 虽返回 200，但无 ACAO 且无法在浏览器中访问
        models: [
            // 模型 ID 来自实测 /models 列表；但因下方 cors 原因，浏览器内均不可达
            { id: 'free/deepseek-v4-flash-0731', tier: 'free', jsonMode: null },
            { id: 'deepseek-v4-flash', tier: 'cheap', jsonMode: null }
        ],
        authStyle: 'bearer',
        keyShape: {
            test: (k) => /^sk-apx[0-9a-f]{32,}$/i.test(k),
            hint: 'sk-apx 开头（APINEX 专属，可唯一识别）',
            pattern: 'sk-apx[0-9a-f]{32,}'
        },
        modelsEndpointValidatesAuth: false,
        // 实测结论（curl 响应头 + 真实 Chromium 跨域 fetch 双重验证）：
        //   · OPTIONS 预检返回 204，带 allow-methods / allow-headers / allow-credentials，
        //     但**不含 Access-Control-Allow-Origin**（对 localhost / example.com / null 均如此）
        //   · POST 同样只回 allow-credentials、无 ACAO ⇒ 浏览器判定 CORS 失败
        //   · 真实 Chromium 中 fetch 直接抛 "Failed to fetch"
        //   · 另外账户侧返回 402 {"message":"Insufficient balance"}
        // 保留条目的唯一目的是：让 sk-apx 形状被**唯一识别**，从而立刻给出准确诊断，
        // 而不是被误判为 DeepSeek 并浪费一串 401 探测。
        cors: 'failed',
        priority: 20,
        signupUrl: 'https://apinex.bond/',
        note: '⚠ 实测浏览器直连不可用（响应缺 Access-Control-Allow-Origin，预检亦无），且账户提示余额不足；不参与自动优选'
    }
];

// ---------------------------------------------------------------------------
// 公开 API
// ---------------------------------------------------------------------------

/** 返回全部引擎（注册表原数组）。 */
export function listProviders() {
    return PROVIDERS;
}

/** 按 id 取引擎；不存在返回 null。 */
export function getProvider(id) {
    if (!id) return null;
    return PROVIDERS.find((p) => p.id === id) || null;
}

/**
 * 依据 Key 形状推断引擎 ID。
 * 唯一命中才返回；0 个或多个命中（形状有歧义）一律返回 null——不猜。
 * 例：'sk-abc...' → null（可能是 DeepSeek / Moonshot / SiliconFlow / DashScope），
 *     'sk-or-v1-...' → 'openrouter'，'ark-...' → 'volcano'。
 * @param {string} key
 * @returns {string|null}
 */
export function detectProviderId(key) {
    if (!key || typeof key !== 'string') return null;
    const k = key.trim();
    if (!k) return null;
    const matches = PROVIDERS.filter(
        (p) => p.keyShape && typeof p.keyShape.test === 'function' && p.keyShape.test(k)
    );
    return matches.length === 1 ? matches[0].id : null;
}

/** 引擎展示名；未知返回 '未知引擎'。 */
export function providerLabel(id) {
    const p = getProvider(id);
    return p ? p.label : '未知引擎';
}

/**
 * 向后兼容导出（契约 §3.2）：保持 v3.0.3 旧语义不变。
 * sk- → 'deepseek'，ark- → 'volcano'，其余 → 'unknown'。
 * 新逻辑请使用 detectProviderId。
 * @param {string} key
 * @returns {'deepseek'|'volcano'|'unknown'}
 */
export function detectApiKeyType(key) {
    if (!key || typeof key !== 'string') return 'unknown';
    const t = key.trim();
    if (t.startsWith('sk-')) return 'deepseek';
    if (t.startsWith('ark-')) return 'volcano';
    return 'unknown';
}

/**
 * 解析“应当使用哪个引擎”：显式 providerId 优先 → 形状唯一判定 →
 * 旧前缀语义兜底（sk-→deepseek / ark-→volcano，保证老用户零动作可用）→ null。
 * 说明：这里对 sk- 的兜底是刻意的向后兼容（旧版即如此），
 *       detectProviderId 本身仍严格返回 null；调用方可先探测再消歧。
 * @param {string} key
 * @param {string|null} [explicitProviderId]
 * @returns {string|null}
 */
export function resolveProviderId(key, explicitProviderId) {
    if (explicitProviderId && getProvider(explicitProviderId)) return explicitProviderId;
    const k = typeof key === 'string' ? key.trim() : '';
    if (!k) return null;
    const detected = detectProviderId(k);
    if (detected) return detected;
    const legacy = detectApiKeyType(k);
    return legacy === 'unknown' ? null : legacy;
}
