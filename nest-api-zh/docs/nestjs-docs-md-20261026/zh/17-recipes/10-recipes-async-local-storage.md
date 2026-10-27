# Async local storage

Source: https://docs.nestjs.com/recipes/async-local-storage

`AsyncLocalStorage` 是一个 [Node.js API](https://nodejs.org/api/async_context.html#class-asynclocalstorage)（基于 `async_hooks`API）提供了一种通过应用程序传播局部状态的替代方法，而无需将其显式地作为函数参数传递。它类似于其他语言中的线程本地存储。

异步本地存储的主要思想是，您可以使用 `AsyncLocalStorage#run` 呼吁。包装调用中调用的所有代码都可以访问相同的 `store`，这是每个调用链唯一的。

在以下背景下 NestJS 这意味着，如果在请求的生命周期中找到一个位置来包装请求的其余部分代码，则可以访问和修改只有该请求可见的状态。这可以作为替代方案 REQUEST-范围内的提供者，避免了它们的一些限制。

或者，您可以使用 ALS 仅传播系统的一部分（例如_transaction_对象）的上下文，而不显式地跨服务传递上下文，这会增加隔离和封装。

如果您的应用程序使用 [NestJS Observe](/observability/overview)，您已经有一个请求范围存储，不需要构建一个。参见 [NestJS Observe](/recipes/async-local-storage#nestjs-observe) 下面的部分。

#### 定制实施

这个 NestJS 核心框架没有为 `AsyncLocalStorage` 所以让我们来看看如何用最简单的方法自己实现它 HTTP 案例，以便更好地理解整个概念：

> info **Hint** 有关现成的解决方案，请参见 [`@nestjs/observe`](/recipes/async-local-storage#nestjs-observe) 和 [`nestjs-cls`](/recipes/async-local-storage#nestjs-cls) 下面的部分。

1. 首先，创建一个 `AsyncLocalStorage` 在共享源文件中。既然我们在用 NestJS，让我们也把它变成一个带有自定义提供者的模块。

```ts
@Module({
  providers: [
    {
      provide: AsyncLocalStorage,
      useValue: new AsyncLocalStorage(),
    },
  ],
  exports: [AsyncLocalStorage],
})
export class AlsModule {}
```

> info **Hint** `AsyncLocalStorage` 是从 `node:async_hooks` 导入的。

2. 我们只关心 HTTP，所以让我们用一个中间件来包装 `next` 功能与 `AsyncLocalStorage#run`.由于中间件是请求命中的第一个东西，这使得 `store` 适用于所有增强器和系统的其余部分。

```ts
@Module({
  imports: [AlsModule],
  providers: [CatsService],
  controllers: [CatsController],
})
export class AppModule implements NestModule {
  constructor(
    // inject the AsyncLocalStorage in the module constructor,
    private readonly als: AsyncLocalStorage
  ) {}

  configure(consumer: MiddlewareConsumer) {
    // bind the middleware,
    consumer
      .apply((req, res, next) => {
        // populate the store with some default values
        // based on the request,
        const store = {
          userId: req.headers['x-user-id'],
        };
        // and pass the "next" function as callback
        // to the "als.run" method together with the store.
        this.als.run(store, () => next());
      })
      .forRoutes('*path');
  }
}
```

3. 现在，您可以在请求生命周期中的任何位置访问本地存储实例。

```ts
@Injectable()
export class CatsService {
  constructor(
    // We can inject the provided ALS instance.
    private readonly als: AsyncLocalStorage,
    private readonly catsRepository: CatsRepository,
  ) {}

  getCatForUser() {
    // The "getStore" method will always return the
    // store instance associated with the given request.
    const userId = this.als.getStore()["userId"] as number;
    return this.catsRepository.getForUser(userId);
  }
}
```

4. 现在，您可以共享与请求相关的状态，而无需注入整个状态 `REQUEST` 物体。

> warning **Warning** 虽然这种技术对许多用例很有用，但它本质上会模糊代码流（通过创建隐式上下文），所以要负责任地使用它，尤其要避免创建上下文“[God objects](https://en.wikipedia.org/wiki/God_object)”。

### NestJS 观察

如果你跑 [NestJS Observe](/observability/overview)，这个 `@nestjs/observe`SDK 已经维护了一个 `AsyncLocalStorage` 存储每个请求、作业和消息传递 it 工具。此存储在调用堆栈中携带跟踪上下文。`TracerService` 暴露了它，所以请求作用域状态是你读写的东西，而不是你设置的东西：没有模块要写，没有中间件要挂载，也没有任何东西要每次传输重新布线。

> info **Hint** 这与 [Manual instrumentation](/observability/manual-instrumentation) 中记录的 `TracerService` 相同。本节仅涵盖其异步本地存储方面；其中描述了跨度、处理错误和自定义指标。

#### 设置

除了 [Observability → SDK](/observability/sdk) 中描述的标准 SDK 集成之外，不需要任何设置：安装软件包，导入 `ObserveModule.forRoot()`，然后将 `ObserveInstrument` 传递到 `NestFactory.create()`。

```bash
$ npm i @nestjs/observe
```

`ObserveModule` 出口 `TracerService`，因此您可以将其注入到应用程序中的任何位置：

```ts
import { Injectable } from '@nestjs/common';
import { TracerService } from '@nestjs/observe';

@Injectable()
export class CatsService {
  constructor(private readonly tracerService: TracerService) {}
}
```

#### 读写商店

`setAttribute(key, value)` 写入当前上下文存储，并且 `getAttribute(key)` 从同一请求（不同的服务、守卫或拦截器）的下游任何地方读回值，而无需通过每个函数签名：

```ts
@Get()
findAll(@Req() req: Request) {
  this.tracerService.setAttribute('userId', req.headers['x-user-id']);
  return this.catsService.getCatForUser();
}
```

```ts
@Injectable()
export class CatsService {
  constructor(
    private readonly tracerService: TracerService,
    private readonly catsRepository: CatsRepository,
  ) {}

  getCatForUser() {
    const userId = this.tracerService.getAttribute('userId');
    return this.catsRepository.getForUser(userId);
  }
}
```

`getAttribute()` 回报 `undefined` 对于一把从未设置过的钥匙。这两种方法在跟踪上下文之外调用时都会抛出，因为没有可读取或写入的存储。如果在任何请求存在之前可以合法地读取值，则相应地保护调用。

#### 输入商店

将存储的形状作为第一个类型参数传递 `TracerService` 要对键和值进行类型检查，包括嵌套路径：

```ts
interface RequestStore {
  userId: number;
  flags: { betaCheckout: boolean };
}

@Injectable()
export class CatsService {
  constructor(private readonly tracerService: TracerService<RequestStore>) {}

  enableBeta() {
    this.tracerService.setAttribute('flags.betaCheckout', true);
  }
}
```

#### 超出 HTTP

因为存储是由仪器而不是中间件创建的，所以它存在于 SDK 跟踪操作的任何地方：HTTP 和 GraphQL 请求、gRPC 和 `@nestjs/microservices` 消息以及后台工作，如 BullMQ 消费者和 cron 运行。上面的图案在所有的图案中都是相同的。这是与手工滚动的、基于中间件的实现的实际区别，后者仅涵盖 HTTP。

存储还保存当前跟踪 ID，因此它兼作日志和下游服务的关联密钥。`currentTraceId()` 归还它。不像 `getAttribute()`，它返回 `null` 在跟踪上下文之外，而不是抛出：

```ts
const traceId = this.tracerService.currentTraceId();
```

> info **Hint** `ObserveModule` 还导出基础 `AsyncLocalStorage` 实例。`setAttribute()` 和 `getAttribute()` 是访问商店的受支持方式；仅当您需要他们不公开的东西时才直接注入实例。

### NestJSCLS

这个 [nestjs-cls](https://github.com/Papooch/nestjs-cls) 包提供了与普通开发人员相比的几项开发人员体验改进 `AsyncLocalStorage`(`CLS` 是 _continuation-local storage_ 的缩写）。它将实现抽象为 `ClsModule` 这提供了各种初始化 `store` 对于不同的运输方式（不仅 HTTP），以及强大的打字支持。

然后，您可以使用可注入的 `ClsService` 访问存储，或者使用 [Proxy Providers](https://www.npmjs.com/package/nestjs-cls#proxy-providers) 将其完全从业务逻辑中抽象出来。

> info **Note** `nestjs-cls` 是第三方软件包，不由 NestJS 核心团队管理。请在 [nestjs-cls 存储库](https://github.com/Papooch/nestjs-cls/issues) 中报告库的任何问题。

#### 安装

除了对等依赖 `@nestjs` 包，它只使用内置的 Node.js 蜜蜂。像安装其他软件包一样安装它：

```bash
$ npm i nestjs-cls
```

#### 使用

您可以实现类似于 [定制实施](/recipes/async-local-storage#custom-implementation) 以上使用 `nestjs-cls`，如下：

1. 导入 `ClsModule` 在根模块中。

```ts
@Module({
  imports: [
    // Register the ClsModule,
    ClsModule.forRoot({
      middleware: {
        // automatically mount the
        // ClsMiddleware for all routes
        mount: true,
        // and use the setup method to
        // provide default store values.
        setup: (cls, req) => {
          cls.set('userId', req.headers['x-user-id']);
        },
      },
    }),
  ],
  providers: [CatsService],
  controllers: [CatsController],
})
export class AppModule {}
```

2. 然后使用 `ClsService` 访问存储值。

```ts
@Injectable()
export class CatsService {
  constructor(
    // We can inject the provided ClsService instance,
    private readonly cls: ClsService,
    private readonly catsRepository: CatsRepository,
  ) {}

  getCatForUser() {
    // and use the "get" method to retrieve any stored value.
    const userId = this.cls.get('userId');
    return this.catsRepository.getForUser(userId);
  }
}
```

3. 获取由 `ClsService`（以及字符串键的自动建议），使用可选的类型参数 `ClsService<MyClsStore>` 注射的时候。

```ts
export interface MyClsStore extends ClsStore {
  userId: number;
}
```

> info **Hint** 您也可以让包自动生成一个请求 ID，然后使用 `cls.getId()` 访问它，或者使用 `cls.get(CLS_REQ)` 获取整个请求对象。

#### 检测

自从 `ClsService` 只是另一个可注入的提供者，你可以在单元测试中完全嘲笑它。

但是，在某些集成测试中，您可能仍然希望使用真正的 `ClsService` 实现。在这种情况下，用对 `ClsService#run` 或 `ClsService#runWith` 的调用来包装上下文感知代码：

```ts
describe('CatsService', () => {
  let service: CatsService
  let cls: ClsService
  const mockCatsRepository = createMock<CatsRepository>()

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      // Set up most of the testing module as we normally would.
      providers: [
        CatsService,
        {
          provide: CatsRepository,
          useValue: mockCatsRepository,
        }
      ],
      imports: [
        // Import the static version of ClsModule which only provides
        // the ClsService, but does not set up the store in any way.
        ClsModule
      ],
    }).compile()

    service = module.get(CatsService)

    // Also retrieve the ClsService for later use.
    cls = module.get(ClsService)
  })

  describe('getCatForUser', () => {
    it('retrieves cat based on user id', async () => {
      const expectedUserId = 42
      mockCatsRepository.getForUser.mockImplementationOnce(
        (id) => ({ userId: id })
      )

      // Wrap the test call in the `runWith` method
      // in which we can pass hand-crafted store values.
      const cat = await cls.runWith(
        { userId: expectedUserId },
        () => service.getCatForUser()
      )

      expect(cat.userId).toEqual(expectedUserId)
    })
  })
})
```

#### 更多信息

参观 [nestjs-cls GitHub page](https://github.com/Papooch/nestjs-cls) 为了完整 API 文档和更多代码示例。
