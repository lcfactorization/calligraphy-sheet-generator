// ⚠ 生成物，请勿手改 —— node scripts/generate-provider-catalog.mjs
// 输入：models.dev 快照(sha256 9d0280a6a7399f7b) + 浏览器直连实测(2026-10-09) + scripts/provider-catalog-override.json
// 内联厂商 24 家（全部实测 DIRECT-CONFIRMED）；全量目录见 public/ai-providers.json
export const GENERATED_PROVIDERS = [
  {
    "id": "302ai",
    "label": "302.AI",
    "baseUrl": "https://api.302.ai/v1",
    "protocol": "openai",
    "chatPath": "/chat/completions",
    "modelsPath": "/models",
    "authStyle": "bearer",
    "signupUrl": "https://doc.302.ai",
    "envVarNames": [
      "302AI_API_KEY"
    ],
    "docUrl": "https://doc.302.ai",
    "billing": {
      "zone": "paid",
      "kind": "unknown",
      "quota": [],
      "priceSource": "models.dev",
      "priceAsOf": "2026-10-09"
    },
    "direct": {
      "verdict": "DIRECT-CONFIRMED",
      "status": 401,
      "probedAt": "2026-10-09"
    },
    "models": [
      {
        "id": "qwen3.5-35b-a3b",
        "tier": "cheap",
        "jsonMode": null,
        "fullCheck": false,
        "price": {
          "input": 0.06,
          "output": 0.46
        },
        "zeroPrice": false,
        "context": 262144,
        "provenance": "snapshot+override"
      },
      {
        "id": "glm-5.3-flash",
        "tier": "cheap",
        "jsonMode": null,
        "fullCheck": false,
        "price": {
          "input": 0.075,
          "output": 0.25
        },
        "zeroPrice": false,
        "context": 1000000,
        "provenance": "snapshot+override"
      },
      {
        "id": "gemini-2.0-flash-lite",
        "tier": "cheap",
        "jsonMode": null,
        "fullCheck": false,
        "price": {
          "input": 0.075,
          "output": 0.3
        },
        "zeroPrice": false,
        "context": 2000000,
        "provenance": "snapshot+override"
      }
    ]
  },
  {
    "id": "abacus",
    "label": "Abacus",
    "baseUrl": "https://routellm.abacus.ai/v1",
    "protocol": "openai",
    "chatPath": "/chat/completions",
    "modelsPath": "/models",
    "authStyle": "bearer",
    "signupUrl": "https://abacus.ai/help/api",
    "envVarNames": [
      "ABACUS_API_KEY"
    ],
    "docUrl": "https://abacus.ai/help/api",
    "billing": {
      "zone": "paid",
      "kind": "unknown",
      "quota": [],
      "priceSource": "models.dev",
      "priceAsOf": "2026-10-09"
    },
    "direct": {
      "verdict": "DIRECT-CONFIRMED",
      "status": 403,
      "probedAt": "2026-10-09"
    },
    "models": [
      {
        "id": "meta-llama/Meta-Llama-3.1-8B-Instruct",
        "tier": "cheap",
        "jsonMode": null,
        "fullCheck": false,
        "price": {
          "input": 0.02,
          "output": 0.05
        },
        "zeroPrice": false,
        "context": 128000,
        "provenance": "snapshot+override"
      },
      {
        "id": "gpt-5-nano",
        "tier": "cheap",
        "jsonMode": null,
        "fullCheck": false,
        "price": {
          "input": 0.05,
          "output": 0.4,
          "cacheRead": 0.005
        },
        "zeroPrice": false,
        "context": 400000,
        "provenance": "snapshot+override"
      },
      {
        "id": "openai/gpt-oss-120b",
        "tier": "cheap",
        "jsonMode": null,
        "fullCheck": false,
        "price": {
          "input": 0.08,
          "output": 0.44
        },
        "zeroPrice": false,
        "context": 128000,
        "provenance": "snapshot+override"
      }
    ]
  },
  {
    "id": "ai21",
    "label": "AI21 Labs",
    "baseUrl": "https://api.ai21.com/studio/v1",
    "protocol": "openai",
    "chatPath": "/chat/completions",
    "modelsPath": "/models",
    "authStyle": "bearer",
    "signupUrl": "https://docs.ai21.com/docs/jamba-foundation-models",
    "envVarNames": [
      "AI21_API_KEY"
    ],
    "docUrl": "https://docs.ai21.com/docs/jamba-foundation-models",
    "billing": {
      "zone": "paid",
      "kind": "unknown",
      "quota": [],
      "priceSource": "models.dev",
      "priceAsOf": "2026-10-09"
    },
    "direct": {
      "verdict": "DIRECT-CONFIRMED",
      "status": 401,
      "probedAt": "2026-10-09"
    },
    "models": [
      {
        "id": "jamba-mini",
        "tier": "cheap",
        "jsonMode": null,
        "fullCheck": false,
        "price": {
          "input": 0.2,
          "output": 0.4
        },
        "zeroPrice": false,
        "context": 256000,
        "provenance": "snapshot+override"
      }
    ]
  },
  {
    "id": "alibaba",
    "label": "Alibaba",
    "baseUrl": "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
    "protocol": "openai",
    "chatPath": "/chat/completions",
    "modelsPath": "/models",
    "authStyle": "bearer",
    "signupUrl": "https://www.alibabacloud.com/help/en/model-studio/models",
    "envVarNames": [
      "DASHSCOPE_API_KEY"
    ],
    "docUrl": "https://www.alibabacloud.com/help/en/model-studio/models",
    "billing": {
      "zone": "paid",
      "kind": "unknown",
      "quota": [],
      "priceSource": "models.dev",
      "priceAsOf": "2026-10-09"
    },
    "direct": {
      "verdict": "DIRECT-CONFIRMED",
      "status": 401,
      "probedAt": "2026-10-09"
    },
    "models": [
      {
        "id": "qwen3.7-flash",
        "tier": "cheap",
        "jsonMode": null,
        "fullCheck": false,
        "price": {
          "input": 0.03,
          "output": 0.13,
          "cacheRead": 0.003,
          "cacheWrite": 0.0375
        },
        "zeroPrice": false,
        "context": 1000000,
        "provenance": "snapshot+override"
      },
      {
        "id": "qwen-flash",
        "tier": "cheap",
        "jsonMode": null,
        "fullCheck": false,
        "price": {
          "input": 0.05,
          "output": 0.4
        },
        "zeroPrice": false,
        "context": 1000000,
        "provenance": "snapshot+override"
      }
    ]
  },
  {
    "id": "bailing",
    "label": "Bailing",
    "baseUrl": "https://api.tbox.cn/api/llm/v1",
    "protocol": "openai",
    "chatPath": "/chat/completions",
    "modelsPath": "/models",
    "authStyle": "bearer",
    "signupUrl": "https://alipaytbox.yuque.com/sxs0ba/ling/intro",
    "envVarNames": [
      "BAILING_API_TOKEN"
    ],
    "docUrl": "https://alipaytbox.yuque.com/sxs0ba/ling/intro",
    "billing": {
      "zone": "paid",
      "kind": "unknown",
      "quota": [],
      "priceSource": "models.dev",
      "priceAsOf": "2026-10-09"
    },
    "direct": {
      "verdict": "DIRECT-CONFIRMED",
      "status": 401,
      "probedAt": "2026-10-09"
    },
    "models": [
      {
        "id": "Ling-1T",
        "tier": "paid",
        "jsonMode": null,
        "fullCheck": false,
        "price": {
          "input": 0.57,
          "output": 2.29
        },
        "zeroPrice": false,
        "context": 128000,
        "provenance": "snapshot+override"
      },
      {
        "id": "Ring-1T",
        "tier": "paid",
        "jsonMode": null,
        "fullCheck": false,
        "price": {
          "input": 0.57,
          "output": 2.29
        },
        "zeroPrice": false,
        "context": 128000,
        "provenance": "snapshot+override"
      }
    ]
  },
  {
    "id": "fireworks-ai",
    "label": "Fireworks AI",
    "baseUrl": "https://api.fireworks.ai/inference/v1",
    "protocol": "openai",
    "chatPath": "/chat/completions",
    "modelsPath": "/models",
    "authStyle": "bearer",
    "signupUrl": "https://fireworks.ai/docs/",
    "envVarNames": [
      "FIREWORKS_API_KEY"
    ],
    "docUrl": "https://fireworks.ai/docs/",
    "billing": {
      "zone": "paid",
      "kind": "unknown",
      "quota": [],
      "priceSource": "models.dev",
      "priceAsOf": "2026-10-09"
    },
    "direct": {
      "verdict": "DIRECT-CONFIRMED",
      "status": 404,
      "probedAt": "2026-10-09"
    },
    "models": [
      {
        "id": "accounts/fireworks/models/nemotron-lightning-3p5-30b-a3b",
        "tier": "cheap",
        "jsonMode": null,
        "fullCheck": false,
        "price": {
          "input": 0.05,
          "output": 0.2,
          "cacheRead": 0.01
        },
        "zeroPrice": false,
        "context": 262144,
        "provenance": "snapshot+override"
      },
      {
        "id": "accounts/fireworks/models/gpt-oss-120b",
        "tier": "cheap",
        "jsonMode": null,
        "fullCheck": false,
        "price": {
          "input": 0.15,
          "output": 0.6,
          "cacheRead": 0.015
        },
        "zeroPrice": false,
        "context": 131072,
        "provenance": "snapshot+override"
      }
    ]
  },
  {
    "id": "huggingface",
    "label": "Hugging Face",
    "baseUrl": "https://router.huggingface.co/v1",
    "protocol": "openai",
    "chatPath": "/chat/completions",
    "modelsPath": "/models",
    "authStyle": "bearer",
    "signupUrl": "https://huggingface.co/docs/inference-providers",
    "envVarNames": [
      "HF_TOKEN"
    ],
    "docUrl": "https://huggingface.co/docs/inference-providers",
    "billing": {
      "zone": "paid",
      "kind": "unknown",
      "quota": [],
      "priceSource": "models.dev",
      "priceAsOf": "2026-10-09"
    },
    "direct": {
      "verdict": "DIRECT-CONFIRMED",
      "status": 401,
      "probedAt": "2026-10-09"
    },
    "models": [
      {
        "id": "zai-org/GLM-4.7-Flash",
        "tier": "paid",
        "jsonMode": null,
        "fullCheck": false,
        "price": {
          "input": 0,
          "output": 0
        },
        "zeroPrice": true,
        "context": 200000,
        "provenance": "snapshot+override"
      },
      {
        "id": "google/gemma-3-12b-it",
        "tier": "cheap",
        "jsonMode": null,
        "fullCheck": false,
        "price": {
          "input": 0.05,
          "output": 0.15
        },
        "zeroPrice": false,
        "context": 131072,
        "provenance": "snapshot+override"
      },
      {
        "id": "XiaomiMiMo/MiMo-V2-Flash",
        "tier": "cheap",
        "jsonMode": null,
        "fullCheck": false,
        "price": {
          "input": 0.1,
          "output": 0.3
        },
        "zeroPrice": false,
        "context": 262144,
        "provenance": "snapshot+override"
      }
    ]
  },
  {
    "id": "iflowcn",
    "label": "iFlow",
    "baseUrl": "https://apis.iflow.cn/v1",
    "protocol": "openai",
    "chatPath": "/chat/completions",
    "modelsPath": "/models",
    "authStyle": "bearer",
    "signupUrl": "https://platform.iflow.cn/en/docs",
    "envVarNames": [
      "IFLOW_API_KEY"
    ],
    "docUrl": "https://platform.iflow.cn/en/docs",
    "billing": {
      "zone": "paid",
      "kind": "unknown",
      "quota": [],
      "priceSource": "models.dev",
      "priceAsOf": "2026-10-09"
    },
    "direct": {
      "verdict": "DIRECT-CONFIRMED",
      "status": 200,
      "probedAt": "2026-10-09"
    },
    "models": [
      {
        "id": "qwen3-max",
        "tier": "paid",
        "jsonMode": null,
        "fullCheck": false,
        "price": {
          "input": 0,
          "output": 0
        },
        "zeroPrice": true,
        "context": 256000,
        "provenance": "snapshot+override"
      },
      {
        "id": "deepseek-v3",
        "tier": "paid",
        "jsonMode": null,
        "fullCheck": false,
        "price": {
          "input": 0,
          "output": 0
        },
        "zeroPrice": true,
        "context": 128000,
        "provenance": "snapshot+override"
      },
      {
        "id": "kimi-k2",
        "tier": "paid",
        "jsonMode": null,
        "fullCheck": false,
        "price": {
          "input": 0,
          "output": 0
        },
        "zeroPrice": true,
        "context": 128000,
        "provenance": "snapshot+override"
      }
    ]
  },
  {
    "id": "jiekou",
    "label": "Jiekou.AI",
    "baseUrl": "https://api.jiekou.ai/openai",
    "protocol": "openai",
    "chatPath": "/chat/completions",
    "modelsPath": "/models",
    "authStyle": "bearer",
    "signupUrl": "https://docs.jiekou.ai/docs/support/quickstart?utm_source=github_models.dev",
    "envVarNames": [
      "JIEKOU_API_KEY"
    ],
    "docUrl": "https://docs.jiekou.ai/docs/support/quickstart?utm_source=github_models.dev",
    "billing": {
      "zone": "paid",
      "kind": "unknown",
      "quota": [],
      "priceSource": "models.dev",
      "priceAsOf": "2026-10-09"
    },
    "direct": {
      "verdict": "DIRECT-CONFIRMED",
      "status": 401,
      "probedAt": "2026-10-09"
    },
    "models": [
      {
        "id": "xiaomimimo/mimo-v2-flash",
        "tier": "paid",
        "jsonMode": null,
        "fullCheck": false,
        "price": {
          "input": 0,
          "output": 0
        },
        "zeroPrice": true,
        "context": 262144,
        "provenance": "snapshot+override"
      },
      {
        "id": "gpt-5-nano",
        "tier": "cheap",
        "jsonMode": null,
        "fullCheck": false,
        "price": {
          "input": 0.045,
          "output": 0.36
        },
        "zeroPrice": false,
        "context": 400000,
        "provenance": "snapshot+override"
      },
      {
        "id": "zai-org/glm-4.7-flash",
        "tier": "cheap",
        "jsonMode": null,
        "fullCheck": false,
        "price": {
          "input": 0.07,
          "output": 0.4
        },
        "zeroPrice": false,
        "context": 200000,
        "provenance": "snapshot+override"
      }
    ]
  },
  {
    "id": "meganova",
    "label": "Meganova",
    "baseUrl": "https://api.meganova.ai/v1",
    "protocol": "openai",
    "chatPath": "/chat/completions",
    "modelsPath": "/models",
    "authStyle": "bearer",
    "signupUrl": "https://docs.meganova.ai",
    "envVarNames": [
      "MEGANOVA_API_KEY"
    ],
    "docUrl": "https://docs.meganova.ai",
    "billing": {
      "zone": "paid",
      "kind": "unknown",
      "quota": [],
      "priceSource": "models.dev",
      "priceAsOf": "2026-10-09"
    },
    "direct": {
      "verdict": "DIRECT-CONFIRMED",
      "status": 401,
      "probedAt": "2026-10-09"
    },
    "models": [
      {
        "id": "mistralai/Mistral-Small-3.2-24B-Instruct-2506",
        "tier": "paid",
        "jsonMode": null,
        "fullCheck": false,
        "price": {
          "input": 0,
          "output": 0
        },
        "zeroPrice": true,
        "context": 32768,
        "provenance": "snapshot+override"
      },
      {
        "id": "mistralai/Mistral-Nemo-Instruct-2407",
        "tier": "cheap",
        "jsonMode": null,
        "fullCheck": false,
        "price": {
          "input": 0.02,
          "output": 0.04
        },
        "zeroPrice": false,
        "context": 131072,
        "provenance": "snapshot+override"
      }
    ]
  },
  {
    "id": "mistral",
    "label": "Mistral",
    "baseUrl": "https://api.mistral.ai/v1",
    "protocol": "openai",
    "chatPath": "/chat/completions",
    "modelsPath": "/models",
    "authStyle": "bearer",
    "signupUrl": "https://docs.mistral.ai/getting-started/models/",
    "envVarNames": [
      "MISTRAL_API_KEY"
    ],
    "docUrl": "https://docs.mistral.ai/getting-started/models/",
    "billing": {
      "zone": "paid",
      "kind": "unknown",
      "quota": [],
      "priceSource": "models.dev",
      "priceAsOf": "2026-10-09"
    },
    "direct": {
      "verdict": "DIRECT-CONFIRMED",
      "status": 401,
      "probedAt": "2026-10-09"
    },
    "models": [
      {
        "id": "ministral-3b-latest",
        "tier": "cheap",
        "jsonMode": null,
        "fullCheck": false,
        "price": {
          "input": 0.04,
          "output": 0.04
        },
        "zeroPrice": false,
        "context": 131072,
        "provenance": "snapshot+override"
      },
      {
        "id": "ministral-8b-latest",
        "tier": "cheap",
        "jsonMode": null,
        "fullCheck": false,
        "price": {
          "input": 0.1,
          "output": 0.1
        },
        "zeroPrice": false,
        "context": 262144,
        "provenance": "snapshot+override"
      },
      {
        "id": "open-mistral-nemo",
        "tier": "cheap",
        "jsonMode": null,
        "fullCheck": false,
        "price": {
          "input": 0.15,
          "output": 0.15
        },
        "zeroPrice": false,
        "context": 128000,
        "provenance": "snapshot+override"
      },
      {
        "id": "mistral-small-2603",
        "tier": "cheap",
        "jsonMode": null,
        "fullCheck": false,
        "price": {
          "input": 0.15,
          "output": 0.6,
          "cacheRead": 0.015
        },
        "zeroPrice": false,
        "context": 262144,
        "provenance": "snapshot+override"
      },
      {
        "id": "labs-devstral-small-2512",
        "tier": "paid",
        "jsonMode": null,
        "fullCheck": false,
        "price": {
          "input": 0,
          "output": 0
        },
        "zeroPrice": true,
        "context": 256000,
        "provenance": "snapshot+override"
      }
    ]
  },
  {
    "id": "moonshotai",
    "label": "Moonshot AI",
    "baseUrl": "https://api.moonshot.ai/v1",
    "protocol": "openai",
    "chatPath": "/chat/completions",
    "modelsPath": "/models",
    "authStyle": "bearer",
    "signupUrl": "https://platform.moonshot.ai/docs/api/chat",
    "envVarNames": [
      "MOONSHOT_API_KEY"
    ],
    "docUrl": "https://platform.moonshot.ai/docs/api/chat",
    "billing": {
      "zone": "paid",
      "kind": "unknown",
      "quota": [],
      "priceSource": "models.dev",
      "priceAsOf": "2026-10-09"
    },
    "direct": {
      "verdict": "DIRECT-CONFIRMED",
      "status": 401,
      "probedAt": "2026-10-09"
    },
    "models": [
      {
        "id": "kimi-k2.6",
        "tier": "paid",
        "jsonMode": null,
        "fullCheck": false,
        "price": {
          "input": 0.95,
          "output": 4,
          "cacheRead": 0.16
        },
        "zeroPrice": false,
        "context": 262144,
        "provenance": "snapshot+override"
      },
      {
        "id": "kimi-k2.7-code",
        "tier": "paid",
        "jsonMode": null,
        "fullCheck": false,
        "price": {
          "input": 0.95,
          "output": 4,
          "cacheRead": 0.19
        },
        "zeroPrice": false,
        "context": 262144,
        "provenance": "snapshot+override"
      },
      {
        "id": "kimi-k3",
        "tier": "paid",
        "jsonMode": null,
        "fullCheck": false,
        "price": {
          "input": 3,
          "output": 15,
          "cacheRead": 0.3,
          "cacheWrite": 3
        },
        "zeroPrice": false,
        "context": 1048576,
        "provenance": "snapshot+override"
      }
    ]
  },
  {
    "id": "nebius",
    "label": "Nebius Token Factory",
    "baseUrl": "https://api.tokenfactory.nebius.com/v1",
    "protocol": "openai",
    "chatPath": "/chat/completions",
    "modelsPath": "/models",
    "authStyle": "bearer",
    "signupUrl": "https://docs.tokenfactory.nebius.com/",
    "envVarNames": [
      "NEBIUS_API_KEY"
    ],
    "docUrl": "https://docs.tokenfactory.nebius.com/",
    "billing": {
      "zone": "paid",
      "kind": "unknown",
      "quota": [],
      "priceSource": "models.dev",
      "priceAsOf": "2026-10-09"
    },
    "direct": {
      "verdict": "DIRECT-CONFIRMED",
      "status": 401,
      "probedAt": "2026-10-09"
    },
    "models": [
      {
        "id": "nvidia/Nemotron-3_5-Lightning",
        "tier": "cheap",
        "jsonMode": null,
        "fullCheck": false,
        "price": {
          "input": 0.06,
          "output": 0.24,
          "cacheRead": 0.06
        },
        "zeroPrice": false,
        "context": 1048576,
        "provenance": "snapshot+override"
      },
      {
        "id": "google/gemma-3-27b-it",
        "tier": "cheap",
        "jsonMode": null,
        "fullCheck": false,
        "price": {
          "input": 0.1,
          "output": 0.3,
          "cacheRead": 0.01,
          "cacheWrite": 0.125
        },
        "zeroPrice": false,
        "context": 110000,
        "provenance": "snapshot+override"
      }
    ]
  },
  {
    "id": "novita-ai",
    "label": "NovitaAI",
    "baseUrl": "https://api.novita.ai/openai",
    "protocol": "openai",
    "chatPath": "/chat/completions",
    "modelsPath": "/models",
    "authStyle": "bearer",
    "signupUrl": "https://novita.ai/docs/guides/introduction",
    "envVarNames": [
      "NOVITA_API_KEY"
    ],
    "docUrl": "https://novita.ai/docs/guides/introduction",
    "billing": {
      "zone": "paid",
      "kind": "unknown",
      "quota": [],
      "priceSource": "models.dev",
      "priceAsOf": "2026-10-09"
    },
    "direct": {
      "verdict": "DIRECT-CONFIRMED",
      "status": 401,
      "probedAt": "2026-10-09"
    },
    "models": [
      {
        "id": "meta-llama/llama-3.1-8b-instruct",
        "tier": "cheap",
        "jsonMode": null,
        "fullCheck": false,
        "price": {
          "input": 0.02,
          "output": 0.05
        },
        "zeroPrice": false,
        "context": 16384,
        "provenance": "snapshot+override"
      },
      {
        "id": "deepseek/deepseek-v4-flash",
        "tier": "cheap",
        "jsonMode": null,
        "fullCheck": false,
        "price": {
          "input": 0.14,
          "output": 0.28,
          "cacheRead": 0.028
        },
        "zeroPrice": false,
        "context": 1048576,
        "provenance": "snapshot+override"
      }
    ]
  },
  {
    "id": "perplexity",
    "label": "Perplexity",
    "baseUrl": "https://api.perplexity.ai",
    "protocol": "openai",
    "chatPath": "/chat/completions",
    "modelsPath": "/models",
    "authStyle": "bearer",
    "signupUrl": "https://docs.perplexity.ai",
    "envVarNames": [
      "PERPLEXITY_API_KEY"
    ],
    "docUrl": "https://docs.perplexity.ai",
    "billing": {
      "zone": "paid",
      "kind": "unknown",
      "quota": [],
      "priceSource": "models.dev",
      "priceAsOf": "2026-10-09"
    },
    "direct": {
      "verdict": "DIRECT-CONFIRMED",
      "status": 401,
      "probedAt": "2026-10-09"
    },
    "models": [
      {
        "id": "sonar",
        "tier": "paid",
        "jsonMode": null,
        "fullCheck": false,
        "price": {
          "input": 1,
          "output": 1
        },
        "zeroPrice": false,
        "context": 128000,
        "provenance": "snapshot+override"
      },
      {
        "id": "sonar-pro",
        "tier": "paid",
        "jsonMode": null,
        "fullCheck": false,
        "price": {
          "input": 3,
          "output": 15
        },
        "zeroPrice": false,
        "context": 200000,
        "provenance": "snapshot+override"
      },
      {
        "id": "sonar-reasoning-pro",
        "tier": "paid",
        "jsonMode": null,
        "fullCheck": false,
        "price": {
          "input": 2,
          "output": 8
        },
        "zeroPrice": false,
        "context": 128000,
        "provenance": "snapshot+override"
      }
    ]
  },
  {
    "id": "poe",
    "label": "Poe",
    "baseUrl": "https://api.poe.com/v1",
    "protocol": "openai",
    "chatPath": "/chat/completions",
    "modelsPath": "/models",
    "authStyle": "bearer",
    "signupUrl": "https://creator.poe.com/docs/external-applications/openai-compatible-api",
    "envVarNames": [
      "POE_API_KEY"
    ],
    "docUrl": "https://creator.poe.com/docs/external-applications/openai-compatible-api",
    "billing": {
      "zone": "paid",
      "kind": "unknown",
      "quota": [],
      "priceSource": "models.dev",
      "priceAsOf": "2026-10-09"
    },
    "direct": {
      "verdict": "DIRECT-CONFIRMED",
      "status": 401,
      "probedAt": "2026-10-09"
    },
    "models": [
      {
        "id": "openai/gpt-5-nano",
        "tier": "cheap",
        "jsonMode": null,
        "fullCheck": false,
        "price": {
          "input": 0.045,
          "output": 0.36,
          "cacheRead": 0.0045
        },
        "zeroPrice": false,
        "context": 400000,
        "provenance": "snapshot+override"
      },
      {
        "id": "google/gemini-2.5-flash-lite",
        "tier": "cheap",
        "jsonMode": null,
        "fullCheck": false,
        "price": {
          "input": 0.07,
          "output": 0.28
        },
        "zeroPrice": false,
        "context": 1024000,
        "provenance": "snapshot+override"
      },
      {
        "id": "google/gemma-4-31b",
        "tier": "paid",
        "jsonMode": null,
        "fullCheck": false,
        "price": {
          "input": 0,
          "output": 0
        },
        "zeroPrice": true,
        "context": 262144,
        "provenance": "snapshot+override"
      }
    ]
  },
  {
    "id": "qiniu-ai",
    "label": "Qiniu",
    "baseUrl": "https://api.qnaigc.com/v1",
    "protocol": "openai",
    "chatPath": "/chat/completions",
    "modelsPath": "/models",
    "authStyle": "bearer",
    "signupUrl": "https://developer.qiniu.com/aitokenapi",
    "envVarNames": [
      "QINIU_API_KEY"
    ],
    "docUrl": "https://developer.qiniu.com/aitokenapi",
    "billing": {
      "zone": "paid",
      "kind": "unknown",
      "quota": [],
      "priceSource": "models.dev",
      "priceAsOf": "2026-10-09"
    },
    "direct": {
      "verdict": "DIRECT-CONFIRMED",
      "status": 401,
      "probedAt": "2026-10-09"
    },
    "models": [
      {
        "id": "mimo-v2-flash",
        "tier": "cheap",
        "jsonMode": null,
        "fullCheck": false,
        "price": {
          "input": 0.1,
          "output": 0.3,
          "cacheRead": 0.01
        },
        "zeroPrice": false,
        "context": 256000,
        "provenance": "snapshot+override"
      },
      {
        "id": "xiaomi/mimo-v2-flash",
        "tier": "cheap",
        "jsonMode": null,
        "fullCheck": false,
        "price": {
          "input": 0.1,
          "output": 0.3,
          "cacheRead": 0.01
        },
        "zeroPrice": false,
        "context": 256000,
        "provenance": "snapshot+override"
      }
    ]
  },
  {
    "id": "sarvam",
    "label": "Sarvam AI",
    "baseUrl": "https://api.sarvam.ai/v1",
    "protocol": "openai",
    "chatPath": "/chat/completions",
    "modelsPath": "/models",
    "authStyle": "bearer",
    "signupUrl": "https://docs.sarvam.ai/api-reference-docs/getting-started/models",
    "envVarNames": [
      "SARVAM_API_KEY"
    ],
    "docUrl": "https://docs.sarvam.ai/api-reference-docs/getting-started/models",
    "billing": {
      "zone": "paid",
      "kind": "unknown",
      "quota": [],
      "priceSource": "models.dev",
      "priceAsOf": "2026-10-09"
    },
    "direct": {
      "verdict": "DIRECT-CONFIRMED",
      "status": 403,
      "probedAt": "2026-10-09"
    },
    "models": [
      {
        "id": "sarvam-30b",
        "tier": "paid",
        "jsonMode": null,
        "fullCheck": false,
        "price": null,
        "zeroPrice": false,
        "context": 65536,
        "provenance": "snapshot+override"
      },
      {
        "id": "sarvam-105b",
        "tier": "paid",
        "jsonMode": null,
        "fullCheck": false,
        "price": null,
        "zeroPrice": false,
        "context": 131072,
        "provenance": "snapshot+override"
      }
    ]
  },
  {
    "id": "togetherai",
    "label": "Together AI",
    "baseUrl": "https://api.together.xyz/v1",
    "protocol": "openai",
    "chatPath": "/chat/completions",
    "modelsPath": "/models",
    "authStyle": "bearer",
    "signupUrl": "https://docs.together.ai/docs/serverless-models",
    "envVarNames": [
      "TOGETHER_API_KEY"
    ],
    "docUrl": "https://docs.together.ai/docs/serverless-models",
    "billing": {
      "zone": "paid",
      "kind": "unknown",
      "quota": [],
      "priceSource": "models.dev",
      "priceAsOf": "2026-10-09"
    },
    "direct": {
      "verdict": "DIRECT-CONFIRMED",
      "status": 401,
      "probedAt": "2026-10-09"
    },
    "models": [
      {
        "id": "LiquidAI/LFM2-24B-A2B",
        "tier": "cheap",
        "jsonMode": null,
        "fullCheck": false,
        "price": {
          "input": 0.03,
          "output": 0.12
        },
        "zeroPrice": false,
        "context": 32768,
        "provenance": "snapshot+override"
      },
      {
        "id": "deepseek-ai/DeepSeek-V4-Flash-0731",
        "tier": "cheap",
        "jsonMode": null,
        "fullCheck": false,
        "price": {
          "input": 0.14,
          "output": 0.28,
          "cacheRead": 0.03
        },
        "zeroPrice": false,
        "context": 1048576,
        "provenance": "snapshot+override"
      }
    ]
  },
  {
    "id": "upstage",
    "label": "Upstage",
    "baseUrl": "https://api.upstage.ai/v1/solar",
    "protocol": "openai",
    "chatPath": "/chat/completions",
    "modelsPath": "/models",
    "authStyle": "bearer",
    "signupUrl": "https://developers.upstage.ai/docs/apis/chat",
    "envVarNames": [
      "UPSTAGE_API_KEY"
    ],
    "docUrl": "https://developers.upstage.ai/docs/apis/chat",
    "billing": {
      "zone": "paid",
      "kind": "unknown",
      "quota": [],
      "priceSource": "models.dev",
      "priceAsOf": "2026-10-09"
    },
    "direct": {
      "verdict": "DIRECT-CONFIRMED",
      "status": 401,
      "probedAt": "2026-10-09"
    },
    "models": [
      {
        "id": "solar-mini",
        "tier": "cheap",
        "jsonMode": null,
        "fullCheck": false,
        "price": {
          "input": 0.15,
          "output": 0.15
        },
        "zeroPrice": false,
        "context": 32768,
        "provenance": "snapshot+override"
      }
    ]
  },
  {
    "id": "wandb",
    "label": "CoreWeave",
    "baseUrl": "https://api.inference.wandb.ai/v1",
    "protocol": "openai",
    "chatPath": "/chat/completions",
    "modelsPath": "/models",
    "authStyle": "bearer",
    "signupUrl": "https://docs.wandb.ai/inference",
    "envVarNames": [
      "WANDB_API_KEY"
    ],
    "docUrl": "https://docs.wandb.ai/inference",
    "billing": {
      "zone": "paid",
      "kind": "unknown",
      "quota": [],
      "priceSource": "models.dev",
      "priceAsOf": "2026-10-09"
    },
    "direct": {
      "verdict": "DIRECT-CONFIRMED",
      "status": 401,
      "probedAt": "2026-10-09"
    },
    "models": [
      {
        "id": "openai/gpt-oss-20b",
        "tier": "cheap",
        "jsonMode": null,
        "fullCheck": false,
        "price": {
          "input": 0.03,
          "output": 0.13,
          "cacheRead": 0.03
        },
        "zeroPrice": false,
        "context": 131072,
        "provenance": "snapshot+override"
      },
      {
        "id": "openai/gpt-oss-120b",
        "tier": "cheap",
        "jsonMode": null,
        "fullCheck": false,
        "price": {
          "input": 0.03,
          "output": 0.17,
          "cacheRead": 0.03
        },
        "zeroPrice": false,
        "context": 131072,
        "provenance": "snapshot+override"
      }
    ]
  },
  {
    "id": "xai",
    "label": "xAI",
    "baseUrl": "https://api.x.ai/v1",
    "protocol": "openai",
    "chatPath": "/chat/completions",
    "modelsPath": "/models",
    "authStyle": "bearer",
    "signupUrl": "https://docs.x.ai/docs/models",
    "envVarNames": [
      "XAI_API_KEY"
    ],
    "docUrl": "https://docs.x.ai/docs/models",
    "billing": {
      "zone": "paid",
      "kind": "unknown",
      "quota": [],
      "priceSource": "models.dev",
      "priceAsOf": "2026-10-09"
    },
    "direct": {
      "verdict": "DIRECT-CONFIRMED",
      "status": 400,
      "probedAt": "2026-10-09"
    },
    "models": [
      {
        "id": "grok-4.20-0309-non-reasoning",
        "tier": "paid",
        "jsonMode": null,
        "fullCheck": false,
        "price": {
          "input": 1.25,
          "output": 2.5,
          "cacheRead": 0.2
        },
        "zeroPrice": false,
        "context": 1000000,
        "provenance": "snapshot+override"
      },
      {
        "id": "grok-4.3",
        "tier": "paid",
        "jsonMode": null,
        "fullCheck": false,
        "price": {
          "input": 1.25,
          "output": 2.5,
          "cacheRead": 0.2
        },
        "zeroPrice": false,
        "context": 1000000,
        "provenance": "snapshot+override"
      },
      {
        "id": "grok-4.7",
        "tier": "paid",
        "jsonMode": null,
        "fullCheck": false,
        "price": {
          "input": 2,
          "output": 6,
          "cacheRead": 0.5
        },
        "zeroPrice": false,
        "context": 500000,
        "provenance": "snapshot+override"
      }
    ]
  },
  {
    "id": "xiaomi",
    "label": "Xiaomi",
    "baseUrl": "https://api.xiaomimimo.com/v1",
    "protocol": "openai",
    "chatPath": "/chat/completions",
    "modelsPath": "/models",
    "authStyle": "bearer",
    "signupUrl": "https://platform.xiaomimimo.com/#/docs",
    "envVarNames": [
      "XIAOMI_API_KEY"
    ],
    "docUrl": "https://platform.xiaomimimo.com/#/docs",
    "billing": {
      "zone": "paid",
      "kind": "unknown",
      "quota": [],
      "priceSource": "models.dev",
      "priceAsOf": "2026-10-09"
    },
    "direct": {
      "verdict": "DIRECT-CONFIRMED",
      "status": 401,
      "probedAt": "2026-10-09"
    },
    "models": [
      {
        "id": "mimo-v2-flash",
        "tier": "cheap",
        "jsonMode": null,
        "fullCheck": false,
        "price": {
          "input": 0.14,
          "output": 0.28,
          "cacheRead": 0.0028
        },
        "zeroPrice": false,
        "context": 262144,
        "provenance": "snapshot+override"
      },
      {
        "id": "mimo-v2.5",
        "tier": "cheap",
        "jsonMode": null,
        "fullCheck": false,
        "price": {
          "input": 0.14,
          "output": 0.28,
          "cacheRead": 0.0028
        },
        "zeroPrice": false,
        "context": 1048576,
        "provenance": "snapshot+override"
      }
    ]
  },
  {
    "id": "zenmux",
    "label": "ZenMux",
    "baseUrl": "https://zenmux.ai/api/v1",
    "protocol": "openai",
    "chatPath": "/chat/completions",
    "modelsPath": "/models",
    "authStyle": "bearer",
    "signupUrl": "https://docs.zenmux.ai",
    "envVarNames": [
      "ZENMUX_API_KEY"
    ],
    "docUrl": "https://docs.zenmux.ai",
    "billing": {
      "zone": "paid",
      "kind": "unknown",
      "quota": [],
      "priceSource": "models.dev",
      "priceAsOf": "2026-10-09"
    },
    "direct": {
      "verdict": "DIRECT-CONFIRMED",
      "status": 403,
      "probedAt": "2026-10-09"
    },
    "models": [
      {
        "id": "z-ai/glm-4.7-flash-free",
        "tier": "paid",
        "jsonMode": null,
        "fullCheck": false,
        "price": {
          "input": 0,
          "output": 0,
          "cacheRead": 0
        },
        "zeroPrice": true,
        "context": 200000,
        "provenance": "snapshot+override"
      },
      {
        "id": "moonshotai/kimi-k2.7-code-free",
        "tier": "paid",
        "jsonMode": null,
        "fullCheck": false,
        "price": {
          "input": 0,
          "output": 0,
          "cacheRead": 0
        },
        "zeroPrice": true,
        "context": 262144,
        "provenance": "snapshot+override"
      },
      {
        "id": "anthropic/claude-sonnet-5-free",
        "tier": "paid",
        "jsonMode": null,
        "fullCheck": false,
        "price": {
          "input": 0,
          "output": 0,
          "cacheRead": 0,
          "cacheWrite": 0
        },
        "zeroPrice": true,
        "context": 1000000,
        "provenance": "snapshot+override"
      },
      {
        "id": "z-ai/glm-4.6v-flash",
        "tier": "cheap",
        "jsonMode": null,
        "fullCheck": false,
        "price": {
          "input": 0.0218,
          "output": 0.2184,
          "cacheRead": 0.0044
        },
        "zeroPrice": false,
        "context": 200000,
        "provenance": "snapshot+override"
      }
    ]
  }
];
