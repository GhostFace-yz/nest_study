# Durable workflows

Source: https://docs.nestjs.com/reliability/workflows

一些业务流程需要几天时间，并且跨越多个系统。在猫粮和用品的在线商店中，履行订单意味着：

1. 向支付提供者收取客户的卡费用。
2. 储备仓库里的物品。
3. 等待运营商最多 3 天 `shipment.delivered` 网络挂钩。
4. 如果它从未到达，或者承运人把包裹带回来，退还费用并释放库存。否则，等待 7 天，让客户复核。

该流程必须经受住部署和崩溃，精确充电一次，失败时撤销其工作，并告诉支持人员每个订单的位置。和 `@nestjs/workflows` 你把它写成一个 `async` 可注入类的方法。每个副作用都在一个记录的**步骤**中运行。重新启动后，该方法从顶部再次运行，完成的步骤返回其记录的结果，而不是运行两次。Waits and sleeps 将实例停放在您自己的数据库中，任何主机上的任何进程都可以在到期时检索它。没有要运行的工作流服务器。

#### 工作流、队列还是传奇？

Nest 已经有两个工具用于稍后发生的工作，并且每个工具都是其工作的正确选择：

- **[BullMQ](/application/queues#bullmq-installation)**一次运行一个单位的后台工作，如发送电子邮件或转码视频，具有并发限制、速率限制、优先级以及延迟或可重复的作业。具有单个延迟操作的流程（“如果在一小时内没有付款，则取消订单”）是一个延迟作业加上一个状态列。
- **[CQRS 传奇](/recipes/cqrs#sagas)**在一个进程中将事件转换为命令。它们适合在重新启动时失去飞行状态是可以接受的反应。如果不是，相同的事件可以启动工作流并发出信号：参见 [With CQRS](/reliability/workflows#with-cqrs)。
- **Workflows** 适合具有多个步骤的流程，这些步骤等待计时器或外部事件数小时或数天，必须经受住重新启动和部署，并且在失败或被取消时必须撤销已完成的步骤。它们有自己的并发限制、速率限制、优先级和时间表，一步仍然可以将繁重的工作交给 BullMQ 队列。

工作流实例是应用程序数据库中的一行，因此启动工作流实例可以是保存订单的事务的一部分：将事务传递给 `start()` 作为它的 `transaction` 选择。订单及其履行一起提交或根本不提交。作业队列通过自己的连接写入（Redis，或 BullMQ 自己的 PostgreSQL 池），因此保存订单和将其作业排队是两次写操作，它们之间的崩溃会丢失一次。信号也是如此：webhook 可以在一个事务中更新订单并唤醒其工作流。

下面的教程显示了队列和传奇在哪里耗尽：在持久等待后继续的代码（[Sleep for a week, then ask for a review](/reliability/workflows#sleep-for-a-week-then-ask-for-a-review)），一个与截止日期赛跑的事件（[Wait for the delivery webhook](/reliability/workflows#wait-for-the-delivery-webhook)），以及在崩溃中幸存的赔偿（[Let customer support cancel an order](/reliability/workflows#let-customer-support-cancel-an-order)).

#### 安装

要开始，请安装所需的依赖项：

```bash
$ npm i --save @nestjs/workflows
```

本教程将工作流保留在 PostgreSQL 中，使用包自己的存储，并使用 Drizzle，通过 [`@nestjs/drizzle`](/data/drizzle). [Keep workflows in your database](/reliability/workflows#keep-workflows-in-your-database) 显示商店 TypeORM 还有软件包的 MySQL 存储。本页上的测试使用 [PGlite](https://pglite.dev) 所以他们不需要服务器。

订单存在于示例应用程序自己的表中， `orders` 本教程使用支付提供者的内存替代品 SDK (`PaymentProviderClient`），库存表（`InventoryService`）和邮件提供者（`MailService`).像真正的系统一样，它们通过幂等密钥对请求进行重复删除。订单具有以下形状：

```typescript
export interface OrderItem {
  productId: string;
  quantity: number;
  /** Unit price in cents. */
  price: number;
}

/** How the carrier ships it. Express orders are fulfilled first. */
export type Shipping = 'standard' | 'express';

export type OrderStatus = 'placed' | 'delivered' | 'returned' | 'cancelled';

export interface Order {
  id: string;
  userId: string;
  items: OrderItem[];
  shipping: Shipping;
  /** In cents. */
  total: number;
  status: OrderStatus;
}

export class PlaceOrderDto {
  userId: string;
  items: OrderItem[];
  /** Default 'standard'. */
  shipping?: Shipping;
}

export interface FulfilmentResult {
  chargeId: string;
  trackingNumber: string;
}
```

##### 注册模块

进口 `WorkflowsModule` 一次，在根模块中，旁边 [`DrizzleModule`](/data/drizzle)，它注册 Drizzle 数据库 `@InjectDrizzle()` 注射。工作流类是普通的提供程序，因此它们进入 `providers` 在他们注入的服务旁边。这是完成的模块：它列出的工作流和控制器写在下面的部分中，第一个提供程序是包的 PostgreSQL 存储，它 [Keep workflows in your database](/reliability/workflows#keep-workflows-in-your-database) 解释道。

```typescript
import { Module } from '@nestjs/common';
import { DrizzleModule, getDrizzleToken } from '@nestjs/drizzle';
import { WorkflowsModule, WorkflowStorage } from '@nestjs/workflows';
import { fromDrizzle, PostgresWorkflowStore } from '@nestjs/workflows/postgres';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { Database } from './database/drizzle.js';
import * as schema from './database/schema.js';
import { InventoryService } from './inventory/inventory.service.js';
import { InvoiceBatchWorkflow } from './invoices/invoice-batch.workflow.js';
import { InvoicesController } from './invoices/invoices.controller.js';
import { InvoicesService } from './invoices/invoices.service.js';
import { MailService } from './mail/mail.service.js';
import { OrderFulfilmentWorkflow } from './orders/order-fulfilment.workflow.js';
import { OrdersController } from './orders/orders.controller.js';
import { OrdersService } from './orders/orders.service.js';
import { PaymentProviderClient } from './payments/payment-provider.client.js';
import { PaymentsService } from './payments/payments.service.js';
import { CarrierWebhookController } from './shipping/carrier-webhook.controller.js';

@Module({
  imports: [
    DrizzleModule.forRootAsync({
      // Drizzle on PostgreSQL: a pg pool on DATABASE_URL, closed after the worker handed its instances back
      useFactory: () => ({ drizzle, connection: process.env.DATABASE_URL!, schema }),
    }),
    WorkflowsModule.forRoot({
      worker: {
        concurrency: 10, // instances this process executes at once
        leaseDuration: '30s', // how long a crashed process keeps its instances
        shutdownTimeout: '10s', // how long a deploy waits for running steps
      },
    }),
  ],
  controllers: [OrdersController, CarrierWebhookController, InvoicesController],
  providers: [
    {
      // Instances and journals in your database, in a schema of their own (nest_workflows)
      provide: PostgresWorkflowStore,
      inject: [getDrizzleToken(), WorkflowStorage],
      useFactory: (db: Database, workflowStorage: WorkflowStorage) =>
        new PostgresWorkflowStore({ executor: fromDrizzle(db) }, workflowStorage),
    },
    OrdersService,
    PaymentProviderClient,
    PaymentsService,
    InventoryService,
    MailService,
    InvoicesService,
    OrderFulfilmentWorkflow,
    InvoiceBatchWorkflow,
  ],
})
export class AppModule {}
```

> info **Hint** 教程中写道 `process.env` 直接，长话短说。在应用程序中，通过 [`@nestjs/config`](/application/configuration) 有了验证模式，所以缺少一个 `DATABASE_URL` 在启动时停止应用程序，并从 `ConfigService` 在工厂里。

每个选项都是可选的：`WorkflowsModule.forRoot()` 按原样工作。从 `ConfigService`, 使用 `forRootAsync()` 与工厂，或与 `useClass` 实现 `WorkflowsOptionsFactory` 及其 `createWorkflowsOptions()` 方法。

这个 `worker` 在您的应用程序流程中运行。它每秒钟轮询适当的实例，并在本地 `start()` 或者 `signal()` 立即唤醒它。它根据租赁要求到期，并每三分之一续租一次 `leaseDuration`.如果流程终止，一旦租约到期，其实例就可以再次索取。设置 `worker: false` 对于只应启动、发出信号和检查工作流的流程，例如 API 豆荚。默认情况下，一个步骤有 3 次尝试，后退从 1 秒开始，加倍，最多 5 分钟。一个 `retry` 此处的选项更改了默认值。

在 `main.ts`，启用关机挂钩。在 `SIGTERM` 工人停止索赔，中止 `signal` 运行步骤，等待 `shutdownTimeout`，并将它停止的实例交回存储。另一个过程会立即取走它们，而不是等待租赁。

```typescript
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // On SIGTERM, stop claiming work and hand running instances back.
  app.enableShutdownHooks();
  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
```

##### 在数据库中保留工作流

工作流实例、它们的日志、它们等待的信号以及在**存储**中实时发送的信号。在您注册一个之前，模块会将它们保留在内存中：第一次运行没问题，但是重新启动会丢失每个运行顺序，并且两个进程不会共享它们。

> warning **Warning** 使用 `NODE_ENV=production` 并且没有注册存储，启动失败，除非您设置了 `allowInMemoryStorage: true`。

在 PostgreSQL 上，注册包的存储， `PostgresWorkflowStore` 来自 `@nestjs/workflows/postgres`.它运行它的 SQL 通过您的应用程序已经拥有的数据库客户端，因此它可以加入您的事务。它是一个普通的提供程序，在根模块中注册过一次，旁边 `WorkflowsModule`：两者都是广泛应用的。在 `AppModule` 上面，是第一个提供者：一个注入 Drizzle 数据库和 `WorkflowStorage` 注册表，商店用它来注册自己。

`fromDrizzle(db)` 是存储的**执行器**：它通过您的 Drizzle 数据库运行存储的语句，无论它使用哪个驱动程序，如 `pg` 或 PGlite。`fromPg(pool)`、`fromTypeOrm(dataSource)`、`fromPrisma(prisma)` 和 `fromKysely(db)` 对节点-postgres 池、TypeORM、Prisma 和 Kysely 执行相同的操作。启动时，模块记录 `WorkflowStorage: PostgresWorkflowStore`。

**模式。**无需为工作流创建任何内容：没有表、实体或 Prisma 模型。商店把桌子放在自己的模式里，`nest_workflows`（`schema` 选项命名另一个），并创建和迁移它本身。在没有模式的 MySQL 上，它们是连接数据库的表，模式的名称作为前缀：`nest_workflows_instances` 等等。

| 桌子 | 它持有什么 |
| --- | --- |
| `nest_workflows.instances` | 每个工作流实例：它的输入、状态、输出或错误、何时到期以及它的租约 |
| `nest_workflows.journal` | 记录每个实例的步骤、睡眠、等待和补偿及其结果 |
| `nest_workflows.waits` | 挂起实例等待的信号 |
| `nest_workflows.signals` | 发送的信号，直到 `purge()` 删除实例不能再接受的内容 |
| `nest_workflows.schedules` | 时间表及其规格、状态和下一次运行 |
| `nest_workflows.rate_limits` | 每个工作流和关键的速率限制窗口 |
| `nest_workflows.migrations` | 应用的存储模式版本 |

它们属于存储：您的迁移不会创建它们，您自己的表也不能与它们冲突。

**迁移。**包以版本化迁移的形式发送模式，存储本身应用它们。与 `migrate` 选项，它在工作程序运行之前，在一个持有咨询锁的事务中应用模式在启动时还没有的内容：在一起启动的几个进程中，一个进程迁移，其他进程无事可做。 `migrate` 默认值为 `true`，除了 `NODE_ENV=production`.因此，在开发和测试中，存储在第一次开始时创建它的模式，而您的迁移只创建您自己的表，这里 `orders`.

在生产中，在应用程序的新版本开始之前应用迁移，就像应用您自己的迁移一样，这样就不会有进程在启动时更改模式：在滚动部署的中间，这将锁定繁忙的表，而权限最低的数据库用户无论如何都不能这样做。包的命令行从 `npx drizzle-kit migrate` 旁边的部署步骤执行此操作。它从 `DATABASE_URL` 或 `--url` 读取数据库，并且需要安装 `pg`：

```bash
$ npx @nestjs/workflows status
Schema "nest_workflows" is at version 0; this version of @nestjs/workflows needs version 1.
$ npx @nestjs/workflows migrate
Migrated schema "nest_workflows" to version 1 (applied 1).
```

当模式落后时，`status` 退出为 1，这使它成为对 CI 的检查。要使用您自己的迁移工具应用迁移，请从 `npx @nestjs/workflows sql` 或 `PostgresWorkflowStore.migrationSql()` 中获取代码中的 SQL：每个迁移的语句，每段一个，以及记录版本的簿记。在一个事务中运行它们，就像 TypeORM 和 Drizzle 的迁移程序所做的那样。使用 TypeORM，这是您自己的迁移，旁边是它为您的实体生成的迁移：

```typescript
import { PostgresWorkflowStore } from '@nestjs/workflows/postgres';
import type { MigrationInterface, QueryRunner } from 'typeorm';

export class WorkflowStore1790801342207 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(PostgresWorkflowStore.migrationSql());
  }

  async down(): Promise<void> {
    throw new Error('The workflow store has no down migrations.');
  }
}
```

使用 drizzle-kit，创建自定义迁移，并将其填充为 SQL, 一个 `--> statement-breakpoint` 语句之间的行：Drizzle 的迁移器然后一次运行一个，这是 PGlite 所要求的。在代码中，`migrationSql()` 和 `statementBreakpoints: true` 返回相同。

```bash
$ npx drizzle-kit generate --custom --name=workflows
$ npx @nestjs/workflows sql --statement-breakpoints > drizzle/0001_workflows.sql
```

在 MySQL 上，`MySqlWorkflowStore.migrationStatements()` 每个字符串返回一个语句，TypeORM 迁移每个调用运行一个：

```typescript
for (const statement of MySqlWorkflowStore.migrationStatements()) {
  await queryRunner.query(statement);
}
```

和 `migrate` 关闭，模式背后的存储会使启动失败 `WorkflowSchemaError` 它命名了这三种方式，并以相同的方式失败每个调用，直到模式赶上，它注意到了这一点，而无需重新启动。迁移只添加表、列和索引，因此在滚动部署期间，应用程序的先前版本将继续在迁移的架构上运行。没有向下迁移。

**交易。**`start()` 和 `signal()` 将您的交易视为他们的 `transaction` 选项：带 Drizzle，这个 `tx` 那个 `db.transaction()` 递交其回调，如 [Start it with the order](/reliability/workflows#start-it-with-the-order) 显示。商店在该事务上运行其报表，因此它们会提交或回滚您的写入。它拒绝数据库本身，数据库的语句会自动提交 `TypeError` 上面写着要传递什么。与其他执行器一起，在之后传递 node-postgres 客户端 `BEGIN`（不是泳池），TypeORM 的 `EntityManager` 来自 `dataSource.transaction()`,Prisma 的交互式事务客户端，或 Kysely 事务。

**隔离。**商店依靠 READCOMMITTEDPostgreSQL 的默认隔离级别：它的语句相互竞争，在更严格的级别下，它们会出现序列化错误。启动时，它会检查数据库的 `default_transaction_isolation`，如果更严格，就会失败。一个 `signal()` 在您的交易中需要 READCOMMITTED 事务，或者它的唤醒可能会错过事务快照后提交的等待：它被拒绝 `TypeError` 否则。

**与 TypeORM。** `TypeOrmModule` 取代 `AppModule` 中的 `DrizzleModule`，商店在其提供的 `DataSource` 上运行，直至 `fromTypeOrm()`：

```typescript
{
  // Instances and journals in your database, in a schema of their own (nest_workflows)
  provide: PostgresWorkflowStore,
  inject: [DataSource, WorkflowStorage],
  useFactory: (dataSource: DataSource, workflowStorage: WorkflowStorage) =>
    new PostgresWorkflowStore({ executor: fromTypeOrm(dataSource) }, workflowStorage),
},
```

教程通过的地方 Drizzle's `tx` 二 `start()` 和 `signal()`，通过 `EntityManager` 那个 `dataSource.transaction()` 交出它的回调。商店拒绝 `dataSource.manager` 他们的作品会自己提交。这是订购服务的 `place()`, 从 [Start it with the order](/reliability/workflows#start-it-with-the-order)，与 TypeORM:

```typescript
return this.dataSource.transaction(async (manager) => {
  await manager.insert(OrderEntity, order);
  // Same transaction: the fulfilment exists if and only if the order does.
  const fulfilment = await this.workflowClient.start(OrderFulfilmentWorkflow, order, {
    id: fulfilmentId(order.id),
    transaction: manager,
  });
  return { ...order, fulfilment };
});
```

> info **Hint** 和 Prisma，将客户端传递到 `fromPrisma()`，并且作为 `transaction`，事务客户端 `prisma.$transaction()` 交出它的回调。商店自己的事务等待连接长达 10 秒，运行长达一分钟，比 Prisma 的默认值：的第二个参数 `fromPrisma()` 改变了这一点 `maxWait` 和 `timeout`.如果您的应用程序以突发方式发出信号，请给它自己的事务更长的时间 `maxWait` 也是因为信号一个接一个地排队。

**使用 MySQL.**该软件包有一个 MySQL8.4 的存储 LTS 还有 9.x，`MySqlWorkflowStore` 来自 `@nestjs/workflows/mysql`，遗嘱执行人同名。MariaDB 还不支持：商店在启动时拒绝它。提供程序是相同的，有 MySQL 存储的类和执行器。这是 `AppModule` 和 Drizzle 在 mysql2 池上，其中 `mode: 'default'` 是 DrizzleMySQL 上架构的设置：

```typescript
import { fromDrizzle, MySqlWorkflowStore } from '@nestjs/workflows/mysql';
import { drizzle } from 'drizzle-orm/mysql2';

@Module({
  imports: [
    DrizzleModule.forRootAsync({
      // Drizzle on MySQL: a mysql2 pool on DATABASE_URL (mysql://...), whose path names the database
      useFactory: () => ({ drizzle, connection: process.env.DATABASE_URL!, schema, mode: 'default' as const }),
    }),
    // ...
  ],
  providers: [
    {
      // Instances and journals in your database, in tables of their own (nest_workflows_*)
      provide: MySqlWorkflowStore,
      inject: [getDrizzleToken(), WorkflowStorage],
      useFactory: (db: Database, workflowStorage: WorkflowStorage) =>
        new MySqlWorkflowStore({ executor: fromDrizzle(db) }, workflowStorage),
    },
    // ...
  ],
})
export class AppModule {}
```

`fromMysql2(pool)`、`fromTypeOrm(dataSource)`、`fromPrisma(prisma)` 和 `fromKysely(db)` 对 mysql2 池、TypeORM、Prisma（通过 `@prisma/adapter-mariadb`）和 Kysely 执行相同的操作。`start()` 和 `signal()` 采用与 PostgreSQL 相同的事务对象，对于 mysql2，在 `beginTransaction()` 之后有一个连接。与 PostgreSQL 有何不同：

- **表。** MySQL 在数据库中没有模式，因此存储库将其表保存在连接的数据库中，即 URL 的路径名，以及 `schema` 选项是他们名字的前缀：`nest_workflows_instances`,`nest_workflows_signals` 等等，旁边 `nest_workflows_migrations` 和 `nest_workflows_locks`，保存它的版本和锁。
- **有界键。** ID、名称和键是长度有限的索引列。实例 id、工作流或信号名称、信号的 `key` 和 `id` 和并发或速率限制键保存 255 个字符、调度 id 230 和步骤、休眠或等待名称 512。`start()` 和 `signal()` 拒绝一个较长的 `RangeError` 在任何东西被写出来之前。键仍然精确地比较，就像在 PostgreSQL 上一样。
- **您的交易。**`start()` 和 `signal()` 与 `transaction` 选项工作于 REPEATABLEREADMySQL 的默认值，并且在 READCOMMITTED：唤醒以锁定读取方式读取等待，这也会看到在您的事务快照之后提交的等待。避免 SERIALIZABLE，其中 MySQL 将普通读取转换为锁定读取：a`start()` 在这样的事务中，将保持每个信号直到事务结束。
- **死锁。** MySQL 通过回滚其中一个事务来打破死锁，出现错误 1213 (`ER_LOCK_DEADLOCK`)。商店再次运行自己的交易。在您的代码中，回滚也带走了您的写入，因此错误到达了您的代码：再次运行事务。一个事务写一个订单然后发出信号，而另一个事务发出信号然后写入相同的订单，这样就会陷入僵局。
- **迁移。**MySQL 提交每个 DDL 语句本身，因此迁移不能在一个事务中运行。商店和 `npx @nestjs/workflows migrate` 在锁下，一次应用一个语句（`GET_LOCK()`)，因此一起启动的进程仍然会迁移一次，而中途停止的运行会从停止的地方恢复。命令行采用 `mysql://` URL 然后需要 `mysql2`，和 `npx @nestjs/workflows sql --dialect mysql` 打印 SQL.使用您自己的工具，按顺序应用语句，每次调用一次，就像 TypeORM 上面的迁移确实如此：对于 drizzle-kit，其 MySQL 迁移器每个断点发送一条语句，添加 `--statement-breakpoints`.

对于另一个数据库，编写您自己的存储：[The store contract](/reliability/workflows#the-store-contract) 说它必须做什么。

#### 编写工作流程

每个副作用都需要一个幂等键。一个步骤**至少运行一次**：如果流程在支付提供者向卡收费后但在结果到达日记帐之前终止，则该步骤再次运行。引擎给每个步骤一个 `idempotencyKey`，在尝试和过程中保持不变（`<instance id>:<step name>`）。将其传递给您调用的系统，效果会发生一次：

```typescript
import { Injectable } from '@nestjs/common';
import { NonRetryableStepError } from '@nestjs/workflows';
import type { Order } from '../orders/order.js';
import { PaymentProviderClient } from './payment-provider.client.js';

export interface Charge {
  chargeId: string;
  amount: number;
}

@Injectable()
export class PaymentsService {
  constructor(private readonly paymentProviderClient: PaymentProviderClient) {}

  async charge(order: Order, idempotencyKey: string): Promise<Charge> {
    // The payment provider answers a repeated Idempotency-Key with the first response,
    // so a retried step never charges the card twice.
    const charge = await this.paymentProviderClient.createCharge(
      { amount: order.total, currency: 'USD', reference: order.id },
      { idempotencyKey },
    );
    if (charge.status === 'declined') {
      // Retrying won't help. Fail the step now.
      throw new NonRetryableStepError(`The payment provider declined the card for order ${order.id}.`);
    }
    return { chargeId: charge.id, amount: charge.amount };
  }

  async refund(chargeId: string, idempotencyKey: string): Promise<void> {
    await this.paymentProviderClient.createRefund({ chargeId }, { idempotencyKey });
  }
}
```

`InventoryService.reserve()` 遵循相同的思想，没有外部 API：它使用该键作为保留的主键，因此重试会找到它已经进行的保留。它扔 `NonRetryableStepError` 当产品缺货时。`MailService` 将密钥作为邮件 id 传递给邮件提供程序。

现在是工作流程。用 `@Workflow()` 装饰一个类，给它命名，并实现 `run()`：

```typescript
import { Workflow, type WorkflowContext, type WorkflowRunner } from '@nestjs/workflows';
import { InventoryService } from '../inventory/inventory.service.js';
import { MailService } from '../mail/mail.service.js';
import { PaymentsService } from '../payments/payments.service.js';
import { shipmentDelivered } from '../shipping/carrier-event.js';
import type { FulfilmentResult, Order } from './order.js';

/** One fulfilment per order: the order id is the workflow instance id. */
export const fulfilmentId = (orderId: string) => `order-${orderId}`;

@Workflow('order-fulfilment')
export class OrderFulfilmentWorkflow implements WorkflowRunner<Order, FulfilmentResult> {
  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly inventoryService: InventoryService,
    private readonly mailService: MailService,
  ) {}

  async run(ctx: WorkflowContext, order: Order): Promise<FulfilmentResult> {
    const charge = await ctx.step(
      'charge-payment',
      ({ idempotencyKey }) => this.paymentsService.charge(order, idempotencyKey),
      {
        retry: { attempts: 5, backoff: { delay: '2s' } },
        compensate: (charge, { idempotencyKey }) => this.paymentsService.refund(charge.chargeId, idempotencyKey),
      },
    );

    await ctx.step(
      'reserve-stock',
      ({ idempotencyKey }) => this.inventoryService.reserve(order.items, idempotencyKey),
      { compensate: ({ reservationId }) => this.inventoryService.release(reservationId) },
    );

    // ...the delivery wait and the review request continue here
  }
}
```

`ctx.step()` 运行一次函数，并将其结果写入日志。每当实例再次运行时（在等待、休眠或崩溃之后），`run()` 从顶部开始 `charge-payment` 在不调用支付提供者的情况下返回过账费用。结果必须是 JSON-可序列化，它们会在自己的 JSON 形式，在第一次运行时也是：a`Date` 是一串。返回类型是这样说的（`Journaled<Charge>`)，所以 TypeScript 标记将日志记录值视为活动对象的代码。

- **`retry`**：`attempts` 也计算第一次尝试，`backoff` 设置每次重试前的等待时间：`delay`、增长 `factor`、`maxDelay` 上限和可选的 `jitter`。数字是尝试的简写，`false` 表示一次尝试。失败的尝试会暂停实例，直到回退过去，因此重试也会在重新启动后存活下来。`NonRetryableStepError`，如被拒绝的卡，会立即失败该步骤。
- **`compensate`**：步骤完成时注册。如果工作流稍后失败或被取消，则已完成步骤的补偿将以相反的顺序运行。每个都像一个步骤一样被记录和重试，有自己的幂等键。如果 `reserve-stock` 因为商品缺货而失败，费用将被退还。[Sleep for a week, then ask for a review](/reliability/workflows#sleep-for-a-week-then-ask-for-a-review) 显示订单交付后如何结束此操作。

步骤也可以并行运行。要单独预订每个项目，请从每个项目开始一步，一起等待它们。每个步骤都有自己的名称，其中包含项目的索引，因此也有自己的幂等键和补偿：

```typescript
// One step per item, all at once: each reserves its item under its own key, and
// releases it if the order is undone.
await Promise.all(
  order.items.map((item, i) =>
    ctx.step(
      `reserve-item-${i}`,
      ({ idempotencyKey }) => this.inventoryService.reserve([item], idempotencyKey),
      { compensate: ({ reservationId }) => this.inventoryService.release(reservationId) },
    ),
  ),
);
```

如果一个项目缺货，它的步骤失败，其他项目完成，完成的项目的补偿运行：预订被释放，然后费用被退还。补偿以相反的顺序运行 `ctx.step()` 电话，哪一步先完成。教程的其余部分保持单一 `reserve-stock` 步骤。

该类是每个运行顺序共享的单例，构造函数注入照常工作。在局部变量中保持按订单状态，从不打开 `this`.

#### 启动工作流

##### 从订单开始

一个订单和它的履行是一起的：一个没有任何东西履行的订单就像一个从未保存的订单的履行收费一样糟糕。因此，`OrdersService` 保存订单并在一个 Drizzle 事务中启动工作流。`WorkflowClient` 启动实例；将事务的 `tx` 传递给它：

```typescript
import { randomUUID } from 'node:crypto';
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { WorkflowClient } from '@nestjs/workflows';
import { eq } from 'drizzle-orm';
import type { Database } from '../database/drizzle.js';
import { orders } from '../database/schema.js';
import { fulfilmentId, OrderFulfilmentWorkflow } from './order-fulfilment.workflow.js';
import type { Order, PlaceOrderDto } from './order.js';

@Injectable()
export class OrdersService {
  constructor(
    @InjectDrizzle() private readonly db: Database,
    private readonly workflowClient: WorkflowClient,
  ) {}

  async place(dto: PlaceOrderDto) {
    const total = dto.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const order: Order = {
      id: randomUUID().slice(0, 8),
      userId: dto.userId,
      items: dto.items,
      shipping: dto.shipping ?? 'standard',
      total,
      status: 'placed',
    };

    return this.db.transaction(async (tx) => {
      await tx.insert(orders).values(order);
      // Same transaction: the fulfilment exists if and only if the order does.
      const fulfilment = await this.workflowClient.start(OrderFulfilmentWorkflow, order, {
        id: fulfilmentId(order.id),
        transaction: tx,
      });
      return { ...order, fulfilment };
    });
  }

  async findOne(id: string): Promise<Order> {
    const [order] = await this.db.select().from(orders).where(eq(orders.id, id));
    if (!order) {
      throw new NotFoundException(`Order ${id} not found.`);
    }
    return order;
  }

  // ...markDelivered() is added in the next section
}
```

和 `transaction` 存储通过您的事务创建实例 ORM 提交了回调，因此它会随订单提交，或者如果回调中的任何操作失败，它会随订单回滚。工作程序只看到提交的实例：它在提交后的下一次轮询中选择这个实例。传递存储拒绝的事务，而不是数据库：`start()` 没有选项会自行写入，这是选项删除的双重写入。和 TypeORM，传递事务的 `EntityManager`，并与 Prisma 事务客户端，作为 [Keep workflows in your database](/reliability/workflows#keep-workflows-in-your-database) 显示。

实例 id 来自订单 id，这使得 `start()` 幂等。使用相同的输入启动相同的 id 将返回现有实例 `created: false`，不同的输入抛出 `WorkflowIdConflictError`.对账作业可以再次调用它来订购，而无需收取两次费用。

##### 报告其状态

控制器下达订单并报告其履行情况：

```typescript
import { Body, Controller, Get, NotFoundException, Param, Post } from '@nestjs/common';
import { WorkflowClient } from '@nestjs/workflows';
import { fulfilmentId } from './order-fulfilment.workflow.js';
import { PlaceOrderDto } from './order.js';
import { OrdersService } from './orders.service.js';

@Controller('orders')
export class OrdersController {
  constructor(
    private readonly ordersService: OrdersService,
    private readonly workflowClient: WorkflowClient,
  ) {}

  @Post()
  place(@Body() dto: PlaceOrderDto) {
    return this.ordersService.place(dto);
  }

  @Get(':id/fulfilment')
  async fulfilment(@Param('id') id: string) {
    const instance = await this.workflowClient.getStatus(fulfilmentId(id), { journal: true });
    if (!instance) {
      throw new NotFoundException(`Order ${id} not found.`);
    }
    return {
      status: instance.status,
      stage: instance.customStatus,
      waitingFor: instance.waits.map((wait) => wait.signal),
      wakeAt: instance.wakeAt === null ? null : new Date(instance.wakeAt).toISOString(),
      steps: Object.fromEntries(instance.journal.map((entry) => [entry.name, entry.status])),
      error: instance.error?.message ?? null,
    };
  }

  // ...cancel() is added for customer support, below
}
```

`getStatus()` 返回实例：它的 `status`、`wakeAt`、它 `waits` 的信号、它的 `error` 或 `output`，以及使用 `journal` 选项的每一步。状态为 `pending`、`running`、`suspended`、`compensating`、`completed`、`failed`、`cancelled` 和 `compensation_failed`；[What each status means](/reliability/workflows#what-each-status-means) 说明了每一个的含义以及如何处理它。端点将实例映射到一个小视图。不要将原始实例返回给客户，因为它包括输入和租赁详细信息。

`stage` 来自工作流。`ctx.setStatus()` 设置实例的**自定义状态**，一个高达 16 KiB 的 JSON 值，`getStatus()` 和 `list()` 返回为 `customStatus`：这里，一个单词表示顺序的位置。随着订单的进行，将其设置为 `run()`，承运人交付后将其设置为 `delivered`（在 [Sleep for a week, then ask for a review](/reliability/workflows#sleep-for-a-week-then-ask-for-a-review) 中）：

```typescript
const charge = await ctx.step(
  'charge-payment',
  // ...the charge, as above
);
ctx.setStatus('paid');

await ctx.step(
  'reserve-stock',
  // ...the reservation, as above
);
ctx.setStatus('awaiting-delivery');
```

状态未被记录。每次执行都会重播 `run()`，随之而来的是 `setStatus()` 调用，因此每次执行都会在执行过程中再次设置状态，循环中设置的状态不会增加日志。工作流从不回读它，所以它做出的任何决定都不依赖于它。它是用实例的下一个写入来写的：当下一步开始时，当实例停车时，或者当它结束时。所以端点显示 `paid` 当 `reserve-stock` 等待重试，并且 `awaiting-delivery` 一旦实例为载波停车。工作流不再更改的状态保持，例如 `awaiting-delivery` 对于已取消的订单：`status` 告诉你发生了什么。不是的值 JSON，或采用超过 16 KiB 作为 JSON，使实例失败 `TypeError`，和 `undefined` 清除状态。每项书面变更均作为 `custom-status` 事件。

#### 等待信号和定时器

##### 等待交付 webhook

接下来，工作流等待载体。webhook 和工作流共享一个信号：一个名称及其有效载荷的类型，定义一次，因此任何一方都不会拼错名称或发送错误的形状：

```typescript
import { WorkflowSignal } from '@nestjs/workflows';

/** The body the carrier POSTs to our webhook. */
export interface CarrierEvent {
  type: 'shipment.in_transit' | 'shipment.delivered' | 'shipment.returned';
  /** The store's order id. */
  reference: string;
  trackingNumber: string;
  occurredAt: string;
}

/** Sent by the webhook, awaited by the fulfilment workflow. The order id is its key. */
export const shipmentDelivered = new WorkflowSignal<CarrierEvent>('shipment.delivered');
```

将其添加到 `run()`，在 `reserve-stock` 之后：

```typescript
const delivery = await ctx.waitForSignal('await-delivery', shipmentDelivered, {
  key: order.id,
  timeout: '3d',
});
if (!delivery) {
  ctx.fail(`Order ${order.id} was not delivered within 3 days.`);
}
```

`waitForSignal()` 记录等待并停放实例：其状态变为 `suspended` 和 `wakeAt` 是最后期限。在这 3 天里，没有内存、计时器或工人。它与信号的有效载荷一起解析，类型为 a `CarrierEvent`，或与 `null` 一旦超时过去。 `ctx.fail()` 然后实例失败，补偿反向进行：库存被释放，然后费用被退还。一个 `match` 选项通过有效载荷进一步过滤信号，例如 `match: (event) => event.trackingNumber !== ''`;它在每次重放时都会再次运行，因此它必须是有效载荷的纯函数。

webhook 将订单标记为已交付并发送信号。两者都发生在一个新的 `OrdersService.markDelivered()` 方法，在一个事务中，所以订单的状态和信号一起提交。加上它，以及信号的导入：

```typescript
import { shipmentDelivered, type CarrierEvent } from '../shipping/carrier-event.js';

async markDelivered(event: CarrierEvent): Promise<void> {
  await this.db.transaction(async (tx) => {
    const updated = await tx
      .update(orders)
      .set({ status: 'delivered' })
      .where(eq(orders.id, event.reference))
      .returning({ id: orders.id });
    if (updated.length === 0) {
      throw new NotFoundException(`Order ${event.reference} not found.`);
    }
    // The order's new status and the signal commit together.
    await this.workflowClient.signal(shipmentDelivered, event, { key: event.reference, transaction: tx });
  });
}
```

控制器验证回调并将其移交：

```typescript
import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { OrdersService } from '../orders/orders.service.js';
import type { CarrierEvent } from './carrier-event.js';

@Controller('webhooks/carrier')
export class CarrierWebhookController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  @HttpCode(200)
  async handle(@Body() event: CarrierEvent) {
    // Verify the carrier's signature header before trusting the body.
    if (event.type === 'shipment.delivered') {
      await this.ordersService.markDelivered(event);
    }
    return { received: true };
  }
}
```

`signal()` 用相关性存储信号 `key` 并唤醒等待信号和密钥的实例。密钥完全匹配，因此订单 id 防止一个订单的交付唤醒另一个订单，没有密钥的等待只接受没有密钥发送的信号。信号经久耐用。在工作流到达等待之前到达的 webhook 仍然算数，每个信号每个实例最多消耗一次，因此运营商的重试是无害的。它们仍然每个存储一个信号，除非你通过一个 `id`，例如跟踪号码：具有相同名称的信号和 `id` 存储一次，重复返回第一个 `signalId` 和 `created: false`.在截止日期之后记录的传递会失去超时，即使截止日期过去时没有工作人员在运行。

控制器应答 `200` 只有在事务提交之后。商店不知道的订单的交付会回滚 `404`，不会留下任何信号，如果数据库出现故障，运营商会收到错误并再次传递 webhook。在事务队列中一个接一个地发送信号，直到它结束，所以要保持这样的事务短。在 PostgreSQL 上，事务必须使用默认值 READCOMMITTED 孤立；商店拒绝更严格的一个，这可能会错过运行时注册的等待。在 MySQL 上，默认值 REPEATABLEREAD 也管用。

##### 先到先得

承运人并不总是送货。当它不能时，它将包裹带回仓库并报告 `shipment.returned`。在第一个信号旁边声明第二个信号：

```typescript
/** Sent by the webhook when the carrier brings the parcel back to the warehouse. The order id is its key. */
export const shipmentReturned = new WorkflowSignal<CarrierEvent>('shipment.returned');
```

webhook 在发送交付时发送它。新的 `OrdersService.markReturned()` 将订单状态设置为 `returned`，并在一个事务中发送信号，如 `markDelivered()`：

```typescript
if (event.type === 'shipment.returned') {
  await this.ordersService.markReturned(event);
}
```

工作流现在等待交付、退货或 3 天，以先到者为准。将 `waitForSignal()` 调用替换为 `ctx.waitForAny()`：

```typescript
const outcome = await ctx.waitForAny('await-delivery', {
  delivered: ctx.signalWait(shipmentDelivered, { key: order.id }),
  returned: ctx.signalWait(shipmentReturned, { key: order.id }),
  timedOut: ctx.timer('3d'),
});
if (outcome.key === 'returned') {
  ctx.fail(`The carrier returned order ${order.id} to the warehouse.`);
}
if (outcome.key === 'timedOut') {
  ctx.fail(`Order ${order.id} was not delivered within 3 days.`);
}
const delivery = outcome.value;
```

`ctx.signalWait()` 和 `ctx.timer()` 仅描述一种状况，并且 `waitForAny()` 一起等他们。它将实例停放一次，包括它等待的每个信号和最早的截止日期，并用 `key` 首先发生的情况及其 `value`：信号的有效载荷，或 `null` 为了计时器。检查 `key` 狭窄 `value` 所以两次检查之后 `delivery` 是一个 `CarrierEvent`.退回的包裹未能通过实例，赔偿会释放库存，库存回到仓库，并退还费用。状态端点的 `waitingFor` 在实例等待时列出两个信号。

结果被记录为等待名下的一个条目，因此每次以后的执行都会得到相同的获胜者。当几个条件同时准备就绪时，记录的信号首先获胜，无论它匹配哪个条件。在计时器截止日期之后发送的信号不算数，`waitForSignal()` 的 `timeout`，计时器从第一次到达等待开始计数。只获取获胜信号：在交付后报告的返回将保留到稍后等待同一实例。要等待所有几个信号，请等待几个 `waitForSignal()` 呼叫 `Promise.all()`：每一个都有自己的日志记录，实例为所有的日志记录一次。子工作流也可能是一个条件，如 [Start child workflows](/reliability/workflows#start-child-workflows) 显示。

##### 睡一周，然后要求复查

完成 `run()` 有了不归路，一个耐用的计时器和最后一步：

```typescript
// Point of no return: the parcel arrived, so nothing from here on refunds
// the charge or releases the stock, not a failure and not a cancel.
ctx.commit('delivered');
ctx.setStatus('delivered');

await ctx.sleep('before-review-request', '7d');
await ctx.step('send-review-request', ({ idempotencyKey }) =>
  this.mailService.sendReviewRequest(order, idempotencyKey),
);

return { chargeId: charge.chargeId, trackingNumber: delivery.trackingNumber };
```

`ctx.sleep()` 存储唤醒时间并停放实例，就像等待一样。7 天后，任何工人都会恢复它：从不提前，通常在截止日期的投票间隔内。当它恢复时， `run()` 从顶部回放： `charge-payment` 和 `await-delivery` 返回它们的日志记录值，因此 `charge` 和 `delivery` 一周后就在范围内。一份延迟的工作不能给你这种延续。要睡眠到某个时间点，请传递一个对象 `until`, a `Date` 或历元毫秒，根据日志值计算，例如 `ctx.now()`.

`ctx.commit()` 标志着不归路。一旦包裹送达，无论接下来发生什么，退还费用都是错误的。 `commit()` 放弃迄今为止登记的赔偿。如果审核电子邮件永远失败，则实例结束为 `failed` 随着步骤的错误，没有任何东西被退款或释放。超过这一点的取消也不会撤销任何东西。只有后面的步骤 `commit()` 注册仍然可以运行的补偿。提交点记录在其名称下，因此它像步骤一样重放，状态端点将其列为 `delivered`.

##### 超时整个工作流

等待 `timeout` 界限一等待，一步 `timeout` 一次尝试。若要绑定整个实例，请为工作流提供运行超时：

```typescript
@Workflow('order-fulfilment', { timeout: '30d' })
```

截止日期是实例的开始加上超时，与实例一起存储 `deadline` 因此，它会在重新启动和部署期间保持不变，即使睡眠或等待稍后结束，停放的实例也会唤醒它。一旦它通过，实例就会在下一个实例停止 `ctx` 调用（正在运行的步骤首先结束），其补偿运行，并以 `failed` 用一个 `WorkflowTimeoutError` 赔偿不受最后期限的限制。在这里，等待 3 天后放弃，睡眠需要 7 天，所以 30 天是一个安全网。 `start()` 需要一个 `timeout` 选项也是，它覆盖该实例的装饰器的选项。

#### 取消和操作工作流

##### 让客户支持取消订单

添加一个 `cancel()` 路线 `OrdersController`，和 `ConflictException` 和 `HttpCode` 它的 `@nestjs/common` 进口。`OrdersService.markCancelled()` 设置订单的状态：

```typescript
// Customer support only: protect it with your staff guard.
@Post(':id/cancel')
@HttpCode(202)
async cancel(@Param('id') id: string, @Body('reason') reason: string) {
  const order = await this.ordersService.findOne(id);
  if (order.status === 'delivered') {
    throw new ConflictException(`Order ${id} was delivered. Start a return instead.`);
  }
  // accepted is false if the fulfilment already ended or was already cancelled.
  const { accepted } = await this.workflowClient.cancel(fulfilmentId(id), reason);
  if (accepted) {
    await this.ordersService.markCancelled(id);
  }
  return { accepted };
}
```

`cancel()` 设置标志。一个停放的实例会立即唤醒。一个正在运行的人让它的当前步骤结束，并在下一个步骤停止 `ctx` 呼吁。（另一个进程中正在运行的实例会在其下一次租约续订时注意到该标志，时间为三分之一 `leaseDuration`.）无论哪种方式，完成步骤的补偿都是相反的，并且实例结束为 `cancelled` 原因是它的错误信息。`cancel()` 返回实例 `accepted` 旗。是 `false` 当实例已经完成或失败时，当它已经在补偿失败时，或者当已经请求取消或终止时。第二次取消不会改变任何事情，第一个原因被保留。

一旦承运人报告了交付，路由就会响应 `409`，因为支持应该开始返回。工作流不依赖于该检查。之后到达的取消 `ctx.commit('delivered')` 停止审核请求，不退款。它在使用交付事件之前看到的取消仍然会退款，因为它还没有达到不可退货的地步。

##### 每个状态意味着什么

实例的 `status` 说明它在做什么，以及它是否需要您：

| 状况 | 这意味着什么 | 怎么办 |
| --- | --- | --- |
| `pending` | 已经开始，但尚未被工人认领。一个留下来的 `pending` 在速率限制窗口中等待并发插槽或房间，或者是没有运行的工作人员注册的版本 | 只要有限制，什么都没有。否则，部署具有该版本的工作程序，或删除实例 |
| `running` | 工人持有租约并执行租约 | 没有。`cancel()` 在下一个停止 `ctx` 打电话，然后 `terminate()` 不补偿 |
| `suspended` | 停放在睡眠、等待或重试的后退上，直到 `wakeAt` 或信号 | 没有。信号或 `cancel()` 唤醒它 |
| `compensating` | 失败或取消后撤销已完成的步骤 | 无：它以 `failed`、`cancelled` 或 `compensation_failed` 结尾。`terminate()` 停止撤销 |
| `completed` | 完成，结果是 `run()` 作为它的 `output` | 什么都没有，直到保留清除它 |
| `cancelled` | 在其补偿运行后取消，或在没有它们的情况下终止（`error.name` 是 `WorkflowTerminatedError`）。`error.message` 是原因 | 什么都没有，直到保留清除它 |
| `failed` | 一步放弃，`ctx.fail()` 被调用，运行超时已过或日志达到其极限，然后其补偿运行。或者定义错误（例如中断重放的部署）使其失败而没有进行补偿 | 如果没有补偿运行，请修复原因并重试。否则它就完成了：它的完成步骤被撤销 |
| `compensation_failed` | 撤销中途放弃。`error` 是原始故障，补偿本身的误差为 `error.compensation` | 修复原因，如仓库 API 那是下来的，再试一次。或者手动完成撤消并删除实例 |

##### 重试、删除或终止

`WorkflowClient` 具有表最后一列的操作。通过员工专用路线或脚本呼叫他们：

```typescript
await this.workflowClient.retry(fulfilmentId(orderId));
await this.workflowClient.delete(fulfilmentId(orderId));
await this.workflowClient.terminate(fulfilmentId(orderId), 'Refunded by hand after a chargeback.');
```

- **`retry()`**运行 a `failed` 实例再次从它的日志中：完成的步骤返回它们的结果，放弃的步骤恢复它的尝试，并休眠并等待留下的实例重新启动。一旦修复的代码运行，就会重试中断重放的部署。它拒绝一个补偿运行的实例，因为恢复将建立在未完成的工作之上：而是启动一个新的实例。运行超时的实例需要一个新的实例，因为 `timeout` 选项（从现在开始计算），或 `false` 没有。一个 `compensation_failed` 实例再次运行未完成的补偿，每个补偿都有自己的尝试，并按原样结束： `failed` 或者 `cancelled`.
- **`delete()`**删除已完成的实例及其日志。未完成的需要 `force` 选项，并且不运行其补偿：将其用于没有工作人员可以再运行的实例，例如您不再部署的版本之一。
- **`cancel()`**，如上所述，停止仍在运行的实例，并运行其补偿。
- **`terminate()`**停止实例而不运行其补偿，对于撤销不能或不能运行的实例，例如订单支持已经手动退款。一个停放的实例立即停止，一个正在运行的实例立即停止 `ctx` 调用，并在补偿运行后进行补偿。结尾是 `cancelled`，用一个 `WorkflowTerminatedError` 谁的信息是原因（`Terminated.` 没有）。它被接受后 `cancel()` 它也取代了它，以及 `cancel()` 被拒绝之后。它的孩子得到他们的 `parentClose`，至于任何一端。

`retry()` 和 `delete()` 扔一个 `WorkflowStateError`，谁的 `status` 是 `409`，对于它们没有意义的状态，以及当对实例的另一个更改使它们竞争时。重试记录为 `$retry:1`, `$retry:2` 依此类推，状态和错误都会重试，并且两个操作都会发出，如 `workflow-retried` 和 `workflow-deleted`.

##### 清除已完成的实例

完成的实例及其日志将保留，直到您清除它们。 `purge()` 删除比它更早完成的 `olderThan` 选项，一次一批，信号没有实例可以再拿了。一个实例只接受它启动后发送的信号，因此一旦每个未完成的实例在一个信号之后启动，并且该信号比 `olderThan`，它去；最新的信号总是存在。 `compensation_failed` 实例等待一个人，因此只有在列出它们时，它们才会被清除 `status` 选择。每天晚上在应用程序的一个实例上运行它，使用 `@Cron()` 来自 `@nestjs/schedule` 和 `@OnOneInstance()` 来自 [`@nestjs/locks`](/reliability/locks):

```typescript
@Injectable()
export class WorkflowRetentionJob {
  constructor(private readonly workflowClient: WorkflowClient) {}

  @Cron('30 3 * * *')
  @OnOneInstance({ key: 'workflows:purge' })
  async purge() {
    return this.workflowClient.purge({ olderThan: '30d' });
  }
}
```

`purge()` 解析它删除的 `instances` 和 `signals` 的数量，以及结束的速率限制窗口（`rateLimits`）。只要信号被存储，信号的 `id` 就会进行重复数据删除，因此保持 `olderThan` 的时间长于任何发件人的重新传递窗口，例如您的运营商的 webhook 重试。

#### 限制、子级和批处理工作

##### 限制一次运行的数量

一个工人运行它有空间的每一个到期的实例。三个选项决定了在每个工作者之间运行什么以及以什么顺序运行：并发限制、速率限制和优先级。实现将前两个设置为 `@Workflow()`：

```typescript
@Workflow('order-fulfilment', {
  // One execution per customer at a time, so two of their orders never charge their card at once.
  concurrency: { limit: 1, key: (order: Order) => order.userId },
  // Each execution sends the payment provider one request at most: a charge, or a refund.
  rateLimit: { max: 10, duration: '1s' },
})
```

**并发性**`concurrency` 限制一次运行的实例数量：a`limit` 对于工作流，或 `limit` 每个键带有 `key` 函数，这是客户的 id。一个数组取每一个。一个实例只在执行运行它时保留一个插槽，包括补偿，而不是在它睡眠或等待时：限制保护步骤调用的内容，停放几天的订单不会阻止任何人。一旦租约到期，就会崩溃并释放其位置。超过限制的实例保持到期并等待一个插槽，大多数先过期，并且一个完整的密钥被传递，因此一个忙碌的客户永远不会拖延另一个客户的订单。当实例启动时，根据输入计算密钥，并且 `start()` 的 `concurrencyKey` 选项设置另一个选项，用于限制具有键的工作流。

**费率限制。** `rateLimit` 限制每个窗口开始执行的次数： `max` 每 `duration` 对于工作流，或每个键 `key` 函数，其中 `start()`'s `rateLimitKey` 选项覆盖。每次执行都很重要，第一次执行和睡眠后的每次恢复、信号、重试的回退或取消都很重要，因为每次执行都可以调用限制保护的内容。履行每次执行最多向支付提供者发送一个请求，因此这限制了它的请求，也限制了不发送任何请求的执行。在前一个执行结束后，随着第一次执行而打开一个窗口，并允许 `max` 执行直到它关闭，所以两个窗口背靠背可以允许两次 `max` 在一个 `duration`.假设支付提供者每秒允许 20 个请求：允许 10 个。

**优先事项**`start()` 的 `priority` 选项决定首先申领什么：最低优先级，然后是最逾期的。它是一个从 1 到 2,097,151 的整数，并且在每个优先级之前没有一个开始的实例。Express 订单优先：

```typescript
const fulfilment = await this.workflowClient.start(OrderFulfilmentWorkflow, order, {
  id: fulfilmentId(order.id),
  transaction: tx,
  // Lower runs first: express orders before standard ones.
  priority: order.shipping === 'express' ? 1 : 2,
});
```

由于没有优先级的实例优先，一旦订单有了优先级，其他工作就需要一个优先级来跟随它们：发票批的时间表给出了 10 个，在 [Run workflows on a schedule](/reliability/workflows#run-workflows-on-a-schedule) 中。实例在每次执行时保留其优先级，子级继承其父级的优先级。优先级很严格：源源不断的快递订单阻碍了标准订单。`@StartOn()` 采用相同的选项，如 [With CQRS](/reliability/workflows#with-cqrs) 所示。

限制来自工作流的最高注册版本，并适用于其所有版本，每个进程都会应用其运行的代码的限制，因此请在任何地方部署对这些限制的更改。声明从不允许超过限制允许的范围，但可以暂时允许更少：同时轮询的工人可以进行几个轮询来填充一个短窗口，并且有了并发密钥和速率限制密钥，一种密钥通过的候选人等待下一个声明。声明还按优先级对到期的实例进行排序，索引 `wake_at` 不给它们：便宜，而很少有实例到期，明显有大量积压。`drain()` 当没有剩下的东西可以启动时停止。

##### 启动子工作流

运输增长：预订承运人的提货，如果订单被取消，取消，然后等待交货或退货。它是一个自己的过程，有自己的步骤、重试和状态，所以给它一个自己的工作流程，并将其作为实现的**子**来运行：

```typescript
import { Workflow, type WorkflowContext, type WorkflowRunner } from '@nestjs/workflows';
import type { Order } from '../orders/order.js';
import { shipmentDelivered, shipmentReturned, type CarrierEvent } from './carrier-event.js';
import { CarrierClient } from './carrier.client.js';

/** Books the carrier's pickup, and waits for the delivery: a child of the order's fulfilment. */
@Workflow('shipment')
export class ShipmentWorkflow implements WorkflowRunner<Order, CarrierEvent> {
  constructor(private readonly carrierClient: CarrierClient) {}

  async run(ctx: WorkflowContext, order: Order): Promise<CarrierEvent> {
    await ctx.step(
      'book-pickup',
      ({ idempotencyKey }) => this.carrierClient.bookPickup(order, idempotencyKey),
      { compensate: ({ pickupId }) => this.carrierClient.cancelPickup(pickupId) },
    );

    const outcome = await ctx.waitForAny('await-delivery', {
      delivered: ctx.signalWait(shipmentDelivered, { key: order.id }),
      returned: ctx.signalWait(shipmentReturned, { key: order.id }),
      timedOut: ctx.timer('3d'),
    });
    if (outcome.key === 'returned') {
      ctx.fail(`The carrier returned order ${order.id} to the warehouse.`);
    }
    if (outcome.key === 'timedOut') {
      ctx.fail(`Order ${order.id} was not delivered within 3 days.`);
    }
    return outcome.value;
  }
}
```

`CarrierClient` 是承运人预订的替代品 API 与支付提供者一样，它在第一次预订时回答重复的幂等密钥。在实现中，孩子取代了等待：

```typescript
// Starts the shipment, and waits for it to end: its delivery, or a ChildWorkflowFailedError.
const delivery = await ctx.executeChild(ShipmentWorkflow, order);
```

登记 `ShipmentWorkflow` 和 `CarrierClient` 作为提供者，紧邻履行。承运人的 webhook 没有改变：它发出订单 id 的信号，装运现在是等待它的实例。

- **`ctx.executeChild()`**启动子程序并等待其结束。两者都有日志记录，如 `$child:<id>` 和 `$result:<id>` 因此，重播会让同一个孩子回来，而不是启动另一个孩子，同时实现公园。`ctx.startChild()` 只启动它，并返回一个句柄：它 `result()` 等待孩子，句柄是 `waitForAny()` 让孩子与计时器或信号赛跑。
- **Ids.**子的 id 默认为其父的 id、工作流的名称和本次运行中该工作流的子的计数，例如 `order-71e1973d/shipment#1` 给从平行分支开始的孩子一个 `id` 选项从您的数据中派生出来，以便重播可以以不同的顺序到达他们，找到每一个。
- **失败。**如果子失败、被取消或被终止，`executeChild()` 将抛出一个 `ChildWorkflowFailedError`，其 `status` 和错误为 `cause`。如果没有被发现，它就会像任何错误一样失败履行：退回的包裹会失败运输，其赔偿会取消其预订，然后履行，其赔偿会退还费用并释放库存。抓住它尝试其他东西，比如另一个载体。
- **`parentClose`** 决定当父母终止或开始补偿时仍在奔跑的孩子会发生什么：`'cancel'`，默认值，取消它，它的补偿运行；`'terminate'` 没有他们就停下来；`'abandon'` 让它运行。当支持取消订单时，货件也会随之取消，提货也会随之取消。
- 子代继承其父代的优先权，除非 `startChild()` 获得优先权，并像 `start()` 一样选择 `concurrencyKey` 和 `rateLimitKey` 选项。带有 `children` 选项的 `getStatus()` 列出了一个实例的子实例，每个子实例都有它的 `parentId`，并通过 `parentId` 列出了 `list()` 页。

##### 长时间运行的步骤

一步可以跑几个小时。当它运行时，工人不断在后台续签租约。对于长批处理工作，检查点进度，这样崩溃就不会从头开始重新启动作业。在这里，每月批处理一次一页地呈现发票：

```typescript
import { Workflow, type WorkflowContext, type WorkflowRunner, type WorkflowStepContext } from '@nestjs/workflows';
import { InvoicesService } from './invoices.service.js';

interface Checkpoint {
  cursor: number | null;
  rendered: number;
}

@Workflow('invoice-batch')
export class InvoiceBatchWorkflow implements WorkflowRunner<{ month: string }, { rendered: number }> {
  constructor(private readonly invoicesService: InvoicesService) {}

  async run(ctx: WorkflowContext, { month }: { month: string }) {
    return ctx.step(
      'render-invoices',
      async ({ progress, heartbeat, signal }: WorkflowStepContext<Checkpoint>) => {
        // After a crash, the next attempt starts from the last checkpoint.
        let { cursor, rendered } = progress ?? { cursor: 0, rendered: 0 };
        while (cursor !== null) {
          const page = await this.invoicesService.renderPage(month, cursor, signal);
          cursor = page.nextCursor;
          rendered += page.rendered;
          await heartbeat({ cursor, rendered });
        }
        return { rendered };
      },
      { heartbeatTimeout: '2m' },
    );
  }
}
```

- `heartbeat(progress)` 将检查点写入日志。如果尝试失败，下一个尝试将其作为 `progress`.将参数注释为 `WorkflowStepContext<Checkpoint>` 两种类型。飞行中的页面再次呈现，因此 `renderPage()` 必须覆盖而不是追加。
- `heartbeatTimeout` 停止调用的尝试失败 `heartbeat()` 例如，当进程仍然处于活动状态时，一个进程卡在挂起的套接字上。一个 `timeout` 选项限制尝试的总持续时间。
- `signal` 在关闭、租约丢失和超时时中止。将其传递给您的 I/O。

下面的时间表每月开始批次。当工作属于其自身的进程时，例如 PDF 渲染器，把它交给 [BullMQ](/application/queues) 从一步开始排队，等待作业用信号报告回来。作业 id 是步骤的 `idempotencyKey`，因此重试步骤不会将其排队两次：

```typescript
await ctx.step('enqueue-render', async ({ idempotencyKey }) => {
  await this.invoicesQueue.add('render', { month }, { jobId: idempotencyKey });
});
const rendered = await ctx.waitForSignal('await-render', invoicesRendered, { key: month, timeout: '6h' });
```

队列的处理器在作业完成时报告回来：

```typescript
await this.workflowClient.signal(invoicesRendered, result, { key: job.data.month, id: job.id });
```

这个 `id` 当 BullMQ 再次运行作业时，会存储一次信号，在工作流到达等待时间之前完成的作业仍然算数，因为信号是持久的。

##### 按计划运行工作流

发票每个月的 1 号到期。不要使用启动批处理的 cron 作业，而是在工作流中声明一个计划：

```typescript
import { Workflow, type WorkflowContext, type WorkflowRunner, type WorkflowStepContext } from '@nestjs/workflows';

/** The month before the one `at` falls in, in UTC ('2026-09' in October 2026): 02:00 on the 1st in New York is the 1st in UTC too. */
const lastMonth = (at: number) => new Date(new Date(at).setUTCDate(0)).toISOString().slice(0, 7);

@Workflow('invoice-batch', {
  schedules: [
    {
      id: 'monthly-invoices',
      // At 02:00 on the 1st of every month, in the store's time zone: last month's invoices.
      cron: '0 2 1 * *',
      tz: 'America/New_York',
      // A deploy or an outage at 02:00 delays the batch instead of skipping a month.
      missed: 'once',
      // After the orders (express 1, standard 2): without a priority, it would go before them.
      priority: 10,
      input: ({ at }) => ({ month: lastMonth(at) }),
    },
  ],
})
export class InvoiceBatchWorkflow implements WorkflowRunner<{ month: string }, { rendered: number }> {
  // ...as before
}
```

代码声明调度的每个 worker 都启动它的实例，每个实例启动一个实例，无论有多少个 worker：它的 id 是调度的 id 和实例的时间，如 `monthly-invoices@2026-10-01T06:00:00.000Z`.这 `input` 函数接收事件，其调度的 `id` 时间到了 `at` 实例也是如此，因为 `ctx.schedule`，这是 `null` 对于以其他方式开始的实例。

- **何时。**`cron` 取 5 个字段，或先取 6 个字段，`every` 固定间隔，以及 `rrule` 安 RFC5545 递归规则。时间是挂钟时间 `tz`,UTC 默认情况下，批处理在时钟变化前后的纽约 02:00 开始。当时钟倒转时，出现两次的本地时间第一次运行一次，因此每小时时间表跳过重复时间的第二次通过。当他们前进时，一个不存在的时间仍然运行，就像时钟跳动一样晚：02:30 运行在 03:30。`every` 不接受 `tz`：无论时区如何，它都会重复固定的间隔。`startAt`,`endAt` 和 `limit` 有时间表。
- **`missed`** 表示在部署或停机期间，如果没有工作人员可以启动，会发生什么情况。`'skip'`，默认情况下，只有当工人在一分钟内找到它时，才会启动一个；`'once'` 开始其中最新的一个；`'all'` 启动它们中的每一个，最多最新的 100 个，需要 `overlap: 'allow'`。它传递的事件在 `schedule-skipped` 事件中报告。
- **`overlap`**表示当计划启动的实例未完成时，实例执行的操作：`'skip'` 默认值，将其传递给 `schedule-skipped` 事件；`'allow'` 无论如何都要开始；`'cancel-previous'` 取消正在运行的；`'buffer-one'` 运行结束后启动它。

声明的计划属于代码，而滚动部署并排运行新旧代码。每个进程保存其工作流在启动时声明的时间表，并在其工人运行时每分钟确认这些时间表。如果一个进程自己的代码没有声明它，或者工作流的较新版本以不同的方式声明它，则进程保留它，而另一个进程确认它。一旦五分钟内没有进程确认它，进程就会删除其代码没有声明的计划，无论它是否运行计划的工作流，并用自己的声明替换另一个声明。因此，在中间部署重新启动的旧 pod 不会留下新代码添加或新版本更改的时间表，部署删除的时间表会在旧代码的最后一个进程停止后大约五分钟消失，也会在部署删除其工作流时消失，回滚会将旧声明带回来。

同一数据库上的其他代码进程（如其他工作流的工作程序）也会在没有代码声明已运行五分钟的工作程序时删除计划，同时这些工作程序缩放为零。代码声明它的下一个进程在它开始时再次保存它，调度重新开始：从它的下一次出现开始，没有暂停，它的运行从零开始计算。

`WorkflowClient.schedules`，也可注入为 `WorkflowSchedules`，在运行时处理计划。`trigger('monthly-invoices')` 现在开始一个事件，不管 `overlap` 说什么，甚至当计划暂停时，它的时间为 `at`。`pause()` 停止发生，直到 `resume()`，从现在之后的第一个开始。`preview()` 以历元毫秒为单位返回下一次发生，`get()` 和 `list()` 读取时间表。代码中不包含的时间表（例如每个客户一个时间表）由 `upsert()` 保存，然后 `remove()` 删除它，保留它开始运行的实例：

```typescript
await this.workflowClient.schedules.upsert(`reorder-reminder-${user.id}`, {
  workflow: ReorderReminderWorkflow,
  // Every 4 weeks, on Saturdays at 09:00 in the customer's time zone
  rrule: 'FREQ=WEEKLY;INTERVAL=4;BYDAY=SA;BYHOUR=9;BYMINUTE=0',
  tz: user.timeZone,
  input: { userId: user.id },
});
```

`upsert()` 和 `remove()` 拒绝声明的时间表，您可以在代码中更改它。

##### 等待结果

大多数调用者开始工作流程并继续前进。有些人需要它的结果：一个会计师现在想要一个月的发票，在时间表呈现它们之前，调用一个呈现它们的路由，并用计数来回答。`startAndWait()` 启动实例并等待其结束：

```typescript
import { Controller, HttpCode, Param, Post, Res } from '@nestjs/common';
import { WorkflowClient, WorkflowResultTimeoutError } from '@nestjs/workflows';
import type { Response } from 'express';
import { InvoiceBatchWorkflow } from './invoice-batch.workflow.js';

@Controller('invoices')
export class InvoicesController {
  constructor(private readonly workflowClient: WorkflowClient) {}

  // Accounting only: protect it with your staff guard.
  @Post(':month')
  @HttpCode(200)
  async render(@Param('month') month: string, @Res({ passthrough: true }) response: Response) {
    try {
      // One batch per month: calling again, while it runs or after it ended, waits for the same one.
      return await this.workflowClient.startAndWait(InvoiceBatchWorkflow, { month }, { id: `invoices-${month}` }, { timeout: '30s' });
    } catch (error) {
      if (!(error instanceof WorkflowResultTimeoutError)) {
        throw error;
      }
      // The batch keeps running: answer now, and let the accountant call again later.
      response.status(202);
      return { rendering: true };
    }
  }
}
```

- `startAndWait()` 是 `start()`,然后 `result()`，它等待实例结束并使用其输出进行解析。对于已经有实例的 id，它会等待该实例，因此会计师在批处理运行时或结束后再次调用路由，会得到相同的批处理。等待的选项是第四个论点：第三个论点 `timeout` 保持实例的运行超时。
- 过了等待 `timeout` 在挂钟时间而不是模块的时钟中，它拒绝 `WorkflowResultTimeoutError`，实例继续运行：路由响应 `202`. A `signal` 选项在等待中止时停止等待，例如当呼叫者离开时。
- 在关机时，在工人完成其运行步骤时，将持续等待，直至 `shutdownTimeout`，所以同时结束的实例仍然用它的结果来回答。然后等待拒绝 `Error`,之前 Nest 关闭 HTTP 服务器，路由立即响应，这里有一个 `500`，而不是推迟关机直到它等待 `timeout`.
- 失败、被取消或终止的实例拒绝使用 `WorkflowFailedError`，谁的 `status` 说它是如何结束的以及谁的 `cause` 是它的错误。这里，那是一个 `500`.
- `result()` 按 id 等待实例，如 `trigger()` 启动，无论哪个进程运行它。`startAndWait()` 拒绝 `transaction` 选项，因为实例仅在您的事务提交时存在：call`start()` 在交易中，以及 `result()` 提交后。

#### 安全地部署更改

日志是按名称键入的，因此步骤、睡眠和等待名称是与每个仍在运行的实例的契约。名称也是幂等键的一部分。

假设您重命名 `charge-payment` 二 `charge-card` 并部署。等待运营商恢复的订单，没有找到 `charge-card` 在其日记账中记录，并将在支付提供者从未见过的密钥下再次向卡收费。在执行的第一个新步骤运行之前，引擎检查代码是否到达了日志中的每一步。这里没有，所以实例在不充电的情况下失败：

```text
Instance "order-6d0f8c06" of workflow "order-fulfilment@1" does not match its journal:
"charge-payment", "reserve-stock", "await-delivery" were recorded by an earlier run but not
reached before the new step "charge-card". A deployed change renamed, removed or reordered steps.
Ship such changes as a new version (@Workflow(name, { version })) and keep the old class
registered until its instances finish.
```

它的补偿也不起作用，因为它们是由不再匹配的代码定义的。实例留给一个人来处理。支票没有看到一个步骤，它的名字保持不变，但它的主体现在做了一些不同的事情。

有些更改不需要新版本：

- 改变一个步骤的主体而不改变它的含义，
- 在最后一个步骤之后添加步骤，睡眠或等待任何正在运行的实例到达，
- 更改重试选项和超时。

其他任何东西都是新版本。假设营销部门希望在付款后立即确认订单。之前插入一个步骤 `reserve-stock` 更改回放看到的内容，因此复制该类并提升其版本：

```typescript
@Workflow('order-fulfilment', {
  version: 2,
  // The limits of the highest registered version apply to every version: keep them.
  concurrency: { limit: 1, key: (order: Order) => order.userId },
  rateLimit: { max: 10, duration: '1s' },
})
export class OrderFulfilmentWorkflowV2 implements WorkflowRunner<Order, FulfilmentResult> {
  // ...same constructor as version 1

  async run(ctx: WorkflowContext, order: Order): Promise<FulfilmentResult> {
    const charge = await ctx.step(
      'charge-payment',
      // ...unchanged
    );
    ctx.setStatus('paid');

    await ctx.step('send-order-confirmation', ({ idempotencyKey }) =>
      this.mailService.sendOrderConfirmation(order, idempotencyKey),
    );

    // ...the rest is unchanged from version 1
  }
}
```

注册两个类。实例保留它启动时的版本，而工作程序只声明它注册的版本，因此新旧 pod 可以在滚动部署期间并排运行。新实例从最高注册版本开始，即使控制器仍然通过 `OrderFulfilmentWorkflow`，因为该类只标识工作流的名称。要固定一个，请添加 `version: 1` 到 `start()` 选项。删除版本 1 一次 `list()` 使用工作流的名称，`version: 1` 和未完成的状态（`pending`,`running`,`suspended` 和 `compensating`) 返回时是空的。

##### 工作流代码规则

`run()` 每次实例恢复时，从顶部再次执行。步骤之间的代码在每次执行时运行，因此每次都必须做出相同的决定：

- 把任何接触或读取外部世界的东西放在一个步骤中：HTTP 调用、数据库读写、功能标志。
- 在外部步骤中，使用 `ctx.now()`、`ctx.random()` 和 `ctx.uuid()` 代替 `Date.now()`、`Math.random()` 和 `randomUUID()`。他们被记录下来了。
- 在 `run()`，仅 `await``ctx` 运算和纯计算。永远不要等待真正的计时器。
- 步骤、睡眠和等待名称在运行中必须是唯一的。在循环中，将索引添加到名称中，例如 `remind-1` 和 `remind-2` 给从平行分支开始的孩子一个 `id` 他们自己的。
- 不要打电话 `ctx` 步骤函数中的方法。该函数运行一次，并且只回放它的结果，因此当一个步骤调用时，引擎会使实例失败 `ctx`.扔一个 `NonRetryableStepError` 从一步而不是呼叫 `ctx.fail()` 那里。
- 如果在 `run()` 把你处理不了的东西扔回去。`isWorkflowInterrupt()` 标识发动机的控制流。引擎不依赖于它：在吞咽中断之后，没有步骤运行，`commit()` 再次抛出，取消仍然取消。但 `finally` 每个悬架上都有块，所以要避免副作用。
- `Promise.all()` 超过步骤是好的，在同一个步骤中 `Promise.all()` 因为睡眠或等待之后开始。`Promise.race()` 和 `Promise.any()` 不适合重播。
- 输入、步进结果和信号有效载荷必须为 JSON-可序列化。一个 `Date` 在第一次运行和每次重播时都以字符串的形式返回，并且 `Journaled` 结果和有效载荷的类型是这样说的。
- 保持无运行状态 `this`：类的一个实例服务于每个订单。

#### 试试看

##### 试试

创建数据库，应用迁移，然后使用 `DATABASE_URL` 指向数据库：

```bash
$ npm run start:dev
...
[Nest] 33662  - 09/30/2026, 1:28:30 PM     LOG [WorkflowsModule] WorkflowStorage: PostgresWorkflowStore
[Nest] 33662  - 09/30/2026, 1:28:30 PM     LOG [WorkflowsModule] PostgresWorkflowStore: migrated schema "nest_workflows" to version 1.
[Nest] 33662  - 09/30/2026, 1:28:30 PM     LOG [NestApplication] Nest application successfully started +8ms
```

日志命名正在使用的存储，而不是内存中的默认值，并说明存储创建了它的模式：您的迁移创建了 `orders` 商店有自己的桌子。下订单，然后询问订单在哪里：

```bash
$ curl -X POST http://localhost:3000/orders -H "Content-Type: application/json" \
    -d '{"userId": "u_42", "items": [{"productId": "salmon-kibble-2kg", "quantity": 1, "price": 2499}]}'
{"id":"f7e1e1eb","userId":"u_42","items":[{"productId":"salmon-kibble-2kg","quantity":1,"price":2499}],"shipping":"standard","total":2499,"status":"placed","fulfilment":{"id":"order-f7e1e1eb","workflow":"order-fulfilment","version":1,"created":true,"status":"pending"}}

$ curl http://localhost:3000/orders/f7e1e1eb/fulfilment
{"status":"suspended","stage":"awaiting-delivery","waitingFor":["shipment.delivered","shipment.returned"],"wakeAt":"2026-10-03T11:28:42.251Z","steps":{"charge-payment":"completed","reserve-stock":"completed","await-delivery":"pending"},"error":null}
```

订单及其履行一起提交，工人拿起实例，卡被收费，粗粮被保留，实例被停放，直到承运人报告交付或退货，或 3 天的最后期限 `wakeAt` 传球。

现在播放承运人并报告交付情况：

```bash
$ curl -X POST http://localhost:3000/webhooks/carrier -H "Content-Type: application/json" \
    -d '{"type": "shipment.delivered", "reference": "f7e1e1eb", "trackingNumber": "TRK123456789", "occurredAt": "2026-09-30T14:05:00Z"}'
{"received":true}

$ curl http://localhost:3000/orders/f7e1e1eb/fulfilment
{"status":"suspended","stage":"delivered","waitingFor":[],"wakeAt":"2026-10-07T11:28:58.885Z","steps":{"charge-payment":"completed","reserve-stock":"completed","await-delivery":"completed","delivered":"completed","before-review-request":"pending"},"error":null}
```

该实例已经过了不归点，并处于休眠状态，直到 7 天后审核请求到期。支持人员无法再取消订单，并且拒绝为商店不知道的订单配送：

```bash
$ curl -X POST http://localhost:3000/orders/f7e1e1eb/cancel -H "Content-Type: application/json" -d '{"reason": "Changed my mind."}'
{"message":"Order f7e1e1eb was delivered. Start a return instead.","error":"Conflict","statusCode":409}

$ curl -X POST http://localhost:3000/webhooks/carrier -H "Content-Type: application/json" \
    -d '{"type": "shipment.delivered", "reference": "nope", "trackingNumber": "TRK1", "occurredAt": "2026-09-30T14:05:00Z"}'
{"message":"Order nope not found.","error":"Not Found","statusCode":404}
```

下第二个订单（它得到 id`58b424f5` 此处）并在等待承运人时取消它：

```bash
$ curl -X POST http://localhost:3000/orders/58b424f5/cancel -H "Content-Type: application/json" \
    -d '{"reason": "Customer ordered the wrong size."}'
{"accepted":true}

$ curl http://localhost:3000/orders/58b424f5/fulfilment
{"status":"cancelled","stage":"awaiting-delivery","waitingFor":[],"wakeAt":null,"steps":{"charge-payment":"completed","reserve-stock":"completed","await-delivery":"cancelled","$compensate:reserve-stock":"completed","$compensate:charge-payment":"completed"},"error":"Customer ordered the wrong size."}
```

日记显示了两种补偿：先释放股票，然后退还费用。等待从未结束，所以标记 `cancelled`，阶段停留在工作流上次设置的位置。

实例是数据库中的行，在存储模式中，订单旁边：

```bash
$ psql "$DATABASE_URL" -c "SELECT o.id, o.status, w.status AS fulfilment, w.runs FROM orders o JOIN nest_workflows.instances w ON w.id = 'order-' || o.id ORDER BY w.created_at"
    id    |  status   | fulfilment | runs
----------+-----------+------------+------
 f7e1e1eb | delivered | suspended  |    2
 58b424f5 | cancelled | cancelled  |    2
(2 rows)
```

最后，重新启动应用程序，再次请求第一个订单。它的状态没有改变，商店也没有找到要迁移的东西。针对同一数据库在另一个端口上启动第二个进程，两者共享工作：每个实例一次在其中一个上运行。要在不等待 3 天的情况下查看 3 天超时，请使用测试时钟，如下所示。

##### 使用手动时钟进行测试

有两件事使得工作流测试变得快速而确定：

- 引擎使用的每个时间戳（截止日期、重试时间、租约到期和 `ctx.now()`）都来自模块的 `clock`。`ManualWorkflowClock` 只有在调用 `advance()` 时才会移动。
- 当工人被禁用时，后台不会运行任何内容。`WorkflowWorker.drain()` 运行每个到期的实例，直到没有剩下可以启动的实例，并开始时钟已经通过的调度的出现。时钟从 2026 年 1 月 1 日 00:00UTC 开始，因此将其移动几天的测试也开始发票批次的第一次出现，时间是 07:00UTC。

在 PGlite 上运行测试，使用您的实际迁移。覆盖数据库 `DrizzleModule` 寄存器（`getDrizzleToken()` 返回它的令牌）与 PGlite 上的一个：工作流存储跟随，因为它的工厂注入它，并在应用程序启动时在那里创建它的模式。凌驾于 `WORKFLOWS_MODULE_OPTIONS` 用一个 `ManualWorkflowClock` 和一个残疾工人。在应用程序之间共享数据库和外部 API 的替代品，因为它们的寿命比进程长：

```typescript
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { Test } from '@nestjs/testing';
import { ManualWorkflowClock, WORKFLOWS_MODULE_OPTIONS, WorkflowClient, WorkflowWorker } from '@nestjs/workflows';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
// ...AppModule, getDrizzleToken, the schema and the stand-in services

/**
 * PostgreSQL in-process (PGlite), with the app's migrations applied: the orders
 * table. The workflow store creates its own tables when the application starts.
 */
export async function createDatabase() {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: fileURLToPath(new URL('../drizzle', import.meta.url)) });
  return { db, close: () => client.close() };
}

/** Your database and the external APIs. They outlive a process, so every "process" in a test shares them. */
export async function createWorld() {
  const database = await createDatabase();
  return {
    db: database.db,
    paymentProvider: new PaymentProviderClient(),
    inventory: new InventoryService(),
    mail: new MailService(),
    invoices: new InvoicesService(database.db as unknown as Database),
    close: database.close,
  };
}

export type World = Awaited<ReturnType<typeof createWorld>>;

export async function bootApp(clock: ManualWorkflowClock, world: World) {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(getDrizzleToken())
    .useValue(world.db)
    .overrideProvider(WORKFLOWS_MODULE_OPTIONS)
    .useValue({ clock, worker: { enabled: false, shutdownTimeout: 50 } })
    .overrideProvider(PaymentProviderClient)
    .useValue(world.paymentProvider)
    .overrideProvider(InventoryService)
    .useValue(world.inventory)
    .overrideProvider(MailService)
    .useValue(world.mail)
    .overrideProvider(InvoicesService)
    .useValue(world.invoices)
    .compile();
  const app = moduleRef.createNestApplication({ logger: false });
  await app.listen(0, '127.0.0.1');
  return {
    app,
    url: await app.getUrl(),
    orders: app.get(OrdersService),
    workflows: app.get(WorkflowClient),
    worker: app.get(WorkflowWorker),
    close: () => app.close(),
  };
}

export type App = Awaited<ReturnType<typeof bootApp>>;
```

使用手动时钟，3 天超时是一个 `advance()` 呼叫：

```typescript
describe('order fulfilment', () => {
  let clock: ManualWorkflowClock;
  let world: World;
  let node: App;

  beforeEach(async () => {
    clock = new ManualWorkflowClock();
    world = await createWorld();
    node = await bootApp(clock, world);
  });

  afterEach(async () => {
    await node.close();
    await world.close();
  });

  // ...

  it('refunds and releases the stock when the carrier never confirms delivery', async () => {
    const order = await node.orders.place({ userId: 'u_42', items: [{ productId: KIBBLE, quantity: 1, price: 2499 }] });
    await node.worker.drain(); // charge, reserve, then park for up to 3 days

    clock.advance('3d');
    await node.worker.drain(); // the wait times out and the compensations run

    const fulfilment = await node.workflows.getStatus(fulfilmentId(order.id), { journal: true });
    expect(fulfilment).toMatchObject({
      status: 'failed',
      error: { message: `Order ${order.id} was not delivered within 3 days.` },
    });
    // Compensations run in reverse: release the stock, then refund.
    expect(fulfilment!.journal.filter((entry) => entry.kind === 'compensation').map((entry) => entry.name)).toEqual([
      '$compensate:reserve-stock',
      '$compensate:charge-payment',
    ]);
    expect(world.paymentProvider.refunds).toHaveLength(1);
    expect(world.inventory.stock.get(KIBBLE)).toBe(25);
  });

  // ...

  it('saves the order and starts its fulfilment together, or neither', async () => {
    // The transaction fails after start(): say, the next statement hits a constraint.
    const original = node.workflows.start.bind(node.workflows);
    vi.spyOn(node.workflows, 'start').mockImplementationOnce(async (...args) => {
      await original(...args); // the instance is created in the transaction...
      throw new Error('insert or update on table "order_lines" violates foreign key constraint');
    });
    await expect(place()).rejects.toThrow('violates foreign key constraint');

    // ...and rolled back with it: no order, no fulfilment for the worker to charge.
    expect(await world.db.select().from(orders)).toEqual([]);
    expect(await node.workflows.list()).toEqual([]);
    expect(await node.worker.drain()).toBe(0);
    expect(world.paymentProvider.requests).toBe(0);
  });
});
```

##### 测试崩溃恢复

`createWorld()` 为每个测试创建一个新的数据库。崩溃安全需要在同一个数据库上运行两个应用程序。在步骤挂起时关闭应用程序模拟崩溃：关闭超时到期，死进程的租约将保留在数据库中，直到它到期。之后，第二个应用程序接管：

```typescript
it('survives a crash in the middle of an order', async () => {
  const first = await bootApp(clock, world);
  const order = await first.orders.place({ userId: 'u_42', items: [{ productId: KIBBLE, quantity: 1, price: 2499 }] });

  // The process dies while reserving stock, after the payment provider charged the card.
  const reserve = vi.spyOn(world.inventory, 'reserve').mockImplementationOnce(() => new Promise<never>(() => {}));
  void first.worker.drain();
  await vi.waitFor(() => expect(reserve).toHaveBeenCalled());
  await first.close();

  // Another process on the same database takes over once the dead one's lease expires.
  const second = await bootApp(clock, world);
  clock.advance('31s');
  await second.worker.drain();

  expect(await second.workflows.getStatus(fulfilmentId(order.id))).toMatchObject({
    status: 'suspended',
    waits: [
      { signal: 'shipment.delivered', key: order.id },
      { signal: 'shipment.returned', key: order.id },
    ],
  });
  expect(world.paymentProvider.charges).toHaveLength(1); // journaled: not charged again
  expect(reserve.mock.calls.map(([, key]) => key)).toEqual([
    `order-${order.id}:reserve-stock`, // the attempt that died
    `order-${order.id}:reserve-stock`, // the retry, with the same key
  ]);
  await second.close();
});
```

同样的设置涵盖了补偿中间的崩溃：下一个进程重放日志以重建补偿列表，跳过已经完成的补偿，并继续其余的。PGlite 是一个单一的连接，所以它不能显示两个工人争夺同一个实例；本教程对商店的测试在 PostgreSQL 服务器上运行合同的竞赛，以及共享 30 个订单的三个应用程序。

若要在不覆盖提供程序的情况下测试自己的存储，请调用 `registerSource()` 在 `moduleRef.get(WorkflowStorage)` 以前 `init()`，与 `replace: true`：没有它，第二次注册就会抛出。这个 `clock` 选项需要任何 `WorkflowClock`，一个对象 `now()` 返回历元毫秒，因此测试可以从已有的时钟驱动引擎。

#### 和 CQRS

如果您的申请遵循 [CQRS 食谱](/recipes/cqrs) 命令处理程序发布事件，事件处理程序和传奇对事件做出反应。他们在记忆中做出反应：就在过程停止之前发布的事件永远不会到达他们手中，等待第二个事件的传奇在重新启动时忘记了第一个事件。这个 `@nestjs/workflows/cqrs`entry point 允许事件本身启动并持久地向工作流发出信号，而您的代码则继续执行命令和发布事件。它适用于 `@nestjs/cqrs`11 及以后，注册于 `CqrsModule.forRoot()` 就像食谱里的那样。

##### 将事件映射到工作流

在这里，履行在下订单时开始，在承运人报告交付时唤醒，就像以前一样，但是工作流客户端调用从应用程序代码中消失了。在 `CqrsModule` 和 `WorkflowsModule` 旁边导入 `WorkflowsCqrsModule`：

```typescript
import { CqrsModule } from '@nestjs/cqrs';
import { WorkflowsModule, WorkflowStorage } from '@nestjs/workflows';
import { WorkflowsCqrsModule } from '@nestjs/workflows/cqrs';

@Module({
  imports: [
    // ...DrizzleModule, as before
    CqrsModule.forRoot(),
    WorkflowsModule.forRoot(),
    WorkflowsCqrsModule, // mapped events start and signal workflows
  ],
  controllers: [OrdersController, CarrierWebhookController],
  providers: [
    // ...the store and the services, as before
    PlaceOrderHandler,
    MarkDeliveredHandler,
    ChargePaymentHandler,
    OrderFulfilmentWorkflow,
  ],
})
export class AppModule {}
```

然后将事件映射到工作流类上。`@StartOn()` 发布事件时启动工作流，以及 `@SignalOn()` 发送其中一个信号：

```typescript
import { SignalOn, StartOn } from '@nestjs/workflows/cqrs';
import { OrderDeliveredEvent } from './order-delivered.event.js';
import { OrderPlacedEvent } from './order-placed.event.js';

@Workflow('order-fulfilment')
@StartOn(OrderPlacedEvent, {
  id: (event) => fulfilmentId(event.order.id),
  input: (event) => event.order,
  // Lower runs first: express orders before standard ones.
  priority: (event) => (event.order.shipping === 'express' ? 1 : 2),
})
@SignalOn(OrderDeliveredEvent, {
  signal: shipmentDelivered,
  key: (event) => event.delivery.reference,
  id: (event) => event.delivery.trackingNumber,
  payload: (event) => event.delivery,
})
export class OrderFulfilmentWorkflow implements WorkflowRunner<Order, FulfilmentResult> {
  // ...the constructor, which now injects CommandBus too, and run()
}
```

`@StartOn()` 的 `id` 是必须的。它从业务密钥导出实例 id，如 `start()` 是的，因此发布两次的事件会找到第一个事件启动的实例。还需要 `start()` 的 `priority`,`concurrencyKey` 和 `rateLimitKey`，每个作为一个值或事件的函数：在这里，快递订单优先，就像以前一样。`@SignalOn()` 的 `id` 是可选的，并成为信号的 `id`：再次发布的传递事件（例如运营商重试的 webhook）不会存储第二个信号。`input` 事件本身的默认值和信号的默认值 `payload` 也。TypeScript 检查输入是否符合 `run()` 以及有效载荷与信号类型的对比。事件是普通类，例如 `OrderPlacedEvent` 用一个 `readonly order: Order` 构造函数参数。

命令处理程序保存订单并在一个事务中发布事件：

```typescript
import { randomUUID } from 'node:crypto';
import { CommandHandler, EventBus, type ICommandHandler } from '@nestjs/cqrs';
import { InjectDrizzle } from '@nestjs/drizzle';
import type { Database } from '../database/drizzle.js';
import { orders } from '../database/schema.js';
import type { Order } from './order.js';
import { OrderPlacedEvent } from './order-placed.event.js';
import { PlaceOrderCommand } from './place-order.command.js';

@CommandHandler(PlaceOrderCommand)
export class PlaceOrderHandler implements ICommandHandler<PlaceOrderCommand> {
  constructor(
    @InjectDrizzle() private readonly db: Database,
    private readonly eventBus: EventBus,
  ) {}

  async execute({ dto }: PlaceOrderCommand): Promise<Order> {
    const total = dto.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const order: Order = {
      id: randomUUID().slice(0, 8),
      userId: dto.userId,
      items: dto.items,
      shipping: dto.shipping ?? 'standard',
      total,
      status: 'placed',
    };

    return this.db.transaction(async (tx) => {
      await tx.insert(orders).values(order);
      // The transaction rides along as the dispatcher context: the fulfilment
      // this event starts commits with the order, or rolls back with it.
      await this.eventBus.publish(new OrderPlacedEvent(order), { transaction: tx });
      return order;
    });
  }
}
```

的第二个论点 `publish()` 和 `publishAll()` 是 CQRS 的调度程序上下文。`WorkflowsCqrsModule` 阅读它 `transaction` 属性并将其传递给 `start()` 和 `signal()`，因此实例是通过您的事务创建的，就像 `transaction` 选择。和 TypeORM，调度器上下文携带 `EntityManager` 那个 `dataSource.transaction()` 交出其回调，在相同的 `transaction` 财产。`publish()` 一旦工作流启动并发出信号，事件才会到达您的事件处理程序和传奇。没有工作流图直接经过的事件，不变。控制器执行命令：`POST /orders` 执行 `PlaceOrderCommand`，运营商的 webhook 执行 `MarkDeliveredCommand`，谁的 `MarkDeliveredHandler` 对交付执行相同的操作：它会更新订单的状态并发布 `OrderDeliveredEvent` 在一个事务中，所以状态和信号一起提交。

该模块包装事件总线具有的任何发布者，因此您设置的发布者 `CqrsModule.forRoot()` 的 `eventPublisher` 选项（例如消息代理）仍然会在工作流之后接收每个事件。置换 `EventBus.publisher` 启动后会绕过工作流，所以如果有什么事情发生，启动就会失败。当工作流映射事件时，它也会失败，但是 `WorkflowsCqrsModule` 当一个类两次映射同一事件时，或者当 `@StartOn()` 为工作流提供一个键，每个键没有限制。当注册工作流的两个版本时，最高版本的 `@StartOn()` 决定什么开始，信号到达每个版本的等待实例，发送一次，因此它们的 `@SignalOn()` 声明必须就其有效载荷和 `id`:`publish()` 当他们不拒绝时拒绝。

映射驻留在工作流类上，因此每个发布映射事件的进程都会注册它们，包括不运行工作流的进程，例如 API 那只发号施令。像往常一样在那里注册类和存储，然后通过 `worker: false` 二 `WorkflowsModule.forRoot()`：流程启动并向工作流发出信号，工作流程执行工作流。导入的过程 `WorkflowsCqrsModule` 但是没有注册映射事件开始的工作流，也没有发出信号，并且在启动时记录一个警告。

##### 从步骤执行命令

一个步骤可以执行命令。将步骤的幂等键与命令一起传递，并让处理程序将其交给它调用的系统：

```typescript
const charge = await ctx.step(
  'charge-payment',
  ({ idempotencyKey }) => this.commandBus.execute(new ChargePaymentCommand(order, idempotencyKey)),
  {
    retry: { attempts: 5, backoff: { delay: '2s' } },
    compensate: (charge, { idempotencyKey }) => this.paymentsService.refund(charge.chargeId, idempotencyKey),
  },
);
```

`ChargePaymentHandler` 呼叫 `PaymentsService.charge()` 有了键，一个重试的步骤永远不会充电两次，命令的结果像任何步骤一样被记录。一个步骤也可以发布事件和发送信号。它至少运行一次，因此从步骤发布的事件可以再次发布。映射的开始找到它的实例， `start()` 没有 `id` 在一个步骤中：它从步骤中获得一个 id `idempotencyKey`，工作流的名称及其在该工作流的步骤开始中的位置，并且 repeat 返回第一次启动的实例，包括输入。直接或通过映射事件从步骤内部发送的信号存储一次：没有 `id` 它本身从步骤中得到一个 `idempotencyKey` 以及它在具有相同名称和密钥的步骤信号中的位置。按固定顺序发送。同时发送多个名称和密钥的步骤应该给每个名称和密钥 `id`.

##### 每种出版方式都保证了什么

保证取决于事件的发布方式和时间：

| 事件的发布方式 | 工作流的开始或信号 | 如果进程终止或写入失败 |
| --- | --- | --- |
| 在您的事务中，事务处于调度程序上下文中 | 与您的写作一起提交，或者根本不提交 | 任何事情都没有完成一半。启动失败或信号拒绝 `publish()`，您的事务回滚 |
| 聚合的事件，来自 `commit()` 在 dispatcher 上下文中使用事务（`@nestjs/cqrs`12.1 或更高版本），或与 `publishAll()` 在您的事务中，如下所示 | 与您的写作一起提交，或者根本不提交 | 如上所述：启动失败或信号拒绝 `commit()` 或者 `publishAll()`，您的事务回滚 |
| 在您的事务提交之后 | 之前写的 `publish()` 决议 | 提交和发布之间的崩溃会丢失它。从对账作业重新发布：开始 `id` 使其安全，信号也是如此，如果 `@SignalOn()` 设置一个 |
| 来自 `commit()` 在没有事务处理的情况下，与 `EventPublisher` | 写在您的事务之外，在后台，除非您等待 `commit()`（12.1 或更高版本） | 在崩溃中丢失，而没有任何等待它，并在您的交易回滚时被留下。失败归因于 `UnhandledExceptionBus` 和日志，模块每个事件类记录一次警告 |
| 来自 `commit()` 没有交易，`@Publishable()` 合计 | 写在您的事务之外，在后台，除非您等待 `commit()`（12.1 或更高版本） | 在崩溃中丢失，而没有任何等待它，并在您的交易回滚时被留下。出乎意料的是，失败是未经处理的承诺拒绝，它会停止 Node.js 默认。除了平原之外，没有什么能说明这一点 `publish()` 所以没有警告 |
| 从工作流步骤 | 一次，无论步骤运行多少次 | 重试的步骤不会开始任何新的操作，也不会存储第二个信号 |

与 `EventPublisher.mergeObjectContext()` 或 `mergeClassContext()` 合并的聚合，或用 `@Publishable()` 装饰的聚合，从 `commit()` 发布其事件。对于 `@nestjs/cqrs`12.1 或更高版本，`commit()` 像 `publish()` 一样接受调度程序上下文，并返回事件总线返回的内容。将您的事务传递给它，并在命令处理程序的事务中等待它：然后，聚合的事件会启动该事务中的工作流并发出信号，当启动或信号失败时，`commit()` 会拒绝，这会回滚事务：

```typescript
await order.commit({ transaction: tx });
```

`commit()` 在编写工作流之前，在聚合移交事件时清除它们，因此在失败后，使用新加载的聚合再次运行该命令。

没有调度器上下文，`commit()` 在事务之外发布：工作流仍然会启动，但是回滚会把它们留在后面，在写入之前崩溃会丢失它们。不要让它发布启动或发出工作流信号的事件。和 `@nestjs/cqrs`12.0 或更早版本，`commit()` 不接受上下文，也不返回任何等待的内容，因此在命令处理程序的事务中自己发布聚合的事件，然后清除它们：

```typescript
await this.eventBus.publishAll(order.getUncommittedEvents(), { transaction: tx });
order.uncommit();
```

该模块告诉您映射事件何时从合并聚合的 `commit()` 没有事务：第一次，它会记录一个命名事件类的警告。一个 `@Publishable()` 聚合的事件到达时没有任何调度器上下文，就像普通的 `publish()` 打电话，这样他们就不会收到警告。

您的事件处理程序和传奇仍然会在工作流之后接收内存中的每个事件。他们在事务提交之前运行事务，就像他们一直做的那样，这样他们就可以对事务回滚的事件做出反应。一个把一个事件变成一个命令的传奇可以一直是一个传奇。一个记住事件的传奇，比如一个订单后等待付款，一个小时后放弃的传奇，是一个伪装的工作流：从第一个事件开始工作流，将其他事件映射到信号，然后让 `waitForSignal()` 用一个 `timeout` 耐心等待。

#### 准备生产

##### 保持日记简短

每次执行都会加载实例的整个日志并重播 `run()` 从上面。具有固定步数的进程使其日志保持较小，但具有一步或每轮睡眠的循环只要运行就会添加条目，并且每次执行都会变慢。当日志达到 1,000 个条目或 1 个条目时，模块会发出警告 MB：每个实例一次，当它越过线时，在日志中并作为 `journal-large` 事件。一旦它包含 10,000 个条目或 10 个 MB，实例在记录另一个实例之前失败：它的补偿运行，它可能仍然记录它们的补偿，它结束为 `failed` 用一个 `WorkflowJournalLimitError`.模块的 `journal` 选项移动两行。根据您最长的常规工作流程调整它们的大小，并设置一个限制 `Infinity` 要关闭它：

```typescript
WorkflowsModule.forRoot({
  journal: { warnEntries: 500, maxEntries: 5_000 },
});
```

一个永久持续的过程，如每月垃圾订阅，将在一个新的实例中继续。经过一年的交付，它的最后一步开始下一年的实例，当前的实例完成：

```typescript
async run(ctx: WorkflowContext, subscription: Subscription) {
  for (let month = 1; month <= 12; month++) {
    await ctx.step(`ship-${month}`, ({ idempotencyKey }) => this.subscriptionsService.ship(subscription, idempotencyKey));
    await ctx.sleep(`wait-${month}`, '30d');
  }

  const next = { ...subscription, year: subscription.year + 1 };
  return ctx.step('continue', async () => {
    const { id } = await this.workflowClient.start(LitterSubscriptionWorkflow, next, {
      id: `subscription-${subscription.id}-${next.year}`,
    });
    return id;
  });
}
```

该步骤启动下一个实例一次：重试的步骤找到它启动的实例。新实例有一个新的日志和它自己的 id，所以完成的年份保持可读，直到保留清除它。根据工人的租约，继续使用同一 id 需要每个商店更换到位的日记帐；一个新的 id 不需要商店里的任何新东西。当每一轮都独立运行时，时间表就更简单了：它每次出现都会启动一个实例，每个实例都有自己的日志，如 [Run workflows on a schedule](/reliability/workflows#run-workflows-on-a-schedule) 显示。

##### 加密工作流存储的内容

商店保留您的工作流程处理的内容：订单、费用、交付。为了使任何读取数据库或其备份的人都无法读取，请给模块一个**有效载荷编解码器**。`AesGcmPayloadCodec` 用 AES-256-GCM 在你的秘密经理的钥匙下。在模块的工厂中创建它，工厂在启动时运行：

```typescript
import { AesGcmPayloadCodec, WorkflowsModule, WorkflowStorage } from '@nestjs/workflows';

WorkflowsModule.forRootAsync({
  useFactory: () => ({
    worker: {
      // ...as before
    },
    // Encrypts what the store keeps. The key comes from your secret manager, through the environment.
    codec: new AesGcmPayloadCodec({
      keys: { '2026-09': process.env.WORKFLOWS_KEY_2026_09! },
      current: '2026-09',
    }),
  }),
}),
```

键是 base64 中的 32 个随机字节（`openssl rand -base64 32`)，在您选择的 id 下。缺少键（一个未设置的环境变量）、不是 base64 或不是 32 字节会导致启动失败，并会出现命名错误。

- **它加密的内容**：所有保存您数据的东西。输入和输出、步骤结果和检查点、信号有效载荷、自定义状态、取消原因、计划输入以及错误消息和堆栈。每个有效载荷都在为其派生的密钥下进行加密，并将其存储为经过验证的数据，因此被更改或移动到另一个实例或字段的有效载荷将无法解密，而不是被读取。1 KiB 或更多的有效载荷首先被压缩。如果有效载荷将秘密与攻击者选择的数据混合在一起，并且攻击者可以看到存储的大小，请使用 `compress: false` 将其关闭。
- **什么保持可读**，因为存储匹配、过滤、排序或计数它：ID、工作流名称和版本、状态、信号名称和密钥、并发和速率限制密钥、优先级、指向父和计划的链接、日志条目名称和所有时间。错误保留其名称，例如 `StepFailedError`.所以选择不写敏感内容的 id 和键： `order-71e1973d`，不是电子邮件地址。这里的并发密钥是客户的 id，在 `concurrency_key`.
- **存储形式**：`$wf1:aes-256-gcm:2026-09.` 后面是密文，一个字符串 JSON 列，所以商店不需要更改。

**旋转按键。**添加一个按键，并使其 `current`.有效载荷使用加密它的密钥进行解密，从那时起写入的所有内容都使用当前密钥。没有任何东西会被批量重新加密：有效载荷会随着实例的进展而被重写，旧的有效载荷会随着清除而消失。因此，在加密的任何内容仍可能被读取时，请保留一个密钥列表：未完成的实例、尚未清除的信号以及保存在密钥下的时间表。声明计划的输入在启动时和每一分钟都会再次保存在当前键下，但被颠覆的计划只会在下一分钟保存 `upsert()`: `pause()` 和 `resume()` 保持原样。

```typescript
codec: new AesGcmPayloadCodec({
  keys: {
    '2027-03': process.env.WORKFLOWS_KEY_2027_03!,
    '2026-09': process.env.WORKFLOWS_KEY_2026_09!,
  },
  current: '2027-03',
}),
```

无法读取有效负载需要未列出的密钥的实例：`getStatus()` 抛出命名密钥的错误，`list()` 显示没有有效负载的实例，工作人员不管它，直到密钥返回，然后运行它。

添加编解码器不会中断正在运行的实例：存储在它之前的有效载荷会按原样读取，并且新的写入会被加密。这也是保护的终点。可以写入数据库的人可以用普通的加密有效载荷替换加密有效载荷，并让它被读取：编解码器保护它编码的内容免受读取和篡改，而不是保护数据库免受其编写者的侵害。

您自己工具的编解码器 `WorkflowPayloadCodec`：安 `id` 与每个有效载荷一起存储，以及 `encode()` 和 `decode()`，接收值及其存储位置。将其类传递给 `codec` 有 Nest 创建它，以及它对全局模块的依赖关系，例如 KMS 客户。要替换编解码器，首先列出新的编解码器，然后列出旧的编解码器：第一个编解码器编码，每个有效载荷由它携带的编解码器解码。

##### 生产检查表

- 通过 `idempotencyKey` 每一个副作用，包括补偿。步骤至少运行一次。
- 发出信号 `id` 当他们的发件人可以运行两次时，例如发件人重试的 webhook 或消息使用者。从一个步骤发送的信号会自动得到一个步骤。
- 呼吁 `enableShutdownHooks()`，并保持 `shutdownTimeout` 低于平台的宽限期（默认为 30 秒 Kubernetes).
- 选择 `leaseDuration` 故意的。它是崩溃进程的实例在另一个进程接管之前等待的时间，而事件循环停滞时间更长的进程会丢失其实例。Lease expiry 会比较不同主机写入的时间戳，因此请保持它们的时钟同步（NTP）和 `leaseDuration` 远远超出了他们之间的任何偏差。
- 在您的数据库中注册一个商店：`PostgresWorkflowStore`、`MySqlWorkflowStore` 或您自己的一个商店。在内存中，或者在容器磁盘上的文件中，状态会随着实例而消失：内存中的默认值会在重新启动时丢失每个运行顺序，而启动会在生产中拒绝它。在 CI 的数据库中，使用 `concurrent: true` 对您自己的商店运行合同套件。
- 在新版本开始之前，使用 `npx @nestjs/workflows migrate` 或您的迁移工具应用商店的迁移，并使用 `npx @nestjs/workflows status` 在 CI 中检查它们。使用 `NODE_ENV=production`，存储不会在启动时迁移：背后的模式会使其失败。
- 在尽可能多的主机上运行尽可能多的工人。为它们确定连接池的大小：每个正在运行的实例通过池更新其租约并写入其日志，每个轮询都为其声明保留一个连接。
- 在写入业务行的事务中启动工作流（`transaction: tx`，或 `EntityManager` 和 TypeORM），所以两者之间的崩溃不能留下一个什么都不满足的顺序。传递事务，而不是根数据库。和 CQRS，发布该事务中的事件，事务位于调度程序上下文中。
- 保持发送信号的事务简短：信号和注册等待队列在它们后面。在 PostgreSQL 上，保留它们 READCOMMITTED 数据库的默认隔离也是如此：存储拒绝更严格的隔离。在 MySQL 上，保留它们 REPEATABLEREAD 或者 READCOMMITTED，并在事务因死锁而失败时再次运行事务（错误 1213）。
- 验证 webhook 签名，并返回 `2xx` 只有在带有信号的事务提交之后。
- 警惕需要人员的实例。`compensation_failed` 表示撤销中途放弃，带有 `WorkflowNonDeterminismError` 的 `failed` 实例表示部署中断重放。`WorkflowClient.list()` 找到它们，[What each status means](/reliability/workflows#what-each-status-means) 说如何处理每个：`retry()` 一旦原因被解决，或 `delete()`。对于日志和指标，订阅 `WorkflowEvents.events$`，或跟踪工具在没有 Nest 的情况下读取的 `nestjs:workflows:*` 诊断通道；[Events](/reliability/workflows#events) 将它们映射到一条轨迹上。
- 标记你的不归路 `ctx.commit()`.在此之前，每次失败和取消都会撤销已完成的步骤。
- 每晚使用 `purge()`，在应用程序的一个实例上，如 [Purge finished instances](/reliability/workflows#purge-finished-instances) 显示。保留其 `olderThan` 比任何发送者的重传窗口都长：信号的 `id` 仅在信号存储期间进行重复数据删除。
- 保持日志简短：绑定循环，并继续一个在新实例中永不结束的循环（[Keep journals short](/reliability/workflows#keep-journals-short)).给必须在某个时间点放弃运行超时的进程（[Time out the whole workflow](/reliability/workflows#time-out-the-whole-workflow)).
- 将并发性和速率限制设置为步骤调用的内容，并将其更改部署到每个进程：每个进程都应用其运行的代码的限制。一旦一些实例有了优先级，就给其余的一个，因为没有优先级的实例优先。
- 将声明的时间表部署到注册其工作流的每个进程：只有代码声明它的工人开始它的发生。部署删除或删除其工作流的时间表会继续在旧代码的进程上启动，并在最后一个进程停止后持续大约五分钟。设置 `missed` 当没有工人按时起床时，不能跳过的工作。如果其他代码的进程共享数据库，不要在没有代码声明五分钟的情况下离开一个进程：他们删除它，一旦一个进程启动，它就会重新开始。
- 使用编解码器加密商店保存的内容，并使用密钥管理器（[Encrypt what workflows store](/reliability/workflows#encrypt-what-workflows-store)).保留一个旧密钥列表，而它加密的任何东西都可能被读取，并选择不敏感的 id 和密钥：它们保持可读。

#### 参考

##### 模块选项

`WorkflowsModule.forRoot()` 采取这些选项； `forRootAsync()` 把它们从 `useFactory`, `useClass` 或者 `useExisting` （实现 `WorkflowsOptionsFactory`).期权令牌是 `WORKFLOWS_MODULE_OPTIONS`.存储不是一个选项：注册它 `WorkflowStorage`,如在 [Keep workflows in your database](/reliability/workflows#keep-workflows-in-your-database).

| 选择 | 默认的 | 意义 |
| --- | --- | --- |
| `worker.enabled` | `true` | 运行轮询循环。`worker: false` 是 `enabled: false`：流程启动、发出信号并检查工作流，以及 `WorkflowWorker.drain()` 按需运行适当的实例 |
| `worker.id` | `hostname:pid:random` | 工人的名称，显示为实例的名称 `leaseOwner` |
| `worker.concurrency` | `10` | 此进程一次执行的实例 |
| `worker.pollInterval` | `'1s'` | 多久查找一次适当的实例。当地的 `start()` 或者 `signal()` 立即唤醒循环 |
| `worker.leaseDuration` | `'30s'` | 声明在没有续订的情况下有效多长时间，那么崩溃的进程会保留其实例多长时间 |
| `worker.heartbeatInterval` | 三分之一 `leaseDuration` | 正在运行的实例多久续订一次租约 |
| `worker.shutdownTimeout` | `'10s'` | 关机在运行执行之前等待多长时间才能返回执行 |
| `retry` | 3 次尝试，`'1s'` 加倍至 `'5m'`,没有抖动 | 每一步的默认值。请参阅下面的重试字段 |
| `journal.warnEntries`,`journal.warnBytes` | `1000`,`1000000` | 在任一情况下，记录警告并发出 `journal-large`，每个实例一次 ([Keep journals short](/reliability/workflows#keep-journals-short)) |
| `journal.maxEntries`,`journal.maxBytes` | `10000`,`10000000` | 在任一情况下，使用 `WorkflowJournalLimitError` 在它记录另一个条目之前。`Infinity` 关闭检查 |
| `clock` | 系统时钟 | 和 `WorkflowClock`。测试通过 `ManualWorkflowClock` ([Test with a manual clock](/reliability/workflows#test-with-a-manual-clock)) |
| `allowInMemoryStorage` | `false` | 和 `NODE_ENV=production` 没有注册商店，启动失败；`true` 无论如何都在内存存储中运行 |
| `codec` | 没有一个 | `WorkflowPayloadCodec`、它的类或它们的列表：第一个编码，每个编码它编码的有效载荷（[Encrypt what workflows store](/reliability/workflows#encrypt-what-workflows-store)） |
| `isGlobal` | `true` | 全局注册模块。的顶层 `forRoot()` 和 `forRootAsync()` |

一个 `retry` 选项（模块的，步骤的 `retry` 或其 `compensateRetry`）是多次尝试，`false` 对于单次尝试，或具有这些字段的对象。一步的 `retry` 逐字段合并模块。

| 领域 | 默认的 | 意义 |
| --- | --- | --- |
| `attempts` | `3` | 总尝试，包括第一次 |
| `backoff.delay` | `'1s'` | 第一次重试前的等待 |
| `backoff.factor` | `2` | 每次重试的增长；`1` 保持等待不变 |
| `backoff.maxDelay` | `'5m'` | 一次等待的上限 |
| `backoff.jitter` | `'none'` | `'full'`（等待为零），`'equal'`（一半到全部）或 `'none'` |
| `retryIf` | 每一个错误 | `(error, attempt) => boolean`:`false` 步骤立即失败 |

`backoff` 也可以是函数，`(attempt, error) => duration`。`NonRetryableStepError` 永远不要重试。

##### PostgreSQL 商店

`new PostgresWorkflowStore(options, workflowStorage)`, 从 `@nestjs/workflows/postgres`，采用以下选项：

| 选择 | 默认的 | 意义 |
| --- | --- | --- |
| `executor` | 所需 | 商店如何访问数据库：`fromDrizzle(db)`,`fromTypeOrm(dataSource)`,`fromPg(pool)`,`fromPrisma(prisma, options)` 或者 `fromKysely(db)` |
| `schema` | `'nest_workflows'` | 它的表的模式，这是它的第一次迁移创建的。字母、数字和下划线，不以数字开头，最多 63 个字符 |
| `migrate` | `true`，除了 `NODE_ENV=production` | 在应用程序启动时应用挂起的迁移。和 `false`，启动失败 `WorkflowSchemaError` 而模式在后面 |

每个执行器获取您的数据库客户端及其自己类型的事务对象，然后 `start()` 和 `signal()` 将其视为 `transaction`：

| 执行人 | 采取 | 交易对象 |
| --- | --- | --- |
| `fromDrizzle(db)` | 一个 DrizzlePostgreSQL 数据库，无论其驱动程序是什么 | 这个 `tx` 那个 `db.transaction()` 递交其回调 |
| `fromTypeOrm(dataSource)` | 一个 `DataSource` 类型 `postgres`，或其 `manager` | 这个 `EntityManager` 那个 `dataSource.transaction()` 递交其回调，或 `QueryRunner` 之后 `startTransaction()` |
| `fromPg(pool)` | 节点-postgres`Pool`，或连接的 `Client` | 客户，如来自 `pool.connect()`, 之后 `BEGIN` |
| `fromPrisma(prisma, options)` | 一个 PrismaPostgreSQL 上的客户端，通过驱动程序适配器，如 `@prisma/adapter-pg` 或者 Prisma 的引擎。`maxWait`（默认 `'10s'`）和 `timeout`（默认 `'1m'`) 限制商店自己的交易 | 事务客户端 `prisma.$transaction()` 递交其回调 |
| `fromKysely(db)` | 一个 `Kysely` 使用 PostgreSQL 方言的实例。商店的声明跳过了其插件 | 交易 `db.transaction().execute()` 交接其回调或受控事务 |

商店的 `migrate()` 方法立即应用挂起的迁移，无论 `migrate` 选项说，并根据应用的版本进行解析。`PostgresWorkflowStore.migrationSql()` 返回他们的 SQL 记账。它的选项是 `schema`，要去的版本 `from`（默认 `0`，一个新数据库）和 `to`（默认值：包需要的那个），以及 `statementBreakpoints`，它用 drizzle-kit 的 `--> statement-breakpoint` 台词。从版本 0 开始，它从 `CREATE SCHEMA IF NOT EXISTS`，这需要 CREATE 数据库权限：如果有人为您创建了模式，请将其排除在外。`PostgresWorkflowStore.schemaVersion` 是包需要的版本。模式自己的版本在其 `migrations` 桌子。

##### MySQL 商店

`new MySqlWorkflowStore(options, workflowStorage)`, 从 `@nestjs/workflows/mysql` 在 MySQL 8.4 上运行 LTS 和 9.x，并采取以下选项：

| 选择 | 默认的 | 意义 |
| --- | --- | --- |
| `executor` | 所需 | 商店如何访问数据库：`fromDrizzle(db)`,`fromTypeOrm(dataSource)`,`fromMysql2(pool)`,`fromPrisma(prisma, options)` 或者 `fromKysely(db)`, 从 `@nestjs/workflows/mysql` |
| `schema` | `'nest_workflows'` | 表名的开头（`nest_workflows_instances`...），在连接的数据库中。小写字母、数字和下划线，不以数字开头，最多 40 个字符 |
| `migrate` | `true`，除了 `NODE_ENV=production` | 在应用程序启动时应用挂起的迁移，一次一条语句。和 `false`，启动失败 `WorkflowSchemaError` 桌子在后面的时候 |

| 执行人 | 采取 | 交易对象 |
| --- | --- | --- |
| `fromDrizzle(db)` | Drizzle MySQL 数据库 (`drizzle-orm/mysql2`) | 这个 `tx` 那个 `db.transaction()` 递交其回调 |
| `fromTypeOrm(dataSource)` | 一个 `DataSource` 类型 `mysql`，或其 `manager` | 这个 `EntityManager` 那个 `dataSource.transaction()` 递交其回调，或 `QueryRunner` 之后 `startTransaction()` |
| `fromMysql2(pool)` | mysql2 池或连接 | 连接，如来自 `pool.getConnection()`, 之后 `beginTransaction()` |
| `fromPrisma(prisma, options)` | MySQL 上的 Prisma 客户端，通过 `@prisma/adapter-mariadb`。`maxWait`（默认值为 `'10s'`）和 `timeout`（默认值为 `'1m'`）限制存储本身的事务，`migrate()` 包括：为其引发 `timeout`，或从命令行迁移 | 事务客户端 `prisma.$transaction()` 递交其回调 |
| `fromKysely(db)` | 带有 `MysqlDialect` 的 `Kysely` 实例。商店的声明跳过了其插件 | 交易 `db.transaction().execute()` 交接其回调或受控事务 |

在启动时，商店检查服务器和连接：MySQL，而不是 MariaDB；严格的 `sql_mode`(`STRICT_TRANS_TABLES`，MySQL 的默认值），没有它，MySQL 将为其列剪切太长的值；还有一个数据库，它的表就放在那里。它计算更新匹配的行，因此保留 mysql2 的 `FOUND_ROWS` 标志，默认情况下启用（Prisma 的适配器调用它 `foundRows`），并离开 `NO_BACKSLASH_ESCAPES`SQL 模式关闭。

它的 id、名称和键是长度有限的索引列，以字符表示：

| 钥匙 | 最多 |
| --- | --- |
| 实例 id，包括子 id（默认为 `<parent id>/<workflow>#<n>`）和计划开始的实例 id（`<schedule id>@<time>`） | 255 |
| 时间表 id | 230 |
| 工作流的名称，信号的名称，`key` 和 `id`、并发密钥、速率限制密钥 | 255 |
| 日志条目的名称：步骤名称、睡眠名称或等待名称，以及引擎添加的名称，例如 `$compensate:<step>` 和 `$child:<child id>` | 512 |

较长的失败 `RangeError` 它的名字，在任何之前 SQL. `migrate()` 和 `MySqlWorkflowStore.schemaVersion` 是 PostgreSQL 商店的。 `MySqlWorkflowStore.migrationSql()` 接受相同的选项并按顺序返回要应用的语句，并且 `MySqlWorkflowStore.migrationStatements()` 采取 `schema`, `from` 和 `to` 对于每次调用运行一条语句的工具，每个字符串返回一个。架构自己的版本是其中应用的最高版本 `<schema>_migrations` 桌子。

##### 命令行

`npx @nestjs/workflows` 应用部署步骤中的存储迁移或在 CI 中检查它们。它需要 `--url`（默认值 `DATABASE_URL`）和 `--schema`（默认值 `nest_workflows`）。URL 选择存储：`postgres://` 或 `postgresql://` 用于 PostgreSQL，需要安装 `pg`，`mysql://` 用于 MySQL，需要 `mysql2`。

| 命令 | 它的作用 |
| --- | --- |
| `migrate` | 应用挂起的迁移，如 `migrate: true` 启动时做 |
| `status` | 打印模式的版本和包需要的版本，并在模式落后时以 1 退出 |
| `sql` | 打印 `migrationSql()` 的 SQL，从 `--from` 到 `--to`，不带数据库：PostgreSQL，或带有 `--dialect mysql` 的 MySQL。`--statement-breakpoints` 分隔 drizzle-kit 的语句 |

##### 商店合同

`PostgresWorkflowStore` 和 `MySqlWorkflowStore` 实施 `WorkflowStore` 接口。对于另一个数据库，在您自己的提供程序中实现它。上每个方法的 JSDoc`WorkflowStore` 说明方法必须做什么，以及每个规则阻止哪些竞争。

**注册。**该商店是一家普通的单身供应商，致电 `registerSource(this)` 关于注射剂 `WorkflowStorage` 在它的构造函数中。注册表会立即检查形状，除非通过，否则拒绝第二次注册 `replace: true`，并在 `WorkflowsModule` 初始化，记录正在使用的存储。请求范围内的提供程序、延迟加载模块中的提供程序或生命周期挂钩注册太晚，并抛出。在没有注册任何内容的情况下，该模块使用 `InMemoryWorkflowStore`: 重新启动会丢失每个正在运行的实例，并且两个进程不会共享它们。它也不能加入你的交易，所以 `start()` 和 `signal()` 和 `transaction` 立即写入，它第一次记录一个警告。和 `NODE_ENV=production`，启动会失败，并且会出现一个错误，该错误会命名包的存储和要实现的接口，除非您设置 `allowInMemoryStorage: true` 在模块选项中。

**原子性。**工作者、信号、取消、重试、清除和调度在商店中相互竞争。`claim()` 绝不能将一个实例租给两个工人，`write()` 只能在工人的租约有效期间写入，并且 `signal()` 不得跳过挂起的实例。因此，每个更改状态的方法都是一个条件语句，或者一个带有正确锁的事务，而不是先读后写。两种方法是可选的：`createInTransaction()` 和 `signalInTransaction()`，其中 `start()` 和 `signal()` 使用未接触的交易对象进行调用。他们必须通过它写入，并拒绝根句柄，根句柄的写入是自己提交的。在 PostgreSQL 上，`signalInTransaction()` 还会拒绝不 READCOMMITTED，其唤醒可能会错过在其快照后提交的等待。

**使用 `@nestjs/workflows/testing` 中的套件进行测试**。`workflowStoreContract()` 为任何测试运行者返回合同作为测试用例，包括比赛。本教程的测试针对 `PostgresWorkflowStore` 到 Drizzle 以及 MySQL 上的 `MySqlWorkflowStore` 运行它，就像您对自己的测试一样，使用返回空表存储的函数：

```typescript
// The concurrency cases run too; with one connection, PGlite runs them one statement at a time.
const cases = workflowStoreContract(() => freshStore(db), { concurrent: true, transaction: (work) => db.transaction(work) });
for (const c of cases) {
  it(c.name, c.run);
}
```

和 `concurrent: true` 套件竞赛索赔（也有限制）、信号、暂停、儿童最终写入、取消和终止、重试、清除和安排索赔：例如，60 个信号对 60 个暂停。也可以在带有连接池的数据库服务器上运行它，在那里没有正确锁的存储会失败。和 `transaction`，打开您的一个事务的函数，两个可选方法的情况也会运行。包自己的测试运行该套件与手写的 Drizzle 存储，作为针对接口编写的存储通过它的证明。

构建在引擎上的包，如作业队列，从 `@nestjs/workflows/core` 获取其与存储无关的部分（时钟、重试、有效载荷编解码器、限制、租用的工作循环和调度）；应用程序不需要它。

##### 看涨期权

| 呼吁 | 选项 | 解释于 |
| --- | --- | --- |
| `@Workflow(name, options)` | `version`（默认 `1`),`timeout`（运行超时；默认值为无），`concurrency`(`limit`，和一个 `key` 每个键的限制函数；数组中的每一个），`rateLimit`(`max`,`duration`，和一个 `key` 函数；数组中的每一个），`schedules`（请参阅下面的计划选项） | [Deploy changes safely](/reliability/workflows#deploy-changes-safely),[Time out the whole workflow](/reliability/workflows#time-out-the-whole-workflow),[Limit how many run at once](/reliability/workflows#limit-how-many-run-at-once),[Run workflows on a schedule](/reliability/workflows#run-workflows-on-a-schedule) |
| `ctx.step(name, fn, options)` | `retry`,`timeout`,`heartbeatTimeout`,`compensate`,`compensateRetry` | [Write the workflow](/reliability/workflows#write-the-workflow),[Long-running steps](/reliability/workflows#long-running-steps) |
| `ctx.waitForSignal(name, signal, options)` | `key`,`timeout`（决议 `null` 当它通过时），`match`（有效载荷上的纯过滤器） | [Wait for the delivery webhook](/reliability/workflows#wait-for-the-delivery-webhook) |
| `ctx.sleep(name, duration)` | 持续时间，或具有 `until`（一 `Date` 或历元毫秒） | [Sleep for a week, then ask for a review](/reliability/workflows#sleep-for-a-week-then-ask-for-a-review) |
| `ctx.waitForAny(name, conditions)` | 条件的对象：`ctx.signalWait(signal, options)`(`key`,`match`),`ctx.timer(duration)`（持续时间，或具有 `until`），或儿童手柄。用胜利者的决心 `key` 和 `value` | [Wait for whichever comes first](/reliability/workflows#wait-for-whichever-comes-first) |
| `ctx.startChild(workflow, input, options)`,`ctx.executeChild(workflow, input, options)` | `id`（默认父 id、工作流名称和计数，例如 `order-71e1973d/shipment#1`),`version`,`timeout`,`parentClose`(`'cancel'`,`'terminate'` 或者 `'abandon'`;默认 `'cancel'`),`priority`（默认父级），`concurrencyKey`,`rateLimitKey` | [Start child workflows](/reliability/workflows#start-child-workflows) |
| `ctx.setStatus(status)` | 一个 JSON 值高达 16 KiB，或 `undefined` 清除它 | [Report its status](/reliability/workflows#report-its-status) |
| `ctx.schedule` | 不是电话：`id` 时间表和时间 `at` 启动实例的事件，或 `null` | [Run workflows on a schedule](/reliability/workflows#run-workflows-on-a-schedule) |
| `WorkflowClient.start(workflow, input, options)` | `id`（默认为随机 UUID，或在从步骤导出的步骤一内)，`version`（默认注册的最高），`timeout`（默认装饰者的），`transaction`,`priority`（1 到 2,097,151，较低的在先；默认为无，在所有之前），`concurrencyKey`,`rateLimitKey`（限制计算的不是密钥） | [Start it with the order](/reliability/workflows#start-it-with-the-order),[Limit how many run at once](/reliability/workflows#limit-how-many-run-at-once) |
| `WorkflowClient.signal(signal, payload, options)` | `key`,`id`（存储具有相同名称和 id 的信号一次；从步骤中的步骤导出），`transaction` | [Wait for the delivery webhook](/reliability/workflows#wait-for-the-delivery-webhook),[With CQRS](/reliability/workflows#with-cqrs) |
| `WorkflowClient.startAndWait(workflow, input, options, wait)` | `start()` 的选项，但不是 `transaction`，和 `result()` 作为 `wait` | [Wait for a result](/reliability/workflows#wait-for-a-result) |
| `WorkflowClient.result(id, options)` | `timeout`（挂钟；默认无），`signal`（中止时停止等待） | [Wait for a result](/reliability/workflows#wait-for-a-result) |
| `WorkflowClient.getStatus(id, options)` | `journal`,`children` | [Report its status](/reliability/workflows#report-its-status),[Start child workflows](/reliability/workflows#start-child-workflows) |
| `WorkflowClient.cancel(id, reason)`,`terminate(id, reason)` | 没有一个 | [Let customer support cancel an order](/reliability/workflows#let-customer-support-cancel-an-order),[Retry, delete or terminate](/reliability/workflows#retry-delete-or-terminate) |
| `WorkflowClient.list(filter)` | `status`（一个或一个列表），`workflow`,`version`,`parentId`,`scheduleId`,`limit`（默认 `100`),`offset` | [Deploy changes safely](/reliability/workflows#deploy-changes-safely) |
| `WorkflowClient.retry(id, options)` | `timeout`（从现在起新的运行超时，或 `false` 无；默认实例） | [Retry, delete or terminate](/reliability/workflows#retry-delete-or-terminate) |
| `WorkflowClient.delete(id, options)` | `force`（同时删除未完成的实例；默认值为 `false`） | [Retry, delete or terminate](/reliability/workflows#retry-delete-or-terminate) |
| `WorkflowClient.purge(options)` | `olderThan`（必填），`status`（默认值为 `completed`、`failed` 和 `cancelled`），`batchSize`（默认值为 `500`） | [Purge finished instances](/reliability/workflows#purge-finished-instances) |
| `WorkflowClient.schedules` 或可注射的 `WorkflowSchedules` | `upsert(id, options)`（调度选项，带有 `workflow`，以及可选的 `version` 和 JSON`input`）、`get(id)`、`list(filter)`（`workflow`、`limit`、`offset`）、`remove(id)`、`pause(id)` 和 `resume(id)`（都不重新加密存储的输入）、`trigger(id)`（在注册工作流的进程中，除非调度固定在 `version`）和 `preview(schedule, options)`（调度的 id 或定时；`from` 和 `count`，默认 `10`） | [Run workflows on a schedule](/reliability/workflows#run-workflows-on-a-schedule) |
| `@StartOn(event, options)` | `id`（必填），`input`（默认事件），`priority`,`concurrencyKey`,`rateLimitKey`（作为 `start()`s：事件的值或函数，其中 `undefined` 保留默认值） | [With CQRS](/reliability/workflows#with-cqrs) |
| `@SignalOn(event, options)` | `signal`,`key`,`id`,`payload`（默认事件） | [With CQRS](/reliability/workflows#with-cqrs) |
| `EventBus.publish(event, context)`,`publishAll(events, context)`，聚合的 `commit(context)`(`@nestjs/cqrs`12.1 或更高） | `transaction`，从调度程序上下文读取一次 `WorkflowsCqrsModule` 是进口的 | [With CQRS](/reliability/workflows#with-cqrs) |

一步函数接收 `idempotencyKey`、`attempt`、`signal`、`progress` 和 `heartbeat()`；补偿收到相同的，加上工作流被撤销的原因。

时间表，在 `@Workflow()` 或用 `upsert()`，采取以下选项：

| 选择 | 默认的 | 意义 |
| --- | --- | --- |
| `id` | 所需 `@Workflow()` | 整个应用程序唯一：字母、数字、`.`、`:`、`_` 和 `-`。`upsert()` 将其作为第一个论点 |
| `cron`,`every`,`rrule` | 三者之一是必需的 | 5 个字段的 cron 表达式，或 6 个字段，第二个字段在前；从 `startAt` 开始计数的至少一秒的间隔；或 RFC5545 递归规则 |
| `tz` | `'UTC'` | `cron` 和 `rrule` 的 IANA 时区。不使用 `every` |
| `startAt`,`endAt` | 没有一个 | 以前未发生过 `startAt`，或之后 `endAt` |
| `limit` | 没有一个 | 它在结束前开始出现多少次 |
| `missed` | `'skip'` | 没有工人准备启动的情况：`'skip'`,`'once'` 或者 `'all'` |
| `overlap` | `'skip'` | 启动的实例未完成时到期的事件：`'skip'`,`'allow'`,`'cancel-previous'` 或者 `'buffer-one'` |
| `priority` | 没有一个 | 它启动的实例的优先级 |
| `input` | 没有一个 | 实例的输入：aJSON 值，或在 `@Workflow()` 发生的函数 |

##### 事件

`WorkflowEvents.events$` 发出每个事件，并将其发布到 `nestjs:workflows:<type>` 诊断通道，例如 `nestjs:workflows:step-failed`。每个有效载荷都有 `type`、`id`（实例）、`workflow`、`version` 和 `at`（发动机的时间，单位为毫秒）。

| 事件 | 其他领域 | 何时 |
| --- | --- | --- |
| `workflow-started` | 没有一个 | 实例的第一次执行开始 |
| `workflow-resumed` | `run` | 稍后的执行开始：在等待、休眠、重试或崩溃之后 |
| `workflow-suspended` | `wakeAt`,`waits` | 执行暂停实例 |
| `step-completed` | `step`,`attempt`,`durationMs` | 步骤尝试成功 |
| `step-failed` | `step`,`attempt`,`error`,`retryAt` | 步骤尝试失败；`retryAt` 是 `null` 当台阶放弃时 |
| `signal-received` | `wait`,`signal`,`signalId` | 等待收到信号 |
| `signal-timed-out` | `wait`,`signal` | 没有匹配信号的等待期限已过 |
| `workflow-compensating` | `error` | 实例失败或被取消，然后开始撤消 |
| `step-compensated` | `step`,`attempt` | 一步补偿完成 |
| `workflow-completed` | `output` | 实例完成 |
| `workflow-failed` | `error` | 实例在其补偿运行后失败 |
| `workflow-cancelled` | `error` | 在赔偿耗尽后，该实例被取消；`error.message` 是原因吗 |
| `workflow-compensation-failed` | `error` | 一个补偿中途放弃了。需要一个人 |
| `journal-large` | `entries`,`bytes` | 期刊达到 `journal.warnEntries` 或 `journal.warnBytes`；每个实例一次 |
| `workflow-retried` | `from`,`error` | `retry()` 重新开放 `failed` 或者 `compensation_failed` 实例；`error` 是它拥有的那个 |
| `workflow-deleted` | `status` | `delete()` 删除了一个实例；`status` 是它拥有的那个吗 |
| `custom-status` | `status` | 写更改了实例的自定义状态 |
| `child-started` | `child`,`childWorkflow`,`childVersion` | 实例启动了一个孩子 |
| `schedule-skipped` | `reason`(`'missed'` 或者 `'overlap'`),`from`,`to` | 一个时间表传递了事件。它的 `id` 是时间表的 |

一个实例映射到一个跟踪，无论哪个进程在它的几天或几周内运行它，因此按实例键入跟踪 `id`.实例是根跨度，从 `workflow-started` 到它的最后一个事件（`workflow-completed`, `workflow-failed`, `workflow-cancelled` 或者 `workflow-compensation-failed`).每个执行都是一个子跨度，从 `workflow-started` 或者 `workflow-resumed` 二 `workflow-suspended` 或者决赛。每一步尝试都是其内部的一个跨度，终止于 `step-completed`，谁的 `durationMs` 开始，或在 `step-failed`.其他事件是执行跨度上的事件。跟踪工具订阅诊断通道，因此这不需要应用程序中的代码。

##### 错误

软件包的错误扩展 `WorkflowError`，除了控制流或你扔的两个。在失败实例上找到的实例按名称在其中 `error`.

| 错误 | HTTP 状况 | 抚养时间 |
| --- | --- | --- |
| `WorkflowIdConflictError` | `409` | `start()` 使用现有 id，但工作流或输入不同，`signal()` 用一个 `id` 已与另一个键一起用于同一信号，或 `startChild()` 具有另一个工作流、父或输入使用的 id |
| `WorkflowNotFoundError` | `404` | `cancel()`,`terminate()`,`retry()`,`delete()` 或者 `result()` 未知 id 的调度方法、具有未知调度 id 的调度方法，或 `start()` 或者时间表的 `trigger()` 此应用程序无法解决的工作流 |
| `WorkflowStateError` | `409` | 不是 `failed` 或 `compensation_failed` 的实例的 `retry()`，或者其补偿运行；没有 `force` 的未完成实例的 `delete()`；要么对实例进行另一个更改；申报附表的 `upsert()` 或 `remove()` |
| `NonRetryableStepError` | 没有一个 | 你把它从一个步骤扔到这个步骤失败，而不重试 |
| `StepFailedError` | 没有一个 | 内部 `run()`，一步放弃；`step`,`attempts`，以及原始错误的名称和消息 `cause` |
| `StepTimeoutError` | 没有一个 | step 尝试运行过其 `timeout` 或 `heartbeatTimeout`。重试 |
| `WorkflowFailedError` | 没有一个 | `ctx.fail()` 实例失败。还有什么 `result()` 和 `startAndWait()` 对于未完成而结束的实例，使用其 `instanceId`,它的 `status` 它的误差是 `cause` |
| `ChildWorkflowFailedError` | 没有一个 | 子级失败、被取消或被终止：`ctx.executeChild()` 和子级的 `result()` 抛入父级，子级的 `workflow`、`instanceId`、`status` 和错误为 `cause`。扩展 `WorkflowFailedError` |
| `WorkflowResultTimeoutError` | 没有一个 | `result()` 或 `startAndWait()` 与 `instanceId` 和 `timeoutMs` 一起等待过它的 `timeout`。实例继续运行 |
| `WorkflowDefinitionError` | 没有一个 | 在一次运行中使用两次的名称，或 `ctx` 在台阶内呼叫。实例在没有补偿的情况下失败 |
| `WorkflowNonDeterminismError` | 没有一个 | 部署重命名、删除或重新排序运行实例记录的步骤。扩展 `WorkflowDefinitionError`。[Deploy changes safely](/reliability/workflows#deploy-changes-safely) |
| `WorkflowInterrupt` | 没有一个 | 发动机的控制流程（暂停、取消）。扔回去；`isWorkflowInterrupt()` 识别它 |
| `WorkflowTimeoutError` | 没有一个 | 仅名义上，在运行超时的实例上：它进行了补偿并失败 |
| `WorkflowCancelledError` | 没有一个 | 仅通过名称，在取消的实例上：它的消息是原因 |
| `WorkflowTerminatedError` | 没有一个 | 仅通过名称，在终止的实例上，其结尾为 `cancelled`：它的信息是原因 |
| `WorkflowDeletedError` | 没有一个 | 只是名义上的，作为父母的原因 `ChildWorkflowFailedError`，当 `delete()` 和 `force` 在它结束之前删除了孩子 |
| `WorkflowJournalLimitError` | 没有一个 | 仅通过名称，在日志到达的实例上 `journal.maxEntries` 或者 `journal.maxBytes`：补偿失败 |
| `WorkflowSchemaError` | 没有一个 | `PostgresWorkflowStore` 或 `MySqlWorkflowStore` 的模式是包迁移的背后，而 `migrate` 关闭，或者应用它们失败（`cause`；在 MySQL 上，消息命名下一次运行恢复的语句）：启动，每次调用都会失败，直到它被修复。与 `schema`，它的 `version` 和 `requiredVersion`。来自 `@nestjs/workflows/postgres` 和 `@nestjs/workflows/mysql` |

`MySqlWorkflowStore` 还会在任何 SQL（[MySQL store](/reliability/workflows#mysql-store)）之前拒绝长于其带有 `RangeError` 的列的 id、名称或键。事务中的死锁作为 MySQL 的错误 1213 到达您手中，商店不会重试，因为它也回滚了您的写入。
