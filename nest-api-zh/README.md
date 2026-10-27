# nest-api-zh

NestJS 官方文档的**抓取 → 翻译 → 校对 → 阅读器**一条龙。

## 目录

| 目录 | 内容 |
| --- | --- |
| `docs/` | 抓下来的英文原文（JSON + Markdown 镜像）与翻译产物 |
| `tools/` | 讯飞小牛翻译、润色、验收脚本 |
| `app/` | Web 版阅读器：React + Vite + Tailwind + shadcn，双栏 + 同步滚动 + 划词联动 |
| `mobile/` | 手机版：React Native (Expo)，英文优先 + 点句看中文 |

## 三步走

```bash
# 1. 翻译（增量；全命中缓存时 0 次 API 调用）
python3 tools/translate_xfyun.py

# 2. 润色（术语统一 + 中英/链接间距，零成本可反复跑）
python3 tools/polish_zh.py

# 3. Web 阅读器
cd app && pnpm install && pnpm dev

# 4. 手机版（Expo Go 扫码）
cd mobile && npm install && npm start
```

产出：

- `docs/nestjs-docs-20261026.zh.json` —— 每个 block 多一个 `zh` 字段
- `docs/nestjs-docs-md-20261026/zh/` —— 中文 Markdown 镜像，方便 git diff 审阅
- `docs/translation-report.json` —— 未翻译/失败的块

详见 [`app/README.md`](app/README.md) 与 [`mobile/README.md`](mobile/README.md)。

## 翻译脚本要点

- 代码块整块跳过；行内代码、类名、方法名、URL、产品名（Nest/Express/Fastify/GraphQL…）用占位符保护，翻完原样还原
- 链接整体保护（机翻会把 `[ ] ( )` 改成全角，链接会坏）
- 还原前校验占位符数量与编号，失败就降级：`⟦n⟧` → `[[n]]` → 分段翻译 → 保留英文
- 三级缓存：本地 JSON 缓存（`tools/.cache/`，已 gitignore）→ 已有 `zh` 跳过 → 内容哈希
- 11200 / 10313 / 401 这类错误会立即中止并提示处理方式

## 常用命令

```bash
python3 tools/translate_xfyun.py --check          # 验证凭证（1 个请求）
python3 tools/translate_xfyun.py --dry-run        # 统计规模（0 请求）
python3 tools/translate_xfyun.py --only controllers
python3 tools/translate_xfyun.py --force --concurrency 10   # 重翻（约 6 分钟）
python3 tools/polish_zh.py --dry-run              # 看看会改多少处
python3 tools/verify_zh.py                        # 结构验收
```
