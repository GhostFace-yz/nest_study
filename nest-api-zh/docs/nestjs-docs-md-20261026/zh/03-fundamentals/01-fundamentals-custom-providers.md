# Custom providers

Source: https://docs.nestjs.com/fundamentals/custom-providers

前面的章节涉及**依赖注入的各个方面（DI）**以及如何 Nest 用它。一个例子是 [constructor-based](/providers#dependency-injection) 依赖注入，将实例（通常是服务提供者）注入类中。依赖注入内置到 Nest 基本层面的核心。到目前为止，我们只探索了一种主要模式。随着应用程序变得越来越复杂，您可能需要 DI 系统，因此本章将对其进行更详细的探讨。

#### DI 基本原则

依赖注入是一种 [控制反转（IoC）](https://en.wikipedia.org/wiki/Inversion_of_control) 将依赖项的实例化委托给 IoC 容器的技术（在本例中，NestJS 运行时系统），而不是必须在您自己的代码中实例化它们。让我们从 [Providers](/providers) 篇章。

首先，我们定义一个提供者。这个 `@Injectable()` 装饰师标记 `CatsService` 作为提供者的类。

```typescript
import { Injectable } from '@nestjs/common';
import type { Cat } from './interfaces/cat.interface.js';

@Injectable()
export class CatsService {
  private readonly cats: Cat[] = [];

  findAll(): Cat[] {
    return this.cats;
  }
}
```

然后我们要求 Nest 将提供程序注入我们的控制器类中：

```typescript
import { Controller, Get } from '@nestjs/common';
import { CatsService } from './cats.service.js';
import type { Cat } from './interfaces/cat.interface.js';

@Controller('cats')
export class CatsController {
  constructor(private catsService: CatsService) {}

  @Get()
  async findAll(): Promise<Cat[]> {
    return this.catsService.findAll();
  }
}
```

最后，我们向 NestIoC 容器：

```typescript
import { Module } from '@nestjs/common';
import { CatsController } from './cats/cats.controller.js';
import { CatsService } from './cats/cats.service.js';

@Module({
  controllers: [CatsController],
  providers: [CatsService],
})
export class AppModule {}
```

有三个关键步骤可以实现这一点：

1. 在 `cats.service.ts`，这个 `@Injectable()` 装饰者声明 `CatsService` 作为一个类 NestIoC 容器可以管理。
2. 在 `cats.controller.ts`,`CatsController` 声明对 `CatsService` 带有构造函数注入的令牌：

```typescript
  constructor(private catsService: CatsService)
```

3. 在 `app.module.ts`，我们关联令牌 `CatsService` 和班级一起 `CatsService` 从 `cats.service.ts` 文件。下面的<a href="/fundamentals/custom-providers#standard-providers">标准提供者</a>部分准确显示了这种关联（也称为_registration_）是如何发生的。

当 NestIoC 容器实例化 `CatsController`，它首先查找任何依赖关系\*。当它发现 `CatsService` 依赖关系，它查找 `CatsService` 令牌，它返回 `CatsService` 类，按照注册步骤（上面的#3）。假设 `SINGLETON` 作用域（默认值），Nest 然后创建一个实例 `CatsService`，缓存它并返回它，或者，如果一个实例已经被缓存，则返回现有的实例。

\*此解释被简化以说明这一点。实际上，分析代码中的依赖关系是一个复杂的过程，发生在应用程序引导期间。一个关键属性是依赖分析（或“创建依赖图”）是**传递的**：在上面的例子中，如果 `CatsService` 它本身有依赖关系，这些也会被解决。依赖图确保依赖关系以正确的顺序解析，本质上是“自下而上”。这种机制使您不必自己管理复杂的依赖图。

#### 标准提供者

让我们仔细看看 `@Module()` 装修师。在 `app.module`，我们声明：

```typescript
@Module({
  controllers: [CatsController],
  providers: [CatsService],
})
```

这个 `providers` 属性接受一系列提供程序。到目前为止，我们已经提供了这些提供程序作为类名列表。实际上，语法 `providers: [CatsService]` 是更完整语法的简写：

```typescript
providers: [
  {
    provide: CatsService,
    useClass: CatsService,
  },
];
```

这个显式构造显示了注册过程：它将令牌 `CatsService` 与类 `CatsService` 相关联。速记符号对于最常见的用例来说是一种便利，其中令牌用于请求具有相同名称的类的实例。

#### 定制提供者

有时，您的要求超出了标准提供者提供的范围。例如：

- 您希望创建一个自定义实例，而不是 Nest 实例化（或返回）类的缓存实例。
- 您希望在第二个依赖项中重用现有类。
- 您想用模拟版本覆盖一个类进行测试。

Nest 允许您定义自定义提供程序来处理这些情况，并提供了几种定义它们的方法。下面的章节贯穿每一个。

> info **Hint** 如果遇到依赖关系解析问题，请设置 `NEST_DEBUG` 环境变量，用于在启动期间获取额外的依赖项解析日志。

#### 价值提供者：`useValue`

这个 `useValue` 语法对于注入常量值、将外部库放入 Nest 容器，或者用模拟对象替换真实的实现。例如，假设您想 Nest 使用模拟 `CatsService` 出于测试目的：

```typescript
import { CatsService } from './cats.service.js';

const mockCatsService = {
  /* mock implementation
  ...
  */
};

@Module({
  imports: [CatsModule],
  providers: [
    {
      provide: CatsService,
      useValue: mockCatsService,
    },
  ],
})
export class AppModule {}
```

在本例中，`CatsService` 令牌解析为 `mockCatsService` 模拟对象。`useValue` 需要一个值，在本例中是一个与它所替换的 `CatsService` 类具有相同接口的文字对象。由于 TypeScript 的 [结构分型](https://www.typescriptlang.org/docs/handbook/type-compatibility.html)，您可以使用任何具有兼容接口的对象，包括使用 `new` 创建的文字对象或类实例。

#### 非基于类的提供程序令牌

到目前为止，我们已经使用类名作为提供程序令牌（`provide` 中列出的提供程序中的属性 `providers` 数组）。这与用于 [基于构造函数的注入](/providers#dependency-injection)，其中令牌也是类名。（参见<a href="/fundamentals/custom-providers#di-fundamentals">DI 基础</a>复习令牌。）有时您需要灵活地使用字符串或符号作为 DI 代币。例如：

```typescript
import { connection } from './connection.js';

@Module({
  providers: [
    {
      provide: 'CONNECTION',
      useValue: connection,
    },
  ],
})
export class AppModule {}
```

在本例中，我们关联一个字符串值令牌（`'CONNECTION'`）与预先存在的 `connection` 从外部文件导入的对象。

> warning **Notice** 除了字符串，还可以使用 JavaScript[符号](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Symbol) 或者 TypeScript[枚举](https://www.typescriptlang.org/docs/handbook/enums.html) 作为令牌值。

标准 [基于构造函数的注入](/providers#dependency-injection) 模式**要求**用类名声明依赖项。这个 `'CONNECTION'` 但是，自定义提供程序使用字符串值令牌。要注入这样的提供程序，请使用 `@Inject()`decorator，它接受一个参数：令牌。

```typescript
@Injectable()
export class CatsRepository {
  constructor(@Inject('CONNECTION') connection: Connection) {}
}
```

> info **Hint** 这个 `@Inject()` 装饰器是从 `@nestjs/common` 包装。

上面的示例使用字符串 `'CONNECTION'` 直接举例说明。对于干净的代码组织，请在单独的文件中定义令牌，例如 `constants.ts`，并在需要时导入它们，就像使用符号或枚举一样。

#### 接口和抽象类

TypeScript 类型和接口在编译过程中被删除，因此 Nest 不能在运行时引用它们。接口可以描述依赖项的形状，但它不能充当 DI 象征性本身。

因为 Nest 通过运行时令牌解析提供程序，使用字符串或 `Symbol` 为接口注册提供程序时的令牌：

```typescript
export interface LoggerService {
  log(message: string): void;
}

export const LOGGER_SERVICE = Symbol('LOGGER_SERVICE');

@Injectable()
export class PinoLoggerService implements LoggerService {
  log(message: string) {
    // implementation details
  }
}

@Module({
  providers: [
    {
      provide: LOGGER_SERVICE,
      useClass: PinoLoggerService,
    },
  ],
})
export class AppModule {}
```

要注入此提供程序，请将该令牌传递给 `@Inject()` 装饰师：

```typescript
@Injectable()
export class CatsService {
  constructor(
    @Inject(LOGGER_SERVICE)
    private readonly logger: LoggerService,
  ) {}
}
```

与接口不同，抽象类存在于运行时。可以将抽象类用作 TypeScript 合约及 DI 令牌：

```typescript
export abstract class LoggerService {
  abstract log(message: string): void;
}

@Injectable()
export class PinoLoggerService implements LoggerService {
  log(message: string) {
    // implementation details
  }
}

@Module({
  providers: [
    {
      provide: LoggerService,
      useClass: PinoLoggerService,
    },
  ],
})
export class AppModule {}
```

使用抽象类令牌，基于构造函数的注入直接使用抽象类类型，不需要 `@Inject()`：

```typescript
@Injectable()
export class CatsService {
  constructor(private readonly logger: LoggerService) {}
}
```

使用字符串或 `Symbol` 运行时的令牌 DI 令牌应该与类分离。`Symbol` 令牌对于库和较大的应用程序特别有用：每个符号都有一个唯一的运行时标识，这避免了当不相关的提供者使用相同的字符串令牌时可能发生的意外冲突。使用符号令牌时，请从共享文件中导出它，并在注册和注入提供程序的地方重复使用相同的符号实例。当一个工件应该同时充当契约和运行时令牌，并且您更喜欢更简单的构造函数注入时，使用抽象类。当类型仅用于编译时检查而不用于编译时，普通接口仍然是一个不错的选择 DI 需要令牌。

#### 类提供者：`useClass`

这个 `useClass` 语法允许您动态确定令牌解析到的类。例如，假设我们有一个抽象（或默认）`ConfigService` 班级，我们想要 Nest 根据当前环境提供配置服务的不同实现。以下代码实现了此策略：

```typescript
const configServiceProvider = {
  provide: ConfigService,
  useClass:
    process.env.NODE_ENV === 'development'
      ? DevelopmentConfigService
      : ProductionConfigService,
};

@Module({
  providers: [configServiceProvider],
})
export class AppModule {}
```

这个例子中的两个细节值得注意。首先，我们定义 `configServiceProvider` 作为文字对象，然后在模块装饰器的 `providers` 财产。这只是代码组织；它在功能上等同于本章到目前为止使用的示例。

第二，我们使用 `ConfigService` 类名作为令牌。对于任何依赖于 `ConfigService`,Nest 注入所提供类的实例（`DevelopmentConfigService` 或者 `ProductionConfigService`），覆盖可能已在其他地方声明的任何默认实现（例如，`ConfigService` 声明 `@Injectable()` 装饰师）。

#### 工厂供应商：`useFactory`

这个 `useFactory` 语法允许您**动态**创建提供程序。提供程序的值是工厂函数返回的任何值。工厂功能可以根据需要简单或复杂。一个简单的工厂可能不依赖于任何其他提供者。一个更复杂的工厂可以注入它需要的提供程序来计算结果。对于后一种情况，工厂提供程序语法有一对相关机制：

1. factory 函数可以接受（可选的）参数。
2. （可选）`inject` 属性接受一系列提供程序，这些提供程序 Nest 在实例化期间解析并作为参数传递给工厂函数。这些提供程序也可以标记为可选。这两个列表是相关的：Nest 从 `inject` 以相同的顺序列出工厂函数作为参数。下面的例子证明了这一点。

```typescript
const connectionProvider = {
  provide: 'CONNECTION',
  useFactory: (optionsProvider: MyOptionsProvider, optionalProvider?: string) => {
    const options = optionsProvider.get();
    return new DatabaseConnection(options);
  },
  inject: [MyOptionsProvider, { token: 'SomeOptionalProvider', optional: true }],
  //       \______________/             \__________________/
  //        This provider                The provider with this token
  //        is mandatory.                can resolve to `undefined`.
};

@Module({
  providers: [
    connectionProvider,
    MyOptionsProvider, // class-based provider
    // { provide: 'SomeOptionalProvider', useValue: 'anything' },
  ],
})
export class AppModule {}
```

#### 别名提供者：`useExisting`

这个 `useExisting` 语法允许您为现有提供程序创建别名，这为您提供了两种访问同一提供程序的方法。在下面的示例中，（基于字符串的）令牌 `'AliasedLoggerService'` 是（基于类的）令牌的别名 `LoggerService`.假设我们有两个不同的依赖关系，一个是 `'AliasedLoggerService'` 还有一个 `LoggerService`.如果两个依赖项都用 `SINGLETON` 作用域，它们都解析到同一个实例。

```typescript
@Injectable()
class LoggerService {
  /* implementation details */
}

const loggerAliasProvider = {
  provide: 'AliasedLoggerService',
  useExisting: LoggerService,
};

@Module({
  providers: [LoggerService, loggerAliasProvider],
})
export class AppModule {}
```

#### 非服务提供者

提供者通常提供服务，但不限于此。提供者可以提供**任何**值。例如，提供者可以基于当前环境提供配置对象：

```typescript
const configFactory = {
  provide: 'CONFIG',
  useFactory: () => {
    return process.env.NODE_ENV === 'development' ? devConfig : prodConfig;
  },
};

@Module({
  providers: [configFactory],
})
export class AppModule {}
```

#### 导出自定义提供程序

与任何提供程序一样，自定义提供程序的作用域限制在其声明模块中。要使它对其他模块可见，您必须使用其令牌或完整的提供程序对象将其导出。

以下示例按其令牌导出提供程序：

```typescript
const connectionFactory = {
  provide: 'CONNECTION',
  useFactory: (optionsProvider: OptionsProvider) => {
    const options = optionsProvider.get();
    return new DatabaseConnection(options);
  },
  inject: [OptionsProvider],
};

@Module({
  providers: [connectionFactory],
  exports: ['CONNECTION'],
})
export class AppModule {}
```

或者，导出完整的提供程序对象：

```typescript
const connectionFactory = {
  provide: 'CONNECTION',
  useFactory: (optionsProvider: OptionsProvider) => {
    const options = optionsProvider.get();
    return new DatabaseConnection(options);
  },
  inject: [OptionsProvider],
};

@Module({
  providers: [connectionFactory],
  exports: [connectionFactory],
})
export class AppModule {}
```
