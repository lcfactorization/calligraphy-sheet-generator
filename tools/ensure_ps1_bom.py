#!/usr/bin/env python3
"""规范化文本文件的编码与换行，规避 Windows 脚本的经典编码坑。

用法:
    # PowerShell 脚本：UTF-8 带 BOM + CRLF（必须，见下）
    python tools/ensure_ps1_bom.py 启动Puppeteer.ps1

    # 批处理：UTF-8 无 BOM + CRLF（cmd.exe 不能容忍 .bat 的 BOM）
    python tools/ensure_ps1_bom.py --strip-bom 启动Puppeteer.bat

为什么 .ps1 必须带 BOM:
    Windows PowerShell 5.1 对「无 BOM 的 .ps1」按系统 ANSI 代码页解码。
    中文 Windows 为 GBK/936，于是中文注释被重新拆字节；个别 UTF-8 尾字节
    （例如「息」的 0xAF）会与行尾 CR(0x0D) 拼成一个"合法"的 GBK 双字节
    字符，**换行被吞掉**，相邻两行粘成一行，连锁报出
    "Unexpected token" / "Missing closing ')'" 等语法错误。
    PowerShell 7.x 默认按 UTF-8 读，不受影响，故该 bug 只在 5.1 上复现。

为什么 .bat 必须无 BOM:
    cmd.exe 会把 BOM 字节当成第一行命令的一部分，导致首行报错。
"""
import sys
from pathlib import Path

BOM = b"\xef\xbb\xbf"


def normalize(path: Path, with_bom: bool) -> str:
    raw = path.read_bytes()
    if raw.startswith(BOM):
        raw = raw[len(BOM):]
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError as exc:
        # 非 UTF-8（例如旧版 GBK 保存的文件）。批量处理时不要中断，
        # 报出来让调用方决定是否单独转码。
        return f"SKIP 非 UTF-8 编码，未改动 ({exc})"
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = text.replace("\n", "\r\n")               # 统一 CRLF
    payload = (BOM if with_bom else b"") + text.encode("utf-8")
    path.write_bytes(payload)

    head = path.read_bytes()[:3]
    has_bom = head == BOM
    if has_bom != with_bom:
        return f"FAIL (bom={has_bom}, want={with_bom})"
    return "BOM=OK" if with_bom else "BOM=none OK"


if __name__ == "__main__":
    args = sys.argv[1:]
    with_bom = True
    if args and args[0] == "--strip-bom":
        with_bom = False
        args = args[1:]
    if not args:
        print(__doc__)
        sys.exit(2)
    failed = False
    for arg in args:
        p = Path(arg)
        result = normalize(p, with_bom)
        failed = failed or result.startswith("FAIL") or result.startswith("SKIP")
        print(f"{p.name}: {result}")
    sys.exit(1 if failed else 0)
