# Distributed locks

Source: https://docs.nestjs.com/reliability/locks

一家猫粮和用品在线商店使用 `@nestjs/schedule` 运行两个预定作业。每天晚上 02:00，出口将当天的发票发送到会计系统，每隔五分钟，对账就会要求仓库提供完整的库存数量，并将其写入产品表中。两者都在一个实例上工作。在生产中，订单 API 在三个上运行，`@nestjs/schedule` 在每个上触发每个 `@Cron()`：

- 会计系统记录每张发票三次。
- 仓库每五分钟被要求进行三次完整的计数。一个完整的计数遍历整个目录，在月底需要超过五分钟，所以下一个计数开始第二次计数，然后是第三次。

通常的修复有洞。一个 `RUN_JOBS=true` 实例一直有效，直到滚动部署有两个实例持续一分钟，或者作业实例是死亡的实例。一个 `SET NX` 键入 Redis 在工作的顶部工作，直到其持有者暂停的时间比钥匙的时间长 TTL 在停止世界的垃圾收集中或网络分区后面：另一个实例获取密钥，当第一个实例唤醒时，它结束运行，认为它仍然持有密钥。又是两个作家，都不知道。`waitForCompletion: true` 在 `@Cron()` 在一个实例中，阻止作业本身重叠。

`@nestjs/locks` 将一个作业变成一个实例持有的东西：一个**租赁**，持有者在它到期时不断更新，在每个实例共享的存储中签入。两个装修工把它放在了预定的工作中， `@OnOneInstance()` 和 `@WithoutOverlapping()` 本着 Laravel 的精神 `onOneServer()` 和 `withoutOverlapping()`.下面是一个分布式锁，你也可以自己拿，锁需要信任两件事： `AbortSignal` 当租约丢失时，它会中止，并且随着每次获得密钥而增加的**围栏令牌**，因此在租约结束后暂停的持有人的信函可以被拒绝。领导人选举是同样的租约，只要领导人活着，就会举行。

在本教程中，您将使用 Drizzle 将其添加到 PostgreSQL 上的存储中：

- 在应用程序的三个实例上通过测试证明重复运行。
- 将锁保存在应用程序数据库的表中。
- 在一个实例上运行每个作业，当该实例死亡时进行切换。
- 防止长库存计数重叠。
- 栅栏库存写入，因此暂停的实例不能覆盖较新的计数。
- 从管理端点手动运行导出，切勿与计划运行同时运行。
- 把锁锁住 Redis 反而。
- 在一个实例中保持仓库的警报源，并进行领导者选举。

#### 安装

要开始，请安装所需的依赖项：

```bash
$ npm i --save @nestjs/locks
```

#### 看到问题

这是教程之前的应用。nightly export 接收每个尚未开具发票的订单，上传批次，并用批次 id 标记订单：

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { Cron } from '@nestjs/schedule';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import type { Database } from '../database/drizzle.js';
import { orders } from '../database/schema.js';
import { AccountingClient } from './accounting.client.js';

@Injectable()
export class InvoiceExportJob {
  private readonly logger = new Logger(InvoiceExportJob.name);

  constructor(
    @InjectDrizzle() private readonly db: Database,
    private readonly accountingClient: AccountingClient,
  ) {}

  @Cron(process.env.INVOICE_EXPORT_CRON ?? '0 2 * * *', { name: 'invoice-export', timeZone: 'Europe/Warsaw' })
  async exportInvoices() {
    // Every placed order without an invoice, not "yesterday's orders": a night
    // the export didn't run is caught up the next night.
    const pending = await this.db
      .select()
      .from(orders)
      .where(and(eq(orders.status, 'placed'), isNull(orders.invoicedAt)))
      .orderBy(orders.placedAt);
    if (pending.length === 0) {
      return;
    }

    const batch = await this.accountingClient.uploadInvoices(
      pending.map((order) => ({
        orderId: order.id,
        userId: order.userId,
        total: order.total,
        placedAt: order.placedAt.toISOString(),
      })),
    );
    await this.db
      .update(orders)
      .set({ invoicedAt: new Date(), invoiceBatch: batch.batchId })
      .where(inArray(orders.id, pending.map((order) => order.id)));
    this.logger.log(`Exported ${pending.length} invoices in batch ${batch.batchId}`);
  }
}
```

会计系统记录它收到的每一个批次，所以上传两次的一个批次被记录两次。对账要求仓库提供计数并写下：

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { StockRepository } from './stock.repository.step-1.js';
import { WarehouseClient } from './warehouse.client.js';

@Injectable()
export class StockReconciliationJob {
  private readonly logger = new Logger(StockReconciliationJob.name);

  constructor(
    private readonly warehouseClient: WarehouseClient,
    private readonly stockRepository: StockRepository,
  ) {}

  @Cron(process.env.STOCK_RECONCILIATION_CRON ?? CronExpression.EVERY_5_MINUTES, { name: 'stock-reconciliation' })
  async reconcileStock() {
    const counts = await this.warehouseClient.stockCounts();
    const written = await this.stockRepository.writeStock(counts);
    this.logger.log(`Reconciled stock for ${written} products`);
  }
}
```

cron 表达式来自环境，默认为实际时间表，因此测试和 [Try it](/reliability/locks#try-it) 部分可以加速或关闭它们。`AccountingClient` 和 `WarehouseClient` 代表两个外部系统；每个人都算它被要求做什么。数据库是应用程序的，在 `app.module.ts` 中用 `DrizzleModule` 注册，并用 `@InjectDrizzle()` 注入。

> info **Hint** 教程中写道 `process.env` 直接，长话短说。在应用程序中，通过 [`@nestjs/config`](/application/configuration) 使用验证模式，因此缺少的变量会在启动时而不是在第一个请求时停止应用程序，并从 `ConfigService`.

在改变任何事情之前，先证明问题。测试在一个进程中，在一个数据库上启动三个应用程序实例（PostgreSQL in-process with[PGlite](https://pglite.dev)，或配置了 PostgreSQL 服务器），并通过 `@nestjs/schedule` 自己的注册表，02:00 将：

```typescript
describe.each(targets)('three instances with plain @Cron() jobs, on %s', (_, target) => {
  let database: TestDatabase;
  let accounting: FakeAccounting;
  let warehouse: FakeWarehouse;
  let instances: TestingModule[];
  let logger: CapturingLogger;

  beforeEach(async (context) => {
    if (!target) {
      return context.skip();
    }
    database = await openDatabase(target, 'locks_step_1');
    accounting = new FakeAccounting();
    warehouse = new FakeWarehouse();
    logger = new CapturingLogger();
    instances = [];
    for (let i = 0; i < 3; i++) {
      instances.push(await startInstance({ database, module: StepOneApp, accounting, warehouse, logger }));
    }
  });
  afterEach(async () => {
    for (const app of instances ?? []) {
      await app.close();
    }
    await database?.close();
  });

  /**
   * 02:00: every instance's scheduler fires the job, through @nestjs/schedule's own
   * callback (which doesn't wait for the job to finish).
   */
  const tick = (name: string) =>
    Promise.all(instances.map((app) => app.get(SchedulerRegistry).getCronJob(name).fireOnTick()));

  it('records every invoice three times', async () => {
    await tick('invoice-export');
    await until(() => logger.matching('Exported 3 invoices').length === 3);
    const orders = ['ord_1001', 'ord_1002', 'ord_1004'];
    expect(booked(accounting)).toEqual([orders, orders, orders]);
    // The orders point at whichever batch wrote last; the accounting system has all three.
    const rows = await database.query<{ invoice_batch: string }>(
      "SELECT DISTINCT invoice_batch FROM orders WHERE status = 'placed'",
    );
    expect(rows).toHaveLength(1);
  });

  it('asks the warehouse for three full counts every five minutes', async () => {
    await tick('stock-reconciliation');
    await until(() => logger.matching('Reconciled stock').length === 3);
    expect(warehouse.counts).toBe(3);
  });
});
```

三批，每批都有相同的三个订单，三个完整的计数。这个 `orders` 表之后看起来很好，每个订单都有一个批次 id，这就是为什么在会计调用之前不会被注意到。

#### 在数据库中保留锁

`@nestjs/locks` 导入后即可工作 `LocksModule`，在内存存储中。该存储仅在一个进程中排除调用者：三个实例各有自己的实例，所有三个实例都将接受“the”锁，并且什么都不会改变。锁需要每个实例共享一个存储，而包不运送一个。它定义了合同，`LockStore` 接口，然后在应用程序的提供程序中使用它已经拥有的数据库实现它。

本节显示了两次存储：第一次是在 PostgreSQL 上使用 Drizzle，通过 [`@nestjs/drizzle`](/data/drizzle) 使用 `pg` 驱动程序注册，这是教程的路径，然后，在本节末尾的“使用 TypeORM”下，为 ORM 为 TypeORM 的应用程序存储相同的存储。取两者中的一个，或者将锁与 [the store on Redis](/reliability/locks#the-store-on-redis) 一起保留在 Redis 中。对于 Drizzle，锁是每个键一行：

```typescript
// The locks, read and written by DrizzleLockStore: one row per lock key.

export const locks = pgTable('locks', {
  key: text('key').primaryKey(),
  /** The holder's id; null once released. */
  owner: text('owner'),
  fencingToken: bigint('fencing_token', { mode: 'number' }).notNull(),
  /** On the database's clock: every instance agrees on it. */
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
});

/** Fencing tokens for every key: a sequence never goes back, so they only grow. */
export const locksFencingTokenSeq = pgSequence('locks_fencing_token_seq');
```

drizzle-kit 编写迁移：

```bash
$ npx drizzle-kit generate --name=locks
$ npx drizzle-kit migrate
```

```sql
CREATE SEQUENCE "public"."locks_fencing_token_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE TABLE "locks" (
	"key" text PRIMARY KEY NOT NULL,
	"owner" text,
	"fencing_token" bigint NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
```

合同有三种方法，每种方法都需要锁钥匙和一个 `owner` 首先：包为每次获取抽取的随机 id。持续时间以毫秒为单位。

- `acquire(key, owner, ttl)` 如果没有活动锁持有密钥，则获取密钥，并返回锁的围栏令牌，或报告密钥已被获取。它必须是原子的：在任何数量的并发呼叫者中，正好有一个可能会获胜。
- `renew(key, owner, ttl)` 是心跳。它将到期日移至 `ttl` 从现在开始，如果 `owner` 钥匙上仍然有一把活锁。包称之为每一个 `ttl / 3` 当锁被拿着的时候。
- `release(key, owner)` 归还锁，如果 `owner` 还拿着它。

“如果 `owner` 仍然持有它”必须在同一份声明中进行检查，该声明写道：首先在单独的阅读中进行检查，收购可能会介于两者之间。和商店措施 `ttl` 有自己的时钟，所以每个实例都同意锁何时到期，无论它们的时钟说什么。和 Drizzle，即一个条件插入和两个条件更新：

```typescript
import { Injectable } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { LocksStorage, type LockAcquireResult, type LockStore } from '@nestjs/locks';
import { and, eq, gt, sql } from 'drizzle-orm';
import type { Database } from './drizzle.js';
import { locks } from './schema.js';

/** `ttl` from now, on the database's clock. */
const expiresIn = (ttl: number) => sql`clock_timestamp() + ${ttl} * interval '1 millisecond'`;

/** The lock on `key`, if `owner` still holds it: the compare-and-set of renew() and release(). */
const heldBy = (key: string, owner: string) =>
  and(eq(locks.key, key), eq(locks.owner, owner), gt(locks.expiresAt, sql`clock_timestamp()`));

@Injectable()
export class DrizzleLockStore implements LockStore {
  constructor(
    @InjectDrizzle() private readonly db: Database,
    storage: LocksStorage,
  ) {
    storage.registerSource(this);
  }

  async acquire(key: string, owner: string, ttl: number): Promise<LockAcquireResult> {
    // One statement: insert the lock, or take over a released or expired one. Of any number
    // of concurrent callers, one inserts or updates the row; the others find it held.
    const [row] = await this.db
      .insert(locks)
      .values({ key, owner, fencingToken: sql`nextval('locks_fencing_token_seq')`, expiresAt: expiresIn(ttl) })
      .onConflictDoUpdate({
        target: locks.key,
        // nextval() here runs after the row is locked: a later holder always gets a
        // greater token than the one before it. The row's own token is the floor, so a
        // sequence that went back (a restore, a failover) can't hand a key an old token.
        set: {
          owner,
          fencingToken: sql`greatest(nextval('locks_fencing_token_seq'), ${locks.fencingToken} + 1)`,
          expiresAt: expiresIn(ttl),
        },
        setWhere: sql`${locks.owner} is null or ${locks.expiresAt} <= clock_timestamp()`,
      })
      .returning({ fencingToken: locks.fencingToken });
    return row ? { acquired: true, fencingToken: row.fencingToken } : { acquired: false };
  }

  async renew(key: string, owner: string, ttl: number): Promise<boolean> {
    const rows = await this.db
      .update(locks)
      .set({ expiresAt: expiresIn(ttl) })
      .where(heldBy(key, owner))
      .returning({ key: locks.key });
    return rows.length === 1;
  }

  async release(key: string, owner: string): Promise<boolean> {
    // Keep the row, so the next acquire() always takes the update path above, whose token is
    // drawn after the row is locked.
    const rows = await this.db
      .update(locks)
      .set({ owner: null })
      .where(heldBy(key, owner))
      .returning({ key: locks.key });
    return rows.length === 1;
  }
}
```

关于这家店的几件事：

- **`acquire()` 是一个语句。**插入赢得一个没有行的键；这个 `ON CONFLICT DO UPDATE` 与其 `WHERE` 接管已发布或过期的一个，PostgreSQL 会重新检查 `WHERE` 锁定后对着那排。在许多争夺同一把钥匙的来电者中，一个人得到了一排回来，其余的一无所获。一个 `SELECT` 接着是一个 `INSERT` 会让他们几个进来。
- **围栏令牌来自一个序列**，在语句中绘制，在行锁之后。一个序列永远不会回来，所以每次获取一个密钥都会得到一个比前一个更大的令牌，跨越发布和到期。它有差距，因为输掉比赛的呼叫者仍然消耗一个值；没关系。这个 `greatest()` 使该行自己的令牌成为下一行的底层：如果序列确实返回（从备份恢复，故障转移到滞后的副本），键仍然无法获得它以前拥有的令牌。[Fence the writes](/reliability/locks#fence-the-writes) 显示令牌的用途。
- **`release()` 保留行**并清除所有者，因此下一次获取总是采用更新路径。通过删除，早期抽取令牌的插入可以在后来的持有者已经释放密钥后赢得密钥，并分发一个较小的令牌。
- **`clock_timestamp()`**，否 `now()`:`now()` 是事务的开始时间，这是锁的到期不能依赖于的时间。
- 为什么是桌子而不是 `pg_advisory_lock()`：咨询锁绑定到一个会话，因此持有者必须在整个关键部分中将一个连接检查出池外，将在不知道该连接何时丢失的情况下丢失锁，无法续订它，并且对于暂停的持有者没有到期，也没有围栏令牌。一行拥有所有这些，通过任何池。

软件包将合同作为测试套件发货，因此您可以在依赖它之前证明商店。`lockStoreContract()` 为任何测试运行器返回案例，以及 `concurrent: true` 添加种族：

```typescript
describe('DrizzleLockStore on PGlite, the LockStore contract', () => {
  const client = new PGlite();
  const db = drizzlePglite(client, { schema }) as unknown as Database;
  beforeAll(() => migratePglite(db as never, { migrationsFolder }));
  afterAll(() => client.close());

  // The concurrency cases run too; with one connection, PGlite runs them one statement at a time.
  const cases = lockStoreContract(() => new DrizzleLockStore(db, new LocksStorage()), { concurrent: true });
  for (const c of cases) {
    it(c.name, c.run);
  }
});
```

该示例在 PostgreSQL 服务器上运行相同的套件，该服务器有 20 个连接和 32 个竞赛调用者，其中的语句实际上是重叠的。那样运行 CI，在生产中运行的 PostgreSQL 版本上。

现在在应用程序的 `DrizzleModule` 旁边注册模块和存储。商店是一个普通的提供者；它的构造函数注册了它，所以没有什么需要配置的：

```typescript
import { Module } from '@nestjs/common';
import { DrizzleModule } from '@nestjs/drizzle';
import { LocksModule } from '@nestjs/locks';
import { ScheduleModule } from '@nestjs/schedule';
import { drizzle } from 'drizzle-orm/node-postgres';
import { DrizzleLockStore } from './database/drizzle-lock.store.js';
import * as schema from './database/schema.js';
import { InventoryModule } from './inventory/inventory.module.js';
import { InvoicesModule } from './invoices/invoices.module.js';

@Module({
  imports: [
    // A pg pool on DATABASE_URL, closed in onApplicationShutdown(), after running jobs
    // finished and handed their locks back. The jobs and the store inject it with @InjectDrizzle().
    DrizzleModule.forRootAsync({
      useFactory: () => ({ drizzle, connection: process.env.DATABASE_URL!, schema }),
    }),
    ScheduleModule.forRoot(),
    LocksModule.forRoot(),
    InvoicesModule,
    InventoryModule,
  ],
  providers: [DrizzleLockStore],
})
export class AppModule {}
```

`LocksModule.forRoot()` 需要一个 `ttl`（默认值为 `'30s'`：锁在没有续订的情况下存活多长时间，因此另一个实例在崩溃后多久接管），一个 `storeTimeout`（默认值为 `'10s'`：每个存储调用在失败前等待多长时间，因此停止响应的存储无法挂起作业、请求或关闭），一个 `clock` 用于测试，以及 `allowInMemoryStorage`。`forRootAsync()` 从工厂获取相同的选项。该模块是全局的，因此 `Locks`、`LocksContext` 和 `LocksStorage` 在任何地方都可用。初始化时，它会记录正在使用的存储：

```bash
[Nest] 1270  - 09/24/2026, 9:44:02 AM     LOG [LocksModule] LocksStorage: DrizzleLockStore
```

在没有注册任何内容的情况下，行名 `InMemoryLockStore` 这意味着什么。和 `NODE_ENV=production` 如果没有注册任何内容，应用程序就不会启动，因为在内存中，每个实例都会使用相同的锁并运行相同的作业：

```bash
Error: LocksStorage: no LockStore is registered, and NODE_ENV is "production": in memory, a lock only excludes callers in this process, so every instance of the app would take the same lock and run the same job. Implement LockStore in a provider that injects LocksStorage and calls `storage.registerSource(this)` in its constructor, or set `allowInMemoryStorage: true` in the LocksModule options to run in memory anyway (one instance).
```

**与 TypeORM.**应用程序的同一存储 ORM 是 TypeORM，在同一个表和序列上。Drizzle 坚持教程的路径：选择这个商店，而不是上面的商店，而不是它旁边。表是一个实体，每一列都声明其类型，因此 TypeORMCLI，它在没有 decorator 元数据的情况下加载它，它看到的模式与应用程序相同：

```typescript
import { Column, Entity, PrimaryColumn } from 'typeorm';

// The locks table, read and written by TypeOrmLockStore: the same table as the Drizzle
// schema in src/database/schema.ts. Every column states its type, so the entity loads the
// same with or without emitted decorator metadata (the TypeORM CLI runs it through tsx,
// which emits none).

@Entity('locks')
export class LockEntity {
  @PrimaryColumn({ type: 'text' })
  key: string;

  /** The holder's id; null once released. */
  @Column({ type: 'text', nullable: true })
  owner: string | null;

  /** Drawn from locks_fencing_token_seq, which the migration creates. `pg` returns a bigint as a string. */
  @Column({ type: 'bigint', name: 'fencing_token' })
  fencingToken: string;

  /** On the database's clock: every instance agrees on it. */
  @Column({ type: 'timestamptz', name: 'expires_at' })
  expiresAt: Date;
}
```

这个 TypeORMCLI 和 `TypeOrmModule` 在数据源文件中共享一组选项：

```typescript
import { DataSource, type DataSourceOptions } from 'typeorm';
import { LockEntity } from './lock.entity.js';
import { Locks1790321710846 } from './migrations/1790321710846-Locks.js';

/** What the application's TypeOrmModule and the TypeORM CLI share. */
export const dataSourceOptions = {
  type: 'postgres',
  url: process.env.DATABASE_URL,
  entities: [LockEntity],
  migrations: [Locks1790321710846],
} satisfies DataSourceOptions;

// The TypeORM CLI's data source: `migration:generate` compares the entities with this database.
export default new DataSource(dataSourceOptions);
```

根据应用了以前迁移的数据库，从实体生成迁移。CLI 需要一个 TypeScript 加载器来加载数据源文件；这使用 `tsx`：

```bash
$ npx tsx ./node_modules/typeorm/cli.js migration:generate src/typeorm/migrations/Locks -d src/typeorm/data-source.ts --pretty
Migration /store/src/typeorm/migrations/1790321710846-Locks.ts has been generated successfully.
```

TypeORM 没有序列的实体，因此它编写的迁移单独创建表。自己将序列添加到表格前面，并将其放入 `down()` 中：

```typescript
import { MigrationInterface, QueryRunner } from "typeorm";

export class Locks1790321710846 implements MigrationInterface {
    name = 'Locks1790321710846'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Added by hand: TypeORM has no entity for a sequence, so the CLI doesn't generate it.
        await queryRunner.query(`
            CREATE SEQUENCE "locks_fencing_token_seq"
        `);
        await queryRunner.query(`
            CREATE TABLE "locks" (
                "key" text NOT NULL,
                "owner" text,
                "fencing_token" bigint NOT NULL,
                "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                CONSTRAINT "PK_c6e1e10d298aec42ba087dd57e5" PRIMARY KEY ("key")
            )
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            DROP TABLE "locks"
        `);
        await queryRunner.query(`
            DROP SEQUENCE "locks_fencing_token_seq"
        `);
    }

}
```

`migrations` 数据源中列出了它。应用它，并检查实体和数据库是否一致。检查不比较序列，因此您添加的序列不计入更改：

```bash
$ npx tsx ./node_modules/typeorm/cli.js migration:run -d src/typeorm/data-source.ts
$ npx tsx ./node_modules/typeorm/cli.js migration:generate src/typeorm/migrations/Check -d src/typeorm/data-source.ts --check
No changes in database schema were found
```

现在商店，在相同的规则下 Drizzle 一：

```typescript
import { Injectable } from '@nestjs/common';
import { LocksStorage, type LockAcquireResult, type LockStore } from '@nestjs/locks';
import { DataSource } from 'typeorm';
import { LockEntity } from './lock.entity.js';

/** `ttl` from now, on the database's clock. */
const EXPIRES_IN = "clock_timestamp() + :ttl * interval '1 millisecond'";

/** The lock on `key`, if `owner` still holds it: the compare-and-set of renew() and release(). */
const HELD_BY = 'key = :key AND owner = :owner AND expires_at > clock_timestamp()';

@Injectable()
export class TypeOrmLockStore implements LockStore {
  constructor(
    private readonly dataSource: DataSource,
    storage: LocksStorage,
  ) {
    storage.registerSource(this);
  }

  async acquire(key: string, owner: string, ttl: number): Promise<LockAcquireResult> {
    // One statement: insert the lock, or take over a released or expired one. It is SQL
    // because the takeover draws its token from the locked row, which orUpdate() can't
    // express: it sets each column from EXCLUDED, whose nextval() ran before the row lock.
    const rows: { fencing_token: string }[] = await this.dataSource.query(
      `INSERT INTO locks (key, owner, fencing_token, expires_at)
       VALUES ($1, $2, nextval('locks_fencing_token_seq'), clock_timestamp() + $3 * interval '1 millisecond')
       ON CONFLICT (key) DO UPDATE SET
         owner = EXCLUDED.owner,
         fencing_token = greatest(nextval('locks_fencing_token_seq'), locks.fencing_token + 1),
         expires_at = clock_timestamp() + $3 * interval '1 millisecond'
       WHERE locks.owner IS NULL OR locks.expires_at <= clock_timestamp()
       RETURNING fencing_token`,
      [key, owner, ttl],
    );
    const [row] = rows;
    // `pg` returns a bigint as a string; the package takes the token as a number.
    return row ? { acquired: true, fencingToken: Number(row.fencing_token) } : { acquired: false };
  }

  async renew(key: string, owner: string, ttl: number): Promise<boolean> {
    const { affected } = await this.dataSource
      .createQueryBuilder()
      .update(LockEntity)
      .set({ expiresAt: () => EXPIRES_IN })
      .where(HELD_BY, { key, owner, ttl })
      .execute();
    return affected === 1;
  }

  async release(key: string, owner: string): Promise<boolean> {
    // Keep the row, so the next acquire() always takes the update path above, whose token is
    // drawn after the row is locked.
    const { affected } = await this.dataSource
      .createQueryBuilder()
      .update(LockEntity)
      .set({ owner: null })
      .where(HELD_BY, { key, owner })
      .execute();
    return affected === 1;
  }
}
```

- **`acquire()` 是一个语句写成 SQL**，通过 `dataSource.query()`.插入查询生成器的 `orUpdate()` 写一个 `ON CONFLICT DO UPDATE`，与 `WHERE` 在其 `overwriteCondition` 选项，但它将每列设置为 `EXCLUDED`：令牌将是插入在行被锁定之前绘制的令牌，密钥的后续持有者可能已经传递了该令牌。这个 SQL 把它画在 `SET`，在行锁定之后，作为 Drizzle 商店有。
- **`renew()` 和 `release()`**是更新查询生成器，所有者和到期日在 `WHERE` 中，读取 `affected`。永远不要 `save()`，也不要 `findOneBy()` 首先：写之前的读取会让接管在中间溜走。
- **令牌转换为 `Number()`.**`pg` 返回一个 `bigint` 列作为字符串，包拒绝字符串标记。
- **用它**代替 Drizzle 商店： `TypeOrmModule.forRoot(dataSourceOptions)` 在 `AppModule`，和 `TypeOrmLockStore` 在其提供者中而不是 `DrizzleLockStore`.它注入 `DataSource` 那个 `TypeOrmModule` 提供和启动行名称 `TypeOrmLockStore`.

合同套件在其上运行时保持不变，同时存在并发情况。TypeORM 通过 `pg`，因此该套件需要一个 PostgreSQL 服务器，如果没有 PostgreSQL 服务器，将被跳过。另外三个情况检查密钥的令牌在序列返回后继续增长，实体和迁移一致（什么 `migration:generate --check` 检查），并且存储在模块中提供时注册自身：

```typescript
/**
 * TypeOrmLockStore against the package's contract suite (`@nestjs/locks/testing`), on
 * PostgreSQL (the server in SQL_TEST_PG_URL, else a throwaway local cluster; see
 * test-support/postgres.ts), with the migration the TypeORM CLI generated. A pool, so the
 * concurrency cases race for real. Skipped, with the reason, without a server.
 */
import { Logger } from '@nestjs/common';
import { LocksModule, LocksStorage } from '@nestjs/locks';
import { lockStoreContract } from '@nestjs/locks/testing';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { startPostgres } from '../../../test-support/postgres.js';
import { dataSourceOptions } from '../src/typeorm/data-source.js';
import { TypeOrmLockStore } from '../src/typeorm/typeorm-lock.store.js';

const { postgres, reason } = await startPostgres();
afterAll(() => postgres?.stop());

describe.skipIf(!postgres)(`TypeOrmLockStore on PostgreSQL${postgres ? '' : ` (skipped: ${reason})`}`, () => {
  let dataSource: DataSource;
  let url: string;

  beforeAll(async () => {
    url = await postgres!.createDatabase('locks_typeorm_store');
    dataSource = await new DataSource({ ...dataSourceOptions, url, poolSize: 20 }).initialize();
    await dataSource.runMigrations();
  });
  afterAll(() => dataSource?.destroy());

  describe('the LockStore contract', () => {
    // The expiry cases wait in real time: the store reads the database's clock.
    const cases = lockStoreContract(() => new TypeOrmLockStore(dataSource, new LocksStorage()), { concurrent: { callers: 32 } });
    for (const c of cases) {
      it(c.name, c.run);
    }
  });

  it("keeps a key's tokens growing after the sequence went back (a restore, a failover to a lagging replica)", async () => {
    const store = new TypeOrmLockStore(dataSource, new LocksStorage());
    const key = `reset-${Date.now()}`;
    await dataSource.query("SELECT setval('locks_fencing_token_seq', 1000)");
    const before = await store.acquire(key, 'a', 5_000);
    expect(before.acquired).toBe(true);
    expect(await store.release(key, 'a')).toBe(true);
    await dataSource.query('ALTER SEQUENCE locks_fencing_token_seq RESTART WITH 1');
    const after = await store.acquire(key, 'b', 5_000);
    expect(after.acquired).toBe(true);
    expect((after as { fencingToken: number }).fencingToken).toBeGreaterThan((before as { fencingToken: number }).fencingToken);
  });

  it('has a migration that matches the entity (what `migration:generate --check` checks)', async () => {
    const { upQueries } = await dataSource.driver.createSchemaBuilder().log();
    expect(upQueries.map((query) => query.query)).toEqual([]);
  });

  it('registers itself when provided in a module', async () => {
    const log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    const app = await Test.createTestingModule({
      imports: [TypeOrmModule.forRoot({ ...dataSourceOptions, url }), LocksModule.forRoot()],
      providers: [TypeOrmLockStore],
    }).compile();
    await app.init();
    try {
      expect(app.get(LocksStorage).source).toBe(app.get(TypeOrmLockStore));
      expect(log).toHaveBeenCalledWith('LocksStorage: TypeOrmLockStore');
    } finally {
      log.mockRestore();
      await app.close();
    }
  });
});
```

> info **Hint** 使用 Prisma？[The store contract](/reliability/locks#the-store-contract)，在教程之后，列出了商店必须保证的内容以及 Prisma 如何表达原子方法。针对相同的情况测试您的商店。

#### 在一个实例上运行每个作业

将 `@OnOneInstance()` 添加到 `@Cron()` 旁边的两个作业中：

```typescript
import { OnOneInstance } from '@nestjs/locks';
import { Cron } from '@nestjs/schedule';
```

```typescript
@Cron(process.env.INVOICE_EXPORT_CRON ?? '0 2 * * *', { name: 'invoice-export', timeZone: 'Europe/Warsaw' })
@OnOneInstance({ key: 'invoices:nightly-export' })
async exportInvoices() {
```

```typescript
@Cron(process.env.STOCK_RECONCILIATION_CRON ?? CronExpression.EVERY_5_MINUTES, { name: 'stock-reconciliation' })
@OnOneInstance({ key: 'inventory:stock-reconciliation' })
async reconcileStock() {
```

这就是全部的变化。它的作用：

- **调度程序触发作业的第一个实例将获得作业的租约**，这是一个以钥匙命名的锁，带有 `:owner` 后缀，并且每次都不断更新 `ttl / 3` 只要它还在。它运行这个刻度和它之后的每个刻度。
- **在其他实例中，勾号被跳过**：调用在不运行方法的情况下解析，调试行说明原因。没有任何东西排队；工作的时间表就是时间表。
- **当业主死亡**，停止续租，租约到期 `ttl`（30 秒）之后，在那之后出现的第一个实例接管了作业。当所有者干净利落地关闭时，它完成了正在进行的运行，交回了租约，下一个勾号就把它带走了。
- **装修人员包装方法**`@nestjs/schedule` 没有修补，它不知道它们在那里：它的浏览器找到 `@Cron()` 包装器上的元数据，以任一装饰器顺序，并调用包装器，包装器询问 `LocksModule` 这个电话是否可以运行。`@Interval()` 和 `@Timeout()` 作业的工作方式相同，自己调用方法也是如此。
- **密钥**默认为 `ClassName.methodName`。将其设置为绝不能运行两次的作业：重命名的类或方法会更改默认值，在滚动部署期间，新旧实例将各自运行一次作业。具有相同默认密钥的两个作业在启动时失败，一个密钥是另一个作业的租约（`<key>:owner`）或选举密钥的作业也会失败：它们会默默地相互排除。

所有权是故意粘性的。每个刻度的竞赛会更简单，但刻度不是瞬间：实例的时钟相差几十毫秒，因此每个刻度的锁定必须比歪斜运行的寿命更长，并且快速作业需要一个“运行在”记录来阻止滞后的实例再次运行刻度。在 ticks 之间持有的租约没有这些，代价是一个实例运行作业的所有 ticks，而计划作业很少会考虑这一点。

没人跑的蜱虫呢？当主人倒下时，最多 `ttl` 的刻度被跳过，夜间导出可以落在这 30 秒上。**错过的勾号不会被追上**：没有记录作业上次运行的时间。写工作，做所有该做的事情，而不是“昨天的事情”。出口拿每一个订单都没有发票，所以一个晚上没跑，第二天晚上就赶上了；对账记录了当前的计数，因此错过的勾号会花费五分钟的陈旧时间。一个工作的刻度每个都做不同的事情，它将记录保存在自己的表中。

测试来自 [See the problem](/reliability/locks#see-the-problem)，有了新作业和存储，现在会记录每张发票一次，并且阻止实例更新的测试（其时钟静止，就好像进程已经死亡一样）显示切换：

```typescript
it('records every invoice once, and counts the stock once per tick', async () => {
  const apps = [await start(), await start(), await start()];
  await tick(apps, 'export');
  expect(booked(accounting)).toEqual([['ord_1001', 'ord_1002', 'ord_1004']]);
  await tick(apps, 'reconcile');
  await tick(apps, 'reconcile');
  expect(warehouse.counts).toBe(2);
  expect(logger.matching(/runs on this instance \(lease "inventory:stock-reconciliation:owner"/)).toHaveLength(1);
  expect(logger.matching('Skipped StockReconciliationJob.reconcileStock: it runs on another instance')).toHaveLength(4);
});
```

```typescript
it('moves the job to another instance when its owner dies, after ttl', async () => {
  // A's clock stands still: it stops renewing, as if its process died.
  const crashed = await start({ clock: new ManualLockClock(), ttl: '1s' });
  const survivor = await start({ ttl: '1s' });
  await tick([crashed, survivor], 'export');
  expect(booked(accounting)).toHaveLength(1);

  await database.query("INSERT INTO orders (id, user_id, items, total, status, placed_at) VALUES ('ord_1005', 'usr_dave', '[]', 999, 'placed', now())");
  expect(await survivor.get(InvoiceExportJob).exportInvoices()).toBeUndefined(); // the lease is still A's
  await sleep(1_200); // the database's clock passes A's lease
  await survivor.get(InvoiceExportJob).exportInvoices();
  expect(booked(accounting)).toEqual([['ord_1001', 'ord_1002', 'ord_1004'], ['ord_1005']]);
});
```

`ManualLockClock` 是包的测试时钟：它只有在被告知时才会移动。它上的实例永远不会更新，因此数据库在它自己的时钟上，在 `ttl` 之后过期实例的锁。

#### 不要让长跑重叠

`@OnOneInstance()` 将调节放在一个实例上。当最后一个计数仍在运行时，它不会阻止该实例开始下一个计数，普通的 `@Cron()` 也不会。月底，清点需要五分钟以上，因此仓库会进行第二次完整清点，然后是第三次。添加 `@WithoutOverlapping()`：

```typescript
@Cron(process.env.STOCK_RECONCILIATION_CRON ?? CronExpression.EVERY_5_MINUTES, { name: 'stock-reconciliation' })
@OnOneInstance({ key: 'inventory:stock-reconciliation' })
@WithoutOverlapping()
async reconcileStock() {
```

一个运行现在会使用第二个锁，以同一个键命名（一个方法上的两个装饰器共享它），在整个运行期间保持它，更新它，并在运行结束时释放它。在这个实例或任何其他实例中，发现锁被保持的刻度被跳过：长时间计数期间的刻度被丢弃，之后的第一个刻度被运行。如果运行崩溃，锁将在 `ttl` 下一个滴答运行。`@WithoutOverlapping()` 它本身，没有 `@OnOneInstance()`，表示“任何实例，一次运行一个”。

测试在一个实例上驱动两个实例 `ManualLockClock`，保持计数打开，并将时钟推进三个刻度：

```typescript
it('with @WithoutOverlapping(), every tick during the run is skipped, then the next one runs', async () => {
  const [owner, other] = [await start(StepFourJob), await start(StepFourJob)];
  const slow = warehouse.pauseNext();
  const first = owner!.reconcileStock();
  await until(() => warehouse.counts === 1);
  for (let tick = 0; tick < 3; tick++) {
    await clock.advance('5m'); // the run goes on, its locks renewed
    await Promise.all([owner!.reconcileStock(), other!.reconcileStock()]);
  }
  expect(warehouse.counts).toBe(1);
  expect(logger.matching('Skipped StockReconciliationJob.reconcileStock: a run is still in progress')).toHaveLength(3);
  expect(logger.matching('Skipped StockReconciliationJob.reconcileStock: it runs on another instance')).toHaveLength(3);
  slow.resume();
  await first;
  await clock.advance('5m');
  await Promise.all([owner!.reconcileStock(), other!.reconcileStock()]);
  expect(warehouse.counts).toBe(2);
});
```

`clock.advance('5m')` 依次触发途中到期的每一个更新，并等待每一个到达商店，所以 15 分钟的长时间运行需要一点时间，运行的锁在整个时间内都在更新。

#### 将铭文围起来

租约不能阻止被暂停的持有人。以实例 A 中的对账为例：它读取仓库中的计数（鲑鱼粗粒：12），然后是一个摊位，在一个停止世界的垃圾收集中，一个交换，一个 VM 迁移，调试器。它停止更新。30 秒后，数据库的锁过期了，B 在下一次点击时接管了这项工作：它读取新的计数（自那以后，已经售出和发货了三袋：三文鱼粗粮：9）并写下它们。然后 A 醒来并完成它的运行，在暂停前读取计数。三文鱼粗粮在 12 点回来了，商店出售三袋它没有的。

A 的信号在下一次更新时中止，此时数据库拒绝它，但是已经在路上的写会通过。注意租约承诺什么和不承诺什么。持有人计算自己的截止日期，`ttl` 从它发送最后一次续订的那一刻起，存储就确认了，这是在存储处理它之前：正在运行的持有者在存储到期之前放弃，因此它的信号在任何其他实例可以获取密钥之前中止。窗口只存在于没有运行的持有者（暂停、停止、其事件循环阻塞）：从存储到期到它再次运行，它仍然认为它持有锁。阻止它写入的是**围栏令牌**：每次获取一个密钥都会得到一个比密钥以前拥有的每个令牌都大的令牌，正在写入的资源保留它见过的最高令牌，并拒绝较低的令牌。A 的令牌低于 B 的，所以 A 的后期写入不会更新任何内容。

products 表中有一个列：

```typescript
export const products = pgTable('products', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  /** In cents. */
  price: integer('price').notNull(),
  inStock: integer('in_stock').notNull(),
  /** The fencing token of the stock reconciliation run that last wrote `inStock`. */
  stockFencingToken: bigint('stock_fencing_token', { mode: 'number' }).notNull().default(0),
});
```

```bash
$ npx drizzle-kit generate --name=stock_fencing_token
$ npx drizzle-kit migrate
```

```sql
ALTER TABLE "products" ADD COLUMN "stock_fencing_token" bigint DEFAULT 0 NOT NULL;
```

只有当没有具有更大令牌的运行写入该产品时，存储库才会写入计数，并在同一条语句中记录它写入的令牌：

```typescript
import { Injectable } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { and, eq, lte } from 'drizzle-orm';
import type { Database } from '../database/drizzle.js';
import { products } from '../database/schema.js';
import type { StockCount } from './warehouse.client.js';

@Injectable()
export class StockRepository {
  constructor(@InjectDrizzle() private readonly db: Database) {}

  /**
   * Writes the counts a reconciliation run read, fenced by the run's token: a product that a
   * newer run (a greater token) already wrote is left alone.
   */
  async writeStock(counts: StockCount[], fencingToken: number): Promise<{ written: number; stale: number }> {
    let written = 0;
    for (const { productId, count } of counts) {
      const rows = await this.db
        .update(products)
        .set({ inStock: count, stockFencingToken: fencingToken })
        .where(and(eq(products.id, productId), lte(products.stockFencingToken, fencingToken)))
        .returning({ id: products.id });
      written += rows.length;
    }
    return { written, stale: counts.length - written };
  }
}
```

作业从 `LocksContext` 获得令牌和信号。`@nestjs/schedule` 调用没有参数的方法，因此上下文将参数通过 `AsyncLocalStorage` 传递到作业调用的每个服务：

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { LocksContext, OnOneInstance, WithoutOverlapping } from '@nestjs/locks';
import { Cron, CronExpression } from '@nestjs/schedule';
import { StockRepository } from './stock.repository.js';
import { WarehouseClient } from './warehouse.client.js';

@Injectable()
export class StockReconciliationJob {
  private readonly logger = new Logger(StockReconciliationJob.name);

  constructor(
    private readonly warehouseClient: WarehouseClient,
    private readonly stockRepository: StockRepository,
    private readonly locksContext: LocksContext,
  ) {}

  @Cron(process.env.STOCK_RECONCILIATION_CRON ?? CronExpression.EVERY_5_MINUTES, { name: 'stock-reconciliation' })
  @OnOneInstance({ key: 'inventory:stock-reconciliation' })
  @WithoutOverlapping()
  async reconcileStock() {
    const { fencingToken, signal } = this.locksContext;
    // Aborts the count if this run loses its lock...
    const counts = await this.warehouseClient.stockCounts({ signal });
    // ...and the token stops a write that slips through anyway.
    const { written, stale } = await this.stockRepository.writeStock(counts, fencingToken!);
    if (stale > 0) {
      this.logger.warn(`Skipped ${stale} stale stock writes: a newer run (token > ${fencingToken}) wrote those products`);
    }
    this.logger.log(`Reconciled stock for ${written} products (fencing token ${fencingToken})`);
  }
}
```

令牌是运行锁的，每次运行都有一个新的更高的令牌。当运行的锁或实例的租约丢失时，信号会中止，其原因是 `LockLostError` 这说明了损失是如何被发现的：商店拒绝续订，或者 `ttl` 没有人到达商店就通过了。将信号传递给作业调用的内容，`fetch` 数据库驱动程序 HTTP 客户；忽略它的作业会继续运行，就像在任何进程中一样。没有人被杀。

该测试针对 PostgreSQL 重现暂停。实例 A 运行在 `ManualLockClock`，所以它停止更新；仓库客户端在读取 A 的计数后保持开放；货架变了；B 在 1.2 秒后接管（测试的 `ttl` 是一秒）并写鲑鱼粗粮：9。然后 A 的计数恢复：

```typescript
it('without fencing, the paused instance overwrites the fresh count with its stale one', async () => {
  const { stale, resume } = await pauseAWhileBTakesOver(UnfencedJob);
  resume(); // A wakes up and writes what it read before the pause
  expect(await stale).toBeUndefined();
  expect(await kibble()).toBe(12); // three bags the store doesn't have
});

it("with the run's fencing token, the database refuses the stale write", async () => {
  const { stale, resume } = await pauseAWhileBTakesOver(StockReconciliationJob);
  resume(); // A wakes up before it noticed it lost its locks, and writes
  expect(await stale).toBeUndefined();
  expect(await kibble()).toBe(9);
  expect(logger.matching(/WARN Skipped 3 stale stock writes: a newer run \(token > \d+\) wrote those products/)).toHaveLength(1);
  const tokens = await database.query<{ stock_fencing_token: string }>('SELECT DISTINCT stock_fencing_token FROM products');
  expect(tokens).toHaveLength(1); // every product carries B's token
});

it('a run that notices it lost its lock stops at its signal, before writing', async () => {
  const { stale, resume } = await pauseAWhileBTakesOver(StockReconciliationJob);
  await clockA.advance('1s'); // A's clock moves: its next renewal is refused
  expect(await stale).toBeInstanceOf(LockLostError);
  resume();
  expect(await kibble()).toBe(9);
  expect(logger.matching(/WARN Lost the lock "inventory:stock-reconciliation(:owner)?"/).length).toBeGreaterThan(0);
});
```

随着上一节的工作，陈旧的写作通过，鲑鱼粗粮回到了 12。有了令牌，数据库会拒绝它，作业会记录它跳过了三次过时的写入。以及在写信号处停止之前进行下一次更新的运行，`LockLostError`，什么也不写。包记录每个丢失锁的警告，并发出 `lock-lost` 事件，因为丢失的锁意味着另一个实例现在可能在同一个关键部分：只有令牌将两者分开。

#### 手动运行导出

会计有时要求 02:00 前出口。管理端点运行它，在任何情况下，它都不能与计划运行一起运行。计划运行持有由其密钥命名的锁；端点采用相同的锁 `Locks.withLock()`，等待即将结束的运行最多两秒钟：

```typescript
import { ConflictException, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { LockNotAcquiredError, Locks } from '@nestjs/locks';
import { AdminGuard } from '../admin/admin.guard.js';
import { INVOICE_EXPORT_LOCK, InvoiceExportJob } from './invoice-export.job.js';

@Controller('admin/invoice-exports')
@UseGuards(AdminGuard)
export class InvoiceExportsController {
  constructor(
    private readonly locks: Locks,
    private readonly invoiceExportJob: InvoiceExportJob,
  ) {}

  /** Runs the export now, unless a run (scheduled or not) holds its lock. */
  @Post()
  @HttpCode(200)
  async exportNow() {
    try {
      return await this.locks.withLock(INVOICE_EXPORT_LOCK, () => this.invoiceExportJob.export(), { wait: '2s' });
    } catch (error) {
      if (error instanceof LockNotAcquiredError) {
        throw new ConflictException('An invoice export is already running. Try again when it has finished.');
      }
      throw error;
    }
  }
}
```

作业将键导出为常量，获取 `@WithoutOverlapping()` 并将工作从计划的方法中拆分出来，以便端点可以调用它并返回其结果：

```typescript
/** The export's lock: held by a run, scheduled or started by hand. */
export const INVOICE_EXPORT_LOCK = 'invoices:nightly-export';

export interface InvoiceExportResult {
  exported: number;
  batchId?: string;
}
```

```typescript
@Cron(process.env.INVOICE_EXPORT_CRON ?? '0 2 * * *', { name: 'invoice-export', timeZone: 'Europe/Warsaw' })
@OnOneInstance({ key: INVOICE_EXPORT_LOCK })
@WithoutOverlapping()
async exportInvoices() {
  await this.export();
}

/** Call it under the INVOICE_EXPORT_LOCK lock. */
async export(): Promise<InvoiceExportResult> {
```

`withLock(key, fn, options)` 运行 `fn` 在锁下并释放它 `fn` 解决或投掷。 `wait` 是在放弃之前，在后退的情况下继续尝试多长时间 `LockNotAcquiredError`;默认是尝试一次。 `acquire(key, options)` 没有回调也是一样的：它解决了一个 `Lock`, 或 `null` 当钥匙被拿走，你自己释放它，或者用 `await using`. A `Lock` 有 `fencingToken` 和 `signal`，和里面 `withLock()` 也是 `LocksContext` 就像工作一样。

两者都采取 `signal` 例如，他们自己的请求，这停止了等待。它也停止了对存储的等待：仍在等待存储响应的呼叫由于信号的原因而被拒绝， `fn` 不运行，商店授予的锁将返回到它。 `wait` 不会中断已经在路上的商店电话；模块的 `storeTimeout` 是的，所以一个电话最多需要 `wait` 加 `storeTimeout`.一个不回答的商店 `storeTimeout` 调用失败 `LockStoreTimeoutError`.

都不是 `LockNotAcquiredError` 也不 `LockStoreTimeoutError` 携带 HTTP 状态：争用和停滞的存储不是调用者的错误，所以处理程序决定。这里的锁是一个 `409`，其他任何东西都会被重新抛出。当导出由手动运行时，任何实例上的计划勾选会发现锁被持有并跳过。

> info **Hint** `AdminGuard` 是占位符。使用应用程序的真实 [授权](/security/authorization) 保护路由。

#### 商店 Redis

存储是一个契约，因此它可以存在于您的实例已经遇到的任何地方。如果那是 Redis，每个方法是一个 Lua 脚本，它 Redis 原子运行：

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { LocksStorage, type LockAcquireResult, type LockStore } from '@nestjs/locks';
import { REDIS } from './redis.module.js';

/** The one ioredis method this store needs. */
export interface RedisEval {
  eval(script: string, numKeys: number, ...args: (string | number)[]): Promise<unknown>;
}

// Takes the lock if nobody holds it, expiring on Redis's clock, and draws a fencing token
// from a counter that never goes back. Returns the token, or 0.
const ACQUIRE = `
if redis.call('SET', KEYS[1], ARGV[1], 'NX', 'PX', ARGV[2]) then
  return redis.call('INCR', KEYS[2])
end
return 0
`;

// Renews the lock, if it is still ours.
const RENEW = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('PEXPIRE', KEYS[1], ARGV[2])
end
return 0
`;

// Deletes the lock, if it is still ours.
const RELEASE = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
end
return 0
`;

/** Where the fencing counter lives; no lock key can be named like it. */
const FENCING_COUNTER = 'locks:fencing-token';

@Injectable()
export class RedisLockStore implements LockStore {
  constructor(
    @Inject(REDIS) private readonly redis: RedisEval,
    storage: LocksStorage,
  ) {
    storage.registerSource(this);
  }

  async acquire(key: string, owner: string, ttl: number): Promise<LockAcquireResult> {
    const token = Number(await this.redis.eval(ACQUIRE, 2, this.key(key), FENCING_COUNTER, owner, ttl));
    return token > 0 ? { acquired: true, fencingToken: token } : { acquired: false };
  }

  async renew(key: string, owner: string, ttl: number): Promise<boolean> {
    return (await this.redis.eval(RENEW, 1, this.key(key), owner, ttl)) === 1;
  }

  async release(key: string, owner: string): Promise<boolean> {
    return (await this.redis.eval(RELEASE, 1, this.key(key), owner)) === 1;
  }

  private key(key: string) {
    return `locks:key:${key}`;
  }
}
```

`SET NX PX` 仅当密钥是空闲的，过期日期为 Redis 以毫秒为单位的时钟，以及 `INCR` 在同一个脚本中，为每个键从一个计数器中提取令牌。围栏和柜台一样耐用。它永远不会过期，也永远不会回去：给予 Redis 持久性（AOF, 或 RDB 间隔很短）和 `maxmemory-policy noeviction`，因为在 1 重新启动的计数器（没有持久性的重新启动，`FLUSHALL`) 分发持有者已经拥有的令牌，在内存压力下被驱逐的锁是丢失的锁。对异步副本的故障转移也可能丢失最后一次写入：就在它之前的锁，这是令牌覆盖的暂停持有者情况，也是计数器的最后一次增量，之后下一个持有者可能会抽取前一个持有者已经拥有的令牌，并且令牌不再区分它们。如果在故障转移过程中必须使用围栏，则将锁保留在数据库中，其顺序相同 WAL 作为行，或复制 Redis 同步。

在 Redis 集群，`ACQUIRE` 失败 `CROSSSLOT` 编写错误：集群只有在其所有密钥散列到同一个槽时才运行脚本，而锁的密钥和计数器不运行。在一个散列标记下命名两者，`{locks}:key:<key>` 和 `{locks}:fencing-token`：然后集群仅散列 `locks` 所以计数器和每个锁共享一个插槽，在一个碎片上。新名称下的计数器或新集群上的计数器从 1 重新开始，这是它绝不能进行的重启。在第一次获取之前，停止使用旧键的实例，并将新计数器设置为旧计数器的值（`SET {locks}:fencing-token <value>`），因此下一个令牌高于任何已经分发的令牌。

`redis.module` 在 `REDIS` 令牌下提供客户端；该示例使用了一个带有 ioredis`eval()` 签名的最小客户端，以保持无依赖关系，在您的应用程序中，它是 `new Redis(process.env.REDIS_URL)`：

```typescript
import { Global, Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import { RedisClient } from './redis.client.js';

export const REDIS = Symbol('REDIS');

@Global()
@Module({
  providers: [
    {
      provide: REDIS,
      // With ioredis: new Redis(process.env.REDIS_URL)
      useFactory: () => new RedisClient(process.env.REDIS_URL ?? 'redis://127.0.0.1:6379'),
    },
  ],
  exports: [REDIS],
})
export class RedisModule implements OnApplicationShutdown {
  constructor(@Inject(REDIS) private readonly redis: RedisClient) {}

  // After onModuleDestroy(), where running jobs finish and hand their locks back.
  async onApplicationShutdown() {
    await this.redis.quit();
  }
}
```

在应用程序模块中交换提供程序，其他内容不会更改：

```typescript
@Module({
  imports: [
    DrizzleModule.forRootAsync({
      useFactory: () => ({ drizzle, connection: process.env.DATABASE_URL!, schema }),
    }),
    RedisModule,
    ScheduleModule.forRoot(),
    LocksModule.forRoot(),
    InvoicesModule,
    InventoryModule,
  ],
  providers: [RedisLockStore],
})
export class AppModule {}
```

该示例针对真实的 `redis-server`，在八个连接上，因此调用重叠，然后是应用程序的三个实例：

```typescript
describe('the LockStore contract', () => {
  // Several connections, so calls really overlap; expiry is Redis's own clock (real time).
  const pool = Array.from({ length: 8 }, () => new RedisLockStore(connect(), new LocksStorage()));
  let next = 0;
  const cases = lockStoreContract(() => pool[next++ % pool.length]!, { concurrent: true });
  for (const c of cases) {
    it(c.name, c.run);
  }
});
```

关闭 Redis 客户端 `onApplicationShutdown()`，就像模块一样；`@nestjs/drizzle` 在同一阶段关闭数据库池。Nest 在下一个关闭阶段之前运行整个应用程序的每个关闭阶段：包将租约交回 `onModuleDestroy()` 并释放所有其他仍然持有的锁 `beforeApplicationShutdown()` 所以当任何模块的时候 `onApplicationShutdown()` 运行时，无论导入顺序如何，包的任何部分都不需要连接。当关闭开始时，仍在等待存储的勾号或选举停止等待：勾号被跳过，之后存储授予的锁返回到它，因此停滞的存储不会阻止部署。

#### 在一个实例上保存仓库提要

仓库通过允许每个商店一个连接的提要推送低库存警报。这不是一份预定的工作；这是一个连接，一个实例应该在它存在的时间内保持，另一个实例应该在它停止运行时接管。这是一次领导者选举，它与工作所有权相同，是故意持有的：

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { LeaderElection, type Lock, type OnLeadershipAcquired, type OnLeadershipLost } from '@nestjs/locks';
import { WarehouseClient } from './warehouse.client.js';

/**
 * The warehouse's alert feed allows one connection per shop, so one instance of the app
 * holds it: the leader. When the leader goes down, another instance connects within the
 * lease's `ttl`.
 */
@Injectable()
@LeaderElection('inventory:warehouse-feed')
export class WarehouseFeed implements OnLeadershipAcquired, OnLeadershipLost {
  private readonly logger = new Logger(WarehouseFeed.name);

  constructor(private readonly warehouseClient: WarehouseClient) {}

  onLeadershipAcquired(lock: Lock) {
    this.logger.log(`Connected to the warehouse feed (fencing token ${lock.fencingToken})`);
    // The connection ends with the leadership: `lock.signal` aborts when the lease is lost
    // or this instance steps down.
    this.warehouseClient.subscribe(
      (alert) => this.logger.warn(`Low stock: ${alert.count} left of ${alert.productId}`),
      { signal: lock.signal },
    );
  }

  onLeadershipLost() {
    this.logger.log('Disconnected from the warehouse feed');
  }
}
```

```typescript
import { Module } from '@nestjs/common';
import { StockReconciliationJob } from './stock-reconciliation.job.js';
import { StockRepository } from './stock.repository.js';
import { WarehouseClient } from './warehouse.client.js';
import { WarehouseFeed } from './warehouse-feed.js';

@Module({
  providers: [StockReconciliationJob, StockRepository, WarehouseClient, WarehouseFeed],
})
export class InventoryModule {}
```

`@LeaderElection(key)` 使用单例提供者。来自 `onApplicationBootstrap`，每个实例都试图获得钥匙上的租约，并不断尝试每个 `ttl / 3`;拥有它的人会更新它。 `onLeadershipAcquired(lock)` 当此实例成为领导者时运行，租约的 `signal` 和 `fencingToken`; `onLeadershipLost(lock)` 当它停止领导时，因为租约丢失或因为它下台，在关闭时或之后 `onLeadershipAcquired()` 扔了。这个 `ttl` 期权设定租赁；默认是模块的 30 秒，所以一个崩溃的领导者在半分钟内被替换，一个干净关闭的领导者在其他人下次尝试时被替换。

测试启动三个实例，显示一个连接、关机时的切换以及暂停的领导者盲点：

```typescript
await until(() => connected().length === 2, 10_000); // the lease expired in the database
warehouse.notify({ productId: 'salmon-kibble-2kg', count: 2 });
// Both receive it: the paused leader hasn't noticed yet. Anything it writes on the feed's
// behalf needs its fencing token, which is lower than the new leader's.
expect(logger.matching('WARN Low stock: 2 left of salmon-kibble-2kg')).toHaveLength(2);
// The old leader wakes up: its renewal is refused, and it learns it lost the lease.
await clock.advance('3s');
expect(leading.get(crashed)).toBe(false);
expect(disconnected()).toHaveLength(1);
```

暂停的领导者仍然连接，直到其下一次更新失败，并接收馈送在其间发送的内容。这是同一个盲点 [Fence the writes](/reliability/locks#fence-the-writes) 答案是一样的：领导者代表集团所做的事情带有租赁的象征。

#### 试试

创建数据库并应用迁移：

```bash
$ psql postgres://localhost:5432/postgres -c 'CREATE DATABASE store'
$ DATABASE_URL=postgres://localhost:5432/store npx drizzle-kit migrate
```

在端口 3001、3002 和 3003 上启动三个实例， `ADMIN_TOKEN=s3cret` 每十秒钟而不是五分钟进行一次库存对账，因此有一些值得注意的事情： `STOCK_RECONCILIATION_CRON='*/10 * * * * *'`.每个都记录它注册的锁存储。第一个向上引导仓库进料，并在其他两个向上之前，在第一个刻度处进行对账：

```bash
[Nest] 48817  - 09/25/2026, 8:59:26 AM     LOG [LocksModule] LocksStorage: DrizzleLockStore
[Nest] 48817  - 09/25/2026, 8:59:26 AM     LOG [NestApplication] Nest application successfully started +9ms
[Nest] 48817  - 09/25/2026, 8:59:26 AM     LOG [Locks] Leading "inventory:warehouse-feed" (fencing token 1)
[Nest] 48817  - 09/25/2026, 8:59:26 AM     LOG [WarehouseFeed] Connected to the warehouse feed (fencing token 1)
[Nest] 48817  - 09/25/2026, 8:59:30 AM     LOG [Locks] StockReconciliationJob.reconcileStock runs on this instance (lease "inventory:stock-reconciliation:owner", fencing token 2)
[Nest] 48817  - 09/25/2026, 8:59:30 AM     LOG [WarehouseClient] Counted 3 products
[Nest] 48817  - 09/25/2026, 8:59:30 AM     LOG [StockReconciliationJob] Reconciled stock for 3 products (fencing token 3)
[Nest] 48817  - 09/25/2026, 8:59:40 AM     LOG [WarehouseClient] Counted 3 products
[Nest] 48817  - 09/25/2026, 8:59:40 AM     LOG [StockReconciliationJob] Reconciled stock for 3 products (fencing token 9)
```

另外两个在调试级别跳过每个刻度：

```bash
[Nest] 48849  - 09/25/2026, 8:59:40 AM   DEBUG [Locks] Skipped StockReconciliationJob.reconcileStock: it runs on another instance
[Nest] 48849  - 09/25/2026, 8:59:50 AM   DEBUG [Locks] Skipped StockReconciliationJob.reconcileStock: it runs on another instance
```

locks 表显示租约、运行锁（已释放，因此其所有者为空，其令牌随着每次运行而增长）和 feed 的租约。每个锁在最后一次更新后 30 秒过期，在数据库的时钟上：

```bash
$ psql postgres://localhost:5432/store -c "SELECT key, owner, fencing_token, expires_at - clock_timestamp() AS expires_in FROM locks ORDER BY key"
                 key                  |                owner                 | fencing_token |   expires_in
--------------------------------------+--------------------------------------+---------------+-----------------
 inventory:stock-reconciliation       |                                      |             9 | 00:00:26.026727
 inventory:stock-reconciliation:owner | 1feff401-d3c9-41b1-a559-d7b458e2905f |             2 | 00:00:26.054034
 inventory:warehouse-feed             | a4980740-ae27-4d95-af0b-0935d65fffb9 |             1 | 00:00:22.784351
(3 rows)
```

围栏令牌有差距：被拒绝的获取仍然会从序列中消耗一个值。手动运行导出。没有管理员令牌，守卫回答 `403`；然后同时向两个不同的实例发送两个请求：

```bash
$ curl -s -o /dev/null -w '%{http_code}\n' -X POST localhost:3002/admin/invoice-exports
403
$ for port in 3002 3003; do (curl -s -X POST localhost:$port/admin/invoice-exports -H 'x-admin-token: s3cret'; echo) & done; wait
{"exported":3,"batchId":"acc_447817af"}
{"exported":0}
```

一个请求拿走了锁并导出了三个挂单。另一个人等着它，在锁被释放时拿走了锁，发现什么也没剩下。等待超过两秒钟的请求会得到 `409`。运行导出的实例记录批处理：

```bash
[Nest] 48849  - 09/25/2026, 8:59:44 AM     LOG [AccountingClient] Booked batch acc_447817af: ord_1001, ord_1002, ord_1004
[Nest] 48849  - 09/25/2026, 8:59:44 AM     LOG [InvoiceExportJob] Exported 3 invoices in batch acc_447817af
```

现在杀死第一个实例，它运行对账并引导提要，而不给它清理的机会：

```bash
$ kill -9 48817
```

有一段时间什么都没发生：另外两个一直跳过，因为租约还在桌子上。每次更新后 30 秒过期。feed 的租约首先到期，因为它是按照自己的时间表续订的，下一个 tick 将接管这项工作：

```bash
[Nest] 48849  - 09/25/2026, 9:00:11 AM     LOG [Locks] Leading "inventory:warehouse-feed" (fencing token 28)
[Nest] 48849  - 09/25/2026, 9:00:11 AM     LOG [WarehouseFeed] Connected to the warehouse feed (fencing token 28)
[Nest] 48849  - 09/25/2026, 9:00:20 AM     LOG [Locks] StockReconciliationJob.reconcileStock runs on this instance (lease "inventory:stock-reconciliation:owner", fencing token 32)
[Nest] 48849  - 09/25/2026, 9:00:20 AM     LOG [WarehouseClient] Counted 3 products
[Nest] 48849  - 09/25/2026, 9:00:20 AM     LOG [StockReconciliationJob] Reconciled stock for 3 products (fencing token 34)
```

用 `Ctrl+C` 停止新所有者。它的关闭钩手两个租约回来（`main.ts` 调用 `app.enableShutdownHooks()`）：

```bash
[Nest] 48849  - 09/25/2026, 9:00:35 AM     LOG [Locks] Stepped down from "inventory:warehouse-feed"
[Nest] 48849  - 09/25/2026, 9:00:35 AM     LOG [WarehouseFeed] Disconnected from the warehouse feed
```

最后一个实例在下一个刻度时接收作业，并在下一个活动时接收提要，时间是几秒钟后，而不是三十分钟：

```bash
[Nest] 48859  - 09/25/2026, 9:00:40 AM     LOG [Locks] StockReconciliationJob.reconcileStock runs on this instance (lease "inventory:stock-reconciliation:owner", fencing token 41)
[Nest] 48859  - 09/25/2026, 9:00:40 AM     LOG [WarehouseClient] Counted 3 products
[Nest] 48859  - 09/25/2026, 9:00:40 AM     LOG [StockReconciliationJob] Reconciled stock for 3 products (fencing token 43)
[Nest] 48859  - 09/25/2026, 9:00:41 AM     LOG [Locks] Leading "inventory:warehouse-feed" (fencing token 45)
[Nest] 48859  - 09/25/2026, 9:00:41 AM     LOG [WarehouseFeed] Connected to the warehouse feed (fencing token 45)
```

最后用 `Ctrl+C` 停止最后一个。它在运行之前从提要中下来：

```bash
[Nest] 48859  - 09/25/2026, 9:00:50 AM     LOG [Locks] Stepped down from "inventory:warehouse-feed"
[Nest] 48859  - 09/25/2026, 9:00:50 AM     LOG [WarehouseFeed] Disconnected from the warehouse feed
```

#### 检测

导入 `LocksModule` 并注册任何存储的应用程序不会在内存存储中运行，因此对一个实例进行端到端测试不需要任何东西：每个刻度运行一次。要将 Drizzle 存储排除在测试之外，请使用普通的 `InMemoryLockStore` 覆盖其提供程序；普通实例不注册自己，因此适用内存默认值。

要测试包的用途，请在一个进程中运行多个实例。实例是 Nest 应用；一个应用程序的实例共享一个存储。示例的助手在共享数据库上启动一个，其中包含伪造的和测试的 `LocksModule` 选项：

```typescript
export async function startInstance(options: InstanceOptions): Promise<TestingModule> {
  if (options.database.url) {
    process.env.DATABASE_URL = options.database.url;
  }
  let builder = Test.createTestingModule({ imports: [options.module] })
    .overrideProvider(AccountingClient)
    .useValue(options.accounting)
    .overrideProvider(WarehouseClient)
    .useValue(options.warehouse);
  if (options.database.pglite) {
    builder = builder.overrideProvider(getDrizzleToken()).useValue(options.database.pglite);
  }
  if (options.locks) {
    builder = builder.overrideProvider(LOCKS_MODULE_OPTIONS).useValue(options.locks);
  }
  const app = await builder.compile();
  app.useLogger(options.logger);
  options.onCompiled?.(app);
  await app.init();
  return app;
}
```

- **共享数据库。**在 PGlite 上，每个实例通过覆盖一个 `DrizzleModule` 寄存器（`getDrizzleToken()`）获得相同的 Drizzle 数据库，并应用实际迁移；`DrizzleLockStore` 用 `@InjectDrizzle()` 注入它，因此实例共享锁表，就像它们在生产中共享它一样。对于 PostgreSQL 服务器，每个实例从数据库的 URL 打开自己的池。如果没有数据库，请在实例之间共享一个 `InMemoryLockStore`，方法是在每个实例中使用 `LocksStorage.registerSource()` 及其 `replace` 选项在 `init()` 之前注册它。
- **自己触发作业。**调用方法（`await job.exportInvoices()`）在每个实例上，或者通过 `@nestjs/schedule` 和 `schedulerRegistry.getCronJob(name).fireOnTick()`.两者都到达包装。指向一个永远不会到来的日期：示例 `vitest.config.mts` 将两个 cron 变量设置为 2 月 29 日 3 AM.
- **控制时间。**覆盖 `LOCKS_MODULE_OPTIONS` 用一个 `ManualLockClock` 以及每次续订、截止日期和 `wait` 在该实例中，只有当测试提前时钟时才会移动：`await clock.advance('5m')` 按顺序点燃途中到期的东西，等待每次更新到达商店。您不推进其时钟的实例是一个暂停进程。相对于 PGlite 或服务器，商店的时钟是实时的，所以一个短的 `ttl`(`'1s'`）和一个 `sleep` 使暂停实例的锁过期；对于内存存储，给它相同的 `ManualLockClock` 到期日也随之移动。
- **在日志上断言**或 `LocksEvents.events$`：哪个实例运行作业、每个跳过的勾号、每个丢失的锁、每个领导变更。这些事件也发布在 `nestjs:locks:lock-lost`,`nestjs:locks:leadership-acquired` 和 `nestjs:locks:leadership-lost` 诊断渠道。
- **使用合同套件测试您的商店**Drizzle,TypeORM 和 Redis 商店会，针对您在生产中运行的服务器。

看 [End-to-end testing](/fundamentals/testing#end-to-end-testing) 有关测试设置的更多信息。

#### 生产检查表

- 在数据库中注册共享存储或 Redis，并针对它运行合同套件 `concurrent` 在，在 CI，在生产中运行的版本上。在生产中，应用程序拒绝在没有它的情况下启动，除非 `allowInMemoryStorage` 设置，这仅适用于单个实例。
- 设置 `key` 每个作业都不能运行两次，因此重命名或缩小程序不能在滚动部署期间更改它。
- 挑选一个 `ttl` 远高于商店的往返行程和您接受的最长的活动循环摊位，并且足够短，撞车不会跳过太多刻度。每次续订都会到期 `ttl / 3`;30 秒适合大多数工作。长作业的运行锁以相同的速度更新，因此它 `ttl` 不需要报道跑步。
- 将 `storeTimeout` 留在商店最慢的健康响应上方：经过它的商店调用失败，因此勾号不运行，`acquire()` 用 `LockStoreTimeoutError` 拒绝。默认值为 10 秒，还限制了停滞存储（耗尽的池、故障转移、Redis 客户端在离线时排队命令）保留作业、请求或续订的时间。
- 写做该做的工作，而不是做该做的工作。错过的蜱虫不会被追上：崩溃的车主损失高达 `ttl` 的 ticks，并且跳过长时间运行期间的 ticks。
- 通过 `LocksContext.signal` 到作业调用的内容，并将无法撤销的写入围起来 `LocksContext.fencingToken`，在同一条语句中写道。警戒 `lock-lost` 来自 `LocksEvents` 或诊断通道：这意味着续订失败的时间超过 `ttl`，因为存储不可到达或事件循环被阻塞，而另一个实例可能正在运行相同的关键部分。
- 呼吁 `app.enableShutdownHooks()` 因此，部署会立即移交租约，而不是让它们到期。关闭 Redis 客户端 `onApplicationShutdown()`，阶段 `@nestjs/drizzle` 关闭数据库池：包将租约交回 `onModuleDestroy()` 并释放所有其他锁 `beforeApplicationShutdown()` 阶段 Nest 首先完成整个应用程序。在关闭前不到一秒钟开始工作的租约将在该一秒钟的剩余时间内保留，而不是交回，这样触发相同 tick 的实例就会跳过它，而不是第二次运行它。
- 对于 Redis 存储，给出 Redis 持久性和 `maxmemory-policy noeviction`。击剑柜台决不能回去，一把锁决不能被驱逐。
- 使用数据库存储，通过迁移创建表和序列，并调整连接池的大小，使每个持有的锁每次续订一个短语句，每个实例每次勾选一个。
- 保持实例的时钟与 NTP 无论如何。有效期是在商店的时钟上衡量的，但持有者会计算自己的截止日期，并且 `@nestjs/schedule` 实例的时钟开火。
- 日志级别：跳过的刻度记录在 `debug`。在推出后保持这个级别一段时间，看看作业在一个实例上解决。

#### 商店合同

教程用 Drizzle、TypeORM 和 Redis 编写了商店。本节总结了任何 `LockStore` 必须做的事情，用另一个数据库或 ORM 编写一个数据库。[`LockStore` interface](https://github.com/nestjs/locks/blob/master/lib/interfaces/lock-store.interface.ts) 记录了完整的合同和每条规则阻止的比赛。

**注册。**商店是一个普通的 singleton 提供者 `registerSource(this)` 关于注射剂 `LocksStorage` 在它的构造函数中。注册表会立即检查形状，除非通过，否则拒绝第二次注册 `replace: true`，并在 `LocksModule` 初始化，记录正在使用的存储。在没有注册任何内容的情况下，该模块使用 `InMemoryLockStore`，它只排除一个进程中的调用者。和 `NODE_ENV=production`，启动失败，除非您设置 `allowInMemoryStorage: true`.

**方法。**这三个方法都是原子的：每个方法决定谁持有密钥，读取后单独写入允许两个调用者进入关键部分，这是包存在以防止的重复运行。

| 方法 | 它的作用 | 它如何保持原子状态 |
| --- | --- | --- |
| `acquire(key, owner, ttl)` | 如果没有活动锁持有密钥（无、已释放或已过期），则获取密钥，其围栏标记大于密钥之前的每个标记 | 一个插入接管同一语句中已释放或过期的行，在写入时重新检查过期，因此在许多并发调用者中，只有一个获胜；在检查后抽取令牌 |
| `renew(key, owner, ttl)` | 将所有者的实时锁的到期日移至 `ttl` 从现在开始 | 比较设置：所有者和到期日在 `WHERE` 声明中写道 |
| `release(key, owner)` | 释放所有者的实时锁（删除它，或标记为已释放），以便下一个调用者立即拿走它。切勿重置密钥的令牌 | 比较集，如 `renew()` |

**商店还必须做对**，所有这些都由套件检查：每个方法都不存在过期锁，无论它是否已被删除（在每种情况下都是 `expires_at > now`，或者让服务器过期）；`ttl` 是在商店的时钟上测量的，以毫秒为单位，可以是周（经过 32 位整数：`bigint`，`PEXPIRE`）；密钥是最多 500 个字符的字符串，任何 Unicode，完全分开；令牌是作为数字返回的正安全整数。PostgreSQL 将 `bigint` 列作为字符串返回，除非 ORM 转换它；包立即拒绝这样的令牌，并提供一条命名修复的消息，而不是让围栏无声地破坏。

**与 Prisma.** 这 Drizzle 存储是模型，有相同的表和顺序； [Keep locks in your database](/reliability/locks#keep-locks-in-your-database) 还显示了 TypeORM. `acquire()` 是一个 `INSERT ... ON CONFLICT (key) DO UPDATE ... WHERE owner IS NULL OR expires_at <= clock_timestamp() RETURNING fencing_token`，其中标记绘制在 `SET`，在行锁定之后。 Prisma's `upsert()` 更新没有条件，因此使用 `$queryRaw`. `renew()` 和 `release()` 将所有者和到期日放入 `WHERE` 的 `updateMany()` 并检查 `count === 1`.不 `update()` 之后 `findUnique()`：它先读。

**使用套件进行测试** `@nestjs/locks/testing`. `lockStoreContract()` 返回任何测试运行程序的案例。 `concurrent: true` 每个密钥竞争 16 个呼叫者，其 `callers` 期权提高了这一点；在带有连接池的服务器上运行它，那里的调用实际上是重叠的。 `advanceTime` 为过期情况移动商店的时钟；如果没有它，他们就会实时等待，总共大约 25 秒，锁定 `ttl` （默认为 2.5 秒，中途勾选仍然持有，并释放六分之一过去：为往返缓慢的商店提高它）。

#### 参考

##### 模块选项

`LocksModule.forRoot()` 采取这些选项；`forRootAsync()` 从 `useFactory`、`useClass` 或 `useExisting`（实现 `LocksOptionsFactory` 的类）获取它们。存储不是一个选项：用 `LocksStorage` 注册它，如在 [Keep locks in your database](/reliability/locks#keep-locks-in-your-database) 中。

| 选择 | 默认的 | 意义 |
| --- | --- | --- |
| `ttl` | `'30s'` | 一个锁在不更新的情况下能存活多久，那么另一个实例在崩溃后多久会接管。每个锁、租约和选举的默认值。持续时间：毫秒，或字符串，如 `'15s'` 或者 `'2m'` |
| `storeTimeout` | `'10s'` | 每次商店呼叫需要等待多长时间（`acquire()`, `renew()`, `release()`).超过它，调用失败 `LockStoreTimeoutError`: `acquire()` 拒绝，勾号不运行，在下一个节拍时再次尝试续订，然后存储授予的锁返回到它 |
| `clock` | 系统时钟 | 和 `LockClock`。测试通过 `ManualLockClock` ([Testing](/reliability/locks#testing)) |
| `allowInMemoryStorage` | `false` | 和 `NODE_ENV=production` 没有注册商店，启动失败；`true` 无论如何都在内存存储中运行（一个实例） |
| `isGlobal` | `true` | 全局注册模块。的顶层 `forRoot()` 和 `forRootAsync()` |

##### 装饰剂和方法

| API | 选项 | 附注 |
| --- | --- | --- |
| `@OnOneInstance()` | `key`,`ttl` | 在保存 `<key>:owner` 出租；其他实例跳过勾号。[Run each job on one instance](/reliability/locks#run-each-job-on-one-instance) |
| `@WithoutOverlapping()` | `key`,`ttl` | 运行时跳过勾号 `<key>` 无论如何都要锁上。[Don't let a long run overlap itself](/reliability/locks#dont-let-a-long-run-overlap-itself) |
| `@LeaderElection(key)` | `ttl` | 关于单例提供者实现 `OnLeadershipAcquired`,`OnLeadershipLost` 或者两者都有。[Hold the warehouse feed on one instance](/reliability/locks#hold-the-warehouse-feed-on-one-instance) |
| `Locks.acquire(key, options)` | `ttl`,`wait`,`signal` | 解决 `Lock`, 或 `null` 当钥匙被拿走时。[Run the export by hand](/reliability/locks#run-the-export-by-hand) |
| `Locks.withLock(key, fn, options)` | `ttl`,`wait`,`signal` | 运行 `fn(lock)` 在锁下并释放它；拒绝 `LockNotAcquiredError` 当钥匙被拿走时 |

- `key` 默认值为 `ClassName.methodName`，并且一个方法上的两个作业装饰器共享它。`ttl` 模块的默认值。
- `wait` 默认值为 `0`（试一次）；更长的等待会带有后退的重试。`signal` 停止等待，也是在飞行中打电话给商店。都不是 `wait` 也不 `ttl` 限制存储调用：模块的 `storeTimeout` 是的。
- 一个 `Lock` 有 `key`,`owner`,`fencingToken`,`signal`,`held`,`release()` 和 `[Symbol.asyncDispose]`,所以 `await using` 释放它。
- `LocksContext` 在作业、`withLock()` 回调或 `run(lock, fn)` 中具有 `lock`、`fencingToken` 和 `signal`；在一个之外，它们是 `undefined`。[Fence the writes](/reliability/locks#fence-the-writes)

##### 事件

`LocksEvents.events$` 发射每个事件，并将其发布到其 `node:diagnostics_channel` 通道上。每个有效载荷都有 `type`、`key` 和 `fencingToken`。

| 事件 | 渠道 | 其他领域 | 何时 |
| --- | --- | --- | --- |
| `lock-lost` | `nestjs:locks:lock-lost` | `detectedBy`:`'renewal'` 或者 `'deadline'` | 一个持有者丢失了它正在使用的锁。警惕它 |
| `leadership-acquired` | `nestjs:locks:leadership-acquired` | 没有一个 | 这个实例成为了 `key` |
| `leadership-lost` | `nestjs:locks:leadership-lost` | `reason`:`'lost'` 或者 `'released'` | 此实例停止领先：租约丢失或下台 |

##### 错误

他们都没有携带 HTTP 状态：争用不是调用者的错误，因此处理程序选择响应（[Run the export by hand](/reliability/locks#run-the-export-by-hand) 答案 `409`).

| 错误 | 属性 | 抚养时间 |
| --- | --- | --- |
| `LocksError` | 没有一个 | 下面三个的基类 |
| `LockNotAcquiredError` | `key`,`waitMs` | `withLock()` 拿不到里面的锁 `wait` |
| `LockLostError` | `key`,`fencingToken`,`detectedBy` | 丢失锁的 `signal` 中止原因：商店拒绝续订（`'renewal'`），或 `ttl` 在没有确认续订的情况下通过（`'deadline'`） |
| `LockStoreTimeoutError` | `key`,`method`,`timeoutMs` | 商店呼叫（`method`:`'acquire'`,`'renew'` 或者 `'release'`）没有回答 `storeTimeout` |
