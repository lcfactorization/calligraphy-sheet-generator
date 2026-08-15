#!/bin/bash
# 在CI构建时下载开源字体
# v3.0.1：合并个人版优化策略注释，保持 distribution 的完整字体下载逻辑
#   - distribution 使用 GitHub Pages（无 25MB 单文件限制），可直接下载 TTF/OTF
#   - 个人版使用 Cloudflare Pages（25MB 限制），大型字体改 CDN 运行时加载
#   - 拼音字体 texgyreadventor 已通过 base64 内嵌在 fontManager.js 中，无需下载文件
#   - 商业字体（方正/姜浩/田英章/我逸清晨体）不纳入开源 distribution
set -e

FONTS_DIR="public/fonts"
mkdir -p "$FONTS_DIR"

echo "Downloading open-source fonts..."

# 霞鹜文楷 Regular (~15MB TTF)
if [ ! -f "$FONTS_DIR/LXGWWenKai-Regular.ttf" ]; then
  echo "  Downloading LXGWWenKai-Regular.ttf..."
  curl -L -o "$FONTS_DIR/LXGWWenKai-Regular.ttf" \
    "https://github.com/lxgw/LxgwWenKai/releases/latest/download/LXGWWenKai-Regular.ttf"
fi

# 霞鹜文楷 Light (~27MB TTF)
if [ ! -f "$FONTS_DIR/LXGWWenKai-Light.ttf" ]; then
  echo "  Downloading LXGWWenKai-Light.ttf..."
  curl -L -o "$FONTS_DIR/LXGWWenKai-Light.ttf" \
    "https://github.com/lxgw/LxgwWenKai/releases/latest/download/LXGWWenKai-Light.ttf"
fi

# 思源宋体 SC Regular (~20MB+ OTF)
# 注：解压后实际路径为 /tmp/shs/OTF/SimplifiedChinese/SourceHanSerifSC-Regular.otf
if [ ! -f "$FONTS_DIR/SourceHanSerifSC-Regular.otf" ]; then
  echo "  Downloading SourceHanSerifSC-Regular.otf..."
  curl -L -o /tmp/shs.zip \
    "https://github.com/adobe-fonts/source-han-serif/releases/download/2.002R/09_SourceHanSerifSC.zip"
  unzip -o /tmp/shs.zip -d /tmp/shs
  # 兼容两种解压目录结构
  SHS_FILE=$(find /tmp/shs -name "SourceHanSerifSC-Regular.otf" | head -1)
  if [ -z "$SHS_FILE" ]; then
    echo "ERROR: SourceHanSerifSC-Regular.otf not found in extracted archive"
    ls -R /tmp/shs
    rm -rf /tmp/shs /tmp/shs.zip
    exit 1
  fi
  cp "$SHS_FILE" "$FONTS_DIR/SourceHanSerifSC-Regular.otf"
  rm -rf /tmp/shs /tmp/shs.zip
fi

# 文鼎楷体 (TW-Kai) — ARPH 公共许可证
if [ ! -f "$FONTS_DIR/TW-Kai.ttf" ]; then
  echo "  Downloading TW-Kai.ttf..."
  curl -L -o "$FONTS_DIR/TW-Kai.ttf" \
    "https://github.com/anthonyfok/TW-Kai/releases/latest/download/TW-Kai.ttf"
fi

# 注：拼音字体 texgyreadventor 已通过 base64 内嵌在 fontManager.js 中，无需下载文件
# 注：商业字体（方正楷体/姜浩硬笔/田英章楷书/我逸清晨体）为个人版专属，不纳入开源 distribution

echo "Font download complete."
ls -la "$FONTS_DIR/"
