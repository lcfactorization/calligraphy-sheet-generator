# 字帖生成器 · 访问统计系统设置导航

本系统为「字帖生成器」（calligraphy-sheet-generator）提供**访问统计 + 每日邮件报告**能力：

- 📊 统计每位访客的 **IP 地址、操作系统、浏览器、访问时间、访问次数、国家/地区、设备类型、来源链接**
- 📧 每天北京时间 08:00 自动把**前一天的完整统计报告**发送到您的邮箱
- 🛡 自动排除管理员自己、静态资源（图片/CSS/JS/字体）和 API 请求，只统计真实页面访问

---

## 一、系统组成（3 个部件）

| 部件 | 位置 | 作用 |
|------|------|------|
| **Pages Functions** | `functions/_middleware.js` | 拦截每个页面访问并记录到 D1 数据库；提供 `/api/report`、`/api/stats`、`/api/health` 接口 |
| **D1 数据库** | Cloudflare D1（`calligraphy-analytics-db`） | 存储访问明细、每日汇总、报告记录 |
| **Cron Worker** | `analytics/cron-worker/` | 每天定时调用报告接口，通过 **Resend** 发送邮件到您的邮箱 |

> 📌 关键：`functions/_middleware.js` 部署后**无需修改前端代码**，自动生效。

---

## 二、需要准备的东西（3 项）

### 1. Cloudflare API Token（必须）
- 访问：https://dash.cloudflare.com/profile/api-tokens → 「创建令牌」
- 权限需包含：
  - **Account** → **D1** → **Edit**
  - **Account** → **Workers Scripts** → **Edit**
  - **Account** → **Workers R2 Storage** → **Edit**（可选）
- 创建后复制 Token（形如 `cfut_xxxxx`），**只显示一次，请立即保存**

### 2. Resend API Key（用于发邮件，必须）
- 访问：https://resend.com → 注册 → API Keys → 创建 Key（形如 `re_xxxxx`）
- 免费额度：每天 100 封邮件，足够每日报告使用
- 默认发件地址 `onboarding@resend.dev` 已验证可用

### 3. 接收邮箱（可选）
- 默认发送到 `lcfactorization@gmail.com`，可在 `analytics/cron-worker/wrangler.toml` 中修改 `REPORT_EMAIL`

---

## 三、详细设置步骤

### 方式 A：一键脚本（推荐，需 Node.js）

```powershell
cd C:\poem2pdf\distribution\analytics
.\setup.ps1 -ApiToken "cfut_xxxxx" -ResendApiKey "re_xxxxx"
```

脚本会自动完成：
1. 验证 Token
2. 创建 D1 数据库 `calligraphy-analytics-db`
3. 生成 `wrangler.toml`（绑定 D1）
4. 部署 Pages Functions 到 Cloudflare Pages
5. 部署 Cron Worker 并设置密钥

### 方式 B：Cloudflare 仪表盘手动配置（无脚本时）

#### 第 1 步：创建 D1 数据库
1. 登录 https://dash.cloudflare.com
2. 左侧菜单 → **Workers & Pages** → **D1** → **创建数据库**
3. 名称填 `calligraphy-analytics-db`，创建后复制 **Database ID**

#### 第 2 步：绑定 D1 到 Pages 项目
1. **Workers & Pages** → 选择 `calligraphy-sheet-generator` 项目
2. **设置** → **绑定** → **添加绑定** → **D1 数据库**
3. 变量名填 **`DB`**（必须与代码一致），选择刚创建的数据库 → 保存

#### 第 3 步：设置 Pages 环境变量
1. 同上项目 → **设置** → **环境变量**
2. 添加：
   - `CRON_SECRET` = 一个随机字符串（如 `calligraphy_cron_secret_x8k3n5q9w2r7`，请改成自己的强随机值）
   - `SENDER_EMAIL` = `onboarding@resend.dev`（可选）
   - `REPORT_EMAIL` = 您的邮箱（可选）

#### 第 4 步：部署 Functions 代码
- `functions/_middleware.js` 已随仓库代码自动部署（GitHub 集成每次 push 自动构建）
- 若需手动：`npx wrangler pages deploy dist --project-name=calligraphy-sheet-generator`

#### 第 5 步：部署 Cron Worker（每日报告 + 邮件）
```powershell
cd C:\poem2pdf\distribution\analytics\cron-worker
npm install
npx wrangler deploy
# 设置密钥
npx wrangler secret put RESEND_API_KEY    # 输入 Resend Key
npx wrangler secret put CRON_SECRET       # 输入与 Pages 相同的随机字符串
```

> ⚠️ `wrangler.toml` 中的 `CRON_SECRET` 是默认值，**部署前请修改为强随机值**，且必须与 Pages 项目设置的 `CRON_SECRET` 完全一致，否则报告接口会返回 401。

---

## 四、验证是否生效

部署完成后（等待 1-2 分钟），浏览器访问：

| 地址 | 预期结果 |
|------|----------|
| `https://calligraphy-sheet-generator.pages.dev/api/health` | `{"status":"ok",...}` |
| `https://calligraphy-sheet-generator.pages.dev/api/stats?secret=你的CRON_SECRET` | 返回总访问数、今日访问数、独立IP数 |
| `https://calligraphy-sheet-generator.pages.dev/api/report?secret=你的CRON_SECRET` | 生成昨日报告并发送邮件 |

**邮件验证**：触发一次 `/api/report` 后，检查收件箱（含垃圾箱）是否收到 `[字帖生成器访问统计] YYYY-MM-DD 每日报告` 邮件。

**Cron Worker 状态**：访问 `https://calligraphy-analytics-cron.<你的子域>.workers.dev/status` 查看定时任务配置。

---

## 五、报告内容示例（每天邮件）

```
# 每日访问统计报告 - 字帖生成器

**日期**: 2026-08-16

## 概览
| 指标 | 数值 |
|------|------|
| 总访问次数 | 153 |
| 独立 IP 数 | 87 |
| 独立会话数 | 121 |
| 涉及国家/地区 | 3 |
| 浏览器类型 | 4 |
| 操作系统类型 | 3 |
| 设备类型 | 2 |
| 代理/VPN 访问 | 2 |

## IP 地址访问详情（Top 20）
| IP 地址 | 访问次数 | 国家 | 操作系统 | 设备类型 | 代理标记 | 首次访问 | 最后访问 |
|---------|----------|------|----------|----------|----------|----------|----------|
| 1.2.3.4 | 45 | CN | Windows | Desktop | 直连 | 2026-08-16 08:01 | 2026-08-16 22:45 |

## 国家/地区分布 / 浏览器分布 / 操作系统分布 / 设备类型分布
## 访问来源 / 访问路径 / 浏览器语言 / 按小时访问分布
```

---

## 六、常见问题

**Q1：邮件没收到？**
- 检查 Resend 是否配置（`wrangler secret list` 查看）
- 检查 `/api/health` 是否正常
- 检查 CRON_SECRET 是否一致（Pages 环境变量 vs worker wrangler.toml）
- 检查垃圾邮件箱

**Q2：统计数字偏少？**
- 静态资源（图片/CSS/JS/字体）默认不统计，只统计页面 HTML 访问
- 这是设计如此，避免刷量

**Q3：如何排除自己的访问？**
- 访问 `https://calligraphy-sheet-generator.pages.dev/?admin=1` 会种下排除 Cookie，之后 1 年内您的访问不计入统计

**Q4：不想用邮件，只看实时数据？**
- 用 `CRON_SECRET` 访问 `/api/stats` 即可看到实时汇总（总访问/今日/独立IP/国家数）

---

## 七、安全说明

- ✅ 统计系统**不采集**任何页面表单内容，仅记录访问元数据（IP、UA、时间等）
- ✅ `functions/_middleware.js` 为**公开发布版专用**（无密码保护、无调试接口）
- ✅ API 端点均需 `CRON_SECRET` 鉴权，请勿泄露
- ✅ 所有密钥通过 Cloudflare Secrets 存储，**不会进入代码仓库**
