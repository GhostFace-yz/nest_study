#!/usr/bin/env python3
"""对 zh 译文做零成本后处理：术语统一 + 中英/代码之间补空格。

不调用讯飞接口，几秒跑完，可反复执行（幂等）。改完会同步刷新 Markdown 镜像。

用法：
  python3 tools/polish_zh.py --dry-run    # 只统计会改多少处
  python3 tools/polish_zh.py              # 正式写入
  python3 tools/polish_zh.py --json ... --md ...
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_JSON = ROOT / "docs/nestjs-docs-20261026.zh.json"
DEFAULT_MD = ROOT / "docs/nestjs-docs-md-20261026"

# 术语纠正：左列是机翻常见错法，右列是统一译名
TERMS = [
    ("提供商", "提供者"),      # provider 统一成「提供者」
    ("发电机", "生成器"),      # generator 被译成发电机
    ("引擎盖下", "底层"),      # under the hood
    ("指挥", "命令"),          # command 被译成指挥（如 CLI 命令）
]

CJK = r"\u4e00-\u9fff"
SPACE_AFTER_CJK = re.compile(rf"(?<=[{CJK}])(?=[A-Za-z0-9`])")
SPACE_BEFORE_CJK = re.compile(rf"(?<=[A-Za-z0-9`])(?=[{CJK}])")
LINK_OPEN = re.compile(rf"(?<=[{CJK}])\[(?=[^\]\n]*\]\()")
LINK_CLOSE = re.compile(r"\)(?=[\u4e00-\u9fff])")


def polish(text: str, counts: dict[str, int]) -> str:
    for src, dst in TERMS:
        n = text.count(src)
        if n:
            counts[f"{src}→{dst}"] = counts.get(f"{src}→{dst}", 0) + n
            text = text.replace(src, dst)
    # 中文紧贴 Markdown 链接时补空格：例如[Express](url) → 例如 [Express](url)
    n = len(LINK_OPEN.findall(text)) + len(LINK_CLOSE.findall(text))
    if n:
        counts["链接两侧补空格"] = counts.get("链接两侧补空格", 0) + n
        text = LINK_OPEN.sub(" [", text)
        text = LINK_CLOSE.sub(") ", text)

    before = len(text)
    text = SPACE_AFTER_CJK.sub(" ", text)
    text = SPACE_BEFORE_CJK.sub(" ", text)
    added = len(text) - before
    if added:
        counts["补空格"] = counts.get("补空格", 0) + added
    return re.sub(r"[ \t]{2,}", " ", text)


def chapter_to_markdown(c: dict) -> str:
    out = [f"# {c.get('title', '')}", "", f"Source: {c.get('url', '')}", ""]
    for b in c.get("blocks", []):
        t = b.get("type")
        md = b.get("zh") or b.get("md") or ""
        if t == "heading":
            out += ["#" * int(b.get("level") or 2) + " " + md, ""]
        elif t in ("paragraph", "list", "table", "html"):
            out += [md, ""]
        elif t == "code":
            out += ["```" + (b.get("lang") or ""), b.get("code") or "", "```", ""]
        elif t == "callout":
            head = f"{b.get('kind', 'info')}" + (f" **{b.get('title')}**" if b.get("title") else "")
            body = md.split("\n") if md else []
            first = body.pop(0) if body else ""
            out.append(f"> {head} {first}".rstrip())
            out += ["> " + line if line else ">" for line in body]
            out.append("")
        elif t == "image":
            out += [md, ""]
        elif t == "details":
            out += [f"<details><summary>{b.get('title', '')}</summary>", "", md, "", "</details>", ""]
        elif t == "hr":
            out += ["---", ""]
        else:
            out += [md, ""]
    return re.sub(r"\n{4,}", "\n\n\n", "\n".join(out).strip() + "\n")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--json", default=str(DEFAULT_JSON))
    ap.add_argument("--md", default=str(DEFAULT_MD))
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    path = Path(args.json)
    data = json.loads(path.read_text(encoding="utf-8"))
    counts: dict[str, int] = {}
    blocks = 0

    for section in data.get("sections", []):
        for ch in section.get("chapters", []):
            for b in ch.get("blocks", []):
                zh = b.get("zh")
                if not zh or b.get("type") == "code":
                    continue
                new = polish(zh, counts)
                if new != zh:
                    b["zh"] = new
                    blocks += 1

    print(f"受影响块: {blocks}")
    for k, v in sorted(counts.items(), key=lambda kv: -kv[1]):
        print(f"  {k}: {v}")
    if not counts:
        print("  已是干净状态，无需改动。")
        return 0
    if args.dry_run:
        print("\n[dry-run] 未写入。去掉 --dry-run 执行。")
        return 0

    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"已写入 {path}")

    md_root = Path(args.md)
    chapters = {c["path"]: c for s in data["sections"] for c in s["chapters"]}
    manifest = md_root / "manifest.json"
    wrote = 0
    if manifest.exists():
        meta = json.loads(manifest.read_text(encoding="utf-8"))
        for section in meta.get("sections", []):
            for c in section.get("chapters", []):
                ch = chapters.get(c["path"])
                if not ch or not any(b.get("zh") for b in ch.get("blocks", [])):
                    continue
                dst = md_root / "zh" / c["file"].replace("en/", "", 1)
                dst.parent.mkdir(parents=True, exist_ok=True)
                dst.write_text(chapter_to_markdown(ch), encoding="utf-8")
                wrote += 1
    print(f"已刷新 {wrote} 个 Markdown 镜像")
    return 0


if __name__ == "__main__":
    sys.exit(main())
