/** 切句 + 句子对齐（与 Web 版同一套算法，去掉 DOM 依赖） */

export interface Span {
  start: number;
  end: number;
}

export type Pair = [enStart: number, enEnd: number, zhStart: number, zhEnd: number];

type Segmenter = {
  segment(input: string): Iterable<{ segment: string; index: number }>;
};
type SegmenterCtor = new (locale: string, options: { granularity: 'sentence' }) => Segmenter;

const SegmenterImpl = (Intl as unknown as { Segmenter?: SegmenterCtor }).Segmenter;

let enSeg: Segmenter | null | undefined;
let zhSeg: Segmenter | null | undefined;

function segmenter(lang: 'en' | 'zh'): Segmenter | null {
  const cached = lang === 'en' ? enSeg : zhSeg;
  if (cached !== undefined) return cached;
  let made: Segmenter | null = null;
  try {
    made = SegmenterImpl ? new SegmenterImpl(lang === 'zh' ? 'zh' : 'en', { granularity: 'sentence' }) : null;
  } catch {
    made = null;
  }
  if (lang === 'en') enSeg = made;
  else zhSeg = made;
  return made;
}

export function splitSentences(text: string, lang: 'en' | 'zh'): Span[] {
  const seg = segmenter(lang);
  if (seg) {
    const out: Span[] = [];
    for (const part of seg.segment(text)) {
      const raw = part.segment;
      const trimmed = raw.trim();
      if (!trimmed) continue;
      const lead = raw.length - raw.trimStart().length;
      out.push({ start: part.index + lead, end: part.index + lead + trimmed.length });
    }
    return out;
  }
  const out: Span[] = [];
  const re = /[^.!?。！？\n]+[.!?。！？]*/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const raw = m[0];
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const lead = raw.length - raw.trimStart().length;
    out.push({ start: m.index + lead, end: m.index + lead + trimmed.length });
  }
  return out;
}

export function alignSentences(en: Span[], zh: Span[]): Pair[] {
  const n = en.length;
  const m = zh.length;
  if (!n || !m || n * m > 900) return [];
  if (n === m) return Array.from({ length: n }, (_, i) => [i, i + 1, i, i + 1] as Pair);

  const enLen = (a: number, b: number) => en[b - 1].end - en[a].start;
  const zhLen = (a: number, b: number) => zh[b - 1].end - zh[a].start;
  const enTotal = en[n - 1].end - en[0].start;
  const zhTotal = zh[m - 1].end - zh[0].start;
  if (!enTotal || !zhTotal) return [];
  const ratio = zhTotal / enTotal;

  const cost = (ai: number, aj: number, bi: number, bj: number) => {
    const converted = enLen(ai, aj) * ratio;
    return Math.abs(converted - zhLen(bi, bj)) / Math.max(1, converted);
  };

  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(Infinity));
  const back: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  dp[0][0] = 0;
  for (let i = 0; i <= n; i++) {
    for (let j = 0; j <= m; j++) {
      const cur = dp[i][j];
      if (!Number.isFinite(cur)) continue;
      if (i < n && j < m) {
        const c = cur + cost(i, i + 1, j, j + 1);
        if (c < dp[i + 1][j + 1]) {
          dp[i + 1][j + 1] = c;
          back[i + 1][j + 1] = 1;
        }
      }
      if (i + 1 < n && j < m) {
        const c = cur + cost(i, i + 2, j, j + 1);
        if (c < dp[i + 2][j + 1]) {
          dp[i + 2][j + 1] = c;
          back[i + 2][j + 1] = 2;
        }
      }
      if (i < n && j + 1 < m) {
        const c = cur + cost(i, i + 1, j, j + 2);
        if (c < dp[i + 1][j + 2]) {
          dp[i + 1][j + 2] = c;
          back[i + 1][j + 2] = 3;
        }
      }
    }
  }
  if (!Number.isFinite(dp[n][m])) return [];

  const pairs: Pair[] = [];
  let i = n;
  let j = m;
  while (i > 0 && j > 0) {
    const step = back[i][j];
    if (step === 1) {
      pairs.push([i - 1, i, j - 1, j]);
      i -= 1;
      j -= 1;
    } else if (step === 2) {
      pairs.push([i - 2, i, j - 1, j]);
      i -= 2;
      j -= 1;
    } else if (step === 3) {
      pairs.push([i - 1, i, j - 2, j]);
      i -= 1;
      j -= 2;
    } else {
      return [];
    }
  }
  return pairs.reverse();
}

/** 英文第 index 句 → 对应的中文句子（可能由多句合并而来） */
export function matchZhSentence(enSentences: Span[], zhSentences: Span[], index: number): Span | null {
  const pairs = alignSentences(enSentences, zhSentences);
  if (!pairs.length) return null;
  const hit = pairs.filter(([a0, a1]) => a0 <= index && index < a1);
  if (!hit.length) return null;
  const first = hit[0];
  const last = hit[hit.length - 1];
  return { start: zhSentences[first[2]].start, end: zhSentences[last[3] - 1].end };
}
