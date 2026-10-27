# Providers

Source: https://docs.nestjs.com/providers

提供者是 Nest 中的一个核心概念。许多基本的 Nest 类，如服务、存储库、工厂和助手，可以被视为提供程序。提供程序背后的主要思想是，它可以作为依赖项被**注入**，这让对象之间形成关系。Nest 运行时负责“连接”这些对象。

<figure><img class="illustrative-image" src="https://docs.nestjs.com/assets/Components_1.png" /></figure>

在上一章中，我们构建了一个基本的 `CatsController`.控制器应处理 HTTP 请求并将更复杂的任务委托给**提供者**。在最简单的形式中，提供者是简单的 JavaScript 中列出的类 `providers` 模块的数组。有关详细信息，请参阅 [Modules](/modules) 篇章。

> info **Hint** Nest 允许您以面向对象的方式设计和组织依赖项，因此最好遵循 [SOLID 原则](https://en.wikipedia.org/wiki/SOLID)。

#### 服务

让我们从创建一个 `CatsService` 开始。此服务处理 `CatsController` 的数据存储和检索。因为它封装了应用程序逻辑，所以它是提供者的自然候选。

```typescript
import { Injectable } from '@nestjs/common';
import type { Cat } from './interfaces/cat.interface.js';

@Injectable()
export class CatsService {
  private readonly cats: Cat[] = [];

  create(cat: Cat) {
    this.cats.push(cat);
  }

  findAll(): Cat[] {
    return this.cats;
  }
}
```

> info **Hint** 要使用 CLI 创建服务，请运行 `$ nest g service cats`。

`CatsService` 是一个具有一个属性和两个方法的基类。关键的补充是 `@Injectable()` 装修师。它将元数据附加到类，声明 `CatsService` 可以由 Nest[IoC](https://en.wikipedia.org/wiki/Inversion_of_control) 容器。

该示例还使用了 `Cat` 接口：

```typescript
export interface Cat {
  name: string;
  age: number;
  breed: string;
}
```

现在我们有了存储和检索猫的服务，让我们在 `CatsController` 中使用它：

```typescript
import { Controller, Get, Post, Body } from '@nestjs/common';
import { CreateCatDto } from './dto/create-cat.dto.js';
import { CatsService } from './cats.service.js';
import type { Cat } from './interfaces/cat.interface.js';

@Controller('cats')
export class CatsController {
  constructor(private catsService: CatsService) {}

  @Post()
  async create(@Body() createCatDto: CreateCatDto) {
    this.catsService.create(createCatDto);
  }

  @Get()
  async findAll(): Promise<Cat[]> {
    return this.catsService.findAll();
  }
}
```

`CatsService` 是通过类构造函数**注入**的。下一节解释如何 Nest 解决它。

#### 依赖注入

Nest 是围绕**依赖注入**设计模式构建的。有关该概念的介绍，请参见 [Angular documentation](https://angular.dev/guide/di)。

Nest 按类型解析依赖项。在下面的示例中，Nest 通过提供 `CatsService` 的实例来解析 `catsService`。使用默认（singleton）作用域，Nest 创建一次实例，并与依赖它的每个类共享它。Nest 然后将实例传递给控制器的构造函数：

```typescript
constructor(private catsService: CatsService) {}
```

这行有两件事：

- 这个 `private` 关键词制作 `catsService` 一个 TypeScript**参数属性**：它声明一个 `catsService` 类上的成员，并将构造函数参数分配给它，因此您不必编写 `this.catsService = catsService` 你自己。
- 这个 `CatsService` 类型注释是什么 Nest 决心反对。在编译时，TypeScript 将构造函数的参数类型作为元数据发出，容器读取该元数据以确定提供给哪个提供程序。

> warning **Warning** 因为解析依赖于发出的类型，所以注释必须引用运行时存在的东西，即**类**。接口和类型别名在编译过程中被删除。如果 `AppConfig` 是一个接口， `constructor(private config: AppConfig)` 叶子 Nest 没有要查找的令牌，并且应用程序在启动时失败，显示“Nest 无法解析依赖项”错误。导入类时也会发生同样的情况 `import type`，因为导入也被删除了。要注入不是类的东西，请在令牌下注册它，然后用 `@Inject()` 如中所述 [Custom providers](/fundamentals/custom-providers#interfaces-and-abstract-classes).

#### 范围

默认情况下，提供程序的生命周期（“范围”）与应用程序生命周期相匹配。当应用程序引导时，Nest 解析每个依赖关系，这意味着每个提供程序都被实例化。同样，当应用程序关闭时，每个提供程序都会被销毁。您还可以给提供程序一个不同的作用域，例如，使其具有**请求作用域**，以便其生命周期与单个请求绑定。参见 [Injection scopes](/fundamentals/injection-scopes) 详情见章节。

#### 定制提供者

Nest 有一个内置的控制反转（IoC）容器，用于管理提供程序之间的关系。该容器支持依赖注入，并且支持的不仅仅是目前为止显示的基于类的提供程序：您还可以使用纯值、类以及同步或异步工厂来定义提供程序。例如，请参见 [Custom providers](/fundamentals/custom-providers) 篇章。

#### 可选提供者

有些依赖关系并不总是必需的。例如，类可能依赖于**配置对象**，但当没有提供默认值时，类会回落到默认值。这种依赖关系是可选的，它的缺失不应该导致错误。

若要将依赖项标记为可选，请应用 `@Optional()` 装饰器到构造函数参数：

```typescript
import { Injectable, Optional, Inject } from '@nestjs/common';

@Injectable()
export class HttpService<T> {
  constructor(@Optional() @Inject('HTTP_OPTIONS') private httpClient: T) {}
}
```

此示例注入了一个自定义提供程序，因此它将 `HTTP_OPTIONS` 自定义**token**传递给 `@Inject()`。前面的示例使用了基于构造函数的注入，其中每个依赖项由构造函数签名中的类标识。有关自定义提供程序及其令牌的更多信息，请参见 [Custom providers](/fundamentals/custom-providers) 章节。

`@Optional()` 仅影响提供程序为 _missing_ 时发生的情况：如果没有在 `HTTP_OPTIONS`,Nest 注射 `undefined` 而不是在启动时失败。因此，该类负责回退，通常是通过在一组默认值上合并注入的值（如果有的话）。

#### 基于属性的注入

到目前为止，示例使用基于构造函数的注入，其中提供程序通过构造函数注入。在某些情况下，**基于属性的注入**更方便。例如，如果基类依赖于一个或多个提供程序，则通过 `super()` 从每个子类变得麻烦。相反，您可以应用 `@Inject()` 直接到属性的装饰器：

```typescript
import { Injectable, Inject } from '@nestjs/common';

@Injectable()
export class HttpService<T> {
  @Inject('HTTP_OPTIONS')
  private readonly httpClient: T;
}
```

> warning **Warning** 如果您的类不扩展另一个类，请首选**基于构造函数的**注入。构造函数显式地陈述了类需要哪些依赖项，这使得代码比用 `@Inject()` 注释的属性更容易理解。

#### 提供者注册

有了提供者(`CatsService`) 和使用者(`CatsController`)，您需要向 Nest 注册服务，以便它可以执行注入。为此，请将服务添加到模块文件(`app.module.ts`) 中 `@Module()` 装饰器的 `providers` 数组中：

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

Nest 现在可以解析 `CatsController` 班级。

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
<div class="item">cats.service.ts</div>
</div>
<div class="item">app.module.ts</div>
<div class="item">main.ts</div>
</div>
</div>

#### 手动实例化

目前为止，Nest 已自动解决依赖项。在某些情况下，您可能需要走出依赖注入系统，手动检索或实例化提供程序。两种技术涵盖了这些情况：

- 若要动态检索现有实例或实例化提供程序，请使用 `ModuleRef`，描述于 [Module reference](/fundamentals/module-ref) 篇章。
- 要在 `bootstrap()` 函数中获取提供程序（例如，对于独立应用程序或在引导期间使用配置服务），请参见 [Standalone applications](/standalone-applications)。
