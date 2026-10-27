# Dynamic modules

Source: https://docs.nestjs.com/fundamentals/dynamic-modules

[Modules chapter](/modules) 涵盖了 Nest 模块的基础知识，并包括对 [动态模块](/modules#dynamic-modules) 的简要介绍。本章扩展了以下主题：什么是动态模块，如何构建它们，以及何时使用它们。

#### 介绍

文档**概述**部分中的大多数代码示例使用常规或静态模块。模块定义组件组，例如 [供应商](/providers) 和 [控制器](/controllers)，作为应用程序模块化部分装配在一起。它们为这些组件提供了执行上下文或范围。例如，模块中定义的提供程序对模块的其他成员是可见的，而不会被导出。当提供程序需要在模块外部可见时，首先将其从其主机模块导出，然后导入到其消费模块中。

考虑一个熟悉的例子。首先，一个 `UsersModule` 提供并导出一个 `UsersService`。`UsersModule` 是 `UsersService` 的**主机**模块。

```typescript
import { Module } from '@nestjs/common';
import { UsersService } from './users.service.js';

@Module({
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
```

接下来，`AuthModule` 导入 `UsersModule`，这使得 `UsersModule` 的导出提供程序在 `AuthModule` 中可用：

```typescript
import { Module } from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { UsersModule } from '../users/users.module.js';

@Module({
  imports: [UsersModule],
  providers: [AuthService],
  exports: [AuthService],
})
export class AuthModule {}
```

这些构造允许我们将 `UsersService` 注入到例如托管在 `AuthModule` 中的 `AuthService` 中：

```typescript
import { Injectable } from '@nestjs/common';
import { UsersService } from '../users/users.service.js';

@Injectable()
export class AuthService {
  constructor(private readonly usersService: UsersService) {}
  /*
    Implementation that makes use of this.usersService
  */
}
```

我们将此称为**静态**模块绑定。所有信息 Nest 需要将模块连接在一起是在主机和消费模块中声明的。Nest 使 `UsersService` 内部可用 `AuthModule` 作者：

1. 实例化 `UsersModule`，包括传递地导入模块 `UsersModule` 本身消耗，并传递地解析任何依赖关系（参见 [Custom providers](/fundamentals/custom-providers)).
2. 实例化 `AuthModule`，并使 `UsersModule` 的导出提供程序对 `AuthModule` 中的组件可用（就好像它们已经在 `AuthModule` 中声明了一样）。
3. 将 `UsersService` 的实例注入 `AuthService`。

#### 动态模块用例

使用静态模块绑定，消费模块无法**影响**如何配置主机模块的提供程序。这对于需要为每个消费者提供不同行为的通用模块很重要，就像一个“插件”需要一些配置才能使用。

例如，考虑一个生成实体公共标识符的模块。以类型前缀开头的标识符，例如 `usr_` 对于用户和 `ord_` 对于订单，一目了然地告诉你他们指的是什么样的实体。每个实体的生成逻辑都是相同的，只有前缀不同。有了静态绑定，`IdGeneratorModule` 只能提供一个生成器，为每个导入它的模块配置一种方式。我们需要的是 `UsersModule` 和 `OrdersModule` 要导入带有自己前缀的模块。

这就是**动态模块**发挥作用的地方。动态模块提供 API 用于将一个模块导入到另一个模块中，并在导入该模块时自定义该模块的属性和行为。

#### 动态模块示例

从消费模块的角度开始模块的外观，然后向后工作是很有帮助的。静态导入没有空间传递前缀：

```typescript
import { Module } from '@nestjs/common';
import { IdGeneratorModule } from '../id-generator/id-generator.module.js';
import { UsersService } from './users.service.js';

@Module({
  imports: [IdGeneratorModule],
  providers: [UsersService],
})
export class UsersModule {}
```

另一方面，动态导入传递选项对象。比较 `imports` 两个示例的数组：

```typescript
import { Module } from '@nestjs/common';
import { IdGeneratorModule } from '../id-generator/id-generator.module.js';
import { UsersService } from './users.service.js';

@Module({
  imports: [IdGeneratorModule.register({ prefix: 'usr' })],
  providers: [UsersService],
})
export class UsersModule {}
```

让我们看一下动态示例的移动部分：

1. `IdGeneratorModule` 是一个普通类，因此它必须有一个名为 `register()` 的**静态方法**。该方法是静态的，因为它在类上调用，而不是在类的**实例**上调用。该方法可以有任何名称，但按照惯例，它被称为 `register()`、`forRoot()` 或 `forFeature()`（参见 [Community guidelines](#community-guidelines)）。
2. 我们定义 `register()` 方法我们自己，所以它可以接受任何我们喜欢的论点。通常，就像这里一样，它接受一个 options 对象。
3. 返回值 `register()` 出现在 `imports` 数组，以及模块类，所以它一定是 Nest 可以作为一个模块来处理。

其实， `register()` 返回一个 `DynamicModule`.动态模块是在运行时创建的模块。它具有与静态模块的元数据完全相同的属性，外加一个名为 `module`.下面是一个静态模块声明示例，用于比较：

```typescript
@Module({
  imports: [DogsModule],
  controllers: [CatsController],
  providers: [CatsService],
  exports: [CatsService],
})
```

动态模块是具有相同属性的对象，加上 `module` 属性，它引用模块类本身。

> info **Hint** 对于动态模块，模块选项对象的所有属性都是可选的**除了**`module`。

静态的工作 `register()` 因此，方法返回一个实现 `DynamicModule` 接口。调用它为 `imports` 数组，很像在静态情况下列出模块类。不同之处在于，模块的属性是以编程方式指定的，而不是在 `@Module()` 装修师。

还有两个细节使画面更加完整：

1. `@Module()` 装饰器的 `imports` 数组不仅接受模块类（例如，`imports: [UsersModule]`），还接受静态方法返回的动态模块（例如，`imports: [IdGeneratorModule.register(...)]`）。
2. 动态模块本身可以导入其他模块。如果它依赖于其他模块的提供程序，请在其可选模块中列出它们 `imports` 属性，就像你在 `@Module()` 静态模块的装饰器。

考虑到这一点，下面是动态 `IdGeneratorModule` 的第一个版本：

```typescript
import { DynamicModule, Module } from '@nestjs/common';
import { IdGenerator } from './id-generator.js';

@Module({})
export class IdGeneratorModule {
  static register(): DynamicModule {
    return {
      module: IdGeneratorModule,
      providers: [IdGenerator],
      exports: [IdGenerator],
    };
  }
}
```

呼叫 `IdGeneratorModule.register()` 返回一个 `DynamicModule` 对象，其属性与到目前为止我们通过 `@Module()` 装修师。

> info **Hint** 从 `@nestjs/common` 导入 `DynamicModule`。

不过，这个模块还不能配置。让我们接下来解决这个问题。

#### 模块配置

消费模块将选项传递给 `register()`，如上所示。问题是如何让它们到达需要它们的组件。`IdGeneratorModule` 承载并导出可注入服务，`IdGenerator`，而且是 `IdGenerator` 那需要前缀。目前，该服务对其进行了硬编码：

```typescript
import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

@Injectable()
export class IdGenerator {
  generate(): string {
    const options = { prefix: 'usr' };
    return `${options.prefix}_${randomUUID()}`;
  }
}
```

我们剩下的任务是将 `options` 对象从 `register()` 方法传递到 `IdGenerator`，我们将使用_dependency injection_来完成它。这是关键点：`IdGeneratorModule` 提供了 `IdGenerator`，而 `IdGenerator` 依赖于仅在运行时提供的 `options` 对象。因此，在运行时，我们首先将 `options` 对象绑定到 NestIoC 容器，然后让 Nest 将其注入到 `IdGenerator` 中。正如**自定义提供者**一章所解释的，提供者可以 [任何价值](/fundamentals/custom-providers#non-service-based-providers)，而不仅仅是服务，因此一个普通的 `options` 对象也可以工作。

首先，用接口描述选项，并为它们定义注入令牌。定义为常量（或 `Symbol`）在一个单独的文件中可以导入到需要的任何地方：

```typescript
export interface IdGeneratorModuleOptions {
  prefix: string;
}

export const ID_GENERATOR_OPTIONS = 'ID_GENERATOR_OPTIONS';
```

接下来，将选项对象绑定到静态中的 IoC 容器 `register()` 方法。我们正在动态构建一个模块，而模块的属性之一是它的提供程序列表，因此我们将 options 对象定义为提供程序。注意 `providers` 数组：

```typescript
import { DynamicModule, Module } from '@nestjs/common';
import { IdGenerator } from './id-generator.js';
import {
  ID_GENERATOR_OPTIONS,
  IdGeneratorModuleOptions,
} from './id-generator.interfaces.js';

@Module({})
export class IdGeneratorModule {
  static register(options: IdGeneratorModuleOptions): DynamicModule {
    return {
      module: IdGeneratorModule,
      providers: [
        {
          provide: ID_GENERATOR_OPTIONS,
          useValue: options,
        },
        IdGenerator,
      ],
      exports: [IdGenerator],
    };
  }
}
```

现在将选项注入 `IdGenerator`。用 `@Inject()` 装饰器注入使用非类令牌注册的提供程序，如 [Non-class-based provider tokens](/fundamentals/custom-providers#non-class-based-provider-tokens) 中所述：

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  ID_GENERATOR_OPTIONS,
  type IdGeneratorModuleOptions,
} from './id-generator.interfaces.js';

@Injectable()
export class IdGenerator {
  constructor(
    @Inject(ID_GENERATOR_OPTIONS)
    private readonly options: IdGeneratorModuleOptions,
  ) {}

  generate(): string {
    return `${this.options.prefix}_${randomUUID()}`;
  }
}
```

到位后，每个消耗模块配置自己的发生器：

```typescript
@Module({
  imports: [IdGeneratorModule.register({ prefix: 'usr' })],
  providers: [UsersService],
})
export class UsersModule {}

@Module({
  imports: [IdGeneratorModule.register({ prefix: 'ord' })],
  providers: [OrdersService],
})
export class OrdersModule {}
```

`UsersService` 和 `OrdersService` 都注入 `IdGenerator`，但每个都接收自己的实例，由导入它的模块配置：用户标识符以 `usr_` 开头，订单标识符以 `ord_` 开头。

工作示例可在 [动态模块样本](https://github.com/nestjs/nest/tree/master/sample/25-dynamic-modules) 在 GitHub 上。

#### 社区指引

您可能见过这样的方法 `forRoot()`,`register()`，和 `forFeature()` 在一些 `@nestjs/` 包，并想知道它们有何不同。没有硬性规定，但是 `@nestjs/` 软件包遵循以下准则：

- `register()` 配置一个动态模块，仅供调用模块使用，作为我们的 `IdGeneratorModule` 是的。例如，使用 `@nestjs/http-client`,`HttpClientModule.register({ baseUrl: 'someUrl' })` 配置 HTTP 呼叫模块的客户端。另一个模块可以调用 `HttpClientModule.register({ baseUrl: 'somewhere else' })` 获取不同配置的客户端。您可以在任意多个模块中执行此操作。
- `forRoot()` 配置一次动态模块，并在多个地方重用该配置（可能消费者不知道）。这就是为什么应用程序有一个 `GraphQLModule.forRoot()`,一 `TypeOrmModule.forRoot()`，等等。
- `forFeature()` 使用由 `forRoot()` 但是根据调用模块的需要修改其中的一些内容（例如，模块可以访问哪些存储库，或者记录器应该使用的上下文）。

其中每一个通常都有一个异步对应物，`registerAsync()`,`forRootAsync()`，和 `forFeatureAsync()`，这意味着相同的事情，但通过 Nest 的依赖注入。

#### 可配置模块生成器

手动创建还公开异步方法的高度可配置的动态模块（`registerAsync()`,`forRootAsync()` 等）很复杂，尤其是对于新人来说。简单来说，Nest 提供 `ConfigurableModuleBuilder` 类，它在几行代码中构建模块“蓝图”。

例如，让我们将上面的 `IdGeneratorModule` 转换为使用 `ConfigurableModuleBuilder`。它保留了 `IdGeneratorModuleOptions` 接口，但构建器生成了注入令牌，因此不再需要 `ID_GENERATOR_OPTIONS` 常量。

在旁边创建一个新文件 `id-generator.module.ts`，命名 `id-generator.module-definition.ts`，并使用 `ConfigurableModuleBuilder` 构建 `IdGeneratorModule` 定义：

```typescript
import { ConfigurableModuleBuilder } from '@nestjs/common';
import type { IdGeneratorModuleOptions } from './id-generator.interfaces.js';

export const { ConfigurableModuleClass, MODULE_OPTIONS_TOKEN } =
  new ConfigurableModuleBuilder<IdGeneratorModuleOptions>().build();
```

接下来，更改 `id-generator.module.ts` 以扩展生成的 `ConfigurableModuleClass`：

```typescript
import { Module } from '@nestjs/common';
import { IdGenerator } from './id-generator.js';
import { ConfigurableModuleClass } from './id-generator.module-definition.js';

@Module({
  providers: [IdGenerator],
  exports: [IdGenerator],
})
export class IdGeneratorModule extends ConfigurableModuleClass {}
```

与任何动态模块一样，生成的方法返回的元数据扩展了 `@Module()` 装修师，所以 `IdGenerator` 与生成的选项提供程序一起提供和导出。

最后，更新 `IdGenerator` 注入生成的选项提供程序而不是 `ID_GENERATOR_OPTIONS` 令牌：

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { IdGeneratorModuleOptions } from './id-generator.interfaces.js';
import { MODULE_OPTIONS_TOKEN } from './id-generator.module-definition.js';

@Injectable()
export class IdGenerator {
  constructor(
    @Inject(MODULE_OPTIONS_TOKEN)
    private readonly options: IdGeneratorModuleOptions,
  ) {}

  generate(): string {
    return `${this.options.prefix}_${randomUUID()}`;
  }
}
```

扩展 `ConfigurableModuleClass` 不仅为 `IdGeneratorModule` 提供了 `register()` 方法（就像手动实现所做的那样），还提供了 `registerAsync()`，这允许消费者异步配置模块。例如，以下工厂从 [`@nestjs/config`](/application/configuration) 读取带有 `ConfigService` 的前缀：

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { IdGeneratorModule } from '../id-generator/id-generator.module.js';
import { UsersService } from './users.service.js';

@Module({
  imports: [
    IdGeneratorModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        prefix: configService.getOrThrow<string>('USER_ID_PREFIX'),
      }),
      inject: [ConfigService],
    }),
  ],
  providers: [UsersService],
})
export class UsersModule {}
```

这个 `registerAsync()` 方法获取具有以下属性的对象：

```typescript
{
  /**
   * Modules whose exported providers the factory, class, or existing
   * provider depends on.
   */
  imports?: ModuleMetadata['imports'];
  /**
   * Function returning options (or a Promise resolving to options) to configure the
   * module.
   */
  useFactory?: (...args: any[]) => Promise<ModuleOptions> | ModuleOptions;
  /**
   * Dependencies that a Factory may inject.
   */
  inject?: FactoryProvider['inject'];
  /**
   * Injection token resolving to a class that will be instantiated as a provider.
   * The class must implement the corresponding interface.
   */
  useClass?: Type<
    ConfigurableModuleOptionsFactory<ModuleOptions, FactoryClassMethodKey>
  >;
  /**
   * Injection token resolving to an existing provider. The provider must implement
   * the corresponding interface.
   */
  useExisting?: Type<
    ConfigurableModuleOptionsFactory<ModuleOptions, FactoryClassMethodKey>
  >;
  /**
   * List of parent module's providers that will be filtered to only provide necessary
   * providers for the 'inject' array.
   */
  provideInjectionTokensFrom?: Provider[];
}
```

让我们逐一了解这些属性：

- `imports`-要导入到动态模块中的模块，以便工厂、类或现有提供程序可以注入它们导出的提供程序。上面的示例导入 `ConfigModule` 以注入 `ConfigService`。
- `useFactory`-返回 options 对象的函数。可以是同步的，也可以是异步的。若要将依赖项注入工厂函数，请使用 `inject` 财产。上面的例子使用了这个变体。
- `inject`-注入到工厂函数中的依赖项数组。依赖项的顺序必须与工厂函数的参数顺序相匹配。
- `useClass`-作为提供程序实例化的类。类必须实现相应的接口，默认情况下，这意味着提供一个 `create()` 方法，返回 options 对象。看 [Custom options factory class](#custom-options-factory-class) 以下。
- `useExisting`-的变体 `useClass` 重用现有提供程序而不是指示 Nest 创建类的新实例。提供程序必须实现与 `useClass` 类（因此必须提供 `create()` 方法，除非更改方法名称，如中所述 [Custom options factory class](#custom-options-factory-class) 下面）。
- `provideInjectionTokensFrom`-与 `useFactory`（或 `useExisting`）和 `inject`：提供程序列表 Nest 选择列出的 `inject` 并将它们注册到动态模块中。当模块将自己的选项传递给它异步配置的嵌套模块时，这非常有用。

总是准确选择其中之一 `useFactory`,`useClass`，和 `useExisting`，因为它们是互斥的。

#### 自定义方法密钥

默认情况下，`ConfigurableModuleClass` 提供 `register()` 方法及其 `registerAsync()` 对应物。若要使用不同的方法名称，请使用 `ConfigurableModuleBuilder#setClassMethodName` 方法。例如，如果要为整个应用程序配置一次模块，则 [社区指引](#community-guidelines) 建议 `forRoot()`：

```typescript
export const { ConfigurableModuleClass, MODULE_OPTIONS_TOKEN } =
  new ConfigurableModuleBuilder<IdGeneratorModuleOptions>()
    .setClassMethodName('forRoot')
    .build();
```

这说明 `ConfigurableModuleBuilder` 生成一个类，该类公开 `forRoot()` 和 `forRootAsync()` 相反：

```typescript
@Module({
  imports: [
    IdGeneratorModule.forRoot({ prefix: 'id' }), // <-- note "forRoot" instead of "register"
    // or alternatively:
    // IdGeneratorModule.forRootAsync({
    //   useFactory: () => ({ prefix: 'id' }),
    //   inject: [...any extra dependencies...],
    // }),
  ],
})
export class AppModule {}
```

#### 自定义选项工厂类

因为 `registerAsync()` 方法（或 `forRootAsync()`，或任何其他名称，取决于配置）让消费者传递解析为模块选项的提供程序定义，消费者还可以提供构造选项对象的类：

```typescript
@Module({
  imports: [
    IdGeneratorModule.registerAsync({
      useClass: IdGeneratorConfigService,
    }),
  ],
})
export class UsersModule {}
```

默认情况下，此类必须提供 `create()` 方法返回模块选项。这个 `ConfigurableModuleOptionsFactory` 接口，从 `@nestjs/common`，描述了这份合同：

```typescript
import { ConfigurableModuleOptionsFactory, Injectable } from '@nestjs/common';
import type { IdGeneratorModuleOptions } from '../id-generator/id-generator.interfaces.js';

@Injectable()
export class IdGeneratorConfigService
  implements ConfigurableModuleOptionsFactory<IdGeneratorModuleOptions, 'create'>
{
  create(): IdGeneratorModuleOptions {
    return { prefix: 'usr' };
  }
}
```

如果库遵循不同的命名约定，请指示 `ConfigurableModuleBuilder` 期望不同的方法，例如，`createIdGeneratorOptions`，与 `ConfigurableModuleBuilder#setFactoryMethodName` 方法：

```typescript
export const { ConfigurableModuleClass, MODULE_OPTIONS_TOKEN } =
  new ConfigurableModuleBuilder<IdGeneratorModuleOptions>()
    .setFactoryMethodName('createIdGeneratorOptions')
    .build();
```

现在 `IdGeneratorConfigService` 类必须公开 `createIdGeneratorOptions()` 方法，而不是 `create()`：

```typescript
@Module({
  imports: [
    IdGeneratorModule.registerAsync({
      useClass: IdGeneratorConfigService, // <-- this class must provide the "createIdGeneratorOptions" method
    }),
  ],
})
export class UsersModule {}
```

#### 附加选项

在某些情况下，模块需要额外的选项来决定它的行为，但这不应该包含在 `MODULE_OPTIONS_TOKEN` 提供程序，因为它们与在模块中注册的提供程序无关。一个很好的例子是 `isGlobal` 旗帜：`IdGenerator` 不需要知道它的主机模块是否注册为全局模块。

对于这些选项，请使用 `ConfigurableModuleBuilder#setExtras` 方法：

```typescript
export const { ConfigurableModuleClass, MODULE_OPTIONS_TOKEN } =
  new ConfigurableModuleBuilder<IdGeneratorModuleOptions>()
    .setExtras(
      {
        isGlobal: false,
      },
      (definition, extras) => ({
        ...definition,
        global: extras.isGlobal,
      }),
    )
    .build();
```

第一个参数传递给 `setExtras` 方法是具有额外属性默认值的对象。第二个参数是一个函数，它接收自动生成的模块定义（使用 `providers`,`exports` 等）和 `extras` 对象，它保存额外的属性（由使用者或默认值指定）。函数返回修改后的模块定义。在本例中，`extras.isGlobal` 属性分配给 `global` 模块定义的属性，它确定模块是否是全局的（请参见 [Dynamic modules](/modules#dynamic-modules) 在模块章节中）。

现在，在导入此模块时，消费者可以传递额外的 `isGlobal` 旗。例如，对其所有标识符使用一个前缀的应用程序可以全局注册一次模块：

```typescript
@Module({
  imports: [
    IdGeneratorModule.register({
      isGlobal: true,
      prefix: 'id',
    }),
  ],
})
export class AppModule {}
```

但是，由于 `isGlobal` 被声明为额外属性，因此它不是 `MODULE_OPTIONS_TOKEN` 提供的 options 对象的一部分：

```typescript
@Injectable()
export class IdGenerator {
  constructor(
    @Inject(MODULE_OPTIONS_TOKEN)
    private readonly options: IdGeneratorModuleOptions,
  ) {
    // "options" object will not have the "isGlobal" property
    // ...
  }
}
```

#### 扩展自动生成方法

自动生成的静态方法（`register()`,`registerAsync()` 等）如果需要，可以扩展，如下所示：

```typescript
import { DynamicModule, Module } from '@nestjs/common';
import { IdGenerator } from './id-generator.js';
import {
  ASYNC_OPTIONS_TYPE,
  ConfigurableModuleClass,
  OPTIONS_TYPE,
} from './id-generator.module-definition.js';

@Module({
  providers: [IdGenerator],
  exports: [IdGenerator],
})
export class IdGeneratorModule extends ConfigurableModuleClass {
  static register(options: typeof OPTIONS_TYPE): DynamicModule {
    return {
      // your custom logic here
      ...super.register(options),
    };
  }

  static registerAsync(options: typeof ASYNC_OPTIONS_TYPE): DynamicModule {
    return {
      // your custom logic here
      ...super.registerAsync(options),
    };
  }
}
```

注意 `OPTIONS_TYPE` 和 `ASYNC_OPTIONS_TYPE` 类型，必须从模块定义文件中导出：

```typescript
export const {
  ConfigurableModuleClass,
  MODULE_OPTIONS_TOKEN,
  OPTIONS_TYPE,
  ASYNC_OPTIONS_TYPE,
} = new ConfigurableModuleBuilder<IdGeneratorModuleOptions>().build();
```
