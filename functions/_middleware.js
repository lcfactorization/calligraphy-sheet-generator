/**
 * Cloudflare Pages Functions - 访问统计中间件
 *
 * 功能：
 * 1. 记录每次访问的详细信息（IP、设备、浏览器、操作系统、地理位置、时间等）
 * 2. 提供 /api/report 端点供 Cron Worker 调用生成每日报告
 * 3. 智能统计优化：
 *    - Cookie 排除机制（?admin=1 种植 Cookie，后续访问不计入统计）
 *    - Client Hints 优先解析（解决桌面模式伪装问题）
 *    - 代理/VPN 流量标记（基于 asOrganization 识别机房 IP）
 *    - 静态资源排除（图片/CSS/JS/字体不追踪，只追踪页面访问）
 *
 * 适用于公开发布版（无密码保护），统计能力与自用版一致。
 *
 * @version 1.0.0
 */

// ============================================================
// 数据库初始化
// ============================================================
let dbInitialized = false;

async function initDB(db) {
  if (dbInitialized) return;

  const statements = [
    `CREATE TABLE IF NOT EXISTS analytics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL DEFAULT (datetime('now')),
      url TEXT,
      method TEXT,
      ip TEXT,
      user_agent TEXT,
      device_type TEXT,
      os_name TEXT,
      os_version TEXT,
      browser_name TEXT,
      browser_version TEXT,
      country TEXT,
      region TEXT,
      city TEXT,
      timezone TEXT,
      asn TEXT,
      as_organization TEXT,
      is_proxy INTEGER DEFAULT 0,
      referer TEXT,
      query_params TEXT,
      status_code INTEGER,
      session_id TEXT,
      accept_language TEXT,
      screen_resolution TEXT,
      protocol TEXT,
      cf_ray TEXT,
      is_admin INTEGER DEFAULT 0,
      detection_method TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS daily_stats (
      date TEXT NOT NULL,
      total_views INTEGER DEFAULT 0,
      unique_ips INTEGER DEFAULT 0,
      unique_countries INTEGER DEFAULT 0,
      proxy_count INTEGER DEFAULT 0,
      top_countries TEXT DEFAULT '[]',
      top_browsers TEXT DEFAULT '[]',
      top_os TEXT DEFAULT '[]',
      top_devices TEXT DEFAULT '[]',
      top_referrers TEXT DEFAULT '[]',
      PRIMARY KEY (date)
    )`,
    `CREATE TABLE IF NOT EXISTS reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      report_type TEXT DEFAULT 'daily',
      content TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      sent_at TEXT,
      is_sent INTEGER DEFAULT 0,
      UNIQUE(date, report_type)
    )`,
    `CREATE INDEX IF NOT EXISTS idx_analytics_timestamp ON analytics(timestamp)`,
    `CREATE INDEX IF NOT EXISTS idx_analytics_ip ON analytics(ip)`,
    `ALTER TABLE analytics ADD COLUMN as_organization TEXT DEFAULT ''`,
    `ALTER TABLE analytics ADD COLUMN is_proxy INTEGER DEFAULT 0`,
    `ALTER TABLE analytics ADD COLUMN is_admin INTEGER DEFAULT 0`,
    `ALTER TABLE analytics ADD COLUMN detection_method TEXT DEFAULT ''`,
    `ALTER TABLE analytics ADD COLUMN detection_reason TEXT DEFAULT ''`,
    `ALTER TABLE analytics ADD COLUMN auth_method TEXT DEFAULT ''`
  ];

  for (const sql of statements) {
    try {
      await db.prepare(sql).run();
    } catch (e) {
      if (!sql.startsWith('ALTER TABLE')) {
        throw e;
      }
    }
  }

  dbInitialized = true;
}

// ============================================================
// 设备识别（优先使用 Client Hints，降级使用 User-Agent）
// ============================================================
function parseDeviceInfo(request) {
  const headers = request.headers;
  const ua = headers.get('User-Agent') || '';

  const secChUaPlatform = headers.get('sec-ch-ua-platform');
  const secChUaMobile = headers.get('sec-ch-ua-mobile');
  const secChUa = headers.get('sec-ch-ua');

  const result = {
    device_type: 'Desktop',
    os_name: 'Unknown',
    os_version: '',
    browser_name: 'Unknown',
    browser_version: '',
    detection_method: 'user-agent'
  };

  if (secChUaPlatform) {
    const platform = secChUaPlatform.replace(/"/g, '');
    result.detection_method = 'client-hints';

    if (platform === 'Android') {
      result.os_name = 'Android';
      const m = ua.match(/Android (\d+[\._]\d+)/);
      result.os_version = m ? m[1].replace(/_/g, '.') : '';
    } else if (platform === 'iOS' || platform === 'iPhone OS') {
      result.os_name = 'iOS';
      const m = ua.match(/OS (\d+[\._]\d+)/);
      result.os_version = m ? m[1].replace(/_/g, '.') : '';
    } else if (platform === 'macOS') {
      result.os_name = 'macOS';
      const m = ua.match(/Mac OS X (\d+[\._\d]+)/);
      result.os_version = m ? m[1].replace(/_/g, '.') : '';
    } else if (platform === 'Windows') {
      result.os_name = 'Windows';
      const m = ua.match(/Windows NT (\d+[\._]\d+)/);
      if (m) {
        const map = { '10.0': '10/11', '6.3': '8.1', '6.2': '8', '6.1': '7' };
        result.os_version = map[m[1]] || m[1];
      }
    } else if (platform === 'Chrome OS') {
      result.os_name = 'Chrome OS';
    } else if (platform === 'Linux') {
      result.os_name = 'Linux';
    } else if (platform === 'HarmonyOS') {
      result.os_name = 'HarmonyOS';
    } else {
      result.os_name = platform;
    }

    if (secChUaMobile === '?1') {
      result.device_type = 'Mobile';
    } else if (secChUaMobile === '?0') {
      if (platform === 'Android' || platform === 'iOS') {
        result.device_type = 'Mobile (桌面模式)';
      } else if (/iPad|Tablet/i.test(ua)) {
        result.device_type = 'Tablet';
      } else {
        result.device_type = 'Desktop';
      }
    }
  } else {
    result.detection_method = 'user-agent';

    if (/tablet|ipad|playbook|silk/i.test(ua) || (/(android|kindle)/i.test(ua) && !/mobile/i.test(ua))) {
      result.device_type = 'Tablet';
    } else if (/mobile|iphone|ipod|android.*mobile|windows phone|blackberry/i.test(ua)) {
      result.device_type = 'Mobile';
    }

    const osPatterns = [
      { name: 'Windows', regex: /Windows NT (\d+[\._]\d+)/, format: v => {
        const map = { '10.0': '10/11', '6.3': '8.1', '6.2': '8', '6.1': '7', '6.0': 'Vista', '5.1': 'XP', '5.0': '2000' };
        return map[v] || v;
      }},
      { name: 'macOS', regex: /Mac OS X ([\d_]+)/, format: v => v.replace(/_/g, '.') },
      { name: 'iOS', regex: /(iPhone|iPad) OS ([\d_]+)/, format: v => v.replace(/_/g, '.') },
      { name: 'Android', regex: /Android ([\d.]+)/ },
      { name: 'HarmonyOS', regex: /HarmonyOS|OpenHarmony/i },
      { name: 'Chrome OS', regex: /CrOS/ },
      { name: 'Linux', regex: /Linux|x11/i },
      { name: 'Windows Phone', regex: /Windows Phone ([\d.]+)/ }
    ];

    for (const pattern of osPatterns) {
      const match = ua.match(pattern.regex);
      if (match) {
        result.os_name = pattern.name;
        result.os_version = match[2] ? (pattern.format ? pattern.format(match[2]) : match[2]) : '';
        break;
      }
    }
  }

  if (secChUa) {
    const brands = secChUa.match(/"([^"]+)";v="([\d.]+)"/g);
    if (brands) {
      for (const b of brands) {
        const m = b.match(/"([^"]+)";v="([\d.]+)"/);
        if (m) {
          const brand = m[1];
          const ver = m[2];
          if (brand === 'Google Chrome') {
            result.browser_name = 'Chrome';
            result.browser_version = ver;
            break;
          } else if (brand === 'Microsoft Edge') {
            result.browser_name = 'Edge';
            result.browser_version = ver;
            break;
          } else if (brand === 'Opera') {
            result.browser_name = 'Opera';
            result.browser_version = ver;
            break;
          } else if (brand === 'Brave') {
            result.browser_name = 'Brave';
            result.browser_version = ver;
            break;
          } else if (brand === 'Chromium') {
            result.browser_name = 'Chromium';
            result.browser_version = ver;
          }
        }
      }
    }
  }

  if (result.browser_name === 'Unknown') {
    if (/Edg\//i.test(ua)) {
      result.browser_name = 'Edge';
      result.browser_version = (ua.match(/Edg\/([\d.]+)/) || [])[1] || '';
    } else if (/OPR\//i.test(ua)) {
      result.browser_name = 'Opera';
      result.browser_version = (ua.match(/OPR\/([\d.]+)/) || [])[1] || '';
    } else if (/Chrome\//i.test(ua) && !/Chromium\//i.test(ua)) {
      result.browser_name = 'Chrome';
      result.browser_version = (ua.match(/Chrome\/([\d.]+)/) || [])[1] || '';
    } else if (/Chromium\//i.test(ua)) {
      result.browser_name = 'Chromium';
      result.browser_version = (ua.match(/Chromium\/([\d.]+)/) || [])[1] || '';
    } else if (/Firefox\//i.test(ua) && !/Seamonkey/i.test(ua)) {
      result.browser_name = 'Firefox';
      result.browser_version = (ua.match(/Firefox\/([\d.]+)/) || [])[1] || '';
    } else if (/Safari\//i.test(ua) && !/Chrome/i.test(ua) && !/Chromium/i.test(ua)) {
      result.browser_name = 'Safari';
      result.browser_version = (ua.match(/Version\/([\d.]+)/) || [])[1] || '';
    } else if (/SamsungBrowser/i.test(ua)) {
      result.browser_name = 'Samsung Internet';
      result.browser_version = (ua.match(/SamsungBrowser\/([\d.]+)/) || [])[1] || '';
    } else if (/MicroMessenger/i.test(ua)) {
      result.browser_name = '微信内置浏览器';
      result.browser_version = (ua.match(/MicroMessenger\/([\d.]+)/) || [])[1] || '';
    } else if (/UCBrowser/i.test(ua)) {
      result.browser_name = 'UC浏览器';
      result.browser_version = (ua.match(/UCBrowser\/([\d.]+)/) || [])[1] || '';
    } else if (/QQBrowser/i.test(ua)) {
      result.browser_name = 'QQ浏览器';
      result.browser_version = (ua.match(/QQBrowser\/([\d.]+)/) || [])[1] || '';
    }
  }

  return result;
}

// ============================================================
// 代理/VPN/云服务器 检测
// ============================================================
const PROXY_AS_KEYWORDS = [
  'google', 'amazon', 'aws', 'microsoft', 'azure', 'oracle',
  'cloudflare', 'digitalocean', 'linode', 'vultr', 'ovh',
  'hetzner', 'contabo', 'm247', 'choopa', 'm247 europe',
  'datacamp', 'leaseweb', 'private internet access',
  'nordvpn', 'expressvpn', 'surfshark', 'protonvpn',
  'mullvad', 'cyberghost', 'tunnelbear', 'windscribe',
  'telegram', 'facebook', 'twitter', 'apple',
  'alibaba', 'tencent', 'huawei', 'ucloud', 'qiniu',
  'alibaba cloud', 'alibaba.com llc', 'aliyun'
];

const DATACENTER_IP_RANGES = [
  { prefix: '47.79.', name: 'Alibaba Cloud Singapore', asn: 'AS45102' },
  { prefix: '47.74.', name: 'Alibaba Cloud Singapore' },
  { prefix: '47.75.', name: 'Alibaba Cloud Singapore' },
  { prefix: '47.76.', name: 'Alibaba Cloud Singapore' },
  { prefix: '47.77.', name: 'Alibaba Cloud Singapore' },
  { prefix: '47.78.', name: 'Alibaba Cloud Singapore' },
  { prefix: '47.80.', name: 'Alibaba Cloud Singapore' },
  { prefix: '47.88.', name: 'Alibaba Cloud Singapore' },
  { prefix: '47.91.', name: 'Alibaba Cloud Singapore' },
  { prefix: '119.91.', name: 'Tencent Cloud' },
  { prefix: '129.226.', name: 'Tencent Cloud' },
  { prefix: '150.109.', name: 'Tencent Cloud' },
  { prefix: '152.136.', name: 'Tencent Cloud' },
  { prefix: '52.', name: 'AWS' },
  { prefix: '54.', name: 'AWS' },
  { prefix: '3.', name: 'AWS' },
  { prefix: '13.', name: 'AWS' },
  { prefix: '35.', name: 'Google Cloud' },
  { prefix: '34.', name: 'Google Cloud' },
];

const DATACENTER_ASNS = ['45102', '37963', '45090', '140633', '133478'];

function detectProxy(cf, ip) {
  const asOrg = (cf.asOrganization || '').toLowerCase();
  const ipStr = ip || '';

  if (asOrg) {
    for (const keyword of PROXY_AS_KEYWORDS) {
      if (asOrg.includes(keyword)) {
        return { is_proxy: 1, as_organization: cf.asOrganization, detection_reason: 'AS组织匹配: ' + keyword };
      }
    }
  }

  if (!asOrg && ipStr) {
    for (const range of DATACENTER_IP_RANGES) {
      if (ipStr.startsWith(range.prefix)) {
        return { is_proxy: 1, as_organization: range.name, detection_reason: 'IP段匹配: ' + range.prefix };
      }
    }
  }

  const asn = cf.asn ? String(cf.asn) : '';
  if (asn && DATACENTER_ASNS.includes(asn)) {
    return { is_proxy: 1, as_organization: asOrg || 'Datacenter (ASN:AS' + asn + ')', detection_reason: 'ASN匹配: AS' + asn };
  }

  return { is_proxy: 0, as_organization: cf.asOrganization || '', detection_reason: '' };
}

// ============================================================
// 会话 ID 生成
// ============================================================
function generateSessionId(ip, ua, date) {
  const str = `${ip}|${ua}|${date}`;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

// ============================================================
// 主入口
// ============================================================
export async function onRequest(context) {
  const { request, env, next } = context;
  const url = new URL(request.url);

  // 初始化数据库
  try {
    await initDB(env.DB);
  } catch (e) {
    console.error('DB init error:', e);
    if (!url.pathname.startsWith('/api/')) {
      return next();
    }
  }

  // ============================================================
  // API 端点
  // ============================================================
  if (url.pathname === '/api/report') {
    return handleReportAPI(request, env);
  }
  if (url.pathname === '/api/stats') {
    return handleStatsAPI(request, env);
  }
  if (url.pathname === '/api/health') {
    return Response.json({ status: 'ok', time: new Date().toISOString() });
  }

  // ============================================================
  // 管理员排除机制
  // ============================================================
  const cookie = request.headers.get('Cookie') || '';

  if (url.searchParams.get('admin') === '1') {
    const redirectUrl = new URL('/', request.url);
    return new Response(null, {
      status: 302,
      headers: {
        'Location': redirectUrl.toString(),
        'Set-Cookie': 'ignore_stats=true; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=31536000'
      }
    });
  }

  const isAdmin = cookie.includes('ignore_stats=true');

  // ============================================================
  // 访问追踪（排除：管理员、静态资源、API 端点）
  // ============================================================
  const isStaticResource = /\.(jpg|jpeg|png|gif|webp|svg|ico|css|js|woff|woff2|ttf|eot|json|map|bin|mp4|webm|mp3)$/i.test(url.pathname);
  const isApiEndpoint = url.pathname.startsWith('/api/');

  if (!isAdmin && !isStaticResource && !isApiEndpoint) {
    try {
      await trackVisit(request, env);
    } catch (e) {
      console.error('Track visit error:', e);
    }
  }

  const response = await next();
  response.headers.set('X-Content-Type-Options', 'nosniff');
  return response;
}

// ============================================================
// 访问追踪核心逻辑
// ============================================================
async function trackVisit(request, env) {
  const url = new URL(request.url);
  const parsed = parseDeviceInfo(request);
  const cf = request.cf || {};
  const clientIp = request.headers.get('CF-Connecting-IP') || 'unknown';
  const proxyInfo = detectProxy(cf, clientIp);
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const sessionId = generateSessionId(
    request.headers.get('CF-Connecting-IP') || 'unknown',
    request.headers.get('User-Agent') || '',
    today
  );

  const params = {};
  url.searchParams.forEach((v, k) => {
    if (k !== 'password' && k !== 'admin') params[k] = v;
  });

  let authMethod = 'none';

  await env.DB.prepare(`
    INSERT INTO analytics (
      timestamp, url, method, ip, user_agent,
      device_type, os_name, os_version, browser_name, browser_version,
      country, region, city, timezone, asn, as_organization, is_proxy,
      referer, query_params, status_code, session_id,
      accept_language, protocol, cf_ray, is_admin, detection_method,
      detection_reason, auth_method
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    now.toISOString(),
    url.pathname,
    request.method,
    request.headers.get('CF-Connecting-IP') || 'unknown',
    request.headers.get('User-Agent') || '',
    parsed.device_type,
    parsed.os_name,
    parsed.os_version,
    parsed.browser_name,
    parsed.browser_version,
    cf.country || 'unknown',
    cf.region || '',
    cf.city || '',
    cf.timezone || '',
    cf.asn ? `AS${cf.asn}` : '',
    proxyInfo.as_organization,
    proxyInfo.is_proxy,
    request.headers.get('Referer') || '',
    JSON.stringify(params),
    200,
    sessionId,
    request.headers.get('Accept-Language') || '',
    request.headers.get('X-Forwarded-Proto') || 'https',
    request.headers.get('CF-Ray') || '',
    0,
    parsed.detection_method,
    proxyInfo.detection_reason || '',
    authMethod
  ).run();

  await updateDailyStats(env.DB, today);
}

// ============================================================
// 更新每日统计汇总
// ============================================================
async function updateDailyStats(db, date) {
  const viewResult = await db.prepare(
    `SELECT COUNT(*) as count FROM analytics WHERE substr(timestamp, 1, 10) = ? AND is_admin = 0`
  ).bind(date).first();
  const totalViews = viewResult?.count || 0;

  const ipResult = await db.prepare(
    `SELECT COUNT(DISTINCT ip) as count FROM analytics WHERE substr(timestamp, 1, 10) = ? AND is_admin = 0`
  ).bind(date).first();
  const uniqueIps = ipResult?.count || 0;

  const countryResult = await db.prepare(
    `SELECT COUNT(DISTINCT country) as count FROM analytics WHERE substr(timestamp, 1, 10) = ? AND is_admin = 0`
  ).bind(date).first();
  const uniqueCountries = countryResult?.count || 0;

  const proxyResult = await db.prepare(
    `SELECT COUNT(*) as count FROM analytics WHERE substr(timestamp, 1, 10) = ? AND is_proxy = 1 AND is_admin = 0`
  ).bind(date).first();
  const proxyCount = proxyResult?.count || 0;

  const topCountries = await db.prepare(
    `SELECT country, COUNT(*) as cnt FROM analytics
     WHERE substr(timestamp, 1, 10) = ? AND country != 'unknown' AND country != '' AND is_admin = 0
     GROUP BY country ORDER BY cnt DESC LIMIT 10`
  ).bind(date).all();

  const topBrowsers = await db.prepare(
    `SELECT browser_name, COUNT(*) as cnt FROM analytics
     WHERE substr(timestamp, 1, 10) = ? AND browser_name != 'Unknown' AND is_admin = 0
     GROUP BY browser_name ORDER BY cnt DESC LIMIT 10`
  ).bind(date).all();

  const topOS = await db.prepare(
    `SELECT os_name, COUNT(*) as cnt FROM analytics
     WHERE substr(timestamp, 1, 10) = ? AND os_name != 'Unknown' AND is_admin = 0
     GROUP BY os_name ORDER BY cnt DESC LIMIT 10`
  ).bind(date).all();

  const topDevices = await db.prepare(
    `SELECT device_type, COUNT(*) as cnt FROM analytics
     WHERE substr(timestamp, 1, 10) = ? AND is_admin = 0
     GROUP BY device_type ORDER BY cnt DESC`
  ).bind(date).all();

  const topReferrers = await db.prepare(
    `SELECT referer, COUNT(*) as cnt FROM analytics
     WHERE substr(timestamp, 1, 10) = ? AND referer != '' AND is_admin = 0
     GROUP BY referer ORDER BY cnt DESC LIMIT 10`
  ).bind(date).all();

  await db.prepare(`
    INSERT OR REPLACE INTO daily_stats
    (date, total_views, unique_ips, unique_countries, proxy_count,
     top_countries, top_browsers, top_os, top_devices, top_referrers)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    date,
    totalViews,
    uniqueIps,
    uniqueCountries,
    proxyCount,
    JSON.stringify(topCountries?.results || []),
    JSON.stringify(topBrowsers?.results || []),
    JSON.stringify(topOS?.results || []),
    JSON.stringify(topDevices?.results || []),
    JSON.stringify(topReferrers?.results || [])
  ).run();
}

// ============================================================
// 报告生成 API
// ============================================================
async function handleReportAPI(request, env) {
  const secret = request.headers.get('X-Cron-Secret') ||
                 new URL(request.url).searchParams.get('secret');
  const expectedSecret = env.CRON_SECRET || 'calligraphy_cron_secret_x8k3n5q9w2r7';
  if (secret !== expectedSecret) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const date = url.searchParams.get('date') ||
               new Date(Date.now() - 86400000).toISOString().slice(0, 10);

  try {
    const report = await generateDailyReport(env.DB, date);
    const sent = await sendReportEmail(report, date, env);

    await env.DB.prepare(`
      INSERT OR REPLACE INTO reports (date, report_type, content, sent_at, is_sent)
      VALUES (?, 'daily', ?, ?, ?)
    `).bind(
      date,
      report,
      sent ? new Date().toISOString() : null,
      sent ? 1 : 0
    ).run();

    return Response.json({
      success: true,
      date,
      sent,
      reportLength: report.length
    });
  } catch (e) {
    console.error('Report generation error:', e);
    return Response.json({
      success: false,
      error: e.message,
      date
    }, { status: 500 });
  }
}

// ============================================================
// 实时统计 API
// ============================================================
async function handleStatsAPI(request, env) {
  const secret = request.headers.get('X-Cron-Secret') ||
                 new URL(request.url).searchParams.get('secret');
  const expectedSecret = env.CRON_SECRET || 'calligraphy_cron_secret_x8k3n5q9w2r7';
  if (secret !== expectedSecret) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const today = new Date().toISOString().slice(0, 10);

  const totalViews = await env.DB.prepare(
    `SELECT COUNT(*) as count FROM analytics`
  ).first();

  const todayViews = await env.DB.prepare(
    `SELECT COUNT(*) as count FROM analytics WHERE substr(timestamp, 1, 10) = ?`
  ).bind(today).first();

  const totalIps = await env.DB.prepare(
    `SELECT COUNT(DISTINCT ip) as count FROM analytics`
  ).first();

  const totalCountries = await env.DB.prepare(
    `SELECT COUNT(DISTINCT country) as count FROM analytics`
  ).first();

  return Response.json({
    totalViews: totalViews?.count || 0,
    todayViews: todayViews?.count || 0,
    totalIps: totalIps?.count || 0,
    totalCountries: totalCountries?.count || 0,
    today
  });
}

// ============================================================
// 生成每日 Markdown 报告
// ============================================================
async function generateDailyReport(db, date) {
  const stats = await db.prepare(`
    SELECT
      COUNT(*) as total_views,
      COUNT(DISTINCT ip) as unique_ips,
      COUNT(DISTINCT country) as unique_countries,
      COUNT(DISTINCT browser_name) as browser_types,
      COUNT(DISTINCT os_name) as os_types,
      COUNT(DISTINCT device_type) as device_types,
      COUNT(DISTINCT session_id) as unique_sessions,
      SUM(is_proxy) as proxy_count,
      SUM(CASE WHEN detection_method = 'client-hints' THEN 1 ELSE 0 END) as ch_count,
      SUM(CASE WHEN detection_method = 'user-agent' THEN 1 ELSE 0 END) as ua_count
    FROM analytics
    WHERE substr(timestamp, 1, 10) = ? AND is_admin = 0
  `).bind(date).first();

  if (!stats || stats.total_views === 0) {
    return `# 每日访问统计报告\n\n**日期**: ${date}\n\n> 今日暂无访问记录。\n`;
  }

  const hourlyData = await db.prepare(`
    SELECT
      CAST(substr(timestamp, 12, 2) AS INTEGER) as hour,
      COUNT(*) as views,
      COUNT(DISTINCT ip) as ips
    FROM analytics
    WHERE substr(timestamp, 1, 10) = ? AND is_admin = 0
    GROUP BY CAST(substr(timestamp, 12, 2) AS INTEGER)
    ORDER BY hour
  `).bind(date).all();

  const topIPs = await db.prepare(`
    SELECT ip, COUNT(*) as views,
           MIN(timestamp) as first_visit,
           MAX(timestamp) as last_visit,
           COUNT(DISTINCT browser_name) as browsers_used,
           country, as_organization, is_proxy,
           os_name, device_type
    FROM analytics
    WHERE substr(timestamp, 1, 10) = ? AND is_admin = 0
    GROUP BY ip
    ORDER BY views DESC
    LIMIT 20
  `).bind(date).all();

  const topCountries = await db.prepare(`
    SELECT country, COUNT(*) as views, COUNT(DISTINCT ip) as ips
    FROM analytics
    WHERE substr(timestamp, 1, 10) = ? AND country != 'unknown' AND country != '' AND is_admin = 0
    GROUP BY country
    ORDER BY views DESC
    LIMIT 15
  `).bind(date).all();

  const topBrowsers = await db.prepare(`
    SELECT browser_name, browser_version, COUNT(*) as views
    FROM analytics
    WHERE substr(timestamp, 1, 10) = ? AND browser_name != 'Unknown' AND is_admin = 0
    GROUP BY browser_name, browser_version
    ORDER BY views DESC
    LIMIT 10
  `).bind(date).all();

  const topOS = await db.prepare(`
    SELECT os_name, os_version, COUNT(*) as views
    FROM analytics
    WHERE substr(timestamp, 1, 10) = ? AND os_name != 'Unknown' AND is_admin = 0
    GROUP BY os_name, os_version
    ORDER BY views DESC
    LIMIT 10
  `).bind(date).all();

  const topDevices = await db.prepare(`
    SELECT device_type, COUNT(*) as views
    FROM analytics
    WHERE substr(timestamp, 1, 10) = ? AND is_admin = 0
    GROUP BY device_type
    ORDER BY views DESC
  `).bind(date).all();

  const topReferrers = await db.prepare(`
    SELECT referer, COUNT(*) as views
    FROM analytics
    WHERE substr(timestamp, 1, 10) = ? AND referer != '' AND is_admin = 0
    GROUP BY referer
    ORDER BY views DESC
    LIMIT 10
  `).bind(date).all();

  const topPaths = await db.prepare(`
    SELECT url, COUNT(*) as views
    FROM analytics
    WHERE substr(timestamp, 1, 10) = ? AND is_admin = 0
    GROUP BY url
    ORDER BY views DESC
    LIMIT 10
  `).bind(date).all();

  const topLanguages = await db.prepare(`
    SELECT accept_language, COUNT(*) as views
    FROM analytics
    WHERE substr(timestamp, 1, 10) = ? AND accept_language != '' AND is_admin = 0
    GROUP BY accept_language
    ORDER BY views DESC
    LIMIT 5
  `).bind(date).all();

  let report = `# 每日访问统计报告 - 字帖生成器\n\n`;
  report += `**日期**: ${date}  \n`;
  report += `**生成时间**: ${new Date().toISOString().replace('T', ' ').slice(0, 19)} UTC\n\n`;

  report += `---\n\n`;
  report += `## 概览\n\n`;
  report += `| 指标 | 数值 |\n`;
  report += `|------|------|\n`;
  report += `| 总访问次数 | ${stats.total_views} |\n`;
  report += `| 独立 IP 数 | ${stats.unique_ips} |\n`;
  report += `| 独立会话数 | ${stats.unique_sessions} |\n`;
  report += `| 涉及国家/地区 | ${stats.unique_countries} |\n`;
  report += `| 浏览器类型 | ${stats.browser_types} |\n`;
  report += `| 操作系统类型 | ${stats.os_types} |\n`;
  report += `| 设备类型 | ${stats.device_types} |\n`;
  report += `| 代理/VPN 访问 | ${stats.proxy_count || 0} |\n`;
  report += `| Client Hints 识别 | ${stats.ch_count || 0} 次 |\n`;
  report += `| User-Agent 识别 | ${stats.ua_count || 0} 次 |\n\n`;

  if (hourlyData?.results?.length > 0) {
    report += `## 按小时访问分布\n\n`;
    report += `| 时段 | 访问次数 | 独立IP |\n`;
    report += `|------|----------|--------|\n`;
    for (const row of hourlyData.results) {
      report += `| ${String(row.hour).padStart(2, '0')}:00 - ${String(row.hour).padStart(2, '0')}:59 | ${row.views} | ${row.ips} |\n`;
    }
    report += `\n`;
  }

  if (topIPs?.results?.length > 0) {
    report += `## IP 地址访问详情（Top ${topIPs.results.length}）\n\n`;
    report += `| IP 地址 | 访问次数 | 国家 | 操作系统 | 设备类型 | 代理标记 | AS组织 | 首次访问 | 最后访问 |\n`;
    report += `|---------|----------|------|----------|----------|----------|--------|----------|----------|\n`;
    for (const row of topIPs.results) {
      const firstVisit = row.first_visit ? row.first_visit.replace('T', ' ').slice(0, 19) : '';
      const lastVisit = row.last_visit ? row.last_visit.replace('T', ' ').slice(0, 19) : '';
      const proxyTag = row.is_proxy ? 'VPN/代理' : '直连';
      const asOrg = row.as_organization ? (row.as_organization.length > 25 ? row.as_organization.slice(0, 25) + '...' : row.as_organization) : '-';
      report += `| ${row.ip} | ${row.views} | ${row.country || '-'} | ${row.os_name || '-'} | ${row.device_type || '-'} | ${proxyTag} | ${asOrg} | ${firstVisit} | ${lastVisit} |\n`;
    }
    report += `\n`;
  }

  if (topCountries?.results?.length > 0) {
    report += `## 国家/地区分布\n\n`;
    report += `| 国家/地区 | 访问次数 | 独立IP |\n`;
    report += `|-----------|----------|--------|\n`;
    for (const row of topCountries.results) {
      report += `| ${row.country} | ${row.views} | ${row.ips} |\n`;
    }
    report += `\n`;
  }

  if (topBrowsers?.results?.length > 0) {
    report += `## 浏览器分布\n\n`;
    report += `| 浏览器 | 版本 | 访问次数 |\n`;
    report += `|--------|------|----------|\n`;
    for (const row of topBrowsers.results) {
      report += `| ${row.browser_name} | ${row.browser_version || '-'} | ${row.views} |\n`;
    }
    report += `\n`;
  }

  if (topOS?.results?.length > 0) {
    report += `## 操作系统分布\n\n`;
    report += `| 操作系统 | 版本 | 访问次数 |\n`;
    report += `|----------|------|----------|\n`;
    for (const row of topOS.results) {
      report += `| ${row.os_name} | ${row.os_version || '-'} | ${row.views} |\n`;
    }
    report += `\n`;
  }

  if (topDevices?.results?.length > 0) {
    report += `## 设备类型分布\n\n`;
    report += `| 设备类型 | 访问次数 |\n`;
    report += `|----------|----------|\n`;
    for (const row of topDevices.results) {
      report += `| ${row.device_type} | ${row.views} |\n`;
    }
    report += `\n`;
  }

  if (topReferrers?.results?.length > 0) {
    report += `## 访问来源（Top ${topReferrers.results.length}）\n\n`;
    report += `| 来源 | 访问次数 |\n`;
    report += `|------|----------|\n`;
    for (const row of topReferrers.results) {
      const ref = row.referer.length > 60 ? row.referer.slice(0, 60) + '...' : row.referer;
      report += `| ${ref} | ${row.views} |\n`;
    }
    report += `\n`;
  }

  if (topPaths?.results?.length > 0) {
    report += `## 访问路径\n\n`;
    report += `| 路径 | 访问次数 |\n`;
    report += `|------|----------|\n`;
    for (const row of topPaths.results) {
      report += `| ${row.url} | ${row.views} |\n`;
    }
    report += `\n`;
  }

  if (topLanguages?.results?.length > 0) {
    report += `## 浏览器语言\n\n`;
    report += `| 语言 | 访问次数 |\n`;
    report += `|------|----------|\n`;
    for (const row of topLanguages.results) {
      report += `| ${row.accept_language} | ${row.views} |\n`;
    }
    report += `\n`;
  }

  report += `---\n\n`;
  report += `> 此报告由 Cloudflare Workers v1.0.0 自动生成并发送\n`;
  report += `> 项目：字帖生成器\n`;
  report += `> 统计已排除管理员访问、静态资源请求和 API 请求\n`;
  report += `> 设备识别优先使用 Client Hints，降级使用 User-Agent\n`;

  return report;
}

// ============================================================
// 发送邮件（通过 Resend API）
// ============================================================
async function sendReportEmail(content, date, env) {
  if (!env.RESEND_API_KEY) {
    console.log('RESEND_API_KEY not configured, skipping email send');
    return false;
  }

  const senderEmail = env.SENDER_EMAIL || 'onboarding@resend.dev';
  const recipientEmail = env.REPORT_EMAIL || 'lcfactorization@gmail.com';

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: senderEmail,
        to: recipientEmail,
        subject: `[字帖生成器访问统计] ${date} 每日报告`,
        text: content,
        headers: {
          'X-Report-Date': date,
          'X-Report-Type': 'daily-analytics'
        }
      })
    });

    if (response.ok) {
      const result = await response.json();
      console.log(`Report email sent successfully for ${date}, id: ${result.id}`);
      return true;
    } else {
      const errorText = await response.text();
      console.error(`Failed to send email: ${response.status} - ${errorText}`);
      return false;
    }
  } catch (e) {
    console.error('Email send error:', e);
    return false;
  }
}
