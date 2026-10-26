import type { Chapter, Dataset, FlatChapter } from './types';

let pending: Promise<Dataset> | null = null;

export function loadDataset(): Promise<Dataset> {
  if (pending) return pending;
  const url = `${import.meta.env.BASE_URL}data/nestjs-docs.json`;
  pending = fetch(url)
    .then((res) => {
      if (!res.ok) throw new Error(`加载文档失败：HTTP ${res.status}`);
      return res.json() as Promise<Dataset>;
    })
    .catch((err) => {
      pending = null;
      throw err;
    });
  return pending;
}

export function flattenChapters(dataset: Dataset): FlatChapter[] {
  const out: FlatChapter[] = [];
  for (const section of dataset.sections) {
    for (const chapter of section.chapters) {
      out.push({ ...chapter, section: section.title, flatIndex: out.length });
    }
  }
  return out;
}

export function findChapter(flat: FlatChapter[], slug: string): FlatChapter | undefined {
  return flat.find((c) => c.slug === slug);
}

/**
 * 兼容三种写法：
 *   /cli/overview   ← 文档内部链接的原始路径
 *   cli-overview    ← 我们的 slug
 *   /cli-overview
 */
export function resolveChapter(flat: FlatChapter[], key: string): FlatChapter | undefined {
  if (!key) return undefined;
  const clean = key.replace(/^\/+|\/+$/g, '');
  const direct = flat.find((c) => c.slug === clean);
  if (direct) return direct;
  const asPath = '/' + clean;
  return flat.find((c) => c.path === asPath || c.path === asPath + '/');
}

export function parseHash(hash: string): { slug: string; anchor: string } {
  const raw = hash.replace(/^#/, '');
  const [pathPart, anchor = ''] = raw.split('#');
  const slug = decodeURIComponent(pathPart.replace(/^\//, '').replace(/\/$/, ''));
  return { slug, anchor };
}

export function chapterHash(chapter: Chapter, anchor?: string): string {
  return `#/${chapter.slug}${anchor ? `#${anchor}` : ''}`;
}

/** 章节里的标题块，用作目录 */
export function chapterHeadings(chapter: Chapter) {
  return chapter.blocks
    .filter((b) => b.type === 'heading' && (b.level ?? 2) <= 4)
    .map((b) => ({
      id: b.id,
      level: b.level ?? 2,
      text: plainHeading(b.zh) || plainHeading(b.md) || '',
    }))
    .filter((h) => h.text);
}

function plainHeading(md?: string) {
  return (md || '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[`*_]/g, '')
    .trim();
}

/* ---------------- 搜索 ---------------- */

export interface SearchHit {
  chapter: FlatChapter;
  kind: 'chapter' | 'content';
  snippet: string;
}

interface IndexEntry {
  chapter: FlatChapter;
  haystack: string;
}

let index: IndexEntry[] | null = null;

export function buildSearchIndex(flat: FlatChapter[]): IndexEntry[] {
  if (index) return index;
  index = flat.map((chapter) => {
    const parts = [chapter.title, chapter.summary, chapter.section];
    for (const b of chapter.blocks) {
      if (b.text) parts.push(b.text);
      if (b.zh) parts.push(b.zh);
    }
    return { chapter, haystack: parts.join('\n').toLowerCase() };
  });
  return index;
}

export function search(flat: FlatChapter[], query: string, limit = 24): SearchHit[] {
  const q = query.trim().toLowerCase();
  if (q.length < 1) return [];
  const hits: SearchHit[] = [];
  const entries = buildSearchIndex(flat);

  for (const { chapter, haystack } of entries) {
    if (hits.length >= limit) break;
    if (chapter.title.toLowerCase().includes(q) || chapter.summary.toLowerCase().includes(q)) {
      hits.push({ chapter, kind: 'chapter', snippet: chapter.summary || chapter.title });
      continue;
    }
    const at = haystack.indexOf(q);
    if (at >= 0) {
      const source =
        chapter.blocks.find((b) => (b.text || '').toLowerCase().includes(q)) ??
        chapter.blocks.find((b) => (b.zh || '').toLowerCase().includes(q));
      // 命中的是英文就给英文片段，避免"搜英文却展示中文"
      const rawSource =
        source && (source.text || '').toLowerCase().includes(q) ? source.text : source?.zh || source?.text || '';
      const text = String(rawSource).replace(/\s+/g, ' ');
      const pos = Math.max(0, text.toLowerCase().indexOf(q) - 30);
      hits.push({
        chapter,
        kind: 'content',
        snippet: (pos > 0 ? '…' : '') + text.slice(pos, pos + 110) + (text.length > pos + 110 ? '…' : ''),
      });
    }
  }
  return hits;
}
