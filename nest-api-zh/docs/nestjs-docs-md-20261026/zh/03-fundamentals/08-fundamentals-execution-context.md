# Execution context

Source: https://docs.nestjs.com/fundamentals/execution-context

Nest 提供几个实用程序类，帮助您编写跨多个应用程序上下文运行的应用程序（例如，HTTP 基于服务器、微服务和 WebSockets 应用程序上下文）。这些实用程序提供有关当前执行上下文的信息，您可以使用这些信息来构建泛型 [警卫](/guards),[过滤器](/exception-filters)，和 [拦截器](/interceptors) 它适用于广泛的控制器、方法和执行上下文。

本章涵盖了两个这样的类：`ArgumentsHost` 和 `ExecutionContext`。

#### 参数主机类

这个 `ArgumentsHost` 类提供用于检索传递给处理程序的参数的方法。它允许您选择适当的上下文（例如，HTTP,RPC（微服务）或 WebSockets）来检索参数。该框架提供了 `ArgumentsHost`，通常称为 `host` 参数，在您可能想要访问它的位置。例如，`catch()` 方法 [异常过滤器](/exception-filters#arguments-host) 被称为 `ArgumentsHost` 实例。

`ArgumentsHost` 充当处理程序参数的抽象。例如，在 HTTP 服务器应用程序（当 `@nestjs/platform-express` 使用），`host` 对象封装 Express 的 `[request, response, next]` 数组，其中 `request` 是请求对象，`response` 是响应对象，并且 `next` 是控制应用程序的请求-响应周期的函数。为了 [GraphQL](/graphql/quick-start) 另一方面，应用程序 `host` 对象包含 `[root, args, context, info]` 阵列。

#### 当前应用环境

构建泛型时 [警卫](/guards),[过滤器](/exception-filters)，和 [拦截器](/interceptors) 这意味着跨多个应用程序上下文运行，您需要一种方法来确定您的方法当前正在运行的应用程序类型。使用 `getType()` 方法 `ArgumentsHost` 为了这个。它返回 `'http'`,`'rpc'`, 或 `'ws'` 开箱即用，以及诸如 `@nestjs/graphql` 添加他们自己的类型：

```typescript
if (host.getType() === 'http') {
  // do something that is only important in the context of regular HTTP requests (REST)
} else if (host.getType() === 'rpc') {
  // do something that is only important in the context of microservice requests
} else if (host.getType<GqlContextType>() === 'graphql') {
  // do something that is only important in the context of GraphQL requests
}
```

> info **Hint** 这个 `GqlContextType` 类型是从 `@nestjs/graphql` 包装。

有了可用的应用程序类型，您可以编写更多的通用组件，如下所示。

#### 主机处理程序参数

检索传递给处理程序的参数数组的一种方法是主机对象的 `getArgs()` 方法：

```typescript
const [req, res, next] = host.getArgs();
```

您可以使用 `getArgByIndex()` 方法：

```typescript
const request = host.getArgByIndex(0);
const response = host.getArgByIndex(1);
```

这些示例通过索引检索请求和响应对象，通常不建议这样做，因为它会将应用程序耦合到特定的执行上下文。相反，您可以通过使用 `host` 对象的实用程序方法来切换到适当的应用程序上下文。上下文切换实用程序方法如下所示。

```typescript
/**
 * Switch context to RPC.
 */
switchToRpc(): RpcArgumentsHost;
/**
 * Switch context to HTTP.
 */
switchToHttp(): HttpArgumentsHost;
/**
 * Switch context to WebSockets.
 */
switchToWs(): WsArgumentsHost;
```

让我们使用 `switchToHttp()` 方法。这个 `host.switchToHttp()` 助手调用返回一个 `HttpArgumentsHost` 适合于 HTTP 应用上下文。这个 `HttpArgumentsHost`object 有两种有用的方法来提取所需的对象。例子也通过了 Express 类型作为类型参数，因此方法返回本机类型 Express 对象：

```typescript
const ctx = host.switchToHttp();
const request = ctx.getRequest<Request>();
const response = ctx.getResponse<Response>();
```

类似地，`WsArgumentsHost` 和 `RpcArgumentsHost` 都有返回 WebSockets 和 microservices 上下文中适当对象的方法。以下是 `WsArgumentsHost` 的方法：

```typescript
export interface WsArgumentsHost {
  /**
   * Returns the data object.
   */
  getData<T>(): T;
  /**
   * Returns the client object.
   */
  getClient<T>(): T;
}
```

以下是 `RpcArgumentsHost` 的方法：

```typescript
export interface RpcArgumentsHost {
  /**
   * Returns the data object.
   */
  getData<T>(): T;

  /**
   * Returns the context object.
   */
  getContext<T>(): T;
}
```

#### 执行上下文类

`ExecutionContext` 扩展了 `ArgumentsHost`，提供了有关当前执行过程的其他详细信息。与 `ArgumentsHost` 一样，Nest 在您可能需要的地方提供了 `ExecutionContext` 的实例，例如 [警卫](/guards#execution-context) 的 `canActivate()` 方法和 [截击机](/interceptors#execution-context) 的 `intercept()` 方法。它提供以下方法：

```typescript
export interface ExecutionContext extends ArgumentsHost {
  /**
   * Returns the type of the controller class which the current handler belongs to.
   */
  getClass<T>(): Type<T>;
  /**
   * Returns a reference to the handler (method) that will be invoked next in the
   * request pipeline.
   */
  getHandler(): Function;
}
```

这个 `getHandler()` 方法返回对将要调用的处理程序的引用。这个 `getClass()` 方法返回此处理程序所属的控制器类的类型。例如，在 HTTP 上下文，如果当前处理的请求是 `POST` 绑定到 `create()` 方法上 `CatsController`,`getHandler()` 返回对 `create()` 方法，以及 `getClass()` 返回 `CatsController`**类**（不是实例）。

```typescript
const methodKey = ctx.getHandler().name; // "create"
const className = ctx.getClass().name; // "CatsController"
```

对当前类和处理程序方法的访问提供了很大的灵活性。最重要的是，它允许您从守卫或拦截器内部读取装饰器设置的元数据 `Reflector#createDecorator` 或通过内置 `@SetMetadata()` 装修师。以下部分介绍了这个用例。

#### 反射和元数据

Nest 允许您将**自定义元数据**附加到使用 `Reflector#createDecorator` 方法，或使用内置的 `@SetMetadata()` 装修师。本节比较了这两种方法，并展示了如何从 guard 或 interceptor 中访问元数据。

创建强类型装饰器 `Reflector#createDecorator`，指定类型参数。例如，让我们创建一个 `Roles` 将字符串数组作为参数的装饰器。

```ts
import { Reflector } from '@nestjs/core';

export const Roles = Reflector.createDecorator<string[]>();
```

这个 `Roles` 这里的 decorator 是一个函数，它接受类型为 `string[]`.

若要使用此装饰器，请使用它注释处理程序：

```typescript
@Post()
@Roles(['admin'])
async create(@Body() createCatDto: CreateCatDto) {
  this.catsService.create(createCatDto);
}
```

这附加了 `Roles` 装饰器元数据到 `create()` 方法，指示只有具有 `admin` 应允许角色访问此路由。

要访问路由的角色（自定义元数据），请使用 `Reflector` 又是帮手课。`Reflector` 可以以正常方式注入到类中：

```typescript
@Injectable()
export class RolesGuard {
  constructor(private reflector: Reflector) {}
}
```

> info **Hint** 这个 `Reflector` 类是从 `@nestjs/core` 包装。

现在，要读取处理程序元数据，请使用 `get()` 方法：

```typescript
const roles = this.reflector.get(Roles, context.getHandler());
```

这个 `Reflector#get` 方法接受两个参数：一个装饰器引用和一个**上下文**（装饰器目标）来检索元数据。在本例中，指定的**decorator**是 `Roles`（见 `roles.decorator.ts` 上面的文件）。上下文由调用提供 `context.getHandler()`，它提取当前处理的路由处理程序的元数据。记住，`getHandler()` 为您提供对路由处理程序函数的**引用**。

或者，您可以在控制器级别应用元数据，以便它应用于控制器类中的所有路由。

```typescript
@Roles(['admin'])
@Controller('cats')
export class CatsController {}
```

在这种情况下，要提取控制器元数据，请将 `context.getClass()` 作为第二个参数（以提供控制器类作为元数据提取的上下文）而不是 `context.getHandler()`：

```typescript
const roles = this.reflector.get(Roles, context.getClass());
```

由于元数据可以在多个级别提供，因此您可能需要从多个上下文中提取和合并元数据。这个 `Reflector` 类为此提供了两个实用方法。它们同时提取**两个**控制器和方法元数据，并以不同的方式组合它们。

考虑以下场景，您已经提供了 `Roles` 两个级别的元数据。

```typescript
@Roles(['user'])
@Controller('cats')
export class CatsController {
  @Post()
  @Roles(['admin'])
  async create(@Body() createCatDto: CreateCatDto) {
    this.catsService.create(createCatDto);
  }
}
```

如果您的意图是指定 `'user'` 作为默认角色并选择性地覆盖某些方法，请使用 `getAllAndOverride()` 方法。它返回第一个定义的值，按照传递目标的顺序检查目标：

```typescript
const roles = this.reflector.getAllAndOverride(Roles, [context.getHandler(), context.getClass()]);
```

带有此代码的守卫，在带有上面元数据的 `create()` 方法的上下文中运行，会导致包含 `['admin']` 的 `roles`。

若要从两个级别获取元数据并将其合并（此方法同时合并数组和对象），请使用 `getAllAndMerge()` 方法：

```typescript
const roles = this.reflector.getAllAndMerge(Roles, [context.getHandler(), context.getClass()]);
```

这导致 `roles` 含有 `['admin', 'user']`（值按目标的顺序连接）。

对于这两种方法，传递装饰器引用（或元数据键）作为第一个参数传递，以及元数据目标上下文数组（即，对 `getHandler()` 和/或 `getClass()` 方法）作为第二个参数。

#### 低层次方法

如前所述，而不是使用 `Reflector#createDecorator`，可以使用内置的 `@SetMetadata()` 将元数据附加到处理程序的装饰器。

```typescript
@Post()
@SetMetadata('roles', ['admin'])
async create(@Body() createCatDto: CreateCatDto) {
  this.catsService.create(createCatDto);
}
```

> info **Hint** 这个 `@SetMetadata()` 装饰器是从 `@nestjs/common` 包装。

上面的结构附加了 `roles` 元数据（`roles` 是元数据键，并且 `['admin']` 是关联值）到 `create()` 方法。虽然这是可行的，但这不是一个好的做法 `@SetMetadata()` 直接在你的路线上。相反，创建您自己的装饰器，如下所示：

```typescript
import { SetMetadata } from '@nestjs/common';

export const Roles = (...roles: string[]) => SetMetadata('roles', roles);
```

这种方法更干净、更易读，类似于 `Reflector#createDecorator` 方法。不同的是 `@SetMetadata()` 您可以更好地控制元数据键和值，并且可以创建接受多个参数的装饰器。

定制 `@Roles()` 装饰器到位，你可以用它来装饰 `create()` 方法。

```typescript
@Post()
@Roles('admin')
async create(@Body() createCatDto: CreateCatDto) {
  this.catsService.create(createCatDto);
}
```

要访问路由的角色（自定义元数据），请使用 `Reflector` 再次助手类：

```typescript
@Injectable()
export class RolesGuard {
  constructor(private reflector: Reflector) {}
}
```

> info **Hint** 这个 `Reflector` 类是从 `@nestjs/core` 包装。

现在，要读取处理程序元数据，请使用 `get()` 方法。

```typescript
const roles = this.reflector.get<string[]>('roles', context.getHandler());
```

在这里，您传递的不是装饰器引用，而是元数据**key**（在本例中，`'roles'`）作为第一个参数。其他一切都保持不变 `Reflector#createDecorator` 例子。
