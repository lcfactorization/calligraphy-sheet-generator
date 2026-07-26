#!/usr/bin/env bash
set -u
export LC_ALL=en_US.UTF-8 LANG=en_US.UTF-8
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PORT=3210

echo "═══════════════════════════════════════════════════"
echo "  字帖生成器 - Puppeteer 矢量PDF服务"
echo "═══════════════════════════════════════════════════"
echo ""

# 1. Check Node.js (with nodejs fallback for some Linux distros)
echo "[1/4] 检查 Node.js..."
NODE_BIN=""
if command -v node &> /dev/null; then
    NODE_BIN="node"
elif command -v nodejs &> /dev/null; then
    NODE_BIN="nodejs"
else
    echo "[X] 未找到 Node.js，请安装: https://nodejs.org/"
    read -rp "按回车退出..."
    exit 1
fi
echo "      $(${NODE_BIN} -v)  √"

# 2. Check dist, build if missing
echo "[2/4] 检查构建产物..."
if [ ! -f "$SCRIPT_DIR/dist/index.html" ]; then
    echo "      正在构建..."
    (cd "$SCRIPT_DIR" && npm run build 2>&1) | grep -v "^$"
fi
if [ -f "$SCRIPT_DIR/dist/index.html" ]; then
    echo "      构建产物就绪  √"
else
    echo "[X] 构建失败"
    read -rp "按回车退出..."
    exit 1
fi

# 3. Check Puppeteer
echo "[3/4] 检查 Puppeteer..."
if [ ! -d "$SCRIPT_DIR/node_modules/puppeteer" ]; then
    echo "      安装 Puppeteer..."
    (cd "$SCRIPT_DIR" && npm install puppeteer --no-fund --no-audit 2>&1) | grep -v "^$"
fi
if [ -d "$SCRIPT_DIR/node_modules/puppeteer" ]; then
    echo "      Puppeteer 就绪  √"
else
    echo "[X] Puppeteer 安装失败，请手动: npm install puppeteer"
    read -rp "按回车退出..."
    exit 1
fi

# 4. 检查端口占用 — 检查 $PORT 是否被占用，让用户选择是否关闭原进程
echo "[4/4] 检查端口占用..."
PORT_PID=""
PORT_OCCUPIED=false
# macOS 默认 lsof 可用；Linux 优先 ss，再 netstat；按可用性自动选择
if command -v lsof &> /dev/null; then
    if lsof -i:"$PORT" &> /dev/null; then
        PORT_OCCUPIED=true
        PORT_PID="$(lsof -i:"$PORT" -t 2>/dev/null | head -n1)"
    fi
elif command -v ss &> /dev/null; then
    if ss -tln 2>/dev/null | grep -qE ":$PORT\b"; then
        PORT_OCCUPIED=true
        PORT_PID="$(ss -tlnp 2>/dev/null | grep -E ":$PORT\b" | grep -oE 'pid=[0-9]+' | head -n1 | cut -d= -f2)"
    fi
elif command -v netstat &> /dev/null; then
    if netstat -tln 2>/dev/null | grep -qE ":$PORT\b"; then
        PORT_OCCUPIED=true
        PORT_PID="$(netstat -tlnp 2>/dev/null | grep -E ":$PORT\b" | grep -oE '[0-9]+/' | head -n1 | cut -d/ -f1)"
    fi
fi

if [ "$PORT_OCCUPIED" = true ]; then
    if [ -n "$PORT_PID" ]; then
        PORT_COMM="$(ps -p "$PORT_PID" -o comm= 2>/dev/null | head -n1)"
        [ -z "$PORT_COMM" ] && PORT_COMM="(进程信息不可用)"
        echo ""
        echo "═══════════════════════════════════════════════════"
        echo "  [警告] 端口 $PORT 已被占用！"
        echo "  占用进程: $PORT_COMM (PID: $PORT_PID)"
        echo "═══════════════════════════════════════════════════"
        echo ""
        choice=""
        read -rp "是否关闭占用进程并继续启动？(Y=关闭并继续 / N=退出) " choice
        case "$choice" in
            [Yy])
                if kill -9 "$PORT_PID" 2>/dev/null; then
                    echo "      已关闭进程 $PORT_PID，等待端口释放..."
                    sleep 2
                else
                    echo "[X] 无法关闭进程 $PORT_PID（可能需要 sudo 权限）"
                    read -rp "按回车退出..."
                    exit 1
                fi
                ;;
            *)
                echo "  用户取消，退出脚本。"
                exit 0
                ;;
        esac
    else
        echo ""
        echo "═══════════════════════════════════════════════════"
        echo "  [警告] 端口 $PORT 已被占用！"
        echo "  占用进程: (PID 不可用，可能属于其他用户或需要 sudo 权限)"
        echo "═══════════════════════════════════════════════════"
        echo ""
        echo "  请手动关闭占用 $PORT 的进程后重试，或使用 sudo 运行本脚本。"
        read -rp "按回车退出..."
        exit 1
    fi
else
    echo "      端口 $PORT 可用  √"
fi

echo ""
echo "服务启动中... 浏览器将自动打开"
echo "按 Ctrl+C 退出"
echo ""

export NODE_PATH="$SCRIPT_DIR/node_modules:$SCRIPT_DIR/../node_modules"
# 服务异常退出后暂停，防止闪退看不到错误信息（仿 .ps1 第 84-92 行）
"$NODE_BIN" "$SCRIPT_DIR/puppeteer-server.cjs"
EXIT_CODE=$?
if [ "$EXIT_CODE" -ne 0 ]; then
    echo ""
    echo "[错误] 服务异常退出，退出码: $EXIT_CODE"
fi
echo ""
read -rp "服务已停止，按回车退出..."
