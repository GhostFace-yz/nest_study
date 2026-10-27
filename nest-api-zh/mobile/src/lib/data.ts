import indexJson from '../../assets/data/index.json';
import { chapterLoaders } from '../../assets/data/chapters';
import type { Chapter, ChapterMeta, DatasetIndex } from './types';

export const dataset = indexJson as DatasetIndex;

export interface FlatChapter extends ChapterMeta {
  flatIndex: number;
}

export const allChapters: FlatChapter[] = dataset.sections.flatMap((s) =>
  s.chapters.map((c) => ({ ...c, section: s.title })),
).map((c, i) => ({ ...c, flatIndex: i }));

export function loadChapter(slug: string): Chapter | null {
  const loader = chapterLoaders[slug];
  if (!loader) return null;
  return loader() as Chapter;
}

export function neighbors(slug: string) {
  const i = allChapters.findIndex((c) => c.slug === slug);
  return {
    index: i,
    prev: i > 0 ? allChapters[i - 1] : undefined,
    next: i >= 0 && i < allChapters.length - 1 ? allChapters[i + 1] : undefined,
  };
}

export function searchChapters(query: string, limit = 40): FlatChapter[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return allChapters
    .filter(
      (c) => c.title.toLowerCase().includes(q) || c.summary.toLowerCase().includes(q) || c.section.toLowerCase().includes(q),
    )
    .slice(0, limit);
}
