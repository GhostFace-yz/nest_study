# Events

Source: https://docs.nestjs.com/application/events

这个 [Event Emitter](https://www.npmjs.com/package/@nestjs/event-emitter) 包装（`@nestjs/event-emitter`) 提供了一个观察者实现，允许您订阅和监听应用程序中发生的事件。事件是分离应用程序不同部分的好方法，因为单个事件可以有多个相互不依赖的侦听器。

`EventEmitterModule` 内部使用 [eventemitter2](https://github.com/EventEmitter2/EventEmitter2) 包装。

#### 入门

首先，安装所需的软件包：

```shell
$ npm i --save @nestjs/event-emitter
```

安装完成后，导入 `EventEmitterModule` 深入根源 `AppModule` 并称之为 `forRoot()` 静态方法，如下所示：

```typescript
import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';

@Module({
  imports: [
    EventEmitterModule.forRoot()
  ],
})
export class AppModule {}
```

这个 `.forRoot()` call 初始化事件发射器并注册应用程序中存在的任何声明性事件侦听器。注册发生在 `onApplicationBootstrap` 生命周期钩子，它确保所有模块都加载并声明了它们的事件侦听器。该模块注册为 [全局模块](/modules#global-modules) 默认情况下，您可以将事件发射器注入到任何位置，而无需导入 `EventEmitterModule` 再一次。要更改此设置 `global` 选项 `false`.

配置基础 `EventEmitter2` 实例，将配置对象传递给 `.forRoot()` 方法，如下：

```typescript
EventEmitterModule.forRoot({
  // set this to `true` to use wildcards
  wildcard: false,
  // the delimiter used to segment namespaces
  delimiter: '.',
  // set this to `true` if you want to emit the newListener event
  newListener: false,
  // set this to `true` if you want to emit the removeListener event
  removeListener: false,
  // the maximum amount of listeners that can be assigned to an event
  maxListeners: 10,
  // show event name in memory leak message when more than maximum amount of listeners is assigned
  verboseMemoryLeak: false,
  // disable throwing uncaughtException if an error event is emitted and it has no listeners
  ignoreErrors: false,
});
```

#### 调度事件

要调度（即触发）事件，首先注入 `EventEmitter2` 通过构造函数：

```typescript
constructor(private eventEmitter: EventEmitter2) {}
```

> info **Hint** 进口 `EventEmitter2` 从 `@nestjs/event-emitter` 包装。

然后在类中使用它，如下所示：

```typescript
this.eventEmitter.emit(
  'order.created',
  new OrderCreatedEvent({
    orderId: 1,
    payload: {},
  }),
);
```

#### 监听事件

若要声明事件侦听器，请用 `@OnEvent()` 装饰器，如下：

```typescript
@OnEvent('order.created')
handleOrderCreatedEvent(payload: OrderCreatedEvent) {
  // handle and process "OrderCreatedEvent" event
}
```

> info **Hint** 如果事件侦听器属于 [request-scoped](/fundamentals/injection-scopes) 供应商，Nest 为该提供程序处理的每个事件创建一个新实例。事件有效载荷取代了请求对象，因此注入 `REQUEST` 在那个提供者给你有效载荷。如果您发出的有效载荷是传入请求对象本身（或携带其上下文 ID），设置 `inheritRequestContextId` 选择 `forRoot()` 二 `true` 以便侦听器重用该请求的 DI 子树，而不是创建一个新的子树。

第一个参数可以是 `string` 或者一个 `symbol` 对于简单的事件发射器，以及 `string | symbol | Array<string | symbol>` 对于通配符发射器。

可选的第二个参数是侦听器选项对象：

```typescript
export type OnEventOptions = OnOptions & {
  /**
   * If "true", prepends (instead of appends) the given listener to the array of listeners.
   *
   * @see https://github.com/EventEmitter2/EventEmitter2#emitterprependlistenerevent-listener-options
   *
   * @default false
   */
  prependListener?: boolean;

  /**
   * If "true", errors thrown by the onEvent callback are logged instead of rethrown. If "false", they are rethrown.
   *
   * @default true
   */
  suppressErrors?: boolean;
};
```

> info **Hint** 要了解有关 `OnOptions` 对象的更多信息，请参见 [`eventemitter2` documentation](https://github.com/EventEmitter2/EventEmitter2#emitteronevent-listener-options-objectboolean)。

例如，以下侦听器异步运行：

```typescript
@OnEvent('order.created', { async: true })
handleOrderCreatedEvent(payload: OrderCreatedEvent) {
  // handle and process "OrderCreatedEvent" event
}
```

要使用名称空间和通配符，请将 `wildcard` 选项传递给 `EventEmitterModule#forRoot()` 方法。启用名称空间和通配符时，事件可以是分隔符分隔的字符串(`foo.bar`) 或数组(`['foo', 'bar']`)。您可以使用 `delimiter` 选项配置分隔符。启用名称空间后，可以使用通配符订阅事件：

```typescript
@OnEvent('order.*')
handleOrderEvents(payload: OrderCreatedEvent | OrderRemovedEvent | OrderUpdatedEvent) {
  // handle and process an event
}
```

单个通配符恰好匹配一个段。例如，`order.*` 匹配事件 `order.created` 和 `order.shipped`，但不匹配 `order.delayed.out_of_stock`。要监听此类事件，请使用 [EventEmitter2 documentation on multi-level wildcards](https://github.com/EventEmitter2/EventEmitter2#multi-level-wildcards) 中描述的多级通配符模式（即 `**`）。

例如，使用此模式，您可以创建捕获所有事件的事件侦听器：

```typescript
@OnEvent('**')
handleEverything(payload: any) {
  // handle and process an event
}
```

> info **Hint** `EventEmitter2` 类提供了几个与事件交互的有用方法，如 `waitFor()` 和 `onAny()`。有关详细信息，请参见 [EventEmitter2 documentation](https://github.com/EventEmitter2/EventEmitter2)。

#### 防止事件丢失

之前或期间发生的事件 `onApplicationBootstrap` 生命周期挂钩（例如，来自构造函数或 `onModuleInit()` 方法）可能会被错过，因为侦听器可能还没有注册。

要避免这种情况，请使用 `EventEmitterReadinessWatcher` 的 `waitUntilReady()` 方法（从 `@nestjs/event-emitter` 导出）。它返回一个承诺，一旦所有侦听器都注册了，这个承诺就会解析。在发出事件之前，在提供程序的 `onApplicationBootstrap` 生命周期挂钩中调用它：

```typescript
await this.eventEmitterReadinessWatcher.waitUntilReady();
this.eventEmitter.emit(
  'order.created',
  new OrderCreatedEvent({ orderId: 1, payload: {} }),
);
```

> info **Note** 这仅适用于在 `onApplicationBootstrap` 生命周期挂钩完成。

#### 例子

[事件发射器样本](https://github.com/nestjs/nest/tree/master/sample/30-event-emitter) 中提供了一个工作示例。
