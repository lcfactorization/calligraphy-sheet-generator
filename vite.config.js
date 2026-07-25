import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { viteSingleFile } from 'vite-plugin-singlefile';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
    base: './',
    plugins: [
        tailwindcss(),
        viteSingleFile(),
        VitePWA({
            registerType: 'autoUpdate',
            manifest: {
                name: '字帖生成器',
                short_name: '字帖',
                description: '离线汉字字帖生成工具',
                lang: 'zh-CN',
                theme_color: '#9E2A2B',
                background_color: '#ffffff',
                display: 'standalone',
                start_url: './',
                scope: './',
                icons: [
                    { src: 'icon-192.svg', sizes: '192x192', type: 'image/svg+xml', purpose: 'any' },
                    { src: 'icon-512.svg', sizes: '512x512', type: 'image/svg+xml', purpose: 'any' },
                    { src: 'icon-192-maskable.svg', sizes: '192x192', type: 'image/svg+xml', purpose: 'maskable' }
                ]
            },
            workbox: {
                globPatterns: ['**/*.{js,css,html,svg,png,woff,woff2,ttf,otf}'],
                maximumFileSizeToCacheInBytes: 41943040,
                runtimeCaching: [{
                    urlPattern: /\.(?:woff2?|ttf|otf)$/,
                    handler: 'CacheFirst',
                    options: {
                        cacheName: 'fonts-cache',
                        expiration: { maxEntries: 20, maxAgeSeconds: 60*60*24*365 }
                    }
                }]
            }
        })
    ],
    build: {
        outDir: 'dist',
        emptyOutDir: true,
        // v2.8.4：禁用 CSS 压缩，确保 @media print 关键规则（min-height:295mm、
        // page-break-after:always、break-after:page、移动端断点、var(--grid-primary-color)）
        // 不被 esbuild 压缩器合并/丢弃。MatePad 打印分页与页眉页脚依赖这些规则。
        cssMinify: false,
        // 保留 ES2020+ 语法，避免 target 过低触发额外转换
        target: 'es2020',
        cssTarget: 'chrome89'
    },
    server: { port: 3000, open: true },
    preview: { port: 4173, open: false }
});
