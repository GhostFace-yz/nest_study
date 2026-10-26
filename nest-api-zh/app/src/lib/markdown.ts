import MarkdownIt from 'markdown-it';
import hljs from 'highlight.js/lib/common';
import graphql from 'highlight.js/lib/languages/graphql';

hljs.registerLanguage('graphql', graphql);

const md = new MarkdownIt({
  html: true,
  linkify: true,
  breaks: false,
});

/** 站内链接改成 hash 路由；外链新窗口打开 */
md.renderer.rules.link_open = (tokens, idx, options, _env, self) => {
  const token = tokens[idx];
  const raw = token.attrGet('href');
  const href = raw == null ? '' : String(raw);
  if (href) {
    if (href.startsWith('/') && !href.startsWith('//')) {
      token.attrSet('href', `#${href}`);
    } else if (/^https?:/i.test(href)) {
      token.attrSet('target', '_blank');
      token.attrSet('rel', 'noopener noreferrer');
    }
  }
  return self.renderToken(tokens, idx, options);
};

/** 表格外面套一层，窄屏可横向滚动 */
md.renderer.rules.table_open = () => '<div class="md-table"><table>';
md.renderer.rules.table_close = () => '</table></div>';

export function renderMarkdown(source?: string): string {
  return md.render(source ?? '');
}

/** 行内渲染（标题里可能含 `code`、[链接]） */
export function renderInline(source?: string): string {
  return md.renderInline(source ?? '');
}

export function normalizeLang(lang?: string): string {
  const l = (lang || '').toLowerCase();
  const map: Record<string, string> = {
    typescript: 'typescript',
    ts: 'typescript',
    javascript: 'javascript',
    js: 'javascript',
    bash: 'bash',
    shell: 'bash',
    sh: 'bash',
    json: 'json',
    yaml: 'yaml',
    yml: 'yaml',
    graphql: 'graphql',
    sql: 'sql',
    html: 'xml',
    xml: 'xml',
    css: 'css',
    text: 'plaintext',
    plaintext: 'plaintext',
    http: 'http',
    dockerfile: 'dockerfile',
    ini: 'ini',
    groovy: 'groovy',
  };
  const key = map[l] || l;
  return hljs.getLanguage(key) ? key : 'plaintext';
}

export function highlightCode(code: string, lang?: string): { html: string; lang: string } {
  const language = normalizeLang(lang);
  try {
    return {
      html: hljs.highlight(code ?? '', { language, ignoreIllegals: true }).value,
      lang: language,
    };
  } catch {
    return { html: hljs.highlight(code ?? '', { language: 'plaintext' }).value, lang: 'plaintext' };
  }
}

/** 代码块 HTML（交给 .md 的样式渲染） */
export function renderCodeBlock(code: string, lang?: string): string {
  const { html, lang: language } = highlightCode(code, lang);
  const label = lang && lang !== 'plaintext' ? escapeHtml(lang) : '';
  return `<div class="code-block">${label ? `<span class="code-lang">${label}</span>` : ''}<pre><code class="hljs language-${language}">${html}</code></pre></div>`;
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
