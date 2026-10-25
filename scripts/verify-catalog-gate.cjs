#!/usr/bin/env node
/**
 * verify-catalog-gate.cjs —— 目录生成器的关口自检（负控夹具 + 产物对账）
 * ============================================================================
 * 为什么单独一个文件：generate-provider-catalog.mjs 里的 I1–I6 只是"写在代码里的规矩"。
 * 规矩不会自己生效 —— 一次条件写反（比如把 `!q.verified` 写成 `q.verified`）就会让
 * "没有出处的厂商"静默进免费专区，而生成器照样打印 ✓。所以本夹具**故意喂违规数据**，
 * 要求生成器必须 rc=5 并咬在正确的条款上；再喂一份合规数据，要求 rc=0 且字段不丢。
 *
 * 四段：
 *   A 负控夹具（12 项）：违规输入必须被拒，且报错文案要点到对应条款
 *   B 正控夹具（7 项）：合规输入必须通过，且额度出处原样写进产物
 *   C 产物对账（8 项）：仓库里已生成的三份产物自证不变量 + 体量下限 + 与输入逐字节同步
 *   D 注册表与 Key 归属（6 项）：扩容只能加 GENERATED_PROVIDERS，已有 Key 的归属判定不许漂移
 *
 * 运行：node scripts/verify-catalog-gate.cjs     退出码 0 全绿 / 1 有失败
 * 夹具目录 _catalog_gate_fixture/ 已 gitignore（一条命令即可重跑，进仓库只会变成旧证据）
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const GEN = path.join(ROOT, 'scripts', 'generate-provider-catalog.mjs');
const FIX = path.join(ROOT, '_catalog_gate_fixture');
const aiProviders = () => require('url').pathToFileURL(path.join(ROOT, 'src/modules/aiProviders.js')).href;

let pass = 0, fail = 0, skipped = 0;
const ok = (name, detail) => { pass++; console.log(`  PASS  ${name}${detail ? ' — ' + detail : ''}`); };
const bad = (name, detail) => { fail++; console.log(`  FAIL  ${name}${detail ? ' — ' + detail : ''}`); };
// SKIP 只在"输入本身不入库"时用（快照 5.4MB 且 gitignore），且必须打印出来 ——
// 静默跳过会让关口在缺输入时照样 rc=0，那才是真正的假绿。
const skip = (name, detail) => { skipped++; console.log(`  SKIP  ${name}${detail ? ' — ' + detail : ''}`); };

// ---------------------------------------------------------------- fixtures
// 只借快照的"形状"，不借它的大小：夹具跑 12+ 次，全量快照会让关口变成分钟级任务
const SNAP = {
    'fx-free': {
        id: 'fx-free', name: 'Fixture Free', api: 'https://fx.example/v1', doc: 'https://fx.example/doc',
        env: ['FX_API_KEY'], npm: '@openai/openai',
        models: {
            'fx-1': { id: 'fx-1', limit: { context: 32000, output: 4096 }, cost: { input: 0, output: 0 } },
            'fx-2': { id: 'fx-2', limit: { context: 8000 }, cost: { input: 0.1, output: 0.2 } },
        },
    },
    'fx-keyless': {
        id: 'fx-keyless', name: 'Fixture Needs Key', api: 'https://kl.example/v1', doc: 'https://kl.example/doc',
        env: ['KL_API_KEY'], models: { 'kl-1': { id: 'kl-1', limit: { context: 8000 }, cost: { input: 1, output: 2 } } },
    },
    'fx-clash': {
        id: 'fx-clash', name: 'Fixture Host Clash', api: 'https://api.deepseek.com/alt/v1', doc: 'https://cl.example/doc',
        env: ['CL_API_KEY'], models: { 'cl-1': { id: 'cl-1', limit: { context: 8000 }, cost: { input: 1, output: 2 } } },
    },
    'fx-zero': {
        id: 'fx-zero', name: 'Fixture Zero Price Plan', api: 'https://zp.example/v1', doc: 'https://zp.example/doc',
        npm: '@anthropic-ai/anthropic',
        models: { 'zp-1': { id: 'zp-1', limit: { context: 200000 }, cost: { input: 0, output: 0 } } },
    },
};

const ROW = (id, baseUrl, verdict, extra) => Object.assign({
    id, baseUrl, chatPath: '/chat/completions', protocol: 'openai',
    modelsPath: '/models', corsClaim: 'candidate', verdict, status: verdict === 'DIRECT-CONFIRMED' ? 401 : 0,
    bodyLen: 12, reachable: { ok: true, type: 'opaque' }, probedAt: '2026-01-02',
}, extra || {});

const PROBE = {
    probedAt: '2026-01-02',
    rows: [
        ROW('fx-free', 'https://fx.example/v1', 'DIRECT-CONFIRMED'),
        ROW('fx-keyless', 'https://kl.example/v1', 'NEEDS-KEY'),
        ROW('fx-clash', 'https://api.deepseek.com/alt/v1', 'DIRECT-CONFIRMED'),
        ROW('fx-zero', 'https://zp.example/v1', 'DIRECT-CONFIRMED', { chatPath: '/messages', protocol: 'anthropic' }),
    ],
};

/** 合规的免费专区条目 —— 正控基线，负控在它之上单点改坏 */
const GOOD_FREE = {
    label: '夹具免费家',
    include: true,
    zone: 'free',
    kind: 'rate-limited-free',
    signupUrl: 'https://fx.example/signup',
    models: [{ id: 'fx-1', tier: 'free' }],
    quota: [{
        detail: '免费档 50 请求/天，需实名',
        source: 'https://fx.example/pricing',
        asOf: '2026-01-02',
        verified: true,
    }],
};

function runGen(overrides, opts) {
    opts = opts || {};
    fs.mkdirSync(FIX, { recursive: true });
    const p = (n) => path.join(FIX, n);
    fs.writeFileSync(p('snapshot.json'), JSON.stringify(opts.snapshot || SNAP, null, 1));
    fs.writeFileSync(p('probe.json'), JSON.stringify(opts.probe || PROBE, null, 1));
    fs.writeFileSync(p('overrides.json'), JSON.stringify({ providers: overrides }, null, 1));
    const outSrc = p('out-catalog.js'), outBilling = p('out-billing.js'), outFull = p('out-full.json');
    const r = spawnSync(process.execPath, [
        GEN,
        '--snapshot', p('snapshot.json'),
        '--probe', p('probe.json'),
        '--overrides', p('overrides.json'),
        '--out-src', outSrc,
        '--out-billing', outBilling,
        '--out-full', outFull,
    ], { encoding: 'utf8', cwd: ROOT });
    return { rc: r.status, err: (r.stderr || '') + (r.stdout || ''), outSrc, outBilling, outFull };
}

/** 负控：必须落在期望的退出码，且报错文案点到期望关键词（rc 对但理由错 = 假绿） */
function expectReject(name, overrides, keyword, opts, wantRc) {
    const r = runGen(overrides, opts);
    const msg = r.err.replace(/\s+/g, ' ').slice(0, 240);
    // rc=2 是"输入本身不可信"（缺实测日期），rc=5 是"数据违反不变量"——两类都要咬，但含义不同
    const want = wantRc === undefined ? 5 : wantRc;
    if (r.rc !== want) return bad(name, `期望 rc=${want}，实得 rc=${r.rc}｜${msg}`);
    if (!msg.includes(keyword)) return bad(name, `咬错了条款，应提到「${keyword}」｜${msg}`);
    ok(name, `rc=${want} 且点在「${keyword}」`);
}

/** 正控：必须 rc=0 */
function expectAccept(name, overrides, opts) {
    const r = runGen(overrides, opts);
    if (r.rc !== 0) return bad(name, `期望 rc=0，实得 rc=${r.rc}｜${r.err.replace(/\s+/g, ' ').slice(0, 240)}`);
    ok(name);
    return r;
}

console.log('── A 负控夹具：违规输入必须被拒 ──');
expectReject('A1 zone=free 无额度出处', {
    'fx-free': Object.assign({}, GOOD_FREE, { quota: [] }),
}, 'zone=free 但没有 quota 出处');

expectReject('A2 额度来源非 https', {
    'fx-free': Object.assign({}, GOOD_FREE, { quota: [{ detail: 'x', source: 'http://fx.example/pricing', asOf: '2026-01-02', verified: true }] }),
}, 'quota.source 不是 https');

expectReject('A3 额度日期格式错', {
    'fx-free': Object.assign({}, GOOD_FREE, { quota: [{ detail: 'x', source: 'https://fx.example/pricing', asOf: '2026/1/2', verified: true }] }),
}, 'quota.asOf 不是 YYYY-MM-DD');

expectReject('A4 额度未标 verified', {
    'fx-free': Object.assign({}, GOOD_FREE, { quota: [{ detail: 'x', source: 'https://fx.example/pricing', asOf: '2026-01-02' }] }),
}, 'quota 未标 verified');

expectReject('A5 zone=free 但 kind 与免费无关', {
    'fx-free': Object.assign({}, GOOD_FREE, { kind: 'pay-as-you-go' }),
}, '与免费无关');

expectReject('A6 zone 取值非法', {
    'fx-free': Object.assign({}, GOOD_FREE, { zone: 'trial' }),
}, 'zone 只能是 free 或 paid');

expectReject('A7 内联未实测确证的厂商', {
    'fx-keyless': Object.assign({}, GOOD_FREE, { label: '夹具需 Key 家', include: true }),
}, '未确证可直连');

expectReject('A8 内联端点与实测地址不一致', {
    'fx-free': Object.assign({}, GOOD_FREE, { baseUrl: 'https://other.example/v1' }),
}, '与实测地址');

expectReject('A9 与内置厂商同主机却未声明区别', {
    'fx-clash': Object.assign({}, GOOD_FREE, { label: '夹具撞车家', include: true, models: [{ id: 'cl-1' }] }),
}, '同主机');

expectReject('A10 付费区写额度也要出处', {
    'fx-zero': { label: '夹具套餐家', include: true, zone: 'paid', kind: 'subscription', quota: [{ detail: '新用户送 100 万 token', asOf: '2026-01-02', verified: true }] },
}, 'quota.source 不是 https');

expectReject('A11 实测报告缺日期', {
    'fx-free': GOOD_FREE,
}, '缺 probedAt', { probe: { rows: PROBE.rows.map(r => Object.assign({}, r, { probedAt: undefined })) } }, 2);

expectReject('A12 实测报告日期自相矛盾', {
    'fx-free': GOOD_FREE,
}, '多个 probedAt', { probe: { rows: [ROW('fx-free', 'https://fx.example/v1', 'DIRECT-CONFIRMED'), ROW('fx-zero', 'https://zp.example/v1', 'DIRECT-CONFIRMED', { probedAt: '2025-12-31' })] } }, 2);

console.log('\n── B 正控夹具：合规输入必须通过且不丢字段 ──');
{
    const r = expectAccept('B1 合规免费专区条目应通过', { 'fx-free': GOOD_FREE });
    if (r.rc === 0) {
        const body = fs.readFileSync(r.outSrc, 'utf8');
        const catalog = JSON.parse(body.slice(body.indexOf('['), body.lastIndexOf(']') + 1));
        const e = catalog.find(x => x.id === 'fx-free');
        if (!e) bad('B2 产物含 fx-free', '内联文件里没有它');
        else ok('B2 产物含 fx-free');
        if (!e || e.billing.zone !== 'free') bad('B3 分区标记保留', JSON.stringify(e && e.billing));
        else ok('B3 分区标记保留', 'zone=free / kind=rate-limited-free');
        const q = (e && e.billing.quota || [])[0] || {};
        if (q.source !== 'https://fx.example/pricing' || q.asOf !== '2026-01-02' || !q.verified) {
            bad('B4 额度出处原样写入', JSON.stringify(q));
        } else ok('B4 额度出处原样写入');
    } else { bad('B2/B3/B4 跳过（B1 未通过）'); }
}
{
    // 撞车但人工声明了 distinctFrom → 应放行（关口不能只会被动拒绝，也要认人工决策）
    const r = runGen({
        'fx-clash': Object.assign({}, GOOD_FREE, { label: '夹具撞车家', include: true, models: [{ id: 'cl-1' }], distinctFrom: 'deepseek' }),
    });
    if (r.rc === 0) ok('B5 声明 distinctFrom 后放行同主机端点');
    else bad('B5 声明 distinctFrom 后放行同主机端点', `rc=${r.rc}｜${r.err.replace(/\s+/g, ' ').slice(0, 200)}`);
}
{
    // 单价 0 的套餐端点：不给 zone 就必须留在付费区（这是"cost==0 ≠ 免费"的正面自证）
    const r = runGen({ 'fx-zero': { label: '夹具套餐家', include: true, kind: 'subscription', models: [{ id: 'zp-1' }] } });
    if (r.rc !== 0) bad('B6 零单价套餐留在付费区', `rc=${r.rc}`);
    else {
        const body = fs.readFileSync(r.outFull, 'utf8');
        const e = JSON.parse(body).providers.find(x => x.id === 'fx-zero');
        const m = e.models[0];
        if (e.billing.zone !== 'paid' || m.tier !== 'paid' || m.zeroPrice !== true) {
            bad('B6 零单价套餐留在付费区', JSON.stringify({ zone: e.billing.zone, tier: m.tier, zeroPrice: m.zeroPrice }));
        } else ok('B6 零单价套餐留在付费区', 'zone=paid / tier=paid / zeroPrice=true');
    }
}

{
    // I5 确定性：同一输入两次生成必须字节相同，否则 diff 审查无从谈起
    const a = runGen({ 'fx-free': GOOD_FREE });
    const files = [a.outSrc, a.outBilling, a.outFull];
    const bytes = a.rc === 0 ? files.map(f => fs.readFileSync(f)) : null;
    const b = runGen({ 'fx-free': GOOD_FREE });
    if (a.rc !== 0 || b.rc !== 0) bad('B7 同输入两次生成字节相同', `rc=${a.rc}/${b.rc}`);
    else {
        const names = files.map(f => path.basename(f));
        const diffs = names.filter((n, i) => !bytes[i].equals(fs.readFileSync(files[i])));
        diffs.length ? bad('B7 同输入两次生成字节相同', '不一致：' + diffs.join(','))
            : ok('B7 同输入两次生成字节相同', '三份产物逐字节一致');
    }
}

console.log('\n── C 产物对账：仓库里的生成物必须自证 ──');
(async () => {
    const { PROVIDERS } = await import(aiProviders());
    const builtinIds = new Set(PROVIDERS.filter(p => !p.custom).map(p => p.id));

    const SRC = path.join(ROOT, 'src/data/aiProviderCatalog.generated.js');
    const BILL = path.join(ROOT, 'src/data/aiBillingFacts.generated.js');
    const FULL = path.join(ROOT, 'public/ai-providers.json');
    for (const [label, f] of [['内联目录', SRC], ['计费事实', BILL], ['全量目录', FULL]]) {
        if (!fs.existsSync(f)) { bad(`C1 ${label}存在`, f); continue; }
        ok(`C1 ${label}存在`, `${(fs.statSync(f).size / 1024).toFixed(1)}KB`);
    }

    const readExport = (f, name) => {
        const body = fs.readFileSync(f, 'utf8');
        const marker = `export const ${name} = `;
        const i = body.indexOf(marker);
        if (i < 0) throw new Error(`找不到 ${marker}`);
        const rest = body.slice(i + marker.length);
        const close = name === 'BILLING_FACTS' ? '}' : ']';
        const end = rest.lastIndexOf(close);
        if (end < 0) throw new Error(`${name} 尾部没有 ${close}`);
        return JSON.parse(rest.slice(0, end + 1));
    };

    let inlined = [], billing = {}, fullDoc = null;
    try { inlined = readExport(SRC, 'GENERATED_PROVIDERS'); } catch (e) { bad('C2 内联目录可解析', e.message); }
    try { billing = readExport(BILL, 'BILLING_FACTS'); } catch (e) { bad('C2 计费事实可解析', e.message); }
    try { fullDoc = JSON.parse(fs.readFileSync(FULL, 'utf8')); } catch (e) { bad('C2 全量目录可解析', e.message); }

    if (billing && fullDoc) {
        // C3 id 不与内置撞（撞了会让已有 Key 归属漂移）
        const clash = inlined.filter(e => builtinIds.has(e.id));
        clash.length ? bad('C3 内联 id 不与内置 18 家重名', clash.map(e => e.id).join(','))
            : ok('C3 内联 id 不与内置 18 家重名', `内联 ${inlined.length} 家`);

        // C4 每条内联都必须是实测确证 + 日期
        const notConfirmed = inlined.filter(e => !e.direct || e.direct.verdict !== 'DIRECT-CONFIRMED');
        notConfirmed.length ? bad('C4 内联全部实测确证可直连', notConfirmed.map(e => `${e.id}:${e.direct && e.direct.verdict}`).join(','))
            : ok('C4 内联全部实测确证可直连', `${inlined.length} 家 / 实测日 ${fullDoc.probedAt}`);

        // C5 免费专区每条额度都要有出处（对已落盘产物重跑一遍 I3，防旧产物残留）
        const all = [].concat(inlined, fullDoc.providers);
        const zoneFree = all.filter(e => e.billing.zone === 'free');
        const noSrc = zoneFree.filter(e => !e.billing.quota.length
            || e.billing.quota.some(q => !/^https:\/\//.test(q.source || '') || !/^\d{4}-\d{2}-\d{2}$/.test(q.asOf || '') || !q.verified));
        noSrc.length ? bad('C5 免费专区全部带出处', noSrc.map(e => e.id).join(','))
            : ok('C5 免费专区全部带出处', `免费 ${zoneFree.length} 家`);

        // C6 内置 18 家都要有计费事实条目，且缺出处只能落在付费区
        const missing = [...builtinIds].filter(id => !billing[id]);
        if (missing.length) bad('C6 内置 18 家计费事实齐全', '缺 ' + missing.join(','));
        else {
            const freeBuiltin = Object.entries(billing).filter(([, b]) => b.zone === 'free');
            const unjust = freeBuiltin.filter(([, b]) => !b.quota.length);
            unjust.length ? bad('C6 内置免费归类带出处', unjust.map(([id]) => id).join(','))
                : ok('C6 内置 18 家计费事实齐全', `其中免费 ${freeBuiltin.length} 家`);
        }

        // C7 体量下限：关口不能对"空目录"发证。C1–C6 在 0 内联 / 0 免费时也全绿，
        // 那等于把"分区"这件事变成一句没有内容的承诺，所以这里显式要求真实内容。
        const freeTotal = all.filter(e => e.billing.zone === 'free').length
            + Object.values(billing).filter(b => b.zone === 'free').length;
        const withQuota = all.filter(e => e.billing.quota.length).length
            + Object.values(billing).filter(b => b.quota.length).length;
        const floors = [['内联厂商', inlined.length, 20], ['全量目录', fullDoc.providers.length, 200],
            ['免费专区', freeTotal, 5], ['带出处额度事实', withQuota, 10]];
        const thin = floors.filter(([, n, min]) => n < min);
        thin.length ? bad('C7 目录有真实内容（非空关口）', thin.map(([k, n, min]) => `${k} ${n} < 下限 ${min}`).join('；') + ' —— 补 scripts/provider-catalog-override.json')
            : ok('C7 目录有真实内容（非空关口）', floors.map(([k, n]) => `${k} ${n}`).join(' / '));

        // C8 产物新鲜度：用仓库里的真实输入重跑一次生成器（产物写到临时目录），逐字节比对。
        // 只查 A/B 夹具挡不住"改了 override 忘了重生成"——那正是最可能发生的漂移。
        const SNAPFILE = path.join(ROOT, '_catalog_snapshot/models_dev.json');
        if (!fs.existsSync(SNAPFILE)) {
            skip('C8 产物与输入同步', `快照缺失（${SNAPFILE}，已 gitignore），先跑 node scripts/generate-provider-catalog.mjs 再复验`);
        } else {
            const outs = ['fresh-catalog.js', 'fresh-billing.js', 'fresh-full.json'].map(n => path.join(FIX, n));
            fs.mkdirSync(FIX, { recursive: true });
            const r = spawnSync(process.execPath, [GEN, '--offline',
                '--out-src', outs[0], '--out-billing', outs[1], '--out-full', outs[2]],
                { encoding: 'utf8', cwd: ROOT });
            if (r.status !== 0) {
                bad('C8 产物与输入同步', `生成器对当前输入返回 rc=${r.status}：${String(r.stderr || r.stdout).replace(/\s+/g, ' ').slice(0, 200)}`);
            } else {
                const stale = [[SRC, outs[0]], [BILL, outs[1]], [FULL, outs[2]]]
                    .filter(([committed, fresh]) => !fs.existsSync(fresh)
                        || !fs.existsSync(committed)
                        || !fs.readFileSync(committed).equals(fs.readFileSync(fresh)))
                    .map(([committed]) => path.relative(ROOT, committed));
                stale.length ? bad('C8 产物与输入同步', `${stale.join('、')} 比 scripts/provider-catalog-override.json 旧 —— 重跑 npm run gen:catalog`)
                    : ok('C8 产物与输入同步', '三份产物与真实输入逐字节一致');
            }
        }
    }

    console.log('\n── D 注册表与 Key 归属：扩目录不许动已有判定 ──');
    {
        const { GENERATED_PROVIDERS, listProviders, detectProviderId, zoneOf, PROVIDERS: BUILTINS } =
            await import(aiProviders());

        // D1 内置家数是既有契约（settingsCenter / aiKeyHealth 都按 18 家写提示），
        //    新厂商只能进 GENERATED_PROVIDERS，不能被塞回 PROVIDERS。
        const merged = listProviders();
        const dup = merged.map(p => p.id).filter((id, i, a) => a.indexOf(id) !== i);
        dup.length ? bad('D1 合并后 id 唯一', dup.join(','))
            : (BUILTINS.length !== 18 ? bad('D1 内置仍为 18 家', `实际 ${BUILTINS.length}`)
                : ok('D1 内置仍为 18 家 / 合并后 id 唯一', `内置 18 + 生成 ${GENERATED_PROVIDERS.length} = ${merged.length}`));

        // D2 生成目录一律 keyShape:null —— 新厂商不参与"按形状猜厂商"。
        //    一旦有人给生成项补上 keyShape，同一把 sk- Key 的归属就会随目录扩容而漂移。
        const shapeful = GENERATED_PROVIDERS.filter(p => p.keyShape);
        shapeful.length ? bad('D2 生成项不参与形状猜测', shapeful.map(p => p.id).join(','))
            : ok('D2 生成项不参与形状猜测', `${GENERATED_PROVIDERS.length} 家全为 null`);

        // D3 Key 归属真值表：这些前缀必须唯一命中，改错了就是"已有 Key 换引擎"级事故。
        const UNIQUE = {
            zhipu: '0123456789abcdef0123456789abcdef.ABCDEFGHIJKLMNOPQRST',
            minimax: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhY2NvdW50X2d1aWQiOiIxMjM0NTY3ODkwIn0.abcdefghij_klmnopqrstuv',
            gemini: 'AIzaSyA-1234567890abcdefghij_klmnop',
            groq: 'gsk_' + 'A'.repeat(40),
            modelscope: 'ms-' + '0123456789abcdef'.repeat(2),
            apinex: 'sk-apx' + '0123456789abcdef'.repeat(3),
            volcano: 'ark-' + 'A'.repeat(32),
            radeon: 'rc-' + 'B'.repeat(32),
            openrouter: 'sk-or-v1-' + 'C'.repeat(40),
            qianfan: 'bce-v3/ALTAK-' + 'I'.repeat(12) + '/' + 'J'.repeat(12),
        };
        const wrong = Object.entries(UNIQUE).filter(([id, k]) => detectProviderId(k) !== id)
            .map(([id, k]) => `${id} → ${detectProviderId(k)}`);
        wrong.length ? bad('D3 独属前缀唯一命中（10 家）', wrong.join('、'))
            : ok('D3 独属前缀唯一命中（10 家）', 'ark-/rc-/sk-or-v1-/gsk_/AIzaSy/ms-/bce-v3/sk-apx/JWT/十六进制点分');

        // D4 共享前缀必须"不猜"：sk- 为八家共用 → detectProviderId 必须 null
        //    （resolveProviderId 的 deepseek 兜底是另一条既有兼容语义，不在此断言范围）
        const guesses = ['sk-' + 'D'.repeat(40), 'step-' + 'K'.repeat(32), 'hunyuan-' + 'L'.repeat(24)]
            .map(k => detectProviderId(k)).filter(v => v !== null);
        guesses.length ? bad('D4 共享/无特征前缀不猜测', '误判为 ' + guesses.join(','))
            : ok('D4 共享/无特征前缀不猜测', 'sk- / step- / hunyuan- → null');

        // D5 分区只认带出处的免费：运行时 zoneOf 的免费名单必须与产物里的出处名单一致
        const freeRuntime = merged.filter(p => zoneOf(p) === 'free').map(p => p.id).sort();
        const freeSourced = [].concat(inlined, fullDoc.providers).filter(e => e.billing.zone === 'free').map(e => e.id)
            .concat(Object.entries(billing).filter(([, b]) => b.zone === 'free').map(([id]) => id)).sort();
        const drift = freeRuntime.filter(id => !freeSourced.includes(id)).concat(freeSourced.filter(id => !freeRuntime.includes(id)));
        drift.length ? bad('D5 运行时分区 == 产物分区', drift.join(','))
            : ok('D5 运行时分区 == 产物分区', `免费 ${freeRuntime.length} 家：${freeRuntime.join(', ')}`);

        // D6 内联项必须是"实测确证"映射成 cors:'verified'，且没有 modelsPath 时
        //    不得声称 modelsEndpointValidatesAuth（那是"能拿 /models 验 Key"的承诺）
        const lying = GENERATED_PROVIDERS.filter(p => p.cors !== 'verified' || !p.baseUrl || !/^https:\/\//.test(p.baseUrl)
            || (!p.modelsPath && p.modelsEndpointValidatesAuth));
        lying.length ? bad('D6 内联项只报实测过的能力', lying.map(p => `${p.id}:${p.cors}`).join(','))
            : ok('D6 内联项只报实测过的能力', `${GENERATED_PROVIDERS.length} 家 cors=verified / https`);
    }

    console.log(`\n合计：PASS ${pass} / FAIL ${fail}${skipped ? ` / SKIP ${skipped}` : ''}`);
    fs.rmSync(FIX, { recursive: true, force: true });
    process.exit(fail ? 1 : 0);
})();
