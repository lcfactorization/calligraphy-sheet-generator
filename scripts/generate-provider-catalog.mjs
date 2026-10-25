#!/usr/bin/env node
/**
 * generate-provider-catalog.mjs —— AI 厂商目录生成器（构建期，一条命令可重跑）
 * ============================================================================
 * 为什么要有它：手写注册表在「扩到几十家」时必然漂移 —— baseURL 抄错、定价写死、
 * 免费额度凭印象。本生成器把目录拆成三份**来源不同**的输入，产出可复核的数据文件：
 *
 *   1) 快照   models.dev api.json（225 家 / 8467 模型，含定价与 env 变量名）
 *             —— 只当"结构与定价"来源，不当"免费"来源。
 *   2) 实测   scripts/probe-provider-direct.cjs 写出的 _provider_direct_probe/report.json
 *             —— 浏览器能不能直连，只认这里；无 Key 读不到的记 needs-key，不内置。
 *   3) 人工   scripts/provider-catalog-override.json
 *             —— 免费额度、注册页、中文显示名、精选模型。**只有这里有出处的额度事实
 *             才能把厂商归入免费专区**（快照里 cost==0 的 647 个模型大多是订阅套餐，
 *             单价 0 是"钱花在套餐上"，不是免费）。
 *
 * 产物：
 *   src/data/aiProviderCatalog.generated.js  内联精选（只含实测可直连的新厂商）
 *   src/data/aiBillingFacts.generated.js     计费事实（含内置 18 家），GUI 分区只读这里
 *   public/ai-providers.json                 全量目录（同源，GUI「扩充目录」按需拉取）
 *
 * 内置 18 家的 baseURL / Key 形状仍由 aiProviders.js 手写维护，本生成器**只**接管它们的
 * 计费事实（zone/kind/quota）—— 因为额度是时效数据，需要一个带出处的单一来源，
 * 而直连端点与 URL 形状是实测/人工核过的稳定事实，不该被快照里缺失的字段冲掉。
 *
 * 不变量（违反直接失败，不产出半成品）：
 *   I1 厂商 id 唯一，且不得与内置 18 家重名（重名会让已有 Key 的归属漂移）
 *   I2 内联进产物的新厂商必须 verdict=DIRECT-CONFIRMED，且端点必须与实测那一条完全一致
 *   I3 zone='free' 必须带 quota 出处；任何 quota 条目都必须是 https 源 + 日期 + verified
 *   I4 定价字段一律标 source:'models.dev' + asOf，不得伪装成实时
 *   I5 输出确定性：同一输入两次生成必须字节相同（便于 diff 审查）
 *   I6 实测日期必须落在字段上并跟着数据走；报告缺日期就不产出
 *
 * 运行：node scripts/generate-provider-catalog.mjs [--snapshot <file>] [--out-src <file>]
 * 退出码：0 成功；2 输入缺失；5 不变量违反
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';

const ROOT = path.resolve(import.meta.dirname, '..');
const argv = process.argv.slice(2);
const argVal = (name, dflt) => {
    const i = argv.indexOf('--' + name);
    return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt;
};

const SNAPSHOT = path.resolve(ROOT, argVal('snapshot', '_catalog_snapshot/models_dev.json'));
const PROBE = path.resolve(ROOT, argVal('probe', '_provider_direct_probe/report.json'));
const OVERRIDES = path.resolve(ROOT, argVal('overrides', 'scripts/provider-catalog-override.json'));
const OUT_SRC = path.resolve(ROOT, argVal('out-src', 'src/data/aiProviderCatalog.generated.js'));
const OUT_BILLING = path.resolve(ROOT, argVal('out-billing', 'src/data/aiBillingFacts.generated.js'));
const OUT_FULL = path.resolve(ROOT, argVal('out-full', 'public/ai-providers.json'));

const fail = (code, msg) => { console.error('✗ ' + msg); process.exit(code); };
const need = (p, label) => { if (!fs.existsSync(p)) fail(2, `缺少${label}：${p}`); return p; };

need(PROBE, '浏览器直连实测报告（先跑 npm run probe:direct）');
need(OVERRIDES, '人工 override');

// 快照不入库（5.4MB 且天天变），但必须可一条命令重取：缺失就从 models.dev 拉，
// 落 _catalog_snapshot/（gitignore）。生成物里写 sha256，事后能证明"这批数据来自哪一份快照"。
if (!fs.existsSync(SNAPSHOT)) {
    if (argv.includes('--offline')) fail(2, `--offline 且缺快照：${SNAPSHOT}`);
    console.log('· 快照缺失，从 https://models.dev/api.json 拉取 …');
    let res;
    try {
        res = await fetch('https://models.dev/api.json', { signal: AbortSignal.timeout(60000) });
    } catch (e) {
        fail(2, `拉取 models.dev 快照失败：${e && e.message} —— 离线时把 api.json 放到 ${SNAPSHOT} 或用 --snapshot 指定`);
    }
    if (!res.ok) fail(2, `拉取 models.dev 快照返回 HTTP ${res.status}`);
    fs.mkdirSync(path.dirname(SNAPSHOT), { recursive: true });
    fs.writeFileSync(SNAPSHOT, await res.text());
}

const snapshotRaw = fs.readFileSync(SNAPSHOT);
const SNAPSHOT_SHA = crypto.createHash('sha256').update(snapshotRaw).digest('hex').slice(0, 16);
const snapshot = JSON.parse(snapshotRaw.toString('utf8'));
const probe = JSON.parse(fs.readFileSync(PROBE, 'utf8'));
const overrides = JSON.parse(fs.readFileSync(OVERRIDES, 'utf8'));

// 内置 18 家由 aiProviders.js 手写维护，生成器不得覆盖其端点与 Key 形状；
// 但它们的计费事实同样从 override 取（额度是时效数据，出处必须集中）。
const builtin = await import(pathToFileURL(path.join(ROOT, 'src/modules/aiProviders.js')).href);
const builtinProviders = builtin.PROVIDERS.filter(p => !p.custom);
const builtinIds = new Set(builtinProviders.map(p => p.id));

const verdictById = new Map(probe.rows.map(r => [r.id, r]));

// 定价/直连的"何时测的"必须跟着数据走，否则半年后没人知道这些数字还作不作数。
// 报告可以是逐行带日期（probe-provider-direct.cjs 的旧版形状），也可以是整轮一个日期。
const rowDates = [...new Set(probe.rows.map(r => r.probedAt).filter(Boolean))];
const PROBE_DATE = probe.probedAt || (rowDates.length === 1 ? rowDates[0] : null);
if (!PROBE_DATE) {
    fail(2, rowDates.length
        ? `实测报告里出现了多个 probedAt（${rowDates.join(' / ')}）—— 一次运行只有一个日期，重跑 node scripts/probe-provider-direct.cjs`
        : '实测报告缺 probedAt —— 重新跑 node scripts/probe-provider-direct.cjs 生成新版报告');
}
if (probe.probedAt && rowDates.length > 1) {
    fail(2, `实测报告行内日期与整轮日期不一致：${probe.probedAt} vs ${rowDates.join(' / ')}`);
}

/** 快照里的定价 → 结构化，不猜语义 */
function priceOf(m) {
    const c = m.cost;
    if (!c) return null;
    const p = { input: num(c.input), output: num(c.output) };
    if (c.cache_read != null) p.cacheRead = num(c.cache_read);
    if (c.cache_write != null) p.cacheWrite = num(c.cache_write);
    if (c.reasoning != null) p.reasoning = num(c.reasoning);
    return p;
}
const num = (v) => (v == null ? null : Number(v));
const isZeroPrice = (p) => !!p && (p.input ?? 0) === 0 && (p.output ?? 0) === 0;

/** 精选模型：优先用 override 里点名的（人工核过可用性与 jsonMode），否则按快照排序补齐 */
const TIERS = new Set(['free', 'cheap', 'paid']);
function pickModels(id, ov, snapModels) {
    const list = snapModels || [];
    const byId = new Map(list.map(m => [m.id, m]));
    const chosen = [];
    for (const want of (ov.models || [])) {
        const sm = byId.get(want.id);
        const price = sm ? priceOf(sm) : (want.price || null);
        // tier 只认 override 明确给的（且必须在既有词表内），否则一律 paid。
        // 绝不因为 price==0 就写 free —— 套餐端点单价也是 0，那样会把订阅标成免费。
        const tier = want.tier && TIERS.has(want.tier) ? want.tier : 'paid';
        chosen.push({
            id: want.id,
            tier,
            jsonMode: want.jsonMode === undefined ? null : !!want.jsonMode,
            fullCheck: !!want.fullCheck,
            price,
            // 单价为 0 但不是免费：只是"计费方式不在 token 上"（订阅套餐/限时额度内）
            zeroPrice: isZeroPrice(price),
            context: sm && sm.limit ? num(sm.limit.context) : null,
            provenance: sm ? 'snapshot+override' : 'override-only',
        });
    }
    if (!chosen.length) {
        const sorted = [...list].sort((a, b) => (b.limit?.context || 0) - (a.limit?.context || 0));
        for (const sm of sorted.slice(0, 6)) {
            const price = priceOf(sm);
            chosen.push({
                id: sm.id, tier: 'paid',
                jsonMode: null,        // 未实测一律 null，交运行时体检（aiKeyHealth 阶段二）定论
                price,
                zeroPrice: isZeroPrice(price),
                context: sm.limit ? num(sm.limit.context) : null,
                provenance: 'snapshot',
            });
        }
    }
    return chosen;
}

const problems = [];
const inlined = [];
const full = [];
const builtinBilling = {};

/** 取 URL 的 host，用于"同一家公司不要出现两个导航项"的判定 */
const hostOf = (u) => { try { return new URL(u).host; } catch { return null; } };

/** 计费事实：override 是唯一来源，缺出处即视为未核实（zone=paid + kind=unknown） */
function billingOf(id, ov) {
    const b = {
        zone: (ov && ov.zone) || 'paid',
        kind: (ov && ov.kind) || 'unknown',
        quota: ((ov && ov.quota) || []).map(q => ({
            detail: q.detail, source: q.source, asOf: q.asOf, verified: !!q.verified,
        })),
        priceSource: 'models.dev',
        priceAsOf: (ov && ov.priceAsOf) || PROBE_DATE,
    };
    // 任何额度声明都要有出处，付费区的"新用户送额度"同样不能凭印象写
    for (const q of b.quota) {
        if (!/^https:\/\//.test(q.source || '')) problems.push(`${id}: quota.source 不是 https 链接 → ${q.source}`);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(q.asOf || '')) problems.push(`${id}: quota.asOf 不是 YYYY-MM-DD → ${q.asOf}`);
        if (!q.verified) problems.push(`${id}: quota 未标 verified:true，不得写入产物`);
        if (!q.detail) problems.push(`${id}: quota 缺 detail`);
    }
    // I3：归入免费专区必须有出处于额度
    if (b.zone === 'free') {
        if (!b.quota.length) problems.push(`${id}: zone=free 但没有 quota 出处`);
        if (!/free|rate-limited|credits|new-user|trial/i.test(b.kind)) {
            problems.push(`${id}: zone=free 但 kind='${b.kind}' 与免费无关，疑似手误`);
        }
    } else if (b.zone !== 'paid') {
        problems.push(`${id}: zone 只能是 free 或 paid → ${b.zone}`);
    }
    return b;
}

for (const [id, p] of Object.entries(snapshot)) {
    const ov = (overrides.providers || {})[id] || null;
    const vr = verdictById.get(id) || null;
    const models = Object.values(p.models || {});
    const snapModels = models.length ? models : null;
    // 同一家公司的不同区端点（api.moonshot.cn 与 .ai）账号与额度都不互通，必须是两个条目；
    // 快照 key 撞上内置 id 时用 override.id 给新条目改名，否则 I1 的"不得重名"会歧义。
    const outId = (ov && ov.id) || id;
    if (outId !== id && builtinIds.has(outId)) {
        problems.push(`${id}: override.id='${outId}' 与内置厂商重名 —— 内置 id 归 aiProviders.js 所有，新条目请另起名`);
    }
    const billing = billingOf(outId, ov);

    // 内置 18 家只贡献计费事实，端点与 Key 形状仍由 aiProviders.js 手写维护
    if (builtinIds.has(id)) {                           // I1
        builtinBilling[id] = billing;
        continue;
    }

    const entry = {
        id: outId,
        catalogId: outId === id ? undefined : id,      // 指回快照原始 key，便于溯源
        label: (ov && ov.label) || p.name || id,
        // 端点以"实测那一条"为准：探针真正打过的 URL 才算确证可直连；快照字段只做兜底，
        // 且一旦与实测不同，下面 I6 会拒绝内联（防止"抄了个没测过的地址"）。
        baseUrl: (ov && ov.baseUrl) || (vr && vr.baseUrl) || p.api || null,
        protocol: (ov && ov.protocol) || (vr && vr.protocol)
            || (/anthropic/.test(p.npm || '') ? 'anthropic' : 'openai'),
        chatPath: (ov && ov.chatPath) || (vr && vr.chatPath) || '/chat/completions',
        modelsPath: ov && ov.modelsPath !== undefined
            ? ov.modelsPath
            : (vr ? vr.modelsPath ?? null : (p.api ? '/models' : null)),
        authStyle: (ov && ov.authStyle) || 'bearer',
        signupUrl: (ov && ov.signupUrl) || p.doc || null,
        envVarNames: p.env || [],
        docUrl: p.doc || null,
        billing,
        direct: vr ? { verdict: vr.verdict, status: vr.status ?? null, probedAt: PROBE_DATE } : { verdict: 'unprobed' },
        models: pickModels(id, ov || {}, snapModels),
    };
    // 与内置厂商同主机 → 它就是同一家（区域别名/coding-plan 变体），GUI 要合并显示，
    // 不能让用户在同一导航里看到两个"DeepSeek"。想当第二个入口内联必须人工写 distinctFrom。
    const hostClash = builtinProviders.find(b => hostOf(b.baseUrl) === hostOf(entry.baseUrl));
    if (hostClash) entry.sameAs = hostClash.id;

    // I2：内联必须实测可直连
    if (ov && ov.include) {
        if (entry.direct.verdict !== 'DIRECT-CONFIRMED') {
            problems.push(`${outId}: override 标了 include 但实测 verdict=${entry.direct.verdict}（未确证可直连，不得内联）`);
        }
        if (!entry.baseUrl) problems.push(`${outId}: include 但无 baseUrl`);
        if (!entry.models.length) problems.push(`${outId}: include 但没有一个模型`);
        // 端点必须就是实测那一条 —— 抄一个没测过的地址会让"实测可直连"变成假话
        if (vr && entry.baseUrl !== vr.baseUrl) {
            problems.push(`${outId}: 内联 baseUrl(${entry.baseUrl}) 与实测地址(${vr.baseUrl}) 不一致`);
        }
        if (entry.sameAs && ov.distinctFrom !== entry.sameAs) {
            problems.push(`${outId}: 与内置「${entry.sameAs}」同主机 ${hostOf(entry.baseUrl)} —— 要么不要内联，要么在 override 里写 distinctFrom:'${entry.sameAs}' 说明为何是两个入口`);
        }
        inlined.push(entry);
    }
    full.push(entry);
}

// 内置 18 家的计费事实：override 按注册表 id 给（9 家与快照同名已在上面填过，其余在此补齐）
for (const p of builtinProviders) {
    if (!builtinBilling[p.id]) {
        builtinBilling[p.id] = billingOf(p.id, (overrides.providers || {})[p.id] || null);
    }
    if (!/^https:\/\//.test(p.baseUrl || '')) problems.push(`${p.id}: 内置 baseUrl 不是 https → ${p.baseUrl}`);
}

if (problems.length) fail(5, '不变量违反：\n  ' + [...new Set(problems)].join('\n  '));

inlined.sort((a, b) => (a.id > b.id ? 1 : -1));
full.sort((a, b) => (a.id > b.id ? 1 : -1));
const seen = new Set();
for (const e of inlined) {
    if (seen.has(e.id)) fail(5, `id 重复：${e.id}`);
    seen.add(e.id);
}

const banner = `// ⚠ 生成物，请勿手改 —— node scripts/generate-provider-catalog.mjs
// 输入：models.dev 快照(sha256 ${SNAPSHOT_SHA}) + 浏览器直连实测(${PROBE_DATE}) + scripts/provider-catalog-override.json
// 内联厂商 ${inlined.length} 家（全部实测 DIRECT-CONFIRMED）；全量目录见 public/ai-providers.json`;
fs.mkdirSync(path.dirname(OUT_SRC), { recursive: true });
fs.writeFileSync(OUT_SRC, `${banner}\nexport const GENERATED_PROVIDERS = ${JSON.stringify(inlined, null, 2)};\n`);

// 计费事实单独成文件：内置 18 家的端点/Key 形状仍在 aiProviders.js 手写，只有额度这类
// 时效数据从这里进，GUI 分区一律读这里，读不到就归付费区（不让"没核实"显示成"免费"）。
fs.writeFileSync(OUT_BILLING, `// ⚠ 生成物，请勿手改 —— node scripts/generate-provider-catalog.mjs
// 计费事实（zone/kind/quota）。quota 每条都带 https 出处与核实日期；无出处=不写=付费区。
// 实测日期 ${PROBE_DATE}，定价快照来源 models.dev。
export const BILLING_FACTS = ${JSON.stringify(
    Object.fromEntries(Object.entries(builtinBilling).sort((a, b) => (a[0] > b[0] ? 1 : -1))), null, 2
)};\n`);

fs.mkdirSync(path.dirname(OUT_FULL), { recursive: true });
fs.writeFileSync(OUT_FULL, JSON.stringify({
    generatedFrom: 'models.dev api.json', probedAt: PROBE_DATE,
    note: 'price 为厂商定价快照，非实时；zone/kind/quota 为人工核实数据，未核实的一律 unknown+paid 区。',
    providers: full.map(e => ({ ...e, models: e.models.slice(0, 24) })),
}, null, 1));

const kb = (f) => (fs.statSync(f).size / 1024).toFixed(1) + 'KB';
const zoneCount = (z) => Object.values(builtinBilling).filter(b => b.zone === z).length
    + full.filter(e => e.billing.zone === z).length;
console.log(`✓ 内联 ${inlined.length} 家 → ${path.relative(ROOT, OUT_SRC)}（${kb(OUT_SRC)}）`);
console.log(`✓ 计费事实 ${Object.keys(builtinBilling).length} 家（含内置）→ ${path.relative(ROOT, OUT_BILLING)}（${kb(OUT_BILLING)}）`);
console.log(`✓ 全量 ${full.length} 家 → ${path.relative(ROOT, OUT_FULL)}（${kb(OUT_FULL)}）`);
console.log(`  免费专区 ${zoneCount('free')} 家 / 付费专区 ${zoneCount('paid')} 家（内置 + 新厂商合计）`);
console.log(`  带出处额度事实 ${Object.values(builtinBilling).concat(full.map(e => e.billing)).filter(b => b.quota.length).length} 家`);
console.log(`  实测确证可直连 ${full.filter(e => e.direct.verdict === 'DIRECT-CONFIRMED').length} 家 / 需带 Key 复核 ${full.filter(e => e.direct.verdict === 'NEEDS-KEY').length} 家`);

