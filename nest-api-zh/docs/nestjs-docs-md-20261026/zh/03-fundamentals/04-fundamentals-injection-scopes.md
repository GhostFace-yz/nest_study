# Injection scopes

Source: https://docs.nestjs.com/fundamentals/injection-scopes

如果您来自不同的编程语言背景，您可能会惊讶地发现 Nest 几乎所有内容都在传入请求之间共享：到数据库的连接池、带有全局状态的单例服务等等。Node.js 不遵循多线程无状态请求/响应模型，其中每个请求都由单独的线程处理。因此，使用单例实例在 Nest 应用。

然而，存在基于请求的生存期是期望的行为的边缘情况，例如，中的每个请求缓存 GraphQL 应用程序、请求跟踪和多租户。注入范围可让您获得所需的提供者生命周期。

#### 提供者范围

提供者可以具有以下任何范围：

<table>
  <tr>
    <td><code>DEFAULT</code></td>
    <td>A single instance of the provider is shared across the entire application. The instance lifetime is tied directly to the application lifecycle. Once the application has bootstrapped, all singleton providers have been instantiated. Singleton scope is the default.</td>
  </tr>
  <tr>
    <td><code>REQUEST</code></td>
    <td>A new instance of the provider is created exclusively for each incoming <strong>request</strong>. The instance is garbage-collected after the request has been processed.</td>
  </tr>
  <tr>
    <td><code>TRANSIENT</code></td>
    <td>Transient providers are not shared across consumers. Each consumer that injects a transient provider receives a new, dedicated instance.</td>
  </tr>
</table>

> info **Hint** 对于大多数用例，**推荐**使用单例作用域。跨消费者和跨请求共享提供程序意味着可以缓存一个实例，并且在应用程序启动期间，它的初始化只发生一次。

#### 使用

通过传递 `scope` 财产 `@Injectable()` 装饰器选项对象：

```typescript
import { Injectable, Scope } from '@nestjs/common';

@Injectable({ scope: Scope.REQUEST })
export class CatsService {}
```

同样，对于 [定制提供者](/fundamentals/custom-providers)，设置 `scope` 提供者注册长手表格中的属性：

```typescript
{
  provide: 'CACHE_MANAGER',
  useClass: CacheManager,
  scope: Scope.TRANSIENT,
}
```

> info **Hint** 从 `@nestjs/common` 导入 `Scope` 枚举。

单例作用域是默认值，不需要声明。如果要显式声明提供程序为单例作用域，请使用 `Scope.DEFAULT` 的值 `scope` 财产。

> info **Hint** 从 NestJS v12，WebSocket 网关支持请求范围提供程序。作用域绑定到套接字连接，而不是单个消息。看 [Request-scoped gateways](/websockets/gateways#request-scoped-gateways).

> warning **Notice** 有些提供程序必须充当单例，不应使用请求范围内的提供程序，如 [_Passport strategies_](/recipes/passport#request-scoped-strategies) 或_Cron 控制器_。

#### 控制器范围

控制器还可以有一个作用域，该作用域应用于该控制器中声明的所有路由处理程序。与提供程序作用域一样，控制器的作用域声明其生命周期。对于请求范围控制器，为每个入站请求创建一个新实例，并在请求被处理后进行垃圾收集。

使用 `scope` 财产 `ControllerOptions` 对象：

```typescript
@Controller({
  path: 'cats',
  scope: Scope.REQUEST,
})
export class CatsController {}
```

#### 范围层次结构

这个 `REQUEST` 注射链上的示波器气泡。依赖于请求作用域提供程序的控制器本身也是请求作用域的。

考虑以下依赖图： `CatsController <- CatsService <- CatsRepository`.如果 `CatsService` 是请求作用域（其他是默认单例）， `CatsController` 变成请求范围，因为它依赖于注入的服务。 `CatsRepository`，这不取决于 `CatsService`，仍然是单例作用域。

瞬态作用域依赖不遵循这种模式。如果单例作用域 `DogsService` 注入瞬态 `LoggerService` 提供程序，它接收它的新实例。然而， `DogsService` 保持单例作用域，因此将其注入任何地方都不会解析为 `DogsService`.如果您想要这种行为，请明确标记 `DogsService` 作为 `TRANSIENT` 也是。

#### 请求提供程序

在一个 HTTP 基于服务器的应用程序（例如，使用 `@nestjs/platform-express` 或者 `@nestjs/platform-fastify`)，在使用请求作用域提供程序时，您可能希望访问对原始请求对象的引用。为此，注入 `REQUEST` 物体。

这个 `REQUEST` 提供程序本质上是请求范围的，因此不需要指定 `REQUEST` 使用时显式作用域（如果这样做，它将被忽略）。任何依赖于请求作用域提供程序的提供程序都会自动采用请求作用域，并且这种行为无法更改。

```typescript
import { Injectable, Scope, Inject } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { Request } from 'express';

@Injectable({ scope: Scope.REQUEST })
export class CatsService {
  constructor(@Inject(REQUEST) private request: Request) {}
}
```

由于底层平台和协议的差异，您在微服务或 GraphQL 应用程序中访问入站请求的方式略有不同。在 [GraphQL](/graphql/quick-start) 应用程序中，注入 `CONTEXT` 而不是 `REQUEST`：

```typescript
import { Injectable, Scope, Inject } from '@nestjs/common';
import { CONTEXT } from '@nestjs/graphql';

@Injectable({ scope: Scope.REQUEST })
export class CatsService {
  constructor(@Inject(CONTEXT) private context) {}
}
```

然后配置您的 `context` 值（在 `GraphQLModule`) 包含 `request` 作为财产。

#### 查询提供者

要获取构建提供程序的类，例如在日志或度量提供程序中，注入 `INQUIRER` 令牌：

```typescript
import { Inject, Injectable, Scope } from '@nestjs/common';
import { INQUIRER } from '@nestjs/core';

@Injectable({ scope: Scope.TRANSIENT })
export class HelloService {
  constructor(@Inject(INQUIRER) private parentClass: object) {}

  sayHello(message: string) {
    console.log(`${this.parentClass?.constructor?.name}: ${message}`);
  }
}
```

然后按如下方式使用：

```typescript
import { Injectable } from '@nestjs/common';
import { HelloService } from './hello.service.js';

@Injectable()
export class AppService {
  constructor(private helloService: HelloService) {}

  getRoot(): string {
    this.helloService.sayHello('My name is getRoot');

    return 'Hello world!';
  }
}
```

在上面的例子中，当 `AppService#getRoot` 叫做，`"AppService: My name is getRoot"` 已登录到控制台。

#### 表现

请求范围内的提供程序会影响应用程序性能。虽然 Nest 缓存尽可能多的元数据，它仍然必须在每个请求上创建一个类的实例，这会减慢您的平均响应时间和整体基准测试结果。除非提供程序必须是请求作用域，否则我们强烈建议使用默认的单例作用域。

> info **Hint** 使用请求范围提供程序的适当设计的应用程序不应看到超过 5%的延迟增加。

许多提供程序的请求范围仅用于读取属于当前请求的值：经过身份验证的用户、租户或区域设置。为此，基于 `AsyncLocalStorage` 将每个提供程序保持为单例，并以相同的方式工作 HTTP 处理程序、微服务消息处理程序和队列作业。如果您的应用程序使用 [NestJS Observe](/observability/overview)，它已经为每个请求、消息和作业 it 工具保留了这样一个存储：用 `TracerService.setAttribute()` 并从下游任何地方读取 `getAttribute()`，无需更改范围，也无需维护自己的存储。看 [Async local storage](/recipes/async-local-storage#nestjs-observe) 详情和替代方案。

#### 持久供应商

如在前一节中提到的，请求作用域提供程序可能会增加延迟，因为具有至少一个请求作用域提供程序（注入到控制器实例中，或者更深入地注入到它的一个提供程序中）使得控制器也是请求作用域的。然后必须为每个单独的请求重新创建（实例化）控制器，并在之后进行垃圾收集。例如，对于并行的 30k 个请求，有 30k 个控制器（及其请求范围提供程序）的短暂实例。

如果大多数提供者依赖的公共提供者（想想数据库连接或记录器服务）是请求作用域，那么所有这些提供者也会自动变成请求作用域。这可能会在**多租户应用程序**中带来挑战，尤其是那些具有中央请求范围的“数据源”提供者的应用程序，该提供者从请求对象读取标头或令牌，并根据其值检索该租户的相应数据库连接或模式。

例如，假设您的应用程序被 10 个不同的客户使用。每个客户都有自己的**专用数据源**，您要确保客户 A 永远无法访问客户 B 的数据库。实现这一点的一种方法是声明一个请求作用域的“数据源”提供者，该提供者从请求对象确定“当前客户”并检索相应的数据库。这种方法可以在几分钟内将您的应用程序变成多租户应用程序。它的主要缺点是，应用程序的很大一部分组件可能依赖于“数据源”提供程序，因此它们隐含地变成了请求范围，这降低了应用程序的性能。

只有 10 个客户，你可以有 10 个个人 [DI sub-trees](/fundamentals/module-ref#resolving-scoped-providers)，每个客户一个，而不是每个请求重新创建每个树。如果您的提供程序不依赖于每个请求真正唯一的任何属性（例如，请求 UUID），但是对于允许您聚合（分类）请求的特定属性，没有理由重新创建 DI 子树_在每个传入请求上。

这就是**持久提供者**的用武之地。

在将提供者标记为持久化之前，您必须注册一个**策略**，说明 Nest 这些“公共请求属性”是什么，并提供对请求进行分组的逻辑，即将它们与其对应的 DI 子树。

```typescript
import {
  HostComponentInfo,
  ContextId,
  ContextIdFactory,
  ContextIdStrategy,
} from '@nestjs/core';
import { Request } from 'express';

const tenants = new Map<string, ContextId>();

export class AggregateByTenantContextIdStrategy implements ContextIdStrategy {
  attach(contextId: ContextId, request: Request) {
    const tenantId = request.headers['x-tenant-id'] as string;
    let tenantSubTreeId: ContextId;

    if (tenants.has(tenantId)) {
      tenantSubTreeId = tenants.get(tenantId);
    } else {
      tenantSubTreeId = ContextIdFactory.create();
      tenants.set(tenantId, tenantSubTreeId);
    }

    // If tree is not durable, return the original "contextId" object
    return (info: HostComponentInfo) =>
      info.isTreeDurable ? tenantSubTreeId : contextId;
  }
}
```

> info **Hint** 与 request scope 一样，耐用性也存在于注射链中。如果 a 依赖于 B，它被标记为 `durable` 时，A 也隐式地变得持久，前提是 A 的所有其他请求作用域依赖项也是持久的（除非 A 被显式声明为 `Scope.REQUEST` 和 `durable: false`).

> warning **Warning** 这种策略对于具有大量租户的应用程序来说并不理想。

从 `attach` 方法告诉 Nest 给定主机使用哪个上下文标识符。在这种情况下，我们指定 `tenantSubTreeId` 应使用自动生成的原始 `contextId` 当主机组件（例如，请求作用域控制器）被标记为持久时，对象（您将在下面学习如何将提供程序标记为持久）。此外，在上面的示例中，**没有注册有效载荷**（有效载荷是 `REQUEST`/`CONTEXT` 表示“根”的提供程序，即子树的父级）。

要注册耐用树的有效载荷，请使用以下结构：

```typescript
// The return of `AggregateByTenantContextIdStrategy#attach` method:
return {
  resolve: (info: HostComponentInfo) =>
    info.isTreeDurable ? tenantSubTreeId : contextId,
  payload: { tenantId },
};
```

现在，每当你注射 `REQUEST` 提供者（或 `CONTEXT` 为了 GraphQL 应用）与 `@Inject(REQUEST)`/`@Inject(CONTEXT)`，这个 `payload` 对象被注入（由单个属性组成，`tenantId`，在这种情况下）。

有了这个策略，可以在代码中的任何位置注册它（它适用于全局），例如 `main.ts` 文件：

```typescript
ContextIdFactory.apply(new AggregateByTenantContextIdStrategy());
```

> info **Hint** 这个 `ContextIdFactory` 类是从 `@nestjs/core` 包装。

只要注册发生在任何请求到达您的应用程序之前，一切都会按预期进行。

最后，要将常规提供程序转换为持久提供程序，请将 `durable` 标志设置为 `true`，并将其作用域更改为 `Scope.REQUEST`。Nest 仅在用 `Scope.REQUEST` 明确声明的提供者上读取 `durable` 标志；仅隐式地（通过其依赖项）被请求作用域的提供者从这些依赖项中导出其持久性，如上面提示中所述。

```typescript
import { Injectable, Scope } from '@nestjs/common';

@Injectable({ scope: Scope.REQUEST, durable: true })
export class CatsService {}
```

同样，对于 [定制提供者](/fundamentals/custom-providers)，设置 `durable` 提供者注册长手表格中的属性：

```typescript
{
  provide: 'foobar',
  useFactory: () => { ... },
  scope: Scope.REQUEST,
  durable: true,
}
```
