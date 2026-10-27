# Compression

Source: https://docs.nestjs.com/http/compression

压缩可以显著减小响应体的大小，这使得 web 应用程序加载速度更快。

对于生产中的**高流量**网站，我们强烈建议从应用服务器卸载压缩，通常卸载到反向代理（例如 Nginx）。在这种情况下，不要使用压缩中间件。

#### 与 Express（默认）

使用 [压缩](https://github.com/expressjs/compression) 启用响应压缩的中间件包。它支持 gzip、deflate 和 Brotli 编码，并根据请求选择一种 `Accept-Encoding` 头球。

首先，安装所需的软件包：

```bash
$ npm i --save compression
$ npm i --save-dev @types/compression
```

安装完成后，全局应用压缩中间件：

```typescript
import compression from 'compression';
// somewhere in your initialization file
app.use(compression());
```

#### 与 Fastify

如果您使用 `FastifyAdapter`，使用 [@fastify/compress](https://github.com/fastify/fastify-compress) 插件代替：

```bash
$ npm i --save @fastify/compress
```

安装完成后，注册 `@fastify/compress` 插件。默认情况下，它会压缩所有符合条件的响应。

> warning **Warning** 确保你通过了 `NestFastifyApplication` 创建应用程序时键入。否则，`register()` 方法不可用于应用插件。

```typescript
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';

import compression from '@fastify/compress';

// inside bootstrap()
const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter());
await app.register(compression);
```

默认情况下， `@fastify/compress` 使用客户端接受的第一个编码，按以下优先级顺序： `zstd` （上 Node.js 支持它的版本）， `br` （布罗特利）， `gzip`，和 `deflate`.Brotli 实现了高压缩比，但更高的质量水平是缓慢的。插件设置 Brotli 质量（`BROTLI_PARAM_QUALITY`) 默认为 4，而不是 zlib 默认的 11。您可以将其设置为从 0（最快）到 11（最小输出）的任何位置，根据响应大小权衡压缩时间。为您的工作负载调整此值。以下示例显式设置质量：

```typescript
import { constants } from 'node:zlib';
// somewhere in your initialization file
await app.register(compression, { brotliOptions: { params: { [constants.BROTLI_PARAM_QUALITY]: 4 } } });
```

或者，您可以限制 `@fastify/compress` 压缩和放气。响应可能更大，但它们被压缩得更快。

要指定编码，请将第二个参数中的 `encodings` 选项传递给 `app.register()`：

```typescript
await app.register(compression, { encodings: ['gzip', 'deflate'] });
```

此配置告诉 `@fastify/compress` 要只使用 gzip 和 deflate 编码，当客户端支持两者时，首选 gzip。
