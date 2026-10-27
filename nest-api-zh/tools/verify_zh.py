#!/usr/bin/env python3
"""验收 translate_xfyun.py 的产物：结构没坏、代码没被翻、占位符没漏。

用法：
  python3 tools/verify_zh.py                       # 默认查 docs/*.zh.json
  python3 tools/verify_zh.py --json 别的文件.json
  python3 tools/verify_zh.py --samples 5           # 顺带打印几段译文

有硬伤（代码块被翻 / 链接破损 / 占位符泄漏）时退出码为 1。
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DEFAULT = ROOT / "docs/nestjs-docs-20261026.zh.json"

LINK_RE = re.compile(r"!?\[[^\]\n]*\]\(\s*<?[^)\s>]+>?(?:\s+(?:\"[^\"]*\"|'[^']*'))?\s*\)")
CJK_RE = re.compile(r"[\u4e00-\u9fff]")
LIST_RE = re.compile(r"^\s*(?:[-*+]|\d+[.)])\s+")


def rows(md: str) -> list[str]:
    return [l for l in md.split("\n") if l.strip().startswith("|")]


def cells(line: str) -> int:
    return len(line.strip().strip("|").split("|"))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--json", default=str(DEFAULT))
    ap.add_argument("--samples", type=int, default=0)
    args = ap.parse_args()

    path = Path(args.json)
    if not path.exists():
        print(f"找不到 {path}", file=sys.stderr)
        return 2
    data = json.loads(path.read_text(encoding="utf-8"))

    chapters = [c for s in data.get("sections", []) for c in s.get("chapters", [])]
    total = translated = 0
    by_type: dict[str, list[int]] = {}
    hard: list[str] = []
    soft: list[str] = []
    empty_chapters: list[str] = []
    leaked = 0
    samples: list[tuple[str, str, str]] = []

    for ch in chapters:
        got = 0
        for b in ch.get("blocks", []):
            total += 1
            bt = b.get("type")
            stat = by_type.setdefault(bt, [0, 0])       # [总数, 已翻]
            stat[0] += 1
            zh = b.get("zh")
            if not zh:
                continue
            stat[1] += 1
            translated += 1
            got += 1
            md = b.get("md") or ""

            if bt == "code":
                hard.append(f"代码块被翻译: {ch['slug']}#{b['id']}")
                continue

            if "⟦" in zh or "\\x00" in zh or re.search(r"\[\[\d+\]\]", zh):
                leaked += 1
                hard.append(f"占位符泄漏: {ch['slug']}#{b['id']} -> {zh[:60]}")

            if LINK_RE.findall(md) and len(LINK_RE.findall(md)) != len(LINK_RE.findall(zh)):
                hard.append(f"链接数不一致: {ch['slug']}#{b['id']} {len(LINK_RE.findall(md))}→{len(LINK_RE.findall(zh))}")

            if bt == "table":
                s, d = rows(md), rows(zh)
                if len(s) != len(d) or any(cells(a) != cells(c) for a, c in zip(s, d)):
                    hard.append(f"表格列数不一致: {ch['slug']}#{b['id']}")

            if bt == "list":
                sm = [LIST_RE.match(l).group(0).strip() for l in md.split("\n") if LIST_RE.match(l)]
                dm = [LIST_RE.match(l).group(0).strip() for l in zh.split("\n") if LIST_RE.match(l)]
                if sm != dm:
                    hard.append(f"列表标记不一致: {ch['slug']}#{b['id']} {len(sm)}→{len(dm)}")

            if not CJK_RE.search(zh) and len(re.findall(r"[A-Za-z]{3,}", md)) > 3:
                soft.append(f"疑似未翻译: {ch['slug']}#{b['id']} {zh[:60]}")

            if args.samples and len(samples) < args.samples and bt == "paragraph":
                samples.append((ch["slug"], md, zh))
        if got == 0:
            empty_chapters.append(ch["slug"])

    meta = (data.get("meta") or {}).get("translation") or {}
    print(f"文件      {path}")
    print(f"章节      {len(chapters)}（有译文的 {len(chapters) - len(empty_chapters)}，全空的 {len(empty_chapters)}）")
    print(f"块        {total:,}，已翻 {translated:,} ({translated / total * 100:.1f}%)")
    print("类型明细：")
    for bt, (n, k) in sorted(by_type.items(), key=lambda kv: -kv[1][0]):
        if bt in ("paragraph", "heading", "list", "callout", "details", "table"):
            print(f"  {bt:10} {k:,}/{n:,}")
    print(f"引擎      {meta.get('engine', '?')}  {meta.get('endpoint', '')}")
    calls = meta.get("apiCallsThisRun", meta.get("apiCalls", "?"))
    hits = meta.get("cacheHitsThisRun", meta.get("cacheHits", "?"))
    fails = meta.get("failedThisRun", meta.get("failed", "?"))
    print(f"最近一次  API 调用 {calls}    缓存命中 {hits}    失败 {fails}")

    if leaked:
        print(f"\n占位符泄漏 {leaked} 处")
    if hard:
        print(f"\n硬伤 {len(hard)} 项（前 15 条）：")
        for h in hard[:15]:
            print("  -", h)
    else:
        print("\n结构检查：代码块、链接、表格、列表、占位符 全部通过 ✓")
    if soft:
        print(f"\n疑似未翻译 {len(soft)} 处（前 5 条，可能是专有名词堆叠，人工确认即可）：")
        for s in soft[:5]:
            print("  -", s)
    if empty_chapters:
        print(f"\n整章未翻 {len(empty_chapters)} 个：{', '.join(empty_chapters[:12])}"
              + (" …" if len(empty_chapters) > 12 else ""))

    for slug, md, zh in samples:
        print(f"\n--- {slug}\nEN  {md[:150]}\nZH  {zh[:150]}")

    return 1 if hard else 0


if __name__ == "__main__":
    sys.exit(main())
