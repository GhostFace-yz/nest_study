# Manual instrumentation

Source: https://docs.nestjs.com/observability/manual-instrumentation

大部分 SDK 是自动仪器：您配置一次，它就会决定记录什么。`TracerService` 是手动的一半。将其注入应用程序中的任何位置，以在已跟踪的请求中添加跨度，将上下文附加到该请求，捕获您自己处理的错误，并报告您自己的指标。

```typescript
import { Injectable } from '@nestjs/common';
import { TracerService } from '@nestjs/observe';

@Injectable()
export class CatsService {
  constructor(private readonly tracerService: TracerService) {}
}
```

`ObserveModule.forRoot()` 注册导出的全局模块 `TracerService`，因此您可以将其注入到任何模块中，而无需导入 `ObserveModule` 再来一次。（`forRootAsync()` 也是全球性的，除非你通过 `global: false`.) 每个方法都从环境异步上下文中读取跟踪，因此在请求、作业或其他插入操作之外调用一个方法会抛出：没有要附加的跟踪。这是故意的，因为静默下降的跨度比错误更难被注意到。例外情况是 `currentTraceId()`，它返回 `null` 相反，并且 [自定义指标](#custom-metrics)，与痕迹无关。

#### 创建跨度

`createSpan(name, callback)` 在嵌套在当前活动跨度下的新跨度内运行回调，并返回回调返回值的承诺。跨度的持续时间就是回调的持续时间，所以 `await` 您想要测量的任何东西：

```typescript
async findOne(id: string, activeUser: ActiveUserData) {
  return this.tracerService.createSpan('cats.findOne', async (span) => {
    span.addTags({ userId: activeUser.sub, catId: id });
    return this.catsRepository.findOne(id);
  });
}
```

通过调用堆栈跨越嵌套：a`createSpan()` 在另一个里面 `createSpan()` 回调成为它的子级，它会在跟踪详细信息页面上生成瀑布。回调可以是同步的或异步的。自动插入的跨度（控制器方法、提供程序、数据库调用）和您的自定义跨度共享同一棵树，因此手动命名的跨度会准确地出现在它相对于其他所有内容运行的位置。

这个 `span` 论点是 `TraceSpanDelegate`.其 `addTags(tags)` 方法（或 `setTag(key, value)` 对于单个条目）将键值对单独附加到该跨度。喜欢 `tags`/`setAttributes` 中描述的选项 [SDK → Tags and custom attributes](/observability/sdk#tags-and-custom-attributes)，它们是可搜索的，并显示在跟踪视图的跨度上。区别在于范围：这些选项涵盖每个请求，而这些标签涵盖一个跨度。

`activeSpan()` 决心 `TraceSpanDelegate` 的当前活动跨度，而不创建新跨度。使用它来标记未创建封闭跨度的代码：

```typescript
const span = await this.tracerService.activeSpan();
span.addTags({ cacheHit: 'false' });
```

如果当前跟踪没有活动的跨度，它将拒绝。

<figure><img src="https://www.observe.nestjs.com/docs/sdk/spans.webp" alt="Spans" /></figure>

> info **Hint** **Spans**分析视图按跨度名称聚合，跨越调用它们的每条路由。选择描述作品的名称（`orders.recalculate`,`cache.lookup`）而不是呼叫者，因此仪表板可以告诉您某个东西是在任何地方都很慢，还是只从一个端点开始。

#### 捕获处理错误

会自动记录在控制器、作业或跨度之外传播的错误。`captureError()` 适用于那些没有：您捕获和处理但仍希望在仪表板中可见的任何内容：

```typescript
try {
  await this.billing.sync(accountId);
} catch (error) {
  await this.tracerService.captureError(error as Error, {
    accountId,
    retryable: 'true',
  });
}
```

错误附加到当前跟踪，可选标记记录在它旁边，并获得与任何其他捕获的错误相同的源上下文处理，如果 [`sourceContext`](/observability/sdk#error-source-context) 已启用。

#### 请求范围属性

`setAttribute(key, value)` 和 `getAttribute(key)` 写入和读取跟踪自己的上下文存储。它的值在请求期间有效，并且可以从下游的任何地方读取，而无需通过每个函数签名：

```typescript
this.tracerService.setAttribute('tenantId', tenant.id);
// ...later, in a different service on the same request
const tenantId = this.tracerService.getAttribute('tenantId');
```

`getAttribute()` 回报 `undefined` 对于一把从未设置过的钥匙。当在跟踪上下文之外调用时，两者都会抛出。

跟踪 id 存在于同一存储中，因此 `getAttribute(traceIdKey)` 检索当前跟踪 id，例如，以与外部系统或 [将其传播到其他服务](/observability/distributed-tracing) 相关联。`currentTraceId()` 是查找简写，有一个刻意的区别：它在跟踪上下文之外返回 `null`，而不是抛出，因为当还没有跟踪时，可以合法地将跟踪 id 转发到下游。

要键入存储，请将其形状传递为 `TracerService` 的第一个类型参数。然后对照它检查键和值，包括嵌套路径：

```typescript
interface RequestStore {
  tenantId: string;
  flags: { betaCheckout: boolean };
}

@Injectable()
export class CheckoutService {
  constructor(private readonly tracerService: TracerService<RequestStore>) {}

  enableBeta() {
    this.tracerService.setAttribute('flags.betaCheckout', true);
  }
}
```

> info **Hint** `ObserveModule` 还导出 `AsyncLocalStorage` 保存跟踪上下文的实例。`setAttribute()`/`getAttribute()` 是到达它的支持方式；只有当你需要他们不暴露的东西时，才直接注入商店。如果您已经使用了中描述的模式 [Async local storage](/recipes/async-local-storage) 食谱，这家店可以代替你手擀的。

#### 自定义指标

有三种度量类型可用，每种类型都是按名称创建的（如果名称已经存在，则可以检索）。它们报告到仪表板的**自定义**部分，您可以像任何内置指标一样提醒它们。

与上面的方法不同，度量不绑定到跟踪，因此您可以从任何地方报告它们，包括启动和关闭代码，`onModuleInit()` 钩子和 cron 作业。

| 方法 | 为了 | 报告方法 |
| --------- | -------------------------------------------------------------------------- | ---------------- |
| `counter` | 只会增加的值 - 已发送的请求、下的订单、尝试的重试次数 | `increment()` |
| `gauge` | 上下移动的值 - 队列深度、活动连接、缓存比率 | `increment()`,`decrement()`,`setValue(value)` |
| `summary` | 您想要超过分位数的分布 - 延迟、有效载荷大小 | `observe(value)` |

```typescript
this.tracerService
  .counter('cats.lookups', { description: 'Number of cat lookups' })
  .increment();

this.tracerService
  .gauge('cats.active.sessions', {
    kind: 'ratio',
    initialValue: 0,
    description: 'Number of active sessions',
  })
  .increment();

const latency = this.tracerService.summary('cats.lookup.duration', {
  description: 'Duration of cat lookups in milliseconds',
});
const startedAt = performance.now();
try {
  return await this.catsRepository.findOne(id);
} finally {
  // Observed in a finally so a failed lookup still lands in the distribution -
  // dropping the slow failures is how a latency summary ends up flattering itself.
  latency.observe(performance.now() - startedAt);
}
```

呼叫 `counter('orders.placed')` 两次返回相同的实例，因此您不需要在字段中保存引用，尽管在热路径中这样做更便宜。在以后的调用中传递属性会更新现有指标的描述和标签。

| 特征 | 适用于 | 描述 |
| -------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `description` | 计数器、仪表、汇总 | 显示在仪表板中的指标旁边。价值设置：一个裸露的度量名称很少能向未来的读者解释自己。 |
| `labels` | 计数器、仪表、汇总 | 指标按维度进行细分，因此图表可以拆分，而不是显示一条汇总线。 |
| `initialValue` | 计数器，仪表 | 起始值。仅在度量仍处于 `0`，因此重新启动时间声明不会覆盖已计数的值。 |
| `kind` | 测量 | `'ratio'`（默认值）对于每个报表独立的值，或 `'additive'` 对于跨报告实例求和的值。 |
| `sampleSize` | 总结 | 每个标签保留多少个观测值来计算分位数，这限制了负载下摘要的内存。 |

<figure><img src="https://www.observe.nestjs.com/docs/sdk/custom-metrics.webp" alt="Custom metrics" /></figure>

已声明但从未报告的度量读取为“未知”，而不是 `0` 在仪表板里。这是一个真实的状态，而不是缺失的数据：“我们从未听说过这个指标”和“这个指标目前为零”是不同的事实，显示第二个而不是第一个会隐藏一个失败的部署。

#### API 总结

| 方法 | 需要追踪 | 描述 |
| --------------------------------- | :-----------: | ------------------------------------------------------------------- |
| `createSpan(name, callback)` | ✓ | 运行 `callback` 在一个新的子跨度内；返回其结果 |
| `activeSpan()` | ✓ | 决心 `TraceSpanDelegate` 飞行跨度 |
| `captureError(error, tags?)` | ✓ | 在当前跟踪上记录处理错误 |
| `setAttribute(key, value)` | ✓ | 写入请求范围的上下文存储 |
| `getAttribute(key)` | ✓ | 从请求范围的上下文存储中读取 |
| `currentTraceId()` | ✗ | 活动跟踪 id，或 `null` 在痕迹之外 |
| `counter(name, attributes?)` | ✗ | 获取或创建单调递增指标 |
| `gauge(name, attributes?)` | ✗ | 获取或创建可以上下移动的度量 |
| `summary(name, attributes?)` | ✗ | 获取或创建带有分位数的分布指标 |

#### 下一步去哪里

- [Distributed tracing](/observability/distributed-tracing)- 使用 `currentTraceId()` 跨越服务边界保持一个跟踪。
- [Dashboard](/observability/dashboard)-显示跨度、捕获的错误和自定义指标的位置。
