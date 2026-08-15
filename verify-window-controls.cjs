/**
 * verify-window-controls.cjs — v3.0.2 弹窗窗口控制验证脚本
 * 验证：设置/手动修改/智能推荐/学习报告 4 个弹窗
 *  1. 点击外部不关闭
 *  2. 最小化按钮生效（body 隐藏、高度收缩）
 *  3. 最大化按钮生效（尺寸扩大）
 *  4. 关闭按钮生效
 * 运行：node verify-window-controls.cjs
 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const DIST = path.join(__dirname, 'dist');
const PORT = 4175;

function startServer() {
  return new Promise((resolve, reject) => {
    const proc = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], {
      cwd: __dirname,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: process.platform === 'win32'
    });
    let out = '';
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) { settled = true; try { proc.kill(); } catch (e) {} reject(new Error('Server start timeout:\n' + out)); }
    }, 30000);
    const tryResolve = () => {
      if (settled) return;
      // 尝试 HTTP 连接确认就绪
      const net = require('net');
      const sock = net.connect(PORT, '127.0.0.1');
      sock.on('connect', () => {
        sock.destroy();
        settled = true;
        clearTimeout(timer);
        resolve(proc);
      });
      sock.on('error', () => {});
    };
    proc.stdout.on('data', d => { out += d.toString(); tryResolve(); });
    proc.stderr.on('data', d => { out += d.toString(); tryResolve(); });
    proc.on('exit', code => {
      clearTimeout(timer);
      if (!settled) { settled = true; reject(new Error('Server exited ' + code + ':\n' + out)); }
    });
  });
}

async function main() {
  let puppeteer;
  try {
    puppeteer = require('puppeteer');
  } catch (e) {
    console.error('✗ puppeteer 未安装（请先 npm i -D puppeteer）');
    process.exit(1);
  }
  const server = await startServer();
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  page.on('pageerror', e => console.error('  [pageerror]', e.message));
  page.on('console', m => { if (m.type() === 'error') console.error('  [console.error]', m.text().slice(0, 200)); });

  const results = [];
  const check = (name, ok, detail = '') => {
    results.push({ name, ok });
    console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`);
  };

  try {
    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'networkidle2', timeout: 60000 });

    // ── 工具函数：在页面内点击按钮 ──
    const clickSel = async (sel) => {
      const ok = await page.evaluate((s) => {
        const el = document.querySelector(s);
        if (!el) return false;
        el.click();
        return true;
      }, sel);
      return ok;
    };
    const getModalState = async (modalSel) => page.evaluate((s) => {
      const m = document.querySelector(s);
      if (!m) return null;
      const r = m.getBoundingClientRect();
      return {
        minimized: m.classList.contains('minimized'),
        maximized: m.classList.contains('maximized'),
        bodyDisplay: getComputedStyle(m.querySelector('.sc-body, .rec-body, .report-modal-body') || m).display,
        w: Math.round(r.width), h: Math.round(r.height)
      };
    }, modalSel);

    // ═══ 1. 设置中心弹窗 ═══
    console.log('\n── 设置中心弹窗 ──');
    await clickSel('.fab-settings');
    await new Promise(r => setTimeout(r, 500));
    let st = await getModalState('#settingsPanel .sc-modal');
    check('设置弹窗打开', !!st && !st.minimized && !st.maximized, JSON.stringify(st));
    // 点击遮罩外部（非 modal 区域）
    const overlayClick = await page.evaluate(() => {
      const ov = document.getElementById('settingsPanel');
      if (!ov) return false;
      // 点击 overlay 左上角（modal 外）
      const r = ov.getBoundingClientRect();
      ov.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: r.left + 5, clientY: r.top + 5 }));
      return true;
    });
    await new Promise(r => setTimeout(r, 400));
    st = await getModalState('#settingsPanel .sc-modal');
    check('点击外部不关闭设置弹窗', overlayClick && !!st, JSON.stringify(st));
    // 最小化
    await clickSel('#scMin');
    await new Promise(r => setTimeout(r, 300));
    st = await getModalState('#settingsPanel .sc-modal');
    check('设置弹窗最小化生效', st && st.minimized && st.h < 80, JSON.stringify(st));
    // 最大化（从最小化恢复并最大化）
    await clickSel('#scMax');
    await new Promise(r => setTimeout(r, 300));
    st = await getModalState('#settingsPanel .sc-modal');
    check('设置弹窗最大化生效', st && st.maximized && st.w > 600, JSON.stringify(st));
    // 再点最大化还原
    await clickSel('#scMax');
    await new Promise(r => setTimeout(r, 300));
    st = await getModalState('#settingsPanel .sc-modal');
    check('设置弹窗最大化还原', st && !st.maximized, JSON.stringify(st));
    // 最小化后再还原
    await clickSel('#scMin');
    await new Promise(r => setTimeout(r, 200));
    await clickSel('#scMin');
    await new Promise(r => setTimeout(r, 300));
    st = await getModalState('#settingsPanel .sc-modal');
    check('设置弹窗最小化还原', st && !st.minimized, JSON.stringify(st));
    // 关闭
    await clickSel('#scClose');
    await new Promise(r => setTimeout(r, 500));
    const scClosed = await page.evaluate(() => {
      const ov = document.getElementById('settingsPanel');
      return !ov || ov.style.display === 'none' || !ov.classList.contains('open');
    });
    check('设置弹窗关闭生效', scClosed);

    // ═══ 2. 手动修改弹窗 ═══
    console.log('\n── 手动修改弹窗 ──');
    // 手动修改弹窗：点击拼音组词字格行（.grid-svg-row）打开；页面默认已有字格
    const meOpened = await page.evaluate(() => {
      const row = document.querySelector('.grid-svg-row[data-grid-type="pinyin-zuci"]') || document.querySelector('.grid-svg-row[data-char]');
      if (!row) return 'no-row';
      row.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      return 'clicked:' + (row.getAttribute('data-char') || '');
    });
    await new Promise(r => setTimeout(r, 700));
    let meModal = await page.evaluate(() => {
      const ov = document.getElementById('manualEditOverlay');
      return ov ? { id: 'manualEditOverlay', exists: true } : { exists: false };
    });
    check('手动修改弹窗可打开', meModal.exists, meOpened + ' / ' + JSON.stringify(meModal));
    if (meModal.exists) {
      const meSel = '#' + meModal.id + ' .sc-modal';
      st = await getModalState(meSel);
      check('手动修改弹窗打开状态', !!st && !st.minimized, JSON.stringify(st));
      // 点击外部不关闭
      await page.evaluate((id) => {
        const ov = document.getElementById(id);
        if (!ov) return;
        const r = ov.getBoundingClientRect();
        ov.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: r.left + 5, clientY: r.top + 5 }));
      }, meModal.id);
      await new Promise(r => setTimeout(r, 400));
      st = await getModalState(meSel);
      check('手动修改弹窗点击外部不关闭', !!st, JSON.stringify(st));
      // 最小化
      await page.evaluate((id) => {
        const b = document.querySelector('#' + id + ' #meMin, #' + id + ' .sc-btn-min');
        if (b) b.click();
      }, meModal.id);
      await new Promise(r => setTimeout(r, 300));
      st = await getModalState(meSel);
      check('手动修改弹窗最小化生效', st && st.minimized, JSON.stringify(st));
      // 最大化
      await page.evaluate((id) => {
        const b = document.querySelector('#' + id + ' #meMax, #' + id + ' .sc-btn-max');
        if (b) b.click();
      }, meModal.id);
      await new Promise(r => setTimeout(r, 300));
      st = await getModalState(meSel);
      check('手动修改弹窗最大化生效', st && st.maximized, JSON.stringify(st));
      // 关闭
      await page.evaluate((id) => {
        const b = document.querySelector('#' + id + ' #meClose, #' + id + ' .sc-close');
        if (b) b.click();
      }, meModal.id);
      await new Promise(r => setTimeout(r, 400));
      const meClosed = await page.evaluate((id) => {
        const ov = document.getElementById(id);
        return !ov || ov.style.display === 'none' || ov.hidden;
      }, meModal.id);
      check('手动修改弹窗关闭生效', meClosed);
    }

    // ═══ 3. 智能推荐弹窗 ═══
    console.log('\n── 智能推荐弹窗 ──');
    const recBtn = await page.evaluate(() => {
      const b = document.querySelector('.rec-trigger');
      if (b) { b.click(); return true; }
      return false;
    });
    await new Promise(r => setTimeout(r, 500));
    st = await getModalState('.rec-modal');
    check('推荐弹窗打开', recBtn && !!st, JSON.stringify(st));
    if (st) {
      // 点击外部不关闭
      await page.evaluate(() => {
        const ov = document.getElementById('recOverlay');
        if (!ov) return;
        const r = ov.getBoundingClientRect();
        ov.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: r.left + 5, clientY: r.top + 5 }));
      });
      await new Promise(r => setTimeout(r, 400));
      st = await getModalState('.rec-modal');
      check('推荐弹窗点击外部不关闭', !!st, JSON.stringify(st));
      await page.evaluate(() => {
        const b = document.querySelector('.rec-btn-min');
        if (b) b.click();
      });
      await new Promise(r => setTimeout(r, 300));
      st = await getModalState('.rec-modal');
      check('推荐弹窗最小化生效', st && st.minimized, JSON.stringify(st));
      await page.evaluate(() => {
        const b = document.querySelector('.rec-btn-max');
        if (b) b.click();
      });
      await new Promise(r => setTimeout(r, 300));
      st = await getModalState('.rec-modal');
      check('推荐弹窗最大化生效', st && st.maximized, JSON.stringify(st));
      await page.evaluate(() => {
        const b = document.querySelector('.rec-close');
        if (b) b.click();
      });
      await new Promise(r => setTimeout(r, 400));
      const recClosed = await page.evaluate(() => {
        const ov = document.getElementById('recOverlay');
        return !ov || ov.hidden;
      });
      check('推荐弹窗关闭生效', recClosed);
    }

    // ═══ 4. 学习报告弹窗 ═══
    console.log('\n── 学习报告弹窗 ──');
    const rpBtn = await page.evaluate(() => {
      // 学习报告按钮：找 data 或文案
      const btn = [...document.querySelectorAll('button')].find(b => /学习报告|报告/.test(b.textContent) && b.offsetParent !== null);
      if (btn) { btn.click(); return true; }
      return false;
    });
    await new Promise(r => setTimeout(r, 600));
    st = await getModalState('.report-modal');
    check('报告弹窗打开', rpBtn && !!st, JSON.stringify(st));
    if (st) {
      await page.evaluate(() => {
        const ov = document.getElementById('reportModalOverlay');
        if (!ov) return;
        const r = ov.getBoundingClientRect();
        ov.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: r.left + 5, clientY: r.top + 5 }));
      });
      await new Promise(r => setTimeout(r, 400));
      st = await getModalState('.report-modal');
      check('报告弹窗点击外部不关闭', !!st, JSON.stringify(st));
      await page.evaluate(() => { const b = document.getElementById('reportMin'); if (b) b.click(); });
      await new Promise(r => setTimeout(r, 300));
      st = await getModalState('.report-modal');
      check('报告弹窗最小化生效', st && st.minimized, JSON.stringify(st));
      await page.evaluate(() => { const b = document.getElementById('reportMax'); if (b) b.click(); });
      await new Promise(r => setTimeout(r, 300));
      st = await getModalState('.report-modal');
      check('报告弹窗最大化生效', st && st.maximized, JSON.stringify(st));
      await page.evaluate(() => { const b = document.getElementById('reportModalClose'); if (b) b.click(); });
      await new Promise(r => setTimeout(r, 400));
      const rpClosed = await page.evaluate(() => {
        const ov = document.getElementById('reportModalOverlay');
        return !ov || !ov.classList.contains('open');
      });
      check('报告弹窗关闭生效', rpClosed);
    }

    // ═══ 汇总 ═══
    const failed = results.filter(r => !r.ok);
    console.log(`\n═══ 结果：${results.length - failed.length}/${results.length} 通过 ═══`);
    if (failed.length) {
      console.log('失败项：');
      failed.forEach(f => console.log('  ✗ ' + f.name));
      process.exitCode = 1;
    }
  } catch (err) {
    console.error('\n✗ 验证异常：', err.message);
    process.exitCode = 1;
  } finally {
    await browser.close().catch(() => {});
    try { server.kill(); } catch (e) {}
  }
}

main();
