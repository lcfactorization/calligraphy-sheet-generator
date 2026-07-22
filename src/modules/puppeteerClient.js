// Puppeteer 客户端：side-effect 脚本，绑定 #puppeteerBtn 点击事件
const SERVER_URL = 'http://localhost:3210';
const btn = document.getElementById('puppeteerBtn');
if (btn) {
    // 请求计数器，防止重复请求
    let requestInProgress = false;
    let requestId = 0;

    function showToast(msg, type, duration) {
        const existing = document.querySelector('.puppeteer-toast');
        if (existing) existing.remove();
        const t = document.createElement('div');
        t.className = 'puppeteer-toast ' + (type || 'info');
        t.textContent = msg;
        document.body.appendChild(t);
        const dur = duration || 5000;
        setTimeout(function(){ t.style.opacity = '0'; setTimeout(function(){ t.remove(); }, 300); }, dur);
    }

    btn.addEventListener('click', async function() {
        // 双重防抖：布尔变量 + disabled属性
        if (requestInProgress) {
            console.log('[Client] Request already in progress, ignoring click');
            return;
        }
        requestInProgress = true;
        btn.disabled = true;
        btn.style.opacity = '0.6';
        const currentRequestId = ++requestId;
        console.log('[Client] Starting request #' + currentRequestId);

        // Check server health
        let healthy = false;
        try {
            const r = await fetch(SERVER_URL + '/health', { method: 'GET' });
            if (r.ok) healthy = true;
        } catch (e) { healthy = false; }

        if (!healthy) {
            showToast('Puppeteer\u670d\u52a1\u672a\u542f\u52a8\uff01\u8bf7\u5148\u8fd0\u884c \u542f\u52a8Puppeteer.bat (Windows) \u6216 \u542f\u52a8Puppeteer.sh (Linux)', 'error', 8000);
            requestInProgress = false;
            btn.disabled = false;
            btn.style.opacity = '';
            return;
        }

        // Get current text and font
        const textEl = document.getElementById('inputText');
        const text = textEl ? textEl.value : '';
        const fontSelect = document.getElementById('font-select');
        const font = fontSelect ? fontSelect.options[fontSelect.selectedIndex].text : '\u59dc\u6d69\u786c\u7b14\u6977\u4e66';

        if (!text.trim()) {
            showToast('\u8bf7\u5148\u8f93\u5165\u8981\u751f\u6210\u5b57\u5e16\u7684\u6587\u672c', 'error');
            requestInProgress = false;
            btn.disabled = false;
            btn.style.opacity = '';
            return;
        }

        showToast('\u6b63\u5728\u751f\u6210\u77e2\u91cfPDF\uff0c\u8bf7\u7a0d\u5019...', 'info', 30000);

        // 使用 AbortController 设置超时（3分钟）
        const controller = new AbortController();
        const timeoutId = setTimeout(function() {
            controller.abort();
            console.log('[Client] Request #' + currentRequestId + ' timed out');
        }, 180000);

        try {
            const reqBody = JSON.stringify({
                text: text,
                font: font,
                format: 'a4',
                header: '',
                footer: '\u7b2c {page} \u9875 / \u5171 {total} \u9875'
            });
            console.log('[Client] Request #' + currentRequestId + ' body length: ' + reqBody.length + ' chars');

            const r = await fetch(SERVER_URL + '/api/generate-pdf', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json; charset=utf-8' },
                body: reqBody,
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            // 204 = 重复请求被跳过（浏览器自动重发），客户端忽略即可
            if (r.status === 204) {
                console.log('[Client] Request #' + currentRequestId + ' skipped by server (duplicate)');
                return;
            }

            if (!r.ok) {
                let errMsg = '\u672a\u77e5\u9519\u8bef';
                try { const err = await r.json(); errMsg = err.error || errMsg; } catch(e) {}
                showToast('PDF\u751f\u6210\u5931\u8d25: ' + errMsg, 'error', 8000);
                return;
            }

            const blob = await r.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            const now = new Date();
            const ts = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0') + '-' + String(now.getDate()).padStart(2,'0');
            a.download = '\u5b57\u5e16_' + ts + '.pdf';
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
            showToast('\u77e2\u91cfPDF\u751f\u6210\u6210\u529f\uff01', 'success');
        } catch (e) {
            clearTimeout(timeoutId);
            if (e.name === 'AbortError') {
                showToast('\u8bf7\u6c42\u8d85\u65f6\uff0c\u8bf7\u91cd\u8bd5', 'error', 8000);
            } else {
                showToast('\u8bf7\u6c42\u5931\u8d25: ' + e.message, 'error', 8000);
            }
        } finally {
            requestInProgress = false;
            btn.disabled = false;
            btn.style.opacity = '';
            console.log('[Client] Request #' + currentRequestId + ' completed');
        }
    });
}
