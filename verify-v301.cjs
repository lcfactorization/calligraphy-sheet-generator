// v3.0.1 功能验证脚本：多 Key 管理 + 帮助页面 + 手动修改
// 用法：node verify-v301.cjs
const puppeteer = require('puppeteer');

(async () => {
  const BASE = 'http://127.0.0.1:4173/';
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const results = [];
  const check = (name, ok, extra = '') => {
    results.push({ name, ok, extra });
    console.log(`${ok ? '✅' : '❌'} ${name}${extra ? ' — ' + extra : ''}`);
  };

  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
    page.on('pageerror', err => errors.push(err.message));

    await page.goto(BASE, { waitUntil: 'networkidle0', timeout: 60000 });
    await new Promise(r => setTimeout(r, 1500));

    // 1. 页面加载
    check('页面加载', true, `title=${await page.title()}`);

    // 2. 标题为"字帖生成器"（公开发布版名称，非个人版）
    const title = await page.evaluate(() => document.querySelector('h1')?.textContent || '');
    check('标题为字帖生成器（无个人版名称）', !title.includes('帅小呆'), title.trim());

    // 3. 帮助链接包含 API Key 使用
    const links = await page.evaluate(() =>
      Array.from(document.querySelectorAll('a.header-guide-link')).map(a => a.textContent.trim())
    );
    check('帮助链接含「🔑 API Key 使用」', links.some(l => l.includes('API Key')), links.join(' | '));
    check('帮助链接含「📥 导入与修改」', links.some(l => l.includes('导入')), links.join(' | '));

    // 4. 打开设置面板，验证多 Key 下拉
    await page.click('#settingsBtn').catch(() => {});
    await new Promise(r => setTimeout(r, 800));
    const keyUI = await page.evaluate(() => {
      const select = document.querySelector('#scAiKeySelect');
      const importBtn = document.querySelector('#scAiKeyImport');
      const toggleBtn = document.querySelector('#scAiKeyToggle');
      return {
        hasSelect: !!select,
        hasImport: !!importBtn,
        hasToggle: !!toggleBtn,
        selectOptions: select ? Array.from(select.options).map(o => o.textContent.trim()) : []
      };
    });
    check('设置面板含 Key 下拉（scAiKeySelect）', keyUI.hasSelect, `options=${JSON.stringify(keyUI.selectOptions)}`);
    check('设置面板含「从文件添加 Key」按钮', keyUI.hasImport);
    check('设置面板含显示/隐藏按钮', keyUI.hasToggle);

    // 5. 添加 Key 流程：选择 __add_new__ → 输入 → 确认
    await page.evaluate(() => {
      const select = document.querySelector('#scAiKeySelect');
      select.value = '__add_new__';
      select.dispatchEvent(new Event('change'));
    });
    await new Promise(r => setTimeout(r, 500));
    const inlineVisible = await page.evaluate(() => {
      const row = document.querySelector('#scAiKeyInlineRow');
      return row && row.style.display !== 'none';
    });
    check('选择「＋ 添加新 Key…」展开内联输入行', inlineVisible);

    // 6. 输入测试 Key 并确认（用原生 setter 设置值，兼容 Vue/React 受控输入）
    await page.evaluate(() => {
      const input = document.querySelector('#scAiKeyInlineNew');
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(input, 'sk-test1234567890abcdefghijklmnop');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await new Promise(r => setTimeout(r, 300));
    await page.evaluate(() => document.querySelector('#scAiKeyInlineAdd').click());
    await new Promise(r => setTimeout(r, 1200));
    const afterAdd = await page.evaluate(() => {
      const select = document.querySelector('#scAiKeySelect');
      return Array.from(select.options).map(o => o.textContent.trim());
    });
    check('添加 Key 后下拉出现新 Key（打码显示）', afterAdd.some(o => o.includes('sk-') && o.includes('…') && o.includes('DeepSeek')), JSON.stringify(afterAdd));
    const masked = afterAdd.find(o => o.includes('sk-')) || '';
    check('Key 打码显示（不泄露完整值）', masked.includes('…') && !masked.includes('sk-test1234567890'), masked);

    // 7. 关闭设置面板
    await page.keyboard.press('Escape');
    await new Promise(r => setTimeout(r, 300));

    // 8. 检查 api-key-guide.html 页面
    await page.goto(BASE + 'api-key-guide.html', { waitUntil: 'networkidle0', timeout: 30000 });
    const guideText = await page.evaluate(() => document.body.textContent);
    check('api-key-guide.html 可访问', guideText.length > 500, `len=${guideText.length}`);
    check('api-key-guide.html 无个人版名称', !guideText.includes('帅小呆'));
    check('api-key-guide.html 提及多 Key 管理', guideText.includes('多个') || guideText.includes('多 Key') || guideText.includes('下拉'));

    // 9. 检查 import-guide.html 页面
    await page.goto(BASE + 'import-guide.html', { waitUntil: 'networkidle0', timeout: 30000 });
    const importText = await page.evaluate(() => document.body.textContent);
    check('import-guide.html 可访问', importText.length > 500, `len=${importText.length}`);
    check('import-guide.html 无个人版名称', !importText.includes('帅小呆'));

    // 10. JS 错误检查（排除 favicon 404 等静态资源请求）
    const jsErrors = errors.filter(e => !e.includes('favicon') && !e.includes('Failed to load resource'));
    check('无 JS 运行时错误', jsErrors.length === 0, jsErrors.slice(0, 3).join(' || '));

  } catch (e) {
    check('验证流程执行', false, e.message);
  } finally {
    await browser.close();
    const failed = results.filter(r => !r.ok).length;
    console.log(`\n===== 结果：${results.length - failed}/${results.length} 通过 =====`);
    process.exit(failed > 0 ? 1 : 0);
  }
})();
