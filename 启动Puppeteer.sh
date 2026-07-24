#!/bin/bash
export LC_ALL=en_US.UTF-8 LANG=en_US.UTF-8
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "═══════════════════════════════════════════════════"
echo "  字帖生成器 - Puppeteer 矢量PDF服务"
echo "═══════════════════════════════════════════════════"
echo ""

# 1. Check Node.js
echo "[1/3] 检查 Node.js..."
if ! command -v node &> /dev/null; then echo "[X] 未找到 Node.js"; exit 1; fi
echo "      $(node -v)  √"

# 2. Check dist, build if missing
echo "[2/3] 检查构建产物..."
if [ ! -f "$SCRIPT_DIR/dist/index.html" ]; then
    echo "      正在构建..."
    cd "$SCRIPT_DIR" && npm run build 2>&1 | grep -v "^$"
fi
[ -f "$SCRIPT_DIR/dist/index.html" ] && echo "      构建产物就绪  √" || { echo "[X] 构建失败"; exit 1; }

# 3. Check Puppeteer
echo "[3/3] 检查 Puppeteer..."
if [ ! -d "$SCRIPT_DIR/node_modules/puppeteer" ]; then
    echo "      安装 Puppeteer..."
    cd "$SCRIPT_DIR" && npm install puppeteer --no-fund --no-audit 2>&1 | grep -v "^$"
fi
[ -d "$SCRIPT_DIR/node_modules/puppeteer" ] && echo "      Puppeteer 就绪  √" || { echo "[X] 安装失败"; exit 1; }

echo ""
echo "服务启动中... 浏览器将自动打开"
echo "按 Ctrl+C 退出"
echo ""

export NODE_PATH="$SCRIPT_DIR/node_modules:$SCRIPT_DIR/../node_modules"
node "$SCRIPT_DIR/puppeteer-server.cjs"
