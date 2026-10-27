# CQRS

Source: https://docs.nestjs.com/recipes/cqrs

简单的流程 [CRUD](https://en.wikipedia.org/wiki/Create,_read,_update_and_delete)（创建、读取、更新和删除）应用程序可以描述如下：

1. 控制器层处理 HTTP 请求并将任务委派给服务层。
2. 服务层是大多数业务逻辑的所在地。
3. 服务使用存储库或 DAO 来更改和持久化实体。
4. 实体充当值的容器，具有 setter 和 getter。

虽然这种模式对于中小型应用程序来说通常就足够了，但对于更大、更复杂的应用程序来说，它可能不是最佳选择。在这种情况下，**CQRS**（命令和查询责任隔离）模型可能更合适，也更可扩展，具体取决于应用程序的需求。该模型的优点包括：

- **关注点分离**。读和写操作由单独的模型处理。
- **可扩展性**。读取和写入操作可以独立缩放。
- **灵活性**。读取和写入可以使用不同的数据存储。
- **表演**。每个数据存储都可以针对其工作负载（读取或写入）进行优化。

为了支持这个模型，Nest 提供了一个轻量级的 [CQRS 模块](https://github.com/nestjs/cqrs)。本章描述了如何使用它。

#### 安装

首先，安装所需的软件包：

```bash
$ npm install --save @nestjs/cqrs
```

安装完成后，打开应用程序的根模块（通常为 `AppModule`）并导入 `CqrsModule.forRoot()`：

```typescript
import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';

@Module({
  imports: [CqrsModule.forRoot()],
})
export class AppModule {}
```

`forRoot()` 接受可选的配置对象。若要异步提供选项（例如，从配置服务），请使用 `CqrsModule.forRootAsync()` 反而。提供以下选项：

| 特征 | 描述 | 默认的 |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| `commandPublisher` | 负责向系统发送命令的发布者。 | `DefaultCommandPubSub` |
| `eventPublisher` | 发布者用于发布事件，允许它们被广播或处理。 | `DefaultPubSub` |
| `queryPublisher` | 用于发布查询的发布者，可以触发数据检索操作。 | `DefaultQueryPubSub` |
| `unhandledExceptionPublisher` | 发布者用于将未处理的异常发布到 `UnhandledExceptionBus`。 | `DefaultUnhandledExceptionPubSub` |
| `eventIdProvider` | 从事件实例中检索唯一事件 ID 的服务。 | `DefaultEventIdProvider` |
| `rethrowUnhandled` | 事件处理程序和传奇引发的异常是否被重新引发，而不是发布到 `UnhandledExceptionBus`。 | `false` |

#### 命令

命令更改应用程序状态。它们应该基于任务，而不是以数据为中心。当命令被调度时，由对应的**命令处理程序**处理，该处理程序负责更新应用程序状态。

```typescript
@Injectable()
export class HeroesGameService {
  constructor(private commandBus: CommandBus) {}

  async killDragon(heroId: string, killDragonDto: KillDragonDto) {
    return this.commandBus.execute(
      new KillDragonCommand(heroId, killDragonDto.dragonId)
    );
  }
}
```

上面的代码实例化了 `KillDragonCommand` 类，并将其传递给 `CommandBus` 的 `execute()` 方法。以下是命令类：

```typescript
export class KillDragonCommand extends Command<{
  actionId: string // This type represents the command execution result
}> {
  constructor(
    public readonly heroId: string,
    public readonly dragonId: string,
  ) {
    super();
  }
}
```

`KillDragonCommand` 类扩展了 `Command` 类，该类是从 `@nestjs/cqrs` 包导出的实用程序类，允许您定义命令的返回类型。在这种情况下，返回类型是具有 `actionId` 属性的对象。每当调度 `KillDragonCommand` 命令时，`CommandBus#execute()` 方法的返回类型被推断为 `Promise<{ actionId: string }>`。当命令处理程序向调用方返回数据时，这非常有用。

> info **Hint** 扩展 `Command` 类是可选的。您只需要它来定义命令的返回类型。

这个 `CommandBus` 表示命令的**流**。它将命令分派给适当的处理程序。这个 `execute()` 方法返回一个承诺，该承诺解析为处理程序返回的值。

让我们为 `KillDragonCommand` 命令。

```typescript
@CommandHandler(KillDragonCommand)
export class KillDragonHandler implements ICommandHandler<KillDragonCommand> {
  constructor(private repository: HeroesRepository) {}

  async execute(command: KillDragonCommand) {
    const { heroId, dragonId } = command;
    const hero = this.repository.findOneById(+heroId);

    hero.killEnemy(dragonId);
    await this.repository.persist(hero);

    // "ICommandHandler<KillDragonCommand>" forces you to return a value that matches the command's return type
    return {
      actionId: crypto.randomUUID(), // This value will be returned to the caller
    }
  }
}
```

此处理程序检索 `Hero` 来自存储库中的实体，调用其 `killEnemy()` 方法，然后持久化更改。这个 `KillDragonHandler` 类实现 `ICommandHandler` 接口，这需要一个 `execute()` 方法。这个 `execute()` 方法接收命令对象作为参数。

`ICommandHandler<KillDragonCommand>` 要求 `execute()` 返回与命令的返回类型相匹配的值（此处为具有 `actionId` 属性）。这仅适用于扩展 `Command` 班级。对于其他命令，返回类型不受限制。

最后，注册 `KillDragonHandler` 作为模块中的提供者：

```typescript
providers: [KillDragonHandler];
```

#### 查询

查询从应用程序状态检索数据。它们应该以数据为中心，而不是基于任务。当查询被派遣时，由相应的**查询处理程序**处理，该处理程序负责检索数据。

`QueryBus` 遵循与 `CommandBus` 相同的模式。查询处理程序实现 `IQueryHandler` 接口，并用 `@QueryHandler()` 装饰器进行注释。从查询类开始：

```typescript
export class GetHeroQuery extends Query<Hero> {
  constructor(public readonly heroId: string) {
    super();
  }
}
```

与 `Command` 类一样，`Query` 类是从 `@nestjs/cqrs` 包导出的实用程序类，它允许您定义查询的返回类型。在这种情况下，返回类型是 `Hero` 对象。每当发送 `GetHeroQuery` 查询时，`QueryBus#execute()` 方法的返回类型被推断为 `Promise<Hero>`。

要检索英雄，请创建查询处理程序：

```typescript
@QueryHandler(GetHeroQuery)
export class GetHeroHandler implements IQueryHandler<GetHeroQuery> {
  constructor(private repository: HeroesRepository) {}

  async execute(query: GetHeroQuery) {
    return this.repository.findOneById(query.heroId);
  }
}
```

这个 `GetHeroHandler` 类实现 `IQueryHandler` 接口，这需要一个 `execute()` 方法。这个 `execute()` 方法将查询对象作为参数接收，并且必须返回与查询的返回类型相匹配的数据（在本例中，`Hero` 对象）。

最后，注册 `GetHeroHandler` 作为模块中的提供者：

```typescript
providers: [GetHeroHandler];
```

要发送查询，请使用 `QueryBus`：

```typescript
const hero = await this.queryBus.execute(new GetHeroQuery(heroId)); // "hero" will be auto-inferred as "Hero" type
```

#### 事件

事件将应用程序状态的更改通知应用程序的其他部分。它们由**models**或直接通过 `EventBus` 发送。当事件被调度时，它由相应的**事件处理程序**处理，例如，这些处理程序可以更新读取模型。

为了演示，让我们创建一个事件类：

```typescript
export class HeroKilledDragonEvent {
  constructor(
    public readonly heroId: string,
    public readonly dragonId: string,
  ) {}
}
```

虽然您可以直接使用 `EventBus.publish()` 方法，您也可以从模型中调度它们。让我们更新一下 `Hero` 模型调度 `HeroKilledDragonEvent` 事件当 `killEnemy()` 方法被调用。

```typescript
export class Hero extends AggregateRoot {
  constructor(private id: string) {
    super();
  }

  killEnemy(enemyId: string) {
    // Business logic
    this.apply(new HeroKilledDragonEvent(this.id, enemyId));
  }
}
```

这个 `apply()` 方法调度事件。它接受事件对象作为参数。但是，模型没有意识到 `EventBus`，所以你需要把两者连接起来。这个 `EventPublisher` 类这样做：

```typescript
@CommandHandler(KillDragonCommand)
export class KillDragonHandler implements ICommandHandler<KillDragonCommand> {
  constructor(
    private repository: HeroesRepository,
    private publisher: EventPublisher,
  ) {}

  async execute(command: KillDragonCommand) {
    const { heroId, dragonId } = command;
    const hero = this.publisher.mergeObjectContext(
      await this.repository.findOneById(+heroId),
    );
    hero.killEnemy(dragonId);
    hero.commit();

    return {
      actionId: crypto.randomUUID(),
    };
  }
}
```

这个 `EventPublisher#mergeObjectContext` 方法将事件发布者合并到提供的对象中。此对象必须实现 `IAggregateRoot` 接口（或扩展 `AggregateRoot` 类）。合并后，对象可以将事件发布到事件流。

使用 `apply()` 应用的事件将被排队，直到您调用模型的 `commit()` 方法，该方法将调度所有未完成的事件。要在应用事件后立即调度事件，请将 `autoCommit` 属性设置为 `true`：

```typescript
export class Hero extends AggregateRoot {
  constructor(private id: string) {
    super();
    this.autoCommit = true;
  }
}
```

若要将事件发布者合并到类中而不是现有对象中，请使用 `EventPublisher#mergeClassContext` 方法：

```typescript
const HeroModel = this.publisher.mergeClassContext(Hero);
const hero = new HeroModel('id'); // <-- HeroModel is a class
```

的每个实例 `HeroModel` 类现在可以发布事件，而无需调用 `mergeObjectContext()` 方法。

作为 `@nestjs/cqrs`12.1，模型的 `commit()`,`publish()` 和 `publishAll()` 返回事件总线返回的内容，即事件发布者返回的任何内容。默认的内存发布程序不返回任何内容，因为它不等待事件处理程序。使用异步发布者（例如写入消息代理的发布者），`await hero.commit()` 等待它，失败时扔掉。

所有三个都接受调度程序上下文，事件发布者接收该上下文来代替模型。命令处理程序可以通过以下方式传递其事务：

```typescript
await hero.commit({ transaction: tx });
```

`commit()` 一旦模型将事件交给事件总线，就会立即清除它们，而无需等待发布者，因此再次调用它永远不会两次发布相同的事件。如果等待 `commit()` 失败，请回滚并使用新加载的模型再次运行该命令。

#### 柔性骨料根

`AggregateRoot` 类是一个基类，您可以扩展它来向域模型添加事件驱动功能。但是，这种方法要求域实体直接扩展 `AggregateRoot`，如果您的应用程序已经具有已建立的实体继承层次结构（例如，基类 `Entity` 类或特定于域的基类，如 `Monster` 或 `Vehicle`），这可能是一个限制。

为了提高灵活性，`@nestjs/cqrs` 包支持实现聚合根的三种方法：

**方法一：传统（类继承）**

这是前面示例中所示的标准方法。它适用于简单的场景和绿地项目。

```typescript
export class Hero extends AggregateRoot {
  constructor(private id: string) {
    super();
  }

  killEnemy(enemyId: string) {
    this.apply(new HeroKilledDragonEvent(this.id, enemyId));
  }
}
```

**方法 2：Mixin（针对现有层级）**

如果您已经有一个基类，但不能扩展 `AggregateRoot` 直接使用 `WithAggregateRoot<EventBase, TBase>()` 混合函数。它将聚合根行为应用于任何现有的基类。

```typescript
abstract class Monster {
  constructor(protected readonly id: string) {}
  abstract roar(): void;
}

export class Dragon extends WithAggregateRoot(Monster) {
  roar(): void {
    console.log('Roarrrr!');
  }

  die(): void {
    this.roar();
    this.apply(new DragonDiedEvent(this.id)); // Provided by the mixin
  }
}
```

**方法三：自定义实施**

为了获得最大程度的控制，或者为了保持域层与框架完全无关，请实现 `IAggregateRoot` 直接接口：

```typescript
export class CustomEntity implements IAggregateRoot {
  autoCommit = false;
  private events: IEvent[] = [];

  getUncommittedEvents() {
    return this.events;
  }

  publish(event: IEvent, dispatcherContext?: unknown) {
    // custom logic
  }

  publishAll(events: IEvent[], dispatcherContext?: unknown) {
    // custom logic
  }

  commit(dispatcherContext?: unknown) {
    // custom logic, such as:
    // return this.publishAll(this.events.splice(0), dispatcherContext);
  }

  uncommit() {
    // custom logic
  }

  apply(event: IEvent) {
    this.events.push(event);
  }

  loadFromHistory(history: IEvent[]) {
    // custom logic
  }
}
```

这三种方法都适用于 `EventPublisher`，它接受实现 `IAggregateRoot` 接口。作为 `@nestjs/cqrs` 12.1, `mergeObjectContext()` 和 `mergeClassContext()` 给出模型 `publish()` 和 `publishAll()` 将调度程序上下文传递到事件总线并返回其结果的方法。定制 `commit()` 通过将调度程序上下文传递给 `publishAll()` 参数是可选的：没有参数的实现（其方法不返回任何内容）仍然满足接口。

#### 手动事件发布

若要在不执行模型的情况下发布事件，请调用 `EventBus#publish()` 方法直接：

```typescript
this.eventBus.publish(new HeroKilledDragonEvent(heroId, dragonId));
```

> info **Hint** 这个 `EventBus` 是一个可注入类。

每个事件可以有多个**事件处理程序**。

```typescript
@EventsHandler(HeroKilledDragonEvent)
export class HeroKilledDragonHandler implements IEventHandler<HeroKilledDragonEvent> {
  constructor(private repository: HeroesRepository) {}

  handle(event: HeroKilledDragonEvent) {
    // Business logic
  }
}
```

> info **Hint** 事件处理程序在传统的 HTTP 请求上下文之外运行：
>
> -在命令处理程序中抛出的错误仍然可以被内置的 [异常筛选器](/exception-filters) 捕获。
> - 事件处理程序中抛出的错误无法被异常筛选器捕获，因此您必须自己处理它们：使用 `try/catch` 块，使用触发补偿事件的 [传奇](/recipes/cqrs#sagas)，或者使用您选择的其他方法。
> -命令处理程序返回的值仍然可以在 HTTP 响应中发送回客户端。
> -事件处理程序不能发送 HTTP 响应。要向客户端发送信息，请使用 [WebSockets](/websockets/gateways)、[服务器发送事件](/http/server-sent-events) 或其他机制。

与命令和查询一样，注册 `HeroKilledDragonHandler` 作为模块中的提供者：

```typescript
providers: [HeroKilledDragonHandler];
```

#### 传奇

传奇是一个长期运行的过程，它监听事件并可能触发新的命令。传奇通常用于管理复杂的工作流。例如，当用户注册时，saga 可以监听 `UserRegisteredEvent` 并向用户发送欢迎电子邮件。

单个传奇可以监听 1..\* 事件。与 [RxJS](https://github.com/ReactiveX/rxjs) 库，您可以过滤、映射、分叉和合并事件流，以构建复杂的工作流。每个传奇都返回一个 `Observable` 发出命令实例。然后，每个发出的命令都由 `CommandBus`.

> info **Hint** 传奇在记忆中运行。有关必须在重新启动中生存的进程，请参见 [Durable sagas](/recipes/cqrs#durable-sagas)。

让我们创造一个传奇，倾听 `HeroKilledDragonEvent` 并派遣 `DropAncientItemCommand` 命令。

```typescript
@Injectable()
export class HeroesGameSagas {
  @Saga()
  dragonKilled = (events$: Observable<any>): Observable<ICommand> => {
    return events$.pipe(
      ofType(HeroKilledDragonEvent),
      map((event) => new DropAncientItemCommand(event.heroId, fakeItemID)),
    );
  }
}
```

> info **Hint** 这个 `ofType` 操作员和 `@Saga()` 装饰器是从 `@nestjs/cqrs` 包装。

这个 `@Saga()` 装修商将这处房产标记为传奇。这个 `events$` 论点是 `Observable` 所有事件的流。这个 `ofType` 运算符通过指定的事件类型筛选流，并且 `map` 运算符将每个事件映射到一个新的命令实例。

在这个例子中，每个 `HeroKilledDragonEvent` 映射到 `DropAncientItemCommand` 命令，其中 `CommandBus` 然后自动调度。

与查询、命令和事件处理程序一样，注册 `HeroesGameSagas` 作为模块中的提供者：

```typescript
providers: [HeroesGameSagas];
```

#### 持久传奇

传奇和事件处理程序在内存中运行。如果进程在事件和 saga 派遣的命令之间停止，则该命令永远不会被派遣。一个结合了几个事件的传奇，例如一个在下单后等待付款并在一小时后放弃的事件，会丢失它在重新启动时看到的事件。在其背后的事务回滚之前发布的事件仍然会到达他们。

当进程必须重新启动和部署时，让事件开始并发出信号 [持久工作流程](/reliability/workflows) 反而。这个 `@nestjs/workflows/cqrs`entry point 将事件映射到工作流，因此代码可以继续执行命令和发布事件：

```bash
$ npm i --save @nestjs/workflows
```

```typescript
import { CqrsModule } from '@nestjs/cqrs';
import { WorkflowsModule } from '@nestjs/workflows';
import { WorkflowsCqrsModule } from '@nestjs/workflows/cqrs';

@Module({
  imports: [CqrsModule.forRoot(), WorkflowsModule.forRoot(), WorkflowsCqrsModule],
  providers: [PlaceOrderHandler, OrderFulfilmentWorkflow],
})
export class AppModule {}
```

在你注册商店之前，`WorkflowsModule` 将工作流保留在内存中。在 PostgreSQL 或 MySQL 上，注册包的 `PostgresWorkflowStore` 或者 `MySqlWorkflowStore` 作为提供程序，在您已经使用的数据库客户端上，作为 [Keep workflows in your database](/reliability/workflows#keep-workflows-in-your-database) 显示：工作流然后存在于您的数据库中，它们的开始和信号可以加入您的事务。

`@StartOn()` 发布事件时启动工作流，以及 `@SignalOn()` 唤醒等待另一个实例的实例：

```typescript
@Workflow('order-fulfilment')
@StartOn(OrderPlacedEvent, {
  id: (event) => `order-${event.order.id}`,
  input: (event) => event.order,
})
@SignalOn(OrderDeliveredEvent, {
  signal: shipmentDelivered,
  key: (event) => event.delivery.reference,
})
export class OrderFulfilmentWorkflow implements WorkflowRunner<Order, FulfilmentResult> {
  constructor(private readonly commandBus: CommandBus) {}

  async run(ctx: WorkflowContext, order: Order): Promise<FulfilmentResult> {
    const charge = await ctx.step('charge-payment', ({ idempotencyKey }) =>
      this.commandBus.execute(new ChargePaymentCommand(order, idempotencyKey)),
    );

    const delivery = await ctx.waitForSignal('await-delivery', shipmentDelivered, {
      key: order.id,
      timeout: '3d',
    });
    // ...
  }
}
```

命令处理程序将其事务作为的第二个参数传递 `publish()`,CQRS 的调度程序上下文。然后在该事务中创建工作流，因此当且仅当订单被保存时，工作流才存在：

```typescript
return this.db.transaction(async (tx) => {
  await tx.insert(orders).values(order);
  await this.eventBus.publish(new OrderPlacedEvent(order), { transaction: tx });
  return order;
});
```

聚合的事件也是如此。作为 `@nestjs/cqrs`12.1，将事务传递给聚合的 `commit()` 在同一个回调中，等待它：一旦工作流启动并发出信号，它就会解析。

```typescript
await order.commit({ transaction: tx });
```

工作流的状态存在于您的数据库中，因此它的寿命比重新启动和部署都要长。完成的步骤永远不会再次运行，进程中断的步骤会使用相同的幂等密钥再次运行，命令将该幂等密钥交给支付提供者。重复事件会找到第一个事件启动的实例。您的事件处理程序和传奇仍然会在工作流之后接收每个事件。看 [Durable workflows with CQRS](/reliability/workflows#with-cqrs) 对于每种出版方式的保证，和聚合。

#### 未处理的异常

事件处理程序是异步执行的，因此它们必须始终正确处理异常，以防止应用程序进入不一致状态。如果异常未被处理，`EventBus` 会记录它，创建一个 `UnhandledExceptionInfo` 对象，并将其推送到 `UnhandledExceptionBus` 流。这同样适用于 sagas 和执行 sagas 发送的命令的命令处理程序引发的异常。`UnhandledExceptionBus` 是一个 `Observable`，您可以订阅它来处理未处理的异常。如果 `rethrowUnhandled` 选项设置为 `true`，这些异常将被重新引发，而不是发布到 `UnhandledExceptionBus`。

```typescript
private destroy$ = new Subject<void>();

constructor(private unhandledExceptionsBus: UnhandledExceptionBus) {
  this.unhandledExceptionsBus
    .pipe(takeUntil(this.destroy$))
    .subscribe((exceptionInfo) => {
      // Handle exception here
      // e.g. send it to external service, terminate process, or publish a new event
    });
}

onModuleDestroy() {
  this.destroy$.next();
  this.destroy$.complete();
}
```

若要仅处理特定的异常类型，请使用 `UnhandledExceptionBus.ofType()` 运算符，该运算符使用 `instanceof` 过滤异常：

```typescript
this.unhandledExceptionsBus
  .pipe(
    takeUntil(this.destroy$),
    UnhandledExceptionBus.ofType(TransactionNotAllowedException),
  )
  .subscribe((exceptionInfo) => {
    // Handle exception here
  });
```

这里，只有例外情况是 `TransactionNotAllowedException` 联系订户。

这个 `UnhandledExceptionInfo` 对象包含以下属性：

```typescript
export interface UnhandledExceptionInfo<
  Cause = IEvent | ICommand,
  Exception = any,
> {
  /**
   * The exception that was thrown.
   */
  exception: Exception;
  /**
   * The cause of the exception (event or command reference).
   */
  cause: Cause;
}
```

#### 订阅所有活动

`CommandBus`,`QueryBus`，和 `EventBus` 都是**可观察**。这意味着您可以订阅整个流，例如，处理所有事件：将它们登录到控制台或将它们保存到事件存储库。

```typescript
private destroy$ = new Subject<void>();

constructor(private eventBus: EventBus) {
  this.eventBus
    .pipe(takeUntil(this.destroy$))
    .subscribe((event) => {
      // Save events to database
    });
}

onModuleDestroy() {
  this.destroy$.next();
  this.destroy$.complete();
}
```

#### 请求范围

如果您来自其他编程语言，您可能会惊讶地发现 Nest 大多数东西都是在传入请求之间共享的：到数据库的连接池、具有全局状态的单例服务等等。Node.js 不遵循请求/响应多线程无状态模型，其中每个请求由单独的线程处理。因此，使用单例实例对您的应用程序来说是**安全的**。

然而，在某些边缘情况下，处理程序的基于请求的生存期是可取的，例如中的每个请求缓存 GraphQL 应用程序、请求跟踪或多租户。参见 [注射镜](/fundamentals/injection-scopes) 本章学习如何控制作用域。

同时使用请求范围提供程序 CQRS 可能很复杂，因为 `CommandBus`,`QueryBus`，和 `EventBus` 是单身。这个 `@nestjs/cqrs` 包通过为每个处理的命令、查询或事件自动创建请求范围处理程序的新实例来处理这一点。

若要使处理程序具有请求范围，请执行以下操作：

1. 依赖于请求范围内的提供程序。
2. 显式地将其范围设置为 `REQUEST` 在 `@CommandHandler()`,`@QueryHandler()`, 或 `@EventsHandler()` 装饰器，如图所示：

```typescript
@CommandHandler(KillDragonCommand, {
  scope: Scope.REQUEST,
})
export class KillDragonHandler {
  // Implementation here
}
```

要将请求有效载荷注入请求范围的提供程序，请使用 `@Inject(REQUEST)` 装饰器（`REQUEST` 是从 `@nestjs/core` 导出的）。然而，在 CQRS 中，请求有效载荷取决于上下文：它可以是 HTTP 请求、计划作业或触发命令的任何其他操作。

有效载荷必须是 `AsyncContext`（导出自 `@nestjs/cqrs`) 或扩展它的类。它充当请求上下文，并保存在整个请求生命周期中可访问的数据。

```typescript
import { AsyncContext } from '@nestjs/cqrs';

export class MyRequest extends AsyncContext {
  constructor(public readonly user: User) {
    super();
  }
}
```

执行命令时，将自定义请求上下文作为第二个参数传递给 `CommandBus#execute()` 方法：

```typescript
const myRequest = new MyRequest(user);
await this.commandBus.execute(
  new KillDragonCommand(heroId, killDragonDto.dragonId),
  myRequest,
);
```

这使得 `MyRequest` 实例可作为 `REQUEST` 提供程序到相应的处理程序：

```typescript
@CommandHandler(KillDragonCommand, {
  scope: Scope.REQUEST,
})
export class KillDragonHandler {
  constructor(
    @Inject(REQUEST) private request: MyRequest, // Inject the request context
  ) {}

  // Handler implementation here
}
```

查询的工作方式相同：

```typescript
const myRequest = new MyRequest(user);
const hero = await this.queryBus.execute(new GetHeroQuery(heroId), myRequest);
```

在查询处理程序中：

```typescript
@QueryHandler(GetHeroQuery, {
  scope: Scope.REQUEST,
})
export class GetHeroHandler {
  constructor(
    @Inject(REQUEST) private request: MyRequest, // Inject the request context
  ) {}

  // Handler implementation here
}
```

对于事件，可以将请求上下文传递给 `EventBus#publish()`，但这种情况不太常见。相反，使用 `EventPublisher` 要将请求上下文合并到模型中：

```typescript
const hero = this.publisher.mergeObjectContext(
  await this.repository.findOneById(+heroId),
  this.request, // Inject the request context here
);
```

处理这些事件的请求作用域事件处理程序可以访问请求上下文。

传奇总是单例，因为它们管理长时间运行的进程（在非单例提供者中注册传奇会引发异常）。但是，您可以从事件对象中检索请求上下文：

```typescript
@Saga()
dragonKilled = (events$: Observable<any>): Observable<ICommand> => {
  return events$.pipe(
    ofType(HeroKilledDragonEvent),
    map((event) => {
      const request = AsyncContext.of(event); // Retrieve the request context
      const command = new DropAncientItemCommand(event.heroId, fakeItemID);

      AsyncContext.merge(request, command); // Merge the request context into the command
      return command;
    }),
  );
}
```

或者，调用 `request.attachTo(command)` 方法将请求上下文附加到命令。

#### 例子

[nest-cqrs-示例存储库](https://github.com/kamilmysliwiec/nest-cqrs-example) 中提供了一个工作示例。
