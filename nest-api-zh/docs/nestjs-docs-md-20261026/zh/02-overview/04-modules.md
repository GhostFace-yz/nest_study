# Modules

Source: https://docs.nestjs.com/modules

模块是一个类，注释为 `@Module()` 装修师。装饰器提供的元数据是**Nest**用于组织和管理应用程序结构。

<figure><img class="illustrative-image" src="https://docs.nestjs.com/assets/Modules_1.png" /></figure>

每一 Nest 应用程序至少有一个模块，即**根模块**。这是起点 Nest 构建**应用程序图**，即内部结构 Nest 用于解决模块和提供程序之间的关系和依赖关系。一个非常小的应用程序可能只有一个根模块，但大多数应用程序都有多个模块，每个模块都封装了一组密切相关的**能力**。模块是组织组件的**推荐**方式。

这个 `@Module()`decorator 获取一个具有描述模块的属性的单个对象：

| | |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `providers` | 将由 Nest 注射器，并且可以至少跨该模块共享 |
| `controllers` | 在此模块中定义的必须实例化的控制器集 |
| `imports` | 导出此模块所需提供程序的导入模块列表 |
| `exports` | 的子集 `providers` 该模块提供了该模块，并且导入该模块的其他模块应该可以使用该模块。您可以使用提供程序本身或其令牌（`provide` 值） |

默认情况下，模块会**封装**其提供程序：您只能注入当前模块的一部分或由导入模块显式导出的提供程序。模块的导出提供程序形成其公共接口，或 API。

#### 特征模块

在我们的例子中，`CatsController` 和 `CatsService` 密切相关，服务于同一个应用领域，因此将它们分组到一个功能模块中是有意义的。功能模块为特定功能组织代码，从而保持边界清晰。随着应用程序或团队的成长，这一点变得更加重要，并且它与 [SOLID](https://en.wikipedia.org/wiki/SOLID) 原则。

接下来，我们将创建 `CatsModule` 将控制器和服务分组：

```typescript
import { Module } from '@nestjs/common';
import { CatsController } from './cats.controller.js';
import { CatsService } from './cats.service.js';

@Module({
  controllers: [CatsController],
  providers: [CatsService],
})
export class CatsModule {}
```

> info **Hint** 要使用 CLI 创建模块，请运行 `$ nest g module cats`。

上面，我们定义了 `CatsModule` 在 `cats.module.ts` 文件并将与之相关的所有内容移动到 `cats` 目录。最后一步是将此模块导入到根模块中（`AppModule` 定义在 `app.module.ts` 文件）：

```typescript
import { Module } from '@nestjs/common';
import { CatsModule } from './cats/cats.module.js';

@Module({
  imports: [CatsModule],
})
export class AppModule {}
```

目录结构现在如下所示：

<div class="file-tree">
  <div class="item">src</div>
  <div class="children">
    <div class="item">cats</div>
    <div class="children">
      <div class="item">dto</div>
      <div class="children">
        <div class="item">create-cat.dto.ts</div>
      </div>
      <div class="item">interfaces</div>
      <div class="children">
        <div class="item">cat.interface.ts</div>
      </div>
      <div class="item">cats.controller.ts</div>
      <div class="item">cats.module.ts</div>
      <div class="item">cats.service.ts</div>
    </div>
    <div class="item">app.module.ts</div>
    <div class="item">main.ts</div>
  </div>
</div>

#### 共享模块

在 Nest 默认情况下，模块是**单例**，因此您可以在多个模块之间共享任何提供程序的相同实例。

<figure><img class="illustrative-image" src="https://docs.nestjs.com/assets/Shared_Module_1.png" /></figure>

每个模块自动成为一个**共享模块**：一旦创建，它可以被任何其他模块重用。假设您想共享一个实例 `CatsService` 在其他几个模块之间。为此，首先**导出**`CatsService` 通过将其添加到模块的提供程序 `exports` 数组：

```typescript
import { Module } from '@nestjs/common';
import { CatsController } from './cats.controller.js';
import { CatsService } from './cats.service.js';

@Module({
  controllers: [CatsController],
  providers: [CatsService],
  exports: [CatsService],
})
export class CatsModule {}
```

任何导入的模块 `CatsModule` 现在可以访问 `CatsService` 并与导入它的每个其他模块共享相同的实例。

注册 `CatsService` 直接在每个需要它的模块中也可以工作，但是每个模块都会得到它自己的服务的单独实例。多个实例会增加内存使用量，并可能导致意外行为，例如如果服务持有内部状态，则状态不一致。

封装 `CatsService` 在模块中，例如 `CatsModule` 并导出它确保每个导入的模块 `CatsModule` 重用相同的实例。这减少了内存消耗，并使行为更可预测，因为共享状态和资源在一个地方进行管理。在整个应用程序中高效地共享服务是模块化和依赖注入的主要好处之一。

#### 模块再导出

如上所示，模块可以导出它们的内部提供程序。他们还可以重新导出导入的模块。在下面的示例中，`CommonModule` 既导入到**中，又从 `CoreModule` 导出**，这使得任何导入 `CoreModule` 的模块都可以使用它。

```typescript
@Module({
  imports: [CommonModule],
  exports: [CommonModule],
})
export class CoreModule {}
```

#### 依赖注入

模块类还可以**注入**提供程序（例如，出于配置目的）：

```typescript
import { Module } from '@nestjs/common';
import { CatsController } from './cats.controller.js';
import { CatsService } from './cats.service.js';

@Module({
  controllers: [CatsController],
  providers: [CatsService],
})
export class CatsModule {
  constructor(private catsService: CatsService) {}
}
```

但是，由于 [循环依赖关系](/fundamentals/circular-dependency)，模块类本身不能作为提供程序注入。

#### 全局模块

到处导入同一组模块可能会变得乏味。在 [Angular](https://angular.dev),`providers` 在全局范围内注册，一旦定义，就可以在任何地方使用。Nest 相比之下，将提供程序封装在模块范围内：如果不首先导入封装它们的模块，就不能在其他地方使用模块的提供程序。

若要使一组提供程序开箱即用（例如，助手或数据库连接），请使用 `@Global()` 装饰师：

```typescript
import { Module, Global } from '@nestjs/common';
import { CatsController } from './cats.controller.js';
import { CatsService } from './cats.service.js';

@Global()
@Module({
  controllers: [CatsController],
  providers: [CatsService],
  exports: [CatsService],
})
export class CatsModule {}
```

这个 `@Global()`decorator 使模块具有全局作用域。注册全局模块**仅一次**，通常在根模块或核心模块中。在上面的例子中，`CatsService` 提供程序随处可见，注入它的模块不需要添加 `CatsModule` 给他们的 `imports` 阵列。

> info **Hint** 让一切都全球化并不是一种推荐的设计实践。全局模块减少了样板，但是 `imports` 数组使模块的 API 以受控的、显式的方式提供给其他模块。这样可以保持应用程序结构的可维护性，仅共享其他人需要的模块部分，并避免应用程序不相关部分之间不必要的耦合。

#### 动态模块

动态模块允许您创建在运行时配置的模块。当模块的提供程序依赖于导入它的模块提供的选项时，它们非常有用。例如，以下 `FeatureFlagsModule` 通过其静态接收应用程序的功能标志 `forRoot()` 方法：

```typescript
import { DynamicModule, Module } from '@nestjs/common';
import { FEATURE_FLAGS } from './feature-flags.constants.js';
import { FeatureFlagsService } from './feature-flags.service.js';

@Module({
  providers: [FeatureFlagsService],
  exports: [FeatureFlagsService],
})
export class FeatureFlagsModule {
  static forRoot(flags: Record<string, boolean>): DynamicModule {
    return {
      module: FeatureFlagsModule,
      providers: [{ provide: FEATURE_FLAGS, useValue: flags }],
    };
  }
}
```

`FEATURE_FLAGS` 注入令牌是一个纯常数（`export const FEATURE_FLAGS = 'FEATURE_FLAGS';`），如 [Non-class-based provider tokens](/fundamentals/custom-providers#non-class-based-provider-tokens) 中所述。

> info **Hint** `forRoot()` 方法可以同步或异步地（即，经由 `Promise`）返回动态模块。

返回的属性 `forRoot()`**扩展**（而不是覆盖）中定义的元数据 `@Module()` 装修师。因此，得到的模块同时具有静态声明的 `FeatureFlagsService` 以及动态注册的 `FEATURE_FLAGS` 供应商。因为它们属于同一个模块，所以服务可以注入标志：

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { FEATURE_FLAGS } from './feature-flags.constants.js';

@Injectable()
export class FeatureFlagsService {
  constructor(
    @Inject(FEATURE_FLAGS) private readonly flags: Record<string, boolean>,
  ) {}

  isEnabled(flag: string): boolean {
    return this.flags[flag] ?? false;
  }
}
```

模块仅导出 `FeatureFlagsService` 因此，标志本身仍然是模块的实现细节。

导入并配置 `FeatureFlagsModule` 如下：

```typescript
import { Module } from '@nestjs/common';
import { FeatureFlagsModule } from './feature-flags/feature-flags.module.js';

@Module({
  imports: [
    FeatureFlagsModule.forRoot({
      newCheckout: true,
      betaDashboard: false,
    }),
  ],
})
export class AppModule {}
```

仅导入的模块 `FeatureFlagsModule.forRoot()` 可注射 `FeatureFlagsService`.呼叫 `forRoot()` 再次在另一个模块中创建第二个单独配置的实例。要共享单个实例，请配置一次模块，然后重新导出它。若要重新导出动态模块，请在 `exports` 数组，无需调用 `forRoot()` 再次：

```typescript
import { Module } from '@nestjs/common';
import { FeatureFlagsModule } from '../feature-flags/feature-flags.module.js';

@Module({
  imports: [
    FeatureFlagsModule.forRoot({
      newCheckout: true,
      betaDashboard: false,
    }),
  ],
  exports: [FeatureFlagsModule],
})
export class CoreModule {}
```

每个导入的模块 `CoreModule` 现在可以注射 `FeatureFlagsService`，并且它们都共享相同的标志。

或者，要在全局作用域中注册动态模块，请在 `forRoot()` 返回的对象中将 `global` 属性设置为 `true`。`FeatureFlagsService` 然后可以在任何地方注入，无需导入任何模块：

```typescript
return {
  global: true,
  module: FeatureFlagsModule,
  providers: [{ provide: FEATURE_FLAGS, useValue: flags }],
};
```

> warning **Warning** 如上所述，让一切都全球化**不是一个好的设计决策**。

仅在运行时已知的选项，如 `ConfigService` 读取的值，调用 `forRoot()` 的异步变体。[Dynamic modules](/fundamentals/dynamic-modules) 章涵盖了这一点以及更多内容。

> info **Hint** 了解如何使用 `ConfigurableModuleBuilder`，参见 [Configurable module builder](/fundamentals/dynamic-modules#configurable-module-builder) 部分。
