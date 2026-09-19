#!/bin/bash
# ============================================================
# 字帖生成器 - 字体完整性校验（CI 与本地通用）
# ============================================================
# 4 个 woff2 字体随仓库分发（public/fonts/）。构建与运行时都只引用 woff2，
# 因此本脚本只做「存在性 + 文件头 + 体积」校验，不做任何下载或格式转换。
#
# ── 为什么不再在 CI 里下载字体（v3.0.5 部署修复，2026-09-19）────────────
# 原先由 scripts/download-fonts.sh 下载 TTF/OTF，再用 fontTools 转成 woff2。
# 该链路双重失效，并在 `set -e` 下中断了整个构建 —— 这正是 v3.0.4 起
# 每次部署都失败、线上一直停在 v3.0.3 的直接原因：
#   1) pip3 install fonttools brotli 在 GitHub 的 Ubuntu 24.04 runner 上
#      触发 PEP 668（error: externally-managed-environment），安装即失败；
#   2) TW-Kai 的唯一上游 https://github.com/anthonyfok/TW-Kai 已 404（仓库被删），
#      curl 把 404 HTML 当成字体写入，TTFont() 解析时抛错。
# 现改为「字体入库 + 只做校验」：构建不再依赖任何外部 URL、pip 或字体转换工具。
#
# ── 字体来源与许可 ──────────────────────────────────────────────
#   LXGWWenKai-Regular.woff2     霞鹜文楷 Regular     SIL OFL 1.1
#   LXGWWenKai-Light.woff2       霞鹜文楷 Light       SIL OFL 1.1
#     https://github.com/lxgw/LxgwWenKai/releases
#   SourceHanSerifSC-Regular.woff2  思源宋体 SC        SIL OFL 1.1
#     https://github.com/adobe-fonts/source-han-serif/releases （2.002R / 09_SourceHanSerifSC.zip）
#   TW-Kai.woff2                 文鼎楷体（全字库正楷体）
#     ⚠ 上游 anthonyfok/TW-Kai 已失效。此文件是 v3.0.4 的转换产物，
#       现作为唯一副本随仓库保留，请勿删除。许可见 THIRD_PARTY_NOTICES.md 与 ARPHICPL.TXT。
#   完整第三方署名见仓库根目录 THIRD_PARTY_NOTICES.md。
#
# 用法：
#   bash scripts/verify-fonts.sh      # 校验；任一缺失/损坏即非零退出
# ============================================================

set -uo pipefail

FONTS_DIR="public/fonts"
EXPECTED=(
  "LXGWWenKai-Regular.woff2"
  "LXGWWenKai-Light.woff2"
  "SourceHanSerifSC-Regular.woff2"
  "TW-Kai.woff2"
)

# woff2 文件头魔数：ASCII "wOF2"
WOFF2_MAGIC="wOF2"
# 最小合理体积（字节）。真实字体均为 8-17 MB，用 100 KB 兜住「下载到错误内容」这类情况。
MIN_BYTES=100000

fail=0
echo "Verifying bundled fonts in $FONTS_DIR ..."

for name in "${EXPECTED[@]}"; do
  path="$FONTS_DIR/$name"

  if [ ! -f "$path" ]; then
    echo "  MISSING   $name"
    fail=1
    continue
  fi

  size=$(wc -c < "$path" | tr -d ' ')
  magic=$(head -c 4 "$path")

  if [ "$size" -lt "$MIN_BYTES" ]; then
    echo "  TOO SMALL $name ($size bytes < $MIN_BYTES)"
    fail=1
  elif [ "$magic" != "$WOFF2_MAGIC" ]; then
    echo "  BAD MAGIC $name (got '$magic', want '$WOFF2_MAGIC')"
    fail=1
  else
    echo "  OK        $name  ($size bytes)"
  fi
done

if [ "$fail" -ne 0 ]; then
  echo ""
  echo "ERROR: 随仓库分发的字体缺失或损坏。"
  echo "       这些 woff2 属于版本库内容（见 .gitignore 中的 public/fonts/ 规则）。"
  echo "       恢复方式：git checkout -- public/fonts/"
  echo "       详见 scripts/verify-fonts.sh 顶部注释与 THIRD_PARTY_NOTICES.md。"
  exit 1
fi

echo "All ${#EXPECTED[@]} bundled fonts verified."
