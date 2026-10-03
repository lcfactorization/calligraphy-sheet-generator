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
 * @property {'openai'|'anthropic'} [protocol]  v1.5.2：请求协议。缺省视为 'openai'
 *                                               （内置 18 家全是 OpenAI 兼容）。
 * @property {number} [maxTokens]                v1.5.2：请求参数覆盖（未设则用内置默认）
 * @property {number} [temperature]              v1.5.2：同上
 * @property {number} [topP]                     v1.5.2：同上
 * @property {Object} [extraParams]              v1.5.2：额外请求体字段，浅覆盖；
 *                                               与内置字段冲突时以它为准（用户显式设置优先）
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
            // v1.4.0：按官方免费清单（2026-09）重排。同一把 Key 可切换以下全部免费模型，
            //   设置面板的「该 Key 使用的模型」下拉会列出本条 models 数组。
            //   选型建议（官方）：文本主力 glm-4.7-flash（200K 上下文）；高并发轻量
            //   glm-4-flash-250414（30 并发，不限 Token 总量）。
            //   ⚠ glm-4.5-flash 官方已宣布退役，不收录（避免用户误选后拿到 404）。
            //   另外 5 款免费模型（glm-4.6v-flash / glm-4.1v-thinking-flash / glm-4v-flash /
            //   cogview-3-flash / cogvideox-flash）属视觉·图像·视频，本应用只做文本组词与
            //   拼音校验，收录它们只会让用户误选后拿到「模型不支持文本」，故不收。
            { id: 'glm-4.7-flash', tier: 'free', jsonMode: null },
            { id: 'glm-4-flash-250414', tier: 'free', jsonMode: null }
        ],
        authStyle: 'bearer',
        keyShape: {
            test: (k) => /^[0-9a-f]{32}\.[A-Za-z0-9_-]{10,}$/i.test(k),
            hint: '形如 <32位十六进制>.<密钥段>',
            pattern: '[0-9a-f]{32}\\.[A-Za-z0-9_-]{10,}'
        },
        modelsEndpointValidatesAuth: true,
        cors: 'verified',
        priority: 82,
        signupUrl: 'https://open.bigmodel.cn/usercenter/apikeys',
        note: '共 8 款完全免费模型（文本 2 款 + 视觉 3 款 + 图像 1 款 + 视频 1 款，$0 计费）；本应用只用文本款：glm-4.7-flash（200K 上下文，主力）、glm-4-flash-250414（30 并发，不限总量）'
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
    // v1.5.1 追加：商汤 SenseNova（OpenAI 兼容）
    // 来源：用户提供 https://token.sensenova.cn/v1
    // 证据等级说明：以下 cors / modelsPath / jsonMode / tier **均未实测**
    //   （本环境无 SenseNova Key），故一律取"保守且诚实"的取值，不谎报 verified。
    // -----------------------------------------------------------------------
    {
        id: 'sensenova',
        label: '商汤 SenseNova',
        baseUrl: 'https://token.sensenova.cn/v1',
        chatPath: '/chat/completions',
        // 未实测其 /models 是否存在、是否校验鉴权 → 遵守不变量：
        // 「无法用 /models 验鉴权」⇒ modelsPath=null + modelsEndpointValidatesAuth=false。
        // 代价是没有零 token 快路径（会走 3 token 能力探测），换来的是不误导用户。
        modelsPath: null,
        models: [
            // 模型清单由用户提供（这 5 个是该账号下可用的模型）。
            // ⚠ tier 按**命名惯例**推断（pro → paid；flash / lite → cheap），**未核实计费**。
            //   与 volcano 条目同一处理方式（doubao-*-turbo → paid、*-lite → cheap）。
            //   若实际为免费，用户在「检测全部 Key 可用性」后可由探测结论覆盖判断；
            //   这里宁可低估（记为 cheap 而非 free），避免自动优选把付费模型当免费用。
            { id: 'sensenova-6.8-flash-lite', tier: 'cheap', jsonMode: null },
            { id: 'sensenova-u1.5-lite', tier: 'cheap', jsonMode: null },
            { id: 'sensenova-u1-fast', tier: 'cheap', jsonMode: null },
            { id: 'deepseek-v4-flash', tier: 'cheap', jsonMode: null },
            { id: 'deepseek-v4-pro', tier: 'paid', jsonMode: null }
        ],
        authStyle: 'bearer',
        // Key 形如 sk-…（与 DeepSeek / Kimi / 硅基流动 / 百炼 / Agnes 共用前缀）。
        // 刻意复用 SK_GENERIC_TEST：形状**无法唯一判定** → detectProviderId 返回 null（不猜），
        // 由 aiKeyHealth 把「所有 sk- 引擎」列为候选逐个探测、命中即止并回写 providerId。
        // 这是正确的做法 —— 若给它单独写一个正则把 sk- 都判成 SenseNova，反而会误伤其它引擎。
        keyShape: { test: (k) => SK_GENERIC_TEST.test(k), hint: SK_HINT, pattern: SK_GENERIC_PATTERN },
        modelsEndpointValidatesAuth: false, // 不变量：modelsPath=null ⇒ 无法用 /models 验鉴权
        cors: 'unverified', // 未实测；不得谎报为 verified
        priority: 80,
        signupUrl: 'https://platform.sensenova.cn/',
        note: '模型档位按命名推断（未核实计费）；Key 为 sk- 开头，与 DeepSeek / Kimi 等共用前缀，需用「检测全部 Key 可用性」消歧'
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
    },
    // -----------------------------------------------------------------------
    // v1.4.0 追加：AMD Radeon Cloud（Token Factory）免费共享端点
    // 来源：https://developer.amd.com.cn/radeon/tokenfactory
    //       https://amd-aim.github.io/radeon-cloud-docs/zh-cn/guides/model-apis/
    // 与其它引擎的关键差异：**一把 Key 通用于全部共享模型**，换模型只改请求里的
    //   model 字段（官方原文："想换模型，改 model 字段就行"）。
    //   因此设置面板的「该 Key 使用的模型」下拉在这里最有价值 —— 无需换 Key 即可
    //   在 4 款免费文本模型之间切换（这也是本轮把模型选择做成一等 UI 的直接动因）。
    // -----------------------------------------------------------------------
    {
        id: 'radeon',
        label: 'AMD Radeon Cloud',
        baseUrl: 'https://developer.amd.com.cn/radeon/api/v1',
        chatPath: '/chat/completions',
        // 官方文档：共享端点支持 chat completions 与「列出模型」→ 具备零 token 鉴权快路径。
        // ⚠ 未在本机实测（本环境无 AMD Key），故 cors 保持 'unverified' 而不谎报 verified；
        //   因此它不会进入「形状未知时」的自动扫描候选（见 aiKeyHealth.resolveProviderCandidates
        //   第 4 步只收 cors==='verified'），需要用户在设置面板手动指定引擎。
        modelsPath: '/models',
        models: [
            // 官方「Public Free Model APIs」清单（2026-09，共 8 款）。
            // 排序：轻量文本款在前（组词/拼音校验不需要强推理模型，且官方共享端点
            //   按 Key + IP 限流，小模型更不容易撞上限）。
            // v1.5.1 修订：原先按「只收文本款」排除了视觉款，但用户明确要使用
            //   `Qwen3.8-27B`，且这类 VLM 多为多模态 LLM、同样接受**纯文本**对话
            //   （本应用只发文本）。故改为全部收录，并把能力类型写在注释里供用户判断。
            //   ⚠ 未逐款实测，jsonMode 一律 null（交由运行时探测）。
            { id: 'MiniCPM5-2B', tier: 'free', jsonMode: null },              // LLM（文本）
            { id: 'GLM-5.3-Flash', tier: 'free', jsonMode: null },            // LLM（文本）
            { id: 'DeepSeek-V4-Flash-0731', tier: 'free', jsonMode: null },   // LLM（文本）
            { id: 'MinerU2.5-Pro', tier: 'free', jsonMode: null },            // LLM（文本）
            { id: 'Qwen3.8-27B', tier: 'free', jsonMode: null },              // VLM（多模态，亦支持纯文本）
            { id: 'Qwen3.8-Flash-Next', tier: 'free', jsonMode: null },       // VLM
            { id: 'DeepSeek-V4.1-Flash', tier: 'free', jsonMode: null },      // VLM
            { id: 'MiMo-V2.6-Flash', tier: 'free', jsonMode: null }           // VLM
        ],
        authStyle: 'bearer',
        keyShape: {
            // v1.5.1：AMD 共享端点的 Key 实测为 `rc-` + 长串（形如
            //   rc-5deb6b18…67），**前缀稳定可判定** —— 原先写的 `test: () => false`
            //   （"无稳定前缀，需手动指定引擎"）已被实测推翻，现改为唯一识别。
            //   ⚠ 依据是单个样本；若日后出现不匹配的 Key，形状判定会退回
            //   「手动指定引擎」，功能不受影响（只是少一步自动化）。
            test: (k) => /^rc-[A-Za-z0-9]{16,}$/.test(k),
            hint: 'rc- 开头（AMD Radeon Cloud）',
            pattern: 'rc-[A-Za-z0-9]{16,}'
        },
        modelsEndpointValidatesAuth: true,
        cors: 'unverified', // 未实测；不得谎报为 verified（与 gemini / groq 同策略）
        priority: 84, // 免费 + 一把 Key 多模型 → 排在智谱之前，但低于 DeepSeek/Agnes 实测可用者
        signupUrl: 'https://developer.amd.com.cn/radeon/tokenfactory',
        note: '免费共享端点（不消耗额度，按 Key + IP 限流，另有每日消耗上限）；一把 Key 通用于全部共享模型，改 model 字段即可切换。Key 为 rc- 开头'
    }
];

// ---------------------------------------------------------------------------
// v1.5.1：用户自定义引擎（unknown provider 的手动添加）
// ---------------------------------------------------------------------------
// 为什么放在本文件而不是新模块：本文件是「引擎配置的唯一事实来源」，
// 而 getProvider / providerLabel / resolveProviderId 都在这里。若把自定义引擎
// 放到别处，这三个函数就必须反向依赖新模块，反而破坏了「单一事实来源」。
//
// 存储策略：
//   · 自定义引擎**不是密钥**（只有 baseUrl / 模型名），因此明文存 localStorage 是可接受的；
//     密钥本身仍走 aiKeyStore 的四种持久化模式。
//   · 无 localStorage 时（Node 单测 / SSR）退化为「仅本次运行的内存列表」，不抛错。
//
// 字段取值原则：未知的一律取"保守且诚实"的值 ——
//   cors: 'unverified'（未实测，不谎报 verified）、modelsPath: null +
//   modelsEndpointValidatesAuth: false（不知道有没有 /models，就不声称能验鉴权）、
//   priority: 10（不参与自动优选的优先队列）。
const CUSTOM_PROVIDERS_KEY = 'ai_custom_providers';

/** v1.5.6：自定义引擎的模型元数据合法取值（越界一律回落默认值，不写进存储） */
const MODEL_TIERS = ['free', 'cheap', 'paid'];

/**
 * 规整单个模型的元数据。
 *
 * v1.5.6 之前这里把 tier 硬写成 'cheap'、jsonMode 硬写成 null —— 于是
 * 「模型列表」里用户为自定义模型选的档位与 JSON 模式**一存盘就丢**，
 * 表现为「改完刷新又变回去了」。现在按白名单保留，非法值回落默认。
 *
 * @param {string} id
 * @param {object|null} raw 原始模型对象（可为字符串，此时用默认元数据）
 * @returns {{id:string, tier:string, jsonMode:boolean|null, fullCheck?:boolean, slow?:boolean}}
 */
function _normalizeModelMeta(id, raw) {
    const out = { id, tier: 'cheap', jsonMode: null };
    if (raw && typeof raw === 'object') {
        if (MODEL_TIERS.includes(raw.tier)) out.tier = raw.tier;
        if (raw.jsonMode === true || raw.jsonMode === false) out.jsonMode = raw.jsonMode;
        if (raw.fullCheck === true) out.fullCheck = true;
        if (raw.slow === true) out.slow = true;
    }
    return out;
}


/** 内存镜像（无 localStorage 时的唯一存储） */
let _customProviders = null;

function _ls() {
    try { return (typeof localStorage !== 'undefined') ? localStorage : null; } catch { return null; }
}

// ---------------------------------------------------------------------------
// v1.5.2：协议与请求参数
// ---------------------------------------------------------------------------
// 为什么需要 protocol：
//   内置 18 家全是 OpenAI 兼容（POST /chat/completions + Bearer + messages 数组），
//   但用户自定义的端点可能是 Anthropic 原生 Messages API（POST /v1/messages +
//   x-api-key 头 + system 独立字段 + max_tokens 必填 + 从 content[].text 取正文）。
//   两者请求体与响应体都不同，必须在数据层显式区分，不能"猜"。
//
// 参数完全可选：未设置的项由调用方（aiZuci）使用内置默认值 ——
//   即「可以设置，也可以默认采用模型提供商的默认值」。
export const PROTOCOLS = ['openai', 'anthropic'];

/** 各协议的默认 chat 路径（自定义引擎未显式给出路径时使用） */
export const PROTOCOL_DEFAULT_CHAT_PATH = {
    openai: '/chat/completions',
    anthropic: '/v1/messages'
};

/**
 * v1.5.4：「误把 chat 路径写进 Base URL」的识别正则。
 * 由 validateBaseUrl（创建入口，拦截）与 aiDiagnostics.checkBaseUrl
 * （体检入口，解释原因）**共用同一份** —— 两处各写一份迟早会漂移，
 * 届时会出现「创建时说合法、体检时说非法」的自相矛盾。
 */
export const CHAT_PATH_SUFFIX_RE = /\/(?:chat\/completions|v1\/messages|completions|messages)\/?$/i;

/** Anthropic 官方常用模型（仅作为 UI 建议值，不冒充"权威清单"） */
export const ANTHROPIC_SUGGESTED_MODELS = [
    'claude-sonnet-4-5',
    'claude-opus-4-1',
    'claude-3-7-sonnet-latest',
    'claude-3-5-haiku-latest'
];

/** 请求参数的合法区间（超出即丢弃，避免把非法值发到线上） */
const PARAM_RANGE = {
    maxTokens: [1, 200000],
    temperature: [0, 2],
    topP: [0, 1]
};

/**
 * 规整单个数值参数：非法（非有限数 / 越界）返回 undefined（= 不设置，用默认值）。
 * @param {string} name
 * @param {*} raw
 * @returns {number|undefined}
 */
export function normalizeParam(name, raw) {
    const range = PARAM_RANGE[name];
    if (!range) return undefined;
    if (raw === undefined || raw === null || raw === '') return undefined;
    const n = typeof raw === 'number' ? raw : Number(String(raw).trim());
    if (!Number.isFinite(n)) return undefined;
    if (n < range[0] || n > range[1]) return undefined;
    return n;
}

/**
 * 规整额外参数对象：只接受普通对象，值必须是 JSON 可表达的基本类型（不含 DOM/函数）。
 * key 限制为标识符风格，避免把 `__proto__` 之类的键写进请求体。
 * @param {*} raw 对象或 JSON 字符串
 * @returns {{ ok: boolean, value: Object, error: string }} ok=false 时 value 为 {}
 */
export function normalizeExtraParams(raw) {
    if (raw === undefined || raw === null || raw === '') return { ok: true, value: {}, error: '' };
    let obj = raw;
    if (typeof raw === 'string') {
        const s = raw.trim();
        if (!s) return { ok: true, value: {}, error: '' };
        try { obj = JSON.parse(s); } catch { return { ok: false, value: {}, error: '额外参数不是合法 JSON' }; }
    }
    if (typeof obj !== 'object' || Array.isArray(obj)) {
        return { ok: false, value: {}, error: '额外参数必须是 JSON 对象（形如 {"top_k":40}）' };
    }
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
        // 只放行标识符键：拦掉 __proto__ / constructor / prototype 等原型污染面
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(k)) continue;
        if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
        const t = typeof v;
        if (v === null || t === 'string' || t === 'number' || t === 'boolean') { out[k] = v; continue; }
        if (Array.isArray(v) || t === 'object') { out[k] = v; }
    }
    return { ok: true, value: out, error: '' };
}

/**
 * 合并「内置默认参数」与「引擎自定义参数」。
 * 语义：**用户设置的值覆盖默认值**；未设置的项保留默认值。
 * 额外参数（extraParams）最后浅覆盖 —— 用户显式写的字段优先级最高。
 * @param {object|null} provider
 * @param {Object} defaults 形如 { model, messages, max_tokens, temperature }
 * @returns {Object} 可直接 JSON.stringify 的请求体
 */
export function buildRequestBody(provider, defaults) {
    const body = { ...defaults };
    if (provider) {
        if (provider.maxTokens !== undefined) body.max_tokens = provider.maxTokens;
        if (provider.temperature !== undefined) body.temperature = provider.temperature;
        if (provider.topP !== undefined) body.top_p = provider.topP;
        if (provider.extraParams && typeof provider.extraParams === 'object') {
            for (const [k, v] of Object.entries(provider.extraParams)) body[k] = v;
        }
    }
    return body;
}

/** 把一个用户输入的自定义引擎规整为合法 Provider（丢弃非法项，返回 null） */
function _normalizeCustomProvider(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const id = typeof raw.id === 'string' ? raw.id.trim() : '';
    const baseUrl = typeof raw.baseUrl === 'string' ? raw.baseUrl.trim().replace(/\/+$/, '') : '';
    if (!id || !baseUrl) return null;
    // 只接受 http(s)：避免 javascript: / data: 之类被当成接口地址
    if (!/^https?:\/\//i.test(baseUrl)) return null;

    const label = (typeof raw.label === 'string' && raw.label.trim()) ? raw.label.trim() : id;

    // v1.5.2：协议。未知取值一律回落 'openai'（兼容旧数据，旧数据本就没有该字段）
    const protocol = PROTOCOLS.includes(raw.protocol) ? raw.protocol : 'openai';
    const chatPath = (typeof raw.chatPath === 'string' && raw.chatPath.trim())
        ? raw.chatPath.trim()
        : PROTOCOL_DEFAULT_CHAT_PATH[protocol];

    const seen = new Set();
    const models = [];
    const rawModels = Array.isArray(raw.models) ? raw.models : [];
    for (const m of rawModels) {
        const mid = (m && typeof m === 'object') ? m.id : m;
        if (typeof mid !== 'string' || !mid.trim()) continue;
        const t = mid.trim();
        if (seen.has(t)) continue;
        seen.add(t);
        models.push(_normalizeModelMeta(t, m));
    }
    // 允许只给一个 modelId（用户最常见的输入形态）
    const single = typeof raw.modelId === 'string' ? raw.modelId.trim() : '';
    if (single && !seen.has(single)) models.push(_normalizeModelMeta(single, null));
    // 刻意允许 models 为空（v1.5.4 复核：这是**有意**的宽松，不是漏洞）：
    //   · 设置面板的表单校验会拦（settingsCenter「请至少填写一个模型 ID」）；
    //   · addCustomProviderWithKey 也会拦（本文件内的 models.length === 0 分支）。
    //   数据层之所以放宽，是因为 _normalizeCustomProvider 还要为**历史数据**服务 ——
    //   旧版本可能已在 localStorage 里存下了没有模型的引擎条目，此时必须能读出来，
    //   否则会被静默丢弃、用户表现为「我加的引擎不见了」。

    // v1.5.2：请求参数（全部可选，非法值静默丢弃 → 回落到内置默认值）
    const extra = normalizeExtraParams(raw.extraParams);

    const out = {
        id,
        label,
        baseUrl,
        chatPath,
        modelsPath: null,
        models,
        authStyle: protocol === 'anthropic' ? 'x-api-key' : 'bearer',
        keyShape: {
            // 自定义引擎没有形状规则：不猜，一律由用户显式指定 providerId
            test: () => false,
            hint: '自定义引擎，无 Key 形状规则，请在设置面板手动指定'
        },
        modelsEndpointValidatesAuth: false,
        cors: 'unverified',
        priority: 10,
        signupUrl: '',
        custom: true,
        protocol,
        note: protocol === 'anthropic'
            ? '用户自定义引擎 · Anthropic Messages API 协议（未验证 CORS / 模型可用性）'
            : '用户自定义引擎 · OpenAI 兼容协议（未验证 CORS / 模型可用性）'
    };
    const maxTokens = normalizeParam('maxTokens', raw.maxTokens);
    const temperature = normalizeParam('temperature', raw.temperature);
    const topP = normalizeParam('topP', raw.topP);
    if (maxTokens !== undefined) out.maxTokens = maxTokens;
    if (temperature !== undefined) out.temperature = temperature;
    if (topP !== undefined) out.topP = topP;
    if (extra.ok && Object.keys(extra.value).length > 0) out.extraParams = extra.value;
    return out;
}

/** 把一个引擎对象压成可 JSON 序列化的持久化形态（keyShape 是函数，不能 JSON 化） */
function _providerForStorage(p) {
    const o = {
        id: p.id,
        label: p.label,
        baseUrl: p.baseUrl,
        chatPath: p.chatPath,
        protocol: p.protocol || 'openai',
        // v1.5.6：保留模型元数据。此前只写 { id }，导致用户在「模型列表」里
        //   设的档位 / JSON 模式 / 全量检查标记**一存盘就丢**。
        models: p.models.map((m) => {
            const mo = { id: m.id, tier: MODEL_TIERS.includes(m.tier) ? m.tier : 'cheap' };
            if (m.jsonMode === true || m.jsonMode === false) mo.jsonMode = m.jsonMode;
            if (m.fullCheck === true) mo.fullCheck = true;
            if (m.slow === true) mo.slow = true;
            return mo;
        })
    };
    if (p.maxTokens !== undefined) o.maxTokens = p.maxTokens;
    if (p.temperature !== undefined) o.temperature = p.temperature;
    if (p.topP !== undefined) o.topP = p.topP;
    if (p.extraParams && Object.keys(p.extraParams).length > 0) o.extraParams = p.extraParams;
    return o;
}

/** 读取自定义引擎（已规整）。无存储时返回内存镜像。 */
export function getCustomProviders() {
    if (_customProviders) return _customProviders;
    const ls = _ls();
    if (!ls) { _customProviders = []; return _customProviders; }
    let parsed = [];
    try {
        const raw = ls.getItem(CUSTOM_PROVIDERS_KEY);
        const arr = raw ? JSON.parse(raw) : [];
        if (Array.isArray(arr)) parsed = arr;
    } catch { parsed = []; }
    const out = [];
    const seen = new Set();
    for (const item of parsed) {
        const p = _normalizeCustomProvider(item);
        if (!p || seen.has(p.id)) continue;
        seen.add(p.id);
        out.push(p);
    }
    _customProviders = out;
    return out;
}

/** 整体替换自定义引擎列表（返回实际写入的规整结果） */
export function setCustomProviders(list) {
    const out = [];
    const seen = new Set();
    for (const item of (Array.isArray(list) ? list : [])) {
        const p = _normalizeCustomProvider(item);
        if (!p || seen.has(p.id)) continue;
        seen.add(p.id);
        out.push(p);
    }
    _customProviders = out;
    const ls = _ls();
    if (ls) {
        try {
            // 只持久化原始字段（keyShape 是函数，JSON 化会丢失且无意义）
            ls.setItem(CUSTOM_PROVIDERS_KEY, JSON.stringify(out.map(_providerForStorage)));
        } catch { /* 配额 / 隐私模式：内存里仍然生效 */ }
    }
    return out;
}

/** 生成一个不与现有引擎冲突的自定义 id */
export function makeCustomProviderId() {
    const taken = new Set(PROVIDERS.map((p) => p.id).concat(getCustomProviders().map((p) => p.id)));
    for (let i = 1; i < 1000; i++) {
        const id = 'custom_' + i;
        if (!taken.has(id)) return id;
    }
    return 'custom_' + Date.now();
}

/**
 * 按 baseUrl 查找（或创建）一个自定义引擎。
 * 用于「批量导入未知类型 Key」：同一条 baseUrl 只建一个引擎，多个模型/多把 Key 挂在它下面。
 * @param {string} baseUrl
 * @param {string} [label] 展示名（缺省时用 baseUrl 的 host）
 * @returns {object|null} 规整后的自定义引擎
 */
export function ensureCustomProviderByBaseUrl(baseUrl, label) {
    const url = String(baseUrl || '').trim().replace(/\/+$/, '');
    if (!url) return null;
    const list = getCustomProviders();
    const hit = list.find((p) => p.baseUrl === url);
    if (hit) return hit;

    let host = url;
    try { host = new URL(url).host; } catch { /* 非法 URL 交给 _normalizeCustomProvider 拒绝 */ }
    const created = _normalizeCustomProvider({
        id: makeCustomProviderId(),
        label: (label && String(label).trim()) || host,
        baseUrl: url,
        models: []
    });
    // 允许「先建引擎、后补模型」：这里给一个占位模型，导入时会被真实 modelId 覆盖
    if (!created) return null;
    setCustomProviders(list.concat([_providerForStorage(created)]));
    return getCustomProviders().find((p) => p.id === created.id) || null;
}

/** 往自定义引擎里补一个模型 ID（已存在则忽略） */
export function addModelToCustomProvider(providerId, modelId) {
    const mid = String(modelId || '').trim();
    if (!mid) return false;
    const list = getCustomProviders();
    const p = list.find((x) => x.id === providerId);
    if (!p) return false;
    if (p.models.some((m) => m.id === mid)) return true;
    setCustomProviders(list.map((x) => (x.id === providerId
        ? _providerForStorage({ ...x, models: x.models.concat([{ id: mid }]) })
        : x)));
    return true;
}

// ---------------------------------------------------------------------------
// v1.5.2：一体化「添加引擎 + Key」的数据层
// ---------------------------------------------------------------------------
// 用户诉求原文：「完整的 api key, base URL, model ID, 以及 OpenAI 或 anthropic
//   标准介入，包括其它参数可以设置或默认采用模型提供商默认值」
//
// 设计取舍：
//   · 「完整 api key」= 在这里就把 Key 一起收进来，而不是「先建引擎、再去 Key 下拉添加」
//     的两步走。表单一次提交即完成：建/复用引擎 → 补模型 → 存 Key → 选中。
//   · 校验放在数据层（面向导入/脚本等非表单入口也可复用），返回结构化结果而非抛错。
//   · 非法参数不阻止创建 —— 静默丢弃并用默认值（用户填了个越界的 temperature
//     不该让他丢掉整个引擎配置）。

/**
 * @typedef {Object} AddProviderWithKeyInput
 * @property {string} key         完整 API Key（必填）
 * @property {string} baseUrl     必填，须 http(s)
 * @property {string} modelId     必填，一个或多个（数组或逗号分隔）
 * @property {string} [label]     展示名，缺省用 baseUrl 的 host
 * @property {'openai'|'anthropic'} [protocol] 缺省 'openai'
 * @property {string} [chatPath]  缺省按协议给默认路径
 * @property {number|string} [maxTokens]
 * @property {number|string} [temperature]
 * @property {number|string} [topP]
 * @property {string|Object} [extraParams]
 *
 * @typedef {Object} AddProviderWithKeyResult
 * @property {boolean} ok
 * @property {string} error         ok=false 时的原因（面向用户的中文文案）
 * @property {object|null} provider 规整后的引擎
 * @property {string[]} models      本次并入的模型 ID
 * @property {boolean} reused       是否复用了同 baseUrl 的已有引擎
 * @property {string} providerId
 */

/**
 * 把 modelId 输入的多种形态（数组 / 逗号 / 中文逗号 / 换行）规整为字符串数组。
 * @param {*} raw
 * @returns {string[]}
 */
export function parseModelIds(raw) {
    const arr = Array.isArray(raw) ? raw : String(raw == null ? '' : raw).split(/[,\uFF0C\n]/);
    const out = [];
    const seen = new Set();
    for (const item of arr) {
        const t = String(item == null ? '' : item).trim();
        if (!t || seen.has(t)) continue;
        seen.add(t);
        out.push(t);
    }
    return out;
}

/**
 * 校验 baseUrl：必须 http(s)，且能被 URL 解析出 host。
 * 单独导出便于表单做「输入即校验」的即时反馈。
 *
 * v1.5.4 新增：拒绝把 **chat 路径** 写进 Base URL。
 *   这是实测中出现频率极高、且症状极具误导性的一种填错方式 ——
 *   用户从别处（API 文档、curl 示例、其它工具）复制地址时，常直接粘
 *   `https://api.example.com/v1/chat/completions`。此时 Base URL 本身
 *   语法完全合法，于是这里**曾经**放行，最后由协议层自动补路径拼成
 *   `/v1/chat/completions/chat/completions` 而 404。用户看到的是
 *   「Key 好用、模型也对，但就是 404」，极难自行定位。
 *   aiDiagnostics.checkBaseUrl 早已能识别这个陷阱，但那只是**叙述层**的
 *   提示 —— 等体检跑到那一步时，坏引擎早就建好了。现在把它前移到
 *   创建入口，让坏配置根本进不了库。
 * @param {string} baseUrl
 * @returns {{ ok:boolean, error:string, normalized:string }}
 */
export function validateBaseUrl(baseUrl) {
    const raw = String(baseUrl || '').trim();
    if (!raw) return { ok: false, error: '请填写 Base URL（形如 https://api.example.com/v1）', normalized: '' };
    if (!/^https?:\/\//i.test(raw)) {
        return { ok: false, error: 'Base URL 必须以 http:// 或 https:// 开头', normalized: '' };
    }
    let host = '';
    try { host = new URL(raw).host; } catch { /* 下面统一报错 */ }
    if (!host) return { ok: false, error: 'Base URL 无法解析出域名，请检查拼写', normalized: '' };
    const normalized = raw.replace(/\/+$/, '');
    // 只查路径尾部：域名里出现 `/v1` 是正常且必需的，不能误伤
    if (CHAT_PATH_SUFFIX_RE.test(normalized)) {
        return {
            ok: false,
            normalized: '',
            error: 'Base URL 末尾不要带 chat 路径（本应用会按协议自动补上），'
                + '否则会拼成 /v1/chat/completions/chat/completions 而 404。'
                + '请只保留到版本号，例如 https://api.example.com/v1'
        };
    }
    return { ok: true, error: '', normalized };
}

/**
 * 一体化添加（或更新）一个自定义引擎并入库 Key。
 *
 * 幂等语义：
 *   · 同 baseUrl 已有引擎 → 复用（不新建），把新模型并进去，label 缺省时不覆盖原值；
 *   · 这让「同一家中转站先加一把 Key、再加另一把」不会造出一堆重复引擎。
 *
 * @param {AddProviderWithKeyInput} input
 * @returns {AddProviderWithKeyResult}
 */
export function addCustomProviderWithKey(input = {}) {
    const key = String(input.key || '').trim();
    const v = validateBaseUrl(input.baseUrl);
    if (!v.ok) return { ok: false, error: v.error, provider: null, models: [], reused: false, providerId: '' };
    const models = parseModelIds(input.modelId);
    if (models.length === 0) {
        return { ok: false, error: '请至少填写一个模型 ID', provider: null, models: [], reused: false, providerId: '' };
    }
    // 完整 API Key 是必填的 —— 这正是本入口相对「自定义引擎」的差别
    if (!key) {
        return { ok: false, error: '请填写完整的 API Key', provider: null, models: [], reused: false, providerId: '' };
    }
    if (key.length < 8 || /\s/.test(key)) {
        return { ok: false, error: 'API Key 看起来不完整（不应包含空格，且至少 8 位）', provider: null, models: [], reused: false, providerId: '' };
    }

    const protocol = PROTOCOLS.includes(input.protocol) ? input.protocol : 'openai';
    const label = String(input.label || '').trim();
    const list = getCustomProviders();
    const norm = (u) => String(u || '').replace(/\/+$/, '').toLowerCase();
    const exist = list.find((p) => norm(p.baseUrl) === norm(v.normalized));

    const draft = {
        id: exist ? exist.id : makeCustomProviderId(),
        // 复用已有引擎时：label 留空表示「保留原值」，不静默改名
        label: label || (exist ? exist.label : ''),
        baseUrl: v.normalized,
        chatPath: String(input.chatPath || '').trim() || PROTOCOL_DEFAULT_CHAT_PATH[protocol],
        protocol,
        models: [],
        maxTokens: input.maxTokens,
        temperature: input.temperature,
        topP: input.topP,
        extraParams: input.extraParams
    };
    const normalized = _normalizeCustomProvider(draft);
    if (!normalized) {
        return { ok: false, error: '配置无法规整（请检查 Base URL 与协议）', provider: null, models: [], reused: false, providerId: '' };
    }
    // 合并模型：已有引擎保留原有模型，再并入新的
    const merged = [];
    const seen = new Set();
    for (const m of (exist ? exist.models : []).map((x) => x.id).concat(models)) {
        if (seen.has(m)) continue;
        seen.add(m);
        merged.push({ id: m });
    }
    normalized.models = merged.map((m) => ({ id: m.id, tier: 'cheap', jsonMode: null }));

    const next = exist
        ? list.map((p) => (p.id === exist.id ? _providerForStorage(normalized) : p))
        : list.concat([_providerForStorage(normalized)]);
    setCustomProviders(next);

    const provider = getCustomProviders().find((p) => p.id === normalized.id) || null;
    return {
        ok: true,
        error: '',
        provider,
        models: models.slice(),
        reused: !!exist,
        providerId: normalized.id
    };
}

/**
 * 把一把 Key 绑定到**任意** providerId（含自定义引擎）。
 * 与 aiKeyStore.setKeyProvider 的区别：后者按内置形状规则校验，不认自定义 id。
 * 本函数刻意不做白名单校验 —— 调用方（设置面板）已在创建前校验过引擎存在性，
 * 且自定义引擎的 id 是运行时生成的，无法在 store 层静态枚举。
 * @param {string} id   Key 条目 id
 * @param {string} providerId
 * @returns {boolean}
 */
export function bindKeyToProvider(id, providerId) {
    if (!id || !providerId) return false;
    // 动态 import 会形成循环依赖（aiKeyStore 反向 import 本模块），
    // 因此这里改为惰性读取调用方注入的绑定器，见 registerKeyBinder。
    if (typeof _keyBinder === 'function') return _keyBinder(id, providerId);
    return false;
}

let _keyBinder = null;

/** 由主要调用方（settingsCenter / main）注入真正的 Key 绑定实现，避免循环依赖 */
export function registerKeyBinder(fn) {
    _keyBinder = (typeof fn === 'function') ? fn : null;
}

// ---------------------------------------------------------------------------
// 公开 API
// ---------------------------------------------------------------------------

/**
 * 返回全部引擎：内置注册表 + 用户自定义引擎。
 * 需要「完整清单」时用它；需要「内置清单」（如冒烟脚本、CSP 白名单校验）时用 PROVIDERS。
 */
export function listProviders() {
    return PROVIDERS.concat(getCustomProviders());
}

/** 按 id 取引擎（先内置后自定义）；不存在返回 null。 */
export function getProvider(id) {
    if (!id) return null;
    return PROVIDERS.find((p) => p.id === id)
        || getCustomProviders().find((p) => p.id === id)
        || null;
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

// ---------------------------------------------------------------------------
// v1.5.6：引擎 / 模型的「参与自动优选」开关
// ---------------------------------------------------------------------------
// 语义（必须精确，不要含糊成「启用 / 停用」）：
//   · 关闭某个引擎 = 它**不参与自动优选**（pickBestKey 的候选池里排除它的 Key）。
//     用户显式选中它的 Key 时仍然可用 —— 这不是「禁用」，是「别自动挑它」。
//     典型场景：手上有 20 把 Key，其中某家中转站不稳定，但不想删掉它。
//   · 关闭某个模型 = 该引擎下这个模型不参与自动优选。
//     典型场景：某款免费模型实测很慢（注册表里标了 slow），不想被自动挑中。
//   · 若某次候选**全部**被排除，pickBestKey 会回退到全量候选 ——
//     避免「用户把唯一的引擎关掉 → 自动选择彻底失效」这种更糟的结果。
//
// 存储：两个非密钥键，明文 localStorage 可接受（与 ai_custom_providers 同级）。
//   只存「被关闭的」，默认全开 —— 这样新增引擎天然是开启的，无需迁移。
const DISABLED_PROVIDERS_KEY = 'ai_providers_disabled';
const DISABLED_MODELS_KEY = 'ai_models_disabled';

/** 模型级开关的复合键（providerId::modelId） */
function _modelKey(providerId, modelId) {
    return String(providerId || '') + '::' + String(modelId || '');
}

/** 读一个字符串数组型存储键（损坏时视为空） */
function _readIdList(storageKey) {
    const ls = _ls();
    if (!ls) return [];
    try {
        const raw = ls.getItem(storageKey);
        const arr = raw ? JSON.parse(raw) : [];
        if (!Array.isArray(arr)) return [];
        return arr.filter((x) => typeof x === 'string' && x);
    } catch { return []; }
}

function _writeIdList(storageKey, list) {
    const ls = _ls();
    if (!ls) return;
    try {
        if (list.length === 0) ls.removeItem(storageKey);
        else ls.setItem(storageKey, JSON.stringify(list));
    } catch { /* 配额 / 隐私模式：内存态由调用方缓存兜底 */ }
}

/** 被关闭（不参与自动优选）的引擎 id 列表 */
export function getDisabledProviderIds() {
    return _readIdList(DISABLED_PROVIDERS_KEY);
}

/** 该引擎是否参与自动优选（默认 true） */
export function isProviderEnabled(id) {
    if (!id) return true;
    return !getDisabledProviderIds().includes(String(id));
}

/**
 * 设置引擎是否参与自动优选。
 * @param {string} id
 * @param {boolean} enabled
 * @returns {boolean} 写入后的状态
 */
export function setProviderEnabled(id, enabled) {
    const pid = String(id || '');
    if (!pid) return true;
    const cur = getDisabledProviderIds();
    const next = enabled ? cur.filter((x) => x !== pid) : (cur.includes(pid) ? cur : cur.concat([pid]));
    _writeIdList(DISABLED_PROVIDERS_KEY, next);
    return !!enabled;
}

/** 被关闭的模型复合键列表（providerId::modelId） */
export function getDisabledModelKeys() {
    return _readIdList(DISABLED_MODELS_KEY);
}

/** 该模型是否参与自动优选（默认 true） */
export function isModelEnabled(providerId, modelId) {
    if (!providerId || !modelId) return true;
    return !getDisabledModelKeys().includes(_modelKey(providerId, modelId));
}

/**
 * 设置模型是否参与自动优选。
 * @param {string} providerId
 * @param {string} modelId
 * @param {boolean} enabled
 * @returns {boolean} 写入后的状态
 */
export function setModelEnabled(providerId, modelId, enabled) {
    const k = _modelKey(providerId, modelId);
    if (k === '::') return true;
    const cur = getDisabledModelKeys();
    const next = enabled ? cur.filter((x) => x !== k) : (cur.includes(k) ? cur : cur.concat([k]));
    _writeIdList(DISABLED_MODELS_KEY, next);
    return !!enabled;
}

/**
 * 一把 Key 是否可进入「自动优选」候选池。
 *
 * ⚠ 只在归属**确定**时才应用引擎/模型开关：
 *   · explicit —— 用户显式指定过 providerId；
 *   · shape    —— 形状唯一可判定（如 ark- / ms- / sk-or-v1-）。
 *   前缀兜底（fallback，如 sk- → deepseek）**不算确定**：它是猜的，
 *   按猜测的归属去过滤会放大那个猜测的错误 —— 一把 Moonshot 的 sk- Key
 *   会因为「用户关掉了 DeepSeek」而被排除在优选之外，而它本来就不是 DeepSeek 的。
 *   这类 Key 的归属由控制台的「归属待确认」流程负责，不在这里按猜测过滤。
 *
 * 因此本函数**不能**用 resolveProviderId（它带兜底），必须用 detectProviderId。
 *
 * @param {{key?:string, providerId?:string, modelId?:string}} entry
 * @returns {boolean}
 */
export function isEntrySelectable(entry) {
    if (!entry || typeof entry.key !== 'string' || !entry.key) return false;
    const pid = entry.providerId || detectProviderId(entry.key);
    if (!pid) return true;                       // 归属不确定 → 不因开关被排除
    if (!isProviderEnabled(pid)) return false;
    if (entry.modelId && !isModelEnabled(pid, entry.modelId)) return false;
    return true;
}

// ---------------------------------------------------------------------------
// v1.5.6：自定义引擎的模型增删改
// ---------------------------------------------------------------------------

/**
 * 更新自定义引擎下某个模型的元数据。
 * @param {string} providerId
 * @param {string} modelId
 * @param {{tier?:string, jsonMode?:boolean|null, fullCheck?:boolean, slow?:boolean}} patch
 * @returns {boolean} 是否命中
 */
export function updateCustomModel(providerId, modelId, patch = {}) {
    const pid = String(providerId || '');
    const mid = String(modelId || '').trim();
    if (!pid || !mid) return false;
    const list = getCustomProviders();
    const target = list.find((x) => x.id === pid);
    if (!target) return false;
    if (!target.models.some((m) => m.id === mid)) return false;

    const next = list.map((x) => {
        if (x.id !== pid) return x;
        return _providerForStorage({
            ...x,
            models: x.models.map((m) => (m.id === mid
                ? _normalizeModelMeta(mid, { ...m, ...patch })
                : m))
        });
    });
    setCustomProviders(next);
    return true;
}

/**
 * 从自定义引擎删除一个模型。
 * ⚠ 同时清掉它的模型级开关，否则「同 id 再加回来」会带着旧的关闭状态，
 *   表现为「重新添加的模型莫名其妙不参与自动优选」。
 * @param {string} providerId
 * @param {string} modelId
 * @returns {boolean} 是否真的删掉了
 */
export function removeCustomModel(providerId, modelId) {
    const pid = String(providerId || '');
    const mid = String(modelId || '').trim();
    if (!pid || !mid) return false;
    const list = getCustomProviders();
    const target = list.find((x) => x.id === pid);
    if (!target || !target.models.some((m) => m.id === mid)) return false;
    setCustomProviders(list.map((x) => (x.id === pid
        ? _providerForStorage({ ...x, models: x.models.filter((m) => m.id !== mid) })
        : x)));
    setModelEnabled(pid, mid, true);
    return true;
}

/**
 * 重命名自定义引擎下的模型（改 ID）。
 * 保留原元数据；目标 ID 已存在时拒绝（避免静默合并两条）。
 * ⚠ 同时把模型级开关迁移到新 ID，否则改名后「关闭状态」会丢失。
 * @param {string} providerId
 * @param {string} oldId
 * @param {string} newId
 * @returns {{ok:boolean, error?:string}}
 */
export function renameCustomModel(providerId, oldId, newId) {
    const pid = String(providerId || '');
    const from = String(oldId || '').trim();
    const to = String(newId || '').trim();
    if (!pid || !from || !to) return { ok: false, error: '模型 ID 不能为空' };
    if (from === to) return { ok: true };
    const list = getCustomProviders();
    const target = list.find((x) => x.id === pid);
    if (!target) return { ok: false, error: '引擎不存在' };
    const hit = target.models.find((m) => m.id === from);
    if (!hit) return { ok: false, error: '模型不存在' };
    if (target.models.some((m) => m.id === to)) return { ok: false, error: `模型「${to}」已存在` };

    setCustomProviders(list.map((x) => (x.id === pid
        ? _providerForStorage({
            ...x,
            models: x.models.map((m) => (m.id === from ? _normalizeModelMeta(to, m) : m))
        })
        : x)));
    // 迁移开关状态
    const wasEnabled = isModelEnabled(pid, from);
    setModelEnabled(pid, from, true);
    setModelEnabled(pid, to, wasEnabled);
    return { ok: true };
}

/**
 * 重命名自定义供应商。
 *
 * 为什么需要它：`addCustomProviderWithKey` 虽然能带 label，但那只在**创建/复用**时生效；
 * 一旦引擎建好，界面上就再没有改名的入口 —— 用户拼错名字后只能删掉重建，
 * 而重建会连带丢掉该引擎下的全部模型元数据。
 *
 * @param {string} providerId
 * @param {string} label 新名称（空白则拒绝，避免把名字清成空串）
 * @returns {{ok:boolean, error?:string}}
 */
export function renameCustomProvider(providerId, label) {
    const pid = String(providerId || '');
    const name = String(label || '').trim();
    if (!pid) return { ok: false, error: '供应商不存在' };
    if (!name) return { ok: false, error: '名称不能为空' };
    if (name.length > 40) return { ok: false, error: '名称过长（最多 40 个字符）' };
    const list = getCustomProviders();
    const hit = list.find((p) => p.id === pid);
    if (!hit) return { ok: false, error: '供应商不存在（只有自定义供应商可以改名）' };
    if (hit.label === name) return { ok: true };
    setCustomProviders(list.map((p) => (p.id === pid ? _providerForStorage({ ...p, label: name }) : p)));
    return { ok: true };
}

// ---------------------------------------------------------------------------
// v1.5.6：删除自定义供应商（连带把它名下的 Key 退回「未指定引擎」）
// ---------------------------------------------------------------------------

/**
 * 删除一个自定义供应商，并把它名下的 Key 退回「未指定引擎」。
 *
 * 为什么必须连带处理 Key（不只是把引擎从列表里删掉）：
 *   `entry.providerId` 存的是引擎 id。引擎没了之后：
 *     · `getProvider('custom_N')` 返回 null → `buildModel` 按 pid 分组失败，
 *       这些 Key **在左栏彻底消失**，用户会以为 Key 被一起删了；
 *     · 残留的 id 还会让 `classifyKey` 判成 `explicit` 归属，
 *       于是既进不了「归属待确认」分组，也没有任何入口能救回来 —— 死数据。
 *   而 UI 文案一直写着「引用它的 Key 会退回『未指定引擎』」，实际没退。
 *
 * ⚠ 本函数**不自己写 store**：aiProviders 不依赖 aiKeyStore（见 docs/模块依赖边界.md），
 *   Key 的写入由调用方注入。缺省 `writeProvider` 时只做引擎删除（兼容只用 list 的场景），
 *   此时 `detached` 恒为 0，调用方可用它判断是否需要自行回退归属。
 *
 * @param {string} providerId
 * @param {readonly<{id:string, providerId?:string, modelId?:string, key:string}>[]} keys 全部 Key
 * @param {(entryId:string, providerId:string)=>boolean} writeProvider 写入归属（传 '' = 清空）
 * @returns {{ok:boolean, error?:string, detached:number}} detached = 被退回归属的 Key 数
 */
export function removeCustomProvider(providerId, keys, writeProvider) {
    const pid = String(providerId || '');
    if (!pid) return { ok: false, error: '供应商不存在', detached: 0 };
    const list = getCustomProviders();
    if (!list.some((p) => p.id === pid)) {
        return { ok: false, error: '供应商不存在（只有自定义供应商可以删除）', detached: 0 };
    }
    let detached = 0;
    if (typeof writeProvider === 'function' && Array.isArray(keys)) {
        for (const entry of keys) {
            if (!entry || entry.providerId !== pid) continue;
            if (writeProvider(entry.id, '')) detached++;
        }
    }
    setCustomProviders(list.filter((p) => p.id !== pid));
    return { ok: true, error: '', detached };
}
