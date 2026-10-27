# NestJS 文档抓取器（配合「左英右中」对照阅读 app）

`nest-docs-scraper.user.js` 是一个 Tampermonkey 用户脚本，用来把
[docs.nestjs.com](https://docs.nestjs.com) 的全部章节抓成本地结构化数据。

## 为什么不是爬 DOM

docs.nestjs.com 是 Angular 单页应用，HTML 里只有空的 `<app-root>`，直接抓网页拿不到内容。
但官方给每章都发布了纯 Markdown，而且还有一个机器可读的目录树：

| 用途 | 地址 |
| --- | --- |
| 目录树（22 个分区 / 148 章） | `https://docs.nestjs.com/llms.txt` |
| 单章原文 | `https://docs.nestjs.com/controllers.md` |

脚本抓的就是站点渲染所用的同一份原文：代码块带语言标记、表格、`> info **Hint**` 提示框、
`<figure>` 插图都原样保留，不会像 DOM 抓取那样混进侧边栏、样式和“上一页/下一页”。

## 安装

1. 打开 Tampermonkey → 添加新脚本 → 全选删除默认内容。
2. 把 `nest-docs-scraper.user.js` 全文粘进去，`Ctrl/Cmd + S` 保存。
3. 打开 https://docs.nestjs.com/ 任意一页，右下角会出现面板。

## 用法

| 按钮 | 作用 |
| --- | --- |
| 抓取全部章节 | 抓 148 章原始 Markdown（约 2.6 MB），并发 4，带重试与本地缓存，可断点续抓 |
| 只抓当前页 | 只抓你正打开的那一章，写代码时快速补数据用 |
| 停止 | 停在当前进度，已抓到的仍可导出 |
| 下载 JSON | 双语对照 app 的数据源（约 5.2 MB） |
| 下载 Markdown | 按分区/章节排好序的 `.md` 压缩包 + `manifest.json` |
| 清空缓存 | 清掉已抓正文，重新抓最新版本 |

快捷键 `Alt + S` 开始抓取。面板可拖动、可折叠；面板状态和缓存都保存在油猴存储里。

## JSON 结构

```jsonc
{
  "meta": {
    "source": "https://docs.nestjs.com",
    "generatedAt": "2026-10-26T06:40:00.000Z",
    "sections": 22,
    "chapters": 148,
    "blocks": 9726
  },
  "sections": [
    {
      "id": "overview",          // 分区 id（英文小写短横线）
      "title": "Overview",
      "order": 2,                // 分区顺序
      "chapters": [
        {
          "slug": "controllers", // 唯一 id，可直接当路由
          "title": "Controllers",
          "path": "/controllers",
          "url": "https://docs.nestjs.com/controllers",
          "section": "Overview",
          "summary": "Controllers are responsible for handling incoming requests …",
          "order": 2,            // 分区内顺序
          "blocks": [ /* 见下 */ ]
        }
      ]
    }
  ]
}
```

### block 类型

每个 block 都有 `id`（章内唯一，`b1`、`b2`…）。**左右两栏共用同一份 blocks**，
是对齐和滚动同步的基础。

| type | 字段 | 说明 |
| --- | --- | --- |
| `heading` | `level`, `md`, `text` | 标题，`level` 为 1–6 |
| `paragraph` | `md`, `text` | 正文段落，`md` 保留行内粗体/链接/行内代码 |
| `list` | `md`, `text` | 有序/无序列表，整块保留 |
| `table` | `md` | 表格（管道语法或原始 HTML `<table>`） |
| `code` | `lang`, `code` | 围栏代码块，已去掉围栏后的首尾空行 |
| `callout` | `kind`(`info`/`warning`), `title`, `md`, `text` | 官网提示框 |
| `image` | `src`(绝对地址), `alt`, `md` | 插图 |
| `details` | `title`, `md`, `text` | `<details>` 折叠块（正文是 markdown） |
| `html` | `md` | 少量特殊 HTML（如 `file-tree` 目录树） |
| `hr` | — | 分隔线 |

`md` 是英文原文（左右栏左侧渲染它）；`text` 是去掉标记的纯文本，专门喂给翻译；
译文写回 `zh` 字段即可让右侧渲染。

## 翻译回填建议

1. 取 `blocks.filter(b => b.text)` 的 `text` 数组，按章分批（每批 20–40 块）交给模型翻译，
   要求「逐条返回、条数一致、保留代码/术语」。
2. 按 `id` 把译文写回 `block.zh`（markdown 可以直接写，渲染器和 `md` 一样处理）。
3. 只翻 `paragraph` / `heading` / `list` / `callout` / `details`，`code` 不动——这也正是
   `text` 只出现在这几类上的原因。

## 左右同步滚动的做法

页面渲染两列，同一个 `blocks` 数组各渲染一次（左 `md`、右 `zh`），每个块带 `data-block-id`。
两列等宽、行高一致时，用「块锚点」同步最稳：

```js
// 左列滚动 → 找到视口顶部第一个块 → 右列滚到同 id 的块
function syncFrom(sourceEl, targetEl) {
  const top = sourceEl.getBoundingClientRect().top;
  let anchor = null;
  for (const el of sourceEl.querySelectorAll('[data-block-id]')) {
    const r = el.getBoundingClientRect();
    if (r.bottom > top + 1) { anchor = el; break; }
  }
  if (!anchor) return;
  const target = targetEl.querySelector(`[data-block-id="${anchor.dataset.blockId}"]`);
  if (target) targetEl.scrollTop += target.getBoundingClientRect().top - top;
}
```

用「顶部块 + 偏移量」而不是 `scrollTop` 比例，中英文长度差异不会累积成错位；
再加一个 `syncing` 标志位防止两列互相触发。

## 已知限制

- 数据依赖官方 `llms.txt` 与 `*.md` 两个约定，官网改版需调整 `CFG` 里的地址。
- 抓的是**英文原文**；官网没有官方中文，译文需要自己翻译或调用翻译服务。
- 面板用 Shadow DOM 隔离，不会和站点样式冲突；抓取并发控制在 4，避免给官方站压力。
- JSON 约 5.2 MB（排版美化过，方便 diff）；如果在意体积可去掉 `text` 或用紧凑序列化。
