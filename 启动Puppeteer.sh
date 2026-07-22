#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# 字帖生成器 - 矢量PDF工具 (Linux 启动脚本)
# 功能：自动检查环境 → 启动本地服务 → 打开浏览器 → 一键生成矢量PDF
# ═══════════════════════════════════════════════════════════════

# 确保 UTF-8 编码（bash 默认 UTF-8，但显式声明以避免环境问题）
export LC_ALL=en_US.UTF-8
export LANG=en_US.UTF-8

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HTML_FILE="$SCRIPT_DIR/字帖生成器.html"
PORT=3210

echo "═══════════════════════════════════════════════════════════"
echo "       字帖生成器 - 矢量PDF工具 (Linux)"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "功能：在浏览器中一键生成可复制文字的矢量PDF字帖"
echo "特点：字体完整嵌入，Adobe Reader 可直接选择/复制文字"
echo ""

# ───────── 步骤1：检查 Node.js ─────────
echo "[1/4] 检查 Node.js 运行环境..."
if ! command -v node &> /dev/null; then
    echo ""
    echo "[X] 未找到 Node.js！"
    echo "    请先安装 Node.js (v18 或以上版本)："
    echo "    https://nodejs.org/en/download/"
    echo ""
    exit 1
fi
NODE_VERSION=$(node -v)
echo "      Node.js 版本: $NODE_VERSION  √"
echo ""

# ───────── 步骤2：检查 HTML 文件 ─────────
echo "[2/4] 检查字帖生成器文件..."
if [ ! -f "$HTML_FILE" ]; then
    echo ""
    echo "[X] 找不到核心文件: $HTML_FILE"
    echo "    请确保本脚本与字帖生成器.html 在同一文件夹中。"
    exit 1
fi
echo "      文件检查通过  √"
echo ""

# ───────── 步骤3：检查/安装 Puppeteer ─────────
echo "[3/4] 检查 Puppeteer 模块..."
PUPPETEER_DIR="$SCRIPT_DIR/node_modules/puppeteer"
PUPPETEER_PARENT_DIR="$SCRIPT_DIR/../node_modules/puppeteer"

if [ -d "$PUPPETEER_DIR" ] || [ -d "$PUPPETEER_PARENT_DIR" ]; then
    echo "      Puppeteer 已就绪  √"
else
    echo "      首次运行，正在自动安装 Puppeteer (约200MB，请耐心等待)..."
    echo "      如果长时间无响应，可手动运行: npm install puppeteer"
    echo ""
    cd "$SCRIPT_DIR"
    npm install puppeteer --no-fund --no-audit 2>&1 | grep -v "npm warn" | grep -v "^$"
    if [ $? -ne 0 ] || [ ! -d "$PUPPETEER_DIR" ]; then
        echo ""
        echo "[X] Puppeteer 安装失败！"
        echo "    请手动运行以下命令："
        echo "      cd \"$SCRIPT_DIR\""
        echo "      npm install puppeteer"
        exit 1
    fi
    echo "      Puppeteer 安装完成  √"
fi
echo ""

# ───────── 步骤4：提取服务器代码并启动 ─────────
echo "[4/4] 正在启动服务..."
TEMP_DIR=$(mktemp -d /tmp/puppeteer-pdf-XXXXXX)
TEMP_JS="$TEMP_DIR/server.js"

python3 -c "
import re
with open('$HTML_FILE', 'r', encoding='utf-8') as f:
    html = f.read()
m = re.search(r'// PUPPETEER_SERVER_BEGIN(.*?)// PUPPETEER_SERVER_END', html, re.DOTALL)
if m:
    with open('$TEMP_JS', 'w', encoding='utf-8') as f:
        f.write(m.group(1))
else:
    exit(1)
"

if [ $? -ne 0 ]; then
    echo "[X] 未能从HTML中提取服务器代码"
    rm -rf "$TEMP_DIR"
    exit 1
fi

export PUPPETEER_HTML_DIR="$SCRIPT_DIR"
export NODE_PATH="$SCRIPT_DIR/node_modules:$SCRIPT_DIR/../node_modules"

echo ""
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "                  使用说明（很简单）"
echo ""
echo "  1. 浏览器已自动打开字帖生成器页面"
echo "  2. 在页面输入框中输入要练习的汉字"
echo "  3. 选择喜欢的字体"
echo "  4. 点击页面右上角的紫色「生成矢量PDF」按钮"
echo "  5. PDF 会自动下载到浏览器默认下载文件夹"
echo ""
echo "  生成的 PDF 特点："
echo "    - 矢量图形，放大不失真"
echo "    - 汉字和拼音字体完整嵌入"
echo "    - 可在 Adobe Reader 中直接选择、复制、搜索文字"
echo ""
echo "  关闭本窗口可退出服务（或按 Ctrl+C）"
echo ""
echo "═══════════════════════════════════════════════════════════"
echo ""

node "$TEMP_JS"

# Cleanup on exit
rm -rf "$TEMP_DIR"
echo ""
echo "服务已停止。感谢使用！"
