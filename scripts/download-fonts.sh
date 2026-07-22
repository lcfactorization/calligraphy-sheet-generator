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
if [ ! -f "$FONTS_DIR/SourceHanSerifSC-Regular.otf" ]; then
  echo "  Downloading SourceHanSerifSC-Regular.otf..."
  curl -L -o /tmp/shs.zip \
    "https://github.com/adobe-fonts/source-han-serif/releases/download/2.002R/09_SourceHanSerifSC.zip"
  unzip -o /tmp/shs.zip -d /tmp/shs
  cp /tmp/shs/SourceHanSerifSC-Regular.otf "$FONTS_DIR/SourceHanSerifSC-Regular.otf"
  rm -rf /tmp/shs /tmp/shs.zip
fi

# 文鼎楷体 (TW-Kai)
if [ ! -f "$FONTS_DIR/TW-Kai.ttf" ]; then
  echo "  Downloading TW-Kai.ttf..."
  curl -L -o "$FONTS_DIR/TW-Kai.ttf" \
    "https://github.com/anthonyfok/TW-Kai/releases/latest/download/TW-Kai.ttf"
fi

# 拼音字体 (texgyreadventor) - 实际使用base64内嵌，但保留文件以兼容
if [ ! -f "$FONTS_DIR/texgyreadventor-regular.otf" ]; then
  echo "  Downloading texgyreadventor-regular.otf..."
  curl -L -o "$FONTS_DIR/texgyreadventor-regular.otf" \
    "https://github.com/anthonyfok/TW-Kai/releases/latest/download/texgyreadventor-regular.otf" 2>/dev/null || true
fi

echo "Font download complete."
ls -la "$FONTS_DIR/"
