# Exception filters

Source: https://docs.nestjs.com/exception-filters

Nest 带有一个内置的**异常层**，可以处理整个应用程序中所有未处理的异常。当您的应用程序代码不处理异常时，该层会捕获它并自动发送适当的、用户友好的响应。

<figure>
  <img class="illustrative-image" src="https://docs.nestjs.com/assets/Filter_1.png" />
</figure>

开箱即用，这是通过内置的**全局异常筛选器**完成的，它处理类型的异常 `HttpException`（及其子类）。当异常是**未识别**时（它既不是 `HttpException` 也不是从 `HttpException`)，内置异常筛选器生成以下默认值 JSON 回应：

```json
{
  "statusCode": 500,
  "message": "Internal server error"
}
```

> info **Hint** 全局异常筛选器部分支持 `http-errors` 图书馆。抛出的错误携带 `statusCode` 和 `message` 库生成的形状中的属性与这些值一起返回，而不是默认值 `InternalServerErrorException` 对未识别异常的响应。从 NestJSv12.2，如果错误是 `expose` 属性是 `false`，响应携带其状态代码的标准原因短语（例如，`Bad Gateway`）而不是错误信息。`http-errors` 集合 `expose` 二 `false` 对于 500 及以上的状态代码，请通过 `expose: true` 二 `createError()` 当 5xx 错误消息是发送给客户端时。

#### 引发标准异常

Nest 提供内置 `HttpException` 类，从 `@nestjs/common` 包装。对于典型 HTTP-基于 REST 和 GraphQLAPI，发送标准是最佳实践 HTTP 发生某些错误条件时的响应对象。

例如，`CatsController` 有一个 `findAll()` 方法（a`GET` 路由处理程序）。让我们假设这个路由处理程序抛出一个异常。为了演示这一点，我们将硬编码如下：

```typescript
@Get()
async findAll() {
  throw new HttpException('Forbidden', HttpStatus.FORBIDDEN);
}
```

> info **Hint** `HttpStatus` 是从 `@nestjs/common` 包装。

当客户端调用此端点时，响应如下所示：

```json
{
  "statusCode": 403,
  "message": "Forbidden"
}
```

这个 `HttpException` 构造函数接受两个确定响应的必需参数：

- 这个 `response` 参数定义 JSON 响应体。它可以是一个 `string` 或者一个 `object`，如下所述。
- `status` 参数定义 [HTTP 状态代码](https://developer.mozilla.org/en-US/docs/Web/HTTP/Status)。

默认情况下，JSON 响应体包含两个属性：

- `statusCode`：默认值为 HTTP 提供的状态代码 `status` 论点
- `message`：简要描述 HTTP 错误基于 `status`

仅覆盖消息部分 JSON 响应体，在 `response` 论点。覆盖整个 JSON 响应体，将对象传递到 `response` 论点。Nest 序列化对象并将其作为 JSON 响应体。

> info **Hint** 安 `Error` 实例作为 `response` 参数未序列化到响应正文中。Nest 发送默认值 `{ statusCode, message }` 状态的 body，因此错误的属性不会暴露给客户端。若要保留日志记录的原始错误，请将其作为 `cause` 反而。

第二个构造函数参数 `status` 应该是有效的 HTTP 状态代码。最佳实践是使用从 `@nestjs/common` 导入的 `HttpStatus` 枚举。

可选的**third**构造函数参数 `options` 可用于提供错误 [原因](https://nodejs.org/en/blog/release/v16.9.0/#error-cause)。`cause` 对象不会序列化到响应对象中，但它对于日志记录很有用，因为它提供了有关导致 `HttpException` 被抛出的内部错误的信息。

下面是一个覆盖整个响应主体并提供错误原因的示例：

```typescript
@Get()
async findAll() {
  try {
    await this.service.findAll();
  } catch (error) {
    throw new HttpException({
      status: HttpStatus.FORBIDDEN,
      error: 'This is a custom message',
    }, HttpStatus.FORBIDDEN, {
      cause: error
    });
  }
}
```

响应如下所示：

```json
{
  "status": 403,
  "error": "This is a custom message"
}
```

#### 异常记录

默认情况下，异常筛选器不记录内置异常，例如 `HttpException`（以及从它继承的任何例外）。这些异常被视为正常应用程序流的一部分，因此它们不会出现在控制台中。这同样适用于 `WsException` 和 `RpcException` 在各自的背景下。

`HttpException` 继承自 `IntrinsicException` 类，从 `@nestjs/common` 包装。内置异常筛选器从不记录 `IntrinsicException` 这就是他们如何区分属于正常操作的异常和不属于正常操作的异常。

若要记录这些异常，请创建自定义异常筛选器，如 [Exception filters](#exception-filters) 下面的部分。

#### 生产中的跟踪误差

异常过滤器决定*客户端*看到的内容。它本身并没有告诉你 `TypeError` 开始射击 `OrdersService`12 分钟前，在 4%的结账时，只适用于购物车中有折扣商品的顾客。也不会告诉你是哪一条线扔的。

通常的方法是记录堆栈跟踪，然后在以后搜索它，这是不够的：日志文件中的堆栈跟踪指向编译输出（`/var/app/current/dist/orders/orders.service.js:35`)，不携带源上下文，也不会告诉您这是第一次出现还是第一万次。

[NestJS Observe](https://www.observe.nestjs.com/) 将未处理错误视为一类对象，而不是日志行。到达异常层的每个错误都会与导致该错误的请求一起被捕获，并且：

- **堆栈跟踪附带源代码。**帧通过源映射解析回到 `src/orders/orders.service.ts:35`，周围的行显示为内联，因此您可以在不克隆任何内容的情况下读取错误卡中的故障代码。
- **事件被分组为缺陷。**具有相同类别和堆栈形状的错误会折叠成一个指纹组，其中包含计数、首次出现和最后出现时间戳以及引入它的版本。“自 2.4.1 版以来新增”是您从页面上读到的事实，而不是推断出来的。
- **失败会保留其上下文。**它所属的跟踪、命中它的用户、在该请求期间写入的日志以及在抛出之前运行的跨度都是附加的，因此您可以看到请求失败时正在做什么。

<figure><img src="https://www.observe.nestjs.com/docs/telemetry/error-with-source.webp" alt="Error card with source context" /></figure>

由于错误已经携带了自己的代码，您可以一键将其交给编码代理：**复制代理提示**将错误、带有源代码行的修剪堆栈跟踪、慢跨度和周围日志打包到一个独立的提示中，用于 Claude 代码、光标或任何其他打开存储库的工具。

这补充了本章中描述的过滤器，而不是取代它们：过滤器塑造了响应，而仪器记录了响应过程中发生的事情。看 [Error monitoring](/observability/error-monitoring) 对于一切 SDK 捕获有关故障的信息 [Observability](/observability/overview) 设置章节，以及 [Dashboard](/observability/dashboard#issues) 用于将重复出现的错误转换为跟踪问题，并验证其自身的修复。

#### 自定义例外

在大多数情况下，您不需要编写自定义异常，可以使用内置的 NestHTTP 下一节描述的例外情况。如果确实需要自定义异常，最好创建自己的**异常层次结构**，其中自定义异常从基础继承 `HttpException` 班级。Nest 然后识别您的异常并自动处理错误响应。让我们实现这样一个自定义异常：

```typescript
export class ForbiddenException extends HttpException {
  constructor() {
    super('Forbidden', HttpStatus.FORBIDDEN);
  }
}
```

自从 `ForbiddenException` 扩展底座 `HttpException`，它与内置的异常处理程序一起工作，因此我们可以在 `findAll()` 方法。

```typescript
@Get()
async findAll() {
  throw new ForbiddenException();
}
```

#### 内置的 HTTP 例外情况

Nest 提供了一组从基 `HttpException` 继承的标准异常。它们是从 `@nestjs/common` 包公开的，代表许多最常见的 HTTP 异常：

- `BadRequestException`
- `UnauthorizedException`
- `NotFoundException`
- `ForbiddenException`
- `NotAcceptableException`
- `RequestTimeoutException`
- `ConflictException`
- `GoneException`
- `HttpVersionNotSupportedException`
- `PayloadTooLargeException`
- `UnsupportedMediaTypeException`
- `UnprocessableEntityException`
- `InternalServerErrorException`
- `NotImplementedException`
- `ImATeapotException`
- `MethodNotAllowedException`
- `MisdirectedException`
- `BadGatewayException`
- `ServiceUnavailableException`
- `GatewayTimeoutException`
- `PreconditionFailedException`

所有内置异常也会提供错误 `cause` 以及通过 `options` 参数：

```typescript
throw new BadRequestException('Something bad happened', {
  cause: new Error(),
  description: 'Some error description',
});
```

响应如下所示：

```json
{
  "message": "Something bad happened",
  "error": "Some error description",
  "statusCode": 400
}
```

#### 机器可读错误代码

这个 `status` 和 `message` 异常对人类来说足够好地描述了一个错误，但它们对客户来说很尴尬。几个不同的故障，如无效的电子邮件和弱密码，都可能表现为 `400 Bad Request`，这迫使客户端解析人类可读的消息字符串来区分它们。

为了避免这种情况，请通过 `errorCode` 通过 `options` 参数。它是一个稳定的、机器可读的标识符，序列化到响应体中：

```typescript
throw new BadRequestException('Password is too weak', {
  errorCode: 'WEAK_PASSWORD',
});
```

然后，响应将代码与常用字段一起携带：

```json
{
  "message": "Password is too weak",
  "errorCode": "WEAK_PASSWORD",
  "statusCode": 400
}
```

`errorCode` 是可选的，可以与 `cause` 和 `description` 组合。它也可以在 `HttpException` 本身上使用，因此自定义异常也可以设置它：

```typescript
throw new HttpException(
  'Forbidden',
  HttpStatus.FORBIDDEN,
  { errorCode: 'ACCOUNT_SUSPENDED' },
);
```

> info **Hint** 不像 `cause`，用于日志记录，从不序列化，`errorCode` 是响应体的一部分，旨在由客户端使用。

#### 异常筛选器

内置异常筛选器可自动处理许多情况，但您可能希望**完全控制**异常层，例如，添加日志记录或使用不同的 JSON 基于动态因素的模式。**异常过滤器**正是为此目的而设计的。它们允许您控制执行的确切流程和发送回客户端的响应内容。

让我们创建一个异常筛选器，它捕获作为 `HttpException` 类并为它们实现自定义响应逻辑。为此，我们需要访问底层平台 `Request` 和 `Response` 对象。我们将使用 `Request` 提取原件的对象 `url` 并将其包含在响应中，以及 `Response` 对象直接控制发送的响应，使用 `response.json()` 方法。

```typescript
import { ExceptionFilter, Catch, ArgumentsHost, HttpException } from '@nestjs/common';
import { Request, Response } from 'express';

@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const status = exception.getStatus();

    response
      .status(status)
      .json({
        statusCode: status,
        timestamp: new Date().toISOString(),
        path: request.url,
      });
  }
}
```

> info **Hint** 所有异常筛选器都应实现泛型 `ExceptionFilter<T>` 接口。这要求您提供 `catch(exception: T, host: ArgumentsHost)` 方法及其指示的签名。`T` 指示异常的类型。

> warning **Warning** 如果使用 `@nestjs/platform-fastify`，请使用 `response.send()` 而不是 `response.json()`，并从 `fastify` 导入相应的类型。

这个 `@Catch(HttpException)`decorator 将所需的元数据绑定到异常筛选器，告诉 Nest 这个特定的过滤器正在查找类型的异常 `HttpException` 没有别的。这个 `@Catch()`decorator 接受单个参数或逗号分隔的列表，这允许您一次为几种类型的异常设置过滤器。

#### 参数主机

让我们看看 `catch()` 方法的参数。`exception` 参数是当前正在处理的异常对象。`host` 参数是一个 `ArgumentsHost` 对象，它是一个实用程序，允许您访问传递给原始处理程序的参数，无论它是在什么上下文中调用的。在上面的代码示例中，我们使用它的 helper 方法来获取引发异常的请求的 `Request` 和 `Response` 对象。`ArgumentsHost` 在 [执行上下文章](/fundamentals/execution-context) 中完全涵盖。

这种抽象层次的原因是 `ArgumentsHost` 适用于任何环境：HTTP 这里使用的服务器上下文，还有微服务和 WebSockets。执行上下文一章展示了如何通过同一个对象访问**任何**上下文的<a href="/fundamentals/execution-context#host-handler-arguments">底层参数</a>，这允许您编写一个跨所有异常过滤器。

#### 绑定过滤器

让我们将新的 `HttpExceptionFilter` 绑定到 `CatsController` 的 `create()` 方法。

```typescript
@Post()
@UseFilters(new HttpExceptionFilter())
async create(@Body() createCatDto: CreateCatDto) {
  throw new ForbiddenException();
}
```

> info **Hint** 这个 `@UseFilters()` 装饰器是从 `@nestjs/common` 包装。

喜欢 `@Catch()` 装修工，`@UseFilters()` 接受单个筛选器实例或逗号分隔的筛选器实例列表。在这里，我们创建了 `HttpExceptionFilter` 实例到位。或者，您可以传递类（而不是实例），这将实例化留给框架，并启用**依赖注入**。

```typescript
@Post()
@UseFilters(HttpExceptionFilter)
async create(@Body() createCatDto: CreateCatDto) {
  throw new ForbiddenException();
}
```

> info **Hint** 如果可能的话，最好按类而不是按实例绑定过滤器。这减少了**内存使用**，因为 Nest 可以在整个模块中重用同一类的实例。

在上面的例子中，`HttpExceptionFilter` 仅适用于 `create()` 路由处理程序，这使它具有方法作用域。异常筛选器可以在不同级别作用域：方法作用域（控制器、解析器或网关的方法）、控制器作用域或全局作用域。例如，要设置控制器范围过滤器，请执行以下操作：

```typescript
@Controller()
@UseFilters(new HttpExceptionFilter())
export class CatsController {}
```

这将为 `CatsController` 中定义的每个路由处理程序设置 `HttpExceptionFilter`。

要创建全局作用域筛选器，请执行以下操作：

```typescript
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalFilters(new HttpExceptionFilter());
  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
```

> warning **Warning** 这个 `useGlobalFilters()` 方法不为网关或混合应用程序设置过滤器。

全局范围的过滤器用于整个应用程序，用于每个控制器和每个路由处理程序。在依赖注入方面，从任何模块外部注册的全局过滤器（具有 `useGlobalFilters()`（如上面的示例）不能注入依赖项，因为这发生在任何模块的上下文之外。要解决此问题，您可以使用以下结构**直接从任何模块**注册全局作用域筛选器：

```typescript
import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';

@Module({
  providers: [
    {
      provide: APP_FILTER,
      useClass: HttpExceptionFilter,
    },
  ],
})
export class AppModule {}
```

> info **Hint** 当您使用这种方法对过滤器执行依赖注入时，无论在哪个模块中使用这种构造，过滤器都是全局的。将其注册到定义过滤器（上面示例中的 `HttpExceptionFilter`）的模块中。此外，`useClass` 不是注册自定义提供者的唯一方法。了解有关 [定制提供者](/fundamentals/custom-providers) 的更多信息。

> info **Hint** 从 [中间件](/middleware#error-handling) 抛出的异常也由异常层处理。由于中间件在选择路由处理程序之前运行，因此仅应用**全局**异常筛选器（`app.useGlobalFilters()` 或 `APP_FILTER`）。方法作用域和控制器作用域 `@UseFilters()` 绑定不会被调用。

您可以使用此技术注册任意数量的筛选器，方法是将每个筛选器添加到 `providers` 阵列。

#### 抓住一切

要捕获**每个**未处理的异常，无论其类型如何，请将 `@Catch()` 装饰器的参数列表保留为空，即 `@Catch()`。

下面的示例与平台无关：它通过 [HTTP 适配器](./faq/http-adapter) 传递响应，而不是直接使用特定于平台的 `Request` 和 `Response` 对象，因此相同的过滤器适用于 Express 和 Fastify。

```typescript
import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';

@Catch()
export class CatchEverythingFilter implements ExceptionFilter {
  constructor(private readonly httpAdapterHost: HttpAdapterHost) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    // In certain situations `httpAdapter` might not be available in the
    // constructor, so resolve it here.
    const { httpAdapter } = this.httpAdapterHost;

    const ctx = host.switchToHttp();

    const httpStatus =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const responseBody = {
      statusCode: httpStatus,
      timestamp: new Date().toISOString(),
      path: httpAdapter.getRequestUrl(ctx.getRequest()),
    };

    httpAdapter.reply(ctx.getResponse(), responseBody, httpStatus);
  }
}
```

> warning **Warning** 当将 catch-everything 过滤器与绑定到特定异常类型的过滤器组合时，请**首先**声明 catch-everything 过滤器，以便更具体的过滤器仍然可以处理它绑定到的类型。

#### 遗产

通常，您将根据应用程序的要求创建完全定制的异常筛选器。但是，在某些情况下，您可能希望扩展内置的**全局异常筛选器**，并仅在特定条件下覆盖其行为。

若要将异常处理委托给基本筛选器，请展开 `BaseExceptionFilter` 并调用继承的 `catch()` 方法。

```typescript
import { Catch, ArgumentsHost } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';

@Catch()
export class AllExceptionsFilter extends BaseExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    super.catch(exception, host);
  }
}
```

> warning **Warning** 扩展 `BaseExceptionFilter` 的方法作用域和控制器作用域过滤器不应使用 `new` 实例化。相反，让框架自动实例化它们。

全局过滤器**可以**以两种方式之一扩展基本过滤器。

首先是通过 `HttpAdapter` 实例化自定义全局筛选器时对构造函数的引用：

```typescript
async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const { httpAdapter } = app.get(HttpAdapterHost);
  app.useGlobalFilters(new AllExceptionsFilter(httpAdapter));

  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
```

第二种方法是将过滤器注册到 `APP_FILTER` 令牌，<a href="exception-filters#binding-filters">如前所述</a>。
