/**
 * Cron Worker - 每日访问统计报告
 *
 * 功能：
 * 1. 每天北京时间 08:00 自动触发
 * 2. 调用 Pages Functions 的 /api/report 端点生成报告
 * 3. 通过 Resend API 发送 Markdown 格式的邮件报告
 * 4. 支持手动触发（通过 HTTP 请求）
 *
 * @version 1.0.0
 */

export default {
  /**
   * 定时任务触发
   */
  async scheduled(event, env, ctx) {
    console.log(`[Cron] Triggered at ${new Date().toISOString()}`);

    // 计算昨天的日期（北京时间 UTC+8）
    const now = new Date();
    const bjTime = new Date(now.getTime() + 8 * 3600 * 1000);
    const yesterday = new Date(bjTime.getTime() - 86400 * 1000);
    const dateStr = yesterday.toISOString().slice(0, 10);

    console.log(`[Cron] Generating report for ${dateStr}`);

    try {
      // 调用 Pages Functions 的报告 API
      const reportUrl = `${env.SITE_URL}/api/report?date=${dateStr}`;
      const response = await fetch(reportUrl, {
        headers: {
          'X-Cron-Secret': env.CRON_SECRET
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[Cron] Report API error: ${response.status} - ${errorText}`);
        await sendErrorNotification(dateStr, errorText, env);
        return;
      }

      const result = await response.json();
      console.log(`[Cron] Report generated:`, JSON.stringify(result));

    } catch (e) {
      console.error(`[Cron] Error:`, e);
      await sendErrorNotification(dateStr, e.message, env);
    }
  },

  /**
   * HTTP 请求处理（手动触发）
   *
   * 用法：
   * GET /                    - 状态页面
   * GET /trigger?date=YYYY-MM-DD  - 手动触发指定日期的报告
   * GET /status              - 查看 Worker 状态
   */
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // 状态页面
    if (url.pathname === '/' || url.pathname === '/status') {
      return Response.json({
        name: 'calligraphy-analytics-cron',
        version: '1.0.0',
        status: 'active',
        cron: '0 0 * * * (UTC) = 每天北京时间 08:00',
        site_url: env.SITE_URL,
        report_email: env.REPORT_EMAIL || 'lcfactorization@gmail.com',
        resend_configured: !!env.RESEND_API_KEY,
        current_time: new Date().toISOString(),
        bj_time: new Date(Date.now() + 8 * 3600 * 1000).toISOString().replace('T', ' ').slice(0, 19) + ' (UTC+8)'
      });
    }

    // 手动触发报告
    if (url.pathname === '/trigger') {
      const secret = url.searchParams.get('secret') || request.headers.get('X-Cron-Secret');
      if (secret !== env.CRON_SECRET) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
      }

      const date = url.searchParams.get('date') ||
                   new Date(Date.now() - 86400 * 1000).toISOString().slice(0, 10);

      try {
        const reportUrl = `${env.SITE_URL}/api/report?date=${date}`;
        const response = await fetch(reportUrl, {
          headers: {
            'X-Cron-Secret': env.CRON_SECRET
          }
        });

        const result = await response.json();
        return Response.json({
          success: response.ok,
          date,
          result,
          triggered_at: new Date().toISOString()
        });
      } catch (e) {
        return Response.json({
          success: false,
          error: e.message,
          date
        }, { status: 500 });
      }
    }

    return Response.json({ error: 'Not found' }, { status: 404 });
  }
};

/**
 * 发送错误通知邮件
 */
async function sendErrorNotification(date, errorMsg, env) {
  if (!env.RESEND_API_KEY) return false;

  const senderEmail = env.SENDER_EMAIL || 'onboarding@resend.dev';
  const recipientEmail = env.REPORT_EMAIL || 'lcfactorization@gmail.com';

  const content = `# 报告生成失败通知

**日期**: ${date}
**错误时间**: ${new Date().toISOString()}
**错误信息**: ${errorMsg}

请检查：
1. D1 数据库是否正常运行
2. Pages Functions 是否部署成功
3. CRON_SECRET 环境变量是否一致
4. 查看 Cloudflare Worker 日志获取更多信息
`;

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
        subject: `[警告] 字帖生成器访问统计报告生成失败 - ${date}`,
        text: content
      })
    });
    return response.ok;
  } catch (e) {
    console.error('Error notification failed:', e);
    return false;
  }
}