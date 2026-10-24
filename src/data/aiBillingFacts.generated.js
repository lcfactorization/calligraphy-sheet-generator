// ⚠ 生成物，请勿手改 —— node scripts/generate-provider-catalog.mjs
// 计费事实（zone/kind/quota）。quota 每条都带 https 出处与核实日期；无出处=不写=付费区。
// 实测日期 2026-10-09，定价快照来源 models.dev。
export const BILLING_FACTS = {
  "agnes": {
    "zone": "paid",
    "kind": "unknown",
    "quota": [],
    "priceSource": "models.dev",
    "priceAsOf": "2026-10-09"
  },
  "apinex": {
    "zone": "paid",
    "kind": "unknown",
    "quota": [],
    "priceSource": "models.dev",
    "priceAsOf": "2026-10-09"
  },
  "dashscope": {
    "zone": "paid",
    "kind": "new-user-credits",
    "quota": [
      {
        "detail": "官方「新人免费额度」文档：首次开通百炼由系统自动发放各模型新人额度，每个模型独立、通常 100 万 Token，有效期 90 天；仅华北 2（北京）地域模型有免费额度，其它地域无；带日期快照版本与最新版本算两个模型各有一份额度；额度耗尽后已认证用户自动转按量付费，可开「用完即停」避免意外扣费（未认证用户强制该模式，返回 403 AllocationQuota.FreeTierOnly）。",
        "source": "https://help.aliyun.com/zh/model-studio/new-free-quota",
        "asOf": "2026-10-09",
        "verified": true
      }
    ],
    "priceSource": "models.dev",
    "priceAsOf": "2026-10-09"
  },
  "deepseek": {
    "zone": "paid",
    "kind": "unknown",
    "quota": [],
    "priceSource": "models.dev",
    "priceAsOf": "2026-10-09"
  },
  "gemini": {
    "zone": "free",
    "kind": "free-tier-rate-limited",
    "quota": [
      {
        "detail": "官方速率限制页列出「使用层级：免费」，资格条件为「有效项目或免费试用」，即无需绑定结算账号即可调用；基于支出的速率限制对免费层级「不适用」。每模型每分钟/每天的具体上限页面写成「随层级变化，需在 Google AI Studio 中查看」，官方页面未公开固定数字，故此处不臆造数值。",
        "source": "https://ai.google.dev/gemini-api/docs/rate-limits",
        "asOf": "2026-10-09",
        "verified": true
      }
    ],
    "priceSource": "models.dev",
    "priceAsOf": "2026-10-09"
  },
  "groq": {
    "zone": "free",
    "kind": "free-tier-rate-limited",
    "quota": [
      {
        "detail": "官方 rate-limits 页 Free Plan Limits 表逐模型给数：openai/gpt-oss-120b 为 30 RPM / 1K RPD / 8K TPM / 200K TPD；同表内多数免费档模型为 10～30 RPM、100～1K RPD 一档（以该页表格为准，逐模型不同）。",
        "source": "https://console.groq.com/docs/rate-limits",
        "asOf": "2026-10-09",
        "verified": true
      }
    ],
    "priceSource": "models.dev",
    "priceAsOf": "2026-10-09"
  },
  "hunyuan": {
    "zone": "paid",
    "kind": "new-user-credits",
    "quota": [
      {
        "detail": "官方 TokenHub「新人免费体验包」文档（更新于 2026-09-04）：所有语言模型各 100 万 Tokens 免费体验额度、有效期 1 年；多模态理解模型同样 100 万 Tokens/1 年；每个主账号仅一次，支持模型广场/启用管理领取或首次调用自动领取；调用时优先消耗免费额度，用尽且未开后付费则服务停止。本期活动时间截至 2026-12-31。",
        "source": "https://cloud.tencent.com/document/product/1823/130053",
        "asOf": "2026-10-09",
        "verified": true
      }
    ],
    "priceSource": "models.dev",
    "priceAsOf": "2026-10-09"
  },
  "minimax": {
    "zone": "paid",
    "kind": "unknown",
    "quota": [],
    "priceSource": "models.dev",
    "priceAsOf": "2026-10-09"
  },
  "modelscope": {
    "zone": "free",
    "kind": "free-tier-rate-limited",
    "quota": [
      {
        "detail": "官方文档：「API-Inference 面向 ModelScope 注册用户免费提供，请在登录后获取您专属的访问令牌（Access Token）」；注意「账号注册后需绑定阿里云账号，并通过实名认证后才可使用 API-Inference」。该页只写「具体额度请关注使用限制说明」，未列每日次数，故此处不臆造数值。",
        "source": "https://modelscope.cn/docs/model-service/API-Inference/intro",
        "asOf": "2026-10-09",
        "verified": true
      }
    ],
    "priceSource": "models.dev",
    "priceAsOf": "2026-10-09"
  },
  "moonshot": {
    "zone": "paid",
    "kind": "unknown",
    "quota": [],
    "priceSource": "models.dev",
    "priceAsOf": "2026-10-09"
  },
  "openrouter": {
    "zone": "free",
    "kind": "free-tier-rate-limited",
    "quota": [
      {
        "detail": "官方 Limits 文档「Free usage limits」：模型 ID 以 :free 结尾的免费变体可用；免费模型统一 20 RPM，历史充值低于阈值的账号 50 请求/天（FREE_MODEL_NO_CREDITS_RPD），达到阈值后 1000 请求/天（FREE_MODEL_HAS_CREDITS_RPD）。当前档位与剩余量可用 GET /api/v1/key 的 free_model_daily_requests.{used,allowed,remaining} 查询；负余额账号调用免费模型同样报错。",
        "source": "https://openrouter.ai/docs/api-reference/limits",
        "asOf": "2026-10-09",
        "verified": true
      }
    ],
    "priceSource": "models.dev",
    "priceAsOf": "2026-10-09"
  },
  "qianfan": {
    "zone": "paid",
    "kind": "new-user-credits",
    "quota": [
      {
        "detail": "官方「新用户免费额度」文档（更新于 2025-11-17）：2025-10-24 0 点起同意用户协议即自动开通并发放新用户免费 Tokens，指定模型各 100 万 Tokens、有效期 3 个月；仅抵扣预置模型在线推理，不支持批量推理；剩余额度在控制台模型广场/计费详情查看。",
        "source": "https://cloud.baidu.com/doc/qianfan/s/Imi2rpirg",
        "asOf": "2026-10-09",
        "verified": true
      }
    ],
    "priceSource": "models.dev",
    "priceAsOf": "2026-10-09"
  },
  "radeon": {
    "zone": "free",
    "kind": "free-endpoint",
    "quota": [
      {
        "detail": "官方页面「Public Free Model APIs —— 9 models, Ready-to-use free API endpoints」：免费端点标注 FREE，含 MiMo-V2.6-Flash、DeepSeek-V4.1-Flash、DeepSeek-V4-Flash-0731 等；同一 Key 通用，改 model 即可切换。共享端点按 Key + IP 限流并设每日消耗上限。",
        "source": "https://developer.amd.com.cn/radeon/tokenfactory",
        "asOf": "2026-10-09",
        "verified": true
      }
    ],
    "priceSource": "models.dev",
    "priceAsOf": "2026-10-09"
  },
  "sensenova": {
    "zone": "free",
    "kind": "free-tier-rate-limited",
    "quota": [
      {
        "detail": "官方 Token Plan 页：「公测期完全免费开放，付费档位即将上线」，Free·公测档 ¥0/月，60,000 积分 / 5 小时，含 SenseNova 6.8 Flash Lite、U1 Fast。属公测期免费，随时可能转付费。",
        "source": "https://www.sensenova.cn/token-plan",
        "asOf": "2026-10-09",
        "verified": true
      }
    ],
    "priceSource": "models.dev",
    "priceAsOf": "2026-10-09"
  },
  "siliconflow": {
    "zone": "free",
    "kind": "free-endpoint",
    "quota": [
      {
        "detail": "官方计费规则页价格表把多个模型直接标注「免费」（如 Qwen/Qwen2-7B-Instruct、Qwen/Qwen2-1.5B-Instruct、Qwen/Qwen1.5-7B-Chat、THUDM/glm-4-9b-chat、THUDM/chatglm3-6b、01-ai/Yi-1.5-9B-Chat-16K、01-ai/Yi-1.5-6B-Chat）。",
        "source": "https://docs.siliconflow.com/cn/faqs/billing-rules",
        "asOf": "2026-10-09",
        "verified": true
      },
      {
        "detail": "同页：「新用户注册即得 14 元免费额度（相当于 2 千万 Qwen1.5-14B Tokens）」；按量计费时费用优先从赠送额度中扣减。",
        "source": "https://docs.siliconflow.com/cn/faqs/billing-rules",
        "asOf": "2026-10-09",
        "verified": true
      }
    ],
    "priceSource": "models.dev",
    "priceAsOf": "2026-10-09"
  },
  "stepfun": {
    "zone": "paid",
    "kind": "limited-time-free",
    "quota": [
      {
        "detail": "官方计费明细页：stepaudio-3-realtime-preview / stepaudio-3-chat-preview / stepaudio-3-gen-preview / stepaudio-3-music-preview 标注「限时免费」（step-2x-large 已于 2026-06-12 结束限时免费，转 0.1 元/张）；限速按用户等级，V0（累计充值不足 ¥100）为并发 5、100 RPM、500,000 TPM。个人账户需实名认证。",
        "source": "https://platform.stepfun.com/docs/zh/guides/pricing/details",
        "asOf": "2026-10-09",
        "verified": true
      }
    ],
    "priceSource": "models.dev",
    "priceAsOf": "2026-10-09"
  },
  "volcano": {
    "zone": "paid",
    "kind": "limited-time-free",
    "quota": [
      {
        "detail": "火山方舟产品页：「领每日单模型最高 500 万免费 Tokens」/「协作奖励计划二期全面升级，免费每日领取单模型最高 500 万 Tokens」—— 活动领取制、按天发放，主体仍为按量付费（Doubao-Seed-Evolving 6 元/百万输入 tokens、30 元/百万输出 tokens）；另有方舟 Agent Plan 订阅套餐（首月 9.9 元起）。",
        "source": "https://www.volcengine.com/product/ark",
        "asOf": "2026-10-09",
        "verified": true
      }
    ],
    "priceSource": "models.dev",
    "priceAsOf": "2026-10-09"
  },
  "zhipu": {
    "zone": "free",
    "kind": "free-endpoint",
    "quota": [
      {
        "detail": "官方定价页 FAQ 明确：智谱开放平台提供免费 API 模型 —— 文本模型 GLM-4.7-Flash（200K 上下文）输入免费、输出免费、缓存免费；视觉模型 GLM-4.6V-Flash 输入/输出/缓存同样全免。此外多数付费模型的「缓存存储」为限时免费。",
        "source": "https://bigmodel.cn/pricing",
        "asOf": "2026-10-09",
        "verified": true
      }
    ],
    "priceSource": "models.dev",
    "priceAsOf": "2026-10-09"
  }
};
