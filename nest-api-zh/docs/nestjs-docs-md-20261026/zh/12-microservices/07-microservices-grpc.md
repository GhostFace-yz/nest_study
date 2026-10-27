# gRPC

Source: https://docs.nestjs.com/microservices/grpc

[gRPC](https://github.com/grpc/grpc-node) 是一个现代的、开源的、高性能的 RPC 可以在任何环境中运行的框架。它连接数据中心内部和数据中心之间的服务，支持负载平衡、跟踪、运行状况检查和身份验证。

像许多人一样 RPC 系统，gRPC 是基于根据可以远程调用的函数（方法）来定义服务。对于每个方法，您可以定义参数和返回类型。中定义了服务、参数和返回类型 `.proto` 使用 Google 开源、语言中立的文件 <a href="https://protobuf.dev">协议缓冲区</a>机制。

与 gRPC 运输机，Nest 使用 `.proto` 文件动态绑定客户端和服务器，这使得远程过程调用可以简单地实现，并自动序列化和反序列化结构化数据。

#### 安装

开始建造 gRPC-基于微服务，首先安装所需的软件包：

```bash
$ npm i --save @grpc/grpc-js @grpc/proto-loader
```

#### 概述

和其他 Nest 微服务传输层实现，您可以选择 gRPC 使用 `transport`options 对象的属性传递给 `createMicroservice()` 方法。在下面的示例中，我们将设置一个英雄服务。这个 `options` 属性提供关于该服务的元数据；其特性描述于 [Options](/microservices/grpc#options) 以下。

```typescript
const app = await NestFactory.createMicroservice<MicroserviceOptions>(AppModule, {
  transport: Transport.GRPC,
  options: {
    package: 'hero',
    protoPath: join(import.meta.dirname, 'hero/hero.proto'),
  },
});
```

> info **Hint** 这个 `join()` 函数是从 `path` 包，以及 `Transport` 枚举来自 `@nestjs/microservices` 包装。

在 `nest-cli.json` 文件，添加 `assets` 物业分配非 TypeScript 文件，以及 `watchAssets` 观看所有非-TypeScript 资产。在这种情况下，我们希望 `.proto` 要复制到 `dist` 自动文件夹。

```json
{
  "compilerOptions": {
    "assets": ["**/*.proto"],
    "watchAssets": true
  }
}
```

#### 选项

<strong>gRPC</strong> transporter options 对象公开以下属性。

<table>
  <tr>
    <td><code>package</code></td>
    <td>Protobuf package name (matches the <code>package</code> setting in the <code>.proto</code> file). Also accepts an array of package names. Required</td>
  </tr>
  <tr>
    <td><code>protoPath</code></td>
    <td>
      Absolute (or relative to the current working directory) path to the
      <code>.proto</code> file, or an array of paths. Required unless you pass a preloaded <code>packageDefinition</code> instead
    </td>
  </tr>
  <tr>
    <td><code>url</code></td>
    <td>Connection URL. A string in the format <code>ip address/dns name:port</code> (e.g., <code>'0.0.0.0:50051'</code> for a Docker server) that defines the address and port on which the transporter establishes a connection. Optional. Defaults to <code>'localhost:5000'</code></td>
  </tr>
  <tr>
    <td><code>protoLoader</code></td>
    <td>NPM package name for the utility to load <code>.proto</code> files. Optional. Defaults to <code>'@grpc/proto-loader'</code></td>
  </tr>
  <tr>
    <td><code>loader</code></td>
    <td>
      <code>@grpc/proto-loader</code> options, which control how <code>.proto</code> files are loaded. Optional. See the
      <a
        href="https://github.com/grpc/grpc-node/blob/master/packages/proto-loader/README.md"
        rel="nofollow"
        target="_blank"
        >proto-loader README</a
      > for details
    </td>
  </tr>
  <tr>
    <td><code>credentials</code></td>
    <td>
      Server credentials (channel credentials when used by a client). Optional. Defaults to insecure credentials. See the <a
        href="https://grpc.io/grpc/node/grpc.ServerCredentials.html"
        rel="nofollow"
        target="_blank"
        ><code>ServerCredentials</code> reference</a
      >
    </td>
  </tr>
</table>

#### 样品 gRPC 服务

让我们定义一个名为 `HeroesService` 的示例 gRPC 服务。在上面的 `options` 对象中，`protoPath` 属性设置 `hero.proto` 定义文件的路径。`hero.proto` 文件使用<a href="https://developers.google.com/protocol-buffers">协议缓冲区</a>进行结构化：

```typescript
// hero/hero.proto
syntax = "proto3";

package hero;

service HeroesService {
  rpc FindOne (HeroById) returns (Hero) {}
}

message HeroById {
  int32 id = 1;
}

message Hero {
  int32 id = 1;
  string name = 2;
}
```

`HeroesService` 暴露 `FindOne()` 方法。此方法期望输入参数类型为 `HeroById` 并返回一个 `Hero` 消息（协议缓冲区使用 `message` 元素来定义参数类型和返回类型）。

接下来，实现服务。若要定义满足此定义的处理程序，请使用 `@GrpcMethod()` 控制器中的装饰器，如下所示。此装饰器提供将方法声明为 gRPC 服务方式。

> info **Hint** 这个 `@MessagePattern()` 装饰器（参见 [request-response](/microservices/basics#request-response) 在前面的微服务章节中介绍的）不与 gRPC-基于微服务。这个 `@GrpcMethod()` 装饰师取而代之。

```typescript
@Controller()
export class HeroesController {
  @GrpcMethod('HeroesService', 'FindOne')
  findOne(data: HeroById, metadata: Metadata, call: ServerUnaryCall<any, any>): Hero {
    const items = [
      { id: 1, name: 'John' },
      { id: 2, name: 'Doe' },
    ];
    return items.find(({ id }) => id === data.id);
  }
}
```

> info **Hint** 这个 `@GrpcMethod()` 装饰器是从 `@nestjs/microservices` 包，而 `Metadata` 和 `ServerUnaryCall` 是从 `@grpc/grpc-js` 包装。

装修师有两个论点。第一个是服务名称（例如，`'HeroesService'`），对应于 `hero.proto` 中的 `HeroesService` 服务定义。第二个（字符串 `'FindOne'`）对应于 `hero.proto` 中的 `HeroesService` 中定义的 `FindOne()`rpc 方法。

这个 `findOne()` 处理程序方法接受三个参数：`data` 从呼叫者那里传递 `metadata` 存储 gRPC 请求元数据，以及 `call` 对象，它公开成员，例如 `sendMetadata()` 用于向客户端发送元数据。

两个 `@GrpcMethod()` 装饰参数是可选的。如果省略第二个参数（例如，`'FindOne'`),Nest 将处理程序与 `.proto`rpc 方法，其名称与其首个大写字母相匹配（例如，`findOne` 处理程序与 `FindOne`rpc 定义），如下所示。

```typescript
@Controller()
export class HeroesController {
  @GrpcMethod('HeroesService')
  findOne(data: HeroById, metadata: Metadata, call: ServerUnaryCall<any, any>): Hero {
    const items = [
      { id: 1, name: 'John' },
      { id: 2, name: 'Doe' },
    ];
    return items.find(({ id }) => id === data.id);
  }
}
```

您也可以省略第一个 `@GrpcMethod()` 论点。在这种情况下，Nest 将处理程序与中的服务定义相关联 `.proto` 基于定义处理程序的**类**名称的文件。例如，在下面的代码中，`HeroesService` 类将其处理程序方法与 `HeroesService` 服务定义 `hero.proto` 因为名字匹配。

```typescript
@Controller()
export class HeroesService {
  @GrpcMethod()
  findOne(data: HeroById, metadata: Metadata, call: ServerUnaryCall<any, any>): Hero {
    const items = [
      { id: 1, name: 'John' },
      { id: 2, name: 'Doe' },
    ];
    return items.find(({ id }) => id === data.id);
  }
}
```

#### 客户

Nest 应用程序可以充当 gRPC 客户，使用中定义的服务 `.proto` 文件。您可以通过以下方式访问远程服务 `ClientGrpc` 对象，您可以通过几种方式获得它。

首选技术是导入 `ClientsModule`。使用其 `register()` 方法将 `.proto` 文件中定义的服务包绑定到注入令牌，并配置服务。`name` 属性是注入令牌。对于 gRPC 服务，请使用 `transport: Transport.GRPC`。`options` 属性是具有与上面 [Options](/microservices/grpc#options) 中描述的相同属性的对象。

```typescript
imports: [
  ClientsModule.register([
    {
      name: 'HERO_PACKAGE',
      transport: Transport.GRPC,
      options: {
        package: 'hero',
        protoPath: join(import.meta.dirname, 'hero/hero.proto'),
      },
    },
  ]),
];
```

> info **Hint** 这个 `register()` 方法获取对象数组。若要注册多个包，请提供以逗号分隔的注册对象列表。

注册后，用 `@Inject()` 注入已配置的 `ClientGrpc` 对象。然后使用 `ClientGrpc` 对象的 `getService()` 方法检索服务实例，如下所示。

```typescript
@Injectable()
export class AppService implements OnModuleInit {
  private heroesService: HeroesService;

  constructor(@Inject('HERO_PACKAGE') private client: ClientGrpc) {}

  onModuleInit() {
    this.heroesService = this.client.getService<HeroesService>('HeroesService');
  }

  getHero(): Observable<string> {
    return this.heroesService.findOne({ id: 1 });
  }
}
```

> info 错误**警告**gRPC 客户端不发送包含下划线的字段（`_`）以他们的名义，除非 `keepCase` 选项设置为 `true` 在原型加载程序配置中（`options.loader.keepCase` 在微服务传输器配置中）。

这与其他微服务传输器使用的技术略有不同。而不是 `ClientProxy` 类，您使用 `ClientGrpc` 类，它提供 `getService()` 方法。通用 `getService()` 方法将服务名称作为参数并返回其实例（如果可用）。

或者，您可以使用 `@Client()` 装饰器实例化 `ClientGrpc` 对象，如下：

```typescript
@Injectable()
export class AppService implements OnModuleInit {
  @Client({
    transport: Transport.GRPC,
    options: {
      package: 'hero',
      protoPath: join(import.meta.dirname, 'hero/hero.proto'),
    },
  })
  client: ClientGrpc;

  private heroesService: HeroesService;

  onModuleInit() {
    this.heroesService = this.client.getService<HeroesService>('HeroesService');
  }

  getHero(): Observable<string> {
    return this.heroesService.findOne({ id: 1 });
  }
}
```

最后，对于更复杂的场景，您可以使用 `ClientProxyFactory` 类注入动态配置的客户端，如 [微服务概述的客户端部分](/microservices/basics#client-producer-class) 中所述。

在每种情况下，您最终都会引用 `HeroesService` 代理对象，它公开在 `.proto` 文件。当您调用这个代理对象时（即，`heroesService`),gRPC 序列化请求，将其转发到远程系统，返回响应，并反序列化响应。因为 gRPC 保护您免受这些网络通信细节的影响，`heroesService` 看起来和行为都像本地提供者。

所有的服务方式都是**下骆驼壳**，遵循语言的自然惯例。例如，当 `HeroesService` 中的定义 `.proto` 文件包含 `FindOne()` 功能，`heroesService` 实例提供 `findOne()` 方法。

```typescript
interface HeroesService {
  findOne(data: { id: number }): Observable<any>;
}
```

处理程序还可以返回一个 `Observable`，在这种情况下，输出结果值直到流完成。

```typescript
@Get()
call(): Observable<any> {
  return this.heroesService.findOne({ id: 1 });
}
```

二送 gRPC 元数据与请求一起传递第二个参数，如下所示：

```typescript
call(): Observable<any> {
  const metadata = new Metadata();
  metadata.add('Set-Cookie', 'yummy_cookie=choco');

  return this.heroesService.findOne({ id: 1 }, metadata);
}
```

> info **Hint** 这个 `Metadata` 类是从 `@grpc/grpc-js` 包装。

这需要更新 `HeroesService` 前面定义的接口接受第二个参数。

#### 异常处理

gRPC 处理程序可以抛出 `RpcException`，而是一个普通的 `RpcException` 不携带 gRPC 状态代码，以便客户端接收 `UNKNOWN` 每一次失败。从 NestJSv12，`@nestjs/microservices` 包裹船专用 gRPC 例外情况和 `GrpcExceptionFilter` 这将它们映射到适当的 gRPC 错误对象。

从处理程序中抛出一个特定于状态的异常：

```typescript
import { GrpcAlreadyExistsException } from '@nestjs/microservices';

@GrpcMethod('HeroesService')
create(data: Hero): Hero {
  if (this.heroes.has(data.id)) {
    throw new GrpcAlreadyExistsException('Hero already exists');
  }
  return this.heroes.add(data);
}
```

然后注册过滤器，以便将这些异常序列化为 gRPC 错误：

```typescript
import { GrpcExceptionFilter } from '@nestjs/microservices';

const app = await NestFactory.createMicroservice<MicroserviceOptions>(AppModule, {
  transport: Transport.GRPC,
  options: {
    package: 'hero',
    protoPath: join(import.meta.dirname, 'hero/hero.proto'),
  },
});
app.useGlobalFilters(new GrpcExceptionFilter());
```

过滤器就位后，客户端接收的是 `ALREADY_EXISTS`，而不是 `UNKNOWN`。

您也可以使用通用 `GrpcException` 并显式传递状态：

```typescript
import { GrpcException, GrpcStatus } from '@nestjs/microservices';

throw new GrpcException('Rate limit exceeded', GrpcStatus.RESOURCE_EXHAUSTED);
```

以下特定于状态的异常类可用。每个对应于 `GrpcStatus` 枚举：

<table>
  <tr>
    <td><code>GrpcCancelledException</code></td>
    <td><code>GrpcUnknownException</code></td>
    <td><code>GrpcInvalidArgumentException</code></td>
    <td><code>GrpcDeadlineExceededException</code></td>
  </tr>
  <tr>
    <td><code>GrpcNotFoundException</code></td>
    <td><code>GrpcAlreadyExistsException</code></td>
    <td><code>GrpcPermissionDeniedException</code></td>
    <td><code>GrpcResourceExhaustedException</code></td>
  </tr>
  <tr>
    <td><code>GrpcFailedPreconditionException</code></td>
    <td><code>GrpcAbortedException</code></td>
    <td><code>GrpcOutOfRangeException</code></td>
    <td><code>GrpcUnimplementedException</code></td>
  </tr>
  <tr>
    <td><code>GrpcInternalException</code></td>
    <td><code>GrpcUnavailableException</code></td>
    <td><code>GrpcDataLossException</code></td>
    <td><code>GrpcUnauthenticatedException</code></td>
  </tr>
</table>

> info **Hint** `GrpcExceptionFilter` 也处理 `RpcException`.如果错误对象传递给 `RpcException` 构造函数携带一个数字 `code` 或者 `status` 属性，该值用作 gRPC 状况；否则，错误报告为 `UNKNOWN`.任何其他异常报告为 `UNKNOWN` 带有通用信息。

#### 例子

工作示例可在 [gRPC 样品](https://github.com/nestjs/nest/tree/master/sample/04-grpc) 的 NestJS 仓库。

#### gRPC 反射

[gRPC Server Reflection Specification](https://grpc.io/docs/guides/reflection/#overview) 是一个标准，允许 gRPC 客户端请求有关服务器公开的 API 的详细信息，类似于公开 RESTAPI 的 OpenAPI 文档。这使得使用 grpc-ui 或 Postman 等调试工具变得更加容易。

添加 gRPC 反射支持到您的服务器，首先安装实现包：

```bash
$ npm i --save @grpc/reflection
```

然后把它钩到 gRPC 服务器使用 `onLoadPackageDefinition` 钩住你的 gRPC 服务器选项，如下所示：

```typescript
import { ReflectionService } from '@grpc/reflection';

const app = await NestFactory.createMicroservice<MicroserviceOptions>(AppModule, {
  transport: Transport.GRPC,
  options: {
    package: 'hero',
    protoPath: join(import.meta.dirname, 'hero/hero.proto'),
    onLoadPackageDefinition: (pkg, server) => {
      new ReflectionService(pkg).addToServer(server);
    },
  },
});
```

您的服务器现在响应反射请求 API 细节。

#### gRPC 流动

gRPC 支持长寿命连接，通常称为 `streams`。流对于聊天、观察或分块数据传输等情况非常有用。有关详细信息，请参见 [gRPC 核心概念指南](https://grpc.io/docs/guides/concepts/)。

Nest 支架 gRPC 流处理程序有两种方式：

- RxJS`Subject`+`Observable` 处理程序：可用于直接在控制器方法中编写响应，或将响应传递给 `Subject`/`Observable` 消费者
- 纯的 gRPC 调用流处理程序：用于将调用传递给执行器，该执行器处理标准调度的其余部分 Node.js`Duplex` 溪流

#### 流式样品

让我们定义一个名为 `HelloService` 的新示例 gRPC 服务。`hello.proto` 文件使用<a href="https://developers.google.com/protocol-buffers">协议缓冲区</a>进行结构化：

```typescript
// hello/hello.proto
syntax = "proto3";

package hello;

service HelloService {
  rpc BidiHello(stream HelloRequest) returns (stream HelloResponse);
  rpc LotsOfGreetings(stream HelloRequest) returns (HelloResponse);
}

message HelloRequest {
  string greeting = 1;
}

message HelloResponse {
  string reply = 1;
}
```

> info **Hint** `LotsOfGreetings` 传输请求，但返回单个响应。因为它的请求是流式的，所以不能用 `@GrpcMethod()` 来实现；使用 `@GrpcStreamMethod()`（返回的 `Observable` 发出的最后一个值作为响应发送）或 `@GrpcStreamCall()`（通过回调响应），两者都如下所示。

基于此 `.proto` 文件，定义 `HelloService` 接口：

```typescript
interface HelloService {
  bidiHello(upstream: Observable<HelloRequest>): Observable<HelloResponse>;
  lotsOfGreetings(
    upstream: Observable<HelloRequest>,
  ): Observable<HelloResponse>;
}

interface HelloRequest {
  greeting: string;
}

interface HelloResponse {
  reply: string;
}
```

> info **Hint** 原型接口可以由 [ts-proto](https://github.com/stephenh/ts-proto) 包装。参见 [ts-proto NestJS guide](https://github.com/stephenh/ts-proto/blob/main/NESTJS.markdown) 了解更多。

#### 主题策略

这个 `@GrpcStreamMethod()`decorator 将函数参数提供为 RxJS`Observable`，因此处理程序可以接收和处理多个消息。

```typescript
@GrpcStreamMethod()
bidiHello(messages: Observable<any>, metadata: Metadata, call: ServerDuplexStream<any, any>): Observable<any> {
  const subject = new Subject();

  const onNext = message => {
    console.log(message);
    subject.next({
      reply: 'Hello, world!'
    });
  };
  const onComplete = () => subject.complete();
  messages.subscribe({
    next: onNext,
    complete: onComplete,
  });

  return subject.asObservable();
}
```

> warning **Warning** 为了支持与 `@GrpcStreamMethod()` 装饰器的全双工交互，控制器方法必须返回一个 RxJS`Observable`。

> info **Hint** 这个 `Metadata` 班级和 `ServerDuplexStream` 接口是从 `@grpc/grpc-js` 包装。

根据 `.proto` 文件中的服务定义，`BidiHello` 方法将请求流传输到服务。要从客户端向流发送多个异步消息，请使用 RxJS`ReplaySubject`。

```typescript
const helloService = this.client.getService<HelloService>('HelloService');
const helloRequest$ = new ReplaySubject<HelloRequest>();

helloRequest$.next({ greeting: 'Hello (1)!' });
helloRequest$.next({ greeting: 'Hello (2)!' });
helloRequest$.complete();

return helloService.bidiHello(helloRequest$);
```

在上面的示例中，我们向流（`next()` 调用）并通知服务我们已完成发送数据（`complete()` 呼叫）。

#### 呼叫流处理程序

当方法的响应定义为 `stream` 时，`@GrpcStreamCall()` 装饰器将函数参数提供为 `grpc.ServerDuplexStream`，它支持标准方法，如 `.on('data', callback)`、`.write(message)` 和 `.end()`。有关方法的完整列表，请参见 [gRPC Node.js API reference](https://grpc.github.io/grpc/node/grpc-ClientDuplexStream.html)。

当方法的响应不是 `stream` 时，`@GrpcStreamCall()` 装饰器提供两个函数参数：`grpc.ServerReadableStream`（参见 [`ServerReadableStream` reference](https://grpc.github.io/grpc/node/grpc-ServerReadableStream.html)）和 `callback`。

让我们从实现开始 `BidiHello`，支持全双工交互。

```typescript
@GrpcStreamCall()
bidiHello(requestStream: any) {
  requestStream.on('data', message => {
    console.log(message);
    requestStream.write({
      reply: 'Hello, world!'
    });
  });
}
```

> info **Hint** 这个装饰器不需要处理程序返回任何东西。您可以像处理任何其他标准流一样处理流。

在上面的示例中，我们使用了 `write()` 方法将对象写入响应流。回调传递给 `.on()` 方法作为第二个参数，每次服务接收到新的数据块时都会被调用。

接下来，实现 `LotsOfGreetings` 方法。

```typescript
@GrpcStreamCall()
lotsOfGreetings(requestStream: any, callback: (err: unknown, value: HelloResponse) => void) {
  requestStream.on('data', message => {
    console.log(message);
  });
  requestStream.on('end', () => callback(null, { reply: 'Hello, world!' }));
}
```

这里，`callback` 函数发送响应 `requestStream` 已经完全处理了。

#### 健康检查

当你运行一个 gRPC 在编排器中的应用，例如 Kubernetes 编排器需要知道应用程序是否正在运行且健康。这个 [gRPC Health Check specification](https://grpc.io/docs/guides/health-checking/) 是一个允许 gRPC 服务器会公开其运行状况，以便编排器可以采取相应的行动。

添加 gRPC 健康检查支持，首先安装 [grpc-health-check](https://github.com/grpc/grpc-node/tree/master/packages/grpc-health-check) 包装：

```bash
$ npm i --save grpc-health-check
```

然后把它钩到 gRPC 服务使用 `onLoadPackageDefinition` 钩住你的 gRPC 服务器选项，如下。这个 `protoPath` 必须包括健康检查和英雄 `.proto` 文件。

```typescript
import { HealthImplementation, protoPath as healthCheckProtoPath } from 'grpc-health-check';

const app = await NestFactory.createMicroservice<MicroserviceOptions>(AppModule, {
  transport: Transport.GRPC,
  options: {
    package: 'hero',
    protoPath: [
      healthCheckProtoPath,
      join(import.meta.dirname, 'hero/hero.proto'),
    ],
    onLoadPackageDefinition: (pkg, server) => {
      const healthImpl = new HealthImplementation({
        '': 'UNKNOWN',
      });

      healthImpl.addToServer(server);
      healthImpl.setStatus('', 'SERVING');
    },
  },
});
```

> info **Hint** 这个 [gRPC 健康探头](https://github.com/grpc-ecosystem/grpc-health-probe) 是一个 CLI 用于测试 gRPC 容器化环境中的健康检查。

#### gRPC 元数据

元数据是关于特定 RPC 以键值对列表的形式调用，其中键是字符串，值通常是字符串，但可以是二进制数据。元数据对 gRPC 它本身：它允许客户端向服务器提供与调用相关的信息，反之亦然。元数据可以包括认证令牌、用于监视目的的请求标识符和标签，以及诸如数据集中的记录数量之类的数据信息。

读取元数据 `@GrpcMethod()` 处理程序，使用第二个参数（`metadata`），这是类型 `Metadata`（从 `@grpc/grpc-js` 包）。

要从处理程序发送回元数据，请使用 `ServerUnaryCall#sendMetadata()` 方法（在第三个处理程序参数上）。

```typescript
@Controller()
export class HeroesService {
  @GrpcMethod()
  findOne(data: HeroById, metadata: Metadata, call: ServerUnaryCall<any, any>): Hero {
    const serverMetadata = new Metadata();
    const items = [
      { id: 1, name: 'John' },
      { id: 2, name: 'Doe' },
    ];

    serverMetadata.add('Set-Cookie', 'yummy_cookie=choco');
    call.sendMetadata(serverMetadata);

    return items.find(({ id }) => id === data.id);
  }
}
```

同样，要读取带有注释的处理程序中的元数据 `@GrpcStreamMethod()` 装饰器（参见 [Subject strategy](/microservices/grpc#subject-strategy)），使用第二个参数（`metadata`），这是类型 `Metadata`（从 `@grpc/grpc-js` 包）。

要从处理程序发送回元数据，请使用 `ServerDuplexStream#sendMetadata()` 方法（在第三个处理程序参数上）。

从内部读取元数据 [呼叫流处理程序](/microservices/grpc#call-stream-handler)（注释了 `@GrpcStreamCall()` 装饰师），听听 `metadata` 事件 `requestStream` 参考如下：

```typescript
requestStream.on('metadata', (metadata: Metadata) => {
  const meta = metadata.get('X-Meta');
});
```
