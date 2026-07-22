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
                theme_color: '#667eea',
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
    build: { outDir: 'dist', emptyOutDir: true },
    server: { port: 3000, open: true }
});
