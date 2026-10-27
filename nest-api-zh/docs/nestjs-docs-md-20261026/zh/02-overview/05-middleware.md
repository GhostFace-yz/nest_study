# Middleware

Source: https://docs.nestjs.com/middleware

中间件是一个在路由处理程序之前调用的函数。中间件函数可以访问 [请求](https://expressjs.com/en/4x/api.html#req) 和 [回应](https://expressjs.com/en/4x/api.html#res) 对象，以及应用程序的请求-响应周期中的 `next()` 中间件函数。**next**中间件函数通常由名为 `next` 的变量表示。

<figure><img class="illustrative-image" src="https://docs.nestjs.com/assets/Middlewares_1.png" /></figure>

默认情况下，Nest 中间件相当于 [Express](https://expressjs.com/en/guide/using-middleware.html) 中间件。官方 Express 文档描述了中间件的功能如下：

<blockquote class="external">
  Middleware functions can perform the following tasks:
  <ul>
    <li>execute any code.</li>
    <li>make changes to the request and the response objects.</li>
    <li>end the request-response cycle.</li>
    <li>call the next middleware function in the stack.</li>
    <li>if the current middleware function does not end the request-response cycle, it must call <code>next()</code> to
      pass control to the next middleware function. Otherwise, the request will be left hanging.</li>
  </ul>
</blockquote>

您实现自定义 Nest 中间件作为函数或类 `@Injectable()` 装修师。类应该实现 `NestMiddleware` 接口，而一个函数没有特殊要求。让我们从实现一个简单的中间件类开始。

> warning **Warning** Express 和 Fastify 以不同的方式处理中间件并提供不同的方法签名。参见 [Performance (Fastify)](/http/performance#middleware) 详情见章节。

```typescript
import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class LoggerMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    console.log('Request...');
    next();
  }
}
```

#### 依赖注入

Nest 中间件完全支持依赖注入。与提供程序和控制器一样，中间件类可以**注入同一模块中可用的依赖项**。像往常一样，依赖项是通过 `constructor` 注入的。

#### 应用中间件

中间件未在 `@Module()` 装修师。相反，您将其设置在 `configure()` 模块类的方法。包含中间件的模块必须实现 `NestModule` 接口。让我们设置 `LoggerMiddleware` 在 `AppModule` 等级。

```typescript
import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { LoggerMiddleware } from './common/middleware/logger.middleware.js';
import { CatsModule } from './cats/cats.module.js';

@Module({
  imports: [CatsModule],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(LoggerMiddleware)
      .forRoutes('cats');
  }
}
```

在上面的示例中，`LoggerMiddleware` 应用于 `CatsController` 中定义的 `/cats` 路由处理程序。若要将中间件限制到特定的请求方法，请将包含路由 `path` 和请求 `method` 的对象传递给 `forRoutes()` 方法。下面的示例导入 `RequestMethod` 枚举来引用所需的请求方法。

```typescript
import { Module, NestModule, RequestMethod, MiddlewareConsumer } from '@nestjs/common';
import { LoggerMiddleware } from './common/middleware/logger.middleware.js';
import { CatsModule } from './cats/cats.module.js';

@Module({
  imports: [CatsModule],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(LoggerMiddleware)
      .forRoutes({ path: 'cats', method: RequestMethod.GET });
  }
}
```

> info **Hint** 这个 `configure()` 方法可以是异步的。用 `async` 二 `await` 方法体内部异步操作的完成。

> warning **Warning** 使用 Express 适配器，Nest 默认注册 `json` 和 `urlencoded` 主体解析器（`express.json()` 和 `express.urlencoded()`）。要通过 `MiddlewareConsumer` 自定义这些解析器，请在使用 `NestFactory.create()` 创建应用程序时，通过将 `bodyParser` 选项设置为 `false` 来禁用默认值。

#### 路线通配符

中间件还支持基于模式的路由。例如，命名通配符（`*splat`) 匹配路由中的任何字符组合。在下面的示例中，中间件运行以 `abcd/`，不管后面跟着多少个字符。

```typescript
forRoutes({
  path: 'abcd/*splat',
  method: RequestMethod.ALL,
});
```

> info **Hint** `splat` 只是通配符参数的名称，没有特殊含义。您可以使用任何名称，例如 `*wildcard`。

这个 `'abcd/*splat'` 路线路径匹配 `abcd/1`,`abcd/123`,`abcd/abc`，等等。基于字符串的路径解释连字符（`-`）和点（`.`）字面上。然而，`abcd/` 没有附加字符不匹配。为了匹配它，请将通配符用大括号括起来，使其成为可选的：

```typescript
forRoutes({
  path: 'abcd/{*splat}',
  method: RequestMethod.ALL,
});
```

#### 中间件消费者

`MiddlewareConsumer` 是一个 helper 类，它提供了几种管理中间件的内置方法。它们都可以在 [流畅风格](https://en.wikipedia.org/wiki/Fluent_interface) 中**链接**。`forRoutes()` 方法接受单个字符串、多个字符串、`RouteInfo` 对象、控制器类或多个控制器类。在大多数情况下，您将传递一个用逗号分隔的**控制器**列表。下面是一个使用单个控制器的示例：

```typescript
import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
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
      .forRoutes(CatsController);
  }
}
```

> info **Hint** 这个 `apply()` 方法接受单个中间件或多个参数来指定<a href="/middleware#multiple-middleware">多个中间件</a>。

#### 排除路线

若要**排除**应用中间件的某些路由，请使用 `exclude()` 方法。它接受单个字符串、多个字符串或 `RouteInfo` 标识要排除的路由的对象：

```typescript
consumer
  .apply(LoggerMiddleware)
  .exclude(
    { path: 'cats', method: RequestMethod.GET },
    { path: 'cats', method: RequestMethod.POST },
    'cats/{*splat}',
  )
  .forRoutes(CatsController);
```

通过上面的例子，`LoggerMiddleware` 绑定到内部定义的所有路由 `CatsController`**除了**那些与三个条目相匹配的人传递给 `exclude()` 方法。

> info **Hint** 这个 `exclude()` 方法使用 [path-to-regexp](https://github.com/pillarjs/path-to-regexp#parameters) 包装。

#### 功能中间件

这个 `LoggerMiddleware` 我们一直在使用的类是最小的：它没有成员，没有额外的方法，也没有依赖关系。像这样的中间件可以定义为一个普通函数，而不是一个类。这种类型的中间件被称为**功能中间件**。让我们将记录器中间件从一个类转换为一个函数来说明其中的区别：

```typescript
import { Request, Response, NextFunction } from 'express';

export function logger(req: Request, res: Response, next: NextFunction) {
  console.log('Request...');
  next();
}
```

然后在 `AppModule` 中使用它：

```typescript
consumer
  .apply(logger)
  .forRoutes(CatsController);
```

> info **Hint** 只要你的中间件不需要任何依赖关系，就考虑使用**功能性中间件**。

#### 多中间件

若要绑定按顺序执行的多个中间件，请将逗号分隔的列表传递给 `apply()` 方法：

```typescript
consumer.apply(cors(), helmet(), logger).forRoutes(CatsController);
```

#### 全局中间件

若要一次将中间件绑定到每个注册路由，请使用 `use()` 方法 `INestApplication` 实例：

```typescript
const app = await NestFactory.create(AppModule);
app.use(logger);
await app.listen(process.env.PORT ?? 3000);
```

> info **Hint** 注册的全局中间件 `app.use()` 无法访问 DI 容器，所以用 [功能中间件](middleware#functional-middleware) 那里。或者，使用类中间件并将其绑定到 `.forRoutes('*')` 在 `AppModule`（或任何其他模块）。

#### 错误处理

当中间件抛出异常时，Nest 的 [异常层](/exception-filters) 捕获它并发送适当的响应，就像它对从路由处理程序抛出的异常所做的那样。推荐的方法是抛出 `HttpException`（或内置子类，如 `UnauthorizedException`）：

```typescript
import {
  Injectable,
  NestMiddleware,
  UnauthorizedException,
} from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class AuthMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    if (!req.headers.authorization) {
      throw new UnauthorizedException();
    }
    next();
  }
}
```

如果中间件是异步的，则声明 `use()` 作为 `async`（或返回 `Promise`）以便将被拒绝的承诺转发到异常层：

```typescript
@Injectable()
export class AuthMiddleware implements NestMiddleware {
  constructor(private readonly authService: AuthService) {}

  async use(req: Request, res: Response, next: NextFunction) {
    const user = await this.authService.verify(req.headers.authorization);
    if (!user) {
      throw new UnauthorizedException();
    }
    req['user'] = user;
    next();
  }
}
```

您也可以将错误传递给 `next()`。这在包装通过回调报告故障的现有 Express 样式中间件时非常有用：

```typescript
use(req: Request, res: Response, next: NextFunction) {
  if (!req.headers.authorization) {
    return next(new UnauthorizedException());
  }
  next();
}
```

> warning **Warning** 由于中间件在选择路由处理程序之前运行，因此只有**全局**异常筛选器（注册为 `app.useGlobalFilters()` 或者 `APP_FILTER`token）捕获从中间件抛出的异常。方法作用域和控制器作用域的筛选器不会被调用，并且将筛选器绑定到中间件类 `@UseFilters()` 不支持。

> info **Hint** 注册的中间件 `app.use()` 由底层处理 HTTP 平台（Express 或者 Fastify），而不是通过 Nest's `MiddlewareModule`.更喜欢抛出错误（或调用 `next(err)`）来自与 `MiddlewareConsumer`，以便异常层可以处理它们。
