# Testing

Source: https://docs.nestjs.com/fundamentals/testing

自动化测试是任何严肃的软件开发工作的重要组成部分。自动化使得在开发过程中快速重复单个测试或测试套件变得容易，这有助于确保版本满足质量和性能目标。它增加了覆盖范围，为开发人员提供了更快的反馈循环，并确保测试在开发生命周期的关键点运行，如源代码控制签入、特性集成和版本发布。

这些测试涵盖多种类型，包括单元测试、端到端（e2e）测试和集成测试。虽然好处很明显，但设置它们可能会很乏味。Nest 促进开发最佳实践，包括有效的测试，并包括以下功能来帮助开发人员和团队构建和自动化测试。Nest:

- 自动支架组件的默认单元测试和应用程序的 e2e 测试
- 提供默认工具（例如构建隔离模块/应用程序加载程序的测试运行器）
- 提供与 [Vitest](https://vitest.dev/) 和 [Supertest](https://github.com/visionmedia/supertest) 同时对测试工具保持不可知
- 使 Nest 测试环境中提供依赖注入系统，因此您无需额外设置即可模拟组件

您可以使用任何您喜欢的**测试框架**，因为 Nest 不强制使用任何特定的工具。替换所需的元素（如测试运行器），您仍然可以从中受益 Nest 现成的测试设施。

> info **Hint** 新生成的项目使用 Vitest 默认。测试 API 暴露于 Nest 不要依赖于特定的运行器，因此相同的模式也适用于其他工具。

#### 安装

要开始，请安装所需的软件包：

```bash
$ npm i --save-dev @nestjs/testing
```

#### 单元测试

以下示例使用 [Vitest](https://vitest.dev/) 测试两个类 `CatsController` 和 `CatsService`。Vitest 充当测试运行器，还提供断言函数和用于嘲弄、窥探和存根的双重测试实用程序。这个基本测试手动实例化类，并检查控制器和服务是否履行了它们的 API 合同。

```typescript
import { vi } from 'vitest';
import { CatsController } from './cats.controller.js';
import { CatsService } from './cats.service.js';

describe('CatsController', () => {
  let catsController: CatsController;
  let catsService: CatsService;

  beforeEach(() => {
    catsService = new CatsService();
    catsController = new CatsController(catsService);
  });

  describe('findAll', () => {
    it('should return an array of cats', async () => {
      const result = ['test'];
      vi.spyOn(catsService, 'findAll').mockImplementation(() => result);

      expect(await catsController.findAll()).toBe(result);
    });
  });
});
```

> info **Hint** 将测试文件放在他们测试的类附近。测试文件应该有一个 `.spec` 或者 `.test` 后缀。

因为上面的样本是微不足道的，所以它不测试任何东西 Nest-具体。它甚至不使用依赖注入（它传递一个 `CatsService` 二 `catsController` 直接）。这种形式的测试，您手动实例化被测试的类，通常被称为**隔离测试**，因为它独立于框架。以下各节介绍更高级的功能，这些功能可帮助您测试更广泛地使用 Nest 特征。

#### 测试实用程序

这个 `@nestjs/testing` 包为更健壮的测试过程提供了一组实用程序。让我们使用内置的 `Test` 班级：

```typescript
import { vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { CatsController } from './cats.controller.js';
import { CatsService } from './cats.service.js';

describe('CatsController', () => {
  let catsController: CatsController;
  let catsService: CatsService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
        controllers: [CatsController],
        providers: [CatsService],
      }).compile();

    catsService = moduleRef.get(CatsService);
    catsController = moduleRef.get(CatsController);
  });

  describe('findAll', () => {
    it('should return an array of cats', async () => {
      const result = ['test'];
      vi.spyOn(catsService, 'findAll').mockImplementation(() => result);

      expect(await catsController.findAll()).toBe(result);
    });
  });
});
```

这个 `Test` 类提供了一个应用程序执行上下文，该上下文本质上模拟了完整的 Nest 运行时，但为您提供了管理类实例的挂钩，包括嘲弄和覆盖。它的 `createTestingModule()` 方法将模块元数据对象作为其参数（传递给 `@Module()` 装饰器）并返回一个 `TestingModuleBuilder` 实例，这反过来又提供了一些方法。对于单元测试，重要的是 `compile()`.它用其依赖关系引导模块（类似于传统引导应用程序的方式 `main.ts` 文件使用 `NestFactory.create()`），并返回一个 `TestingModule` 已经准备好测试了。

> info **Hint** 这个 `compile()` 方法是**异步**，所以你必须等待它。模块编译完成后，您可以使用 `get()` 方法。

`TestingModule` 公开相同的实例解析 API 作为 [模块参考](/fundamentals/module-ref) 类，包括动态解析作用域提供程序（瞬态或请求作用域）的能力。使用 `resolve()` 方法（`get()` 方法只能检索静态实例）。

```typescript
const moduleRef = await Test.createTestingModule({
  controllers: [CatsController],
  providers: [CatsService],
}).compile();

catsService = await moduleRef.resolve(CatsService);
```

> warning **Warning** 这个 `resolve()` 方法从自己的**返回提供程序的唯一实例 DI 容器子树**。每个子树都有一个唯一的上下文标识符。如果多次调用此方法并比较实例引用，您会发现它们并不相等。

> info **Hint** 了解有关其功能的更多信息 [模块参考](/fundamentals/module-ref) 篇章。

不使用提供程序的生产版本，您可以使用 [自定义提供者](/fundamentals/custom-providers) 用于测试目的。例如，您可以模拟数据库服务，而不是连接到实时数据库。覆盖在 [端到端测试](/fundamentals/testing#end-to-end-testing) 部分，但它们也可用于单元测试。

#### 自动嘲笑

Nest 还允许您定义一个模拟工厂来应用于所有缺失的依赖项。当一个类有大量的依赖项，而模拟所有这些依赖项需要花费大量的时间和设置时，这非常有用。要使用此特性，请将 `useMocker()` 方法链接到 `createTestingModule()` 上，为您的依赖模拟传递一个工厂。工厂接收一个可选令牌（对 Nest 提供者有效的任何令牌），并返回一个模拟实现。下面的示例使用 `vi.fn()` 为 `CatsService` 创建了一个特定的模拟。

```typescript
import { vi } from 'vitest';

describe('CatsController', () => {
  let controller: CatsController;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [CatsController],
    })
      .useMocker((token) => {
        const results = ['test1', 'test2'];
        if (token === CatsService) {
          return { findAll: vi.fn().mockResolvedValue(results) };
        }
      })
      .compile();

    controller = moduleRef.get(CatsController);
  });
});
```

您可以从测试容器中检索这些模拟，就像定制提供程序一样，例如 `moduleRef.get(CatsService)`。

> info **Hint** 还可以将可重用的模拟工厂助手直接传递给 `useMocker()` 当您想跨套房共享测试双人时。

> info **Hint** `REQUEST` 和 `INQUIRER` 不能自动模拟提供程序，因为它们已经在上下文中预定义了。但是，您可以使用自定义提供程序语法或 `overrideProvider()` 方法。

#### 端到端测试

与侧重于单个模块和类的单元测试不同，端到端（e2e）测试涵盖了类和模块在更聚合级别上的交互，更接近最终用户与生产系统的交互。随着应用程序的增长，很难手动测试每个应用程序的端到端行为 API 端点。自动化的端到端测试有助于确保系统的整体行为是正确的并满足项目要求。E2e 测试使用类似于**单元测试**中涵盖的配置。此外，Nest 使使用变得容易 [Supertest](https://github.com/visionmedia/supertest) 要模拟的库 HTTP 请求。

```typescript
import request from 'supertest';
import { Test } from '@nestjs/testing';
import { CatsModule } from '../../src/cats/cats.module.js';
import { CatsService } from '../../src/cats/cats.service.js';
import { INestApplication } from '@nestjs/common';

describe('Cats', () => {
  let app: INestApplication;
  let catsService = { findAll: () => ['test'] };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [CatsModule],
    })
      .overrideProvider(CatsService)
      .useValue(catsService)
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  it(`/GET cats`, () => {
    return request(app.getHttpServer())
      .get('/cats')
      .expect(200)
      .expect({
        data: catsService.findAll(),
      });
  });

  afterAll(async () => {
    await app.close();
  });
});
```

> info **Hint** 如果使用 [Fastify](/http/performance) 作为 HTTP 适配器，则需要略有不同的配置，并且具有内置的测试功能：
>
> ```ts
> 让应用程序：NestFastifyApplication
>
> beforeAll(异步() => {
> app = moduleRef.createNestApplication<NestFastifyApplication>(
> 新 FastifyAdapter()，
> );
>
> 等待 app.init()；
> 等待 app.getHttpAdapter().getInstance().ready()；
> });
>
> 它(`/GET cats`, () => {
> 返回应用程序
> .注入({
> 方法：'GET'，
> 网址：'/cats'，
> })
> .然后((结果) => {
> 期望(result.statusCode).toEqual(200);
> expect(result.payload).toEqual(/* expectedPayload */);
> });
> });
>
> afterAll(异步() => {
> 等待 app.close()；
> });
> ```

这个例子建立在前面描述的概念之上。除了 `compile()` 方法，它使用 `createNestApplication()` 方法实例化完整的 Nest 运行时环境。

一个警告：当您的应用程序使用 `compile()` 方法，`HttpAdapterHost#httpAdapter` 仍然未定义，因为没有 HTTP 在编译阶段创建了适配器或服务器。如果您的测试需要 `httpAdapter`，使用 `createNestApplication()` 方法来创建应用程序实例，或者在初始化依赖关系图时重构项目以避免这种依赖关系。

让我们分解这个例子。

测试保存对正在运行的应用程序的引用 `app` 变量，因此它可以使用它来模拟 HTTP 请求。

HTTP 使用 `request()` 来自超级测试的函数。将这些请求路由到运行 Nest 应用程序，测试通过 `request()` 对 HTTP 基础侦听器 Nest （反过来，可以由 Express 平台）。因此建造 `request(app.getHttpServer())`.呼叫 `request()` 返回包装 HTTP 服务器，连接到 Nest 应用程序，它公开了模拟实际的方法 HTTP 请求。例如， `request(...).get('/cats')` 向 Nest 与**实际**相同的应用程序 `GET /cats` HTTP 请求通过网络传入。

该示例还提供了 `CatsService` 这返回测试可以检查的硬编码值。使用 `overrideProvider()` 以提供这样的替代实施方式。同样，Nest 提供 `overrideModule()`,`overrideGuard()`,`overrideInterceptor()`,`overrideFilter()`，和 `overridePipe()` 分别覆盖模块、防护、拦截器、过滤器和管道的方法。

每个覆盖方法（除了 `overrideModule()`）返回一个对象，该对象包含三个方法，这些方法反映了 [定制提供者](/fundamentals/custom-providers) 中描述的方法：

- `useClass`：您提供了一个实例化的类，以提供覆盖对象（提供程序、守卫等）的实例。
- `useValue`：您提供了一个覆盖对象的实例。
- `useFactory`：您提供了一个函数，该函数返回一个覆盖对象的实例。

`overrideModule()`，另一方面，返回一个对象 `useModule()` 方法，您使用该方法提供覆盖原始模块的模块：

```typescript
const moduleRef = await Test.createTestingModule({
  imports: [AppModule],
})
  .overrideModule(CatsModule)
  .useModule(AlternateCatsModule)
  .compile();
```

这些方法中的每一个又返回 `TestingModuleBuilder` 实例，因此可以将它们与 [流畅风格](https://en.wikipedia.org/wiki/Fluent_interface).呼叫 `compile()` 在链条的末端 Nest 实例化和初始化模块。

您可能还希望在测试运行时提供自定义记录器（例如，在 CI 服务器）。使用 `setLogger()` 方法并传递一个满足 `LoggerService` 接口告诉 `TestingModuleBuilder` 如何在测试期间记录（默认情况下，只有“错误”日志被写入控制台）。

编译后的模块有几种有用的方法，如下表所述：

<table>
  <tr>
    <td>
      <code>createNestApplication()</code>
    </td>
    <td>
      Creates and returns a Nest application (<code>INestApplication</code> instance) based on the given module.
      Note that you must manually initialize the application using the <code>init()</code> method.
    </td>
  </tr>
  <tr>
    <td>
      <code>createNestMicroservice()</code>
    </td>
    <td>
      Creates and returns a Nest microservice (<code>INestMicroservice</code> instance) based on the given module.
    </td>
  </tr>
  <tr>
    <td>
      <code>get()</code>
    </td>
    <td>
      Retrieves a static instance of a controller or provider (including guards, filters, etc.) available in the application context. Works like the same method of the <a href="/fundamentals/module-ref">module reference</a> class.
    </td>
  </tr>
  <tr>
     <td>
      <code>resolve()</code>
    </td>
    <td>
      Retrieves a dynamically created scoped instance (request or transient) of a controller or provider (including guards, filters, etc.) available in the application context. Works like the same method of the <a href="/fundamentals/module-ref">module reference</a> class.
    </td>
  </tr>
  <tr>
    <td>
      <code>select()</code>
    </td>
    <td>
      Navigates through the module's dependency graph; can be used to retrieve a specific instance from the selected module (used along with strict mode (<code>strict: true</code>) in the <code>get()</code> method).
    </td>
  </tr>
</table>

> info **Hint** 将 e2e 测试文件保存在 `test` 目录。测试文件应该有一个 `.e2e-spec` 后缀。

#### 覆盖全球注册的增强子

如果您有一个全局注册的防护（或管道、拦截器或过滤器），您需要采取更多步骤来覆盖该增强器。概括一下，原始注册如下所示：

```typescript
providers: [
  {
    provide: APP_GUARD,
    useClass: JwtAuthGuard,
  },
],
```

这将通过以下方式将警卫注册为“多”提供者 `APP_*` 代币。能够取代 `JwtAuthGuard` 这里，注册需要在此插槽中使用现有的提供程序：

```typescript
providers: [
  {
    provide: APP_GUARD,
    useExisting: JwtAuthGuard,
    // ^^^^^^^^ notice the use of 'useExisting' instead of 'useClass'
  },
  JwtAuthGuard,
],
```

> info **Hint** 变化 `useClass` 二 `useExisting` 引用注册提供者而不是拥有 Nest 在令牌后面实例化它。

`JwtAuthGuard` 现在作为常规提供程序对 Nest 可见，在创建 `TestingModule` 时可以覆盖该提供程序：

```typescript
const moduleRef = await Test.createTestingModule({
  imports: [AppModule],
})
  .overrideProvider(JwtAuthGuard)
  .useClass(MockAuthGuard)
  .compile();
```

所有测试现在都使用 `MockAuthGuard` 每一个要求。

#### 测试请求作用域实例

[Request-scoped](/fundamentals/injection-scopes) 为每个传入的**请求**唯一地创建提供程序，并且在请求被处理后，实例被垃圾收集。这会带来一个问题，因为您无法访问专门为测试请求生成的依赖注入子树。

如以上各节所示，`resolve()` 方法检索动态实例化的类。此外，如中所述 [解析作用域提供程序](/fundamentals/module-ref#resolving-scoped-providers)，您可以传递唯一的上下文标识符来控制 DI 容器子树。您可以在测试环境中结合两者。

策略是预先生成上下文标识符并强制 Nest 使用这个特定的 ID 为所有传入请求创建子树。这样，您可以检索为测试请求创建的实例。

为此，请在 `ContextIdFactory` 上使用 `vi.spyOn()`：

```typescript
const contextId = ContextIdFactory.create();
vi
  .spyOn(ContextIdFactory, 'getByRequest')
  .mockImplementation(() => contextId);
```

您现在可以使用 `contextId` 访问单个生成的 DI 任何后续请求的容器子树。

```typescript
catsService = await moduleRef.resolve(CatsService, contextId);
```
