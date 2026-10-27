#!/usr/bin/env python3
"""Inject Chinese translations and build the static site data files."""
from __future__ import annotations

import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

from lxml import html as LH

ROOT = Path(__file__).resolve().parent.parent
SITE = ROOT / "site"
DATA = SITE / "data"
PAGES = ROOT / "content/pages"
ZH = ROOT / "content/zh"

TOKEN_RE = re.compile(r"\[\[(\d+)\]\]")


def load_translations() -> dict[str, dict[str, str]]:
    out: dict[str, dict[str, str]] = {}
    if not ZH.exists():
        return out
    for f in sorted(ZH.rglob("*.json")):
        data = json.loads(f.read_text(encoding="utf-8"))
        path = data.get("path") or "/api/" + f.parent.name + "/" + f.stem
        blocks = data.get("blocks", data)
        out[path] = {k: v for k, v in blocks.items() if isinstance(v, str)}
    return out


def parse_fragment(fragment: str):
    wrapper = LH.fragment_fromstring(fragment, create_parent="div")
    if len(wrapper) == 0:
        return None
    node = wrapper[0]
    wrapper.remove(node)
    return node


def apply_template(el, template: str, token_htmls: list[str]) -> tuple[int, list[int]]:
    """Replace el's content. Returns (unused token indexes, invalid placeholders)."""
    for child in list(el):
        el.remove(child)
    el.text = None
    used: set[int] = set()
    invalid: list[int] = []
    last = None
    for part in re.split(r"(\[\[\d+\]\])", template or ""):
        if not part:
            continue
        m = re.fullmatch(r"\[\[(\d+)\]\]", part)
        if m:
            idx = int(m.group(1))
            if 0 <= idx < len(token_htmls):
                node = parse_fragment(token_htmls[idx])
                if node is not None:
                    el.append(node)
                    last = node
                    used.add(idx)
                    continue
            invalid.append(idx)
        if last is None:
            el.text = (el.text or "") + part
        else:
            last.tail = (last.tail or "") + part
    unused = [i for i in range(len(token_htmls)) if i not in used]
    return unused, invalid


def main() -> int:
    manifest = json.loads((ROOT / "tools/manifest.json").read_text(encoding="utf-8"))
    translations = load_translations()
    DATA.mkdir(parents=True, exist_ok=True)

    docs: dict[str, dict] = {}
    items_out: list[dict] = []
    total_untranslated = 0
    warnings: list[str] = []

    for item in manifest["items"]:
        path = item["path"]
        pkg = path.split("/")[2]
        name = path.split("/")[3]
        page = json.loads((PAGES / pkg / f"{name}.json").read_text(encoding="utf-8"))
        manual = translations.get(path, {})
        root = LH.fragment_fromstring(page["en"], create_parent="div")
        missing: list[dict] = []

        for block in page["blocks"]:
            tid = block["id"]
            zh = manual.get(tid)
            if zh is None:
                zh = block.get("auto")
            if zh is None:
                missing.append(block)
                zh = block["text"]

            el = root.xpath(f'.//*[@data-tid="{tid}"]')
            if not el:
                warnings.append(f"{path}: missing element for {tid}")
                continue
            el = el[0]
            unused, invalid = apply_template(el, zh, block["tokens"])
            if unused:
                warnings.append(f"{path}#{tid}: unused token(s) {unused}")
            if invalid:
                warnings.append(f"{path}#{tid}: invalid placeholder(s) {invalid}")

        # Avoid duplicate DOM ids between the two columns
        for el in root.iter():
            if el.tag is None:
                continue
            if "id" in el.attrib:
                del el.attrib["id"]

        zh_html = LH.tostring(root, encoding="unicode", with_tail=False)
        docs[path] = {
            "en": page["en"],
            "zh": zh_html,
            "meta": item,
        }
        items_out.append({**item, "pkg": pkg})
        total_untranslated += len(missing)
        if missing:
            warnings.append(f"{path}: {len(missing)} untranslated block(s)")
            print(f"[missing] {path}: {len(missing)}")
            for b in missing[:6]:
                print(f"    {b['id']} {b['text'][:100]}")

    index = {
        "source": manifest["source"],
        "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "packages": manifest["packages"],
        "categories": manifest["categories"],
        "items": items_out,
        "stats": {
            "items": len(items_out),
            "categories": len(manifest["categories"]),
            "packages": len(manifest["packages"]),
            "untranslated": total_untranslated,
        },
    }

    (DATA / "index.js").write_text(
        "window.__INDEX__ = " + json.dumps(index, ensure_ascii=False, indent=1) + ";\n",
        encoding="utf-8",
    )
    (DATA / "docs.js").write_text(
        "window.__DOCS__ = " + json.dumps(docs, ensure_ascii=False) + ";\n",
        encoding="utf-8",
    )

    print(f"pages: {len(docs)}  untranslated blocks: {total_untranslated}")
    print(f"wrote {DATA / 'index.js'} ({ (DATA / 'index.js').stat().st_size / 1024:.0f} KB)")
    print(f"wrote {DATA / 'docs.js'} ({ (DATA / 'docs.js').stat().st_size / 1024:.0f} KB)")
    if warnings:
        print(f"warnings: {len(warnings)}")
        for w in warnings[:30]:
            print("  -", w)
    return 0


if __name__ == "__main__":
    sys.exit(main())
