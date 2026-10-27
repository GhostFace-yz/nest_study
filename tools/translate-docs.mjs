#!/usr/bin/env node
/**
 * 一次性批量翻译 CLI（把英文数据集翻成 zh 字段）
 * ------------------------------------------------------------------
 *   # 1. 先看规模、估算 token，不发请求
 *   node tools/translate-docs.mjs --in nestjs-docs.json --dry-run
 *
 *   # 2. 正式翻译（key 从环境变量读，别写进命令行历史）
 *   DEEPSEEK_API_KEY=sk-xxx node tools/translate-docs.mjs --in nestjs-docs.json
 *
 *   # 3. 再跑一次：全部命中缓存，0 次 API 调用（这就是「第二次不用翻译」）
 *   DEEPSEEK_API_KEY=sk-xxx node tools/translate-docs.mjs --in nestjs-docs.json
 *
 *   # 4. 不花额度先验证整条链路
 *   node tools/translate-docs.mjs --in nestjs-docs.json --provider mock --limit 60
 *
 * 产物：<in>.zh.json —— 原结构 + 每个 block 多一个 zh 字段；断点续翻靠 --cache。
 */

import fs from 'node:fs';
import path from 'node:path';
import { translateUnits, PROMPT_VERSION } from './translate-core.mjs';

const TRANSLATABLE = new Set(['heading', 'paragraph', 'list', 'callout', 'details']);

/* ------------------------------ 参数 ------------------------------ */

function parseArgs(argv) {
  const args = {
    provider: 'deepseek',
    model: '',
    concurrency: 3,
    maxChars: 6000,
    maxBlocks: 24,
    cache: '',
    out: '',
    limit: 0,
    only: '',
    dryRun: false,
    force: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    switch (a) {
      case '--in': args.in = next(); break;
      case '--out': args.out = next(); break;
      case '--provider': args.provider = next(); break;
      case '--model': args.model = next(); break;
      case '--api-key': args.apiKey = next(); break;
      case '--cache': args.cache = next(); break;
      case '--concurrency': args.concurrency = Number(next()); break;
      case '--max-chars': args.maxChars = Number(next()); break;
      case '--max-blocks': args.maxBlocks = Number(next()); break;
      case '--limit': args.limit = Number(next()); break;
      case '--only': args.only = next(); break;
      case '--dry-run': args.dryRun = true; break;
      case '--force': args.force = true; break;
      case '-h':
      case '--help': args.help = true; break;
      default:
        if (a.startsWith('--')) { console.error(`未知参数: ${a}`); process.exit(2); }
    }
  }
  args.model = args.model || (args.provider === 'gemini' ? 'gemini-2.5-flash' : 'deepseek-chat');
  args.apiKey = args.apiKey
    || (args.provider === 'gemini' ? process.env.GEMINI_API_KEY : process.env.DEEPSEEK_API_KEY)
    || '';
  return args;
}

const args = parseArgs(process.argv.slice(2));
if (args.help || !args.in) {
  console.log(`用法：node tools/translate-docs.mjs --in <dataset.json> [选项]

  --provider deepseek|gemini|mock   默认 deepseek
  --model <name>                    默认 deepseek-chat / gemini-2.5-flash
  --api-key <key>                   建议改用环境变量 DEEPSEEK_API_KEY / GEMINI_API_KEY
  --out <file>                      默认 <in>.zh.json
  --cache <file>                    默认 tools/.cache/translate-cache.json
  --concurrency 3                   并发批次数
  --max-chars 6000                  单批字符上限
  --max-blocks 24                   单批条数上限
  --only <slug>                     只翻某一章
  --limit <n>                       只翻前 n 块（试跑用）
  --force                           忽略已存在的 zh 字段
  --dry-run                         只统计与估算，不发请求`);
  process.exit(args.help ? 0 : 2);
}

/* ------------------------------ 缓存 ------------------------------ */

const cachePath = path.resolve(args.cache || 'tools/.cache/translate-cache.json');
let cacheData = {};
if (fs.existsSync(cachePath)) {
  try { cacheData = JSON.parse(fs.readFileSync(cachePath, 'utf8')); } catch (e) { cacheData = {}; }
}
let dirty = false;
const cache = {
  async get(key) {
    const hit = cacheData[key];
    return hit && typeof hit.zh === 'string' ? hit.zh : undefined;
  },
  async set(key, zh) {
    cacheData[key] = { zh, at: new Date().toISOString() };
    dirty = true;
    if (Object.keys(cacheData).length % 25 === 0) flushCache();
  },
};
function flushCache() {
  if (!dirty) return;
  fs.mkdirSync(path.dirname(cachePath), { recursive: true });
  const tmp = cachePath + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(cacheData));
  fs.renameSync(tmp, cachePath);
  dirty = false;
}

/* ------------------------------ 读数据 ------------------------------ */

const inPath = path.resolve(args.in);
const dataset = JSON.parse(fs.readFileSync(inPath, 'utf8'));
if (!Array.isArray(dataset.sections)) {
  console.error('不认识的数据格式：顶层需要 sections[]（nestjs-docs-*.json）');
  process.exit(1);
}

const units = [];
const byUnit = new Map();
for (const section of dataset.sections) {
  for (const chapter of section.chapters || []) {
    if (args.only && chapter.slug !== args.only) continue;
    for (const block of chapter.blocks || []) {
      if (!TRANSLATABLE.has(block.type)) continue;
      const text = (block.text || '').trim();
      if (!text) continue;
      if (block.zh && !args.force) continue;   // 已有译文（人工改过的）不覆盖
      const id = `${chapter.slug}#${block.id}`;
      const unit = { id, text };
      units.push(unit);
      byUnit.set(id, block);
    }
  }
}

const chars = units.reduce((n, u) => n + u.text.length, 0);
const estBatches = Math.max(1, Math.ceil(chars / args.maxChars));
const estIn = Math.round(chars / 4 + estBatches * 320);
const estOut = Math.round((chars * 0.55) / 1.5);

console.log(`文件     ${path.basename(inPath)}`);
console.log(`待翻块   ${units.length} 块 / ${chars.toLocaleString()} 字符`);
console.log(`模型     ${args.provider} · ${args.model} · prompt ${PROMPT_VERSION}`);
console.log(`预计     ≈${estBatches} 批，输入 ≈${estIn.toLocaleString()} tokens，输出 ≈${estOut.toLocaleString()} tokens`);

if (args.dryRun) {
  console.log('\n[dry-run] 未发送任何请求。按官网现价乘以上面两个数，就是你这次全量翻译的成本。');
  process.exit(0);
}
if (!units.length) {
  console.log('\n没有需要翻译的块（都已翻过，或用 --force 强制重翻）。');
  process.exit(0);
}
if (args.limit > 0) {
  units.splice(args.limit);
  console.log(`\n[试跑] 只翻前 ${units.length} 块`);
}

/* ------------------------------ 执行 ------------------------------ */

const controller = new AbortController();
let stopped = false;
process.on('SIGINT', () => {
  if (stopped) process.exit(130);
  stopped = true;
  controller.abort();
  flushCache();
  console.log('\n已中断：进度已写入缓存，重跑同一条命令会接着翻。');
});

const t0 = Date.now();
const { results, stats } = await translateUnits(units, {
  provider: args.provider,
  model: args.model,
  apiKey: args.apiKey,
  cache,
  cacheScope: `${args.provider}:${args.model}`,
  concurrency: args.concurrency,
  maxChars: args.maxChars,
  maxBlocks: args.maxBlocks,
  signal: controller.signal,
  onEvent: (e) => {
    if (e.type === 'cache') {
      console.log(`缓存命中 ${e.hit}/${e.total}，本次需翻 ${e.todo} 块`);
    } else if (e.type === 'progress') {
      const pct = Math.round((e.done / e.total) * 100);
      process.stdout.write(`\r进度 ${pct}% (${e.done}/${e.total}) · 批次 ${e.batch}/${e.batches}   `);
    } else if (e.type === 'reject') {
      process.stdout.write(`\n  ! ${e.id} 被拒(${e.why})，单条重试\n`);
    } else if (e.type === 'fallback') {
      process.stdout.write(`\n  ! ${e.id} 兜底保留英文(${e.reason})\n`);
    } else if (e.type === 'error') {
      process.stdout.write(`\n  x ${e.message}\n`);
    }
  },
});
process.stdout.write('\n');

/* ------------------------------ 合并输出 ------------------------------ */

let filled = 0;
for (const [id, res] of results) {
  const block = byUnit.get(id);
  if (!block || !res.zh) continue;
  block.zh = res.zh;
  filled += 1;
}

const outPath = path.resolve(args.out || inPath.replace(/\.json$/i, '') + '.zh.json');
dataset.meta = dataset.meta || {};
dataset.meta.translation = {
  provider: args.provider,
  model: args.model,
  promptVersion: PROMPT_VERSION,
  translatedAt: new Date().toISOString(),
  blocksTranslated: filled,
  apiCalls: stats.calls,
  cacheHits: stats.cached,
  fallbacks: stats.fallback,
};
fs.writeFileSync(outPath, JSON.stringify(dataset, null, 2));
flushCache();

const secs = ((Date.now() - t0) / 1000).toFixed(1);
console.log(`写入 ${outPath}  (${(fs.statSync(outPath).size / 1048576).toFixed(2)} MB)`);
console.log(`本次：翻译 ${stats.translated} 块，缓存命中 ${stats.cached} 块，兜底 ${stats.fallback} 块，API 调用 ${stats.calls} 次，用时 ${secs}s`);
console.log(`累计缓存 ${Object.keys(cacheData).length.toLocaleString()} 条 → ${cachePath}`);
if (stats.fallback) {
  console.log(`\n有 ${stats.fallback} 块没翻成功（已保留英文空白 zh）。重跑一次只会补这些块，不重复花钱。`);
}
