# Webhooks

Source: https://docs.nestjs.com/http/webhooks

一家销售猫粮和用品的在线商店通过其销售给猫收容所和批量购买的经销商 API. Northside Pet Supplies 是一家经销商，下了订单，想知道订单何时发货，何时取消，而无需投票：一个连接到其仓库系统的网络钩子。商店也接收 webhooks：支付提供者报告付款，运营商报告发货。两个方向看起来都很简单，但都以相同的方式出错：

- **发送。**一个 `fetch()` 当进程在中间死亡时，订单提交丢失，并被发送给事务，然后回滚。重试会在不告诉合作伙伴的情况下两次发送相同的事件。每个合作伙伴为自制签名编写自己的验证器。一个倒下一个小时的合作伙伴被锤打，一个死端点永远不会关闭，没有人能回答“是你发的吗？”.和 URL 类型的合作伙伴是等待发生的服务器端请求伪造：`https://169.254.169.254/` 使用云凭据回答。
- **正在接收。**签名在框架解析并再次序列化的主体上进行检查（散乱的空格会破坏它，篡改的主体可以通过），与 `===` 而不是在恒定时间，没有时间戳窗口，重新交付事件运行处理程序两次：标记为两次支付的订单或两次发货的订单。

`@nestjs/webhooks` 使两个方向都是一个配置。传出的 webhooks 通过 [发件箱](/reliability/outbox):`webhooks.dispatch()` 将消息添加到与订单相同的事务中，并在提交后由工作人员将其发送到合作伙伴的端点，并在每个请求上签名 [Standard Webhooks](https://www.standardwebhooks.com) 指定，回退大约两天的重试，记录每次尝试，并根据要求重播。传入的 webhooks 是一个装饰器，`@VerifyWebhook()`，它检查原始主体上的签名并跳过重新传递。

在本教程中，您将在 PostgreSQL 上使用 Drizzle 将 webhooks 添加到商店订单 API 中：

- 合作伙伴订阅 `order.shipped` 和 `order.cancelled` 通过 API 看看他们的秘密。
- 这个 API 提交后发送 webhooks，签名，并在合作伙伴关闭时重试。
- 合作伙伴阅读他们的交付日志，并要求重播。
- 这个 API 接收支付提供者的支付 webhooks（标准 webhooks）和承运人的装运 webhooks（Stripe 的方案），在原始主体上验证并精确处理一次。
- 秘密没有间隙地旋转，URL 商店网络内的积分被拒绝。

#### 安装

要开始，请安装所需的依赖项：

```bash
$ npm i --save @nestjs/webhooks
```

本教程在 PostgreSQL 上运行，通过 [Drizzle ORM](https://orm.drizzle.team) 和 [`@nestjs/drizzle`](/data/drizzle) 与 `pg` 驱动程序：端点和交付日志驻留在订单驻留的数据库中，驻留在比应用程序的任何实例寿命都长的数据库服务器上。使用 TypeORM，还是 MySQL？按照教程操作，并参见“使用 TypeORM”和“使用 MySQL”[Keep webhooks in your database](/http/webhooks#keep-webhooks-in-your-database) 为了什么变化。

传出的 webhooks 是发件箱消息，传入的 webhooks 用发件箱的收件箱进行重复数据删除，因此应用程序也运行发件箱（`@nestjs/outbox`，在 [发件箱教程](/reliability/outbox) 中安装和设置）。

示例应用程序，在线商店的订单 API，将其目录、调用它的合作伙伴以及他们的订单保存在自己的三个表格中，供后面的部分读取和写入。它们是示例的数据，而不是 webhooks 需要的：webhooks 和 outbox 的表属于它们的存储，这些存储创建了它们，如 [Keep webhooks in your database](/http/webhooks#keep-webhooks-in-your-database) 显示。

`products` 是目录：

| 柱子 | 类型 | 附注 |
| --- | --- | --- |
| `id` | `text` | 主键，例如 `salmon-kibble-2kg` |
| `name` | `text` | 显示名称，例如 `Salmon kibble, 2 kg` |
| `price` | `integer` | 以美分计 |

`partners` 持有大量购买的猫收容所和经销商 API，并接收其 webhooks：

| 柱子 | 类型 | 附注 |
| --- | --- | --- |
| `id` | `text` | 主键，例如 `northside` |
| `name` | `text` | 显示名称，例如 `Northside Pet Supplies` |
| `api_key_hash` | `text` | 这个 SHA-256 个合作伙伴 API 钥匙，十六进制。独特的 |

`orders` 持有合伙人的订单，其 `status` 从 `placed` 到 `paid` 和 `shipped`，或 `cancelled`：

| 柱子 | 类型 | 附注 |
| --- | --- | --- |
| `id` | `text` | 主键 |
| `partner_id` | `text` | 参考资料 `partners.id` |
| `items` | `jsonb` | 订单的行，作为 JSON 数组：每一行的 `productId`,`quantity` 和单位 `price`（美分） |
| `total` | `integer` | 以美分计 |
| `status` | `text` | `placed`,`paid`,`shipped` 或者 `cancelled` |
| `payment_id` | `text` | Nullable：在订单付款时设置 |
| `tracking_number` | `text` | Nullable：在订单发货时设置 |

其他列不可为空。

目录有两个产品，`salmon-kibble-2kg`2499 美分和 `clumping-litter-10l`1599 美分，两个合伙人有样品 API 密钥（从您的合作伙伴入职时发出真实的密钥）：

| 伙伴 | `id` | API 钥匙 |
| --- | --- | --- |
| Northside Pet Supplies，经销商 | `northside` | `partner_northside_7c1d2e` |
| 河边猫收容所 | `riverside` | `partner_riverside_91ab44` |

#### 在数据库中保留 webhooks

无需为 webhooks 或它们所经过的发件箱创建任何内容：没有表、实体或 Prisma 模型。注册他们的两个存储，每个存储创建自己的模式，`nest_webhooks` 和 `nest_outbox`，并迁移它：在开发和测试启动时，以及在生产中 `npx @nestjs/webhooks migrate` 和 `npx @nestjs/outbox migrate`，或与他们的 `migrationSql()` 在你自己的迁移中。

包将端点及其机密、它发送的消息、它们的交付和每次尝试的日志保存在**存储**中，包通过两个合同读取这些日志， `WebhookEndpointStore` 和 `WebhookDeliveryStore`.在您注册一个之前，模块会将它们保留在内存中：第一次运行没问题，但重新启动会丢失每个待处理的传递，并且两个实例不会共享它们。

> warning **Warning** 使用 `NODE_ENV=production` 并且没有注册存储，启动失败，除非您设置了 `allowInMemoryStorage: true`。

在 PostgreSQL 上，注册包的存储， `PostgresWebhookStore` 来自 `@nestjs/webhooks/postgres`.发件箱也需要一个，用于从事务中携带调度的 webhooks 的邮件，以及用于对传入邮件进行重复数据删除的收件箱： `PostgresOutboxStore` 来自 `@nestjs/outbox/postgres`,如在 [发件箱教程](/reliability/outbox#keep-messages-in-your-database).两人都经营自己的 SQL 通过您的应用程序已经拥有的数据库客户端，并将它们的表保留在它们自己的模式中。它们是普通的提供者，在根模块中注册过一次，旁边是 `WebhooksModule` 和 `OutboxModule`：所有四个都是广泛应用的。 `AppModule` 创建每个工厂，注入 Drizzle 数据库及其包的存储注册表，存储通过该注册表注册自己：

```typescript
{
  // Outbox messages and the inbox, in your database, in a schema of their own (nest_outbox)
  provide: PostgresOutboxStore,
  inject: [getDrizzleToken(), OutboxStorage],
  useFactory: (db: Database, outboxStorage: OutboxStorage) =>
    new PostgresOutboxStore({ executor: fromDrizzle(db) }, outboxStorage),
},
{
  // Endpoints, deliveries and their log, in your database, in a schema of their own (nest_webhooks)
  provide: PostgresWebhookStore,
  inject: [getDrizzleToken(), WebhooksStorage],
  useFactory: (db: Database, webhooksStorage: WebhooksStorage) =>
    new PostgresWebhookStore({ executor: fromDrizzle(db) }, webhooksStorage),
},
```

`fromDrizzle(db)` 是商店的**执行者**：它通过您的 Drizzle 数据库，无论它使用哪个驱动程序，例如 `pg` 或者 PGlite。`fromPg(pool)`,`fromTypeOrm(dataSource)`,`fromPrisma(prisma)` 和 `fromKysely(db)` 对 node-postgres 池执行相同的操作，TypeORM,Prisma 还有疑问。`@nestjs/webhooks/postgres` 和 `@nestjs/outbox/postgres` 两者都出口它们，所以 `AppModule` 进口 `fromDrizzle` 一次，两家商店。在启动时，每个模块都会记录它使用的存储。

**模式。**webhook 存储将其表保存在自己的模式中，`nest_webhooks`（`schema` 选项命名另一个）。在没有模式的 MySQL 上，它们是连接数据库的表，模式的名称作为前缀：`nest_webhooks_endpoints` 等等。

| 桌子 | 它持有什么 |
| --- | --- |
| `nest_webhooks.endpoints` | 合作伙伴的终点：URL、事件类型、租户和秘密 |
| `nest_webhooks.messages` | 逐字节分派了什么 |
| `nest_webhooks.deliveries` | 每个消息和端点一个，包含其状态、尝试和租赁 |
| `nest_webhooks.delivery_attempts` | 日志：每次尝试，包括状态代码、响应和时间 |
| `nest_webhooks.migrations` | 应用的存储模式版本 |

发件箱的存储将其邮件、死信和收件箱保存在 `nest_outbox` (`nest_outbox_messages` 等等，在 MySQL 上），如在 [发件箱教程](/reliability/outbox#keep-messages-in-your-database).它们属于存储：您的迁移不会创建它们，您自己的表也不能与它们冲突。其中的几个选择对软件包很重要：

- 端点的秘密是 JSON 数组，最新的优先：在旋转期间，旧的秘密会保留重叠，并有一个过期日期。和 `encryption` 已配置（参见 [Register the modules](/http/webhooks#register-the-modules))，存储的是密封的。
- 一条消息的 `body` 是 `text`,不 `jsonb`.这是准确的 JSON 签字发送了， `jsonb` 将重新格式化它：存储请求及其签名的合作伙伴不能再验证重播。
- 每个消息和端点的传递都是唯一的。创建投递的扇出在提交后在发件箱内运行，因此它可以运行两次；唯一键使第二次运行不插入任何内容。
- 没有从交付到其端点的外键：已删除端点的日志保留。尝试伴随着他们的交付。
- 时间是历元毫秒（`bigint`），来自包的时钟，而不是数据库的时钟。

**迁移。**软件包将其模式作为版本迁移发送，存储本身应用它们。使用 `migrate` 选项，在中继和工作程序运行之前，每个实例都会在一个持有咨询锁的事务中应用其模式在启动时尚未拥有的内容：在一起启动的几个实例中，一个实例迁移，而其他实例则无事可做。`migrate` 默认为 `true`，但 `NODE_ENV=production` 除外。因此，在开发和测试中，存储在一开始就创建它们的模式，而您的迁移只创建您自己的表。

在生产中，在应用程序的新版本开始之前应用迁移，就像应用您自己的迁移一样，这样就不会有实例在启动时更改模式：在滚动部署的中间，这将锁定繁忙的表，而权限最低的数据库用户无论如何都不能这样做。包的命令行从部署步骤 `npx drizzle-kit migrate` 旁边执行此操作。它们从 `DATABASE_URL` 或 `--url` 读取数据库，需要安装 `pg`：

```bash
$ npx @nestjs/webhooks status
Schema "nest_webhooks" is at version 0; this version of @nestjs/webhooks needs version 1.
$ npx @nestjs/webhooks migrate
Migrated schema "nest_webhooks" to version 1 (applied 1).
$ npx @nestjs/outbox migrate
Migrated schema "nest_outbox" to version 1 (applied 1).
```

当模式落后时，`status` 退出为 1，这使它成为对 CI 的检查。要使用您自己的迁移工具应用迁移，请从 `npx @nestjs/webhooks sql` 和 `npx @nestjs/outbox sql` 或 `PostgresWebhookStore.migrationSql()` 和 `PostgresOutboxStore.migrationSql()` 中获取它们的 SQL 代码：每个迁移的语句，以及记录版本的簿记。在一个事务中运行每个事务，就像 TypeORM 和 Drizzle 的迁移程序一样。使用 TypeORM，这是您自己的迁移，旁边是它为您的实体生成的迁移：

```typescript
import { PostgresOutboxStore } from '@nestjs/outbox/postgres';
import { PostgresWebhookStore } from '@nestjs/webhooks/postgres';
import type { MigrationInterface, QueryRunner } from 'typeorm';

export class WebhookStores1790801311590 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(PostgresOutboxStore.migrationSql());
    await queryRunner.query(PostgresWebhookStore.migrationSql());
  }

  async down(): Promise<void> {
    throw new Error('The webhook and outbox stores have no down migrations.');
  }
}
```

使用 drizzle-kit，为每个存储创建一个自定义迁移，并用其 SQL, 一个 `--> statement-breakpoint` 语句之间的行：Drizzle 的迁移器然后一次运行一个，这是 PGlite 所要求的。在代码中，`migrationSql()` 和 `statementBreakpoints: true` 返回相同。

```bash
$ npx drizzle-kit generate --custom --name=outbox
$ npx @nestjs/outbox sql --statement-breakpoints > drizzle/0002_outbox.sql
$ npx drizzle-kit generate --custom --name=webhooks
$ npx @nestjs/webhooks sql --statement-breakpoints > drizzle/0003_webhooks.sql
```

在 MySQL 上，商店 `migrationStatements()` 每个字符串返回一个语句，TypeORM 迁移每个调用运行一个：

```typescript
for (const statement of [...MySqlOutboxStore.migrationStatements(), ...MySqlWebhookStore.migrationStatements()]) {
  await queryRunner.query(statement);
}
```

和 `migrate` 关闭，模式背后的存储会使启动失败 `WebhookSchemaError`（发件箱的商店，有一个 `OutboxSchemaError`）命名这三种方式，并以相同的方式失败每个调用，直到模式赶上，它注意到这一点而无需重新启动。在滚动部署期间，应用程序的先前版本将继续在新版本迁移的模式上运行。没有向下迁移。

**交易。** webhook store 的任何方法都不会处理您的交易。`webhooks.dispatch(tx, ...)` 通过 outbox 的存储将邮件添加到事务处理中的 outbox，以及 `webhook.processInTransaction(tx, ...)` 以同样的方式在发件箱的收件箱中记录一个传入的 webhook；提交后的扇出、worker 和其他一切都在商店自己的连接上运行。和 Drizzle,`tx` 是什么 `db.transaction()` 如下一节所示，发出回调。outbox 的存储拒绝数据库本身，数据库的语句将自行提交 `OutboxTransactionRequiredError` 上面写着要传递什么。与其他执行器一起，在之后传递 node-postgres 客户端 `BEGIN`（不是泳池），TypeORM 的 `EntityManager` 来自 `dataSource.transaction()`,Prisma 的交互式事务客户端，或 Kysely 事务。

**隔离。**商店依赖 READCOMMITTEDPostgreSQL 的默认隔离级别：它们的语句相互竞争，在更严格的级别下，它们会出现序列化错误。在启动时，每个检查数据库的 `default_transaction_isolation`，如果更严格，就会失败。您自己的事务可以在任何级别运行。在下面 REPEATABLEREAD 或者 SERIALIZABLE 但是，一个传入的 webhook 的副本 `processInTransaction()` 事务中的句柄，与第一个提交竞争，由于 PostgreSQL 的序列化错误而失败，而不是作为重复项被跳过：发送者得到一个错误，它的重试发现 webhook 被记录了。

**与 TypeORM。** `TypeOrmModule` 取代了 `AppModule` 中的 `DrizzleModule`，两个存储都在其提供的 `DataSource` 上运行，直到 `fromTypeOrm()`：

```typescript
{
  // Outbox messages and the inbox, in your database, in a schema of their own (nest_outbox)
  provide: PostgresOutboxStore,
  inject: [DataSource, OutboxStorage],
  useFactory: (dataSource: DataSource, outboxStorage: OutboxStorage) =>
    new PostgresOutboxStore({ executor: fromTypeOrm(dataSource) }, outboxStorage),
},
{
  // Endpoints, deliveries and their log, in your database, in a schema of their own (nest_webhooks)
  provide: PostgresWebhookStore,
  inject: [DataSource, WebhooksStorage],
  useFactory: (dataSource: DataSource, webhooksStorage: WebhooksStorage) =>
    new PostgresWebhookStore({ executor: fromTypeOrm(dataSource) }, webhooksStorage),
},
```

在教程将 Drizzle 的 `tx` 传递给 `dispatch()` 和 `processInTransaction()` 的地方，传递 `dataSource.transaction()` 回调的 `EntityManager`，并注入 `Webhooks<EntityManager>`。outbox 的存储拒绝 `dataSource.manager`，其写入将自行提交。这是订单服务的 `cancelOrder()`，来自 [Send order.shipped and order.cancelled after the commit](/http/webhooks#send-ordershipped-and-ordercancelled-after-the-commit)，带有 TypeORM：

```typescript
const order = await this.dataSource.transaction(async (manager) => {
  const row = await manager.findOne(OrderEntity, { where: { id, partnerId: partner.id }, lock: { mode: 'pessimistic_write' } });
  if (!row) {
    throw new NotFoundException(`Order ${id} not found`);
  }
  if (row.status === 'shipped' || row.status === 'cancelled') {
    throw new ConflictException(`Order ${id} is ${row.status}`);
  }
  await manager.update(OrderEntity, id, { status: 'cancelled' });

  // The transaction's EntityManager: the webhook is sent only if the cancellation commits.
  const data: OrderCancelled = { orderId: id, reason };
  await this.webhooks.dispatch(manager, { type: 'order.cancelled', tenant: row.partnerId, data });
  return { ...row, status: 'cancelled' as const };
});
```

您的实体及其迁移保持原样：`migration:generate` 仅将实体与数据库进行比较，而不考虑存储模式。

**对于 MySQL 8.4 或 9.x 上的 MySQL.**，请从 `@nestjs/outbox/mysql` 和 `@nestjs/webhooks/mysql` 导入存储和执行器。提供程序是相同的，在 `drizzle-orm/mysql2` 的 Drizzle 数据库上有 `MySqlOutboxStore` 和 `MySqlWebhookStore`：

```typescript
import { MySqlOutboxStore } from '@nestjs/outbox/mysql';
import { fromDrizzle, MySqlWebhookStore } from '@nestjs/webhooks/mysql';
import { drizzle } from 'drizzle-orm/mysql2';
// ...
DrizzleModule.forRootAsync({
  // Drizzle on MySQL: a mysql2 pool on DATABASE_URL (mysql://), whose database holds the stores' tables too
  useFactory: () => ({ drizzle, connection: process.env.DATABASE_URL! }),
}),
// ...
{
  // Outbox messages and the inbox, in your database, in tables of their own (nest_outbox_*)
  provide: MySqlOutboxStore,
  inject: [getDrizzleToken(), OutboxStorage],
  useFactory: (db: Database, outboxStorage: OutboxStorage) =>
    new MySqlOutboxStore({ executor: fromDrizzle(db) }, outboxStorage),
},
{
  // Endpoints, deliveries and their log, in your database, in tables of their own (nest_webhooks_*)
  provide: MySqlWebhookStore,
  inject: [getDrizzleToken(), WebhooksStorage],
  useFactory: (db: Database, webhooksStorage: WebhooksStorage) =>
    new MySqlWebhookStore({ executor: fromDrizzle(db) }, webhooksStorage),
},
```

对于其他客户，遗嘱执行人是 `fromMysql2(pool)` 对于一个 `mysql2/promise` 池， `fromTypeOrm(dataSource)` 对于一个 `DataSource` 类型 `mysql`, `fromPrisma(prisma)` 为了 Prisma 通过 `@prisma/adapter-mariadb`, 或 `fromKysely(db)` 对于 Kysely 的 `MysqlDialect`.与 PostgreSQL 的不同之处：

- **表，而不是模式。** MySQL 数据库中没有模式，因此存储库将表保存在连接的数据库中，而连接的数据库中的表 URL 你的路旁边，`schema` 成为他们的前缀：`nest_webhooks_endpoints`,`nest_webhooks_deliveries` 等等，等等 `nest_outbox_messages` 发件箱。它使用小写字母、数字和下划线，最多 40 个字符。
- **您的交易。**`dispatch()` 和 `processInTransaction()` 工作于 REPEATABLEREADMySQL 的默认值，如 READCOMMITTED：没有什么需要配置的，存储不会检查数据库的默认值。当 MySQL 打破事务中的死锁（错误 1213）时，它会回滚整个事务，客户端的错误到达您的代码：再次运行事务。商店再次自己进行交易。和 `processInTransaction()` 当一个 webhook 的副本同时到达，而第一个 webhook 的事务回滚时，就会发生这种情况：发送者得到一个错误，它的重试通过。
- **键是有界的。** ID 和租户是索引列：最多 255 个字符，租户为 256 个字符，其中包本身的 ID 及其限制 `tenant` 待在里面。传入的 webhook 的 id 会进入收件箱的密钥，最多也有 255 个字符，在处理程序运行之前，验证器会拒绝每个数据库上更长的 id，使用 401。
- **迁移不是一个事务。**MySQL 提交每个事务 DDL 声明本身，所以 `migrate` 在锁下一次应用一个语句（`GET_LOCK()`），失败的运行在它停止的语句处继续。您自己的工具也必须每次调用发送一条语句，因为 TypeORM 上面**迁移**中的迁移确实如此。命令行采用 `mysql://`URL，和 `sql --dialect mysql` 打印 MySQLSQL：添加 `--statement-breakpoints` 对于 drizzle-kit 自定义迁移，因为它的 MySQL 迁移器每个断点发送一条语句。
- **服务器。**存储在启动时检查它，并拒绝 MariaDB（一个没有数据库的连接）和 `sql_mode` 这并不严格（MySQL 的默认值是）。保持 `NO_BACKSLASH_ESCAPES` 也出去了。

对于另一个数据库，编写您自己的存储：[The store contract](/http/webhooks#the-store-contract) 说它必须做什么。

#### 注册模块

登记 `OutboxModule` 和 `WebhooksModule` 在根模块中，旁边 `DrizzleModule`，它注册 Drizzle 数据库，其中两个存储都在其 `providers`.功能模块在以下部分中构建：

```typescript
import { Module } from '@nestjs/common';
import { DrizzleModule, getDrizzleToken } from '@nestjs/drizzle';
import { OutboxModule, OutboxStorage } from '@nestjs/outbox';
import { PostgresOutboxStore } from '@nestjs/outbox/postgres';
import { WebhooksModule, WebhooksStorage } from '@nestjs/webhooks';
import { fromDrizzle, PostgresWebhookStore } from '@nestjs/webhooks/postgres';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { Database } from './database/drizzle.js';
import * as schema from './database/schema.js';
import { OrdersModule } from './orders/orders.module.js';
import { PartnerWebhooksModule } from './partner-webhooks/partner-webhooks.module.js';

@Module({
  imports: [
    // A pg pool on DATABASE_URL, closed in onApplicationShutdown(), after the relay and the
    // worker drained. The services inject it with @InjectDrizzle(), the stores' factories too.
    DrizzleModule.forRootAsync({
      useFactory: () => ({ drizzle, connection: process.env.DATABASE_URL!, schema }),
    }),
    // Outgoing webhooks travel through the outbox: dispatched in the order's transaction,
    // handed to the webhooks worker after the commit.
    OutboxModule.forRootAsync({
      useFactory: () => ({
        relay: { enabled: process.env.OUTBOX_RELAY !== 'off', pollInterval: '1s' },
      }),
    }),
    WebhooksModule.forRootAsync({
      useFactory: () => ({
        // The types partners may subscribe to; dispatch() refuses any other.
        eventTypes: ['order.shipped', 'order.cancelled'],
        // Ten attempts: 5s, 20s, 80s, ... capped at a day, about two days in all.
        retry: { attempts: 10, backoff: { delay: '5s', factor: 4, maxDelay: '1d' } },
        // An endpoint that fails every attempt for five days is switched off.
        disableEndpointAfter: '5d',
        delivery: {
          timeout: '15s',
          // Development only: deliver over http:// and to this machine. Without it, only
          // public https:// endpoints are accepted.
          allowHttp: process.env.WEBHOOKS_ALLOW_LOCAL === '1',
          allowPrivateNetworks: process.env.WEBHOOKS_ALLOW_LOCAL === '1',
        },
        worker: { enabled: process.env.WEBHOOKS_WORKER !== 'off', pollInterval: '1s' },
        // Endpoint secrets at rest: the first key encrypts, every key decrypts.
        encryption: process.env.WEBHOOKS_ENCRYPTION_KEYS
          ? { keys: process.env.WEBHOOKS_ENCRYPTION_KEYS.split(',').map((key) => key.trim()) }
          : undefined,
      }),
    }),
    OrdersModule,
    PartnerWebhooksModule,
  ],
  providers: [
    {
      // Outbox messages and the inbox, in your database, in a schema of their own (nest_outbox)
      provide: PostgresOutboxStore,
      inject: [getDrizzleToken(), OutboxStorage],
      useFactory: (db: Database, outboxStorage: OutboxStorage) =>
        new PostgresOutboxStore({ executor: fromDrizzle(db) }, outboxStorage),
    },
    {
      // Endpoints, deliveries and their log, in your database, in a schema of their own (nest_webhooks)
      provide: PostgresWebhookStore,
      inject: [getDrizzleToken(), WebhooksStorage],
      useFactory: (db: Database, webhooksStorage: WebhooksStorage) =>
        new PostgresWebhookStore({ executor: fromDrizzle(db) }, webhooksStorage),
    },
  ],
})
export class AppModule {}
```

`WebhooksModule` 需要发件箱：`dispatch()` 是一个 `Outbox.add()`，将提交的消息转换为传递的扇出器是发件箱处理程序。没有 `OutboxModule`，启动失败并这样说。发件箱的 `relay` 将提交的消息发送给扇出，每秒轮询一次，并且 `OUTBOX_RELAY=off` 关掉它。其余选项，在应用程序启动时解决：

- `eventTypes`：此应用程序发送的消息类型。`dispatch()` 拒绝任何其他端点，以及尝试订阅消息中已知类型的端点。
- `retry`：与发件箱共享的词汇，HTTP 客户和弹性。十次尝试，以及从 5 秒开始的回退，增长四倍，并以一天为上限，并伴有抖动：标准 Webhooks 规范推荐的，“跨越多天的重试时间表”。
- `disableEndpointAfter`：连续五天每次尝试都失败且没有一次成功的端点将被关闭，并通知其所有者（参见 [Retries, the delivery log and replay](/http/webhooks#retries-the-delivery-log-and-replay)）。
- `delivery`：一次尝试有 15 秒 DNS，连接，TLS、请求和响应。`allowHttp` 和 `allowPrivateNetworks` 默认情况下关闭：仅限公共 `https://` 接受端点。`WEBHOOKS_ALLOW_LOCAL=1` 在开发中打开它们，其中合作伙伴的接收器在这台机器上运行。即便如此，云元数据地址仍会被阻止。
- `worker`：后台传递器，每个进程一个。`WEBHOOKS_WORKER=off` 在仅服务于 API 的实例中关闭它。
- `encryption`：静止时密封的端点秘密，具有家族形状：第一个密钥加密，每个密钥解密。可选，来自 `WEBHOOKS_ENCRYPTION_KEYS`。

> info **Hint** 教程中写道 `process.env` 直接，长话短说。在应用程序中，通过 [`@nestjs/config`](/application/configuration) 使用验证模式，因此缺少的变量会在启动时而不是在第一个请求时停止应用程序，并从 `ConfigService`(`inject: [ConfigService]` 在工厂）。

持续时间是毫秒或字符串，如 `'15s'` 和 `'5d'`。这两个模块都是全局的：`Webhooks`、`WebhookEndpoints`、`WebhookDeliveries`、`WebhooksEvents` 和 `WebhooksStorage` 可以注入到任何地方。`main.ts` 绑定合作伙伴 API 的 DTO 的验证管道（参见下一节），并启用关机挂钩，因此部署允许中继器和工作人员完成飞行中工作：

```typescript
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // The partner API's DTOs; whitelist: properties without a decorator are dropped.
  app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
  // On SIGTERM the outbox relay and the webhook worker finish what they started.
  app.enableShutdownHooks();
  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
```

在启动时，两个模块都会记录它们使用的存储，并且在第一次启动时，存储会记录它们创建的模式：

```bash
[Nest] 55905  - 09/30/2026, 6:52:36 PM     LOG [OutboxModule] OutboxStorage: PostgresOutboxStore
[Nest] 55905  - 09/30/2026, 6:52:36 PM     LOG [WebhooksModule] WebhooksStorage: PostgresWebhookStore
[Nest] 55905  - 09/30/2026, 6:52:36 PM     LOG [OutboxModule] PostgresOutboxStore: migrated schema "nest_outbox" to version 1.
[Nest] 55905  - 09/30/2026, 6:52:36 PM     LOG [WebhooksModule] PostgresWebhookStore: migrated schema "nest_webhooks" to version 1.
```

#### 让合作伙伴订阅

收容所和经销商使用 API 密钥调用合作伙伴 API：该示例的两个合作伙伴，Northside Pet Supplies（一家经销商）和 Riverside Cat Shelter，在 [Installation](/http/webhooks#installation) 中有样本密钥。`PartnerGuard` 查找密钥的散列并设置请求上的合作伙伴，`@CurrentPartner()` 读取它：

```typescript
import {
  createParamDecorator,
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { eq } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import type { Database } from '../database/drizzle.js';
import { partners } from '../database/schema.js';

export interface Partner {
  id: string;
  name: string;
}

/** Authenticates a partner by its API key: `Authorization: Bearer <key>`. */
@Injectable()
export class PartnerGuard implements CanActivate {
  constructor(@InjectDrizzle() private readonly db: Database) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{ headers: Record<string, string>; partner?: Partner }>();
    const key = /^Bearer (\S+)$/.exec(request.headers.authorization ?? '')?.[1];
    if (!key) {
      throw new UnauthorizedException();
    }
    const hash = createHash('sha256').update(key).digest('hex');
    const [partner] = await this.db
      .select({ id: partners.id, name: partners.name })
      .from(partners)
      .where(eq(partners.apiKeyHash, hash));
    if (!partner) {
      throw new UnauthorizedException();
    }
    request.partner = partner;
    return true;
  }
}

/** The partner `PartnerGuard` authenticated. */
export const CurrentPartner = createParamDecorator(
  (_data: unknown, context: ExecutionContext) => context.switchToHttp().getRequest<{ partner: Partner }>().partner,
);
```

订阅是 URL、要接收的事件类型和描述；更新只发送更改。DTO 检查形状，然后离开 URL 以及包的类型，它知道它接受什么。请求主体使用应用程序已经使用的任何内容进行验证：每个 DTO 在这个页面上出现两次，作为一个类 `class-validator` 装饰者和作为 Zod 模式，因此选择您拥有的样式并跳过其他列表：

```typescript
import { IsArray, IsBoolean, IsOptional, IsString } from 'class-validator';

/** Body of `POST /partner/webhook-endpoints`. The package checks the URL and the types themselves. */
export class CreateEndpointDto {
  @IsString()
  url: string;

  /** `order.shipped`, `order.cancelled`, or `*` for both. */
  @IsArray()
  @IsString({ each: true })
  eventTypes: string[];

  @IsOptional()
  @IsString()
  description?: string;
}

/** Body of `PATCH /partner/webhook-endpoints/:id`: only what is sent changes. */
export class UpdateEndpointDto {
  @IsOptional()
  @IsString()
  url?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  eventTypes?: string[];

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
```

与 Zod 模式相同的规则，其推断类型替换类。Nest 12.1 通过 `StandardSchemaValidationPipe` 验证来自 Zod、Valibot 或 ArkType 的任何 [Standard Schema](https://standardschema.dev/) 对象：

```typescript
import { z } from 'zod';

/** Body of `POST /partner/webhook-endpoints`. The package checks the URL and the types themselves. */
export const createEndpointSchema = z.object({
  url: z.string(),
  /** `order.shipped`, `order.cancelled`, or `*` for both. */
  eventTypes: z.array(z.string()),
  description: z.string().optional(),
});
export type CreateEndpointDto = z.infer<typeof createEndpointSchema>;

/** Body of `PATCH /partner/webhook-endpoints/:id`: only what is sent changes. */
export const updateEndpointSchema = z.object({
  url: z.string().optional(),
  eventTypes: z.array(z.string()).optional(),
  description: z.string().nullable().optional(),
  enabled: z.boolean().optional(),
});
export type UpdateEndpointDto = z.infer<typeof updateEndpointSchema>;
```

订阅 API 是 `WebhookEndpoints` 上的控制器。每次调用都将合作伙伴的 id 作为**租户**传递：为该租户创建一个端点，为该租户列出，而另一个合作伙伴的端点 id 的行为就好像它不存在一样：

```typescript
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { WebhookEndpoints } from '@nestjs/webhooks';
import { CurrentPartner, PartnerGuard, type Partner } from '../partners/partner.guard.js';
import { CreateEndpointDto, UpdateEndpointDto } from './webhook-endpoints.dto.js';

/** A partner's subscriptions. Every call is scoped to the partner: another partner's endpoint is a 404. */
@Controller('partner/webhook-endpoints')
@UseGuards(PartnerGuard)
export class WebhookEndpointsController {
  constructor(private readonly webhookEndpoints: WebhookEndpoints) {}

  /** Returns the endpoint and its secret. The secret is shown this once. */
  @Post()
  create(@CurrentPartner() partner: Partner, @Body() dto: CreateEndpointDto) {
    return this.webhookEndpoints.create({
      url: dto.url,
      eventTypes: dto.eventTypes,
      description: dto.description ?? null,
      tenant: partner.id,
    });
  }

  @Get()
  list(@CurrentPartner() partner: Partner) {
    return this.webhookEndpoints.list({ tenant: partner.id });
  }

  @Get(':id')
  async get(@CurrentPartner() partner: Partner, @Param('id') id: string) {
    const endpoint = await this.webhookEndpoints.get(id, { tenant: partner.id });
    if (!endpoint) {
      throw new NotFoundException(`Webhook endpoint ${id} not found`);
    }
    return endpoint;
  }

  @Patch(':id')
  update(@CurrentPartner() partner: Partner, @Param('id') id: string, @Body() dto: UpdateEndpointDto) {
    return this.webhookEndpoints.update(id, dto, { tenant: partner.id });
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@CurrentPartner() partner: Partner, @Param('id') id: string) {
    await this.webhookEndpoints.delete(id, { tenant: partner.id });
  }

  /** A new secret. The old one keeps signing for 24 hours, so the partner can switch without a gap. */
  @Post(':id/rotate-secret')
  @HttpCode(HttpStatus.OK)
  async rotateSecret(@CurrentPartner() partner: Partner, @Param('id') id: string) {
    return { secret: await this.webhookEndpoints.rotateSecret(id, { tenant: partner.id }) };
  }
}
```

对于 Zod 模式，主体参数声明它们的模式而不是类：

```typescript
import { createEndpointSchema, updateEndpointSchema, type CreateEndpointDto, type UpdateEndpointDto } from './webhook-endpoints.schemas.js';
// ...
@Post()
create(@CurrentPartner() partner: Partner, @Body({ schema: createEndpointSchema }) dto: CreateEndpointDto) {
  // ...
}

@Patch(':id')
update(@CurrentPartner() partner: Partner, @Param('id') id: string, @Body({ schema: updateEndpointSchema }) dto: UpdateEndpointDto) {
  // ...
}
```

> info **Hint** DTO 仅由验证管道强制执行：bind`ValidationPipe` 在全球范围内，`useGlobalPipes()` 在 `main.ts` 作为 [Register the modules](/http/webhooks#register-the-modules) 是否（`whitelist` 在没有装饰器的情况下丢弃属性），或者作为 `APP_PIPE` 供应商。使用 Zod 模式，绑定 `StandardSchemaValidationPipe` 相反，同样的方法：应用程序使用其中一个或另一个。这个 [验证](/application/validation) 页面有每个选项。

`create()` 返回端点及其 `secret`，一个标准的 Webhooks `whsec_…` 32 个随机字节，在这里生成。这个 API 展示一次： `list()` 和 `get()` 永远不要包括它，失去它的合作伙伴会轮换。包装保密，密封时 `encryption` 是设置的，因为它用它签名，并且 `getSecret()` 如果您的 API 提供一个。从 Svix 或其他标准 Webhooks 发送器迁移的端点将保密：迁移脚本将传递合作伙伴现有的端点 `whsec_…` 作为 `secret` 的 `create()`，因此合作伙伴的验证器继续工作，并且 `rotateSecret()` 取给定的 `secret` 同样的方法。包检查合作伙伴提交的内容并抛出一个 `InvalidWebhookEndpointError` 400 状态：a URL 那不是 `https://` （或 `http://` 和 `allowHttp`)，携带凭据，或者其主机是阻止地址，例如 `https://169.254.169.254/latest/meta-data/` 或者 `https://localhost/`;不在 `eventTypes`.通过一个过滤器，一个伙伴的错误返回为 400，另一个伙伴的 id 返回为 404：

```typescript
import { Catch, HttpException, type ArgumentsHost } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { WebhooksError } from '@nestjs/webhooks';

/**
 * The package's errors carry an HTTP status (400 for an endpoint it refuses, 404 for another
 * partner's endpoint or delivery); this answers with it and the error's message.
 */
@Catch(WebhooksError)
export class WebhooksErrorFilter extends BaseExceptionFilter {
  override catch(error: WebhooksError, host: ArgumentsHost) {
    const status = (error as { status?: number }).status;
    super.catch(status ? new HttpException(error.message, status, { cause: error }) : error, host);
  }
}
```

```typescript
import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { WebhookDeliveriesController } from './webhook-deliveries.controller.js';
import { WebhookEndpointsController } from './webhook-endpoints.controller.js';
import { WebhooksErrorFilter } from './webhooks-error.filter.js';

@Module({
  controllers: [WebhookEndpointsController, WebhookDeliveriesController],
  // Turns the package's errors (a refused URL, another partner's endpoint) into 4xx responses.
  providers: [{ provide: APP_FILTER, useClass: WebhooksErrorFilter }],
})
export class PartnerWebhooksModule {}
```

交付日志的控制器，添加到此模块 [后来](/http/webhooks#retries-the-delivery-log-and-replay)，给合作伙伴另一半：发送到他们端点的内容。

#### 发送 order.shipped 和 order.cancelled 提交后

`Webhooks.dispatch()` 首先处理您的事务句柄，如 `Outbox.add()`：与 Drizzle，这个 `tx` 那个 `db.transaction()` 传递其回调，服务给出的回调类型 `Webhooks<Transaction>`.取消订单会更新订单并调度 `order.cancelled` 在同一个 `tx`;运送它（承运人触发，在 [Receive the carrier's Stripe-like webhooks](/http/webhooks#receive-the-carriers-stripe-like-webhooks)) 更新它并调度 `order.shipped`. `tenant` 是下订单的合作伙伴，因此只有该合作伙伴的端点接收订单：

```typescript
@Injectable()
export class OrdersService {
  constructor(
    @InjectDrizzle() private readonly db: Database,
    private readonly webhooks: Webhooks<Transaction>,
  ) {}

  // ...

  /** Cancels an order that hasn't shipped, and tells the partner in the same transaction. */
  async cancelOrder(partner: Partner, id: string, reason: string): Promise<Order> {
    const order = await this.db.transaction(async (tx) => {
      const [row] = await tx
        .select()
        .from(orders)
        .where(and(eq(orders.id, id), eq(orders.partnerId, partner.id)))
        .for('update');
      if (!row) {
        throw new NotFoundException(`Order ${id} not found`);
      }
      if (row.status === 'shipped' || row.status === 'cancelled') {
        throw new ConflictException(`Order ${id} is ${row.status}`);
      }
      await tx.update(orders).set({ status: 'cancelled' }).where(eq(orders.id, id));

      // Drizzle's tx: the webhook is sent only if the cancellation commits, and only to the
      // partner's own endpoints (the tenant).
      const data: OrderCancelled = { orderId: id, reason };
      await this.webhooks.dispatch(tx, { type: 'order.cancelled', tenant: row.partnerId, data });
      return { ...row, status: 'cancelled' as const };
    });

    this.webhooks.notify(); // deliver now instead of at the next poll
    return order;
  }

  // ...

  /** The carrier picked the order up: marks it shipped and tells the partner, in one transaction (the carrier's webhook). */
  async markShipped(tx: Transaction, orderId: string, trackingNumber: string): Promise<Order> {
    const [row] = await tx.select().from(orders).where(eq(orders.id, orderId)).for('update');
    if (!row) {
      throw new NotFoundException(`Order ${orderId} not found`);
    }
    if (row.status !== 'paid') {
      throw new ConflictException(`Order ${orderId} is ${row.status}, not paid`);
    }
    await tx.update(orders).set({ status: 'shipped', trackingNumber }).where(eq(orders.id, orderId));

    const data: OrderShipped = { orderId, trackingNumber };
    await this.webhooks.dispatch(tx, { type: 'order.shipped', tenant: row.partnerId, data });
    return { ...row, status: 'shipped', trackingNumber };
  }
}
```

事务中没有任何东西留下流程。如果它回滚，消息从未存在过。如果它提交，发件箱中继会拾取消息（`notify()` 要求它现在而不是在下一次轮询时这样做），并将其交给包的扇出，这将为订阅该类型的租户的每个启用端点创建一个传递。然后工人签名并发送每个。这是 Northside 的服务器在每次尝试传递时收到的内容，具有相同的 `webhook-id` 和序列化在 `dispatch()` 的确切主体：

```http
POST /store/webhooks HTTP/1.1
content-type: application/json
user-agent: NestJS-Webhooks/1.0
webhook-id: msg_01a0f33b898e7341950339801ec3319a
webhook-timestamp: 1790787160
webhook-signature: v1,<base64 HMAC-SHA256 of "msg_01a0f33b898e7341950339801ec3319a.1790787160.{the body}">

{"type":"order.shipped","timestamp":"2026-09-30T16:52:40.462Z","data":{"orderId":"1067d04c-0617-44ac-9a29-67297867329e","trackingNumber":"TRK-4471-0001"}}
```

签名是用端点的秘密加密的，因此合作伙伴可以使用任何标准的 Webhooks 库对其进行验证。或者使用此包：Northside 的接收器是 Nest 它自己的应用程序，有自己的根模块，只接收，用 `outgoing: false`，和 `@VerifyWebhook('store')` 在路上。`STORE_WEBHOOK_SECRET` 接受逗号分隔的列表，因为存储的 [旋转](/http/webhooks#rotate-secrets) 一天有两个秘密的标志：

```typescript
import { Module } from '@nestjs/common';
import { OutboxModule } from '@nestjs/outbox';
import { WebhooksModule } from '@nestjs/webhooks';
import { StoreWebhooksController } from './store-webhooks.controller.js';

/**
 * Northside's side: a service that only receives. `outgoing: false` leaves out the
 * endpoints, deliveries and worker. The outbox's inbox deduplicates redeliveries by
 * webhook-id; in memory here, on the partner's own database in production (the outbox's
 * store, as in the outbox tutorial's analytics service).
 */
@Module({
  imports: [
    OutboxModule.forRoot({ relay: { enabled: false } }),
    WebhooksModule.forRootAsync({
      outgoing: false,
      useFactory: () => {
        const secrets = process.env.STORE_WEBHOOK_SECRET;
        if (!secrets) {
          throw new Error('Set STORE_WEBHOOK_SECRET to the secret the store gave this endpoint');
        }
        return {
          receivers: {
            // Every listed secret is tried: keep the old one next to the new one while the store rotates.
            store: { scheme: 'standard', secret: secrets.split(',') },
          },
        };
      },
    }),
  ],
  controllers: [StoreWebhooksController],
})
export class AppModule {}
```

```typescript
import { Controller, HttpCode, HttpStatus, Logger, Post } from '@nestjs/common';
import { IncomingWebhook, VerifyWebhook } from '@nestjs/webhooks';

/** What the store sends: the Standard Webhooks payload, `type`, `timestamp` and `data`. */
export type StoreEvent =
  | { type: 'order.shipped'; timestamp: string; data: { orderId: string; trackingNumber: string } }
  | { type: 'order.cancelled'; timestamp: string; data: { orderId: string; reason: string } };

@Controller('store')
export class StoreWebhooksController {
  private readonly logger = new Logger(StoreWebhooksController.name);

  @Post('webhooks')
  @HttpCode(HttpStatus.NO_CONTENT)
  @VerifyWebhook('store')
  receive(@IncomingWebhook() webhook: IncomingWebhook<StoreEvent>) {
    const event = webhook.payload;
    if (event.type === 'order.shipped') {
      this.logger.log(`Order ${event.data.orderId} shipped, tracking ${event.data.trackingNumber} (${webhook.id})`);
    } else {
      this.logger.log(`Order ${event.data.orderId} cancelled: ${event.data.reason} (${webhook.id})`);
    }
  }
}
```

```typescript
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

async function bootstrap() {
  // rawBody: the signature is checked on the bytes the store signed, not on a re-serialized body.
  const app = await NestFactory.create(AppModule, { rawBody: true });
  app.enableShutdownHooks();
  await app.listen(process.env.PORT ?? 4100);
}
await bootstrap();
```

合伙人的 `OutboxModule` 提供收件箱 `@VerifyWebhook()` 重复数据删除。它在这里运行在内存中；真正的合作伙伴在自己的数据库中注册 outbox 的存储， `PostgresOutboxStore` 在 PostgreSQL 上，就像分析服务在 [发件箱教程](/reliability/outbox#publish-to-the-analytics-microservice).

#### 重试、交付日志和重播

合作伙伴的 2xx 是成功的。其他任何事情都是失败的尝试：5xx、4xx、3xx（从不跟踪重定向）、超时、连接被拒绝。工人在回退后重试，兑现 `Retry-After` 标题（秒）或作为 HTTP 日期（直到回退的上限，一天；任何其他值都被忽略），并且在 429、502、503 或 504 上暂停该端点，直到那时，5 秒钟没有标头：它的其他传递等待而没有尝试，因此请求呼吸器的合作伙伴得到一个探针，而不是每个批次一个，而其他合作伙伴的传递继续进行。三个答案会提前结束传递：一个 410 消失，这也会禁用端点（`gone`);传输拒绝的目的地（订阅检查，在每次发送时再次运行，因为 DNS 变化）；和 `retry.retryIf` 说不。在最后一次尝试之后，交付是 `failed` 有理由 `exhausted`.

每次尝试都失败的端点 `disableEndpointAfter` 被禁用的原因是 `failing`，和 `WebhooksEvents` 排放 `endpoint-disabled`：告诉搭档。任何时候的成功都会重置时钟。由工人或合作伙伴禁用的端点（`enabled: false` 在订阅中 `update()`)，当它保持禁用时，不会收到任何分派的传递：扇出会跳过它，并且以后不会创建这些传递。重播也不会，因为它重新发送现有的交付。当端点被禁用时，确实存在待处理的交付：它们失败的原因是 `endpoint-disabled` 当轮到他们时，在重新启用后，合作伙伴可以再次要求这些，因为它们是失败的交付。重新启用会忘记失败，端点接收从那时起调度的内容。

每次尝试都会被记录：状态代码、持续时间、前 4 次 KB 响应体的错误。合作伙伴读取自己的日志，并要求重新发送一次或自停电开始以来的每一次失败的一次。批量重试采用端点和中断开始，两者都是可选的：

```typescript
import { IsISO8601, IsOptional, IsString } from 'class-validator';

/** Body of `POST /partner/webhook-deliveries/retry`: every failed delivery since an outage began. */
export class RetryDeliveriesDto {
  /** One endpoint's, or every endpoint's. */
  @IsOptional()
  @IsString()
  endpointId?: string;

  /** Deliveries created at or after this time (ISO 8601): the start of the outage. */
  @IsOptional()
  @IsISO8601()
  since?: string;
}
```

```typescript
import { z } from 'zod';

/** Body of `POST /partner/webhook-deliveries/retry`: every failed delivery since an outage began. */
export const retryDeliveriesSchema = z.object({
  /** One endpoint's, or every endpoint's. */
  endpointId: z.string().optional(),
  /** Deliveries created at or after this time (ISO 8601): the start of the outage. */
  since: z.iso.datetime().optional(),
});
export type RetryDeliveriesDto = z.infer<typeof retryDeliveriesSchema>;
```

```typescript
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { WebhookDeliveries, type WebhookDeliveryStatus } from '@nestjs/webhooks';
import { CurrentPartner, PartnerGuard, type Partner } from '../partners/partner.guard.js';
import { RetryDeliveriesDto } from './webhook-deliveries.dto.js';

/** A partner's delivery log: what was sent, how each attempt went, and a way to ask for it again. */
@Controller('partner/webhook-deliveries')
@UseGuards(PartnerGuard)
export class WebhookDeliveriesController {
  constructor(private readonly webhookDeliveries: WebhookDeliveries) {}

  /** Newest first. */
  @Get()
  list(
    @CurrentPartner() partner: Partner,
    @Query('endpointId') endpointId?: string,
    @Query('status') status?: WebhookDeliveryStatus,
    @Query('type') type?: string,
  ) {
    return this.webhookDeliveries.list({ tenant: partner.id, endpointId, status, type });
  }

  /** The delivery, the message that was sent, and every attempt: status code, duration, the start of the response. */
  @Get(':id')
  async get(@CurrentPartner() partner: Partner, @Param('id') id: string) {
    const delivery = await this.webhookDeliveries.get(id, { tenant: partner.id });
    if (!delivery) {
      throw new NotFoundException(`Webhook delivery ${id} not found`);
    }
    return delivery;
  }

  /** Sends one delivery again, now, with the same webhook-id: a replay of a lost webhook, or a retry of a failed one. */
  @Post(':id/retry')
  @HttpCode(HttpStatus.OK)
  async retry(@CurrentPartner() partner: Partner, @Param('id') id: string) {
    return { retried: await this.webhookDeliveries.retry(id, { tenant: partner.id }) };
  }

  /** Retries every failed delivery, of one endpoint or all, since an outage began. */
  @Post('retry')
  @HttpCode(HttpStatus.OK)
  async retryFailed(@CurrentPartner() partner: Partner, @Body() dto: RetryDeliveriesDto) {
    const since = dto.since === undefined ? undefined : new Date(dto.since);
    const retried = await this.webhookDeliveries.retry(
      { endpointId: dto.endpointId, status: 'failed', since },
      { tenant: partner.id },
    );
    return { retried };
  }
}
```

使用 Zod 模式：

```typescript
import { retryDeliveriesSchema, type RetryDeliveriesDto } from './webhook-deliveries.schemas.js';
// ...
@Post('retry')
@HttpCode(HttpStatus.OK)
async retryFailed(@CurrentPartner() partner: Partner, @Body({ schema: retryDeliveriesSchema }) dto: RetryDeliveriesDto) {
  // ...
}
```

重试开始新一轮：`attempts` 回到 0，现在发送，相同 `webhook-id` 和同一具尸体。前几轮的日志仍然存在。因为 id 是相同的，一个合作伙伴的收件箱保留了它回答 2xx 而不运行它的处理程序，所以对于交付的 webhook 来说，重播也是安全的：Northside 可以在丢失自己的数据库后再次请求最后一个小时，并且只得到它没有处理的内容。

运营商在没有租户的情况下通过 `WebhookDeliveries` 获得相同的结果：`stats()`（待处理、到期、租赁和失败计数，以及 `lagMs`，最逾期的交付已经等待了多长时间，要警报的号码），`retry()` 跨租户，以及 `prune('30d')`，没有什么需要你。`WebhooksEvents.events$` 发射 `delivered`、`retry-scheduled`、`delivery-failed`、`endpoint-disabled` 和 `destination-blocked`，每个也在名为 `nestjs:webhooks:<event>` 的 `node:diagnostics_channel` 信道上。

#### 接收支付提供者的 webhooks

支付提供者告诉商店，支付是通过标准的 Webhooks 请求完成的。验证它需要与提供程序签名时完全相同的主体，因此应用程序是用 `rawBody: true` 创建的。这适用于 Express 和 Fastify：

```typescript
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

async function bootstrap() {
  // rawBody: incoming webhooks are verified on the bytes that were signed, not on a re-serialized body.
  const app = await NestFactory.create(AppModule, { rawBody: true });
  // The partner API's DTOs; whitelist: properties without a decorator are dropped.
  app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
  // On SIGTERM the outbox relay and the webhook worker finish what they started.
  app.enableShutdownHooks();
  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
```

发送者进入模块的 `receivers`，通过路由将使用的名称。支付提供者的秘密是它在仪表板中显示的秘密：

```typescript
// The senders whose webhooks this API accepts, by the name @VerifyWebhook() uses.
receivers: {
  // The payment provider follows Standard Webhooks: webhook-id, webhook-timestamp, webhook-signature.
  payments: { scheme: 'standard', secret: process.env.PAYMENTS_WEBHOOK_SECRET! },
  // The carrier copied Stripe's scheme under its own header: Carrier-Signature: t=...,v1=...
  carrier: { scheme: 'stripe', header: 'Carrier-Signature', secret: process.env.CARRIER_WEBHOOK_SECRET! },
},
```

路由上的 `@VerifyWebhook('payments')` 在处理程序运行之前验证请求，`@IncomingWebhook()` 给出已验证的内容：webhook 的发件人的 `id`、签名的 `timestamp`、从签名字节解析的 `payload` 和 `processInTransaction()`：

```typescript
import { Controller, HttpCode, HttpStatus, Logger, Post } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { IncomingWebhook, VerifyWebhook } from '@nestjs/webhooks';
import type { Database } from '../database/drizzle.js';
import { OrdersService } from '../orders/orders.service.js';

/** The payment provider's payload: the Standard Webhooks shape, `type`, `timestamp` and `data`. */
export interface PaymentProviderEvent {
  type: 'payment.succeeded' | 'payment.failed';
  timestamp: string;
  data: { paymentId: string; orderId: string; amount: number };
}

@Controller('webhooks/payments')
export class PaymentProviderWebhooksController {
  private readonly logger = new Logger(PaymentProviderWebhooksController.name);

  constructor(
    @InjectDrizzle() private readonly db: Database,
    private readonly ordersService: OrdersService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @VerifyWebhook('payments')
  async receive(@IncomingWebhook() webhook: IncomingWebhook<PaymentProviderEvent>) {
    const { type, data } = webhook.payload;
    if (type !== 'payment.succeeded') {
      this.logger.log(`Ignoring ${type} for order ${data.orderId}`);
      return;
    }
    // Exactly once: the webhook's id is recorded in the same transaction as the order's new
    // status, so a redelivery, even one racing this request on another instance, changes nothing.
    const result = await this.db.transaction(async (tx) =>
      webhook.processInTransaction(tx, () => this.ordersService.markPaid(tx, data.orderId, data.paymentId, data.amount)),
    );
    if (!result.duplicate) {
      this.logger.log(`Order ${data.orderId} paid: ${data.paymentId}, ${data.amount} cents`);
    }
  }
}
```

```typescript
/** The payment provider confirmed the payment. Runs inside the receiver's transaction. */
async markPaid(tx: Transaction, orderId: string, paymentId: string, amount: number): Promise<Order> {
  const [row] = await tx.select().from(orders).where(eq(orders.id, orderId)).for('update');
  if (!row) {
    throw new NotFoundException(`Order ${orderId} not found`);
  }
  if (row.status !== 'placed') {
    throw new ConflictException(`Order ${orderId} is ${row.status}`);
  }
  if (amount !== row.total) {
    throw new ConflictException(`Payment ${paymentId} is for ${amount}, and order ${orderId} totals ${row.total}`);
  }
  await tx.update(orders).set({ status: 'paid', paymentId }).where(eq(orders.id, orderId));
  return { ...row, status: 'paid', paymentId };
}
```

```typescript
import { Module } from '@nestjs/common';
import { OrdersModule } from '../orders/orders.module.js';
import { CarrierWebhooksController } from './carrier-webhooks.controller.js';
import { PaymentProviderWebhooksController } from './payment-provider-webhooks.controller.js';

/** The webhooks the store receives: the payment provider's payments and the carrier's shipments. */
@Module({
  imports: [OrdersModule],
  controllers: [PaymentProviderWebhooksController, CarrierWebhooksController],
})
export class ProviderWebhooksModule {}
```

装饰师检查的顺序是：三个 `webhook-` 头部存在并且形成良好，具有 `webhook-id` 最多 255 个字符，以代码点计算；一 `v1,` 签名 `webhook-signature` 匹配 HMAC 的 `id.timestamp.body` 具有配置的秘密之一（在恒定时间内比较；当支付提供者轮换时，可以列出几个秘密）；签名的时间戳在现在 5 分钟内，任意一个方向；尸体是 JSON.失败的请求会得到一个带有通用消息的 401。原因永远不会归咎于发件人；它去了 `verification-failed` 事件，带有接收者的姓名。一个签名的机构 JSON 在装饰器看到它之前，从框架的主体解析器中获取 400，因此不会为它发出任何事件。对于超过正文解析器大小限制（100 kB 在 Express 和 1 MiB 开启 Fastify 默认情况下）：在装饰器运行之前，它会得到一个 413，并且不会发出任何事件。如果支付提供者发送较大的实体，请将限额提高至 `useBodyParser()` 如中所述 [Raw body](/faq/raw-body#body-parser-size-limit).

然后是重复数据删除。支付提供者会重试，直到它得到 2xx，因此在处理程序成功后超时会使它发送相同的 `webhook-id` 再一次。接收器保留一个收件箱，其中包含它所处理的 ID（发件箱的收件箱、消费者 `webhooks:payments`)：在不运行处理程序的情况下用空 200 回答已知 id，并且只有在处理程序成功后才记录 id，因此在支付提供者的重试中再次运行抛出的处理程序。两个副本一起到达一个实例运行一次处理程序；同时接收到它们的两个实例都可以运行它，这就是下一段的目的。

`markPaid()` 移动与金钱相关的状态，因此控制器更进一步 `processInTransaction()`：webhook 的 id 是*通过订单的事务*记录的，并且 `markPaid()` 仅当它是新的时才运行。记录和新状态一起提交。在处理程序和收件箱写入之间崩溃后的重新传递，或者在另一个实例上运行此请求的人，找到 id 并且不更改任何内容；它解决了 `duplicate` 设置，控制器仅使用该设置记录一次。当 `markPaid()` 抛出，支付错误的金额，比如说，交易回滚，记录随之，发送者得到 409，一旦订单固定，它的重试得到另一次机会。

对于开发，一个小脚本以支付提供者（以及下一节中的运营商）的方式签署请求，使用来自 `@nestjs/webhooks/testing` 的 `signWebhook()`：

```typescript
/**
 * Sends the signed request the payment provider or the carrier would send, for trying the API by hand:
 *
 *   npx tsx scripts/send-webhook.ts payments payment.succeeded '{"paymentId":"pay_1","orderId":"...","amount":4998}'
 *   npx tsx scripts/send-webhook.ts carrier shipment.shipped '{"orderId":"...","trackingNumber":"TRK-0001"}'
 *
 * Signs with PAYMENTS_WEBHOOK_SECRET or CARRIER_WEBHOOK_SECRET, the secrets the API was
 * started with, and posts to API_URL (default http://localhost:3000). WEBHOOK_ID sends a
 * redelivery with a given id; TAMPER=1 changes a byte of the body after signing it.
 */
import { signWebhook } from '@nestjs/webhooks/testing';
import { randomUUID } from 'node:crypto';

const [sender, type, json = '{}'] = process.argv.slice(2);
if (sender !== 'payments' && sender !== 'carrier') {
  console.error('usage: send-webhook.ts <payments|carrier> <type> <data as JSON>');
  process.exit(2);
}
const data: unknown = JSON.parse(json);
const id = process.env.WEBHOOK_ID;

function secret(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Set ${name}`);
  }
  return value;
}

const signed =
  sender === 'payments'
    ? signWebhook({
        scheme: 'standard',
        secret: secret('PAYMENTS_WEBHOOK_SECRET'),
        id,
        payload: { type, timestamp: new Date().toISOString(), data },
      })
    : signWebhook({
        scheme: 'stripe',
        header: 'Carrier-Signature',
        secret: secret('CARRIER_WEBHOOK_SECRET'),
        payload: { id: id ?? `evt_${randomUUID().replaceAll('-', '')}`, type, data },
      });

const body = process.env.TAMPER ? `${signed.body.slice(0, -1)} }` : signed.body;
const response = await fetch(`${process.env.API_URL ?? 'http://localhost:3000'}/webhooks/${sender}`, {
  method: 'POST',
  headers: signed.headers,
  body,
});
console.log(`${response.status} ${await response.text()}`);
```

#### 接收运营商的条纹状网络挂钩

运营商复制了 Stripe 的方案：a `Carrier-Signature: t=…,v1=…` 标题，十六进制 HMAC-SHA256 的 `t.body` 用秘密的文本和有效载荷中的事件 id 锁定。接收器在 [`receivers` option](/http/webhooks#receive-the-payment-providers-webhooks) 这么说： `scheme: 'stripe'` 与 `header` 名字。Stripe 自己的 webhooks 是相同的接收器，没有 `header`.GitHub 的，以及有自己方案的发送者，都在 [Other senders](/http/webhooks#other-senders).

处理程序是有趣的部分。标记已发货的订单并告诉合作伙伴发生在一次交易中：订单的新状态，合作伙伴的 `order.shipped` 消息（通过发件箱）和此 webhook 的收件箱记录一起提交，或者它们都不提交：

```typescript
import { Controller, HttpCode, HttpStatus, Logger, Post } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { IncomingWebhook, VerifyWebhook, Webhooks } from '@nestjs/webhooks';
import type { Database } from '../database/drizzle.js';
import { OrdersService } from '../orders/orders.service.js';

/** The carrier's payload, Stripe-like: the event's `id` is in the body, which is what the signature covers. */
export interface CarrierEvent {
  id: string;
  type: 'shipment.shipped' | 'shipment.delivered';
  data: { orderId: string; trackingNumber: string };
}

@Controller('webhooks/carrier')
export class CarrierWebhooksController {
  private readonly logger = new Logger(CarrierWebhooksController.name);

  constructor(
    @InjectDrizzle() private readonly db: Database,
    private readonly ordersService: OrdersService,
    private readonly webhooks: Webhooks,
  ) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @VerifyWebhook('carrier')
  async receive(@IncomingWebhook() webhook: IncomingWebhook<CarrierEvent>) {
    const { type, data } = webhook.payload;
    if (type !== 'shipment.shipped') {
      this.logger.log(`Ignoring ${type} for order ${data.orderId}`);
      return;
    }
    // One transaction: the order's status, the partner's order.shipped webhook (through the
    // outbox) and this webhook's inbox record commit together, or not at all.
    const result = await this.db.transaction(async (tx) =>
      webhook.processInTransaction(tx, () => this.ordersService.markShipped(tx, data.orderId, data.trackingNumber)),
    );
    if (result.duplicate) {
      return;
    }
    this.webhooks.notify(); // deliver order.shipped now instead of at the next poll
    this.logger.log(`Order ${data.orderId} shipped, tracking ${data.trackingNumber}`);
  }
}
```

`markShipped()` 是从 [Send order.shipped and order.cancelled after the commit](/http/webhooks#send-ordershipped-and-ordercancelled-after-the-commit).重复数据删除 id 是事件的 `id` 来自签名的有效载荷，而不是报头，因为这是 Stripe 的方案所签名的。一个 `shipment.shipped` 尚未付款的订单的事件被 409 拒绝，并且不会记录任何内容：当承运人在付款到达后重试时，将处理相同的事件 id。

#### 其他发件人

GitHub 的 webhooks 采用 `scheme: 'github'`:`X-Hub-Signature-256`，十六进制 HMAC-SHA256 用秘密文字锁住的尸体。

> warning **Warning** GitHub 既不签署时间戳也不签署 id。捕获的请求将永久验证，默认情况下，重复数据删除密钥将在 `X-GitHub-Delivery` 未签名的头：在该头中使用新值重放的相同请求会再次运行处理程序。

使用接收方的 `id` 选择。有效载荷是从签名的字节中解析的，因此重播具有与原始相同的 id，并且收件箱会跳过它：

```typescript
receivers: {
  github: {
    scheme: 'github',
    secret: process.env.GITHUB_WEBHOOK_SECRET!,
    // The signed body, not the unsigned X-GitHub-Delivery header: a replayed request has a known id.
    id: (payload) => createHash('sha256').update(JSON.stringify(payload)).digest('hex'),
  },
},
```

收件箱会记住一个 id，直到 `OutboxInbox.prune()` 删除它，所以对于 GitHub 来说，它的窗口也是重播被捕获的时间：保持它很长。之后重放，请求验证并运行；仅接受 GitHub 发布的地址中的 webhooks（`hooks` 在 `https://api.github.com/meta`) 缩小谁可以发送一个。

具有自己方案的发送者是扩展 `WebhookSignatureScheme` 的类。假设商店还通过市场进行销售，该市场在其发布的 URL 后面跟着正文，并将事件的 id 放在正文中：

```typescript
import { WebhookSignatureScheme, type WebhookSignatureCheck, type WebhookSignedRequest } from '@nestjs/webhooks';
import { createHmac } from 'node:crypto';

/**
 * The marketplace's scheme: `X-Marketplace-Signature` is the base64 HMAC-SHA256 of the URL it
 * posts to followed by the body, keyed with the secret's text, and the event's id is in the body.
 * A scheme sees the request's headers and raw body, so the URL comes in through the constructor:
 * the one registered in the marketplace's dashboard.
 */
export class MarketplaceScheme extends WebhookSignatureScheme {
  constructor(private readonly url: string) {
    super();
  }

  verify({ headers, rawBody }: WebhookSignedRequest, keys: readonly Buffer[]): WebhookSignatureCheck {
    const signature = headers['x-marketplace-signature'];
    if (signature === undefined) {
      return { valid: false, reason: 'missing-header', detail: 'no x-marketplace-signature header' };
    }
    if (typeof signature !== 'string') {
      return { valid: false, reason: 'malformed-header', detail: 'x-marketplace-signature is repeated' };
    }

    const candidates = [Buffer.from(signature, 'base64')];
    for (const key of keys) {
      const expected = createHmac('sha256', key).update(this.url).update(rawBody).digest();
      // In constant time, never with ===.
      if (WebhookSignatureScheme.matches(expected, candidates)) {
        return { valid: true };
      }
    }
    return { valid: false, reason: 'invalid-signature', detail: 'no signature matches a configured secret' };
  }

  /** The deduplication id: the event's, from the signed body. */
  override idFromPayload(payload: unknown): string | undefined {
    const id = (payload as { eventId?: unknown } | null)?.eventId;
    return typeof id === 'string' ? id : undefined;
  }
}
```

- `verify(request, keys)` 获取请求的 `headers` （小写名称）及其 `rawBody`，以及每个配置的秘密一个密钥。它返回 `valid: true`，与发件人的 `id` 当标头携带一个和签名 `timestamp` 当方案签署一个（接收者的 `tolerance` 则适用），或 `valid: false` 用一个 `reason` 为了 `verification-failed` 事件和 a `detail`.在主体被解析为之前，它会同步运行 JSON.
- `WebhookSignatureScheme.matches(expected, candidates)` 在恒定时间内进行比较。切勿将签名与 `===` 进行比较。
- `idFromPayload(payload, headers)` 当没有头携带来自解析正文的重复数据删除 id 时，会给出重复数据删除 id，就像内置条带方案对事件的 `id` 所做的那样。使用 `malformed-header` 拒绝长于 255 个字符的 id。
- `key(secret)` 将每个配置的密钥转换为 `verify()` 在启动时接收的密钥，其中格式错误的密钥会停止应用程序。默认值接受秘密的文本，并拒绝一个空的文本或一个周围有空白的文本。对于编码的秘密覆盖它，就像 `standard` 方案对 `whsec_…` 所做的那样。

接收者实例：

```typescript
receivers: {
  marketplace: {
    scheme: new MarketplaceScheme('https://api.store.example.com/webhooks/marketplace'),
    secret: process.env.MARKETPLACE_WEBHOOK_SECRET!,
  },
},
```

#### 旋转秘密

机密泄露，或者合作伙伴的政策说一年就够了。`POST /partner/webhook-endpoints/:id/rotate-secret`（见 [Let partners subscribe](/http/webhooks#let-partners-subscribe)）返回一个新的秘密，旧的秘密继续在它旁边签名 `secretRotationOverlap`, 24 小时：每次送货携带两个 `v1,` 签名，标准的 Webhooks 验证器接受任何匹配的签名。合作伙伴按照自己的时间表将新秘密添加到其列表中，部署，删除旧秘密。重叠后，只有新的秘密标志。`rotateSecret()` 和 `overlap: 0` 因为一个泄露的秘密，立刻让旧的退休。

设置 `WEBHOOKS_ENCRYPTION_KEYS` 把秘密封闭起来，`openssl rand -base64 32` 对于每个密钥，最新的优先。以前创建的端点仍然被读取（它们的秘密是明文的），并在下一次旋转时被密封。

#### 试试

创建数据库，并将您的迁移应用于数据库，这将从 [Installation](/http/webhooks#installation) 创建订单 API 的表和行：

```bash
$ psql postgres://localhost:5432/postgres -c 'CREATE DATABASE store'
```

导出支付提供者和承运人与商店共享的秘密（此处发明），允许交付到此机器，并启动 API 在端口 3000 上：

```bash
$ export PAYMENTS_WEBHOOK_SECRET=whsec_$(openssl rand -base64 32)
$ export CARRIER_WEBHOOK_SECRET=carrier_test_$(openssl rand -hex 6)
$ export WEBHOOKS_ALLOW_LOCAL=1
```

```bash
[Nest] 55905  - 09/30/2026, 6:52:36 PM     LOG [OutboxModule] OutboxStorage: PostgresOutboxStore
[Nest] 55905  - 09/30/2026, 6:52:36 PM     LOG [WebhooksModule] WebhooksStorage: PostgresWebhookStore
[Nest] 55905  - 09/30/2026, 6:52:36 PM     LOG [OutboxModule] PostgresOutboxStore: migrated schema "nest_outbox" to version 1.
[Nest] 55905  - 09/30/2026, 6:52:36 PM     LOG [WebhooksModule] PostgresWebhookStore: migrated schema "nest_webhooks" to version 1.
[Nest] 55905  - 09/30/2026, 6:52:36 PM     LOG [NestApplication] Nest application successfully started +2ms
```

您的迁移创建了订单 API 的表，以及存储它们的模式，在它们旁边。Northside 订阅了它 API 键，对于接收器处的两个事件，它将在端口 4100 上运行。这一次，答案包含了秘密：

```bash
$ curl -s -X POST localhost:3000/partner/webhook-endpoints \
    -H 'Authorization: Bearer partner_northside_7c1d2e' \
    --json '{"url":"http://127.0.0.1:4100/store/webhooks","eventTypes":["order.shipped","order.cancelled"],"description":"Warehouse system"}'
{"id":"ep_01a0f33b79e27154b8fd089a10f3e48e","tenant":"northside","url":"http://127.0.0.1:4100/store/webhooks","eventTypes":["order.shipped","order.cancelled"],"description":"Warehouse system","enabled":true,"disabledReason":null,"failingSince":null,"createdAt":1790787156450,"updatedAt":1790787156450,"secret":"whsec_yKaIEKkc0ZpOWofM8Fx1Wc5yxdffKSsP1jolLCynqug="}
$ curl -s localhost:3000/partner/webhook-endpoints -H 'Authorization: Bearer partner_northside_7c1d2e'
[{"id":"ep_01a0f33b79e27154b8fd089a10f3e48e","tenant":"northside","url":"http://127.0.0.1:4100/store/webhooks","eventTypes":["order.shipped","order.cancelled"],"description":"Warehouse system","enabled":true,"disabledReason":null,"failingSince":null,"createdAt":1790787156450,"updatedAt":1790787156450}]
```

> info **Hint** `--json` 需要卷曲 7.82 或更高。

这个 URL 云元数据服务在存储任何内容之前都会被拒绝，事件类型也是如此 API 不发送。另一个合作伙伴 Riverside Cat Shelter 为 Northside 的端点获得了 404：

```bash
$ curl -s -X POST localhost:3000/partner/webhook-endpoints \
    -H 'Authorization: Bearer partner_northside_7c1d2e' \
    --json '{"url":"https://169.254.169.254/latest/meta-data/","eventTypes":["*"]}'
{"statusCode":400,"message":"Invalid webhook URL: 169.254.169.254 is link-local (cloud metadata)"}
$ curl -s -X POST localhost:3000/partner/webhook-endpoints \
    -H 'Authorization: Bearer partner_northside_7c1d2e' \
    --json '{"url":"https://hooks.northside.example.com/store","eventTypes":["order.paid"]}'
{"statusCode":400,"message":"Unknown message type \"order.paid\". Known: order.shipped, order.cancelled"}
$ curl -s -o /dev/null -w '%{http_code}' localhost:3000/partner/webhook-endpoints/ep_01a0f33b79e27154b8fd089a10f3e48e \
    -H 'Authorization: Bearer partner_riverside_91ab44'
404
```

启动 Northside 的接收器，`partner-service/main.ts` 在端口 4100 上，它在其环境中被赋予了秘密：

```bash
STORE_WEBHOOK_SECRET=whsec_yKaIEKkc0ZpOWofM8Fx1Wc5yxdffKSsP1jolLCynqug=
```

现在下订单，让支付提供者支付，承运人发货。脚本对他们将发送的请求进行签名，并在上面导出了秘密：

```bash
$ curl -s -X POST localhost:3000/orders \
    -H 'Authorization: Bearer partner_northside_7c1d2e' \
    --json '{"items":[{"productId":"salmon-kibble-2kg","quantity":2}]}'
{"id":"1067d04c-0617-44ac-9a29-67297867329e","partnerId":"northside","items":[{"productId":"salmon-kibble-2kg","quantity":2,"price":2499}],"total":4998,"status":"placed","paymentId":null,"trackingNumber":null}
$ npx tsx scripts/send-webhook.ts payments payment.succeeded \
    '{"paymentId":"pay_8f21c","orderId":"1067d04c-0617-44ac-9a29-67297867329e","amount":4998}'
200
$ npx tsx scripts/send-webhook.ts carrier shipment.shipped \
    '{"orderId":"1067d04c-0617-44ac-9a29-67297867329e","trackingNumber":"TRK-4471-0001"}'
200
$ curl -s localhost:3000/orders/1067d04c-0617-44ac-9a29-67297867329e -H 'Authorization: Bearer partner_northside_7c1d2e'
{"id":"1067d04c-0617-44ac-9a29-67297867329e","partnerId":"northside","items":[{"price":2499,"quantity":2,"productId":"salmon-kibble-2kg"}],"total":4998,"status":"shipped","paymentId":"pay_8f21c","trackingNumber":"TRK-4471-0001"}
```

API 的日志显示处理过的两个 webhooks，而 Northside 的日志显示 `order.shipped` 紧随运营商之后到达，其 `webhook-id`：

```bash
[Nest] 55905  - 09/30/2026, 6:52:39 PM     LOG [PaymentProviderWebhooksController] Order 1067d04c-0617-44ac-9a29-67297867329e paid: pay_8f21c, 4998 cents
[Nest] 55905  - 09/30/2026, 6:52:40 PM     LOG [CarrierWebhooksController] Order 1067d04c-0617-44ac-9a29-67297867329e shipped, tracking TRK-4471-0001
```

```bash
[Nest] 56040  - 09/30/2026, 6:52:40 PM     LOG [StoreWebhooksController] Order 1067d04c-0617-44ac-9a29-67297867329e shipped, tracking TRK-4471-0001 (msg_01a0f33b898e7341950339801ec3319a)
```

Northside 的交付日志有交付，其详细信息有消息和一次尝试，以及合作伙伴的状态代码和时间：

```bash
$ curl -s localhost:3000/partner/webhook-deliveries -H 'Authorization: Bearer partner_northside_7c1d2e'
[{"id":"dlv_01a0f33b89ac720aa76e2c3da97f3c14","messageId":"msg_01a0f33b898e7341950339801ec3319a","endpointId":"ep_01a0f33b79e27154b8fd089a10f3e48e","tenant":"northside","type":"order.shipped","status":"succeeded","attempts":1,"nextAttemptAt":null,"lastAttemptAt":1790787160533,"lastStatusCode":204,"lastError":null,"failureReason":null,"createdAt":1790787160462,"completedAt":1790787160544}]
$ curl -s localhost:3000/partner/webhook-deliveries/dlv_01a0f33b89ac720aa76e2c3da97f3c14 -H 'Authorization: Bearer partner_northside_7c1d2e'
```

```json
{
  "id": "dlv_01a0f33b89ac720aa76e2c3da97f3c14",
  "messageId": "msg_01a0f33b898e7341950339801ec3319a",
  "endpointId": "ep_01a0f33b79e27154b8fd089a10f3e48e",
  "tenant": "northside",
  "type": "order.shipped",
  "status": "succeeded",
  "attempts": 1,
  "nextAttemptAt": null,
  "lastAttemptAt": 1790787160533,
  "lastStatusCode": 204,
  "lastError": null,
  "failureReason": null,
  "createdAt": 1790787160462,
  "completedAt": 1790787160544,
  "message": {
    "id": "msg_01a0f33b898e7341950339801ec3319a",
    "type": "order.shipped",
    "tenant": "northside",
    "body": "{\"type\":\"order.shipped\",\"timestamp\":\"2026-09-30T16:52:40.462Z\",\"data\":{\"orderId\":\"1067d04c-0617-44ac-9a29-67297867329e\",\"trackingNumber\":\"TRK-4471-0001\"}}",
    "createdAt": 1790787160462
  },
  "history": [
    { "deliveryId": "dlv_01a0f33b89ac720aa76e2c3da97f3c14", "attempt": 1, "at": 1790787160533, "durationMs": 11, "statusCode": 204, "response": "", "error": null }
  ]
}
```

阻止北区的接收器 `Ctrl+C`，然后下单取消。传递无法连接，API 记录下次尝试之前的等待，合作伙伴的日志显示待处理的交付及其错误：

```bash
$ curl -s -X POST localhost:3000/orders \
    -H 'Authorization: Bearer partner_northside_7c1d2e' \
    --json '{"items":[{"productId":"clumping-litter-10l","quantity":1}]}'
{"id":"d6a36832-6b83-40f6-960b-0c6aa905ae18","partnerId":"northside","items":[{"productId":"clumping-litter-10l","quantity":1,"price":1599}],"total":1599,"status":"placed","paymentId":null,"trackingNumber":null}
$ curl -s -X POST localhost:3000/orders/d6a36832-6b83-40f6-960b-0c6aa905ae18/cancel \
    -H 'Authorization: Bearer partner_northside_7c1d2e' \
    --json '{"reason":"out of stock"}'
{"id":"d6a36832-6b83-40f6-960b-0c6aa905ae18","partnerId":"northside","items":[{"price":1599,"quantity":1,"productId":"clumping-litter-10l"}],"total":1599,"status":"cancelled","paymentId":null,"trackingNumber":null}
$ curl -s 'localhost:3000/partner/webhook-deliveries?status=pending' -H 'Authorization: Bearer partner_northside_7c1d2e'
[{"id":"dlv_01a0f33b8f51724da606406a85418fab","messageId":"msg_01a0f33b8f367090b44d3de36eed8f13","endpointId":"ep_01a0f33b79e27154b8fd089a10f3e48e","tenant":"northside","type":"order.cancelled","status":"pending","attempts":1,"nextAttemptAt":1790787164580,"lastAttemptAt":1790787161969,"lastStatusCode":null,"lastError":"Error: connect ECONNREFUSED 127.0.0.1:4100","failureReason":null,"createdAt":1790787161910,"completedAt":null}]
```

```bash
[Nest] 55905  - 09/30/2026, 6:52:42 PM    WARN [WebhookWorker] Retrying webhook delivery dlv_01a0f33b8f51724da606406a85418fab (order.cancelled) in 2609ms (attempt 1 of 10 failed): Error: connect ECONNREFUSED 127.0.0.1:4100
```

重新启动接收器。重试通过，日志保留两次尝试：

```bash
[Nest] 56304  - 09/30/2026, 6:52:45 PM     LOG [StoreWebhooksController] Order d6a36832-6b83-40f6-960b-0c6aa905ae18 cancelled: out of stock (msg_01a0f33b8f367090b44d3de36eed8f13)
```

```bash
$ curl -s localhost:3000/partner/webhook-deliveries/dlv_01a0f33b8f51724da606406a85418fab -H 'Authorization: Bearer partner_northside_7c1d2e'
```

```json
{
  "id": "dlv_01a0f33b8f51724da606406a85418fab",
  "type": "order.cancelled",
  "status": "succeeded",
  "attempts": 2,
  "lastStatusCode": 204,
  "history": [
    { "attempt": 1, "at": 1790787161969, "durationMs": 2, "statusCode": null, "response": null, "error": "Error: connect ECONNREFUSED 127.0.0.1:4100" },
    { "attempt": 2, "at": 1790787165060, "durationMs": 11, "statusCode": 204, "response": "", "error": null }
  ]
}
```

北区再次要求送货。它与相同的 `webhook-id`，收件人的收件箱识别它并在不运行处理程序的情况下回复 204（其日志中没有新内容），并且传递日志显示新一轮：

```bash
$ curl -s -X POST localhost:3000/partner/webhook-deliveries/dlv_01a0f33b8f51724da606406a85418fab/retry \
    -H 'Authorization: Bearer partner_northside_7c1d2e'
{"retried":1}
$ curl -s localhost:3000/partner/webhook-deliveries/dlv_01a0f33b8f51724da606406a85418fab -H 'Authorization: Bearer partner_northside_7c1d2e'
```

```json
{
  "status": "succeeded",
  "attempts": 1,
  "history": [
    { "attempt": 1, "at": 1790787161969, "statusCode": null, "error": "Error: connect ECONNREFUSED 127.0.0.1:4100" },
    { "attempt": 2, "at": 1790787165060, "statusCode": 204, "error": null },
    { "attempt": 1, "at": 1790787166185, "statusCode": 204, "error": null }
  ]
}
```

现在是支付提供者这边。用相同的重新交付 `webhook-id`（丢失了 200，因此提供者重试）被回答，但不再处理：API 记录一次付款。被篡改的身体和错误的秘密被拒绝，没有理由：

```bash
$ curl -s -X POST localhost:3000/orders \
    -H 'Authorization: Bearer partner_northside_7c1d2e' \
    --json '{"items":[{"productId":"salmon-kibble-2kg","quantity":1}]}'
{"id":"d7dbe1ab-c408-4688-9e9e-2925ed2025a3","partnerId":"northside","items":[{"productId":"salmon-kibble-2kg","quantity":1,"price":2499}],"total":2499,"status":"placed","paymentId":null,"trackingNumber":null}
$ WEBHOOK_ID=msg_2c9e4f1a npx tsx scripts/send-webhook.ts payments payment.succeeded \
    '{"paymentId":"pay_9d0a2","orderId":"d7dbe1ab-c408-4688-9e9e-2925ed2025a3","amount":2499}'
200
$ WEBHOOK_ID=msg_2c9e4f1a npx tsx scripts/send-webhook.ts payments payment.succeeded \
    '{"paymentId":"pay_9d0a2","orderId":"d7dbe1ab-c408-4688-9e9e-2925ed2025a3","amount":2499}'
200
$ TAMPER=1 npx tsx scripts/send-webhook.ts payments payment.succeeded \
    '{"paymentId":"pay_9d0a2","orderId":"d7dbe1ab-c408-4688-9e9e-2925ed2025a3","amount":2499}'
401 {"message":"Webhook signature verification failed","error":"Unauthorized","statusCode":401}
$ PAYMENTS_WEBHOOK_SECRET=whsec_$(openssl rand -base64 32) npx tsx scripts/send-webhook.ts payments payment.succeeded \
    '{"paymentId":"pay_9d0a2","orderId":"d7dbe1ab-c408-4688-9e9e-2925ed2025a3","amount":2499}'
401 {"message":"Webhook signature verification failed","error":"Unauthorized","statusCode":401}
```

```bash
[Nest] 55905  - 09/30/2026, 6:52:48 PM     LOG [PaymentProviderWebhooksController] Order d7dbe1ab-c408-4688-9e9e-2925ed2025a3 paid: pay_9d0a2, 2499 cents
```

最后，旋转端点的秘密。接收器仍然使用旧的接收器运行，下一个传递无论如何都会进行验证：它携带了两个签名。然后重新启动接收器，首先列出新的秘密，其后列出旧的秘密，因为合作伙伴将部署它，并下和取消另一个订单：该交付也验证：

```bash
$ curl -s -X POST localhost:3000/partner/webhook-endpoints/ep_01a0f33b79e27154b8fd089a10f3e48e/rotate-secret \
    -H 'Authorization: Bearer partner_northside_7c1d2e'
{"secret":"whsec_BUPv/LlKhv9qDH7udP3gsGPquuj4WaopeP8fxyouWOk="}
$ curl -s -X POST localhost:3000/orders/d7dbe1ab-c408-4688-9e9e-2925ed2025a3/cancel \
    -H 'Authorization: Bearer partner_northside_7c1d2e' \
    --json '{"reason":"customer changed their mind"}'
{"id":"d7dbe1ab-c408-4688-9e9e-2925ed2025a3","partnerId":"northside","items":[{"price":2499,"quantity":1,"productId":"salmon-kibble-2kg"}],"total":2499,"status":"cancelled","paymentId":"pay_9d0a2","trackingNumber":null}
```

```bash
[Nest] 56304  - 09/30/2026, 6:52:50 PM     LOG [StoreWebhooksController] Order d7dbe1ab-c408-4688-9e9e-2925ed2025a3 cancelled: customer changed their mind (msg_01a0f33bb022712e8e440b7adef8208f)
```

```bash
STORE_WEBHOOK_SECRET=whsec_BUPv/LlKhv9qDH7udP3gsGPquuj4WaopeP8fxyouWOk=,whsec_yKaIEKkc0ZpOWofM8Fx1Wc5yxdffKSsP1jolLCynqug=
```

```bash
$ curl -s -X POST localhost:3000/orders \
    -H 'Authorization: Bearer partner_northside_7c1d2e' \
    --json '{"items":[{"productId":"clumping-litter-10l","quantity":2}]}'
{"id":"d203fd6f-7396-489b-9d20-775cd8a6ca4e","partnerId":"northside","items":[{"productId":"clumping-litter-10l","quantity":2,"price":1599}],"total":3198,"status":"placed","paymentId":null,"trackingNumber":null}
$ curl -s -X POST localhost:3000/orders/d203fd6f-7396-489b-9d20-775cd8a6ca4e/cancel \
    -H 'Authorization: Bearer partner_northside_7c1d2e' \
    --json '{"reason":"ordered twice"}'
{"id":"d203fd6f-7396-489b-9d20-775cd8a6ca4e","partnerId":"northside","items":[{"price":1599,"quantity":2,"productId":"clumping-litter-10l"}],"total":3198,"status":"cancelled","paymentId":null,"trackingNumber":null}
```

```bash
[Nest] 56624  - 09/30/2026, 6:52:52 PM     LOG [StoreWebhooksController] Order d203fd6f-7396-489b-9d20-775cd8a6ca4e cancelled: ordered twice (msg_01a0f33bb8ad7249a0fa069361100c49)
```

交付是数据库中存储模式中的行：

```bash
$ psql "$DATABASE_URL" -c "SELECT type, status, attempts, last_status_code FROM nest_webhooks.deliveries ORDER BY created_at"
      type       |  status   | attempts | last_status_code
-----------------+-----------+----------+------------------
 order.shipped   | succeeded |        1 |              204
 order.cancelled | succeeded |        1 |              204
 order.cancelled | succeeded |        1 |              204
 order.cancelled | succeeded |        1 |              204
(4 rows)
```

#### 检测

在 e2e 测试中，使用 [PGlite](https://pglite.dev) 和您的实际迁移运行 PostgreSQL 进程，关闭中继器和工作器，用记录请求的传输替换传输，并用 `signWebhook()` 对提供者的请求进行签名。用 PGlite 上的一个重写数据库 `DrizzleModule` 寄存器（`getDrizzleToken()` 返回其令牌）：存储跟随，因为它们的工厂注入它，并在应用程序启动时在那里创建它们的模式：

```typescript
import { PGlite } from '@electric-sql/pglite';
import type { INestApplication } from '@nestjs/common';
import { getDrizzleToken } from '@nestjs/drizzle';
import { OutboxRelay } from '@nestjs/outbox';
import { Test } from '@nestjs/testing';
import { InMemoryWebhookTransport, WebhookEndpoints, WebhookTransport, WebhookWorker } from '@nestjs/webhooks';
import { signWebhook } from '@nestjs/webhooks/testing';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { fileURLToPath } from 'node:url';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import * as schema from '../src/database/schema.js';
import { OrdersService } from '../src/orders/orders.service.js';

const PAYMENTS_SECRET = `whsec_${Buffer.alloc(32, 1).toString('base64')}`;
const CARRIER_SECRET = 'carrier_test_secret';

describe('Order webhooks', () => {
  const client = new PGlite(); // PostgreSQL, in-process
  const db = drizzle(client, { schema });
  const transport = new InMemoryWebhookTransport(); // records requests instead of sending them
  const partner = { id: 'northside', name: 'Northside Pet Supplies' };
  let app: INestApplication;
  let relay: OutboxRelay;
  let worker: WebhookWorker;
  let endpoint: { id: string; secret: string };

  beforeAll(async () => {
    // The real migrations: the order tables. The stores create their schemas when the app starts.
    await migrate(db, { migrationsFolder: fileURLToPath(new URL('../drizzle', import.meta.url)) });
    process.env.PAYMENTS_WEBHOOK_SECRET = PAYMENTS_SECRET;
    process.env.CARRIER_WEBHOOK_SECRET = CARRIER_SECRET;
    process.env.OUTBOX_RELAY = 'off'; // no poll loops: the test drives the relay and the worker
    process.env.WEBHOOKS_WORKER = 'off';
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(getDrizzleToken())
      .useValue(db) // the stores' factories inject it too
      .overrideProvider(WebhookTransport)
      .useValue(transport)
      .compile();
    app = moduleRef.createNestApplication({ rawBody: true });
    await app.init();
    relay = app.get(OutboxRelay);
    worker = app.get(WebhookWorker);
    endpoint = await app.get(WebhookEndpoints).create({ url: 'https://hooks.northside.example.com/store', eventTypes: ['*'], tenant: partner.id });
  });

  afterAll(async () => {
    await app.close();
    await client.close();
  });

  /** Publishes committed messages (the fan-out), then runs one worker batch. */
  const deliver = async () => {
    await relay.runOnce();
    return worker.runOnce();
  };
  const shipment = (orderId: string, id = 'evt_1') =>
    signWebhook({
      scheme: 'stripe',
      header: 'Carrier-Signature',
      secret: CARRIER_SECRET,
      payload: { id, type: 'shipment.shipped', data: { orderId, trackingNumber: 'TRK-1' } },
    });

  it("sends order.shipped to the partner once the carrier's webhook commits", async () => {
    const order = await app.get(OrdersService).placeOrder(partner, { items: [{ productId: 'salmon-kibble-2kg', quantity: 1 }] });
    const paid = signWebhook({
      scheme: 'standard',
      secret: PAYMENTS_SECRET,
      payload: { type: 'payment.succeeded', data: { paymentId: 'pay_1', orderId: order.id, amount: order.total } },
    });
    await request(app.getHttpServer()).post('/webhooks/payments').set(paid.headers).send(paid.body).expect(200);
    const shipped = shipment(order.id);
    await request(app.getHttpServer()).post('/webhooks/carrier').set(shipped.headers).send(shipped.body).expect(200);
    expect(transport.sent).toEqual([]); // nothing until the outbox relays the commit

    expect(await deliver()).toMatchObject({ delivered: 1 });

    const sent = transport.single({ type: 'order.shipped', endpointId: endpoint.id });
    expect(sent.data).toEqual({ orderId: order.id, trackingNumber: 'TRK-1' });
    expect(sent.isSignedWith(endpoint.secret)).toBe(true);
  });

  it('processes a redelivered shipment webhook once', async () => {
    const [order] = await db.select().from(schema.orders);
    const shipped = shipment(order!.id);
    await request(app.getHttpServer()).post('/webhooks/carrier').set(shipped.headers).send(shipped.body).expect(200, '');
    expect(await deliver()).toMatchObject({ claimed: 0 });
    expect(transport.sent).toHaveLength(1);
  });

  it('refuses a webhook whose body was altered', async () => {
    const shipped = shipment('order-x', 'evt_2');
    await request(app.getHttpServer())
      .post('/webhooks/carrier')
      .set(shipped.headers)
      .send(shipped.body.replace('TRK-1', 'TRK-2'))
      .expect(401);
    expect(await deliver()).toMatchObject({ claimed: 0 });
  });
});
```

- 发件箱、两个存储、迁移、扇出、签名和验证都是真实的。仅更换网络：`InMemoryWebhookTransport` 回答 200 个并保留每个请求，以及 `respondWith(503)` 或者一个函数模拟一个情绪低落、缓慢或挑剔的伙伴。
- `deliver()` 是提交后的整个管道：`relay.runOnce()` 发布提交的消息（扇出创建传递），`worker.runOnce()` 认领一批并发送。
- `SentWebhook.isSignedWith(secret)` 验证 `v1` 使用端点的机密签名，以及 `data` 是身体的 `data` 因此，测试断言合作伙伴会验证和读取什么。
- `signWebhook()` 生成支付提供者、Stripe 或 GitHub 将发送的正文和标题。重复使用它 `id` 若要重新交付，请移动 `timestamp` 若要测试公差，请更改正文中的一个字节以表示篡改的请求。
- 对于依赖于时间的行为，如后退、租赁和旋转重叠，将 `Date.now()` 与 `vi.spyOn(Date, 'now')` 一起向前移动。工人和商店从中抽出时间，实时计时器继续为插座运行。
- 例子的 `tutorial.e2e-spec.ts` 在 real 上运行此页面的每个部分 HTTP 在 PGlite 和 PostgreSQL 服务器上： API 通过默认传输传输到合作伙伴的接收器，包括中断、重放、重新传输和轮换。它的 `zod.e2e-spec.ts` 使用 DTOs 的 Zod 变体启动相同的应用程序，并且 `StandardSchemaValidationPipe`.它的商店测试运行商店 Drizzle 在 PGlite、PostgreSQL 和 MySQL 上，以及通过 TypeORM 在 PostgreSQL 上：合同套件，一个提交和回滚订单的调度，以及生产中的模式。

看 [End-to-end testing](/fundamentals/testing#end-to-end-testing) 有关测试设置的更多信息。

#### 交货保证

传出的 webhooks 被传送**至少一次**；接收器通过 `webhook-id` 进行重复数据删除。

| 情况 | 结果 |
| --- | --- |
| 订单的事务回滚 | 消息从未存在过，也没有发送任何内容 |
| 订单的事务提交 | 租户的每个订阅端点一次交付，最终交付或失败，并附有其尝试日志 |
| 发件箱重新传递消息（扇出后中继崩溃） | 扇出是幂等的：每个消息和端点一个传递 |
| 端点是在消息之后创建的，或者已被禁用 | 它不会收到它，重播也不会把它带回来 |
| 一名工人在索赔后死亡 | 租约到期后由另一名工人寄出（`worker.lease`，1 分钟） |
| 工人在发送后、录制前死亡 | **发送两次**，相同 `webhook-id`，一旦租约到期 |
| 两个工人，同样的交付 | 索赔仅限于租赁，以后的每一次写入都受到索赔的限制 |
| 合作伙伴回答 2xx | 交付 |
| 它回答任何其他问题，或者什么都不回答 | 后退重试，`Retry-After` 荣誉；429、502、503 和 504 对端点进行起搏 |
| 它回答 410 消失 | 失败 (`rejected`)，且端点已禁用 (`gone`) |
| 每次尝试都失败了 `disableEndpointAfter` | 端点被禁用（`failing`)，一 |
| 合作伙伴要求重播 | 新一轮相同 `webhook-id` 所以它的收件箱会跳过它 |

送货没有订单**。一个工人一次发送一个端点的传递，大多数是先过期的，但失败的尝试等待其回退，而稍后的消息发出，几个工人同时发送到同一端点，重播现在发送旧消息。一个订单的两次更新可以以任一顺序到达合作伙伴。接收者处理重复的方式与处理重复的方式相同：身体的 `timestamp` 是发送消息的时间（`webhook-timestamp` 是此尝试被签名的时候），因此处理程序可以忽略比它已经持有的状态更老的事件，或者将 webhook 视为信号并从 API.

传入的 webhooks 使用默认收件箱运行它们的处理程序**在常见情况下每个 webhook id 和接收器一次**（在处理程序和收件箱写入之间崩溃之后，或者当两个副本在两个实例上竞争时），以及它们的 `processInTransaction()` 工作**正好一次**。

#### 生产检查表

- 将端点和交付保存在应用程序的数据库中，在数据库服务器上：注册 `PostgresWebhookStore` 或 `MySqlWebhookStore`，并将发件箱存储在它旁边（[Keep webhooks in your database](/http/webhooks#keep-webhooks-in-your-database)）。生产警卫拒绝在内存中启动；`allowInMemoryStorage` 适用于您可以承受丢失待处理交付的过程。
- 在新版本开始之前，使用 `npx @nestjs/webhooks migrate` 和 `npx @nestjs/outbox migrate` 或您的迁移工具应用两个存储库的迁移，并使用 `status` 在 CI 中签入它们。使用 `NODE_ENV=production`，存储不会在启动时迁移：背后的模式会使其失败。
- 在 PostgreSQL 上，将数据库的默认隔离设置为 READCOMMITTED：商店拒绝更严格的。在 MySQL 上，当 MySQL 打破事务中的死锁（错误 1213）时，再次运行事务：它回滚，发送的消息和记录的 webhooks。
- 离开 `delivery.allowHttp` 和 `delivery.allowPrivateNetworks` 离开。合伙人的 URL 是不受信任的输入，传输会自动解析它并固定它检查的地址。使用 `allowedAddresses` 对于您真正交付的一个私人范围，并保持警惕 `destination-blocked` 事件：客户将 webhook 指向您的元数据服务值得一看。
- 在几个实例中运行 worker（`WEBHOOKS_WORKER`），不是每一个 APIpod：每次索赔都是一笔短期交易，租赁可以防止他们两次发送相同的货物。
- 警戒 `lagMs` 和 `failed` 来自 `deliveries.stats()`，等等 `endpoint-disabled`：通过电子邮件告知合作伙伴他们的端点已关闭以及原因。
- 版本有效载荷。合伙人保留其处理程序多年，并且 `retry()` 重新发送发送的正文。将字段添加到类型 `data`，切勿重命名或删除。要进行突破性更改，请添加一个新类型，`order.shipped.v2` 在 `eventTypes`，并在同一事务中调度两者（`dispatch()` 获取一个数组），而合作伙伴将他们的订阅移至；订阅的端点 `*` 两者兼得。那就停止派遣旧式。旧消息的重播仍然保留旧形状，直到日志被修剪。
- 向合作伙伴提供交付日志和回放。它回答“你发送了吗？”在他们开票之前。
- 用重叠旋转秘密，除非有秘密泄露，否则永远不要用 `overlap: 0` 旋转，并用 `WEBHOOKS_ENCRYPTION_KEYS` 密封它们。把钥匙放在一个秘密管理器里。
- 修剪原木。`deliveries.prune('30d')` 来自 [cron 作业](/application/task-scheduling#declarative-cron-jobs)；没有什么能为你安排的。
- 对于传入的 webhooks，保持 `rawBody: true`，并将接收者的秘密保存在环境中。在提供者轮换时列出新旧秘密。
- 使提供程序处理程序在其自身的权限（事务内部的状态检查）中保持简短和幂等，即使 `processInTransaction()`：收件箱防止重新传递，检查针对为一个事实发送两个不同事件的提供者。
- 修剪收件箱 `OutboxInbox.prune()` 在比任何提供者的重试时间表都长的窗口上（条纹重试三天，GitHub 根本不重试）。对于 GitHub，该窗口也是捕获重放请求的时长，重复数据删除键在主体上（[Other senders](/http/webhooks#other-senders)).
- 呼吁 `app.enableShutdownHooks()`，因此部署让飞行中的尝试完成并释放其余的。
- 对于您自己的商店，请使用 `concurrent: true` 在 CI，与生产中运行的数据库版本相比。

#### 商店合同

`PostgresWebhookStore` 和 `MySqlWebhookStore` 实现包的两个合同，`WebhookEndpointStore` 和 `WebhookDeliveryStore`。对于另一个数据库，请在您自己的提供程序中实现它们。两个接口中每个方法的 JSDoc 声明了它的规则，以及它阻止的竞争。

**注册。**该商店是一家普通的单身供应商，致电 `registerSource()` 关于注射剂 `WebhooksStorage` 在其构造函数中，命名它实现的合同：`endpoints`,`deliveries`，或者两者都来自一个类。注册表会立即检查形状，除非通过，否则拒绝第二次注册 `replace: true`，并在 `WebhooksModule` 初始化，记录正在使用的存储。在没有注册任何内容的情况下，该模块使用 `InMemoryWebhookStore`，它会在重新启动时丢失端点和挂起的交付，并且无法在实例之间共享它们。和 `NODE_ENV=production`，启动失败，除非 `allowInMemoryStorage: true` 接受吧。

**没有事务处理。**与发件箱不同 `add()` 这里没有任何方法可以获取您的事务：发件箱将消息从您的事务中带出，而 webhook 存储在它自己的连接上运行。

**方法。**标记为原子的是一个条件语句或一个带有行锁的事务，从来不是读后写；他们是合同套房比赛的人。

| 方法 | 它的作用 | 原子的 |
| --- | --- | --- |
| `createEndpoint`,`getEndpoint`,`listEndpoints`,`updateEndpoint`,`deleteEndpoint` | 端点的生命周期；`list` 最新优先，由租户提供 | 不是 |
| `findSubscribedEndpoints(tenant, type)` | 该租户的启用端点订阅了类型（或 `*`）：扇出的查询 | 没有，但套房检查过它从来没有退回过另一个房客的 |
| `addEndpointSecret(id, secret, expireOthersAt, now)` | 轮换：新秘密先行，其他秘密过期 | 是：行被锁定，所以两次旋转都落地 |
| `recordEndpointFailure(id, failure)` | 集合 `failingSince` 关于第一次失败；一旦端点失败足够长的时间，就禁用它，并说一次 | 是：行已锁定 |
| `recordEndpointSuccess(id)` | 清除 `failingSince` | 不是 |
| `createDeliveries(message, deliveries)` | 扇出：消息，除非它存在，每次传递，除非它 `(messageId, endpointId)` 存在 | 是：对上的唯一键，如 PostgreSQL 的 `ON CONFLICT DO NOTHING` 在上面 |
| `claimDeliveries(request)` | 租赁到期交付，大多数先逾期，并附上他们的信息 | 是的：`FOR UPDATE SKIP LOCKED`，那么租约 |
| `recordDeliveryAttempt(id, owner, update)` | 尝试的结果和日志行，如果 `owner` 仍持有租赁 | 是：由租赁业主围起来 |
| `releaseDeliveries(ids, owner, nextAttemptAt)` | 退还租约，要求时推迟 | 是：围栏 |
| `getDelivery`,`getMessage`,`listDeliveries`,`listDeliveryAttempts`,`deliveryStats` | 阅读；`list` 最新优先，按租户、端点、消息、状态和类型 | 不是 |
| `retryDeliveries(filter, now)` | 新一轮未租借的比赛 | 是：一个 `UPDATE` 租赁 `WHERE` |
| `pruneDeliveries(before)` | 成品交付时间早于 `before`，他们的日志，以及未送达的消息 | 不，但从来没有待处理的交货 |

**用 `webhookEndpointStoreContract()` 和 `webhookDeliveryStoreContract()` 中的 `@nestjs/webhooks/testing` 测试它**。每个案例都从您传递的函数中获得一个空表中的存储。本教程的测试针对 `PostgresWebhookStore` 到 Drizzle 运行两个套件，就像您对自己的套件运行一样：

```typescript
/** A store on emptied tables, built the way Nest builds it: with the database and a registry. */
async function freshStore(db: Database) {
  await db.execute(sql.raw(`TRUNCATE ${STORE_TABLES.join(', ')} RESTART IDENTITY`));
  return { store: new PostgresWebhookStore({ executor: fromDrizzle(db) }, new WebhooksStorage()) };
}

// ...

// The concurrency cases run too; with one connection, PGlite runs them one statement at a time.
describe('the endpoint contract', () => {
  for (const c of webhookEndpointStoreContract(() => freshStore(db), { concurrent: true })) {
    it(c.name, c.run);
  }
});
describe('the delivery contract', () => {
  for (const c of webhookDeliveryStoreContract(() => freshStore(db), { concurrent: true })) {
    it(c.name, c.run);
  }
});
```

和 `concurrent: true` 套件在一个端点上竞争轮换和失败，工人并排索赔，一条消息的扇出，一个陈旧的工人反对收购，以及一个重试反对索赔。在 PGlite 上，有了一个连接，它们就会通过序列化：也可以在服务器上运行它们，通过几个连接的池，在那里没有正确锁的存储会失败它们。软件包自己的测试运行套件与手写的 Drizzle 存储，作为针对接口编写的存储通过它们的证明。

#### 参考

##### 模块选项

`WebhooksModule.forRoot()` 采用这些选项。`forRootAsync()` 取 `outgoing`、`transport`（作为一个类）、`imports` 和 `isGlobal` 在顶层，紧邻 `useFactory`、`useClass` 或 `useExisting`，工厂返回其余。参见 [Register the modules](/http/webhooks#register-the-modules)。

| 选择 | 默认的 | 描述 |
| --- | --- | --- |
| `eventTypes` | 任何类型 | 此应用程序发送的消息类型。`dispatch()` 和新端点仅接受这些（端点也接受 `*`）。 |
| `retry` | 10 次尝试 | `attempts` （包括第一个）， `backoff` 和 `retryIf(error, attempt, delivery)`.一组数字 `attempts`，和 `false` 意味着一次尝试。 |
| `retry.backoff` | 参见说明 | `delay`（`'5s'`）、`factor`（4）、`maxDelay`（`'1d'`，也是 `Retry-After` 的上限）、`jitter`：`'equal'`、`'full'` 或 `'none'`（`'equal'`）。或者返回持续时间的尝试、错误和传递的函数。 |
| `disableEndpointAfter` | `'5d'` | 禁用长时间以来每次尝试都失败而没有成功的端点。`false` 永远不要禁用一个。 |
| `secretRotationOverlap` | `'24h'` | 一个轮换出来的秘密会在新的秘密旁边签名多久。 |
| `delivery.timeout` | `'15s'` | 一次尝试：DNS、连接、TLS、请求和响应。短于 `worker.lease`。 |
| `delivery.allowHttp` | `false` | 接受 `http://` 端点 URL。为了发展。 |
| `delivery.allowPrivateNetworks` | `false` | 提供环回、私有、共享地址和唯一本地范围。为了发展。链路本地和云元数据地址保持阻止。 |
| `delivery.allowedAddresses` | 没有一个 | CIDR 范围，例如 `10.20.0.0/16`，尽管他们会被阻止。 |
| `delivery.maxResponseSize` | 4096 | 读取响应体的字节并将其保存在日志中。 |
| `delivery.userAgent` | `NestJS-Webhooks/1.0` | 这个 `User-Agent` 头球。 |
| `worker.enabled` | `true` | 在这个过程中交付。`false` 在仅调度的情况下。 |
| `worker.pollInterval` | `'1s'` | 空闲时轮询之间的等待。`notify()` 立即投票。 |
| `worker.batchSize` | 50 | 每次投票声称的交付量。 |
| `worker.concurrency` | 10 | 并行传递到的端点。一个端点的交付一次一个。 |
| `worker.lease` | `'1m'` | 索赔是独家的多长时间。比 `delivery.timeout` 长。 |
| `encryption` | 离开 | 静止时密封端点秘密。`keys` 列出 32 字节 `Buffer`s 或至少 32 个字符的字符串，最新的在前：第一个密钥加密，每个密钥解密。 |
| `receivers` | 没有一个 | 此应用程序接受其 webhooks 的发件人名称 `@VerifyWebhook()` 用途（见下表）。 |
| `transport` | `HttpWebhookTransport` | 一个 `WebhookTransport` 顶级的类，或者来自异步工厂的实例。 |
| `allowInMemoryStorage` | `false` | 允许生产应用程序在没有注册存储的情况下启动。 |
| `outgoing` | `true` | 仅限顶级。`false` 在只接收 webhooks 的服务中：没有端点、交付、工作人员或商店。 |
| `imports` | 没有一个 | 仅限顶级。传输类注入其导出的模块。 |
| `isGlobal` | `true` | 仅限顶级。全局注册模块。 |

持续时间是毫秒或字符串，如 `'15s'`、`'24h'` 或 `'5d'`。选项的注入令牌是 `WEBHOOKS_MODULE_OPTIONS`。

`receivers` 的每个条目都采用以下选项（参见 [Receive the payment provider's webhooks](/http/webhooks#receive-the-payment-providers-webhooks) 和 [Receive the carrier's Stripe-like webhooks](/http/webhooks#receive-the-carriers-stripe-like-webhooks)）：

| 选择 | 适用于 | 默认的 | 描述 |
| --- | --- | --- | --- |
| `scheme` | 全部 | 所需 | `'standard'`,`'stripe'`,`'github'`，或扩展的类的实例 `WebhookSignatureScheme` |
| `secret` | 全部 | 所需 | 一个秘密，或者发送者旋转时的数组。每一个都尝试过。 |
| `tolerance` | `standard`,`stripe`, 自定义 | `'5m'` | 在任一方向上，签名时间戳和现在之间的最大可接受距离 |
| `header` | `stripe` | `'stripe-signature'` | 签名头，用于复制 Stripe 方案的发件人 |
| `id` | `stripe`,`github` | 有效载荷的 `id`；未签名的 `X-GitHub-Delivery` 标头（参见 [Other senders](/http/webhooks#other-senders)） | 有效载荷和标头的函数，返回重复数据删除 id，最多 255 个字符 |
| `dedupe` | 全部 | `true` | 跳过此接收器已处理的 webhook id |
| `consumer` | 全部 | `webhooks:<name>` | 收件箱使用者名称。保持稳定。最多 255 个字符，包括默认值：较长的字符会导致启动失败 `TypeError` |

##### PostgreSQL 和 MySQL 存储

`new PostgresWebhookStore(options, webhooksStorage)`，从 `@nestjs/webhooks/postgres`，和 `new MySqlWebhookStore(options, webhooksStorage)`，从 `@nestjs/webhooks/mysql`，采取这些选项。发件箱的 `PostgresOutboxStore` 和 `MySqlOutboxStore` 取相同，`'nest_outbox'` 为默认值 `schema`：

| 选择 | 默认的 | 意义 |
| --- | --- | --- |
| `executor` | 所需 | 商店如何访问数据库：`fromDrizzle(db)`,`fromTypeOrm(dataSource)`,`fromPrisma(prisma, options)`,`fromKysely(db)`，和 `fromPg(pool)` 在 PostgreSQL 或 `fromMysql2(pool)` 在 MySQL 上，从存储库自己的子路径导入：另一个方言的执行器不编译 |
| `schema` | `'nest_webhooks'` | 在 PostgreSQL 上，它的第一次迁移创建了表的模式：字母、数字和下划线，不以数字开头，最多 63 个字符。在 MySQL 上，连接数据库中表的前缀（`nest_webhooks_endpoints`...)：小写字母、数字和下划线，不以数字开头，最多 40 个字符 |
| `migrate` | `true`，除了 `NODE_ENV=production` | 在应用程序启动时应用挂起的迁移。和 `false`，启动失败 `WebhookSchemaError` 而模式在后面 |

每个执行器获取您的数据库客户端及其自己类型的事务对象，`dispatch()` 和 `processInTransaction()` 然后采取：

| 执行人 | 采取 | 交易对象 |
| --- | --- | --- |
| `fromDrizzle(db)` | 一个 Drizzle 数据库：在 PostgreSQL 上，无论它的驱动程序是什么；在 MySQL 上，`drizzle-orm/mysql2` 的 | 这个 `tx` 那个 `db.transaction()` 递交其回调 |
| `fromTypeOrm(dataSource)` | 一个 `DataSource` 类型 `postgres` 或者 `mysql` | 这个 `EntityManager` 那个 `dataSource.transaction()` 递交其回调，或 `QueryRunner` 之后 `startTransaction()` |
| `fromPg(pool)` | 节点-postgres`Pool` 在 PostgreSQL 上 | 客户来自 `pool.connect()`, 之后 `BEGIN` |
| `fromMysql2(pool)` | 一个 `mysql2/promise` 池，在 MySQL 上 | 来自 `pool.getConnection()`, 之后 `beginTransaction()` |
| `fromPrisma(prisma, options)` | 一个 Prisma 客户端，通过驱动程序适配器，例如 `@prisma/adapter-pg`, 或 `@prisma/adapter-mariadb` 在 MySQL 上。`maxWait`（默认 `'10s'`）和 `timeout`（默认 `'1m'`) 限制商店自己的交易 | 事务客户端 `prisma.$transaction()` 递交其回调 |
| `fromKysely(db)` | 一个 `Kysely` 使用 PostgreSQL 或 MySQL 方言的实例 | 交易 `db.transaction().execute()` 递交其回调 |

商店的 `migrate()` 方法立即应用挂起的迁移，无论 `migrate` 选项说，并根据应用的版本进行解析。`PostgresWebhookStore.migrationSql()` 和 `MySqlWebhookStore.migrationSql()` 返回他们的 SQL 记账。他们的选择是 `schema`，要去的版本 `from`（默认 `0`，一个新数据库）和 `to`（默认值：包需要的那个），以及 `statementBreakpoints` 它把毛毛雨包的 `--> statement-breakpoint` 陈述之间。在 PostgreSQL 上，从版本 0 开始，SQL 开始于 `CREATE SCHEMA IF NOT EXISTS`，这需要 CREATE 数据库权限：如果有人为您创建了模式，请将其排除在外。`MySqlWebhookStore.migrationStatements()` 每个字符串返回一个 MySQL 语句，按顺序运行一次。`schemaVersion` 是包需要的版本。模式自己的版本在其 `migrations` 桌子。

命令行 `npx @nestjs/webhooks` 采用 `--url`（默认 `DATABASE_URL`），其方案选择存储：`postgres://` 或 `postgresql://` 表示 `PostgresWebhookStore` 的模式，`mysql://` 表示 `MySqlWebhookStore` 的表。它也需要 `--schema`（默认 `nest_webhooks`）。`npx @nestjs/outbox` 对 outbox 的存储执行相同的操作：

| 命令 | 它的作用 |
| --- | --- |
| `migrate` | 应用挂起的迁移，如 `migrate: true` 启动时有。需求 `pg` 或者 `mysql2` 已安装 |
| `status` | 打印模式的版本和包需要的版本，并在模式落后时以 1 退出 |
| `sql` | 打印 `migrationSql()` 的 SQL，从 `--from` 到 `--to`，不带数据库：PostgreSQL，或带有 `--dialect mysql` 的 MySQL。`--statement-breakpoints` 分隔 drizzle-kit 的语句 |

##### 服务和装修商

- `Webhooks`:`dispatch(tx, message)` 获取一条消息或数组，其中 `type`,`data`,`tenant` 和可选的 `id`，并抛出一个 `TypeError` 对于未知类型，数据不是 JSON-可序列化或无效 id。`notify()` 现在运行继电器。
- `WebhookEndpoints`：`create(input)`、`list(query)`、`get(id, scope)`、`update(id, changes, scope)`、`delete(id, scope)`、`getSecret(id, scope)` 和 `rotateSecret(id, options)`，其中 `options` 取 `tenant`、`overlap` 和 `secret`。`create()` 也使用一个 `secret`，一个现有的 `whsec_…`，而不是一个生成的。参见 [Let partners subscribe](/http/webhooks#let-partners-subscribe)。
- `WebhookDeliveries`：`list(query)`、`get(id, scope)`、`retry(idOrFilter, scope)`、`stats()` 和 `prune(olderThan)`。参见 [Retries, the delivery log and replay](/http/webhooks#retries-the-delivery-log-and-replay)。
- `WebhookWorker`：传递器，在应用程序启动时启动，除非 `worker.enabled` 是 `false`。`start()`;`stop()`，它停止索赔，等待飞行中的尝试，并释放它尚未开始的交付；`running`;`notify()`，它现在轮询，而不是在下一个刻度；`runOnce()`，它认领一批并交付它，解决它有多少 `claimed`、`delivered`、`retried`、`failed` 和 `released`，以及它有多少失去了租约（`leaseLost`），并且它与工人停止工作，因为测试驱动它；`stats()`，与 `WebhookDeliveries.stats()` 相同。
- `WEBHOOKS_OUTBOX_TOPIC`：发送邮件的发件箱主题， `'nestjs.webhooks.message'`，到包的 `@OnOutboxMessage()` 处理器，扇出。发件箱 `route` 从几个传输中选择将此主题发送到 `local`.
- `WebhookVerifier`：`verify(receiver, request)` 检查未到达 HTTP 路由的请求，例如存储在队列中的请求，从其 `headers` 和 `rawBody` 检查。
- `@VerifyWebhook(receiver)` 对方法或控制器进行验证和重复数据删除。`@IncomingWebhook()` 注入经过验证的 webhook：`receiver`、`id`、`timestamp`、`payload`、`rawBody` 和 `processInTransaction()`。`@WebhookPayload()` 单独注入有效载荷，并使用像 `@Body()` 这样的管道。

##### 运输

工人通过 `WebhookTransport` 供应商。默认值，`HttpWebhookTransport`，是从 `delivery` 选项：一 `POST` 每次尝试超过 `node:http` 和 `node:https`，主机解析一次，它解析的每个地址都被选中，套接字固定到被选中的地址，重定向从未跟踪，没有来自环境的代理。它的构造函数有两个选项 `delivery` 没有：

- `ca`：除了 Node 自己的证书颁发机构之外，还要信任私有 CA 后面的端点的证书颁发机构。它们被添加到 Node 的信任存储中，因此公共端点继续验证。
- `lookup`：将主机名解析为它拥有的每个地址，每个 `address` 及其 `family`（4 或 6），代替系统旋转变压器。它返回的每个地址仍然被检查，连接转到第一个地址。

若要使用它们，请将实例传递为 `transport`，具有相同的 `allowHttp`,`allowPrivateNetworks` 和 `allowedAddresses` 作为 `delivery`:`delivery` 仍然决定哪些网址 `WebhookEndpoints` 接受，以及它所连接的传输。

```typescript
WebhooksModule.forRoot({
  delivery: { allowedAddresses: ['10.20.0.0/16'] },
  transport: new HttpWebhookTransport({
    allowedAddresses: ['10.20.0.0/16'],
    ca: readFileSync('/etc/ssl/partners-ca.pem'),
  }),
}),
```

您自己的传输扩展 `WebhookTransport` 和工具 `send(request, options)`，其中 `options` 有尝试的 `signal` 及其 `attempt` 数字。请求携带 `url`，签名 `headers` 和 `body` 以及其端点、传递和消息的 ID。用答案解决 `statusCode`, `headers` 以及它的开始 `body`，无论状态如何，只有在没有响应时才抛出；停止时 `signal` 流产后 `delivery.timeout`. `NonRetryableWebhookError` 和 `WebhookDestinationBlockedError` 未经重试而导致交付失败；任何其他错误都会重试。通过类为 `transport` 在最高层 `forRoot()` 或者 `forRootAsync()`，其中 Nest 实例化它（`imports` 对于它注入的模块），或实例。它取代了 SSRF 警惕它自己做的任何事情：通过一个执行一个出口代理，如 Smokescreen，发送一个出口代理，是编写一个出口代理的理由；包装 `HttpWebhookTransport` 保持警惕。

对于测试，`InMemoryWebhookTransport` 记录而不是发送，没有网络或地址检查（参见 [Testing](/http/webhooks#testing)）：

- `sent`：每个请求，最旧的在前，作为 `SentWebhook` 南。`clear()` 清空它。
- `respondWith(answer)`：从现在开始端点如何响应，在此之前 200。状态（`503`），一个响应（`statusCode`,`headers` 如 `retry-after`,`body`），或请求和尝试号的函数，返回任意一个并抛出以模拟无响应。
- `filter(query)` 和 `single(query)`：匹配 `type`、`url`（字符串或 `RegExp`）、`endpointId` 和 `messageId` 或 `SentWebhook` 的函数的请求。`single()` 抛掷，列出发送的内容，除非恰好有一个匹配。

一个 `SentWebhook` 有 `request`，这个 `attempt` 其回合内的数字，`sentAt`，请求是 `url`,`type`,`messageId`,`endpointId`,`deliveryId`,`headers` 和 `body`,`data`（尸体的 `data`，解析），和 `isSignedWith(secret)`，它检查一个 `v1` 针对端点的秘密签名。

##### 事件

`WebhooksEvents.events$` 输出每个事件，并且每个事件也发布在诊断通道 `nestjs:webhooks:<type>` 上。

| 类型 | 有效载荷类型 | 字段除外 `type` |
| --- | --- | --- |
| `delivered` | `WebhooksDeliveredEvent` | `delivery`,`statusCode`,`attempt`,`durationMs` |
| `retry-scheduled` | `WebhooksRetryScheduledEvent` | `delivery`,`error`,`statusCode`(`null` 没有反应），`attempt`,`delayMs` |
| `delivery-failed` | `WebhooksDeliveryFailedEvent` | `delivery`,`error`,`statusCode`,`attempt`,`reason` |
| `endpoint-disabled` | `WebhooksEndpointDisabledEvent` | `endpointId`、`tenant`、`reason`（`'failing'` 或 `'gone'`） |
| `destination-blocked` | `WebhooksDestinationBlockedEvent` | `endpointId`,`tenant`,`reason`,`address` |
| `verification-failed` | `WebhooksVerificationFailedEvent` | `receiver`,`reason` |

失败传递的 `reason` 是 `exhausted`、`rejected`（410 丢失，目的地被阻塞，`NonRetryableWebhookError` 或 `retryIf`）、`endpoint-disabled` 或 `endpoint-deleted`。验证失败的 `reason` 是 `missing-header`、`malformed-header`（webhook id 也大于 255 个字符）、`invalid-signature`、`timestamp-out-of-tolerance` 或 `invalid-payload`。`WebhooksEvent` 是所有有效载荷类型的并集。

##### 错误

除了 `NonRetryableWebhookError` 扩展 `WebhooksError`.那些有 `status` 是为合作伙伴准备的 API 的异常筛选器，如 [Let partners subscribe](/http/webhooks#let-partners-subscribe).

| 错误 | 状况 | 投掷时 |
| --- | --- | --- |
| `InvalidWebhookEndpointError` | 400 | 端点的 URL，事件类型或秘密将被拒绝。`field` 说出哪一个。 |
| `WebhookEndpointNotFoundError` | 404 | 端点不存在，或者属于其他租户 |
| `WebhookDeliveryNotFoundError` | 404 | 交付不存在，或属于其他租户 |
| `WebhookVerificationError` | 401 或 400 用于 `invalid-payload` | `WebhookVerifier.verify()` 拒绝请求。它有 `receiver` 和 `reason`。 |
| `WebhookDestinationBlockedError` | 没有一个 | 端点的 URL 是或解析为被阻塞的地址。未经重试，传递失败。 |
| `WebhookResponseError` | 没有一个 | 端点在 2xx 之外响应。它有 `statusCode`，和 `retryAfterMs` 从一个 `Retry-After` 头球。 |
| `WebhookDeliveryTimeoutError` | 没有一个 | 内无响应 `delivery.timeout` |
| `NonRetryableWebhookError` | 没有一个 | 自定义传输会使传输失败而无需重试 |
| `WebhookSchemaError` | 没有一个 | 存储的模式是包迁移的后面，而 `migrate` 已关闭，或应用它们失败（`cause`)：启动，每次调用都会失败，直到修复为止。它有 `schema`,它的 `version` 和 `requiredVersion`.从 `@nestjs/webhooks/postgres` 和 `@nestjs/webhooks/mysql` |

`@VerifyWebhook()` 对被拒绝的请求使用 401（对于未被签名的主体使用 400JSON）和通用消息，原因在于 `verification-failed` 事件。如果请求的主体没有保持原始，则会得到 415JSON 或者一个表格，以及一个记录丢失的 500`rawBody: true` 否则。
