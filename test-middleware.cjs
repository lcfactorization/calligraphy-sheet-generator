// 快速验证 distribution 版 _middleware.js 的核心逻辑
// 模拟 Cloudflare Pages Functions 环境（无密码保护、统计正常）
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const src = fs.readFileSync(path.join(__dirname, 'functions', '_middleware.js'), 'utf8');

// 用 module 包装加载（onRequest 是 ES module 导出，用 vm 提取）
const sandbox = {
  console,
  Response,
  Request,
  URL,
  TextEncoder,
  crypto: { subtle: { importKey: async () => ({}), sign: async () => new ArrayBuffer(0) } },
  fetch: async () => new Response('ok'),
  Date,
  Math,
  JSON,
  setTimeout,
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

// 提取 export async function onRequest
const match = src.match(/export async function onRequest\(context\) \{[\s\S]*?\n\}/);
if (!match) {
  console.error('FAIL: 未找到 onRequest');
  process.exit(1);
}

// 简单的方式：把 export 去掉后 eval 整个文件，收集函数
const stripped = src.replace(/export async function /g, 'async function ');
const collected = {};
const wrapped = new Function('Response', 'URL', 'TextEncoder', 'console', `
  ${stripped}
  return { onRequest };
`);
const mod = wrapped(Response, URL, TextEncoder, console);

// Mock D1 数据库
function makeDB() {
  const store = {};
  const base = () => ({
    run: async () => ({ success: true }),
    first: async () => ({ count: 0, total_views: 0, unique_ips: 0, unique_countries: 0 }),
    all: async () => ({ results: [] }),
  });
  return {
    prepare: (sql) => ({
      ...base(),
      bind: (...args) => base(),
    }),
  };
}

// Mock env
const env = {
  DB: makeDB(),
  CRON_SECRET: 'calligraphy_cron_secret_x8k3n5q9w2r7',
  RESEND_API_KEY: undefined,
};

function makeContext(pathname, query = '') {
  const url = `https://calligraphy-sheet-generator.pages.dev${pathname}${query}`;
  const request = new Request(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0',
      'CF-Connecting-IP': '1.2.3.4',
      'Cookie': '',
    },
  });
  return {
    request,
    env,
    next: async () => new Response('<html>字帖生成器</html>', { headers: { 'Content-Type': 'text/html' } }),
  };
}

(async () => {
  let pass = 0, fail = 0;
  const check = (name, cond) => {
    if (cond) { pass++; console.log(`  ✓ ${name}`); }
    else { fail++; console.log(`  ✗ ${name}`); }
  };

  // 1. 健康检查
  console.log('\n[1] /api/health');
  try {
    const r = await mod.onRequest(makeContext('/api/health'));
    const j = await r.json();
    check('返回 status ok', j.status === 'ok');
  } catch (e) { check(`不崩溃 (${e.message})`, false); }

  // 2. 报告 API - 无密钥应 401
  console.log('\n[2] /api/report 鉴权');
  try {
    const r = await mod.onRequest(makeContext('/api/report'));
    check('无密钥返回 401', r.status === 401);
  } catch (e) { check(`不崩溃 (${e.message})`, false); }

  // 3. 报告 API - 正确密钥应 200
  console.log('\n[3] /api/report 正确密钥');
  try {
    const r = await mod.onRequest(makeContext('/api/report?secret=calligraphy_cron_secret_x8k3n5q9w2r7'));
    check('返回 200', r.status === 200);
  } catch (e) { check(`不崩溃 (${e.message})`, false); }

  // 4. 统计 API - 正确密钥
  console.log('\n[4] /api/stats 正确密钥');
  try {
    const r = await mod.onRequest(makeContext('/api/stats?secret=calligraphy_cron_secret_x8k3n5q9w2r7'));
    const j = await r.json();
    check('返回统计 JSON', typeof j.totalViews === 'number' && typeof j.todayViews === 'number');
  } catch (e) { check(`不崩溃 (${e.message})`, false); }

  // 5. 页面访问 - 触发追踪（应走 trackVisit 然后 next()）
  console.log('\n[5] 页面访问追踪');
  try {
    const r = await mod.onRequest(makeContext('/'));
    const text = await r.text();
    check('页面正常返回', text.includes('字帖生成器'));
  } catch (e) { check(`不崩溃 (${e.message})`, false); }

  // 6. 静态资源 - 不追踪不崩溃
  console.log('\n[6] 静态资源请求');
  try {
    const r = await mod.onRequest(makeContext('/assets/app.js'));
    check('静态资源正常返回', r.status === 200);
  } catch (e) { check(`不崩溃 (${e.message})`, false); }

  // 7. 密码保护已移除 - 直接访问无登录页
  console.log('\n[7] 无密码保护');
  const srcHasAuth = /getLoginPage|__auth|AUTH_PASSWORD|handleAuth/.test(src);
  check('源码无密码保护代码', !srcHasAuth);

  // 8. 敏感端点已移除
  console.log('\n[8] 敏感端点移除');
  const srcHasDebug = /\/api\/debug|\/api\/test-email|handleTestEmail/.test(src);
  check('无 debug/test-email 端点', !srcHasDebug);

  // 9. 名称合规
  console.log('\n[9] 名称合规');
  const srcHasName = /帅小呆/.test(src);
  check('无个人版名称', !srcHasName);

  // 10. 默认密钥已更换
  console.log('\n[10] 默认密钥');
  const srcHasOldSecret = /shuaixiaodai_cron_secret/.test(src);
  check('无旧默认密钥', !srcHasOldSecret);

  console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
  process.exit(fail > 0 ? 1 : 0);
})();
