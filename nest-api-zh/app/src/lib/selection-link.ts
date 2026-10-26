/**
 * 划词联动：把一侧（英/中）的选区映射成另一侧对应的文本 Range。
 *
 * 粒度策略：
 *   列表 → 第 n 个 <li> 对第 n 个 <li>（翻译时就是按行逐条翻的，天然 1:1）
 *   表格 → 第 n 个单元格对第 n 个单元格（按单元格翻译，同样 1:1）
 *   段落/提示框/折叠块 → 句子级对齐（Intl.Segmenter 切句 + 长度比例 DP）
 *   代码/图片等 → 不映射
 */

export interface TextIndex {
  text: string;
  nodes: { node: Text; start: number }[];
}

export interface Span {
  start: number;
  end: number;
}

/** 收集元素内所有文本节点，拼成一条字符串并记录偏移 */
export function indexText(root: Element): TextIndex {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: { node: Text; start: number }[] = [];
  let text = '';
  let current = walker.nextNode() as Text | null;
  while (current) {
    nodes.push({ node: current, start: text.length });
    text += current.data;
    current = walker.nextNode() as Text | null;
  }
  return { text, nodes };
}

/** 把 DOM 里的 (node, offset) 换算成块内绝对字符偏移 */
export function absoluteOffset(idx: TextIndex, node: Node, offset: number): number | null {
  if (node.nodeType === Node.TEXT_NODE) {
    const hit = idx.nodes.find((n) => n.node === node);
    return hit ? hit.start + Math.min(offset, node.textContent?.length ?? 0) : null;
  }
  // 元素节点：取它前面所有文本的长度
  const el = node as Element;
  const first = el.firstChild;
  if (!first) return null;
  return absoluteOffset(idx, first, 0);
}

/** 由块内偏移生成 Range */
export function rangeFromOffsets(idx: TextIndex, start: number, end: number): Range | null {
  if (!idx.nodes.length) return null;
  const locate = (pos: number) => {
    const clamped = Math.max(0, Math.min(pos, idx.text.length));
    let lo = 0;
    let hi = idx.nodes.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (idx.nodes[mid].start <= clamped) lo = mid;
      else hi = mid - 1;
    }
    const entry = idx.nodes[lo];
    return { node: entry.node, offset: Math.min(clamped - entry.start, entry.node.data.length) };
  };
  const a = locate(Math.min(start, end));
  const b = locate(Math.max(start, end));
  const range = document.createRange();
  try {
    range.setStart(a.node, a.offset);
    range.setEnd(b.node, b.offset);
  } catch {
    return null;
  }
  return range;
}

/** 元素整体的 Range（列表项 / 表格单元格 / 兜底用） */
export function elementRange(el: Element): Range {
  const range = document.createRange();
  range.selectNodeContents(el);
  return range;
}

/* ---------------- 切句 ---------------- */

let enSegmenter: Intl.Segmenter | null | undefined;
let zhSegmenter: Intl.Segmenter | null | undefined;

function segmenter(lang: 'en' | 'zh'): Intl.Segmenter | null {
  const cached = lang === 'en' ? enSegmenter : zhSegmenter;
  if (cached !== undefined) return cached;
  let created: Intl.Segmenter | null = null;
  try {
    created = new Intl.Segmenter(lang === 'zh' ? 'zh' : 'en', { granularity: 'sentence' });
  } catch {
    created = null;
  }
  if (lang === 'en') enSegmenter = created;
  else zhSegmenter = created;
  return created;
}

export function splitSentences(text: string, lang: 'en' | 'zh'): Span[] {
  const seg = segmenter(lang);
  if (seg) {
    const out: Span[] = [];
    for (const part of seg.segment(text)) {
      const trimmed = part.segment.trim();
      if (!trimmed) continue;
      const lead = part.segment.length - part.segment.trimStart().length;
      out.push({ start: part.index + lead, end: part.index + lead + trimmed.length });
    }
    return out;
  }
  // 退化方案：按句末标点切
  const out: Span[] = [];
  const re = /[^.!?。！？\n]+[.!?。！？]*/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const raw = m[0];
    const lead = raw.length - raw.trimStart().length;
    const trimmed = raw.trim();
    if (trimmed) out.push({ start: m.index + lead, end: m.index + lead + trimmed.length });
  }
  return out;
}

/* ---------------- 句子对齐 ---------------- */

export type Pair = [enStart: number, enEnd: number, zhStart: number, zhEnd: number];

/**
 * 单调 DP：允许 1:1 / 2 英:1 中 / 1 英:2 中，
 * 代价 = 两侧长度占比之差（中文普遍比英文短，所以按全局比例换算）。
 */
export function alignSentences(en: Span[], zh: Span[]): Pair[] {
  const n = en.length;
  const m = zh.length;
  if (!n || !m) return [];
  if (n * m > 900) return []; // 太长就交给调用方按整块处理

  const enLen = (a: number, b: number) => en[b - 1].end - en[a].start;
  const zhLen = (a: number, b: number) => zh[b - 1].end - zh[a].start;
  const enTotal = en.length ? en[n - 1].end - en[0].start : 0;
  const zhTotal = zh.length ? zh[m - 1].end - zh[0].start : 0;
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

/* ---------------- 选区 → 目标 Range ---------------- */

export interface MapOptions {
  /** 选区所在的一侧 */
  side: 'en' | 'zh';
  blockType?: string;
  /** 列表/表格里一对一的子单元选择器 */
  childSelector?: string;
}

export function mapSelectionToOther(
  sourceBlock: HTMLElement,
  targetBlock: HTMLElement,
  selection: Range,
  options: MapOptions,
): Range[] | null {
  const { side, blockType, childSelector } = options;

  // 图片/分割线没有可对照的文本；代码两边完全一致，整块高亮即可
  if (blockType === 'image' || blockType === 'hr') return null;
  if (blockType === 'code') return [elementRange(targetBlock)];

  // 列表项 / 表格单元格：按序号一一对应
  if (childSelector) {
    const sourceUnits = Array.from(sourceBlock.querySelectorAll(childSelector));
    const hitIndex = sourceUnits.findIndex((el) => el.contains(selection.startContainer));
    if (hitIndex >= 0) {
      const targetUnits = Array.from(targetBlock.querySelectorAll(childSelector));
      const target = targetUnits[hitIndex];
      return target ? [elementRange(target)] : null;
    }
  }

  const enBlock = side === 'zh' ? targetBlock : sourceBlock;
  const zhBlock = side === 'zh' ? sourceBlock : targetBlock;
  const enIdx = indexText(enBlock);
  const zhIdx = indexText(zhBlock);
  const enSentences = splitSentences(enIdx.text, 'en');
  const zhSentences = splitSentences(zhIdx.text, 'zh');
  if (enSentences.length < 2 && zhSentences.length < 2) {
    return [elementRange(targetBlock)];
  }

  const pairs = alignSentences(enSentences, zhSentences);
  if (!pairs.length) return [elementRange(targetBlock)];

  // 选区落在源块的哪几句
  const sourceIdx = side === 'zh' ? zhIdx : enIdx;
  const sourceSentences = side === 'zh' ? zhSentences : enSentences;
  const startAbs = absoluteOffset(sourceIdx, selection.startContainer, selection.startOffset);
  const endAbs = absoluteOffset(sourceIdx, selection.endContainer, selection.endOffset);
  if (startAbs == null || endAbs == null) return [elementRange(targetBlock)];

  const hit = sourceSentences
    .map((s, i) => ({ i, ...s }))
    .filter((s) => s.end > Math.min(startAbs, endAbs) && s.start < Math.max(startAbs, endAbs));
  if (!hit.length) return [elementRange(targetBlock)];

  const firstIdx = hit[0].i;
  const lastIdx = hit[hit.length - 1].i;

  const covered = pairs.filter(([a0, a1]) => a1 > firstIdx && a0 <= lastIdx);
  if (!covered.length) return [elementRange(targetBlock)];

  const zhStart = zhSentences[covered[0][2]].start;
  const zhEnd = zhSentences[covered[covered.length - 1][3] - 1].end;
  const range = rangeFromOffsets(zhIdx, zhStart, zhEnd);
  return range ? [range] : [elementRange(targetBlock)];
}
