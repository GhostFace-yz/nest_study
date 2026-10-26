export interface ReadingProgress {
  /** 锚点块 id，比纯 px 更能抵抗布局变化 */
  bid: string;
  /** 保存时该块顶部到视口顶部的偏移 */
  delta: number;
  /** 兜底比例 0–1 */
  ratio: number;
  at: number;
}

export type ProgressMap = Record<string, ReadingProgress>;

const KEY = 'nest-docs-progress';

export function loadProgress(): ProgressMap {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as ProgressMap;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function persistProgress(map: ProgressMap) {
  try {
    localStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

export function lastRead(map: ProgressMap): { slug: string; p: ReadingProgress } | null {
  let best: { slug: string; p: ReadingProgress } | null = null;
  for (const [slug, p] of Object.entries(map)) {
    if (!p?.at) continue;
    if (!best || p.at > best.p.at) best = { slug, p };
  }
  return best;
}
