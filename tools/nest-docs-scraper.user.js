// ==UserScript==
// @name         NestJS 文档抓取器 → 左英右中对照语料
// @namespace    https://docs.nestjs.com/
// @version      1.0.0
// @description  按章节抓取 docs.nestjs.com 官方英文原文（Markdown），切分成可逐块对齐的双语 JSON，附 Markdown 压缩包，供「左侧英文 / 右侧中文」对照阅读的 app 使用
// @author       you
// @match        https://docs.nestjs.com/*
// @connect      docs.nestjs.com
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @run-at       document-idle
// @noframes
// ==/UserScript==

/**
 * 工作原理（为什么不用爬 DOM）
 * ------------------------------------------------------------------
 * docs.nestjs.com 是 Angular 单页应用，视图里没有可直接抓取的 HTML。
 * 但官方为每章都发布了纯 Markdown：
 *   https://docs.nestjs.com/controllers        →  https://docs.nestjs.com/controllers.md
 *   https://docs.nestjs.com/llms.txt           →  22 个分区 / 148 个章节的目录树
 * 所以本脚本抓的是「站点渲染所用的同一份原文」，代码块、表格、提示框都是原样，
 * 不会像 DOM 抓取那样丢结构、混入侧边栏和样式。
 *
 * 产出的 JSON 里每一章都被切成 blocks。每个块：
 *   { id, type, md, text }        md   = 英文原文（markdown，用于渲染左侧）
 *                                 text = 纯文本（喂给翻译服务/模型，翻完写回 zh 字段）
 * 让左右两栏共用同一份 blocks 数组，是「左边滚动右边同步」最省事的做法：
 * 两边都按 block 列表渲染，滚动同步只需要对齐 block 的 offsetTop。
 */

(function () {
  'use strict';

  /* ===================== 配置 ===================== */

  const CFG = {
    ORIGIN: 'https://docs.nestjs.com',
    TREE_URL: 'https://docs.nestjs.com/llms.txt',
    CONCURRENCY: 4,        // 并发抓取数，别调太高，官方站是公益
    GAP_MS: 120,           // 每次请求之间的间隔
    RETRY: 3,              // 单章失败重试次数
    CACHE_PREFIX: 'nestdocs:md:v1:', // 已抓到的 md 缓存，可断点续抓
    HINT_KEY: 'nestdocs:ui:collapsed',
  };

  /* ===================== 通用小工具 ===================== */

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function pad2(n) { return String(n).padStart(2, '0'); }
  function stamp() {
    const d = new Date();
    return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`;
  }
  function slugify(s) {
    return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }
  /* ===================== 解析器开始（纯函数，不碰 DOM，方便单独测试） ===================== */

  function attrOf(attrs, name) {
    const m = new RegExp(`${name}\\s*=\\s*"([^"]*)"`, 'i').exec(attrs || '');
    return m ? m[1] : '';
  }
  function absUrl(u) {
    if (!u) return u;
    if (/^https?:/i.test(u)) return u;
    return CFG.ORIGIN + (u.startsWith('/') ? u : '/' + u);
  }

  // 站点在 markdown 里用 {{ '{' }} 这类写法转义花括号，渲染时会还原，这里也还原。
  function unescapeBraces(s) {
    return s.replace(/\{\{\s*'([^']*)'\s*\}\}/g, '$1');
  }

  // 这些标签在 markdown 里以原始 HTML 块出现，需要整体收拢，不能按行当段落切
  const HTML_BLOCK_TAGS = new Set([
    'table', 'div', 'details', 'figure', 'section', 'iframe', 'video', 'pre', 'ul', 'ol', 'p', 'blockquote',
  ]);

  function countOpens(line, tag) {
    return (line.match(new RegExp(`<${tag}\\b`, 'gi')) || []).length;
  }
  function countCloses(line, tag) {
    return (line.match(new RegExp(`</${tag}\\s*>`, 'gi')) || []).length;
  }

  // 把 markdown 变成纯文本，用于翻译输入 / 搜索 / 字数统计
  function toPlainText(md) {
    return String(md)
      .replace(/<figure[\s\S]*?<\/figure>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/(\*\*|__)([\s\S]*?)\1/g, '$2')  // 只去粗体标记；单个 * / _ 保留，避免破坏 snake_case
      .replace(/`([^`]*)`/g, '$1')
      .replace(/^\s{0,3}#{1,6}\s+/gm, '')
      .replace(/^\s*>\s?/gm, '')
      .replace(/^\s*(?:[-*+]|\d{1,3}[.)])\s+/gm, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * 把一章 markdown 切成块。
   * 返回 { title, blocks }，blocks 里 type 取值：
   *   heading | paragraph | list | table | code | callout | image | details | html | hr
   */
  function parseMarkdown(src) {
    const text = unescapeBraces(String(src).replace(/\r\n?/g, '\n').replace(/^\uFEFF/, ''));
    const lines = text.split('\n');
    const blocks = [];
    const add = (b) => {
      if (b.type !== 'code' && !b.md && !b.src) return;      // 空块直接丢掉
      blocks.push(Object.assign({ id: 'b' + (blocks.length + 1) }, b));
    };

    let para = [];
    const flushPara = () => {
      if (!para.length) return;
      const body = para.join('\n').trim();
      para = [];
      if (!body) return;

      // 整段就是一个 <figure><img …></figure> 或 <img …>
      const fig = /^<figure>\s*<img\b([^>]*?)\/?>\s*<\/figure>$/i.exec(body) ||
                  /^<img\b([^>]*?)\/?>$/i.exec(body);
      if (fig) {
        add({ type: 'image', src: absUrl(attrOf(fig[1], 'src')), alt: attrOf(fig[1], 'alt'), md: body });
        return;
      }
      add({ type: 'paragraph', md: body });
    };

    let i = 0;
    while (i < lines.length) {
      const line = lines[i];

      // 空行
      if (/^\s*$/.test(line)) { flushPara(); i++; continue; }

      // 围栏代码块（``` 或 ~~~，闭合需要不短于起始长度）
      const fence = /^\s*(`{3,}|~{3,})\s*([\w+#.-]*)\s*$/.exec(line);
      if (fence) {
        flushPara();
        const marker = fence[1][0];
        const len = fence[1].length;
        const lang = fence[2] || '';
        const body = [];
        i++;
        const closeRe = new RegExp('^\\s*' + marker + '{' + len + ',}\\s*$');
        while (i < lines.length) {
          if (closeRe.test(lines[i])) { i++; break; }
          body.push(lines[i]);
          i++;
        }
        // 去掉源码围栏后多出的首尾空行，渲染更干净
        const code = body.join('\n').replace(/^(?:[ \t]*\n)+/, '').replace(/(?:\n[ \t]*)+$/, '');
        add({ type: 'code', lang, code });
        continue;
      }

      // 标题
      const heading = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
      if (heading) {
        flushPara();
        add({ type: 'heading', level: heading[1].length, md: heading[2].trim() });
        i++;
        continue;
      }

      // 引用块 / 提示框：> info **Hint** …… / > warning **Warning** ……
      if (/^\s{0,3}>/.test(line)) {
        flushPara();
        const buf = [];
        while (i < lines.length && /^\s{0,3}>/.test(lines[i])) {
          buf.push(lines[i].replace(/^\s{0,3}> ?/, ''));
          i++;
        }
        const first = buf[0] || '';
        const m = /^(info|warning|success|danger|note|tip|hint)\b\s*(?:\*\*([\s\S]+?)\*\*)?\s*([\s\S]*)$/i.exec(first);
        if (m) {
          add({
            type: 'callout',
            kind: m[1].toLowerCase(),
            title: (m[2] || '').trim(),
            md: [m[3], ...buf.slice(1)].join('\n').trim(),
          });
        } else {
          add({ type: 'callout', kind: 'info', title: '', md: buf.join('\n').trim() });
        }
        continue;
      }

      // 原始 HTML 块（<table> / <div class="file-tree"> / <details> …）
      const tagM = /^\s*<([a-z][a-z0-9-]*)\b/i.exec(line);
      if (tagM && HTML_BLOCK_TAGS.has(tagM[1].toLowerCase())) {
        flushPara();
        const tag = tagM[1].toLowerCase();
        const buf = [];
        let depth = 0;
        while (i < lines.length) {
          const l = lines[i];
          buf.push(l);
          i++;
          depth += countOpens(l, tag) - countCloses(l, tag);
          if (depth <= 0) break;
        }
        const html = buf.join('\n');

        // <figure> 只取图片
        const img = /<img\b([^>]*?)\/?>/i.exec(html);
        if (tag === 'figure' && img) {
          add({ type: 'image', src: absUrl(attrOf(img[1], 'src')), alt: attrOf(img[1], 'alt'), md: html });
          continue;
        }
        // <details><summary>标题</summary> 正文（正文里是 markdown）→ 折叠块
        if (tag === 'details') {
          const sum = /<summary>([\s\S]*?)<\/summary>/i.exec(html);
          const body = html
            .replace(/^[\s\S]*?<summary>[\s\S]*?<\/summary>/i, '')
            .replace(/<\/details>\s*$/i, '')
            .trim();
          add({ type: 'details', title: sum ? toPlainText(sum[1]) : '', md: body });
          continue;
        }
        add({ type: 'html', md: html });
        continue;
      }

      // 管道表格
      if (/^\s*\|/.test(line)) {
        flushPara();
        const buf = [];
        while (i < lines.length && /^\s*\|/.test(lines[i])) { buf.push(lines[i]); i++; }
        add({ type: 'table', md: buf.join('\n') });
        continue;
      }

      // 分隔线
      if (/^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/.test(line)) {
        flushPara();
        add({ type: 'hr' });
        i++;
        continue;
      }

      // 列表（含缩进续行、列表项里的代码块）
      if (/^\s{0,3}(?:[-*+]|\d{1,3}[.)])\s+/.test(line)) {
        flushPara();
        const buf = [line];
        i++;
        while (i < lines.length) {
          const l = lines[i];
          if (/^\s*$/.test(l)) {
            let j = i;
            while (j < lines.length && /^\s*$/.test(lines[j])) j++;
            const next = lines[j] || '';
            if (!next) { i = j; break; }
            // 空行之后仍是本列表的续行（缩进 / 新条目）→ 继续
            if (/^\s{2,}/.test(next) || /^\s{0,3}(?:[-*+]|\d{1,3}[.)])\s+/.test(next)) {
              buf.push('');
              i++;
              continue;
            }
            i = j;
            break;
          }
          // 顶格出现新的块级语法 → 列表结束
          if (!/^\s{2,}/.test(l) && /^\s{0,3}(?:#{1,6}\s|`{3,}|~{3,}|\|)/.test(l)) break;
          buf.push(l);
          i++;
        }
        add({ type: 'list', md: buf.join('\n').trim() });
        continue;
      }

      // 普通段落
      para.push(line);
      i++;
    }
    flushPara();

    // 取一级标题当章节名，去掉原文自带的 "Source: …" 行
    let title = '';
    const cleaned = [];
    for (const b of blocks) {
      if (!title && b.type === 'heading' && b.level === 1) { title = toPlainText(b.md); continue; }
      if (b.type === 'paragraph' && /^Source:\s*https?:\/\/\S+$/.test(b.md)) continue;
      cleaned.push(b);
    }
    // 重新编号，保证 id 连续
    cleaned.forEach((b, idx) => { b.id = 'b' + (idx + 1); });

    // 补 text（翻译输入）与相对图片地址
    for (const b of cleaned) {
      if (b.type === 'paragraph' || b.type === 'heading' || b.type === 'list' || b.type === 'callout') {
        b.text = toPlainText(b.md);
      } else if (b.type === 'details') {
        b.text = b.title ? `${b.title} ${toPlainText(b.md)}`.trim() : toPlainText(b.md);
      }
      if (b.md && b.type !== 'code') b.md = b.md.replace(/src="\//g, `src="${CFG.ORIGIN}/`);
    }

    return { title, blocks: cleaned };
  }

  // 解析 llms.txt 目录树：## 分区 / - [标题](url.md): 摘要
  function parseLlmsTxt(txt) {
    const sections = [];
    let cur = null;
    let secIndex = 0;
    let chapIndex = 0;

    for (const raw of String(txt).split('\n')) {
      const line = raw.trimRight();
      const sec = /^##\s+(.+?)\s*$/.exec(line);
      if (sec) {
        cur = { id: slugify(sec[1]) || 'sec-' + (sections.length + 1), title: sec[1], order: ++secIndex, chapters: [] };
        sections.push(cur);
        chapIndex = 0;
        continue;
      }
      const item = /^-\s+\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)(?::\s*(.*))?$/.exec(line);
      if (item && cur) {
        const url = item[2];
        if (!/^https:\/\/docs\.nestjs\.com\//.test(url) || !url.endsWith('.md')) continue;
        const path = new URL(url).pathname.replace(/\.md$/, '');
        cur.chapters.push({
          title: item[1],
          summary: (item[3] || '').trim(),
          path,
          mdUrl: url,
          slug: path.replace(/^\//, '').replace(/\//g, '-') || 'index',
          order: ++chapIndex,
        });
      }
    }
    return sections.filter((s) => s.chapters.length > 0);
  }

  /* ===================== 解析器结束 ===================== */

  /* ===================== 存储 / 网络 ===================== */

  const store = (() => {
    try {
      if (typeof GM_setValue === 'function' && typeof GM_getValue === 'function') {
        return {
          get: (k, d) => GM_getValue(k, d),
          set: (k, v) => GM_setValue(k, v),
          del: (k) => (typeof GM_deleteValue === 'function' ? GM_deleteValue(k) : GM_setValue(k, undefined)),
        };
      }
    } catch (e) { /* 走 localStorage 兜底 */ }
    return {
      get: (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
      set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { console.warn('[nest-scraper] 缓存写入失败', e); } },
      del: (k) => { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } },
    };
  })();

  function gmFetch(url, timeout) {
    const run = () => new Promise((resolve, reject) => {
      if (typeof GM_xmlhttpRequest === 'function') {
        GM_xmlhttpRequest({
          method: 'GET',
          url,
          timeout: timeout || 45000,
          headers: { Accept: 'text/markdown,text/plain,*/*' },
          onload: (r) => (r.status >= 200 && r.status < 300 ? resolve(r.responseText)
            : reject(new Error('HTTP ' + r.status))),
          ontimeout: () => reject(new Error('timeout')),
          onerror: () => reject(new Error('network error')),
        });
        return;
      }
      fetch(url, { credentials: 'omit' })
        .then((r) => (r.ok ? r.text() : Promise.reject(new Error('HTTP ' + r.status))))
        .then(resolve, reject);
    });
    // 官方站偶尔抽风，退避重试
    let p = run();
    for (let k = 1; k < CFG.RETRY; k++) {
      p = p.catch(() => sleep(600 * k).then(run));
    }
    return p;
  }

  async function fetchCached(mdUrl) {
    const key = CFG.CACHE_PREFIX + mdUrl;
    const hit = store.get(key, null);
    if (typeof hit === 'string' && hit.length > 0) return { md: hit, cached: true };
    const md = await gmFetch(mdUrl);
    store.set(key, md);
    return { md, cached: false };
  }

  // 限并发执行
  async function mapLimit(items, limit, worker, onTick) {
    let cursor = 0;
    let done = 0;
    const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (true) {
        if (run.aborted) return;                 // 停止时让在飞请求跑完就收工
        const idx = cursor++;
        if (idx >= items.length) return;
        await worker(items[idx], idx);
        done += 1;
        onTick && onTick(done, items.length);
        if (!run.aborted) await sleep(CFG.GAP_MS); // 对官方站客气一点
      }
    });
    await Promise.all(runners);
  }

  /* ===================== 抓取逻辑 ===================== */

  const run = {
    aborted: false,
    busy: false,
    tree: null,        // [{ id, title, order, chapters: [...] }]
    chapters: new Map(), // slug -> chapter record（含 blocks）
    startedAt: 0,
  };

  async function ensureTree() {
    if (run.tree) return run.tree;
    log('读取目录树 llms.txt …');
    const txt = await gmFetch(CFG.TREE_URL);
    const tree = parseLlmsTxt(txt);
    const total = tree.reduce((n, s) => n + s.chapters.length, 0);
    if (!tree.length) throw new Error('目录树解析为空，可能官网结构变了');
    run.tree = tree;
    log(`目录：${tree.length} 个分区 / ${total} 个章节`);
    return tree;
  }

  async function crawlChapter(ch) {
    const { md, cached } = await fetchCached(ch.mdUrl);
    const parsed = parseMarkdown(md);
    const rec = {
      slug: ch.slug,
      title: parsed.title || ch.title,
      path: ch.path,
      url: CFG.ORIGIN + ch.path,
      summary: ch.summary || '',
      order: ch.order,
      blocks: parsed.blocks,
      chars: parsed.blocks.reduce((n, b) => n + (b.text || b.code || '').length, 0),
    };
    run.chapters.set(ch.slug, rec);
    return { rec, cached };
  }

  async function crawlAll() {
    if (run.busy) return;
    run.busy = true;
    run.aborted = false;
    run.chapters.clear();
    run.startedAt = Date.now();
    setUi();

    try {
      const tree = await ensureTree();
      const all = tree.flatMap((s) => s.chapters.map((c) => ({ ...c, section: s.title })));
      log(`开始抓取 ${all.length} 章（并发 ${CFG.CONCURRENCY}）…`);

      let cachedCount = 0;
      let failed = 0;
      await mapLimit(all, CFG.CONCURRENCY, async (ch) => {
        try {
          const { cached } = await crawlChapter(ch);
          if (cached) cachedCount += 1;
        } catch (e) {
          failed += 1;
          log(`✗ ${ch.path} — ${e.message}`, 'err');
        }
      }, (done, total) => {
        setProgress(done, total, `${done}/${total} 章 · 缓存命中 ${cachedCount}${failed ? ` · 失败 ${failed}` : ''}`);
      });

      const blocks = [...run.chapters.values()].reduce((n, c) => n + c.blocks.length, 0);
      const secs = Math.round((Date.now() - run.startedAt) / 1000);
      if (run.aborted) {
        log(`已停止：${run.chapters.size} 章 / ${blocks} 块（已抓到的可直接导出）`, 'err');
        setProgress(run.chapters.size, all.length, `已停止 ${run.chapters.size}/${all.length} 章`);
      } else {
        log(`完成：${run.chapters.size} 章 / ${blocks} 块 / 用时 ${secs}s`, 'ok');
        setProgress(all.length, all.length, `抓取完成 ${run.chapters.size}/${all.length} 章`);
      }
    } catch (e) {
      log('抓取中断：' + e.message, 'err');
    } finally {
      run.busy = false;
      setUi();
    }
  }

  async function crawlCurrent() {
    if (run.busy) return;
    run.busy = true;
    run.aborted = false;
    setUi();
    try {
      const tree = await ensureTree();
      const path = (location.pathname.replace(/\/$/, '') || '/index');
      const flat = tree.flatMap((s) => s.chapters.map((c) => ({ ...c, section: s.title })));
      const hit = flat.find((c) => c.path === path) || flat.find((c) => c.path === '/index' && path === '/');
      const ch = hit || {
        title: document.title.replace(/\s*\|\s*NestJS.*$/, '').trim() || 'Untitled',
        summary: '', path, mdUrl: path + '.md', slug: (path.replace(/^\//, '') || 'index'), order: 0,
      };
      log(`抓取当前章节 ${ch.path} …`);
      const { rec } = await crawlChapter(ch);
      log(`✓ ${rec.title} · ${rec.blocks.length} 块`, 'ok');
      setProgress(1, 1, `已抓 1 章：${rec.title}`);
    } catch (e) {
      log('抓取失败：' + e.message, 'err');
    } finally {
      run.busy = false;
      setUi();
    }
  }

  /* ===================== 导出 ===================== */

  function buildDataset() {
    if (!run.tree) throw new Error('还没有抓到内容，先点「抓取全部」');
    const sections = run.tree.map((s) => ({
      id: s.id,
      title: s.title,
      order: s.order,
      chapters: s.chapters
        .map((c) => run.chapters.get(c.slug))
        .filter(Boolean)
        .map((c) => ({
          slug: c.slug,
          title: c.title,
          path: c.path,
          url: c.url,
          section: s.title,
          summary: c.summary,
          order: c.order,
          blocks: c.blocks,
        })),
    })).filter((s) => s.chapters.length);
    const chapterCount = sections.reduce((n, s) => n + s.chapters.length, 0);
    const blockCount = sections.reduce((n, s) => n + s.chapters.reduce((m, c) => m + c.blocks.length, 0), 0);
    return {
      meta: {
        source: CFG.ORIGIN,
        generatedAt: new Date().toISOString(),
        generator: 'nest-docs-scraper.user.js v1.0.0',
        sections: sections.length,
        chapters: chapterCount,
        blocks: blockCount,
        hint: '左侧渲染 block.md；右侧渲染 block.zh（翻译后写回）。两边共用同一 blocks 数组即可做滚动同步。',
      },
      sections,
    };
  }

  function downloadBlob(blob, filename) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
  }

  function exportJson() {
    const data = buildDataset();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
    downloadBlob(blob, `nestjs-docs-${stamp()}.json`);
    log(`已导出 JSON：${data.meta.chapters} 章 / ${data.meta.blocks} 块 / ${(blob.size / 1048576).toFixed(2)} MB`, 'ok');
  }

  // ---- 极简 ZIP（store 模式，无压缩、零依赖）----
  const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(buf) {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  function makeZip(files) {
    const enc = new TextEncoder();
    const now = new Date();
    const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
    const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
    const chunks = [];
    const central = [];
    let offset = 0;

    for (const f of files) {
      const name = enc.encode(f.name);
      const data = typeof f.data === 'string' ? enc.encode(f.data) : f.data;
      const crc = crc32(data);

      const lh = new Uint8Array(30 + name.length);
      const dv = new DataView(lh.buffer);
      dv.setUint32(0, 0x04034b50, true);
      dv.setUint16(4, 20, true);      // version needed
      dv.setUint16(6, 0x0800, true);  // flag: UTF-8 文件名
      dv.setUint16(8, 0, true);       // method: store
      dv.setUint16(10, dosTime, true);
      dv.setUint16(12, dosDate, true);
      dv.setUint32(14, crc, true);
      dv.setUint32(18, data.length, true);
      dv.setUint32(22, data.length, true);
      dv.setUint16(26, name.length, true);
      dv.setUint16(28, 0, true);
      lh.set(name, 30);

      const ch = new Uint8Array(46 + name.length);
      const cv = new DataView(ch.buffer);
      cv.setUint32(0, 0x02014b50, true);
      cv.setUint16(4, 20, true);      // version made by
      cv.setUint16(6, 20, true);      // version needed
      cv.setUint16(8, 0x0800, true);
      cv.setUint16(10, 0, true);
      cv.setUint16(12, dosTime, true);
      cv.setUint16(14, dosDate, true);
      cv.setUint32(16, crc, true);
      cv.setUint32(20, data.length, true);
      cv.setUint32(24, data.length, true);
      cv.setUint16(28, name.length, true);
      cv.setUint16(30, 0, true);
      cv.setUint16(32, 0, true);
      cv.setUint16(34, 0, true);
      cv.setUint16(36, 0, true);
      cv.setUint32(38, 0, true);
      cv.setUint32(42, offset, true);
      ch.set(name, 46);

      chunks.push(lh, data);
      central.push(ch);
      offset += lh.length + data.length;
    }

    const cdSize = central.reduce((n, c) => n + c.length, 0);
    const eocd = new Uint8Array(22);
    const ev = new DataView(eocd.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(4, 0, true);
    ev.setUint16(6, 0, true);
    ev.setUint16(8, files.length, true);
    ev.setUint16(10, files.length, true);
    ev.setUint32(12, cdSize, true);
    ev.setUint32(16, offset, true);   // 中央目录起始偏移
    ev.setUint16(20, 0, true);

    return new Blob([...chunks, ...central, eocd], { type: 'application/zip' });
  }

  function exportZip() {
    const data = buildDataset();
    const files = [];
    const manifest = { generatedAt: data.meta.generatedAt, source: data.meta.source, sections: [] };

    for (const s of data.sections) {
      const secDir = `en/${pad2(s.order)}-${s.id}`;
      const secMan = { id: s.id, title: s.title, chapters: [] };
      for (const c of s.chapters) {
        const base = `${pad2(c.order)}-${c.slug}`;
        files.push({ name: `${secDir}/${base}.md`, data: chapterToMarkdown(c) });
        secMan.chapters.push({ title: c.title, path: c.path, file: `${secDir}/${base}.md`, summary: c.summary });
      }
      manifest.sections.push(secMan);
    }
    files.push({ name: 'manifest.json', data: JSON.stringify(manifest, null, 2) });

    const blob = makeZip(files);
    downloadBlob(blob, `nestjs-docs-md-${stamp()}.zip`);
    log(`已导出 ZIP：${files.length - 1} 个 .md + manifest.json / ${(blob.size / 1048576).toFixed(2)} MB`, 'ok');
  }

  // 把块还原成可读的 markdown（代码块原样，callout 还原成引用）
  function chapterToMarkdown(c) {
    const out = [`# ${c.title}`, '', `Source: ${c.url}`, ''];
    for (const b of c.blocks) {
      switch (b.type) {
        case 'heading': out.push(`${'#'.repeat(b.level)} ${b.md}`, ''); break;
        case 'paragraph': out.push(b.md, ''); break;
        case 'list': out.push(b.md, ''); break;
        case 'table': out.push(b.md, ''); break;
        case 'code': out.push('```' + (b.lang || ''), b.code, '```', ''); break;
        case 'callout': {
          const head = `${b.kind}${b.title ? ` **${b.title}**` : ''}`;
          const body = (b.md || '').split('\n').map((l) => (l ? `> ${l}` : '>'));
          out.push(`> ${head}${b.md ? ' ' + body.shift().replace(/^> ?/, '') : ''}`, ...body, '');
          break;
        }
        case 'image': out.push(b.md || `<img src="${b.src}" alt="${b.alt || ''}" />`, ''); break;
        case 'details': out.push(`<details><summary>${b.title}</summary>`, '', b.md, '', '</details>', ''); break;
        case 'hr': out.push('---', ''); break;
        default: out.push(b.md || '', '');
      }
    }
    // 注意：不能再对整体做 \n{3,} 压缩，否则会吃掉代码块里的空行
    return out.join('\n').trim() + '\n';
  }

  /* ===================== 界面 ===================== */

  const ui = { host: null, root: null, bar: null, status: null, logBox: null, btns: {} };

  const CSS = `
    :host { all: initial; }
    .wrap { position: fixed; right: 18px; bottom: 18px; z-index: 2147483000;
      width: 330px; font: 12px/1.5 -apple-system, "SF Pro Text", "PingFang SC", "Microsoft YaHei", sans-serif;
      color: #e7e7ea; background: #14141a; border: 1px solid #2c2c36; border-radius: 12px;
      box-shadow: 0 12px 40px rgba(0,0,0,.55); overflow: hidden; }
    .hd { display: flex; align-items: center; gap: 8px; padding: 10px 12px; background: #1b1b23;
      border-bottom: 1px solid #2c2c36; cursor: move; user-select: none; }
    .dot { width: 8px; height: 8px; border-radius: 50%; background: #555; flex: none; }
    .dot.on { background: #e0234e; box-shadow: 0 0 8px #e0234e; }
    .dot.done { background: #35c46b; }
    .title { font-weight: 600; font-size: 12.5px; letter-spacing: .2px; flex: 1; }
    .min { border: 0; background: transparent; color: #8b8b96; cursor: pointer; font-size: 14px; padding: 0 2px; }
    .body { padding: 10px 12px 12px; display: grid; gap: 9px; }
    .body.hide { display: none; }
    .bar { height: 4px; border-radius: 3px; background: #2a2a33; overflow: hidden; }
    .bar > i { display: block; height: 100%; width: 0%; background: linear-gradient(90deg,#e0234e,#ff6b8a); transition: width .2s; }
    .status { color: #9a9aa6; font-size: 11px; }
    .row { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
    button.b { border: 1px solid #33333f; background: #20202a; color: #dcdce2; border-radius: 7px;
      padding: 6px 8px; font-size: 11.5px; cursor: pointer; transition: .15s; white-space: nowrap; }
    button.b:hover:not(:disabled) { background: #2a2a36; border-color: #45455a; }
    button.b:disabled { opacity: .38; cursor: not-allowed; }
    button.b.pri { background: #e0234e; border-color: #e0234e; color: #fff; font-weight: 600; }
    button.b.pri:hover:not(:disabled) { background: #f0325e; }
    .log { max-height: 108px; overflow: auto; background: #0d0d11; border: 1px solid #24242d;
      border-radius: 7px; padding: 6px 8px; font: 10.5px/1.6 ui-monospace, Menlo, Consolas, monospace;
      color: #8f8f9c; white-space: pre-wrap; word-break: break-all; }
    .log .ok { color: #43d17a; } .log .err { color: #ff6b81; }
    .tip { color: #6c6c78; font-size: 10.5px; }
  `;

  function buildUi() {
    const host = document.createElement('div');
    host.id = 'nest-docs-scraper';
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `
      <style>${CSS}</style>
      <div class="wrap">
        <div class="hd">
          <span class="dot"></span>
          <span class="title">NestJS 文档抓取</span>
          <button class="min" title="折叠">—</button>
        </div>
        <div class="body">
          <div class="bar"><i></i></div>
          <div class="status">就绪 · 点击「抓取全部章节」</div>
          <div class="row">
            <button class="b pri" data-act="all">抓取全部章节</button>
            <button class="b" data-act="one">只抓当前页</button>
            <button class="b" data-act="stop" disabled>停止</button>
            <button class="b" data-act="clear">清空缓存</button>
            <button class="b" data-act="json" disabled>下载 JSON</button>
            <button class="b" data-act="zip" disabled>下载 Markdown</button>
          </div>
          <div class="log"></div>
          <div class="tip">数据源：本站 llms.txt + 各章 .md 原文 · 快捷键 Alt+S 开始</div>
        </div>
      </div>`;

    document.documentElement.appendChild(host);
    ui.host = host;
    ui.root = root;
    ui.bar = root.querySelector('.bar > i');
    ui.status = root.querySelector('.status');
    ui.logBox = root.querySelector('.log');
    ui.dot = root.querySelector('.dot');

    const body = root.querySelector('.body');
    root.querySelector('.min').addEventListener('click', () => {
      body.classList.toggle('hide');
      store.set(CFG.HINT_KEY, body.classList.contains('hide'));
    });
    if (store.get(CFG.HINT_KEY, false)) body.classList.add('hide');

    root.querySelectorAll('button.b').forEach((btn) => {
      ui.btns[btn.dataset.act] = btn;
      btn.addEventListener('click', () => onAction(btn.dataset.act));
    });

    // 拖动面板
    const wrap = root.querySelector('.wrap');
    const hd = root.querySelector('.hd');
    let drag = null;
    hd.addEventListener('mousedown', (e) => {
      if (e.target.closest('button')) return;
      const r = wrap.getBoundingClientRect();
      drag = { dx: e.clientX - r.left, dy: e.clientY - r.top };
      e.preventDefault();
    });
    window.addEventListener('mousemove', (e) => {
      if (!drag) return;
      wrap.style.left = Math.max(4, Math.min(innerWidth - 120, e.clientX - drag.dx)) + 'px';
      wrap.style.top = Math.max(4, Math.min(innerHeight - 60, e.clientY - drag.dy)) + 'px';
      wrap.style.right = 'auto';
      wrap.style.bottom = 'auto';
    });
    window.addEventListener('mouseup', () => { drag = null; });

    window.addEventListener('keydown', (e) => {
      if (e.altKey && (e.key === 's' || e.key === 'S')) { e.preventDefault(); onAction('all'); }
    });

    setUi();
  }

  function log(msg, kind) {
    const el = ui.logBox;
    if (!el) { console.log('[nest-scraper]', msg); return; }
    const line = document.createElement('div');
    if (kind) line.className = kind;
    line.textContent = msg;
    el.appendChild(line);
    while (el.childElementCount > 200) el.firstElementChild.remove();
    el.scrollTop = el.scrollHeight;
  }

  function setProgress(done, total, text) {
    if (ui.bar) ui.bar.style.width = total ? `${Math.round((done / total) * 100)}%` : '0%';
    if (text && ui.status) ui.status.textContent = text;
  }

  function setUi() {
    if (!ui.root) return;
    const hasData = run.chapters.size > 0;
    ui.btns.all.disabled = run.busy;
    ui.btns.one.disabled = run.busy;
    ui.btns.stop.disabled = !run.busy;
    ui.btns.json.disabled = run.busy || !hasData;
    ui.btns.zip.disabled = run.busy || !hasData;
    ui.dot.classList.toggle('on', run.busy);
    ui.dot.classList.toggle('done', !run.busy && hasData);
  }

  function onAction(act) {
    switch (act) {
      case 'all': return crawlAll();
      case 'one': return crawlCurrent();
      case 'stop':
        run.aborted = true;
        log('已请求停止（进行中的请求会跑完）', 'err');
        return;
      case 'clear': {
        let n = 0;
        if (run.tree) {
          for (const s of run.tree) for (const c of s.chapters) { store.del(CFG.CACHE_PREFIX + c.mdUrl); n++; }
        }
        run.chapters.clear();
        log(`已清空缓存（${n} 章）`, 'ok');
        setProgress(0, 1, '缓存已清空');
        setUi();
        return;
      }
      case 'json':
        try { exportJson(); } catch (e) { log(e.message, 'err'); }
        return;
      case 'zip':
        try { exportZip(); } catch (e) { log(e.message, 'err'); }
        return;
      default: return;
    }
  }

  /* ===================== 启动 ===================== */

  function boot() {
    if (document.getElementById('nest-docs-scraper')) return;
    buildUi();
    log('就绪。目标：' + CFG.ORIGIN);
    log('提示：先「抓取全部章节」，再「下载 JSON」。');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
