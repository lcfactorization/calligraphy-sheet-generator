#!/usr/bin/env node
/**
 * v3.1.1：Cloudflare Pages 一键部署脚本（本地凭据驱动）
 * 读取 .env.cloudflare（gitignored）中的 CLOUDFLARE_API_TOKEN 等配置，
 * 调用 wrangler pages deploy dist 上传构建产物（含 Pages Functions 与 D1 绑定）。
 *
 * 用法：npm run deploy:cf   （先 npm run build）
 * 凭据有效期 1 年（见 .env.cloudflare 内注释），到期更换该文件中的 token 即可。
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const ENV_FILE = path.join(ROOT, '.env.cloudflare');

if (!fs.existsSync(ENV_FILE)) {
    console.error('[deploy-cf] 未找到 ' + ENV_FILE + ' —— 请创建并填入 CLOUDFLARE_API_TOKEN（有效期 1 年）');
    process.exit(1);
}
const env = {};
for (const line of fs.readFileSync(ENV_FILE, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].trim();
}
if (!env.CLOUDFLARE_API_TOKEN) {
    console.error('[deploy-cf] .env.cloudflare 缺少 CLOUDFLARE_API_TOKEN');
    process.exit(1);
}
const project = env.CLOUDFLARE_PAGES_PROJECT || 'calligraphy-sheet-generator';
const branch = env.CLOUDFLARE_PAGES_BRANCH || 'retake';
console.log('[deploy-cf] 项目=' + project + ' 分支=' + branch + ' 产物=dist（token 已从本地凭据读取）');

const r = spawnSync('npx', ['wrangler', 'pages', 'deploy', 'dist',
    '--project-name', project, '--branch', branch, '--commit-dirty=true'], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: { ...process.env, CLOUDFLARE_API_TOKEN: env.CLOUDFLARE_API_TOKEN },
    cwd: ROOT
});
process.exit(r.status || 0);
