#!/usr/bin/env python3
"""Prepare bilingual API reference content from the official NestJS API docs.

Reads the mirrored HTML fragments, cleans them, assigns stable block ids
(data-tid) and extracts every translatable text block into a JSON file.
"""
from __future__ import annotations

import json
import os
import re
import shutil
import sys
import urllib.parse
import urllib.request
from pathlib import Path

from lxml import html as LH

ROOT = Path(__file__).resolve().parent.parent
MIRROR = Path("/tmp/nestdocs")
OFFICIAL = "https://api-references-nestjs.netlify.app"
SOURCE_URL = OFFICIAL + "/api"

INLINE_TAGS = {
    "code", "a", "em", "strong", "span", "br", "sup", "sub", "kbd", "small",
    "mark", "abbr", "img", "s", "u", "del", "ins", "b", "i",
}
BLOCK_TAGS = {
    "p", "ul", "ol", "pre", "table", "div", "section", "article", "h1", "h2",
    "h3", "h4", "h5", "h6", "blockquote", "details", "summary",
}

HEADINGS = {
    "description": "说明",
    "static methods": "静态方法",
    "static properties": "静态属性",
    "methods": "方法",
    "properties": "属性",
    "constructor": "构造函数",
    "see also": "另见",
    "subclasses": "子类",
    "implements": "实现",
    "extends": "继承",
    "index": "索引",
    "example": "示例",
    "examples": "示例",
    "parameters": "参数",
    "parameter": "参数",
    "returns": "返回值",
    "return": "返回值",
    "throws": "抛出异常",
    "options": "选项",
    "type": "类型",
    "default": "默认值",
    "required": "必填",
    "deprecated": "已弃用",
    "since": "起始版本",
    "usage": "用法",
    "signature": "签名",
    "overloads": "重载",
    "show all": "展开全部",
    "hide all": "收起全部",
    "on this page": "本页内容",
    "option": "选项",
    "name": "名称",
    "value": "值",
    "description": "说明",
    "property": "属性",
    "modifier": "修饰符",
    "usage notes": "用法说明",
    "child interfaces": "子接口",
    "class implementations": "类实现",
    "read-only": "只读",
}

SUMMARY_RE = re.compile(r"^(\d+)\s+overloads?$", re.I)
OVERLOAD_RE = re.compile(r"^Overload\s+(\d+)\s+of\s+(\d+)$", re.I)


def clean_text(s: str | None) -> str:
    if not s:
        return ""
    return re.sub(r"\s+", " ", s)


def normalize_ws(el) -> None:
    if el.tag == "pre":
        return
    if el.text:
        el.text = clean_text(el.text)
    for child in el:
        normalize_ws(child)
        if child.tail:
            child.tail = clean_text(child.tail)


def serialize(el) -> str:
    return LH.tostring(el, encoding="unicode", with_tail=False)


def is_code_like(text: str) -> bool:
    text = text.strip()
    if not text:
        return True
    if " " in text:
        return False
    if not re.search(r"[A-Za-z]", text):
        return False
    return bool(re.fullmatch(r"[@A-Za-z0-9_$.<>{}\[\]()#:,'\"|&*+=/\\~^!?-]+", text))


def auto_translate(kind: str, text: str) -> str | None:
    t = text.strip()
    if kind in ("heading", "th", "summary"):
        key = t.lower()
        if key in HEADINGS:
            return HEADINGS[key]
        m = SUMMARY_RE.match(t)
        if m:
            return f"{m.group(1)} 个重载"
        m = OVERLOAD_RE.match(t)
        if m:
            return f"第 {m.group(1)} 个重载，共 {m.group(2)} 个"
    if kind == "see-more":
        return "查看更多…"
    return None


class PagePreparer:
    def __init__(self, page_meta: dict, included: set[str]):
        self.meta = page_meta
        self.included = included
        self.blocks: list[dict] = []
        self.counter = 0

    # ---------- cleaning ----------
    def clean_dom(self, root) -> None:
        for el in list(root.iter()):
            if el.tag is None:
                continue
            if el.get("class") == "breadcrumb-container":
                el.getparent().remove(el)
                continue
            if el.tag == "header" and "api-header" in (el.get("class") or ""):
                el.getparent().remove(el)
                continue
            if el.tag == "a" and "header-link" in (el.get("class") or ""):
                el.getparent().remove(el)
                continue
            if el.tag == "a" and el.get("id") == "" and not (el.text or "").strip():
                el.getparent().remove(el)
                continue
        # comments
        for node in root.xpath("//comment()"):
            parent = node.getparent()
            if parent is not None:
                parent.remove(node)
        normalize_ws(root)

    def rewrite_links(self, root) -> None:
        for a in root.iter("a"):
            href = a.get("href")
            if not href:
                continue
            if href.startswith("/api"):
                path, _, anchor = href.partition("#")
                if path in self.included:
                    a.set("href", "#" + path + (("#" + anchor) if anchor else ""))
                else:
                    a.set("href", OFFICIAL + href)
                    a.set("target", "_blank")
                    a.set("rel", "noopener")
            elif href.startswith("http"):
                a.set("target", "_blank")
                a.set("rel", "noopener")

    # ---------- extraction ----------
    def has_block_child(self, el) -> bool:
        for child in el:
            if child.tag in BLOCK_TAGS and child.tag != "a":
                return True
            if child.tag == "br":
                continue
        return False

    def plain(self, el, skip_header_link=True) -> str:
        parts: list[str] = []

        def walk(node):
            if node.text:
                parts.append(node.text)
            for child in node:
                if child.tag is None:
                    continue
                if skip_header_link and child.tag == "a" and "header-link" in (child.get("class") or ""):
                    pass
                else:
                    walk(child)
                if child.tail:
                    parts.append(child.tail)

        walk(el)
        return re.sub(r"\s+", " ", "".join(parts)).strip()

    def text_with_tokens(self, el) -> tuple[str, list[str]]:
        tokens: list[str] = []
        parts: list[str] = []

        def add_text(t):
            if t:
                parts.append(t)

        def walk(node):
            add_text(node.text)
            for child in node:
                if child.tag is None:
                    continue
                if child.tag in INLINE_TAGS:
                    idx = len(tokens)
                    tokens.append(serialize(child))
                    add_text(f"[[{idx}]]")
                else:
                    walk(child)
                add_text(child.tail)

        walk(el)
        text = re.sub(r"\s+", " ", "".join(parts)).strip()
        return text, tokens

    def add_block(self, el, kind: str, text: str, tokens: list[str] | None = None, auto: str | None = None) -> None:
        tid = f"b{self.counter}"
        self.counter += 1
        el.set("data-tid", tid)
        tokens = tokens or []
        clean = re.sub(r"\[\[\d+\]\]", "", text).strip()
        if auto is None:
            auto = auto_translate(kind, text)
        self.blocks.append({
            "id": tid,
            "kind": kind,
            "tag": el.tag,
            "text": text,
            "plain": clean,
            "tokens": tokens,
            "auto": auto,
        })

    def consider(self, el, kind: str) -> None:
        text, tokens = self.text_with_tokens(el)
        clean = re.sub(r"\[\[\d+\]\]", "", text).strip(" .:-—·")
        if not clean or not re.search(r"[A-Za-z\u4e00-\u9fff]", clean):
            return
        if len(clean) == 1:
            return
        if kind in ("heading", "th", "summary"):
            if not auto_translate(kind, text) and is_code_like(text):
                return
        elif kind == "prose":
            if is_code_like(text) and not tokens:
                return
            if len(clean) < 2:
                return
        self.add_block(el, kind, text, tokens)

    def extract(self, root) -> None:
        # special case: "See more..." anchors inside short description
        see_more = set()
        for a in root.iter("a"):
            if (a.text or "").strip().lower().startswith("see more"):
                parent = a.getparent()
                if parent is not None and parent.tag == "p":
                    see_more.add(parent)
                    self.add_block(a, "see-more", "See more...")
                    a.set("href", "#description")

        for el in root.iter():
            if el.tag is None or el.tag == "pre":
                continue
            if any(anc.tag == "pre" for anc in el.iterancestors()):
                continue
            if el.get("data-tid"):
                continue
            cls = el.get("class") or ""
            if "header-link" in cls:
                continue

            if el.tag == "p":
                if el.getparent() in see_more:
                    continue
                if el.getparent() is not None and el.getparent().tag == "li" and self.has_block_child(el.getparent()):
                    pass
                self.consider(el, "prose")
            elif el.tag == "li":
                if self.has_block_child(el):
                    continue
                self.consider(el, "prose")
            elif el.tag == "td":
                if "param-name" in cls or "param-type" in cls:
                    continue
                if self.has_block_child(el):
                    continue
                self.consider(el, "prose")
            elif el.tag == "th":
                if el.find(".//h3") is not None:
                    continue
                text, tokens = self.text_with_tokens(el)
                if text:
                    self.add_block(el, "th", text, tokens)
            elif el.tag in ("h2", "h3", "h4", "h5"):
                if any(anc.tag == "thead" for anc in el.iterancestors()):
                    continue
                text = self.plain(el)
                if not text:
                    continue
                key = text.lower()
                if key in HEADINGS:
                    self.add_block(el, "heading", text)
                elif el.tag == "h5" and auto_translate("heading", text):
                    self.add_block(el, "heading", text)
                elif is_code_like(text):
                    continue
                else:
                    self.add_block(el, "heading", text)
            elif el.tag == "span" and "read-only-property" in cls:
                self.add_block(el, "note", "Read-only.", auto="只读。")
            elif el.tag == "span" and el.getparent() is not None and el.getparent().tag == "summary":
                text = self.plain(el)
                if text:
                    self.add_block(el, "summary", text)

    def run(self, raw_html: str) -> tuple[str, list[dict]]:
        root = LH.fragment_fromstring(raw_html, create_parent="div")
        self.clean_dom(root)
        self.rewrite_links(root)
        self.extract(root)
        out = LH.tostring(root, encoding="unicode", with_tail=False)
        return out, self.blocks


def fetch_missing(path: str, dest: Path) -> str:
    if dest.exists() and dest.stat().st_size > 100:
        return dest.read_text(encoding="utf-8")
    url = OFFICIAL + "/generated/docs" + path + ".html"
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = resp.read().decode("utf-8")
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(data, encoding="utf-8")
    return data


def main() -> int:
    manifest = json.loads((ROOT / "tools/manifest.json").read_text(encoding="utf-8"))
    items = manifest["items"]
    included = {it["path"] for it in items}

    pages_dir = ROOT / "content/pages"
    en_dir = ROOT / "content/en"
    for d in (pages_dir, en_dir):
        if d.exists():
            shutil.rmtree(d)
        d.mkdir(parents=True)

    total_blocks = 0
    total_prose_chars = 0
    report = []
    for it in items:
        pkg = it["path"].split("/")[2]
        name = it["path"].split("/")[3]
        mirror_file = MIRROR / (it["path"].lstrip("/") + ".html")
        raw = fetch_missing(it["path"], mirror_file)
        prep = PagePreparer(it, included)
        en_html, blocks = prep.run(raw)
        page = {
            "meta": it,
            "en": en_html,
            "blocks": blocks,
        }
        out = pages_dir / pkg / f"{name}.json"
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps(page, ensure_ascii=False, indent=1), encoding="utf-8")
        (en_dir / pkg).mkdir(parents=True, exist_ok=True)
        (en_dir / pkg / f"{name}.html").write_text(en_html, encoding="utf-8")

        prose = [b for b in blocks if b["kind"] in ("prose", "heading")]
        chars = sum(len(b["plain"]) for b in prose)
        total_blocks += len(blocks)
        total_prose_chars += chars
        report.append((it["path"], len(blocks), len(prose), chars, len(en_html)))

    report.sort(key=lambda x: x[3], reverse=True)
    print(f"pages: {len(items)}  blocks: {total_blocks}  prose chars: {total_prose_chars}")
    print(f"{'path':46} {'blocks':>6} {'prose':>6} {'chars':>7} {'html':>7}")
    for row in report:
        print(f"{row[0]:46} {row[1]:6d} {row[2]:6d} {row[3]:7d} {row[4]:7d}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
