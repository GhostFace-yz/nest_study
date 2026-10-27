/**
 * 翻译核心（浏览器 / Node 通用，零依赖）
 * ------------------------------------------------------------------
 * 职责：把「一批带 id 的文本」翻成中文，并保证：
 *   1. 占位符原样保留（你的 prepare.py 会把行内 <code>/<a> 换成 [[0]]、[[1]]）；
 *   2. 返回的 id 与请求一一对应，缺的自动补翻；
 *   3. 结果立刻写进你传入的 cache —— 这就是「第二次不用翻译」的落点；
 *   4. provider 只差一个 fetch，deepseek / gemini 随时切换。
 *
 * 用法（Node CLI 见 translate-docs.mjs；浏览器里 import 后直接调）：
 *
 *   const { results, stats } = await translateUnits(units, {
 *     provider: 'deepseek', model: 'deepseek-chat', apiKey,
 *     cache: createIdbCache(),        // 浏览器
 *     concurrency: 3,
 *     onEvent: (e) => console.log(e),
 *   });
 */

/** 改动提示词或规则时 +1，缓存键会跟着变，避免沿用旧规则的译文 */
export const PROMPT_VERSION = 'v1';

/** 术语表：写进 system prompt，保证同一概念全站译名一致 */
export const GLOSSARY = [
  'module=模块', 'provider=提供者', 'controller=控制器', 'middleware=中间件',
  'guard=守卫', 'interceptor=拦截器', 'pipe=管道', 'decorator=装饰器',
  'exception filter=异常过滤器', 'dependency injection=依赖注入', 'inject=注入',
  'singleton=单例', 'request scope=请求作用域', 'lifecycle hook=生命周期钩子',
  'gateway=网关', 'resolver=解析器', 'mutation=变更', 'subscription=订阅',
  'transport=传输层', 'payload=负载', 'strategy=策略', 'serialization=序列化',
  'validation=校验', 'DTO=数据传输对象', 'metadata=元数据', 'bootstrap=启动',
  'adapter=适配器', 'resolver=解析器', 'microservice=微服务', 'monorepo=单体仓库',
].join('，');

export const SYSTEM_PROMPT = [
  '你是 NestJS 官方文档的资深中文技术译者。你只输出 JSON，不输出任何解释。',
  '翻译规则：',
  '1. 译成简体中文，面向中国大陆开发者，使用简洁、准确的技术书面语，不要口语化，不要扩写。',
  '2. 以下内容保持原样，绝不翻译：代码、API/类/方法/装饰器名、标识符、命令行、文件路径、URL、版本号。',
  '3. 原文里的 [[0]]、[[1]] 这类占位符代表行内代码或链接，必须原样保留：数量、编号都不能增删或改写。',
  '4. 逐条翻译，条目数量与输入完全一致，不得合并、拆分或遗漏；id 原样带回。',
  '5. 专有名词按术语表统一：' + GLOSSARY,
  '输出格式：{"translations":[{"id":"原样","zh":"译文"}]}',
].join('\n');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ------------------------------ 工具 ------------------------------ */

/** 64 位 FNV-1a，做缓存键；浏览器里不用 crypto.subtle（异步且需 https） */
export function hashText(s) {
  let h = 0xcbf29ce484222325n;
  const p = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;
  for (let i = 0; i < s.length; i++) {
    h ^= BigInt(s.charCodeAt(i));
    h = (h * p) & mask;
  }
  return h.toString(16).padStart(16, '0');
}

export function cacheKey(text, model = '') {
  return hashText(PROMPT_VERSION + '\u0000' + model + '\u0000' + text);
}

/** 校验 [[n]] 占位符：数量与编号集合都必须一致 */
export function placeholdersMatch(src, out) {
  const pick = (s) => (s.match(/\[\[\d+\]\]/g) || []).sort().join('');
  return pick(src) === pick(out);
}

const hasCJK = (s) => /[\u4e00-\u9fff]/.test(s);
const latinWords = (s) => (s.match(/[A-Za-z][A-Za-z'-]{2,}/g) || []).length;

/** 明显没翻 / 翻车：返回原因字符串，否则 null */
export function suspect(src, out) {
  if (!out || !out.trim()) return 'empty';
  if (!placeholdersMatch(src, out)) return 'placeholder';
  if (out.trim() === src.trim() && latinWords(src) > 2) return 'untranslated';
  if (!hasCJK(out) && latinWords(src) > 6 && out.length > 24) return 'no-chinese';
  return null;
}

/** 按字数/条数切批，控制单次输出长度，失败影响面小 */
export function splitBatches(units, { maxChars = 6000, maxBlocks = 24 } = {}) {
  const out = [];
  let cur = [];
  let chars = 0;
  for (const u of units) {
    const len = u.text.length;
    if (cur.length && (chars + len > maxChars || cur.length >= maxBlocks)) {
      out.push(cur);
      cur = [];
      chars = 0;
    }
    cur.push(u);
    chars += len;
  }
  if (cur.length) out.push(cur);
  return out;
}

/* ------------------------------ Prompt ------------------------------ */

export function buildUserPrompt(units) {
  return [
    `把下面 ${units.length} 条 text 翻译成简体中文，保持条目一一对应。`,
    '只返回 JSON：{"translations":[{"id":"...","zh":"..."}]}',
    JSON.stringify(units.map((u) => ({ id: u.id, text: u.text }))),
  ].join('\n');
}

export function parseReply(raw) {
  if (!raw || typeof raw !== 'string') return null;
  let s = raw.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const start = s.indexOf('{');
  const startArr = s.indexOf('[');
  if (startArr >= 0 && (start < 0 || startArr < start)) {
    const endArr = s.lastIndexOf(']');
    if (endArr > startArr) s = s.slice(startArr, endArr + 1);
  } else if (start >= 0) {
    const end = s.lastIndexOf('}');
    if (end > start) s = s.slice(start, end + 1);
  }
  let data;
  try { data = JSON.parse(s); } catch (e) { return null; }

  const map = new Map();
  const push = (id, zh) => { if (id != null && typeof zh === 'string') map.set(String(id), zh); };
  if (Array.isArray(data)) {
    for (const it of data) push(it && (it.id ?? it.key), it && (it.zh ?? it.text ?? it.translation));
  } else if (data && Array.isArray(data.translations)) {
    for (const it of data.translations) push(it && it.id, it && (it.zh ?? it.text));
  } else if (data && typeof data === 'object') {
    for (const [k, v] of Object.entries(data)) {
      if (typeof v === 'string') push(k, v);
      else if (v && typeof v === 'object') push(v.id ?? k, v.zh ?? v.text);
    }
  }
  return map.size ? map : null;
}

/* ------------------------------ Provider ------------------------------ */

class ProviderError extends Error {
  constructor(message, retryable = true) {
    super(message);
    this.retryable = retryable;
  }
}

async function readJson(res) {
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch (e) { /* 非 JSON 响应 */ }
  return { text, data };
}

async function callDeepSeek({ apiKey, model, system, user, signal }) {
  const res = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  });
  const { text, data } = await readJson(res);
  if (!res.ok) {
    const msg = data?.error?.message || text.slice(0, 200);
    throw new ProviderError(`deepseek ${res.status}: ${msg}`, res.status === 429 || res.status >= 500);
  }
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new ProviderError('deepseek: 响应里没有 content');
  return content;
}

async function callGemini({ apiKey, model, system, user, signal }) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const res = await fetch(url, {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: user }] }],
      generationConfig: { temperature: 0.2, responseMimeType: 'application/json' },
    }),
  });
  const { text, data } = await readJson(res);
  if (!res.ok) {
    const msg = data?.error?.message || text.slice(0, 200);
    throw new ProviderError(`gemini ${res.status}: ${msg}`, res.status === 429 || res.status >= 500);
  }
  const parts = data?.candidates?.[0]?.content?.parts || [];
  const content = parts.map((p) => p.text || '').join('');
  if (!content) throw new ProviderError('gemini: 响应里没有文本（可能被安全策略拦截）');
  return content;
}

/** 离线演练：不花额度，验证批处理/占位符/缓存整条链路 */
async function callMock({ user }) {
  await sleep(15);
  // 真正的输入是 prompt 最后一行那个 JSON 数组
  const body = user.split('\n').pop();
  let items = [];
  try { items = JSON.parse(body); } catch (e) { /* ignore */ }
  return JSON.stringify({
    translations: items.map((it) => ({ id: it.id, zh: '【译】' + String(it.text) })),
  });
}

const PROVIDERS = { deepseek: callDeepSeek, gemini: callGemini, mock: callMock };

export async function callProvider(opts) {
  const fn = PROVIDERS[opts.provider];
  if (!fn) throw new Error(`未知 provider: ${opts.provider}（可选 deepseek / gemini / mock）`);
  if (opts.provider !== 'mock' && !opts.apiKey) throw new Error('缺少 apiKey');
  return fn(opts);
}

/* ------------------------------ 主流程 ------------------------------ */

async function callWithRetry(opts, { retries = 4, signal } = {}) {
  let attempt = 0;
  for (;;) {
    try {
      return await callProvider({ ...opts, signal });
    } catch (e) {
      const retryable = e.retryable !== false;
      if (!retryable || attempt >= retries || (signal && signal.aborted)) throw e;
      const wait = Math.min(15000, 700 * 2 ** attempt) + Math.random() * 250;
      await sleep(wait);
      attempt += 1;
    }
  }
}

/**
 * 翻译一批 unit，命中缓存的直接跳过。
 * @param {Array<{id:string,text:string}>} units
 * @param {object} opts { provider, model, apiKey, cache, concurrency, maxChars, maxBlocks, onEvent, signal }
 * @returns {Promise<{results: Map<string,{zh:string,cached:boolean,fallback?:boolean}> , stats: object}>}
 */
export async function translateUnits(units, opts = {}) {
  const {
    provider = 'deepseek', model = 'deepseek-chat', apiKey,
    cache, concurrency = 3, maxChars = 6000, maxBlocks = 24,
    cacheScope, onEvent = () => {}, signal,
  } = opts;
  // 缓存作用域把 provider 也算进去，避免 mock 演练的译文被真跑复用
  const scope = cacheScope || model;

  const results = new Map();
  const stats = { total: units.length, cached: 0, translated: 0, fallback: 0, calls: 0, rejected: 0 };

  // 1) 缓存命中
  const todo = [];
  for (const u of units) {
    const key = cacheKey(u.text, scope);
    const hit = cache ? await cache.get(key) : undefined;
    if (typeof hit === 'string' && hit.trim()) {
      results.set(u.id, { zh: hit, cached: true });
      stats.cached += 1;
    } else {
      todo.push({ ...u, __key: key });
    }
  }
  onEvent({ type: 'cache', hit: stats.cached, todo: todo.length, total: units.length });

  // 2) 分批并发
  const batches = splitBatches(todo, { maxChars, maxBlocks });
  let cursor = 0;
  const accept = async (unit, zh, { fallback = false } = {}) => {
    results.set(unit.id, { zh, cached: false, fallback });
    if (fallback) stats.fallback += 1; else stats.translated += 1;
    if (cache && !fallback) await cache.set(unit.__key, zh);
  };

  const runBatch = async (batch) => {
    const user = buildUserPrompt(batch.map((u) => ({ id: u.id, text: u.text })));
    let map = null;
    try {
      const raw = await callWithRetry({ provider, model, apiKey, system: SYSTEM_PROMPT, user }, { signal });
      stats.calls += 1;
      map = parseReply(raw);
    } catch (e) {
      onEvent({ type: 'error', message: e.message });
    }
    if (!map) {
      // 整批不可用时降级成单条，避免一颗老鼠屎坏一锅
      for (const u of batch) await translateSingle(u);
      return;
    }

    const missing = [];
    for (const u of batch) {
      const zh = map.get(u.id);
      if (!zh) { missing.push(u); continue; }
      const why = suspect(u.text, zh);
      if (why) { missing.push(u); stats.rejected += 1; onEvent({ type: 'reject', id: u.id, why }); continue; }
      await accept(u, zh.trim());
    }
    for (const u of missing) await translateSingle(u);
  };

  const translateSingle = async (unit) => {
    try {
      const user = buildUserPrompt([{ id: unit.id, text: unit.text }]);
      const raw = await callWithRetry({ provider, model, apiKey, system: SYSTEM_PROMPT, user }, { signal, retries: 2 });
      stats.calls += 1;
      const zh = parseReply(raw)?.get(unit.id);
      if (zh && !suspect(unit.text, zh)) {
        await accept(unit, zh.trim());
        return;
      }
      onEvent({ type: 'fallback', id: unit.id, reason: zh ? suspect(unit.text, zh) : 'no-result' });
    } catch (e) {
      onEvent({ type: 'error', message: `${unit.id}: ${e.message}` });
    }
    // 兜底：保留英文，交给人工或下次重试，绝不写入坏译文
    results.set(unit.id, { zh: '', cached: false, fallback: true });
    stats.fallback += 1;
  };

  await Promise.all(Array.from({ length: Math.min(concurrency, batches.length) }, async () => {
    for (;;) {
      if (signal && signal.aborted) return;
      const idx = cursor++;
      if (idx >= batches.length) return;
      await runBatch(batches[idx]);
      onEvent({
        type: 'progress',
        done: results.size,
        total: units.length,
        batch: idx + 1,
        batches: batches.length,
      });
    }
  }));

  onEvent({ type: 'done', stats });
  return { results, stats };
}

/* ------------------------------ 浏览器缓存 ------------------------------ */

/**
 * IndexedDB 键值缓存：一次翻译，永久复用（同一浏览器）。
 * 想跨设备复用，就把内容随数据一起导出成 zh.json 提交进仓库（见 translate-docs.mjs）。
 */
export function createIdbCache(dbName = 'nest-docs-i18n', storeName = 'translations') {
  let dbp = null;
  const open = () => {
    if (!dbp) {
      dbp = new Promise((resolve, reject) => {
        const req = indexedDB.open(dbName, 1);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(storeName)) db.createObjectStore(storeName);
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    }
    return dbp;
  };
  const asPromise = (request) => new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return {
    async get(key) {
      try {
        const db = await open();
        return await asPromise(db.transaction(storeName, 'readonly').objectStore(storeName).get(key));
      } catch (e) { return undefined; }
    },
    async set(key, value) {
      try {
        const db = await open();
        const tx = db.transaction(storeName, 'readwrite');
        tx.objectStore(storeName).put(value, key);
        await new Promise((resolve, reject) => {
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        });
      } catch (e) { /* 配额满 / 隐私模式，忽略 */ }
    },
    async size() {
      try {
        const db = await open();
        return await asPromise(db.transaction(storeName, 'readonly').objectStore(storeName).count());
      } catch (e) { return 0; }
    },
  };
}
