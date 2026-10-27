# Versioning

Source: https://docs.nestjs.com/http/versioning

> info **Hint** 本章仅适用于 HTTP-基于的应用程序。

版本控制允许您在同一应用程序中运行**不同版本**的控制器或单个路由。应用程序经常更改，您经常需要引入突破性的更改，同时仍然支持应用程序的先前版本。

Nest 支持四种版本控制类型：

<table>
  <tr>
    <td><a href='http/versioning#uri-versioning-type'><code>URI Versioning</code></a></td>
    <td>The version is passed within the URI of the request (default)</td>
  </tr>
  <tr>
    <td><a href='http/versioning#header-versioning-type'><code>Header Versioning</code></a></td>
    <td>A custom request header specifies the version</td>
  </tr>
  <tr>
    <td><a href='http/versioning#media-type-versioning-type'><code>Media Type Versioning</code></a></td>
    <td>The <code>Accept</code> header of the request specifies the version</td>
  </tr>
  <tr>
    <td><a href='http/versioning#custom-versioning-type'><code>Custom Versioning</code></a></td>
    <td>Any aspect of the request may specify the version(s). You provide a custom function that extracts the version(s).</td>
  </tr>
</table>

#### URI 版本类型

URI 版本控制使用在请求的 URI 中传递的版本，例如 `https://example.com/v1/route` 和 `https://example.com/v2/route`。

> warning **Notice** 和 URI 版本控制，版本会自动添加到 URI 在<a href="faq/global-prefix">全局路径前缀</a>（如果存在）之后，在任何控制器或路由路径之前。

启用 URI 对于应用程序的版本控制，请执行以下操作：

```typescript
const app = await NestFactory.create(AppModule);
// or "app.enableVersioning()"
app.enableVersioning({
  type: VersioningType.URI,
});
await app.listen(process.env.PORT ?? 3000);
```

> warning **Notice** 默认情况下，URI 中的版本会自动以 `v` 为前缀。要更改前缀，请将 `prefix` 键设置为所需值，或将其设置为 `false` 以禁用它。

> info **Hint** 这个 `VersioningType` 枚举可用于 `type` 属性，并从 `@nestjs/common` 包装。

#### 标题版本控制类型

标头版本控制使用自定义的、用户指定的请求标头，其值指定用于请求的版本。

要为应用程序启用**标题版本控制**，请执行以下操作：

```typescript
const app = await NestFactory.create(AppModule);
app.enableVersioning({
  type: VersioningType.HEADER,
  header: 'Custom-Header',
});
await app.listen(process.env.PORT ?? 3000);
```

这个 `header` 属性是包含请求版本的标头的名称。

> info **Hint** 这个 `VersioningType` 枚举可用于 `type` 属性，并从 `@nestjs/common` 包装。

#### 媒体类型版本类型

媒体类型版本控制使用 `Accept` 指定版本的请求头。

在 `Accept` 标头中，版本与媒体类型用分号(`;`) 分隔，后面跟着表示用于请求的版本的键值对，例如 `Accept: application/json;v=2`。键被视为版本的前缀，因此 `key` 属性必须同时包含键和分隔符。

要为应用程序启用**媒体类型版本控制**，请执行以下操作：

```typescript
const app = await NestFactory.create(AppModule);
app.enableVersioning({
  type: VersioningType.MEDIA_TYPE,
  key: 'v=',
});
await app.listen(process.env.PORT ?? 3000);
```

`key` 属性是包含版本的键值对的键和分隔符。对于 `Accept: application/json;v=2`，将 `key` 属性设置为 `v=`。

> info **Hint** 这个 `VersioningType` 枚举可用于 `type` 属性，并从 `@nestjs/common` 包装。

#### 自定义版本控制类型

自定义版本控制使用请求的任何方面来指定版本。Nest 使用 `extractor` 返回字符串或字符串数组的函数。

如果请求者提供多个版本，提取器函数可以返回一个字符串数组，从最高版本到最低版本排序。版本按照从高到低的顺序与路线匹配。

如果 `extractor` 返回一个空字符串或数组，没有匹配版本化的路由，因此对一个的请求会收到一个 `404` 响应状态。[`VERSION_NEUTRAL`](/http/versioning#version-neutral) 路由仍然匹配，不指定版本的路由也是如此 [全局默认版本](/http/versioning#global-default-version) 已经设置好了。

例如，如果传入请求指定它支持版本 `1`、`2` 和 `3`，则 `extractor` **必须** 返回 `['3', '2', '1']`。这确保首先选择最高可能的路由版本。

如果版本 `['3', '2', '1']` 提取，但路由仅存在于版本中 `2` 和 `1`，匹配版本的路由 `2` 已选中（版本 `3` 被忽略）。

> warning **Notice** 与 Express 适配器，让你的 `extractor` 返回单个版本（字符串或只有一个元素的数组）。从多元素数组中选择最高匹配版本**无法可靠地工作**Express 由于适配器的设计限制。如果需要这种行为，请使用 Fastify 适配器，支持单版本和最高匹配版本选择。

要为应用程序启用 **自定义版本控制**，请创建 `extractor` 函数并将其传递给 `enableVersioning()`：

```typescript
// Example extractor that pulls out a list of versions from a custom header and turns it into a sorted array.
// This example uses Fastify, but Express requests can be processed in a similar way.
const extractor = (request: FastifyRequest): string | string[] =>
  [request.headers['custom-versioning-field'] ?? '']
     .flatMap(v => v.split(','))
     .filter(v => !!v)
     .sort()
     .reverse()

const app = await NestFactory.create(AppModule);
app.enableVersioning({
  type: VersioningType.CUSTOM,
  extractor,
});
await app.listen(process.env.PORT ?? 3000);
```

#### 使用

版本控制允许您对版本控制器和单个路由进行版本控制，也允许某些资源选择退出版本控制。无论应用程序使用何种版本类型，用法都是相同的。

> warning **Notice** 如果为应用程序启用了版本控制，但控制器或路由未指定版本（并且没有 [全局默认版本](/http/versioning#global-default-version) 设置），控制器或路由的行为类似于 [`VERSION_NEUTRAL`](/http/versioning#version-neutral) 一。和 URI 版本控制，它只在其路径上提供服务，而没有版本（`/cats`，而 `/v1/cats` 收到 `404` 响应状态）。对于其他版本控制类型，它提供请求包含的任何版本，或者不提供。包含没有相应控制器或路由的版本的请求接收 `404` 响应状态，当只有版本化的控制器或路由与其路径匹配时，没有版本的请求也是如此。

#### 控制器版本

版本可以应用于控制器，为该控制器内的所有路由设置版本。

要将版本添加到控制器，请执行以下操作：

```typescript
@Controller({
  version: '1',
})
export class CatsControllerV1 {
  @Get('cats')
  findAll(): string {
    return 'This action returns all cats for version 1';
  }
}
```

#### 路线版本

一个版本可以应用于单独的路线。此版本覆盖任何其他会影响路由的版本，如控制器版本。

要将版本添加到单个路由，请执行以下操作：

```typescript
import { Controller, Get, Version } from '@nestjs/common';

@Controller()
export class CatsController {
  @Version('1')
  @Get('cats')
  findAllV1(): string {
    return 'This action returns all cats for version 1';
  }

  @Version('2')
  @Get('cats')
  findAllV2(): string {
    return 'This action returns all cats for version 2';
  }
}
```

#### 多个版本

多个版本可以应用于控制器或路由。若要使用多个版本，请将版本设置为数组：

```typescript
@Controller({
  version: ['1', '2'],
})
export class CatsController {
  @Get('cats')
  findAll(): string {
    return 'This action returns all cats for version 1 or 2';
  }
}
```

#### “中性”版本

无论版本如何，某些控制器或路由的行为都相同。要适应这一点，请将版本设置为 `VERSION_NEUTRAL` 象征。

传入请求映射到 `VERSION_NEUTRAL` 控制器或路由，无论指定的版本如何，包括当请求根本不包含版本时。

> warning **Notice** 对于 URI 版本控制，`VERSION_NEUTRAL` 资源的 URI 中没有版本。

要添加版本中立的控制器或路由，请执行以下操作：

```typescript
import { Controller, Get, VERSION_NEUTRAL } from '@nestjs/common';

@Controller({
  version: VERSION_NEUTRAL,
})
export class CatsController {
  @Get('cats')
  findAll(): string {
    return 'This action returns all cats regardless of version';
  }
}
```

> warning **Notice** 注册版本中立的控制器或路由，或者注册不指定版本的控制器或路由 [全局默认版本](/http/versioning#global-default-version) 在共享其路径的任何版本化控制器或路由之后设置：稍后在模块的 `controllers` 数组，在同一个控制器中声明在它们下面，或者把它放在它们之后注册的模块中。模块自己的控制器在它导入的模块之前注册，导入的模块按照 `imports` 阵列。与 Express 适配器和除 URI 版本控制中，共享路径的路由按注册顺序进行尝试，因此首先注册的版本中立路由也会接收版本控制的路由的请求。

#### 全局默认版本

如果不想为每个控制器或单个路由提供一个版本，或者希望使用一个特定版本作为每个未指定控制器或路由的默认版本，请将 `defaultVersion` 如下：

```typescript
app.enableVersioning({
  // ...
  defaultVersion: '1',
  // or: defaultVersion: ['1', '2'],
  // or: defaultVersion: VERSION_NEUTRAL,
});
```

#### 中间件版本控制

[Middleware](/middleware) 还可以使用版本控制元数据以特定路由版本为目标。为此，请设置 `version` 路由对象中的属性传递给 `MiddlewareConsumer.forRoutes()` 方法：

```typescript
import { Module, NestModule, MiddlewareConsumer, RequestMethod } from '@nestjs/common';
import { LoggerMiddleware } from './common/middleware/logger.middleware.js';
import { CatsModule } from './cats/cats.module.js';
import { CatsController } from './cats/cats.controller.js';

@Module({
  imports: [CatsModule],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(LoggerMiddleware)
      .forRoutes({ path: 'cats', method: RequestMethod.GET, version: '2' });
  }
}
```

使用上面的代码，`LoggerMiddleware` 仅适用于版本 `'2'` 的 `/cats` 端点。

> info **Note** 中间件适用于本章中描述的任何版本控制类型：`URI`、`Header`、`Media Type` 或 `Custom`。
