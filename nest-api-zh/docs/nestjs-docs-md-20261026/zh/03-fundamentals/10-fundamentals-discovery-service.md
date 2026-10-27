# Discovery service

Source: https://docs.nestjs.com/fundamentals/discovery-service

这个 `DiscoveryService`，由 `@nestjs/core` 包，允许您动态检查和检索提供程序、控制器及其元数据 NestJS 应用。这在构建依赖于运行时自省的插件、装饰器或高级特性时尤其有用，并允许您构建具有自动化、动态行为的更灵活、模块化的体系结构。

#### 入门

使用前 `DiscoveryService`，导入 `DiscoveryModule` 进入您打算使用它的模块。这使得服务可用于依赖注入：

```typescript
import { Module } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { ExampleService } from './example.service.js';

@Module({
  imports: [DiscoveryModule],
  providers: [ExampleService],
})
export class ExampleModule {}
```

设置好模块后，就可以注入 `DiscoveryService` 进入任何需要动态发现的提供者：

```typescript
@Injectable()
export class ExampleService {
  constructor(private readonly discoveryService: DiscoveryService) {}
}
```

#### 发现提供者和控制者

一项关键能力 `DiscoveryService` 正在检索应用程序中的所有注册提供程序，这对于根据特定条件动态处理提供程序非常有用。以下代码段检索所有提供程序：

```typescript
const providers = this.discoveryService.getProviders();
console.log(providers);
```

每个返回的对象都是一个 `InstanceWrapper`，其中保存提供程序的实例、令牌和类等信息（`metatype`).同样，要检索应用程序中的所有注册控制器，请使用：

```typescript
const controllers = this.discoveryService.getControllers();
console.log(controllers);
```

当需要动态处理控制器时，这非常有用，例如，用于分析跟踪或自动注册机制。

两种方法都接受可选的选项对象。通过 `include` 将发现限制在这些模块的模块类数组：

```typescript
const providers = this.discoveryService.getProviders({
  include: [CatsModule],
});
```

#### 提取元数据

除了发现提供者和控制者之外，`DiscoveryService` 还检索附加到这些组件的元数据。当使用在运行时存储元数据的自定义装饰器时，这一点尤其有价值。

例如，考虑使用特定元数据标记提供程序的自定义装饰器：

```typescript
import { DiscoveryService } from '@nestjs/core';

export const FeatureFlag = DiscoveryService.createDecorator();
```

将此装饰器应用于服务会存储以后可以查询的元数据：

```typescript
import { Injectable } from '@nestjs/common';
import { FeatureFlag } from './custom-metadata.decorator.js';

@Injectable()
@FeatureFlag('experimental')
export class CustomService {}
```

以这种方式将元数据附加到提供程序后，您可以使用 `DiscoveryService` 根据分配的元数据筛选提供程序。以下代码段检索用特定元数据值标记的提供程序：

```typescript
const providers = this.discoveryService.getProviders();

const [provider] = providers.filter(
  (item) =>
    this.discoveryService.getMetadataByDecorator(FeatureFlag, item) ===
    'experimental',
);

console.log(
  'Providers with the "experimental" feature flag metadata:',
  provider,
);
```

创建的装饰器 `DiscoveryService.createDecorator()` 还要注册它们装饰的类，这样您就可以通过传递装饰器的 `KEY` 作为 `metadataKey` 选项，而不是自己过滤所有提供者：

```typescript
const providers = this.discoveryService.getProviders({
  metadataKey: FeatureFlag.KEY,
});
```

同样的装饰器也可以应用于方法。若要读取方法级元数据，请将方法名作为第三个参数传递给 `getMetadataByDecorator()`。

#### 结论

`DiscoveryService` 启用运行时自省 NestJS 应用。通过动态发现提供者、控制器及其元数据，无论您是需要扫描和处理提供者、提取元数据进行进一步处理，还是构建模块化架构，它都可以作为可扩展框架、插件和自动化驱动功能的构建模块。
