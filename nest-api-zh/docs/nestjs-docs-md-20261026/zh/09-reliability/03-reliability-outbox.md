# Transactional outbox

Source: https://docs.nestjs.com/reliability/outbox

当顾客在网上商店订购猫粮和用品时，该订单 API 保存订单并使用 `OrderPlaced` 事件。三件事会对这一事件做出反应：确认电子邮件发出，库存被保留，以及单独的分析服务记录销售。

保存订单和发布事件是对两个不同系统的两次写入，没有事务跨越这两者：

- **保存，然后发布。**如果流程崩溃或经纪人在两者之间关闭，则订单存在，但 `OrderPlaced` 迷路了。客户没有收到电子邮件，库存没有预订，分析被低估了。
- **发布，然后保存。**如果插入失败，将感谢客户提供不存在的订单。
- **重试发布错误。**成功发送后的超时看起来像是失败，因此重试再次发送，客户将收到两封电子邮件。

这就是双写问题。`ClientProxy.emit()`,`EventEmitter2` 和 CQRS`EventBus` 都是凭记忆发表的，所以都有。

事务性发件箱通过将事件转换为行来删除它。`Outbox.add()` 将邮件插入到**与订单相同的数据库事务**中的发件箱表中，因此两者都提交或都不提交。然后，中继发布提交的消息。它通过回退重试失败，并将从未成功的消息移动到死字母表。重试意味着消费者可以看到一条消息两次，因此每个消费者都会保留一个包含其处理过的消息 id 的**收件箱**，并跳过重复。

在本教程中，您将在 PostgreSQL 上使用 Drizzle 将发件箱添加到商店订单 API 中：

- `POST /orders` 在一个事务中保存订单及其消息。
- 两个在程处理人员发送确认电子邮件并保留库存。
- 单独的 analytics 微服务具有自己的数据库，通过以下方式接收订单事件 TCP，按每个订单的顺序。
- 失败会被重试，并且一个小的管理员 API 列出、重新排队和清除死信。
- 的几个实例 API 安全地分享工作。

#### 先决条件

- PostgreSQL，在 `pg` 驱动程序上带有 [Drizzle ORM](https://orm.drizzle.team)，通过 [`@nestjs/drizzle`](/data/drizzle) 注册。发件箱的消息与您的行一起提交，因此它们驻留在您的订单所在的数据库中，驻留在比应用程序的任何实例寿命都长的数据库服务器上。使用 TypeORM、Prisma 还是 MySQL？请按照教程了解该应用程序的功能：[Keep messages in your database](/reliability/outbox#keep-messages-in-your-database) 显示每个应用程序的商店。
- `@nestjs/microservices`，对于指向 [Publish to the analytics microservice](/reliability/outbox#publish-to-the-analytics-microservice) 中分析服务的 TCP 链接。

安装软件包：

```bash
$ npm i --save @nestjs/outbox
```

示例应用程序，在线商店的订单 API，将其产品和订单保存在自己的两个表中，由后面的部分读取和写入。它们是示例的数据，而不是 outbox 需要的：outbox 的表属于它的存储，它创建了这些表，如 [Keep messages in your database](/reliability/outbox#keep-messages-in-your-database) 显示。

`products` 是目录，为订单保留库存会将单位从其 `in_stock` 移动到其 `reserved`：

| 柱子 | 类型 | 附注 |
| --- | --- | --- |
| `id` | `text` | 主键，例如 `salmon-kibble-2kg` |
| `name` | `text` | 显示名称，例如 `Salmon kibble, 2 kg` |
| `price` | `integer` | 以美分计 |
| `in_stock` | `integer` | 可供订购的单位 |
| `reserved` | `integer` | 持有订单的单位。默认值为 `0` |

`orders` 持有命令 `POST /orders` 保存：

| 柱子 | 类型 | 附注 |
| --- | --- | --- |
| `id` | `text` | 主键 |
| `user_id` | `text` | 下订单的客户 |
| `items` | `jsonb` | 订单的行，作为 JSON 数组：每一行的 `productId`,`quantity` 和单位 `price`（美分） |
| `total` | `integer` | 以美分计 |
| `status` | `text` | `placed` 或者 `cancelled` |

任一表中的列都不可为空。

该目录有两种产品：`salmon-kibble-2kg` 售价 2499 美分，库存 10 件，以及 `clumping-litter-10l` 现货售价 1599 美分。

#### 在数据库中保留邮件

无需为发件箱创建任何内容：没有表、实体或 Prisma 模型。注册其存储，存储创建自己的模式，`nest_outbox`，并迁移它：在开发和测试启动时，以及在生产中 `npx @nestjs/outbox migrate`，或与 `migrationSql()` 在你自己的迁移中。

发件箱将其邮件、死信和消费者收件箱保存在与您自己的表相同的数据库中，因为它们必须与您的行提交。在您为它们注册存储之前，发件箱会将它们保留在内存中：第一次运行没问题，但重新启动会丢失所有尚未发布的消息，两个实例不会共享它们，并且没有任何内容加入您的事务。

> warning **Warning** 使用 `NODE_ENV=production` 并且没有注册存储，启动失败，除非您设置了 `allowInMemoryStorage: true`。

在 PostgreSQL 上，注册包的存储， `PostgresOutboxStore` 来自 `@nestjs/outbox/postgres`.它运行它的 SQL 通过您的应用程序已经拥有的数据库客户端，因此它可以加入您的事务，并且它将表保存在自己的模式中。它是一个普通的提供程序，在根模块中注册过一次，旁边 `OutboxModule`：两者都是广泛应用的，并且每个 `outbox.add()` 在任何模块中都会经历它。根模块使用工厂创建它，工厂注入 Drizzle 数据库和 `OutboxStorage` 注册表，商店通过以下方式注册自己：

```typescript
{
  // Messages and inbox records in your database, in a schema of their own (nest_outbox)
  provide: PostgresOutboxStore,
  inject: [getDrizzleToken(), OutboxStorage],
  useFactory: (db: Database, outboxStorage: OutboxStorage) =>
    new PostgresOutboxStore({ executor: fromDrizzle(db) }, outboxStorage),
},
```

`fromDrizzle(db)` 是存储的**执行器**：它通过您的 Drizzle 数据库运行存储的语句，无论它使用哪个驱动程序，如 `pg` 或 PGlite。`fromPg(pool)`、`fromTypeOrm(dataSource)`、`fromPrisma(prisma)` 和 `fromKysely(db)` 对节点-postgres 池、TypeORM、Prisma 和 Kysely 执行相同的操作。启动时，模块记录 `OutboxStorage: PostgresOutboxStore`。

**模式。**商店将其表保存在自己的模式中，`nest_outbox`（`schema` 选项命名另一个）。在没有模式的 MySQL 上，它们是连接数据库的表，模式的名称作为前缀：`nest_outbox_messages` 等等。

| 桌子 | 它持有什么 |
| --- | --- |
| `nest_outbox.messages` | 每条消息来自 `add()` 直到它被出版或死写，它的尝试和租赁 |
| `nest_outbox.dead_letters` | 失败的消息，以及每次尝试的原因和错误 |
| `nest_outbox.inbox` | 每个使用者已处理的消息的 ID |
| `nest_outbox.migrations` | 应用的存储模式版本 |

它们属于存储：您的迁移不会创建它们，您的 ORM 的模式不声明它们，您自己的表也不能与它们冲突。毛毛雨套件和 Prisma 迁移工作 `public` 除非另有说明，否则模式，以及 TypeORM 在其实体的表格上，所以他们的工具离开 `nest_outbox` 单独的。

**迁移。**包以版本化迁移的形式发送模式，存储本身应用它们。与 `migrate` 选项，它在应用程序启动时，在中继运行之前，在一个持有咨询锁的事务中应用模式还没有的内容：在一起启动的几个实例中，一个迁移，而其他实例无事可做。 `migrate` 默认值为 `true`，除了 `NODE_ENV=production`.因此，在开发和测试中，存储在第一次开始时创建它的模式，而您的迁移只创建您自己的表，这里 `products` 和 `orders`.

在生产中，在应用程序的新版本开始之前应用迁移，就像应用您自己的迁移一样，这样就不会有实例在启动时更改模式：在滚动部署的中间，这将锁定繁忙的表，而权限最低的数据库用户无论如何都不能这样做。包的命令行从 `npx drizzle-kit migrate` 旁边的部署步骤执行此操作。它从 `DATABASE_URL` 或 `--url` 读取数据库，并且需要安装 `pg`：

```bash
$ npx @nestjs/outbox status
Schema "nest_outbox" is at version 0; this version of @nestjs/outbox needs version 1.
$ npx @nestjs/outbox migrate
Migrated schema "nest_outbox" to version 1 (applied 1).
```

当模式落后时，`status` 退出为 1，这使它成为对 CI 的检查。要使用您自己的迁移工具应用迁移，请从 `npx @nestjs/outbox sql` 或 `PostgresOutboxStore.migrationSql()` 中获取代码中的 SQL：每个迁移的语句，每段一个，以及记录版本的簿记。在一个事务中运行它们，就像 TypeORM 和 Drizzle 的迁移程序所做的那样。使用 TypeORM，这是您自己的迁移，旁边是它为您的实体生成的迁移：

```typescript
import { PostgresOutboxStore } from '@nestjs/outbox/postgres';
import type { MigrationInterface, QueryRunner } from 'typeorm';

export class OutboxStore1790801276314 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(PostgresOutboxStore.migrationSql());
  }

  // The store's migrations only ever add tables, columns and indexes: it has no down migrations.
  async down(): Promise<void> {}
}
```

使用 drizzle-kit，创建自定义迁移，并将其填充为 SQL, 一个 `--> statement-breakpoint` 语句之间的行：Drizzle 的迁移器然后一次运行一个，这是 PGlite 所要求的。在代码中，`migrationSql()` 和 `statementBreakpoints: true` 返回相同。

```bash
$ npx drizzle-kit generate --custom --name=outbox
$ npx @nestjs/outbox sql --statement-breakpoints > drizzle/0002_outbox.sql
```

在 MySQL 上，`MySqlOutboxStore.migrationStatements()` 每个字符串返回一个语句，TypeORM 迁移每个调用运行一个：

```typescript
for (const statement of MySqlOutboxStore.migrationStatements()) {
  await queryRunner.query(statement);
}
```

和 `migrate` 关闭，其模式背后的存储会使启动失败 `OutboxSchemaError` 它命名了这三种方式，并以相同的方式失败每个调用，直到模式赶上，它注意到了这一点，而无需重新启动。迁移只添加表、列和索引，因此在滚动部署期间，应用程序的先前版本将继续在迁移的架构上运行。没有向下迁移。

**交易。**`outbox.add()` 将您的事务视为 [Save the order and its messages in one transaction](/reliability/outbox#save-the-order-and-its-messages-in-one-transaction) 显示，处理程序的 `processInTransaction()`：与 Drizzle，这个 `tx` 那个 `db.transaction()` 交出它的回调。商店在该事务上运行其报表，因此它们会提交或回滚您的写入。它拒绝数据库本身，数据库的语句会自动提交 `OutboxTransactionRequiredError` 上面写着要传递什么。对于其他执行器，在之后传递 node-postgres 客户端 `BEGIN`（不是泳池），TypeORM 的 `EntityManager` 来自 `dataSource.transaction()`,Prisma 的交互式事务客户端，或 Kysely 事务。

**隔离。**商店自己的事务（索赔、死信移动、重新排队）依赖于 READCOMMITTED，PostgreSQL 的默认隔离级别：启动时，存储检查数据库的 `default_transaction_isolation`，如果更严格，就会失败。你的可以在任何级别运行。`add()`first 对您的事务上的每个密钥进行锁定，因此添加具有相同密钥的消息的事务轮流进行，并且密钥的消息按照其事务提交的顺序进行编号。在下面 REPEATABLEREAD 或者 SERIALIZABLE 一个消息的两次传递 `processInTransaction()` 可以通过序列化错误使第二个失败，而不是将其作为副本跳过：它的处理程序失败，中继的重试找到记录。

**使用 TypeORM。** `TypeOrmModule` 取代根模块中的 `DrizzleModule`，存储在它提供的 `DataSource` 上运行，通过 `fromTypeOrm()`：

```typescript
{
  // Messages and inbox records in your database, in a schema of their own (nest_outbox)
  provide: PostgresOutboxStore,
  inject: [DataSource, OutboxStorage],
  useFactory: (dataSource: DataSource, outboxStorage: OutboxStorage) =>
    new PostgresOutboxStore({ executor: fromTypeOrm(dataSource) }, outboxStorage),
},
```

教程通过的地方 Drizzle's `tx` 二 `outbox.add()`，通过 `EntityManager` 那个 `dataSource.transaction()` 交出它的回调，并用它键入发件箱。商店拒绝 `dataSource.manager` 他们的作品会自己提交。这是订单服务 TypeORM:

```typescript
@Injectable()
export class OrdersService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly outbox: Outbox<EntityManager>,
  ) {}

  async placeOrder({ userId, items }: PlaceOrderDto): Promise<Order> {
    if (!items?.length) {
      throw new BadRequestException('An order needs at least one item');
    }

    const order = await this.dataSource.transaction(async (manager) => {
      // ... price the items through manager (an unknown product throws) and build the order
      await manager.insert(OrderEntity, order);

      // The transaction's EntityManager: the message commits or rolls back with the order.
      await this.outbox.add(manager, { topic: 'order.placed', payload: order });
      return order;
    });

    this.outbox.notify(); // publish now instead of at the next poll
    return order;
  }
}
```

**与 Prisma.**传递您的 `PrismaService` 二 `fromPrisma()` 在工厂里，并且 `outbox.add()` 事务客户端 `prisma.$transaction()` 交出它的回调。只有交互式表单有一个要传递：数组表单， `prisma.$transaction([query1, query2])`，不能包括 `outbox.add()`.商店拒绝客户本人，客户的陈述将自动生效。它自己的事务等待连接长达 10 秒，运行长达一分钟，比 Prisma 的默认值：的第二个参数 `fromPrisma()` 改变了这一点 `maxWait` 和 `timeout`.

**对于 MySQL 8.4 LTS 和 9.x，`@nestjs/outbox/mysql` 具有 `MySqlOutboxStore`。从那里导入存储及其执行器：提供程序是相同的，选项和执行器的名称也是相同的。这是 MySQL 上的顺序 API，Drizzle 位于 `mysql2` 驱动程序上：

```typescript
import { Module } from '@nestjs/common';
import { DrizzleModule, getDrizzleToken } from '@nestjs/drizzle';
import { OutboxModule, OutboxStorage } from '@nestjs/outbox';
import { fromDrizzle, MySqlOutboxStore } from '@nestjs/outbox/mysql';
import { drizzle } from 'drizzle-orm/mysql2';
import { NotificationsModule } from '../notifications/notifications.module.js';
import type { Database } from './drizzle.js';
import { OrdersService } from './orders.service.js';

@Module({
  imports: [
    DrizzleModule.forRootAsync({
      // A mysql2 pool on DATABASE_URL (mysql://...), whose path names the database
      useFactory: () => ({ drizzle, connection: { uri: process.env.DATABASE_URL! } }),
    }),
    OutboxModule.forRoot({ relay: { pollInterval: '1s' } }),
    NotificationsModule,
  ],
  providers: [
    {
      // Messages and inbox records in your database, in tables of their own (nest_outbox_*)
      provide: MySqlOutboxStore,
      inject: [getDrizzleToken(), OutboxStorage],
      useFactory: (db: Database, outboxStorage: OutboxStorage) =>
        new MySqlOutboxStore({ executor: fromDrizzle(db) }, outboxStorage),
    },
    OrdersService,
  ],
})
export class AppModule {}
```

`fromMysql2(pool)`,`fromTypeOrm(dataSource)` 对于类型的数据源 `mysql`,`fromPrisma(prisma)` 与 `@prisma/adapter-mariadb` 驱动程序适配器（为 MySQL 服务的那个），以及 `fromKysely(db)` 为其他客户服务。与 PostgreSQL 有何不同：

- **表，而不是模式。** MySQL 数据库没有模式，因此存储库将其表保留在连接的数据库中，其中一个表是 URL 的路径名，而 `schema` 选项是它们的前缀：`nest_outbox_messages`、`nest_outbox_dead_letters` 和 `nest_outbox_inbox`，位于 `nest_outbox_migrations` 和 `nest_outbox_locks` 旁边。它需要小写字母、数字和下划线，最多 40 个字符。没有数据库的连接会导致启动失败。
- **有界键。** ID、主题、键和使用者名称是最多 255 个字符的索引列，按字节比较：`order-1` 和 `Order-1` 是两把钥匙。较长的一个被拒绝 `RangeError`，在任何陈述之前：by`add()`，并在它运行处理程序之前通过收件箱。
- **您的隔离级别。**您的事务可能在 REPEATABLE READ，MySQL 的默认值，或在 READ COMMITTED.一个与另一个竞争的交付 `processInTransaction()` 等待它，然后在任一级别将处理程序作为副本跳过。
- **死锁会影响您的交易。**`add()` 锁定事务中每个密钥的一行，这是密钥共享的 16,384 行中的一行，这是存储启动时创建的：共享一行的两个密钥的生产者轮流进行，就像一个密钥的生产者轮流进行一样，这很少会减慢不相关的生产者的速度。当 MySQL 打破您的事务中的死锁（错误 1213）时，它会回滚整个事务，商店无法再次运行您的工作：错误作为客户端的错误到达您的代码，因此再次运行事务。有了这些行，两件事仍然会导致一件事：一条消息的三次传递 `processInTransaction()` 当第一个回滚时，你的交易以不同的顺序采取相同的锁。商店自己的事务在死锁时自行重试。
- **非事务性迁移。** MySQL 提交每个 DDL 声明本身，所以 `migrate` 和 `npx @nestjs/outbox migrate --url mysql://...` 在锁下一次应用一个语句，中途停止的运行将在停止的地方继续。您自己的工具也必须每次调用发送一条语句，因为 TypeORM 上面的**迁移**中的迁移可以，而 drizzle-kit 自定义迁移需要 `npx @nestjs/outbox sql --dialect mysql --statement-breakpoints`，因为它的 MySQL 迁移器每个断点发送一条语句。

#### 注册发件箱

在根模块中注册 `OutboxModule`，紧挨着注册 Drizzle 数据库的 `DrizzleModule`，并从 [Keep messages in your database](/reliability/outbox#keep-messages-in-your-database) 存储。它导入的功能模块是在以下步骤中构建的：

```typescript
import { Module } from '@nestjs/common';
import { DrizzleModule, getDrizzleToken } from '@nestjs/drizzle';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { ClientProxyTransport, OutboxModule, OutboxStorage } from '@nestjs/outbox';
import { fromDrizzle, PostgresOutboxStore } from '@nestjs/outbox/postgres';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { Database } from './database/drizzle.js';
import * as schema from './database/schema.js';
import { InventoryModule } from './inventory/inventory.module.js';
import { NotificationsModule } from './notifications/notifications.module.js';
import { OrdersModule } from './orders/orders.module.js';
import { OutboxAdminModule } from './outbox-admin/outbox-admin.module.js';

export const ANALYTICS_SERVICE = 'ANALYTICS_SERVICE';

@Module({
  imports: [
    DrizzleModule.forRootAsync({
      // A pg pool on DATABASE_URL, closed in onApplicationShutdown(), after the relay drained.
      useFactory: () => ({ drizzle, connection: process.env.DATABASE_URL!, schema }),
    }),
    OutboxModule.forRootAsync({
      imports: [
        ClientsModule.registerAsync([
          {
            name: ANALYTICS_SERVICE,
            useFactory: () => ({
              transport: Transport.TCP,
              options: {
                host: process.env.ANALYTICS_HOST ?? '127.0.0.1',
                port: Number(process.env.ANALYTICS_PORT ?? 4001),
              },
            }),
          },
        ]),
      ],
      transports: { analytics: ClientProxyTransport(ANALYTICS_SERVICE) },
      useFactory: () => ({
        // Each message goes to exactly one transport; `local` runs @OnOutboxMessage() handlers.
        route: (message) => (message.topic.startsWith('analytics.') ? 'analytics' : 'local'),
        relay: {
          enabled: process.env.OUTBOX_RELAY !== 'off',
          pollInterval: '1s',
          lease: '30s',
          publishTimeout: '10s',
        },
        retry: {
          attempts: 10,
          backoff: { delay: '1s', maxDelay: '1m' },
        },
      }),
    }),
    OrdersModule,
    NotificationsModule,
    InventoryModule,
    OutboxAdminModule,
  ],
  providers: [
    {
      // Messages and inbox records in your database, in a schema of their own (nest_outbox)
      provide: PostgresOutboxStore,
      inject: [getDrizzleToken(), OutboxStorage],
      useFactory: (db: Database, outboxStorage: OutboxStorage) =>
        new PostgresOutboxStore({ executor: fromDrizzle(db) }, outboxStorage),
    },
  ],
})
export class AppModule {}
```

`ClientProxyTransport(ANALYTICS_SERVICE)` 是一个类 Nest 内部实例化 `OutboxModule`,所以 `transports` 坐在旁边 `useFactory` 上课的地方。工厂在应用程序启动时运行，并返回其余选项：

- `transports` 和 `route`：发布每条消息的位置。`local` 传输是内置的，并在此进程中运行 `@OnOutboxMessage()` 处理程序（[Handle order.placed in-process](/reliability/outbox#handle-orderplaced-in-process)）。`ClientProxyTransport(ANALYTICS_SERVICE)` 通过 `ClientsModule` 注册的 TCP 客户端发布，这就是该模块位于 `imports`（[Publish to the analytics microservice](/reliability/outbox#publish-to-the-analytics-microservice)）中的原因。`route` 每条消息精确选择一个传输。
- `relay`：后台发布者。它投票每 `pollInterval`，租赁它声称的东西 `lease`，并在之后放弃单个发布 `publishTimeout`.设置 `OUTBOX_RELAY=off` 在 API-仅实例（[Run several instances](/reliability/outbox#run-several-instances)).
- `retry`：10 次尝试，指数回退从 1 秒开始，到 1 分钟结束（[Retries and the dead-letter queue](/reliability/outbox#retries-and-the-dead-letter-queue)）。

> info **Hint** 教程中写道 `process.env` 直接，长话短说。在应用程序中，通过 [`@nestjs/config`](/application/configuration) 有了验证模式，所以缺少一个 `DATABASE_URL` 启动时停止应用程序，并从 `ConfigService` 在工厂里。

持续时间是毫秒或字符串，如 `'30s'` 和 `'1m'`。`OutboxModule` 是全局的：`Outbox`、`OutboxStorage`、`OutboxRelay`、`OutboxEvents`、`OutboxDeadLetters` 和 `OutboxInbox` 可以注入到应用程序中的任何位置。

#### 在一个事务中保存订单及其消息

这是订单模型：

```typescript
export interface OrderItem {
  productId: string;
  quantity: number;
  /** Unit price in cents, copied from the catalog when the order is placed. */
  price: number;
}

export interface Order {
  id: string;
  userId: string;
  items: OrderItem[];
  /** In cents. */
  total: number;
  status: 'placed' | 'cancelled';
}

export class PlaceOrderDto {
  userId: string;
  items: { productId: string; quantity: number }[];
}
```

`OrdersService.placeOrder()` 打开 Drizzle 事务处理，为商品定价，插入订单并添加消息，所有这些都通过相同的 `tx`：

```typescript
import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { Outbox } from '@nestjs/outbox';
import type { Database, Transaction } from '../database/drizzle.js';
import { orders, products } from '../database/schema.js';
import type { Order, PlaceOrderDto } from './order.js';

@Injectable()
export class OrdersService {
  constructor(
    @InjectDrizzle() private readonly db: Database,
    private readonly outbox: Outbox<Transaction>,
  ) {}

  async placeOrder({ userId, items }: PlaceOrderDto): Promise<Order> {
    if (!items?.length) {
      throw new BadRequestException('An order needs at least one item');
    }

    const order = await this.db.transaction(async (tx) => {
      // ... price the items through tx (an unknown product throws) and build the order
      await tx.insert(orders).values(order);

      // Drizzle's tx: the messages commit or roll back with the order.
      await this.outbox.add(tx, [
        { topic: 'order.placed', payload: order },
        { topic: 'analytics.order.placed', key: order.id, payload: order },
      ]);
      return order;
    });

    this.outbox.notify(); // publish now instead of at the next poll
    return order;
  }
}
```

`outbox.add()` 首先获取事务句柄，然后是消息或消息数组。和 Drizzle，句柄是 `tx` 那个 `db.transaction()` 传递其回调，服务将其类型提供给发件箱： `Outbox<Transaction>`.商店通过 `tx`，因此消息随顺序提交，或随顺序回滚。存储是异步的，请稍候 `add()` 像任何其他查询一样。每一 API 在加入事务的包中，句柄作为它的第一个参数。

一些细节：

- **每个目的地一条消息。**每条消息恰好发送到一个传输。同一事件会传递到进程处理程序和分析服务，因此该服务会添加两条消息，`order.placed` 和 `analytics.order.placed`，在同一事务中。
- **有效载荷是快照。**`add()` 立即序列化有效载荷，以便稍后更改为 `order` 对象未发布。
- **Ids.**每条消息都有一个时间排序的 UUIDv7`id`。消费者通过它进行重复数据删除。
- **`notify()`.**事务中不发布任何内容。提交后，`notify()` 唤醒继电器。如果没有它，消息将在下一次轮询中发出，直到 `pollInterval` 后来。

如果事务中有任何东西抛出，订单及其消息就会一起回滚，中继永远看不到它们。这包括未知产品、失败的插入件以及在 `add()` 之后失败的任何内容。[Testing](/reliability/outbox#testing) 部分通过在消息写入后失败事务来证明这一点。

传递事务，而不是数据库：`outbox.add(this.db, message)` 会在自动提交模式下自行写入消息，这正是您要删除的双重写入。商店拒绝了 `OutboxTransactionRequiredError`，也是 `add()` 当它根本没有把柄的时候。

通过 HTTP 公开服务：

```typescript
import { Body, Controller, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { PlaceOrderDto } from './order.js';
import { OrdersService } from './orders.service.js';

@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  place(@Body() dto: PlaceOrderDto) {
    return this.ordersService.placeOrder(dto);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  cancel(@Param('id') id: string) {
    return this.ordersService.cancelOrder(id);
  }
}
```

#### 处理 order.placed 进行中

确认电子邮件是 `order.placed` 的处理程序。邮件程序是电子邮件提供者的 SDK 的替代品：

```typescript
import { Injectable, Logger } from '@nestjs/common';
import type { Order } from '../orders/order.js';

/** Stand-in for your email provider's SDK. */
@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name);

  async sendOrderConfirmation(order: Order): Promise<void> {
    this.logger.log(`Order confirmation for ${order.id} sent to ${order.userId}`);
  }
}
```

```typescript
import { Injectable } from '@nestjs/common';
import { OnOutboxMessage } from '@nestjs/outbox';
import type { Order } from '../orders/order.js';
import { MailerService } from './mailer.service.js';

@Injectable()
export class OrderEmailsHandler {
  constructor(private readonly mailerService: MailerService) {}

  // The consumer's inbox skips messages it has already handled.
  @OnOutboxMessage('order.placed', { consumer: 'order-confirmation-email' })
  async sendConfirmation(order: Order) {
    await this.mailerService.sendOrderConfirmation(order);
  }
}
```

`@OnOutboxMessage()` 在提供程序上发现处理程序，因此请注册 `MailerService` 和 `OrderEmailsHandler` 作为 `NotificationsModule`.它们必须是单例：请求作用域提供程序上的处理程序在启动时失败。处理程序获取有效载荷（这里是顺序）和上下文作为其第二个参数。上下文 `message` 保存消息的 `id`, `topic`, `key` 和 `headers`.

每个处理程序都有一个收件箱，命名为 `consumer`。在调用处理程序之前，本地传输检查 `order-confirmation-email` 使用者是否已经处理了此消息 id。处理程序成功后，它会记录 id。`consumer` 是必需的，并且必须保持稳定：一个新的名称使过去的每一条消息看起来都是新的。

收件箱有一个间隙：如果进程在电子邮件发送后但在 id 被记录之前死亡，电子邮件将在重新投递时再次发送。这对于电子邮件来说是可以接受的。它不是用于股票预订，它与收件箱位于同一个数据库中。预订处理程序通过在其自己的事务中记录 id 来填补空白：

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { NonRetryableMessageError, OnOutboxMessage, type OutboxHandlerContext } from '@nestjs/outbox';
import { and, eq, gte, sql } from 'drizzle-orm';
import type { Database, Transaction } from '../database/drizzle.js';
import { products } from '../database/schema.js';
import type { Order } from '../orders/order.js';

@Injectable()
export class StockReservationHandler {
  private readonly logger = new Logger(StockReservationHandler.name);

  constructor(@InjectDrizzle() private readonly db: Database) {}

  @OnOutboxMessage('order.placed', { consumer: 'stock-reservation' })
  async reserve(order: Order, ctx: OutboxHandlerContext<Transaction>) {
    await this.db.transaction(async (tx) => {
      // Records the message id through tx, then runs the callback only if this consumer
      // hasn't processed it yet. Await it: the record commits with the reservation.
      await ctx.processInTransaction(tx, async () => {
        for (const { productId, quantity } of order.items) {
          const reserved = await tx
            .update(products)
            .set({ inStock: sql`${products.inStock} - ${quantity}`, reserved: sql`${products.reserved} + ${quantity}` })
            .where(and(eq(products.id, productId), gte(products.inStock, quantity)))
            .returning({ id: products.id });
          if (reserved.length === 0) {
            // Retrying won't create stock: dead-letter it now and let a human decide.
            throw new NonRetryableMessageError(`Not enough stock for "${productId}" (order ${order.id})`);
          }
        }
        this.logger.log(`Reserved stock for order ${order.id}`);
      });
    });
  }
}
```

`ctx.processInTransaction(tx, work)` 通过处理程序的事务插入收件箱记录，然后调用 `work` 仅当此消费者尚未处理消息时。否则会跳过 `work` 并返回一个结果 `duplicate` 旗帜是 `true`.记录和库存更新一起提交，因此保留恰好发生一次：重新传递找到记录并跳过处理程序，如果 `work` 投掷，都回滚，重试开始干净。在事务的回调中等待它，因此记录是在 `COMMIT`;重复检查发生在调用内部，因此丢失 `await` 不能通过。将处理程序注册到 `InventoryModule`.

| 处理程序 | 行为 | 保证 |
| --- | --- | --- |
| 默认的 | 如果处理程序的收件箱具有 id，则跳过处理程序，在处理程序成功后记录 id | 一次，除非进程在处理程序完成和记录之间终止，或者另一个实例同时传递相同的消息 |
| 呼叫 `ctx.processInTransaction(tx, work)` | 在处理程序自己的事务中记录 id，其写入 | 对同一数据库的写入恰好一次 |
| `inbox: false` | 每次传递都会运行处理程序 | 至少一次 |

两个处理程序同时运行每个处理程序 `order.placed` 消息。如果其中一个失败，则发布失败，整个消息将重试。在重试时，每个已经成功的处理程序都会被其收件箱跳过。

继电器给处理程序 `publishTimeout`（这里 10 秒）。如果它们花费的时间更长，则尝试将被视为失败，并且上下文 `signal` 流产：通过 `ctx.signal` 处理程序发出的调用，例如 `signal` 选择 `fetch()` 所以他们也停下来了。忽略它的处理程序会继续运行，如果重试到达同一进程，收件箱会等待它，而不是第二次运行处理程序。

#### 发布到 analytics 微服务

API 侧已经接线。在 `AppModule` 中，`ClientProxyTransport(ANALYTICS_SERVICE)` 通过 `ClientsModule` 注册在该名称下的 `ClientProxy` 发布，`route` 将每个 `analytics.*` 主题发送给它。传输呼叫 `client.emit(topic, envelope)`，与没有发件箱的呼叫相同。信封上有消息的 `id`、`topic`、`key`、`headers`、`createdAt` 和 `payload`。

取消订单会为同一订单产生第二个分析事件。将 `cancelOrder()` 方法添加到 `OrdersService`，并从 `@nestjs/common` 导入 `NotFoundException` 和 `ConflictException`：

```typescript
async cancelOrder(id: string): Promise<Order> {
  const order = await this.db.transaction(async (tx) => {
    const [row] = await tx.select().from(orders).where(eq(orders.id, id)).for('update');
    if (!row) {
      throw new NotFoundException(`Order ${id} not found`);
    }
    if (row.status !== 'placed') {
      throw new ConflictException(`Order ${id} is ${row.status}`);
    }

    await tx.update(orders).set({ status: 'cancelled' }).where(eq(orders.id, id));
    const order: Order = { ...row, status: 'cancelled' };
    await this.outbox.add(tx, { topic: 'analytics.order.cancelled', key: order.id, payload: order });
    return order;
  });

  this.outbox.notify();
  return order;
}
```

订单控制器已经将 `POST /orders/:id/cancel` 路由到它。`SELECT ... FOR UPDATE` 锁定订单行，因此同一订单的两个取消轮流进行，第二个看到 `cancelled` 并回答 `409`。两个分析消息都使用订单 id 作为它们的 `key`。共享密钥的消息按照其事务提交的顺序一次发布一条。当 `analytics.order.placed` 正在重试时，`analytics.order.cancelled` 在它后面等待，因此 analytics 在取消订单之前看不到取消。带有其他键的消息继续流动。但是，密钥只在重试结束时等待：一旦消息被拼写（见下一节），它后面的消息就会消失。

这个 `order.placed` 进程中处理程序的消息故意没有键。密钥由携带它的每个消息共享，无论主题或传输是什么。如果电子邮件也使用了订单 id，邮件中断将延迟该订单的分析事件。

分析服务是一个单独的 Nest 应用程序，像任何服务一样，它拥有自己的数据：一个自己的 PostgreSQL 数据库，有自己的模式和迁移。它从不阅读命令 API 的桌子。它在自己的表中记录每个订单事件，也是示例的数据：

`order_events` 每个订单事件有一个行，收入是其 `amount` 列：

| 柱子 | 类型 | 附注 |
| --- | --- | --- |
| `seq` | `bigint`，生成的标识 | 主键，按到达顺序 |
| `order_id` | `text` | 索引 |
| `event` | `text` | `placed` 或者 `cancelled` |
| `amount` | `integer` | 收入的变化，单位为美分：下订单时的总额，取消时的减去 |
| `recorded_at` | `timestamptz` | 默认值为 `now()` |

作为一个自己的应用程序，它有自己的根模块，`AppModule`，其中注册 `OutboxModule` 和商店一次，作为订单 API 是的。服务只消费，因此中继被关闭，存储在服务自己的数据库上运行。`OutboxInbox` 将服务收件箱保留在那里，旁边 `order_events`，因此事件和处理它的记录一起提交。商店的留言表是空的，中继器关闭后，没有任何东西轮询它们：

```typescript
import { Module } from '@nestjs/common';
import { DrizzleModule, getDrizzleToken } from '@nestjs/drizzle';
import { OutboxModule, OutboxStorage } from '@nestjs/outbox';
import { fromDrizzle, PostgresOutboxStore } from '@nestjs/outbox/postgres';
import { drizzle } from 'drizzle-orm/node-postgres';
import { AnalyticsController } from './analytics.controller.js';
import type { Database } from './database/drizzle.js';
import * as schema from './database/schema.js';
import { OrderStatsService } from './order-stats.service.js';

@Module({
  imports: [
    DrizzleModule.forRootAsync({
      // This service's own database, not the order API's.
      useFactory: () => ({ drizzle, connection: process.env.DATABASE_URL!, schema }),
    }),
    // Consumer only: no relay runs.
    OutboxModule.forRoot({ relay: { enabled: false } }),
  ],
  controllers: [AnalyticsController],
  providers: [
    {
      // This service's inbox, in its own database (the store's tables for messages stay empty)
      provide: PostgresOutboxStore,
      inject: [getDrizzleToken(), OutboxStorage],
      useFactory: (db: Database, outboxStorage: OutboxStorage) =>
        new PostgresOutboxStore({ executor: fromDrizzle(db) }, outboxStorage),
    },
    OrderStatsService,
  ],
})
export class AppModule {}
```

`OrderStatsService` 记录事件并返回到目前为止的收入。它打开一个事务并调用 `inbox.processInTransaction(tx, 'analytics', messageId, work)`：收件箱记录和 `order_events` 行提交在一起，因此重新传递的事件不会更改任何内容，即使服务在中途崩溃：

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { OutboxInbox } from '@nestjs/outbox';
import type { Database, Transaction } from './database/drizzle.js';
import { orderEvents } from './database/schema.js';

/** The fields of the order API's `Order` that this service reads. */
export interface OrderSnapshot {
  id: string;
  total: number;
}

export type OrderEvent = 'placed' | 'cancelled';

@Injectable()
export class OrderStatsService {
  private readonly logger = new Logger(OrderStatsService.name);

  constructor(
    @InjectDrizzle() private readonly db: Database,
    private readonly outboxInbox: OutboxInbox,
  ) {}

  /**
   * Records an order event once per message id. The inbox record and the event commit in
   * one transaction, so a redelivered message changes nothing. `false` for a duplicate.
   */
  async record(messageId: string, event: OrderEvent, order: OrderSnapshot): Promise<boolean> {
    const outcome = await this.db.transaction(async (tx) =>
      // Records the message id through tx, then runs the callback only if it is new here.
      this.outboxInbox.processInTransaction(tx, 'analytics', messageId, async () => {
        const amount = event === 'placed' ? order.total : -order.total;
        await tx.insert(orderEvents).values({ orderId: order.id, event, amount });
        return this.revenue(tx);
      }),
    );
    if (outcome.duplicate) {
      return false;
    }
    this.logger.log(`Order ${order.id} ${event}, revenue is now ${outcome.result}`);
    return true;
  }

  /** Total revenue in cents. */
  async revenue(db: Database | Transaction = this.db): Promise<number> {
    // ... the sum of amount in order_events, read through db
  }

  // ...
}
```

```typescript
import { Controller, Logger } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import type { OutboxEnvelope } from '@nestjs/outbox';
import { OrderStatsService, type OrderEvent, type OrderSnapshot } from './order-stats.service.js';

@Controller()
export class AnalyticsController {
  private readonly logger = new Logger(AnalyticsController.name);
  /** The last event handled for each key: one order's events run one at a time. */
  private readonly queues = new Map<string, Promise<void>>();

  constructor(private readonly orderStatsService: OrderStatsService) {}

  @EventPattern('analytics.order.placed')
  onPlaced(@Payload() envelope: OutboxEnvelope<OrderSnapshot>) {
    return this.apply('placed', envelope);
  }

  @EventPattern('analytics.order.cancelled')
  onCancelled(@Payload() envelope: OutboxEnvelope<OrderSnapshot>) {
    return this.apply('cancelled', envelope);
  }

  private apply(event: OrderEvent, envelope: OutboxEnvelope<OrderSnapshot>) {
    // Events arrive in the order the relay published them, but handlers are asynchronous:
    // without a queue, a cancellation could commit before the placement it follows.
    return this.inOrder(envelope.key ?? envelope.id, async () => {
      // The envelope id is the outbox message id: stable across redeliveries.
      const recorded = await this.orderStatsService.record(envelope.id, event, envelope.payload);
      if (!recorded) {
        this.logger.warn(`Skipped duplicate ${envelope.topic} ${envelope.id}`);
      }
    });
  }

  private inOrder(key: string, work: () => Promise<void>): Promise<void> {
    const next = (this.queues.get(key) ?? Promise.resolve()).then(work, work);
    this.queues.set(key, next);
    const forget = () => {
      if (this.queues.get(key) === next) {
        this.queues.delete(key);
      }
    };
    next.then(forget, forget);
    return next;
  }
}
```

订单的事件按照中继发布它们的顺序到达，但是处理程序是异步的：其中两个可以同时运行，并且可以在其后的放置之前提交取消。控制器以到达顺序一次运行一个键的事件，并以不同的顺序并行运行。

```typescript
import { NestFactory } from '@nestjs/core';
import { Transport, type MicroserviceOptions } from '@nestjs/microservices';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(AppModule, {
    transport: Transport.TCP,
    options: { host: '127.0.0.1', port: Number(process.env.PORT ?? 4001) },
  });
  app.enableShutdownHooks();
  await app.listen();
}
await bootstrap();
```

`inbox.processInTransaction()` 是什么 `@OnOutboxMessage()` 处理程序得到 `ctx.processInTransaction()`：正好一次写入使用者自己的数据库。当消费者的副作用在其数据库之外（例如电子邮件）时，使用 `inbox.process(consumer, id, work)` 相反：它跳过 `work` 如果消费者已经看到这个 id，并在之后记录它 `work` 成功了。

> warning **Warning** 在 TCP 上，“发布”仅意味着字节离开了顺序 API。如果分析服务在接收事件后但在处理事件之前崩溃，则该事件将丢失。对于您不能丢失的事件，请使用其经纪人确认收到的传输：Kafka、RabbitMQ 带发布者确认，或 NATSJetStream。`ClientProxyTransport` 接受一个 `toPacket` 选项，该选项将消息映射到该传输记录，并带有自己的关键字和标头。

#### 重试和死信队列

当发布失败时，因为处理程序抛出了 TCP 连接被拒绝，或者发布时间超过 `publishTimeout`，中继重新安排消息：

- 每次重试等待时间更长：1 秒、2 秒、4 秒，依此类推，上限为 `maxDelay`（这里 1 分钟）。每次等待都是在一半值和全值之间随机分配的，因此重试不会同步到达。
- 每次失败都会记录为警告，并在下一次失败之前记录尝试编号和等待时间。
- 之后 `retry.attempts` 失败（此处为 10），消息移动到死信表，原因如下 `exhausted` 以及每次尝试的错误。
- A `NonRetryableMessageError` 跳过重试。这条信息立刻被写得死去活来，理由是 `rejected`.可选的任何错误也是如此 `retry.retryIf(error, attempt, message)` 函数返回 `false`.当多个处理程序失败时，只有当所有处理程序都抛出时，消息才会被拒绝 `NonRetryableMessageError` 否则将重试，跳过成功的处理程序，一旦只剩下永久失败，就会被拒绝。
- 没有的主题 `@OnOutboxMessage()` 处理程序是重试的，不是死字母。在滚动部署期间，旧实例的中继可以看到只有新版本处理的主题。
- 一个死字母的消息不再保留它的密钥：以后带有该密钥的消息将在没有它的情况下发布。大小 `retry` 这样你预期的停电就不会用完它。

股票处理程序抛出 `NonRetryableMessageError` 当库存不足时。重试不会创建库存，因此消息直接进入死信表，在那里一个人可以决定做什么。

`OutboxDeadLetters` 列出、检查、重新排队和清除死信。软件包不挂载任何 HTTP 路线，所以在你自己的警卫后面暴露它。同一个控制器提供发件箱的统计数据，从 `OutboxMetrics` 下一节构建的服务：

```typescript
import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { OutboxDeadLetters } from '@nestjs/outbox';
import { AdminGuard } from './admin.guard.js';
import { OutboxMetrics } from './outbox-metrics.service.js';

@Controller('admin/outbox')
@UseGuards(AdminGuard)
export class OutboxAdminController {
  constructor(
    private readonly outboxDeadLetters: OutboxDeadLetters,
    private readonly outboxMetrics: OutboxMetrics,
  ) {}

  @Get('dead-letters')
  list(@Query('topic') topic?: string) {
    return this.outboxDeadLetters.list({ topic });
  }

  @Post('dead-letters/:id/requeue')
  @HttpCode(HttpStatus.OK)
  async requeue(@Param('id') id: string) {
    return { requeued: await this.outboxDeadLetters.requeue(id) };
  }

  @Delete('dead-letters/:id')
  async purge(@Param('id') id: string) {
    return { purged: await this.outboxDeadLetters.purge(id) };
  }

  @Get('stats')
  stats() {
    return this.outboxMetrics.snapshot();
  }
}
```

```typescript
import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { createHash, timingSafeEqual } from 'node:crypto';

type HttpRequest = { headers: Record<string, string | string[] | undefined> };

/** Placeholder: protect these routes with your application's real authorization. */
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<HttpRequest>();
    const token = process.env.ADMIN_TOKEN;
    const given = request.headers['x-admin-token'];
    return !!token && typeof given === 'string' && sameSecret(given, token);
  }
}

/** Compares in constant time, so response times don't give the token away. */
function sameSecret(given: string, expected: string): boolean {
  const digest = (value: string) => createHash('sha256').update(value).digest();
  return timingSafeEqual(digest(given), digest(expected));
}
```

> info **Hint** `AdminGuard` 是占位符。死字母包含完整的有效载荷，包括客户数据，因此使用应用程序的真实 [授权](/security/authorization) 保护这些路由。

`requeue()` 使用新的重试预算和**相同的 id**将一封死信移回发件箱。已经处理过的消费者通过收件箱跳过它。因此，在您重新进货后，重新排队缺货订单会保留库存，而无需发送第二封确认电子邮件。 `requeue()` 和 `purge()` 还接受 ID 数组或筛选器 `topic`, `key` 或者 `failedBefore`.它们拒绝空过滤器；通过 `all: true` 瞄准每一封死信。

#### 运行多个实例

订单的每个实例 API 在任意数量的主机上对相同的表运行中继。数据库决定谁得到什么：

- **认领。**中继通过在一批消息上写下一份租约来认领它们 `lease`（30 秒），具有用于索赔的随机令牌。索赔在商店的索赔锁下轮流进行，并且 `SKIP LOCKED` 传递另一个中继正在写入的行，因此两个中继永远不会收到相同的消息。他们并行发布他们的批次。
- **围栏。**以后每次写入消息（已发布、重新安排、死写）都必须显示租约令牌，因此停滞超过租约的中继不能覆盖接管的中继的工作。
- **跨实例排序。**密钥的消息按照其事务提交的顺序发出，无论哪个实例添加了它们：`add()` 使添加相同密钥的事务轮流进行。保持添加密钥消息的事务简短。
- **一次性保留。**在不同实例上同时运行的同一消息的两个传递在收件箱的主键处相遇：第二个传递等待第一个事务，然后在提交时跳过处理程序。
- **崩溃。**如果一个实例在持有租约时死亡，一旦租约到期，它的消息将由另一个实例发布。如果它在发布后但在记录之前死亡，则会第二次发布消息，消费者的收件箱会丢弃副本。实例不会丢失任何东西，因为它上面没有任何东西：消息是数据库中的行。
- **租赁预算。**中继绝不会在剩余租赁时间少于 `publishTimeout`（10 秒）时开始发布。相反，它会释放批次的其余部分。保持 `publishTimeout` 远低于 `lease`。
- **时钟。**租约使用中继的时钟，因此请保持主机时钟与 NTP 同步，在 `lease` 范围内。
- **API-仅实例。**以 `OUTBOX_RELAY=off` 启动实例，使其生成消息而不发布消息。`notify()` 只唤醒添加消息的实例的中继，因此中继实例在一个 `pollInterval` 内拾取消息。
- **仅中继工人。**反过来也适用：工人从 `NestFactory.createApplicationContext(AppModule)` 和不 HTTP 服务器发布 API 实例添加。继电器的轮询定时器使该进程保持活动状态，直到关机挂钩停止它。

优雅关机需要关机挂钩：

```typescript
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // On SIGTERM the relay stops claiming, finishes in-flight publishes and releases its leases.
  app.enableShutdownHooks();
  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
```

在 `SIGTERM` 时，中继停止声明，并等待飞行中发布完成，每个发布最多为 `publishTimeout`。然后，它会发布它声称但尚未开始的消息上的租约，因此另一个实例可以立即获取它们，而不是等待租约到期。这发生在 `onModuleDestroy()` 中，在 `ClientsModule` 关闭 `onApplicationShutdown()` 中的 TCP 客户端之前。

要查看发件箱，请订阅 `OutboxEvents` 并阅读 `relay.stats()`：

```typescript
import { Injectable, type OnModuleInit } from '@nestjs/common';
import { OutboxEvents, OutboxRelay } from '@nestjs/outbox';

@Injectable()
export class OutboxMetrics implements OnModuleInit {
  readonly counters = { published: 0, retried: 0, deadLettered: 0, leaseLost: 0 };
  /** Time from add() to a successful publish, for the latest message. */
  lastPublishLagMs = 0;

  constructor(
    private readonly outboxEvents: OutboxEvents,
    private readonly outboxRelay: OutboxRelay,
  ) {}

  onModuleInit() {
    this.outboxEvents.events$.subscribe((event) => {
      switch (event.type) {
        case 'published':
          this.counters.published++;
          this.lastPublishLagMs = Date.now() - event.message.createdAt;
          break;
        case 'retry-scheduled':
          this.counters.retried++;
          break;
        case 'dead-lettered':
          this.counters.deadLettered++;
          break;
        case 'lease-lost':
          this.counters.leaseLost++;
          break;
      }
    });
  }

  async snapshot() {
    // pending, ready, leased, deadLetters, lagMs (how long the longest-waiting message has waited)...
    const stats = await this.outboxRelay.stats();
    return { ...stats, ...this.counters, lastPublishLagMs: this.lastPublishLagMs };
  }
}
```

`relay.stats()` 报告 `lagMs`，等待时间最长的消息已经等待了多长时间。它在下游下降时增长，这使得它成为值得警惕的数字，以及 `deadLetters`.预定的消息 `delay` 到期才算。这个 `published` 事件携带消息，因此 `Date.now() - message.createdAt` 是端到端发布滞后。 `OutboxEvents` 发出四个事件 `switch` 计数。 `lease-lost` 意味着另一个中继在发布消息时接管了该消息，因此该消息可能会两次到达其消费者。登记 `OutboxAdminController`, `AdminGuard` 和 `OutboxMetrics` 在一个 `OutboxAdminModule`.

每个事件也发布在 [`node:diagnostics_channel`](https://nodejs.org/api/diagnostics_channel.html) 通道，`nestjs:outbox:published` 等等。跟踪和度量库可以订阅那些没有任何 Nest 代码，他们看到每一个 Nest 过程中的应用。

捕捉订户内部的错误。RxJS 和 `diagnostics_channel` 两者都将订户的错误作为未捕获的异常重新抛出，从而停止进程。那时中继已经保存了消息的结果，所以消息本身是安全的。

示例应用程序针对 PostgreSQL 服务器运行本节：两个中继共享 20 个订单，三个实例（其中一个 API-仅）下和取消 12 个订单，每个消息发布一次，每个订单的事件按顺序进行，一个事务等待另一个实例锁定同一密钥，一个实例崩溃持有租约，以及一个优雅的关闭。

#### 试试

创建两个数据库，`store` 用于订单 API，`analytics` 用于分析服务，并应用每个服务自己的迁移：订单 API 从 [Prerequisites](/reliability/outbox#prerequisites) 创建其表和产品，分析服务创建 `order_events`。

启动分析服务（TCP 端口 4001) 开 `analytics` 和顺序 API（端口 3000）开 `store`，与 `ADMIN_TOKEN=s3cret` 在 API 的环境。每个都记录它注册的存储，存储在第一次启动时创建它的模式：

```bash
[Nest] 52654  - 09/30/2026, 6:45:43 PM     LOG [OutboxModule] OutboxStorage: PostgresOutboxStore
[Nest] 52654  - 09/30/2026, 6:45:43 PM     LOG [OutboxModule] PostgresOutboxStore: migrated schema "nest_outbox" to version 1.
[Nest] 52743  - 09/30/2026, 6:45:59 PM     LOG [OutboxModule] OutboxStorage: PostgresOutboxStore
[Nest] 52743  - 09/30/2026, 6:46:00 PM     LOG [OutboxModule] PostgresOutboxStore: migrated schema "nest_outbox" to version 1.
```

下订单：

```bash
$ curl -X POST localhost:3000/orders \
    -H 'Content-Type: application/json' \
    -d '{"userId":"user-42","items":[{"productId":"salmon-kibble-2kg","quantity":2}]}'
{"id":"07fafff6-9892-4298-aeef-dc2c3d5d6bf5","userId":"user-42","items":[{"productId":"salmon-kibble-2kg","quantity":2,"price":2499}],"total":4998,"status":"placed"}
```

这个 API 的日志显示了两个进程处理程序：

```bash
[Nest] 52743  - 09/30/2026, 6:46:07 PM     LOG [MailerService] Order confirmation for 07fafff6-9892-4298-aeef-dc2c3d5d6bf5 sent to user-42
[Nest] 52743  - 09/30/2026, 6:46:07 PM     LOG [StockReservationHandler] Reserved stock for order 07fafff6-9892-4298-aeef-dc2c3d5d6bf5
```

分析服务的日志显示 TCP 消费者：

```bash
[Nest] 52654  - 09/30/2026, 6:46:07 PM     LOG [OrderStatsService] Order 07fafff6-9892-4298-aeef-dc2c3d5d6bf5 placed, revenue is now 4998
```

未知产品的订单在事务中验证失败。答案是 `400`，没有任何东西到达发件箱：

```bash
$ curl -X POST localhost:3000/orders \
    -H 'Content-Type: application/json' \
    -d '{"userId":"user-42","items":[{"productId":"catnip-mouse","quantity":1}]}'
{"message":"Unknown product \"catnip-mouse\"","error":"Bad Request","statusCode":400}
```

现在订购两袋结块垃圾（`clumping-litter-10l`），其中有一个库存。这个 API 接受订单，因为库存是异步保留的。确认电子邮件发出，预订在第一次尝试时是盲文：

```bash
$ curl -X POST localhost:3000/orders \
    -H 'Content-Type: application/json' \
    -d '{"userId":"user-7","items":[{"productId":"clumping-litter-10l","quantity":2}]}'
{"id":"bf4b8bb3-fd47-4c03-9650-ee991cce3dbe","userId":"user-7","items":[{"productId":"clumping-litter-10l","quantity":2,"price":1599}],"total":3198,"status":"placed"}
```

```bash
[Nest] 52743  - 09/30/2026, 6:46:15 PM     LOG [MailerService] Order confirmation for bf4b8bb3-fd47-4c03-9650-ee991cce3dbe sent to user-7
[Nest] 52743  - 09/30/2026, 6:46:15 PM    WARN [OutboxRelay] Dead-lettered order.placed 01a0f335-aae8-7027-b795-ca9dab21e44d after 1 attempt(s) (rejected): NonRetryableMessageError: Not enough stock for "clumping-litter-10l" (order bf4b8bb3-fd47-4c03-9650-ee991cce3dbe)
```

检查死信队列。如果没有 `x-admin-token` 头，守卫将回答 `403`：

```bash
$ curl localhost:3000/admin/outbox/dead-letters -H 'x-admin-token: s3cret'
```

```json
[
  {
    "id": "01a0f335-aae8-7027-b795-ca9dab21e44d",
    "topic": "order.placed",
    "payload": {
      "id": "bf4b8bb3-fd47-4c03-9650-ee991cce3dbe",
      "items": [{ "price": 1599, "quantity": 2, "productId": "clumping-litter-10l" }],
      "total": 3198,
      "status": "placed",
      "userId": "user-7"
    },
    "headers": {},
    "key": null,
    "createdAt": 1790786775784,
    "attempts": 1,
    "lastError": "NonRetryableMessageError: Not enough stock for \"clumping-litter-10l\" (order bf4b8bb3-fd47-4c03-9650-ee991cce3dbe)",
    "history": [
      {
        "at": 1790786775809,
        "error": "NonRetryableMessageError: Not enough stock for \"clumping-litter-10l\" (order bf4b8bb3-fd47-4c03-9650-ee991cce3dbe)",
        "attempt": 1,
        "transport": "local"
      }
    ],
    "reason": "rejected",
    "failedAt": 1790786775809
  }
]
```

有效载荷存储为 `jsonb`，它保持自己的密钥顺序，因此返回的密钥顺序与添加时的顺序不同。

重新进货，然后按消息 id 重新排队：

```bash
$ psql postgres://localhost:5432/store -c "UPDATE products SET in_stock = in_stock + 5 WHERE id = 'clumping-litter-10l'"
UPDATE 1
$ curl -X POST localhost:3000/admin/outbox/dead-letters/01a0f335-aae8-7027-b795-ca9dab21e44d/requeue \
    -H 'x-admin-token: s3cret'
{"requeued":1}
```

预订通过了。电子邮件处理程序的收件箱已具有此邮件 id，因此不会发送第二封电子邮件：

```bash
[Nest] 52743  - 09/30/2026, 6:46:24 PM     LOG [StockReservationHandler] Reserved stock for order bf4b8bb3-fd47-4c03-9650-ee991cce3dbe
```

最后，停止分析服务 `Ctrl+C`，然后下订单并取消：

```bash
$ curl -X POST localhost:3000/orders \
    -H 'Content-Type: application/json' \
    -d '{"userId":"user-42","items":[{"productId":"salmon-kibble-2kg","quantity":1}]}'
{"id":"908139a7-2bab-4dd8-988a-bdde8c087074","userId":"user-42","items":[{"productId":"salmon-kibble-2kg","quantity":1,"price":2499}],"total":2499,"status":"placed"}
$ curl -X POST localhost:3000/orders/908139a7-2bab-4dd8-988a-bdde8c087074/cancel
{"id":"908139a7-2bab-4dd8-988a-bdde8c087074","userId":"user-42","items":[{"price":2499,"quantity":1,"productId":"salmon-kibble-2kg"}],"total":2499,"status":"cancelled"}
$ curl localhost:3000/admin/outbox/stats -H 'x-admin-token: s3cret'
{"pending":2,"ready":0,"leased":0,"deadLetters":0,"oldestDueAt":1790786821554,"lagMs":3351,"inFlight":0,"published":5,"retried":3,"deadLettered":1,"leaseLost":0,"lastPublishLagMs":62}
```

两个分析消息都是挂起的。`lagMs` 在停电期间增长，并且 `retried` 计算失败的尝试。`ready` 是 0：放置正在等待下一次重试，取消到期，但在它后面等待，因为它们共享一个密钥。这个 API 记录每次失败的尝试：

```bash
[Nest] 52743  - 09/30/2026, 6:47:01 PM    WARN [OutboxRelay] Retrying analytics.order.placed 01a0f336-5db2-72ad-80c8-17c07908dfa1 in 546ms (attempt 1 of 10 failed): Error: connect ECONNREFUSED 127.0.0.1:4001
[Nest] 52743  - 09/30/2026, 6:47:02 PM    WARN [OutboxRelay] Retrying analytics.order.placed 01a0f336-5db2-72ad-80c8-17c07908dfa1 in 1617ms (attempt 2 of 10 failed): Error: connect ECONNREFUSED 127.0.0.1:4001
[Nest] 52743  - 09/30/2026, 6:47:04 PM    WARN [OutboxRelay] Retrying analytics.order.placed 01a0f336-5db2-72ad-80c8-17c07908dfa1 in 2084ms (attempt 3 of 10 failed): Error: connect ECONNREFUSED 127.0.0.1:4001
```

重新启动分析服务。在下一次重试时，中继发布放置，然后发布取消。收入从原处恢复，因为它存在于服务的数据库中，而不是存储在其内存中：

```bash
[Nest] 53368  - 09/30/2026, 6:47:29 PM     LOG [OrderStatsService] Order 908139a7-2bab-4dd8-988a-bdde8c087074 placed, revenue is now 10695
[Nest] 53368  - 09/30/2026, 6:47:29 PM     LOG [OrderStatsService] Order 908139a7-2bab-4dd8-988a-bdde8c087074 cancelled, revenue is now 8196
```

#### 检测

在 e2e 测试中，使用 [PGlite](https://pglite.dev) 和你真正的迁移，关闭轮询循环，自己驱动中继。`relay.runOnce()` 声明并处理一个批次，并在批次完成时进行解析：

```typescript
import { PGlite } from '@electric-sql/pglite';
import { getDrizzleToken } from '@nestjs/drizzle';
import { Outbox, OutboxRelay } from '@nestjs/outbox';
import { Test, type TestingModule } from '@nestjs/testing';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { fileURLToPath } from 'node:url';
import { of } from 'rxjs';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { ANALYTICS_SERVICE, AppModule } from '../src/app.module.js';
import * as schema from '../src/database/schema.js';
import { MailerService } from '../src/notifications/mailer.service.js';
import { OrdersService } from '../src/orders/orders.service.js';

describe('OrdersService (outbox)', () => {
  const client = new PGlite(); // PostgreSQL, in-process
  const db = drizzle(client, { schema });
  const mailer = { sendOrderConfirmation: vi.fn() };
  const analytics = { emit: vi.fn(() => of(undefined)) };
  let moduleRef: TestingModule;
  let orders: OrdersService;
  let relay: OutboxRelay;

  beforeAll(async () => {
    // Your migrations: the order tables. The outbox's store creates its schema in init().
    await migrate(db, { migrationsFolder: fileURLToPath(new URL('../drizzle', import.meta.url)) });
    process.env.OUTBOX_RELAY = 'off'; // no poll loop: the test drives the relay
    moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(getDrizzleToken())
      .useValue(db) // the outbox's store runs on it too
      .overrideProvider(MailerService)
      .useValue(mailer)
      .overrideProvider(ANALYTICS_SERVICE)
      .useValue(analytics)
      .compile();
    await moduleRef.init();
    orders = moduleRef.get(OrdersService);
    relay = moduleRef.get(OutboxRelay);
  });

  afterAll(async () => {
    await moduleRef.close();
    await client.close();
  });

  it('publishes order events only after the order commits', async () => {
    const order = await orders.placeOrder({ userId: 'user-42', items: [{ productId: 'salmon-kibble-2kg', quantity: 1 }] });
    expect(mailer.sendOrderConfirmation).not.toHaveBeenCalled();

    await relay.runOnce(); // claim and publish one batch

    expect(mailer.sendOrderConfirmation).toHaveBeenCalledWith(order);
    expect(analytics.emit).toHaveBeenCalledWith(
      'analytics.order.placed',
      expect.objectContaining({ key: order.id, payload: order }),
    );
    expect(await relay.stats()).toMatchObject({ pending: 0, deadLetters: 0 });
  });

  it('publishes nothing when the transaction rolls back', async () => {
    const outbox = moduleRef.get(Outbox);
    const add = outbox.add.bind(outbox);
    vi.spyOn(outbox, 'add').mockImplementationOnce(async (tx, messages) => {
      await add(tx, messages); // the messages are written...
      throw new Error('Connection terminated unexpectedly'); // ...then the transaction fails
    });

    await expect(
      orders.placeOrder({ userId: 'user-42', items: [{ productId: 'salmon-kibble-2kg', quantity: 1 }] }),
    ).rejects.toThrow('Connection terminated unexpectedly');

    expect(await relay.stats()).toMatchObject({ pending: 0 });
    expect(await relay.runOnce()).toMatchObject({ claimed: 0 });
  });
});
```

- 发件箱、存储、迁移和过程中调度都是真实的。只有邮件程序和分析客户端被存根。
- 覆盖数据库 `DrizzleModule` 寄存器，其令牌 `getDrizzleToken()` 返回，与 PGlite 一个。商店的工厂注入相同的令牌，因此订单和发件箱共享数据库，就像它们在生产中共享池一样，商店在模块初始化时在那里创建其模式。模块仍然打开它的 `pg` 游泳池，从不连接。
- 回滚测试让 `outbox.add()` 写入消息，然后事务失败。命令和它的信息一起消失，并且 `runOnce()` 找不到什么可索赔的。
- 对于取决于时间的行为，如回退和租约到期，移动 `Date.now()` 前进 `vi.spyOn(Date, 'now')` 继电器为自己和商店消耗时间，实时计时器继续为插座和 HTTP.
- PGlite 只有一个连接，所以它一次运行一个事务。实例与 PostgreSQL 服务器之间的测试竞赛，PostgreSQL 服务器与生产版本相同，如 [几个实例](/reliability/outbox#run-several-instances) 的示例所示。
- 若要使 outbox 排除在测试之外，请替换存储： `overrideProvider(PostgresOutboxStore).useValue(new InMemoryOutboxStore())`.一个普通实例不会注册自己，因此发件箱会回到它的内存存储，并且存储的模式不会被创建。它不能加入你的 Drizzle 但是，交易：回滚消息仍然会发布，商店第一次收到您的交易时会记录警告。

#### 交货保证

总体保证是**至少一次**，消费者收件箱吸收重复。

| 情况 | 结果 |
| --- | --- |
| 订单事务回滚 | 该消息从未存在过，也从未发布过 |
| 订单事务提交 | 最终出版，或带有错误历史的死字 |
| 继电器在索赔后死亡 | 租约到期后由另一个实例发布 |
| 中继在发布后，在录制之前就消失了 | 出版了两次。收件箱丢弃重复 |
| 发布或处理程序失败 | 回退重试，然后死写（`exhausted`） |
| 发布或处理程序过期 `publishTimeout` | 算作失败的尝试，以及 `ctx.signal` 堕胎。忽略它的处理程序继续运行；同一进程中的重试等待它 |
| `NonRetryableMessageError`, 或 `retryIf` 回报 `false` | 立即死写 (`rejected`) |
| 消息分享 a`key` | 按添加顺序发布。重试消息会保留其余密钥 |
| 信息是死写的 | 它的密钥是解锁的，所以以后带有该密钥的消息会超越它 |
| TCP,Redis 或核心 NATS 运输 | “发布”意味着写入离开了进程。之后的消费者崩溃会丢失信息 |

密钥内的顺序是存储对消息进行编号的顺序，而不是它们的 id：id 来自其实例的时钟，而时钟是不同的。PostgreSQL 并发运行事务，因此存储使添加具有相同密钥的消息的事务轮流进行，编号遵循提交顺序（参见 [Keep messages in your database](/reliability/outbox#keep-messages-in-your-database)）。

#### 生产检查表

- 在应用程序的数据库、数据库服务器上注册存储：`PostgresOutboxStore`、`MySqlOutboxStore` 或您自己的服务器之一（[The store contract](/reliability/outbox#the-store-contract)）。切勿将发件箱保留在实例本身、内存中或磁盘上的 SQLite 等文件数据库中：当任务被替换时，容器的文件系统就会消失，每个未发布的消息都会随之消失。生产警卫拒绝在没有商店的情况下开始；仅对您可以承受丢失消息的进程设置 `allowInMemoryStorage`。
- 在新版本开始之前，使用 `npx @nestjs/outbox migrate` 或您的迁移工具应用商店的迁移，并使用 `npx @nestjs/outbox status` 在 CI 中检查它们。使用 `NODE_ENV=production`，存储不会在启动时迁移：背后的模式会使其失败。
- 在 PostgreSQL 上，将数据库的默认隔离级别保持在 READCOMMITTED 默认设置：商店在启动时拒绝更严格的设置。
- 警戒 `lagMs` 和 `deadLetters` 来自 `relay.stats()`，等等 `dead-lettered` 事件，来自 `OutboxEvents` 或者 `nestjs:outbox:dead-lettered` 诊断频道。
- 大小 `retry` 你的下游能停运多久。包默认是 20 次尝试，总共大约 30 到 60 分钟。本教程的 10 次尝试以 1 分钟为限，2 到 4 分钟后放弃，然后一个键的后续消息超过了死字母的键。
- 保持 `consumer` 名字稳定。收件箱条目由它们键入，因此重命名的消费者将过去的每条消息视为新消息。
- 李子收件箱。什么都没打电话 `OutboxInbox.prune()` 为了你。从 [cron 作业](/application/task-scheduling#declarative-cron-jobs)，例如 `inbox.prune('30d')`，窗口比任何重新交付都要长，包括重新排队。
- 保持处理程序短于 `publishTimeout`，并通过 `ctx.signal` 他们打的电话。较慢的处理程序算作失败的尝试；租约不会延长。
- 呼吁 `app.enableShutdownHooks()`，因此部署耗尽中继，而不是留下租用消息。 `DrizzleModule` 结束池之后，在 `onApplicationShutdown()`.
- 保护死信路由。它们暴露了完整的有效载荷。
- 版本有效载荷。前一个版本添加的消息在部署后仍然可以传递。
- 为每个有序流提供自己的密钥，并且不要在不同传输的消息之间共享密钥。
- 保持调用的事务 `outbox.add()` 短的。每密钥锁使得使用相同密钥添加消息的事务轮流进行。Prisma 默认情况下，交互式事务在 5 秒后超时（`transactionOptions` 在客户端上，或每次呼叫）。
- 在 MySQL 上，运行一个调用 `outbox.add()` 同样，当它因死锁而失败时（错误 1213）：MySQL 将其全部回滚。
- 为您的请求和中继调整连接池的大小：每个声明为一个短事务保留一个连接。
- 使用 `concurrent: true` 在 CI 针对您自己的存储，在池上，针对您在生产中运行的数据库引擎和主要版本。

#### 商店合同

`PostgresOutboxStore` 和 `MySqlOutboxStore` 实现包的两个存储接口：`OutboxStore` 对于留言和死信，以及 `OutboxInboxStore` 对于消费者的收件箱。对于另一个数据库，请在您自己的提供程序中实现它们。这些接口上每个方法的 JSDoc 说明了它必须做什么，以及每个规则阻止了哪些竞争。

**注册。**该商店是一家普通的单身供应商，致电 `registerSource()` 关于注射剂 `OutboxStorage` 在其构造函数中，对于它实现的合同，名称如下： `messages` 和 `inbox`.仅消费的服务可以单独注册收件箱存储。注册表一次检查形状（每个方法都是一个函数），拒绝第二次注册，除非它通过 `replace: true`，并在 `OutboxModule` 初始化，记录正在使用的存储。请求范围内的提供程序、延迟加载模块中的提供程序或生命周期挂钩注册太晚，并抛出。

在没有注册任何内容的情况下，发件箱在其内存存储中运行，并在启动时这样说：

```bash
[Nest] 19039  - 09/23/2026, 11:28:45 AM     LOG [OutboxModule] OutboxStorage: InMemoryOutboxStore (the default: state is lost on restart and not shared between instances)
```

这不仅仅是一个重启时丢失的捷径。内存中存储无法加入您的事务，因此它适用 `add()` 并在第一次收到事务句柄时发出警告。在本次运行中，订单的事务添加了消息，然后失败，确认电子邮件仍然发出：

```bash
[Nest] 19039  - 09/23/2026, 11:28:45 AM    WARN [OutboxModule] InMemoryOutboxStore.add() received your transaction handle, and can't join it: the write applies at once, so a rolled-back transaction won't undo it. Register a store for your database with OutboxStorage.registerSource(). (Logged once.)
[Nest] 19039  - 09/23/2026, 11:28:46 AM     LOG [MailerService] Order confirmation for 7435d418-5d9a-48a0-b186-6cfd2e34b9f4 sent to user-7
```

和 `NODE_ENV=production`，相同的应用程序不会启动：

```bash
Error: OutboxStorage: no store is registered for `messages` (OutboxStore) and `inbox` (OutboxInboxStore), and NODE_ENV is "production": in memory, messages and inbox records would be lost on restart and not shared between instances. Register a store on your database: PostgresOutboxStore (@nestjs/outbox/postgres), MySqlOutboxStore (@nestjs/outbox/mysql), or your own OutboxStore and OutboxInboxStore in a provider that injects OutboxStorage and calls `storage.registerSource({ messages: this, inbox: this })` in its constructor. Or set `allowInMemoryStorage: true` in the OutboxModule options to run in memory anyway.
```

`allowInMemoryStorage: true` 在模块的选项中是故意的退出方式，对于可能失去状态的单个实例。

**原子性。**生产者、接力者和交付者在商店里相互竞争。`add()` 必须按照密钥的事务提交顺序对其消息进行编号，`claim()` 绝不能将消息租赁给两个中继或在其密钥的旧消息之前运行，中继的后续写入必须仅在其租赁有效时适用，并且一条消息的两次传递必须在 `recordInbox()` 相遇。因此，每个更改状态的方法都是一个条件语句，或者一个带有正确锁的事务，而不是先读后写。`add()` 和 `recordInbox()` 原封不动地接收您的事务对象：它们必须写入它，并用 `OutboxTransactionRequiredError` 拒绝任何不是事务对象的东西，如数据库本身。

**使用 `@nestjs/outbox/testing` 中的套件进行测试**。`outboxStoreContract()` 和 `outboxInboxStoreContract()` 将契约作为任何测试运行器的测试用例返回：每个用例都是一个 `name` 和一个 `run()` 函数，引发失败。本教程的测试针对 `PostgresOutboxStore` 到 Drizzle 运行它们，就像您针对自己的一样，其中有一个函数可以在空的表上返回存储，一种打开其中一个事务的方法，以及 `notATransaction`，存储必须拒绝的句柄：

```typescript
/** A store on emptied tables, built the way Nest builds it: with the database and a registry. */
async function freshStore(db: Database): Promise<OutboxStoreHarness<Transaction> & { store: PostgresOutboxStore }> {
  await db.execute(sql`TRUNCATE nest_outbox.messages, nest_outbox.dead_letters, nest_outbox.inbox RESTART IDENTITY`);
  return {
    store: new PostgresOutboxStore({ executor: fromDrizzle(db) }, new OutboxStorage()),
    transaction: (work) => db.transaction(work),
    notATransaction: db,
  };
}

describe('PostgresOutboxStore through fromDrizzle on PGlite: the store contract', () => {
  // ...
  // The concurrency cases run too; with one connection, PGlite runs them one transaction at a time.
  for (const c of outboxStoreContract(() => freshStore(db), { concurrent: true })) {
    it(c.name, c.run);
  }
  describe('the inbox contract', () => {
    for (const c of outboxInboxStoreContract(() => freshStore(db), { concurrent: true })) {
      it(c.name, c.run);
    }
  });
});
```

`concurrent: true` 添加一个天真的商店失败的比赛：交易重叠的钥匙生产者，并排索赔的中继，生产者和中继比赛，一个陈旧的中继写比赛接管，以及一个消息的两次交付。在 PGlite 上，它们一次传递一个事务，所以也要在带有池的服务器上运行它们，在数据库引擎和生产中运行的主要版本上，事务实际上是重叠的。本教程通过每个客户端运行这两个套件： Drizzle 在 PGlite 和 PostgreSQL 上， TypeORM 和 Prisma 在 PostgreSQL 上，以及 Drizzle 在 MySQL 上，反对 `MySqlOutboxStore`.包自己的测试运行它们与手工编写的存储 Drizzle, TypeORM 和 Prisma 此外，作为针对接口编写的存储通过它们的证明。

其他包的存储可以存在于其他地方：幂等存储适合 Redis。outbox 的存储不能，因为它的消息必须与数据库中的行一起提交。

#### 在 Postgres 上使用 BullMQ 代替

BullMQ 6 有一个 PostgreSQL 后端，所以问它的作业表是否可以是发件箱是公平的。该软件包对 BullMQ 6.3.x 的研究（通过阅读其发布的代码，而不是实时运行）说：今天不行。

- `Queue.add()` 总是在 BullMQ 自己的连接池上运行，处于自动提交模式。后端接口故意不公开连接或事务类型，因此 `add()` 无法加入插入订单的事务处理。
- 队列本身就是一个 SQL 功能， `bullmq.add_job(...)`.在您自己的事务上调用它将是原子的，但是函数是内部的，它的签名会随着 BullMQ 的模式迁移而变化，每个调用它的事务都将使用 Postgres 的全局 NOTIFY 提交时锁定。
- `@nestjs/bullmq`12.0.0 无法为单个队列选择 Postgres 后端。唯一的方法是 BullMQ 的全流程 `setDefaultBackendFactory()`。

需要的是一个在调用方提供的客户端上运行 `add()` 的上游选项（因此作业与订单一起提交），加上 `@nestjs/bullmq` 中的后端选项。有了这两者，作业表将是发件箱，BullMQ 的工作人员将提供索赔、重试和失败集，中间没有中继。在此之前，使用此 outbox 并从调用 `queue.add(topic, payload)` 的 `OutboxTransport` 发布到 BullMQ，outbox 消息 `id` 作为 `jobId`，因此在作业仍然存在时忽略重新发布的消息。

#### 例子

工作示例可在 [37-发送箱样品](https://github.com/nestjs/nest/tree/master/sample/37-outbox)：订单 API 在 PostgreSQL 上 Drizzle、它的进程处理程序、带有自己数据库的分析微服务、死信管理员 API 以及测试。

#### 参考

##### 模块选项

`OutboxModule.forRoot()` 采取这些选项。 `forRootAsync()` 采取 `transports` 班级， `imports` 和 `isGlobal` 在其顶级水平，其余的来自 `useFactory`, `useClass` 或者 `useExisting` （实现 `OutboxOptionsFactory`），如在 [Register the outbox](/reliability/outbox#register-the-outbox).选项令牌是 `OUTBOX_MODULE_OPTIONS`.存储不是一个选项：将其注册为提供者，如 [Keep messages in your database](/reliability/outbox#keep-messages-in-your-database).持续时间是毫秒，或字符串，如 `'30s'` 和 `'1m'`.

| 选择 | 默认的 | 意义 |
| --- | --- | --- |
| `transports` | 没有一个 | 命名 `OutboxTransport` 类或实例。`local`，这个 `@OnOutboxMessage()` 处理程序，是内置的和保留的 |
| `imports` | 没有一个 | 传输类注入其导出的模块 |
| `route` | 唯一目的地 | `(message) => name`：消息要传送到的传输。需要搬运工和运输机，或多台运输机 |
| `relay.enabled` | `true` | `false` 在只生产或只消费的情况下 |
| `relay.pollInterval` | `'1s'` | 空闲时轮询之间的等待 |
| `relay.batchSize` | `100` | 每个索赔的消息 |
| `relay.lease` | `'30s'` | 索赔的排他性期限有多长 |
| `relay.concurrency` | `10` | 批次内并行发布的关键组 |
| `relay.publishTimeout` | 三分之一 `lease` | 较慢的发布将被视为失败的尝试，并且其 `signal` 流产 |
| `retry.attempts` | `20` | 在消息被拼写之前，包括第一次尝试在内的总尝试。`retry: 5` 表示 5 次尝试；`retry: false`，一次尝试 |
| `retry.backoff` | `'1s'` 加倍至 `'5m'` 等抖动 | 具有 `delay`,`factor`,`maxDelay` 和 `jitter`(`'equal'`,`'full'` 或者 `'none'`），或函数 `(attempt, error, message) => duration` |
| `retry.retryIf` | 每一个错误 | `(error, attempt, message) => boolean`:`false` 死信一下子传达了信息 |
| `allowInMemoryStorage` | `false` | 和 `NODE_ENV=production` 没有注册商店，启动失败；`true` 无论如何都在内存存储中运行 |
| `isGlobal` | `true` | 全局注册模块 |

##### 商店

`new PostgresOutboxStore(options, outboxStorage)`, 从 `@nestjs/outbox/postgres`，和 `new MySqlOutboxStore(options, outboxStorage)`, 从 `@nestjs/outbox/mysql`，采取这些选项。没有 `outboxStorage` 存储不在任何地方注册，这适合脚本或测试。

| 选择 | 默认的 | 意义 |
| --- | --- | --- |
| `executor` | 所需 | 存储如何到达数据库：下面的执行器之一，从与存储相同的入口点。另一种方言不编译 |
| `schema` | `'nest_outbox'` | 在 PostgreSQL 上，它的第一次迁移创建了表的模式：字母、数字和下划线，不以数字开头，最多 63 个字符。在 MySQL 上，连接数据库中表的前缀：小写字母、数字和下划线，不以数字开头，最多 40 个字符 |
| `migrate` | `true`，除了 `NODE_ENV=production` | 在应用程序启动时应用挂起的迁移。和 `false`，启动失败 `OutboxSchemaError` 而模式在后面 |

每个执行器获取您的数据库客户端及其自己类型的事务对象，`outbox.add()` 和 `processInTransaction()` 然后采取：

| 执行人 | 采取 | 交易对象 |
| --- | --- | --- |
| `fromDrizzle(db)` | 一个 Drizzle 数据库：在 PostgreSQL 上，无论它的驱动程序是什么；在 MySQL 上，`mysql2` | 这个 `tx` 那个 `db.transaction()` 递交其回调 |
| `fromTypeOrm(dataSource)` | 一个 `DataSource` 类型 `postgres` 或者 `mysql` | 这个 `EntityManager` 那个 `dataSource.transaction()` 递交其回调，或 `QueryRunner` 之后 `startTransaction()` |
| `fromPrisma(prisma, options)` | 一个 Prisma 客户端，通过驱动程序适配器，例如 `@prisma/adapter-pg`, 或 `@prisma/adapter-mariadb` 对于 MySQL。`maxWait`（默认 `'10s'`）和 `timeout`（默认 `'1m'`) 限制商店自己的交易 | 事务客户端 `prisma.$transaction()` 递交其回调 |
| `fromKysely(db)` | 一个 `Kysely` 使用 PostgreSQL 或 MySQL 方言的实例 | 交易 `db.transaction().execute()` 递交其回调 |
| `fromPg(pool)` | PostgreSQL：一个节点-postgres`Pool`，或连接的 `Client` | 客户，如来自 `pool.connect()`, 之后 `BEGIN` |
| `fromMysql2(pool)` | MySQL：a`mysql2/promise` 池或连接 | 连接，如来自 `pool.getConnection()`, 之后 `beginTransaction()` |

商店的 `migrate()` 方法立即应用挂起的迁移，无论 `migrate` 选项说，并根据应用的版本进行解析。静态 `migrationSql()` 返回他们的 SQL，与簿记，和 `MySqlOutboxStore.migrationStatements()` 返回相同的语句，每个字符串一个。他们采取 `schema`，要去的版本 `from`（默认 `0`，一个新数据库）和 `to`（默认值：包需要的那个），以及 `migrationSql()` 采取 `statementBreakpoints` 也。从 PostgreSQL 的版本 0 开始，SQL 开始于 `CREATE SCHEMA IF NOT EXISTS`，这需要 CREATE 数据库权限：如果有人为您创建了模式，请将其排除在外。静态的 `schemaVersion` 是软件包需要的版本。

命令行 `npx @nestjs/outbox` 采用 `--url`（默认值 `DATABASE_URL`）和 `--schema`（默认值 `nest_outbox`）。A `mysql://` URL 选择 `MySqlOutboxStore` 的迁移，并需要安装 `mysql2`：

| 命令 | 它的作用 |
| --- | --- |
| `migrate` | 应用挂起的迁移，如 `migrate: true` 启动时做 |
| `status` | 打印模式的版本和包需要的版本，并在模式落后时以 1 退出 |
| `sql` | 打印 `migrationSql()` 的 SQL，从 `--from` 到 `--to`，不带数据库：PostgreSQL，或带有 `--dialect mysql` 的 MySQL。`--statement-breakpoints` 分离 drizzle-kit 自定义迁移的语句 |

在 MySQL 上，商店需要 MySQL 8.4LTS 或 9.x 带有严格的 `sql_mode`，MySQL 的默认值：松懈 `sql_mode`，或 MariaDB，启动失败。

##### 消息和处理程序

传递给 `outbox.add(tx, message)`([Save the order and its messages in one transaction](/reliability/outbox#save-the-order-and-its-messages-in-one-transaction)）有以下字段：

| 领域 | 所需 | 意义 |
| --- | --- | --- |
| `topic` | 是的 | 什么 `route` 处理程序匹配 |
| `payload` | 是的 | 序列化到 JSON 何时 `add()` 运行 |
| `key` | 不是 | 排序键：共享它的消息按提交顺序一次发布一条 |
| `headers` | 不是 | 字符串头，传递给传输 |
| `id` | 不是 | 你自己的唯一 id。默认值是 UUIDv7；消费者通过 it 进行重复数据删除 |
| `delay` 或者 `availableAt` | 不是 | 从现在起不得早于这个时间点，也不得早于这个时间点。两者都不是 |

- `@OnOutboxMessage(topic, options)` 采取 `consumer`（必填：处理程序收件箱的名称）和 `inbox`（默认 `true`;`false` 运行每次交付）。[Handle order.placed in-process](/reliability/outbox#handle-orderplaced-in-process)
- 处理程序的上下文有 `message`、`consumer`、`attempt`、`signal` 和 `processInTransaction(tx, work)`。
- `ClientProxyTransport(token, options)` 用信封发出主题 `id`, `topic`, `key`, `headers`, `createdAt` 和 `payload` (`OutboxEnvelope`).它的 `toPacket(message, envelope)` 选项返回您自己的 `pattern` 和 `data`. [Publish to the analytics microservice](/reliability/outbox#publish-to-the-analytics-microservice)

##### 服务

| 服务 | 方法 |
| --- | --- |
| `Outbox` | `add(tx, messages)`,`notify()` |
| `OutboxRelay` | `stats()`:`pending`,`ready`,`leased`,`deadLetters`,`oldestDueAt`,`lagMs`,`inFlight`.`runOnce()`:`claimed`,`published`,`retried`,`deadLettered`,`released`,`leaseLost`.还有 `notify()`、`start()` 和 `stop()` |
| `OutboxDeadLetters` | `list(query)`（按 `topic`、`key`、`limit`、`offset`；以最新为准）、`get(id)`、`requeue(target)`、`purge(target)`。目标是 id、id 数组或由 `ids`、`topic`、`key`、`failedBefore` 或 `all: true` 筛选的过滤器。[Retries and the dead-letter queue](/reliability/outbox#retries-and-the-dead-letter-queue) |
| `OutboxInbox` | `process(consumer, id, work)`,`processInTransaction(tx, consumer, id, work)`,`prune(olderThan)`.当 `work` 运行时，两种 `process` 方法都会解析 `duplicate` 和 `result` |

##### 事件

`OutboxEvents.events$` 发出每个事件，并将其发布到其 `node:diagnostics_channel` 渠道。每个有效载荷都有 `type` 和 `message`. [Run several instances](/reliability/outbox#run-several-instances) 数一数。捕捉订阅者内部的错误：RxJS 和 `diagnostics_channel` 两者都将订户的错误作为未捕获的异常重新抛出。

| 事件 | 渠道 | 其他领域 | 何时 |
| --- | --- | --- | --- |
| `published` | `nestjs:outbox:published` | `transport`,`durationMs` | 传输已接受该消息 |
| `retry-scheduled` | `nestjs:outbox:retry-scheduled` | `transport`,`error`,`attempt`,`delayMs` | 发布失败，将重试 |
| `dead-lettered` | `nestjs:outbox:dead-lettered` | `transport`,`error`,`attempt`,`reason` | 信息转移到了死信上。警惕它 |
| `lease-lost` | `nestjs:outbox:lease-lost` | 没有一个 | 另一个中继在发布中途接收消息，因此可能会发布两次 |

死信的 `reason` 是 `exhausted`（重试用完）或 `rejected`（一个 `NonRetryableMessageError` 或 `retryIf` 返回 `false`）。

##### 错误

他们都没有携带 HTTP 状况。`OutboxError` 是包抛出的四个中的基类。

| 错误 | 抚养时间 |
| --- | --- |
| `OutboxTransactionRequiredError` | `add()` 或者 `processInTransaction()` 没有事务句柄，或者商店拒绝了不是事务的句柄 |
| `OutboxPublishTimeoutError` | 发布已过期 `relay.publishTimeout`（`timeoutMs`）。算作失败的尝试 |
| `OutboxNoHandlerError` | 此进程中的主题没有 `@OnOutboxMessage()` 处理程序（`topic`）。重试 |
| `OutboxSchemaError` | 存储的模式是包迁移的后面，而 `migrate` 已关闭，或应用它们失败（`cause`)：启动，每次调用都会失败，直到修复为止。与 `schema`,它的 `version` 和 `requiredVersion`.从 `@nestjs/outbox/postgres` 和 `@nestjs/outbox/mysql` |
| `NonRetryableMessageError` | 您将它从处理程序或传输中丢弃到死信，而无需重试 |
