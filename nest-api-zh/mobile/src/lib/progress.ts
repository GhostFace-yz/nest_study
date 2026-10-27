import AsyncStorage from '@react-native-async-storage/async-storage';

export interface ReadingProgress {
  /** 上次滚动到的位置（px） */
  y: number;
  /** 阅读进度 0–1，换设备/换字号时比 px 更可靠 */
  ratio: number;
  /** 最后一次阅读时间戳 */
  at: number;
}

export type ProgressMap = Record<string, ReadingProgress>;

const KEY = 'nest-mobile-progress';

export async function loadProgress(): Promise<ProgressMap> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as ProgressMap;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export async function saveProgress(map: ProgressMap): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    /* 存储不可用时静默失败，不影响阅读 */
  }
}

/** 最近一次阅读的章节 */
export function lastRead(map: ProgressMap): { slug: string; p: ReadingProgress } | null {
  let best: { slug: string; p: ReadingProgress } | null = null;
  for (const [slug, p] of Object.entries(map)) {
    if (!p?.at) continue;
    if (!best || p.at > best.p.at) best = { slug, p };
  }
  return best;
}
