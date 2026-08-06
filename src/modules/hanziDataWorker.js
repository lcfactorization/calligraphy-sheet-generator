// 汉字数据解压 Web Worker（v2.9.8 新增）
// 职责：在后台线程 fetch + gunzip 解压 hanzi-data.bin，避免阻塞主线程。
// 解压完成后把整个字典对象 postMessage 给主线程，Worker 自行终止（释放内存）。

import { gunzipSync } from 'fflate';

self.onmessage = async (e) => {
    const msg = e.data || {};
    if (msg.type !== 'load') return;

    const url = msg.url;
    try {
        const resp = await fetch(url);
        if (!resp.ok) {
            self.postMessage({ type: 'error', error: `fetch ${url} 失败: HTTP ${resp.status}` });
            return;
        }
        const buf = await resp.arrayBuffer();
        const compressed = new Uint8Array(buf);

        // gunzipSync 是同步密集计算，放在 Worker 中避免阻塞主线程
        const decompressed = gunzipSync(compressed);

        // UTF-8 解码（汉字占 3 字节）
        const jsonStr = new TextDecoder('utf-8').decode(decompressed);
        const map = JSON.parse(jsonStr);

        // 把整个字典传给主线程，Worker 终止（主线程持有唯一副本）
        self.postMessage({ type: 'ready', map });
        self.close();
    } catch (err) {
        self.postMessage({ type: 'error', error: err && err.message ? err.message : String(err) });
    }
};
