#!/usr/bin/env python3
"""用科大讯飞「机器翻译（新）」批量翻译 docs/ 下的 NestJS 文档。

设计要点
--------
1. 代码块整块跳过（type=code 永不发请求）；行内代码、类名、方法名、装饰器、
   URL、文件路径、命令行参数统一替换成占位符 ⟦0⟧ ⟦1⟧，翻译后按编号还原。
   还原前做校验：占位符数量/编号必须完全一致，否则视为失败。
2. 每块一次请求，译文与 block.id 严格一一对应，不会出现"整段错位"。
3. 失败三级降级：⟦n⟧ → [[n]] → 按占位符切段逐段翻 → 保留英文并记入报告。
   任何情况下都不会把代码或半截译文写进 zh。
4. 本地缓存 + 断点续跑：同样的英文再跑一次命中缓存，0 次请求。
5. 11200（未开通服务）/ 10313（app_id 与 key 不匹配）/ 401（签名）属于
   不可重试错误，立即停下并提示怎么处理。

用法
----
  python3 tools/translate_xfyun.py --check          # 只验证凭证，一个请求
  python3 tools/translate_xfyun.py --dry-run        # 统计规模，0 请求
  python3 tools/translate_xfyun.py --limit 10       # 试翻 10 个单元
  python3 tools/translate_xfyun.py                  # 全量（可随时 Ctrl-C 续跑）
  python3 tools/translate_xfyun.py --only graphql-resolvers
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import hmac
import http.client
import json
import os
import re
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field
from email.utils import formatdate
from pathlib import Path
from urllib.parse import urlencode, urlparse

ROOT = Path(__file__).resolve().parent.parent
CACHE_VERSION = "v2-products"  # 保护策略变了就换一版，旧缓存自然失效
DEFAULT_JSON = ROOT / "docs/nestjs-docs-20261026.json"
DEFAULT_MD = ROOT / "docs/nestjs-docs-md-20261026"
CACHE_PATH = ROOT / "tools/.cache/xfyun-cache.json"

TRANSLATABLE = {"paragraph", "heading", "list", "callout", "details", "table"}
MAX_CHARS = 1800              # 官方上限 5000 字符，留足余量

# ---------------------------------------------------------------- 占位符保护

PH_STYLES = [("⟦", "⟧"), ("[[", "]]")]
PH_RE = re.compile(r"⟦(\d+)⟧|\[\[(\d+)\]\]")

INLINE_CODE_RE = re.compile(r"`[^`\n]+`")                      # 行内代码
URL_RE = re.compile(r"https?://[^\s)\]>`\"'，。；）]+")          # URL
DECORATOR_RE = re.compile(r"@[A-Za-z_][\w/.-]*(?:\(\))?")   # @Get()、@nestjs/common
DOTTED_RE = re.compile(r"\b[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]+)+\b")  # NestFactory.create
CALL_RE = re.compile(r"\b[A-Za-z_][\w.]*\(\)")                # findAll()、NestFactory.create()
CAMEL_RE = re.compile(r"\b[a-z][a-z0-9]*[A-Z][A-Za-z0-9]*\b")   # createNestApplication
ACRONYM_RE = re.compile(r"\b[A-Z]{2,}[A-Z0-9]*\b")              # DTO、HTTP
FILE_RE = re.compile(r"\b[\w-]+\.(?:ts|js|mjs|cjs|json|md|yaml|yml|env|graphql|gql|sql|sh)\b")
CLI_RE = re.compile(r"(?<!\w)--[a-z][\w-]*")                    # --watch

# 产品/框架名：机翻常把 Nest 当成动词译成「嵌套」，必须原样保留（长名放前面）
PRODUCT_RE = re.compile(
    r"\b(?:NestJS|Nest|Express|Fastify|TypeScript|JavaScript|GraphQL|MongoDB|Redis|"
    r"RabbitMQ|Kafka|Prisma|Drizzle|TypeORM|Swagger|Passport|Jest|Vitest|Angular|"
    r"React|Vue|Docker|Kubernetes|Socket|Node)\b"
)

PROTECTORS = [INLINE_CODE_RE, URL_RE, DECORATOR_RE, FILE_RE, CLI_RE, CALL_RE, DOTTED_RE,
              PRODUCT_RE, CAMEL_RE, ACRONYM_RE]


@dataclass
class Masked:
    text: str
    tokens: list[str] = field(default_factory=list)
    links: list[dict] = field(default_factory=list)


LINK_RE = re.compile(r"(!?)\[([^\]\n]*)\]\(\s*<?([^)\s>]+)>?(?:\s+(?:\"[^\"]*\"|'[^']*'))?\s*\)")


def protect(text: str, style: int = 0) -> Masked:
    """把链接、代码、标识符换成占位符。

    链接是整体保护的原因：机器翻译会把 [ ] ( ) 改成全角，链接会直接坏掉。
    保护后先用 \x00L{i}\x00 这类内部标记占位，翻完再换成 [译文](url)。
    """
    open_, close = PH_STYLES[style]
    tokens: list[str] = []
    links: list[dict] = []

    def link_repl(m: re.Match) -> str:
        links.append({"bang": m.group(1), "label": m.group(2), "url": m.group(3)})
        tokens.append(f"\x00L{len(links) - 1}\x00")
        return f"{open_}{len(tokens) - 1}{close}"

    out = LINK_RE.sub(link_repl, text)

    def repl(m: re.Match) -> str:
        tokens.append(m.group(0))
        return f"{open_}{len(tokens) - 1}{close}"

    for rx in PROTECTORS:
        out = rx.sub(repl, out)
    return Masked(out, tokens, links)


def restore(masked_out: str, tokens: list[str]) -> str | None:
    found = [int(a or b) for a, b in PH_RE.findall(masked_out)]
    if sorted(found) != list(range(len(tokens))):
        return None
    out = masked_out
    for idx in range(len(tokens) - 1, -1, -1):     # 从大到小，避免 ⟦1⟧ 命中 ⟦10⟧
        out = out.replace(f"⟦{idx}⟧", tokens[idx]).replace(f"[[{idx}]]", tokens[idx])
    # 只把「形如占位符」的残留当失败；原文里合法出现的 [[ ]] 不能误判
    if "⟦" in out or re.search(r"\[\[\d+\]\]", out):
        return None
    return re.sub(r"[ \t]{2,}", " ", out).strip()


def should_translate_label(label: str) -> bool:
    """链接标签：Fastify / Node.js / `code` 这类保持原样，custom providers 这类才翻。"""
    if not label or "`" in label or re.search(r"[\u4e00-\u9fff]", label):
        return False
    if re.search(r"[./@<>_]", label):
        return False
    words = label.split()
    if not words:
        return False
    for w in words:
        if w.isupper():          # CRUD、CLI 这类缩写可以翻
            continue
        if w[:1].isupper():      # Fastify、Nest 这类专名保持原样
            return False
    return any(len(w) >= 3 and w.isalpha() for w in words)


def finalize_links(text: str, masked: Masked, client: "XfyunClient", cache: "Cache | None",
                   src: str, dst: str) -> str:
    """把内部标记换回 [译文](url)；标签翻译失败就保留英文标签。"""
    if not masked.links:
        return text
    for i, link in enumerate(masked.links):
        marker = f"\x00L{i}\x00"
        if marker not in text:
            continue
        label = link["label"].strip()
        zh_label = label
        if should_translate_label(label):
            key = Cache.key("label|" + label, src, dst)
            hit = cache.get(key) if cache else None
            if hit:
                zh_label = hit
            else:
                try:
                    m = protect(label, 0)
                    zh = restore(client.translate(m.text, src, dst), m.tokens)
                except ApiError:
                    zh = None
                if zh:
                    zh_label = zh
                    if cache:
                        cache.set(key, zh)
        text = text.replace(marker, f"{link['bang']}[{zh_label}]({link['url']})")
    return text


def split_long(text: str, limit: int = MAX_CHARS) -> list[str]:
    if len(text) <= limit:
        return [text]
    pieces = re.split(r"(?<=[.!?])\s+", text)
    out, cur = [], ""
    for p in pieces:
        if cur and len(cur) + 1 + len(p) > limit:
            out.append(cur)
            cur = p
        else:
            cur = f"{cur} {p}".strip() if cur else p
    if cur:
        out.append(cur)
    return out


# ---------------------------------------------------------------- 讯飞客户端

FATAL_HINTS = {
    11200: "该应用没有「机器翻译（新）」的服务授权（licc failed）。去控制台 → 该应用 → 服务管理里开通/领取该服务，再用同一个 app_id 重试。",
    10313: "app_id 与 api_key 不匹配：确认 .env 里三个值来自同一个应用。",
    10404: "语种参数不对：中文请用 cn（不是 zh），英文用 en。",
    10165: "请求过于频繁，降低 --concurrency 或加大 --interval。",
    10005: "服务端内部错误，稍后重试。",
}


class ApiError(Exception):
    def __init__(self, message: str, *, fatal: bool = False, code: int | None = None, retryable: bool = True):
        super().__init__(message)
        self.fatal = fatal
        self.code = code
        self.retryable = retryable


def load_env(path: Path) -> dict[str, str]:
    env: dict[str, str] = {}
    if not path.exists():
        return env
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        key, _, val = line.partition("=")
        env[key.strip()] = val.strip().strip("'\"")
    return env


class XfyunClient:
    """同时支持两个协议（按 base url 自动识别）：

    * 机器翻译（新）  https://itrans.xf-yun.com/v1/its  —— 鉴权走 query，body 是 header/parameter/payload，中文用 cn
    * 机器翻译niutrans https://ntrans.xfyun.cn/v2/ots    —— 鉴权走 header（含 body digest），body 是 common/business/data，中文用 zh
    """

    def __init__(self, base: str, app_id: str, api_key: str, api_secret: str, timeout: float = 30.0):
        u = urlparse(base)
        self.base = base
        self.host = u.netloc
        self.path = u.path or "/v1/its"
        self.https = u.scheme != "http"
        self.protocol = "niutrans" if self.path.rstrip("/").endswith("/v2/ots") else "its"
        self.app_id = app_id
        self.api_key = api_key
        self.api_secret = api_secret
        self.timeout = timeout
        self._local = threading.local()
        self.calls = 0
        self._lock = threading.Lock()
        # 两家接口的中文语种代码不一样，调用方统一写 cn，这里各自映射
        self._lang_map = {"niutrans": {"cn": "zh"}, "its": {"zh": "cn"}}.get(self.protocol, {})

    def lang(self, code: str) -> str:
        return self._lang_map.get(code, code)

    def _signature(self, origin: str) -> str:
        return base64.b64encode(
            hmac.new(self.api_secret.encode(), origin.encode(), hashlib.sha256).digest()
        ).decode()

    # ---- 机器翻译（新）：签名放 query ----
    def _target_its(self) -> tuple[str, dict]:
        date = formatdate(timeval=None, localtime=False, usegmt=True)
        origin = f"host: {self.host}\ndate: {date}\nPOST {self.path} HTTP/1.1"
        auth_origin = (
            f'api_key="{self.api_key}", algorithm="hmac-sha256", '
            f'headers="host date request-line", signature="{self._signature(origin)}"'
        )
        query = urlencode({
            "authorization": base64.b64encode(auth_origin.encode()).decode(),
            "date": date,
            "host": self.host,
        })
        return f"{self.path}?{query}", {"Content-Type": "application/json", "Host": self.host}

    # ---- niutrans：签名放 header，且必须把 body 摘要一起签 ----
    def _target_niutrans(self, body: bytes) -> tuple[str, dict]:
        date = formatdate(timeval=None, localtime=False, usegmt=True)
        digest = "SHA-256=" + base64.b64encode(hashlib.sha256(body).digest()).decode()
        origin = f"host: {self.host}\ndate: {date}\nPOST {self.path} HTTP/1.1\ndigest: {digest}"
        auth = (
            f'api_key="{self.api_key}", algorithm="hmac-sha256", '
            f'headers="host date request-line digest", signature="{self._signature(origin)}"'
        )
        return self.path, {
            "Content-Type": "application/json",
            "Accept": "application/json,version=1.0",
            "Host": self.host,
            "Date": date,
            "Digest": digest,
            "Authorization": auth,
        }

    def _conn(self):
        conn = getattr(self._local, "conn", None)
        if conn is None:
            cls = http.client.HTTPSConnection if self.https else http.client.HTTPConnection
            conn = cls(self.host, timeout=self.timeout)
            self._local.conn = conn
        return conn

    def _drop_conn(self):
        conn = getattr(self._local, "conn", None)
        if conn is not None:
            try:
                conn.close()
            except Exception:
                pass
            self._local.conn = None

    def _build_body(self, text: str, src: str, dst: str) -> bytes:
        b64 = base64.b64encode(text.encode("utf-8")).decode()
        if self.protocol == "niutrans":
            payload = {
                "common": {"app_id": self.app_id},
                "business": {"from": self.lang(src), "to": self.lang(dst)},
                "data": {"text": b64},
            }
        else:
            payload = {
                "header": {"app_id": self.app_id, "status": 3},
                "parameter": {"its": {"from": self.lang(src), "to": self.lang(dst), "result": {}}},
                "payload": {"input_data": {"encoding": "utf8", "status": 3, "text": b64}},
            }
        return json.dumps(payload, ensure_ascii=False).encode("utf-8")

    def translate_once(self, text: str, src: str = "en", dst: str = "cn") -> str:
        body = self._build_body(text, src, dst)
        if self.protocol == "niutrans":
            target, headers = self._target_niutrans(body)
        else:
            target, headers = self._target_its()

        conn = self._conn()
        with self._lock:
            self.calls += 1
        try:
            conn.request("POST", target, body=body, headers=headers)
            resp = conn.getresponse()
            raw = resp.read()
            status = resp.status
        except (http.client.HTTPException, OSError) as exc:
            self._drop_conn()
            raise ApiError(f"网络错误: {exc}", retryable=True) from exc

        try:
            data = json.loads(raw.decode("utf-8", "replace"))
        except json.JSONDecodeError:
            raise ApiError(f"响应不是 JSON (HTTP {status}): {raw[:200]!r}", retryable=False)

        # 两种协议错误码位置不同
        if self.protocol == "niutrans":
            code = data.get("code")
            message = data.get("message") or ""
        else:
            code = (data.get("header") or {}).get("code")
            message = (data.get("header") or {}).get("message") or ""

        if status != 200 or code not in (0, None):
            hint = FATAL_HINTS.get(code, "")
            if code == 10404:
                hint = "语种参数不对：机器翻译（新）中文用 cn；niutrans 中文用 zh。"
            fatal = status in (401, 403) or code in (11200, 10313, 10404)
            raise ApiError(f"讯飞返回 code={code} message={message}" + (f"｜{hint}" if hint else ""),
                           fatal=fatal, code=code, retryable=not fatal)

        if self.protocol == "niutrans":
            dst_text = (((data.get("data") or {}).get("result") or {}).get("trans_result") or {}).get("dst")
        else:
            b64 = ((data.get("payload") or {}).get("result") or {}).get("text")
            if not b64:
                raise ApiError("响应缺少 payload.result.text", retryable=False)
            inner = json.loads(base64.b64decode(b64).decode("utf-8"))
            dst_text = (inner.get("trans_result") or {}).get("dst")
        if not dst_text:
            raise ApiError(f"翻译结果为空: {str(data)[:200]}", retryable=False)
        return dst_text

    def translate(self, text: str, src: str = "en", dst: str = "cn", retries: int = 3) -> str:
        outs = []
        for chunk in split_long(text):
            delay = 0.8
            for attempt in range(retries + 1):
                try:
                    outs.append(self.translate_once(chunk, src, dst))
                    break
                except ApiError as exc:
                    if exc.fatal or not exc.retryable or attempt >= retries:
                        raise
                    time.sleep(delay)
                    delay = min(delay * 2, 8)
        return " ".join(outs)


# ---------------------------------------------------------------- 缓存

class Cache:
    def __init__(self, path: Path):
        self.path = path
        self.data: dict[str, dict] = {}
        self.lock = threading.Lock()
        self.dirty = False
        if path.exists():
            try:
                self.data = json.loads(path.read_text(encoding="utf-8"))
            except Exception:
                self.data = {}

    @staticmethod
    def key(text: str, src: str, dst: str) -> str:
        return hashlib.sha1(f"{CACHE_VERSION}|{src}|{dst}|{text}".encode("utf-8")).hexdigest()

    def get(self, k: str) -> str | None:
        with self.lock:
            item = self.data.get(k)
            return item.get("zh") if isinstance(item, dict) else None

    def set(self, k: str, zh: str) -> None:
        with self.lock:
            self.data[k] = {"zh": zh, "at": time.strftime("%Y-%m-%dT%H:%M:%S")}
            self.dirty = True
            flush = len(self.data) % 50 == 0
        if flush:
            self.flush()

    def flush(self) -> None:
        with self.lock:
            if not self.dirty:
                return
            self.path.parent.mkdir(parents=True, exist_ok=True)
            tmp = self.path.with_suffix(".tmp")
            tmp.write_text(json.dumps(self.data, ensure_ascii=False), encoding="utf-8")
            tmp.replace(self.path)
            self.dirty = False


# ---------------------------------------------------------------- 翻译单元

@dataclass
class Unit:
    key: str            # slug#blockId 或 slug#blockId#l3 / #c7
    kind: str           # block 类型，或 list-line / table-cell
    text: str
    block: dict | None = None
    base: str = ""      # 列表/表格：所属 block 的 key
    idx: int = -1       # 列表行号 / 表格单元格序号


def translate_text(client: XfyunClient, cache: Cache | None, unit: Unit, src: str, dst: str) -> tuple[str | None, str]:
    """返回 (译文 或 None, 备注)。三级降级都在这里。"""
    if not unit.text.strip():
        return None, "empty"
    if cache is not None:
        hit = cache.get(Cache.key(unit.text, src, dst))
        if hit:
            return hit, "cached"

    def save(zh: str) -> None:
        if cache is not None:
            cache.set(Cache.key(unit.text, src, dst), zh)

    # 1) 首选占位符
    m = protect(unit.text, 0)
    if not m.text.strip():
        return None, "nothing-to-translate"
    try:
        raw = client.translate(m.text, src, dst)
    except ApiError as exc:
        if exc.fatal:
            raise
        return None, f"error:{exc}"
    zh = restore(raw, m.tokens)
    if zh:
        zh = finalize_links(zh, m, client, cache, src, dst)
        save(zh)
        return zh, "translated"

    # 2) 换一套占位符语法重试
    m2 = protect(unit.text, 1)
    try:
        raw2 = client.translate(m2.text, src, dst)
    except ApiError as exc:
        if exc.fatal:
            raise
        return None, f"placeholder-lost+error:{exc}"
    zh2 = restore(raw2, m2.tokens)
    if zh2:
        zh2 = finalize_links(zh2, m2, client, cache, src, dst)
        save(zh2)
        return zh2, "translated(style2)"

    # 3) 按占位符切段：代码绝对安全，但语句会碎，作为最后手段
    parts = re.split(r"(⟦\d+⟧)", m.text)
    rebuilt = []
    for part in parts:
        if not part:
            continue
        if PH_RE.fullmatch(part) or not re.search(r"[A-Za-z]{2,}", part):
            rebuilt.append(part)
            continue
        # 保留原有的前后空格，避免拼接后出现「（译） .」这种多余空格
        head = part[: len(part) - len(part.lstrip())]
        tail = part[len(part.rstrip()):]
        core = part.strip()
        try:
            rebuilt.append(head + client.translate(core, src, dst) + tail)
        except ApiError as exc:
            if exc.fatal:
                raise
            return None, f"segment-error:{exc}"
    zh3 = restore("".join(rebuilt), m.tokens)
    if zh3:
        zh3 = finalize_links(zh3, m, client, cache, src, dst)
        save(zh3)
        return zh3, "translated(segmented)"
    return None, "placeholder-lost"


def table_cells(md: str) -> list[dict]:
    """返回 [{'line': li, 'pos': 第几个单元格, 'text': 原文}]，跳过对齐行。"""
    out = []
    for li, line in enumerate(md.split("\n")):
        if not line.strip().startswith("|"):
            continue
        if re.fullmatch(r"\s*\|?[\s:|-]+\|?\s*", line):
            continue
        parts = line.strip().split("|")
        for pos, cell in enumerate(parts[1:-1]):
            if cell.strip():
                out.append({"line": li, "pos": pos, "text": cell.strip()})
    return out


def rebuild_table(md: str, translated: dict[tuple[int, int], str]) -> str:
    lines = md.split("\n")
    for (li, pos), zh in translated.items():
        line = lines[li]
        parts = line.strip().split("|")
        if 0 < pos + 1 < len(parts):
            parts[pos + 1] = f" {zh} "
            indent = line[: len(line) - len(line.lstrip())]
            lines[li] = indent + "|".join(parts)
    return "\n".join(lines)


def build_units(dataset: dict, only: str | None, force: bool, with_tables: bool) -> list[Unit]:
    units: list[Unit] = []
    for section in dataset.get("sections", []):
        for chapter in section.get("chapters", []):
            if only and chapter.get("slug") != only:
                continue
            slug = chapter.get("slug") or chapter.get("path", "").strip("/")
            for block in chapter.get("blocks", []):
                btype = block.get("type")
                if btype not in TRANSLATABLE:
                    continue
                if block.get("zh") and not force:
                    continue
                bid = f"{slug}#{block['id']}"
                md = block.get("md") or ""

                if btype == "table":
                    if not with_tables or not md.lstrip().startswith("|"):
                        continue
                    for i, cell in enumerate(table_cells(md)):
                        units.append(Unit(f"{bid}#c{i}", "table-cell", cell["text"], block, bid, i))
                    continue

                if btype == "list":
                    for li, line in enumerate(md.split("\n")):
                        m = re.match(r"^(\s*(?:[-*+]|\d+[.)])\s+)(.*)$", line)
                        if m and m.group(2).strip():
                            units.append(Unit(f"{bid}#l{li}", "list-line", m.group(2), block, bid, li))
                    continue

                if md.strip():
                    units.append(Unit(bid, btype, md, block, bid, -1))
    return units


# ---------------------------------------------------------------- Markdown 镜像

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
    text = "\n".join(out).strip() + "\n"
    return re.sub(r"\n{4,}", "\n\n\n", text)


# ---------------------------------------------------------------- CLI

def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--env", default=str(ROOT / ".env"))
    ap.add_argument("--base", default="")
    ap.add_argument("--json", default=str(DEFAULT_JSON))
    ap.add_argument("--out", default="")
    ap.add_argument("--md", default=str(DEFAULT_MD))
    ap.add_argument("--cache", default=str(CACHE_PATH))
    ap.add_argument("--from", dest="src", default="en")
    ap.add_argument("--to", dest="dst", default="cn")
    ap.add_argument("--concurrency", type=int, default=3)
    ap.add_argument("--interval", type=float, default=0.2, help="每次请求后的间隔秒数")
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--only", default="")
    ap.add_argument("--force", action="store_true", help="忽略已有 zh 与缓存，全部重翻")
    ap.add_argument("--no-tables", action="store_true", help="不翻表格单元格")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--check", action="store_true", help="只发一个最小请求验证凭证")
    args = ap.parse_args()

    env = load_env(Path(args.env))
    env.update({k: os.environ[k] for k in ("APP_ID", "API_KEY", "API_SECRET", "TANS_BASE_API")
                if os.environ.get(k)})
    base = args.base or env.get("TANS_BASE_API") or "https://itrans.xf-yun.com/v1/its"
    app_id, api_key, api_secret = env.get("APP_ID", ""), env.get("API_KEY", ""), env.get("API_SECRET", "")
    missing = [k for k, v in (("APP_ID", app_id), ("API_KEY", api_key), ("API_SECRET", api_secret)) if not v]
    if missing:
        print(f"[配置] .env 缺少 {', '.join(missing)}", file=sys.stderr)
        return 2

    client = XfyunClient(base, app_id, api_key, api_secret)

    if args.check:
        print(f"[check] POST {base}")
        try:
            print(f"[check] OK，译文：{client.translate_once('Hello, world.')}")
            return 0
        except ApiError as exc:
            print(f"[check] 失败：{exc}", file=sys.stderr)
            return 1

    dataset = json.loads(Path(args.json).read_text(encoding="utf-8"))
    out_path = Path(args.out) if args.out else Path(args.json).with_suffix(".zh.json")

    # 增量翻译：把上一次产物里的译文合并回来，只翻新增/改动/失败的块
    if out_path.exists() and not args.force:
        try:
            prev = json.loads(out_path.read_text(encoding="utf-8"))
            prev_zh = {
                (ch.get("slug"), b.get("id")): b["zh"]
                for sec in prev.get("sections", [])
                for ch in sec.get("chapters", [])
                for b in ch.get("blocks", [])
                if b.get("zh")
            }
            carried = 0
            for sec in dataset.get("sections", []):
                for ch in sec.get("chapters", []):
                    for b in ch.get("blocks", []):
                        zh = prev_zh.get((ch.get("slug"), b.get("id")))
                        if zh:
                            b["zh"] = zh
                            carried += 1
            if carried:
                print(f"[合并] 沿用上次译文 {carried:,} 块")
        except Exception as exc:
            print(f"[合并] 跳过（{exc}）")

    units = build_units(dataset, args.only or None, args.force, not args.no_tables)
    chars = sum(len(u.text) for u in units)
    print(f"[规模] 待翻 {len(units):,} 个单元 / {chars:,} 字符（约 {len(units):,} 次请求）")
    print(f"[语种] {args.src} -> {args.dst}   端点 {base}")
    if args.dry_run:
        print("[dry-run] 未发送任何请求。")
        return 0
    if not units:
        print("[完成] 没有需要翻译的内容，只刷新统计与 Markdown 镜像。")
    if args.limit:
        units = units[: args.limit]
        print(f"[试跑] 只翻前 {len(units)} 个单元")

    # --force 只表示"忽略已有 zh 重翻"，缓存仍然保留：新版 key 本来就不会命中旧条目，
    # 但中断后能靠新写入的缓存续跑
    cache = Cache(Path(args.cache))
    results: dict[str, str] = {}
    failures: list[dict] = []
    fatal: list[str] = []
    stop = threading.Event()
    counters = {"done": 0, "cached": 0}
    lock = threading.Lock()
    t0 = time.time()

    def work(unit: Unit) -> None:
        if stop.is_set():
            return
        try:
            zh, note = translate_text(client, cache, unit, args.src, args.dst)
        except ApiError as exc:
            if exc.fatal:
                fatal.append(str(exc))
                stop.set()
                return
            zh, note = None, f"error:{exc}"
        with lock:
            counters["done"] += 1
            if note == "cached":
                counters["cached"] += 1
            if zh:
                results[unit.key] = zh
            else:
                failures.append({"unit": unit.key, "reason": note, "text": unit.text[:120]})
            if counters["done"] % 20 == 0 or counters["done"] == len(units):
                d = counters["done"]
                eta = (time.time() - t0) / d * (len(units) - d)
                print(f"\r  进度 {d / len(units) * 100:5.1f}%  {d:,}/{len(units):,}  失败 {len(failures)}  ETA {eta:4.0f}s",
                      end="", flush=True)
        if args.interval:
            time.sleep(args.interval)

    with ThreadPoolExecutor(max_workers=max(1, args.concurrency)) as pool:
        futures = [pool.submit(work, u) for u in units]
        for f in as_completed(futures):
            f.result()
            if stop.is_set():
                for other in futures:
                    other.cancel()
                break
    print()

    if fatal:
        print(f"\n[中止] {fatal[0]}", file=sys.stderr)
        print("       修好后再跑同一条命令即可，已翻的都在缓存里。", file=sys.stderr)
        if cache:
            cache.flush()
        return 1

    # ---- 回填 ----
    by_key = {u.key: u for u in units}
    filled = 0
    list_parts: dict[str, dict[int, str]] = {}
    table_parts: dict[str, dict[tuple[int, int], str]] = {}
    blocks: dict[str, dict] = {}

    for key, zh in results.items():
        unit = by_key[key]
        if unit.block is None:
            continue
        blocks[unit.base] = unit.block
        if unit.kind == "list-line":
            list_parts.setdefault(unit.base, {})[unit.idx] = zh
        elif unit.kind == "table-cell":
            cell = table_cells(unit.block.get("md") or "")[unit.idx]
            table_parts.setdefault(unit.base, {})[(cell["line"], cell["pos"])] = zh
        else:
            unit.block["zh"] = zh
            filled += 1

    for base_key, lines in list_parts.items():
        block = blocks[base_key]
        out_lines = []
        for li, line in enumerate((block.get("md") or "").split("\n")):
            m = re.match(r"^(\s*(?:[-*+]|\d+[.)])\s+)(.*)$", line)
            out_lines.append(m.group(1) + lines[li] if (m and li in lines) else line)
        block["zh"] = "\n".join(out_lines)
        filled += 1

    for base_key, cells in table_parts.items():
        block = blocks[base_key]
        block["zh"] = rebuild_table(block.get("md") or "", cells)
        filled += 1

    total_with_zh = sum(
        1 for sec in dataset.get("sections", [])
        for ch in sec.get("chapters", [])
        for b in ch.get("blocks", []) if b.get("zh")
    )
    dataset.setdefault("meta", {})["translation"] = {
        "engine": "xfyun-itrans",
        "endpoint": base,
        "from": args.src,
        "to": args.dst,
        "translatedAt": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "blocksTranslated": total_with_zh,      # 文件里实际带 zh 的块数
        "unitsThisRun": len(units),
        "filledThisRun": filled,
        "failedThisRun": len(failures),
        "apiCallsThisRun": client.calls,
        "cacheHitsThisRun": counters["cached"],
    }

    out_path.write_text(json.dumps(dataset, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"[输出] {out_path}  ({out_path.stat().st_size / 1048576:.2f} MB，翻译 {filled} 块)")

    # ---- Markdown 镜像 ----
    md_root = Path(args.md)
    if md_root.exists():
        zh_root = md_root / "zh"
        manifest = md_root / "manifest.json"
        wrote = 0
        if manifest.exists():
            meta = json.loads(manifest.read_text(encoding="utf-8"))
            chapters = {c["path"]: c for s in dataset["sections"] for c in s["chapters"]}
            for section in meta.get("sections", []):
                for c in section.get("chapters", []):
                    if not (md_root / c["file"]).exists():
                        continue
                    chapter = chapters.get(c["path"])
                    if not chapter:
                        continue
                    if not any(b.get("zh") for b in chapter.get("blocks", [])):
                        continue          # 没翻过的章节不生成 zh 镜像
                    dst = zh_root / c["file"].replace("en/", "", 1)
                    dst.parent.mkdir(parents=True, exist_ok=True)
                    dst.write_text(chapter_to_markdown(chapter), encoding="utf-8")
                    wrote += 1
        print(f"[输出] {zh_root}  ({wrote} 个 .md)")

    # ---- 报告 ----
    report = {
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "units": len(units),
        "filled": filled,
        "failed": len(failures),
        "apiCalls": client.calls,
        "cacheHits": counters["cached"],
        "elapsed": round(time.time() - t0),
        "failures": failures[:500],
    }
    (ROOT / "docs/translation-report.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    if cache:
        cache.flush()
        print(f"[缓存] {len(cache.data):,} 条 → {args.cache}")
    print(f"[耗时] {time.time() - t0:.0f}s")
    if failures:
        print(f"[注意] {len(failures)} 个单元没翻成（保留英文），详见 docs/translation-report.json")
    return 0


if __name__ == "__main__":
    sys.exit(main())
