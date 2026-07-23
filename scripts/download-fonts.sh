#!/bin/bash
# 在CI构建时下载开源字体
set -e

FONTS_DIR="public/fonts"
mkdir -p "$FONTS_DIR"

echo "Downloading open-source fonts..."

# 霞鹜文楷 Regular
if [ ! -f "$FONTS_DIR/LXGWWenKai-Regular.ttf" ]; then
  echo "  Downloading LXGWWenKai-Regular.ttf..."
  curl -L -o "$FONTS_DIR/LXGWWenKai-Regular.ttf" \
    "https://github.com/lxgw/LxgwWenKai/releases/latest/download/LXGWWenKai-Regular.ttf"
fi

# 霞鹜文楷 Light
if [ ! -f "$FONTS_DIR/LXGWWenKai-Light.ttf" ]; then
  echo "  Downloading LXGWWenKai-Light.ttf..."
  curl -L -o "$FONTS_DIR/LXGWWenKai-Light.ttf" \
    "https://github.com/lxgw/LxgwWenKai/releases/latest/download/LXGWWenKai-Light.ttf"
fi

# 思源宋体 SC Regular
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

# 文鼎楷体 (TW-Kai)
if [ ! -f "$FONTS_DIR/TW-Kai.ttf" ]; then
  echo "  Downloading TW-Kai.ttf..."
  curl -L -o "$FONTS_DIR/TW-Kai.ttf" \
    "https://github.com/anthonyfok/TW-Kai/releases/latest/download/TW-Kai.ttf"
fi

# 注：拼音字体 texgyreadventor 已通过 base64 内嵌在 fontManager.js 中，无需下载文件
# 注：我逸清晨体楷书为商用字体（不符合开源项目版权合规要求），已移除

echo "Font download complete."
ls -la "$FONTS_DIR/"
