/** 极简 markdown 行内解析：加粗、行内代码、链接、斜体 */

export interface Run {
  text: string;
  bold?: boolean;
  code?: boolean;
  href?: string;
}

const TOKEN = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\[[^\]]+\]\([^)\s]+\))|(\*[^*]+\*)/g;

export function parseInline(md: string): Run[] {
  const runs: Run[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  TOKEN.lastIndex = 0;
  while ((m = TOKEN.exec(md))) {
    if (m.index > last) runs.push({ text: md.slice(last, m.index) });
    const tok = m[0];
    if (tok.startsWith('`')) {
      runs.push({ text: tok.slice(1, -1), code: true });
    } else if (tok.startsWith('**')) {
      runs.push({ text: tok.slice(2, -2), bold: true });
    } else if (tok.startsWith('[')) {
      const link = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(tok);
      if (link) runs.push({ text: link[1], href: link[2] });
    } else if (tok.startsWith('*')) {
      runs.push({ text: tok.slice(1, -1), bold: true });
    }
    last = m.index + tok.length;
  }
  if (last < md.length) runs.push({ text: md.slice(last) });
  return runs.filter((r) => r.text.length > 0);
}

export function runsText(runs: Run[]): string {
  return runs.map((r) => r.text).join('');
}

export function stripInline(md = ''): string {
  return runsText(parseInline(md));
}

/** 把行内 run 按句子边界切开，保留加粗/代码/链接样式 */
export function groupRunsBySentence(
  runs: Run[],
  sentences: { start: number; end: number }[],
): Run[][] {
  const out: Run[][] = sentences.map(() => []);
  let pos = 0;
  for (const run of runs) {
    const start = pos;
    const end = pos + run.text.length;
    for (let i = 0; i < sentences.length; i++) {
      const s = sentences[i];
      const a = Math.max(start, s.start);
      const b = Math.min(end, s.end);
      if (b > a) out[i].push({ ...run, text: run.text.slice(a - start, b - start) });
    }
    pos = end;
  }
  return out;
}

export interface ListItem {
  marker: string;
  text: string;
}

export function parseList(md = ''): ListItem[] {
  const items: ListItem[] = [];
  for (const line of md.split('\n')) {
    const m = /^(\s*(?:[-*+]|\d+[.)])\s+)(.*)$/.exec(line);
    if (m && m[2].trim()) items.push({ marker: m[1].trim(), text: m[2] });
  }
  return items;
}

export function parseTable(md = ''): string[][] {
  const rows: string[][] = [];
  for (const line of md.split('\n')) {
    if (!line.trim().startsWith('|')) continue;
    if (/^\s*\|?[\s:|-]+\|?\s*$/.test(line)) continue;
    const cells = line
      .trim()
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split('|')
      .map((c) => c.trim());
    rows.push(cells);
  }
  return rows;
}

/** 官网 file-tree 这类原始 HTML，退化成缩进文本 */
export function htmlToText(html = ''): string {
  return html
    .replace(/<\/(div|p|li|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .split('\n')
    .map((l) => l.trimEnd())
    .filter((l) => l.trim())
    .join('\n');
}
