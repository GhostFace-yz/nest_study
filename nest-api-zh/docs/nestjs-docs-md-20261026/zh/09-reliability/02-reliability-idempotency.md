# Idempotency keys

Source: https://docs.nestjs.com/reliability/idempotency

一家猫粮和用品在线商店的顾客在商店的移动应用程序中，通过火车上的手机支付三文鱼粗粮和猫砂。应用程序发送 `POST /orders/ord_1001/pay`。服务器通过支付提供者向卡收费，但响应永远不会到达手机。该应用程序无法区分丢失的请求和丢失的响应，因此它会重试。如果没有保护，重试会出现以下两种情况之一：

- 它在第一个请求完成后到达。订单已经 `paid`，因此客户收到付款的错误。
- 它到达时，第一个请求仍在等待支付提供者。两个请求都会传递“订单是否仍然挂起？”检查，卡被收取两次费用。

一个**幂等键**可以修复这两个问题。客户端为每次付款尝试生成一个唯一密钥，并将其发送到 `Idempotency-Key` 每次重试的标题。服务器对每个键运行一次处理程序，存储结果，并用该结果回答每次重试。 `@nestjs/idempotency` 为 HTTP 道路， GraphQL 具有一个装饰器的突变和微服务处理程序， `@Idempotent()`.其 HTTP 行为遵循 IETF [Idempotency-Key header draft](https://datatracker.ietf.org/doc/draft-ietf-httpapi-idempotency-key-header/).

在本教程中，您将使支付端点幂等，教移动应用程序安全地重试，将密钥移动到 PostgreSQL（或 Redis），加密存储的收据，保护 GraphQL 突变，并删除重复项 `order.paid` 运输服务消耗的事件。

#### 先决条件

本教程从商店的订单开始 API，已经有：

- 安 `OrdersModule` 用一个 `OrdersService` 和一个 `OrdersController`.一个 `Order` 有一个 `id`, a `userId`, `items`, a `total` 以美分为单位，以及 `status` 的 `'pending'`, `'paid'`, `'shipped'` 或者 `'refunded'`.
- A `PaymentProviderClient` 这封装了支付提供者的 SDK.它抛出一个 402 `HttpException` 当卡被拒绝时，以及 `ServiceUnavailableException` (503) 当提供者关闭时。
- 安 `AuthGuard` 验证承载令牌并设置 `req.user`（见 [Authentication](/security/authentication#issue-tokens-to-the-mobile-app))，加 a`@CurrentUser()` 读取它的参数装饰器。
- 全球 `ValidationPipe` 和运输服务的 TCP 客户端，注册为 `SHIPPING_SERVICE`。
- 它在 PostgreSQL 中的数据，通过 Drizzle，数据库由 `@nestjs/drizzle` （见 [Drizzle](/data/drizzle)).使用 TypeORM? [Store keys in PostgreSQL](/reliability/idempotency#store-keys-in-postgresql) 以存储结束 TypeORM.

这是我们需要保护的方法：

```typescript
async pay(orderId: string, user: User, dto: PayOrderDto): Promise<PaymentReceipt> {
  const order = this.ordersRepository.findOwned(orderId, user.id);
  if (order.status !== 'pending') {
    throw new ConflictException(`Order ${order.id} is already ${order.status}`);
  }
  const charge = await this.paymentProviderClient.charge({
    amount: order.total,
    paymentMethod: dto.paymentMethod,
    reference: order.id,
  });
  this.ordersRepository.markPaid(order.id);
  this.shipping.emit('order.paid', {
    eventId: `order-paid:${order.id}`,
    orderId: order.id,
  });

  return {
    orderId: order.id,
    receiptId: charge.id,
    amount: charge.amount,
    cardLast4: charge.cardLast4,
    paidAt: charge.createdAt,
  };
}
```

状态检查本身无法阻止双重收费：两个请求同时到达，两者都会看到 `pending` 在任何一个到达之前 `markPaid()`.

安装软件包：

```bash
$ npm i --save @nestjs/idempotency
```

#### 使支付端点幂等

登记 `IdempotencyModule` 一次，在根模块中：

```typescript
import { Module } from '@nestjs/common';
import { IdempotencyModule } from '@nestjs/idempotency';
import type { User } from './orders/order.js';
import { OrdersModule } from './orders/orders.module.js';

@Module({
  imports: [
    IdempotencyModule.forRoot({
      // Runs after guards, so req.user is set. Keys never collide across users.
      scope: (req: { user?: User }) => req.user?.id,
    }),
    OrdersModule,
  ],
})
export class AppModule {}
```

该模块是全局的。它注册了一个应用程序范围的拦截器，它对没有标记为 `@Idempotent()`，因此没有其他路由更改行为。

`scope` 为每个用户的密钥提供自己的命名空间。没有它，所有客户端共享一个命名空间，一个用户选择的密钥可以重放另一个用户的收据。有了它，爱丽丝和鲍勃都可以发送 `Idempotency-Key: 1` 从未见过对方的结果。因为守卫跑在拦截器前面， `req.user` 已设置为 `scope` 运行，未经身份验证的请求在用完密钥之前被拒绝。如果登录用户调用 `@Idempotent()` 没有 `scope`，模块记录一个警告，每个处理程序一次。如果一个共享命名空间是故意的，例如由提供程序的事件 id 加密的 webhook，则设置 `scope: false`.

现在标记处理程序：

```typescript
import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { Idempotent } from '@nestjs/idempotency';
import { AuthGuard } from '../auth/auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { PayOrderDto } from './dto/pay-order.dto.js';
import type { User } from './order.js';
import { OrdersService } from './orders.service.js';

@Controller('orders')
@UseGuards(AuthGuard)
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post(':id/pay')
  @Idempotent({ required: true })
  pay(
    @Param('id') id: string,
    @Body() dto: PayOrderDto,
    @CurrentUser() user: User,
  ) {
    return this.ordersService.pay(id, user, dto);
  }
}
```

`required: true` 拒绝没有 400 密钥的请求 `IDEMPOTENCY_KEY_REQUIRED` 处理程序运行前出错。没有密钥的付款无法安全重试，因此最好拒绝付款，而不是在没有保护的情况下向卡收费。

以下是携带密钥的请求发生的情况：

1. 拦截器计算请求的**指纹**：aSHA-256 作用域、方法、URL（其中包括订单 id）和主体，对象键已排序。
2. 它原子锁定**记录密钥** `<scope>:<key>`，例如 `usr_alice:5e0f6d0e-…`.如果记录已经存在，则处理程序不会运行（参见下表）。当处理程序运行时，拦截器不断更新锁，因此缓慢的处理程序永远不会在重试时丢失它。
3. 处理程序运行。当它完成时，锁变成了一个完整的记录，保存响应：状态代码、正文和短允许列表中的标题（`Location`, `Content-Type`, `Content-Language`, `Content-Location`, `ETag` 和 `Last-Modified`) 如果处理程序或中间件设置了它们。它们描述了存储的主体，因此重试与另一个重试一起发送 `Accept-Language` 仍然得到存储的身体的 `Content-Language`.饼干， CORS 速率限制报头属于原始请求，并且永远不会重放。

每个具有相同密钥的后续请求都会得到以下答案之一：

| 情况 | 回应 |
| -------------------------------------- | --------------------------------------------------------------------------------------- |
| 第一个请求仍在运行 | 409`IDEMPOTENCY_KEY_IN_USE`，用一个 `Retry-After` 头球 |
| 第一个请求已完成 | 存储的状态和主体，加上 `Idempotent-Replayed: true`。处理程序不运行。 |
| 相同的键，但不同的主体或 URL | 422`IDEMPOTENCY_KEY_REUSED` |

也可以存储错误。[Tune TTLs and failure handling](/reliability/idempotency#tune-ttls-and-failure-handling) 涵盖哪些。

因为拦截器是全局的，所以它运行在控制器和处理程序的拦截器之外。在序列化程序和其他拦截器运行后，存储的主体正是客户端收到的，重播跳过了所有这些。管道在里面运行，所以一个 `ValidationPipe`400 像任何其他客户端错误一样被存储。正如生产清单所解释的那样，其他全球拦截器是另一回事。

直到你 [store keys in PostgreSQL](/reliability/idempotency#store-keys-in-postgresql) 默认情况下，记录驻留在内存中 `InMemoryIdempotencyStore`.这对于开发中的单个实例来说没问题，但是 API 有自己的记录，重启时会丢失。何时 `NODE_ENV` 是 `production`，该应用程序拒绝以这种方式启动，并显示一个错误，说明如何注册商店。

#### 从移动应用程序发送密钥

服务器只能对客户端一致发送的内容进行重复数据删除。该应用程序遵循两条规则：

- 当客户点击**支付**时，它会创建密钥，而不是每个请求一次。每次重试该付款都会发送相同的密钥，即使在应用程序被终止并重新启动后，因此密钥会与待处理的付款一起保存。
- 它只为客户的新决定创建一个新密钥，例如在拒绝后选择另一张卡。发送具有不同主体的旧密钥是 422。

```typescript
export interface Receipt {
  orderId: string;
  receiptId: string;
  amount: number;
  cardLast4: string;
  paidAt: string;
}

export interface PendingPayment {
  orderId: string;
  paymentMethod: string;
  idempotencyKey: string;
}

export class PaymentError extends Error {
  constructor(
    readonly status: number,
    readonly body: { code?: string; message?: string },
  ) {
    super(body.message ?? `Payment failed with status ${status}`);
  }
}

// Call when the customer taps "Pay", and save the result with the order
// (for example in AsyncStorage). Retries, even after an app restart, reuse it.
export function startPayment(orderId: string, paymentMethod: string): PendingPayment {
  return { orderId, paymentMethod, idempotencyKey: crypto.randomUUID() };
}

export async function payOrder(
  apiUrl: string,
  token: string,
  payment: PendingPayment,
  maxAttempts = 5,
): Promise<Receipt> {
  for (let attempt = 1; ; attempt++) {
    const backoff = 250 * 2 ** (attempt - 1);
    let res: Response;
    try {
      res = await fetch(`${apiUrl}/orders/${payment.orderId}/pay`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': payment.idempotencyKey,
        },
        body: JSON.stringify({ paymentMethod: payment.paymentMethod }),
        signal: AbortSignal.timeout(15_000),
      });
    } catch (err) {
      // No response: the card may or may not have been charged. Same key, try again.
      if (attempt >= maxAttempts) {
        throw err;
      }
      await sleep(backoff);
      continue;
    }
    if (res.ok) {
      return res.json(); // the first result, even if Idempotent-Replayed: true
    }
    const body = await res.json().catch(() => ({})); // a proxy's 502 page isn't JSON
    const retryable =
      res.status >= 500 || // the server released the key
      res.status === 429 ||
      body.code === 'IDEMPOTENCY_KEY_IN_USE'; // the first attempt is still running
    if (!retryable || attempt >= maxAttempts) {
      throw new PaymentError(res.status, body);
    }
    const retryAfter = Number(res.headers.get('Retry-After'));
    await sleep(retryAfter > 0 ? retryAfter * 1000 : backoff);
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
```

`crypto.randomUUID()` 可在浏览器和 Node.js 中使用。在 React 本机中，使用 UUID 库，如 `expo-crypto` 中的 `randomUUID()`。

以下是应用程序可以获得的响应，以及它们对重试的含义：

| 回应 | 意义 | 用同一个键重试？ |
| ------------------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------- |
| 无响应（网络错误、超时） | 该卡可能已收费，也可能未收费 | 是的 |
| 2xx | 完成。和 `Idempotent-Replayed: true` 这是第一次尝试的结果 | 不，出示收据 |
| 代码为 409`IDEMPOTENCY_KEY_IN_USE` | 第一次尝试仍在运行 | 是的，之后 `Retry-After` 秒 |
| 5xx | 尝试失败，服务器释放了密钥 | 是的，有回扣 |
| 429 | 处理程序运行前速率受限 | 是的，之后 `Retry-After` 秒 |
| 422`IDEMPOTENCY_KEY_REUSED` | 错误：密钥被重新用于不同的请求 | 不是 |
| 任何其他 4xx：400、402（拒绝）、404、409（已支付） | 最后的。每次使用此键重试都会得到相同的答案 | 不。显示错误；新尝试获得新密钥 |

检查 `code` 不仅仅是地位。409 也可以意味着订单已经支付，并且该订单是最终的。

#### 在 PostgreSQL 中存储密钥

内存存储在生产中是不够的。每当进程停止时，在每个部署或替换的容器上，它的记录都会消失，因此随后到达的重试会再次运行支付。一旦 API 在多个实例上运行时，在另一个实例上的重试将找不到记录，两个实例都可以拿走锁。记录需要一个共享存储，可以原子地“创建，除非它存在”。

`@nestjs/idempotency` 不送。它定义了合同，`IdempotencyStore` 接口，并在应用程序的提供程序中实现它，使用数据库或 Redis 它已经有的客户。接口有四种方法。每个记录都首先获取记录密钥和所有者，持续时间以毫秒为单位：

- `acquire(key, owner, fingerprint, lockTtl)` 创建锁，或返回现有记录：在飞行中，或完成其响应。它必须是原子的：在任何数量的并发呼叫中，只有一个可能会获胜。
- `complete(key, owner, response, ttl)` 将锁转换为完整记录，如果 `owner` 还拿着它。
- `release(key, owner)` 删除锁，如果 `owner` 仍然保留它，因此重试可以再次运行处理程序。
- `extend(key, owner, lockTtl)` 将锁的到期日重置为 `lockTtl` 从现在开始，如果 `owner` 还拿着它。拦截器每次都叫它 `lockTtl / 3` 当处理程序运行并存储其结果时。

`owner` 是每次尝试的随机 id，称为围栏令牌。如果尝试停止更新锁（例如，它的实例崩溃），然后重试接管 `lockTtl` 旧的尝试 `extend()`,`complete()` 或者 `release()` 什么也不做，而不是覆盖重试的记录。所以“如果 `owner` 仍然持有它”必须在同一个原子操作中检查，该操作写入：首先在一个单独的读取中检查，接管可能会在两者之间滑动。

本节显示了两次存储：第一次是使用 Drizzle，这是教程的路径，然后，在本节末尾的“使用 TypeORM”下，为 ORM 是 TypeORM 的应用程序存储相同的存储。取两个中的一个。

存储库将其数据保存在 PostgreSQL 中，Drizzle，所以记录在其中有一个表 Drizzle 方案：

```typescript
import type { IdempotencyStoredPayload } from '@nestjs/idempotency';
import { bigint, index, json, pgTable, text } from 'drizzle-orm/pg-core';

/** One row per idempotency record: an in-flight lock, or a completed response. */
export const idempotencyKeys = pgTable(
  'idempotency_keys',
  {
    // SHA-256 of the record key: keys can be longer than an index entry allows.
    keyHash: text('key_hash').primaryKey(),
    key: text('key').notNull(),
    fingerprint: text('fingerprint').notNull(),
    // The attempt holding the lock; null once the record is completed.
    owner: text('owner'),
    // null while in flight. json, not jsonb: jsonb rejects "\u0000" in strings.
    response: json('response').$type<IdempotencyStoredPayload>(),
    // Epoch milliseconds.
    expiresAt: bigint('expires_at', { mode: 'number' }).notNull(),
  },
  (table) => [index('idempotency_keys_expires_at_idx').on(table.expiresAt)],
);
```

主键是 SHA-256 记录键的散列，因为记录键（作用域、客户端键和 GraphQL 字段的路径）可能比 PostgreSQL 在索引条目中允许的长。答案是 `json` 而不是 `jsonb`,因为 `jsonb` 拒绝 a`\u0000` 字符串内部，响应体可以包含一个。使用 drizzle-kit 生成迁移，并使用 `npx drizzle-kit migrate` 像往常一样：

```bash
$ npx drizzle-kit generate --name=idempotency
```

```sql
CREATE TABLE "idempotency_keys" (
	"key_hash" text PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"fingerprint" text NOT NULL,
	"owner" text,
	"response" json,
	"expires_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idempotency_keys_expires_at_idx" ON "idempotency_keys" USING btree ("expires_at");
```

商店使用 Drizzle 的查询生成器。它将数据库注入 `@InjectDrizzle()` 来自 `@nestjs/drizzle`，构造函数将存储注册为 `IdempotencyStorage`，注册表 `IdempotencyModule` 出口：

```typescript
import { Injectable } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import {
  IdempotencyStorage,
  type IdempotencyAcquireResult,
  type IdempotencyStore,
  type IdempotencyStoredPayload,
} from '@nestjs/idempotency';
import { and, eq, gt, inArray, lte } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { createHash } from 'node:crypto';
import { idempotencyKeys } from '../database/schema.js';

/** A Drizzle database on PostgreSQL: node-postgres in the app, PGlite in its tests. */
export type Database = PgDatabase<PgQueryResultHKT>;

const { keyHash, owner: ownerColumn, expiresAt } = idempotencyKeys;

@Injectable()
export class DrizzleIdempotencyStore implements IdempotencyStore {
  constructor(
    @InjectDrizzle() private readonly db: Database,
    storage: IdempotencyStorage,
  ) {
    storage.registerSource(this);
  }

  async acquire(
    key: string,
    owner: string,
    fingerprint: string,
    lockTtl: number,
  ): Promise<IdempotencyAcquireResult> {
    const hash = hashOf(key);
    // A second round only happens when the row was released or expired
    // between the two statements below.
    for (let attempt = 0; attempt < 5; attempt++) {
      const now = Date.now();
      const lock = { fingerprint, owner, response: null, expiresAt: now + lockTtl };
      // Insert the lock, or take over an expired row. Of many concurrent
      // callers, PostgreSQL lets one write, and re-checks `setWhere` for the
      // others against the winner's row: they get no row back.
      const taken = await this.db
        .insert(idempotencyKeys)
        .values({ keyHash: hash, key, ...lock })
        .onConflictDoUpdate({
          target: keyHash,
          set: lock,
          setWhere: lte(expiresAt, now),
        })
        .returning({ keyHash });
      if (taken.length) {
        return { state: 'acquired' };
      }

      // Someone else holds the key: report their lock or record.
      const [row] = await this.db
        .select()
        .from(idempotencyKeys)
        .where(eq(keyHash, hash));
      if (row && row.expiresAt > now) {
        return row.response === null
          ? { state: 'in-flight', fingerprint: row.fingerprint }
          : { state: 'completed', fingerprint: row.fingerprint, response: row.response };
      }
    }
    throw new Error(`The idempotency record for "${key}" kept changing; try again`);
  }

  async complete(
    key: string,
    owner: string,
    response: IdempotencyStoredPayload,
    ttl: number,
  ): Promise<boolean> {
    const now = Date.now();
    const done = await this.db
      .update(idempotencyKeys)
      .set({ owner: null, response, expiresAt: now + ttl })
      .where(this.ownedBy(key, owner, now))
      .returning({ keyHash });
    return done.length === 1;
  }

  async release(key: string, owner: string): Promise<boolean> {
    const released = await this.db
      .delete(idempotencyKeys)
      .where(this.ownedBy(key, owner, Date.now()))
      .returning({ keyHash });
    return released.length === 1;
  }

  async extend(key: string, owner: string, lockTtl: number): Promise<boolean> {
    const now = Date.now();
    const extended = await this.db
      .update(idempotencyKeys)
      .set({ expiresAt: now + lockTtl })
      .where(this.ownedBy(key, owner, now))
      .returning({ keyHash });
    return extended.length === 1;
  }

  /**
   * Deletes up to `limit` expired rows, for a scheduled job. Expired rows are
   * already ignored, and reused by the next request with the same key.
   */
  async prune(limit = 1000): Promise<number> {
    const now = Date.now();
    const expired = this.db
      .select({ keyHash })
      .from(idempotencyKeys)
      .where(lte(expiresAt, now))
      .limit(limit);
    const deleted = await this.db
      .delete(idempotencyKeys)
      // Checks the expiry again: a row taken over since the subquery read it stays.
      .where(and(inArray(keyHash, expired), lte(expiresAt, now)))
      .returning({ keyHash });
    return deleted.length;
  }

  /** The caller's lock, if it still holds it and it hasn't expired. */
  private ownedBy(key: string, owner: string, now: number) {
    return and(eq(keyHash, hashOf(key)), eq(ownerColumn, owner), gt(expiresAt, now));
  }
}

function hashOf(key: string) {
  return createHash('sha256').update(key).digest('hex');
}
```

数据库的类型为 `PgDatabase`,什么 Drizzle 的 node-postgres 和 PGlite 驱动程序有共同点，所以下面的测试可以在 PGlite 上运行存储。每个方法都是 PostgreSQL 原子运行的单个语句，没有事务：

- `acquire()` 用一个 `INSERT ... ON CONFLICT DO UPDATE ... WHERE expires_at <= now` 插入锁，或接管过期行。当几个调用者争夺一个密钥时，PostgreSQL 会让其中一个调用者根据获胜者的行写入并再次检查 `WHERE`，这样他们就不会得到返回的行，而是读取获胜者的锁。如果该行在中间消失（已释放或过期），`acquire()` 将再次循环。
- `complete()`,`extend()` 和 `release()` 检查所有者，并且锁没有过期，在 `WHERE` 写的陈述。他们计算行数 `returning()` 返回，这在每个方面都是一样的 Drizzle 司机。
- 过期的行会立即被忽略，具有相同键的下一个请求会重用其行。要删除其余部分，请调用 `prune()` 从计划作业，例如使用 `@Interval()` 来自 `@nestjs/schedule`.它在 `DELETE` 它本身，所以在此期间重试接管的一行仍然存在。

到期时间来自每个实例的时钟（`Date.now()`），因此保持时钟同步，如 NTP 是的。每个幂等请求都会向连接池添加一个或两个语句，再加上一个 `UPDATE` 每一 `lockTtl / 3` 当它的处理程序运行时。

这家商店是一家普通的供应商。使用 `DrizzleModule` 注册数据库（参见 [Drizzle](/data/drizzle)），并将存储添加到 `AppModule` 的提供程序中：

```typescript
import { Module } from '@nestjs/common';
import { DrizzleModule } from '@nestjs/drizzle';
import { IdempotencyModule } from '@nestjs/idempotency';
import { drizzle } from 'drizzle-orm/node-postgres';
import { DrizzleIdempotencyStore } from './idempotency/drizzle-idempotency.store.js';
import type { User } from './orders/order.js';
import { OrdersModule } from './orders/orders.module.js';

@Module({
  imports: [
    DrizzleModule.forRootAsync({
      useFactory: () => ({ drizzle, connection: process.env.DATABASE_URL! }),
    }),
    IdempotencyModule.forRoot({
      scope: (req: { user?: User }) => req.user?.id,
    }),
    OrdersModule,
  ],
  // Registers itself with IdempotencyStorage when Nest creates it.
  providers: [DrizzleIdempotencyStore],
})
export class AppModule {}
```

> info **Hint** 应用程序读取 `DATABASE_URL` 并且，一旦收据被加密， `IDEMPOTENCY_KEYS`, 从 `process.env`.应用程序通过 `@nestjs/config`，其验证模式在缺少变量时停止启动，并注入 `ConfigService` 而是进入这些工厂。

在启动时，模块记录它使用的存储，`IdempotencyStorage: DrizzleIdempotencyStore`，然后它停止接受注册：

- 一个应用程序有一个商店。第二个 `registerSource()` 调用抛出，命名两个类。
- 从单例提供程序的构造函数注册。注册表锁定时 `IdempotencyModule` 初始化，因此稍后注册的存储（从生命周期挂钩、每个请求或在延迟加载的模块中）会抛出而不是被静默忽略。
- 如果没有注册存储，模块将记录保存在内存中。生产中（`NODE_ENV=production`)，它拒绝以这种方式启动，除非您设置 `allowInMemoryStorage: true`，它接受每次重新启动或部署都会忘记记录。

每个存储都使用相同的合同套件进行测试，`@nestjs/idempotency/testing` 导出为任何测试运行程序的普通测试用例。它涵盖了每种方法、所有者检查、过期和 `concurrent`，读取然后写入的存储出错的竞争。示例项目在 PGlite 上针对此存储运行它，并在 PostgreSQL 上通过 `pg` 池，其中 32 个呼叫者在多达 16 个连接上争夺每个密钥：

```typescript
import { PGlite } from '@electric-sql/pglite';
import { IdempotencyStorage } from '@nestjs/idempotency';
import { idempotencyStoreContract } from '@nestjs/idempotency/testing';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator';
import { DrizzleIdempotencyStore } from '../src/idempotency/drizzle-idempotency.store.js';

const migrationsFolder = new URL('../drizzle', import.meta.url).pathname;
// ...
describe('DrizzleIdempotencyStore on PGlite', () => {
  let pglite: PGlite;
  let store: DrizzleIdempotencyStore;

  beforeAll(async () => {
    pglite = new PGlite();
    const db = drizzlePglite(pglite);
    await migratePglite(db, { migrationsFolder }); // npx drizzle-kit migrate
    store = new DrizzleIdempotencyStore(db, new IdempotencyStorage());
  });
  afterAll(() => pglite.close());

  describe('the IdempotencyStore contract', () => {
    // The store reads Date.now(): fake Date alone, so the driver keeps its timers.
    beforeEach(() => vi.useFakeTimers({ toFake: ['Date'] }));
    afterEach(() => vi.useRealTimers());

    // One store and one table for every case: each case uses keys of its own.
    const cases = idempotencyStoreContract(() => store, {
      advanceTime: (ms) => vi.setSystemTime(Date.now() + ms),
      concurrent: true,
    });
    for (const c of cases) {
      it(c.name, c.run);
    }
  });
  // ...
});
```

**与 TypeORM.**应用程序的同一存储 ORM 是 TypeORM 在同一张桌子上。Drizzle 坚持教程的路径：选择这个商店，而不是上面的商店，而不是它旁边。表是一个实体，每一列都声明其类型，因此 TypeORMCLI，它在没有 decorator 元数据的情况下加载它，它看到的模式与应用程序相同：

```typescript
import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

// The idempotency_keys table of the Drizzle schema in src/database/schema.ts, as an entity.
// Every column states its type, so the entity loads the same with or without emitted
// decorator metadata (the TypeORM CLI runs it through tsx, which emits none).

/** Reads a `bigint` column as a number: TypeORM returns it as a string. */
const epochMs = {
  to: (value: number) => value,
  from: (value: string) => Number(value),
};

/** One row per idempotency record: an in-flight lock, or a completed response. */
@Entity('idempotency_keys')
@Index('idempotency_keys_expires_at_idx', ['expiresAt'])
export class IdempotencyKeyEntity {
  // SHA-256 of the record key: keys can be longer than an index entry allows.
  @PrimaryColumn({ type: 'text', name: 'key_hash' })
  keyHash: string;

  @Column({ type: 'text' })
  key: string;

  @Column({ type: 'text' })
  fingerprint: string;

  // The attempt holding the lock; null once the record is completed.
  @Column({ type: 'text', nullable: true })
  owner: string | null;

  // null while in flight. json, not jsonb: jsonb rejects "\u0000" in strings. An
  // IdempotencyStoredPayload, typed `object`: its `unknown` body doesn't fit TypeORM's insert types.
  @Column({ type: 'json', nullable: true })
  response: object | null;

  // Epoch milliseconds.
  @Column({ type: 'bigint', name: 'expires_at', transformer: epochMs })
  expiresAt: number;
}
```

TypeORM 返回一个 `bigint` 列作为字符串，因此 transformer 读取 `expiresAt` 作为一个数字回来。键入响应列 `object` 而不是 `IdempotencyStoredPayload`，因为有效载荷的 `unknown` 身体不合适 TypeORM 的插入类型；存储在读取记录时抛出它。这个 TypeORMCLI 和 `TypeOrmModule` 在数据源文件中共享一组选项：

```typescript
import { DataSource, type DataSourceOptions } from 'typeorm';
import { IdempotencyKeyEntity } from './idempotency-key.entity.js';
import { Idempotency1790321611502 } from './migrations/1790321611502-Idempotency.js';

/** What the application's TypeOrmModule and the TypeORM CLI share. */
export const dataSourceOptions = {
  type: 'postgres',
  url: process.env.DATABASE_URL,
  entities: [IdempotencyKeyEntity],
  migrations: [Idempotency1790321611502],
} satisfies DataSourceOptions;

// The TypeORM CLI's data source: `migration:generate` compares the entities with this database.
export default new DataSource(dataSourceOptions);
```

从实体生成迁移，应用它，并检查实体和数据库是否一致。CLI 需要一个 TypeScript 加载器来加载数据源文件；这使用 `tsx`：

```bash
$ npx tsx ./node_modules/typeorm/cli.js migration:generate src/typeorm/migrations/Idempotency -d src/typeorm/data-source.ts --pretty
Migration /store/src/typeorm/migrations/1790321611502-Idempotency.ts has been generated successfully.
$ npx tsx ./node_modules/typeorm/cli.js migration:run -d src/typeorm/data-source.ts
$ npx tsx ./node_modules/typeorm/cli.js migration:generate src/typeorm/migrations/Check -d src/typeorm/data-source.ts --check
No changes in database schema were found
```

它写的迁移，`1790321611502-Idempotency.ts`，是 `CREATE TABLE` 和 `CREATE INDEX` 的声明 Drizzle 迁移和 `migrations` 数据源中列出了它。现在商店，在相同的规则下 Drizzle 一：

```typescript
import { Injectable } from '@nestjs/common';
import {
  IdempotencyStorage,
  type IdempotencyAcquireResult,
  type IdempotencyStore,
  type IdempotencyStoredPayload,
} from '@nestjs/idempotency';
import { createHash } from 'node:crypto';
import { DataSource, MoreThan } from 'typeorm';
import { IdempotencyKeyEntity } from './idempotency-key.entity.js';

/**
 * Keeps idempotency records in PostgreSQL, through TypeORM: the Drizzle
 * store, on the same table. Each method is a single statement, so the
 * guarantees hold with any number of API instances.
 */
@Injectable()
export class TypeOrmIdempotencyStore implements IdempotencyStore {
  constructor(
    private readonly dataSource: DataSource,
    storage: IdempotencyStorage,
  ) {
    storage.registerSource(this);
  }

  async acquire(
    key: string,
    owner: string,
    fingerprint: string,
    lockTtl: number,
  ): Promise<IdempotencyAcquireResult> {
    const hash = hashOf(key);
    // A second round only happens when the row was released or expired
    // between the two statements below.
    for (let attempt = 0; attempt < 5; attempt++) {
      const now = Date.now();
      // Insert the lock, or take over an expired row. Of many concurrent
      // callers, PostgreSQL lets one write, and re-checks the overwrite
      // condition for the others against the winner's row: they get no row back.
      const { raw } = await this.dataSource
        .createQueryBuilder()
        .insert()
        .into(IdempotencyKeyEntity)
        .values({ keyHash: hash, key, fingerprint, owner, response: null, expiresAt: now + lockTtl })
        .orUpdate(['fingerprint', 'owner', 'response', 'expires_at'], ['key_hash'], {
          overwriteCondition: { where: 'idempotency_keys.expires_at <= :now', parameters: { now } },
        })
        .returning(['keyHash'])
        .updateEntity(false)
        .execute();
      if ((raw as unknown[]).length === 1) {
        return { state: 'acquired' };
      }

      // Someone else holds the key: report their lock or record.
      const row = await this.dataSource.manager.findOneBy(IdempotencyKeyEntity, { keyHash: hash });
      if (row && row.expiresAt > now) {
        return row.response === null
          ? { state: 'in-flight', fingerprint: row.fingerprint }
          : { state: 'completed', fingerprint: row.fingerprint, response: row.response as IdempotencyStoredPayload };
      }
    }
    throw new Error(`The idempotency record for "${key}" kept changing; try again`);
  }

  async complete(
    key: string,
    owner: string,
    response: IdempotencyStoredPayload,
    ttl: number,
  ): Promise<boolean> {
    const now = Date.now();
    const { affected } = await this.dataSource.manager.update(IdempotencyKeyEntity, ownedBy(key, owner, now), {
      owner: null,
      response,
      expiresAt: now + ttl,
    });
    return affected === 1;
  }

  async release(key: string, owner: string): Promise<boolean> {
    const { affected } = await this.dataSource.manager.delete(IdempotencyKeyEntity, ownedBy(key, owner, Date.now()));
    return affected === 1;
  }

  async extend(key: string, owner: string, lockTtl: number): Promise<boolean> {
    const now = Date.now();
    const { affected } = await this.dataSource.manager.update(IdempotencyKeyEntity, ownedBy(key, owner, now), {
      expiresAt: now + lockTtl,
    });
    return affected === 1;
  }

  /**
   * Deletes up to `limit` expired rows, for a scheduled job. Expired rows are
   * already ignored, and reused by the next request with the same key.
   */
  async prune(limit = 1000): Promise<number> {
    const expired = this.dataSource.manager
      .createQueryBuilder(IdempotencyKeyEntity, 'expired')
      .select('expired.keyHash')
      .where('expired.expiresAt <= :now')
      .limit(limit);
    const { affected } = await this.dataSource
      .createQueryBuilder()
      .delete()
      .from(IdempotencyKeyEntity)
      .where(`key_hash IN (${expired.getQuery()})`)
      // Checks the expiry again: a row taken over since the subquery read it stays.
      .andWhere('expires_at <= :now', { now: Date.now() })
      .execute();
    return affected ?? 0;
  }
}

/** The caller's lock, if it still holds it and it hasn't expired. */
function ownedBy(key: string, owner: string, now: number) {
  return { keyHash: hashOf(key), owner, expiresAt: MoreThan(now) };
}

function hashOf(key: string) {
  return createHash('sha256').update(key).digest('hex');
}
```

- **`acquire()`**是相同的 `INSERT ... ON CONFLICT DO UPDATE ... WHERE expires_at <= now`，通过插入查询生成器：`orUpdate()` 列出接管覆盖的列，其 `overwriteCondition` 选项是 `WHERE`，和 `returning()` 仅将一行返回给写入内容的调用者。
- **`complete()`、`extend()` 和 `release()`**是实体管理器上的 `update()` 和 `delete()`，所有者和 `MoreThan(now)` 在其条件中，它们读取 `affected`。从不 `save()`：它首先读取该行，因此收购可能会插入其中。
- **`prune()`**使用 select 查询生成器构建选择过期行的子查询，并将其 SQL 在 `WHERE` 的 `DELETE`，在过期检查旁边。

存储注入 `TypeOrmModule` 提供的 `DataSource`。用数据源的选项代替 `DrizzleModule` 注册模块，用存储代替 `DrizzleIdempotencyStore` 注册模块：

```typescript
import { Module } from '@nestjs/common';
import { IdempotencyModule } from '@nestjs/idempotency';
import { TypeOrmModule } from '@nestjs/typeorm';
import type { User } from '../orders/order.js';
import { OrdersModule } from '../orders/orders.module.js';
import { dataSourceOptions } from './data-source.js';
import { TypeOrmIdempotencyStore } from './typeorm-idempotency.store.js';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      // The entity and migration the CLI uses; migrations run on deploy (`migration:run`).
      useFactory: () => ({ ...dataSourceOptions, url: process.env.DATABASE_URL }),
    }),
    IdempotencyModule.forRoot({
      scope: (req: { user?: User }) => req.user?.id,
    }),
    OrdersModule,
  ],
  // Registers itself with IdempotencyStorage when Nest creates it.
  providers: [TypeOrmIdempotencyStore],
})
export class AppModule {}
```

合同套件在其上运行不变。TypeORM 通过 `pg`，因此该套件需要一个 PostgreSQL 服务器，如果没有 PostgreSQL 服务器，将被跳过。还有一个实例检查实体和迁移是否一致，这就是 `migration:generate --check` 检查：

```typescript
import { IdempotencyStorage } from '@nestjs/idempotency';
import { idempotencyStoreContract } from '@nestjs/idempotency/testing';
import { DataSource } from 'typeorm';
import { startPostgres } from '../../../test-support/postgres.js';
import { dataSourceOptions } from '../src/typeorm/data-source.js';
import { TypeOrmIdempotencyStore } from '../src/typeorm/typeorm-idempotency.store.js';
// ...
const { postgres, reason } = await startPostgres();
afterAll(() => postgres?.stop());

describe.skipIf(!postgres)(`TypeOrmIdempotencyStore on PostgreSQL${postgres ? '' : ` (skipped: ${reason})`}`, () => {
  let dataSource: DataSource;
  let url: string;
  let store: TypeOrmIdempotencyStore;

  beforeAll(async () => {
    url = await postgres!.createDatabase('idempotency_typeorm_store');
    dataSource = await new DataSource({ ...dataSourceOptions, url, poolSize: 16 }).initialize();
    await dataSource.runMigrations(); // npx typeorm migration:run
    store = new TypeOrmIdempotencyStore(dataSource, new IdempotencyStorage());
  });
  afterAll(() => dataSource?.destroy());

  describe('the IdempotencyStore contract', () => {
    // The store reads Date.now(): fake Date alone, so the driver keeps its timers.
    beforeEach(() => vi.useFakeTimers({ toFake: ['Date'] }));
    afterEach(() => vi.useRealTimers());

    // One store and one table for every case: each case uses keys of its own.
    // 32 callers per race, on up to 16 connections.
    const cases = idempotencyStoreContract(() => store, {
      advanceTime: (ms) => vi.setSystemTime(Date.now() + ms),
      concurrent: { callers: 32 },
    });
    for (const c of cases) {
      it(c.name, c.run);
    }
  });

  it('has a migration that matches the entity (what `migration:generate --check` checks)', async () => {
    const { upQueries } = await dataSource.driver.createSchemaBuilder().log();
    expect(upQueries.map((query) => query.query)).toEqual([]);
  });
  // ...
});
```

`startPostgres()` 是一个测试助手，它在 PostgreSQL 服务器上创建一个一次性数据库，或者跳过没有该数据库的套件。该示例还运行两个 TypeORM`AppModule` 在一个数据库上，一个充电，而另一个回答 409。

> info **Hint** 使用 Prisma？[The store contract](/reliability/idempotency#the-store-contract)，在教程之后，展示了 Prisma 如何表达这些语句。用同样的套房检查你的商店。

#### 存储密钥 Redis 反而

如果你的 API 已运行 Redis 它可以将记录保存在那里，而不是 PostgreSQL 中。Redis 非常适合这个商店：记录是一个小哈希 Redis 它会自行过期，因此不需要修剪工作，并且热键（例如客户端每秒钟重试一次付款）会花费一次内存往返，而不是主数据库中的行锁。代价是运行、保护和备份的第二个存储，并且 Redis 必须配置为从不驱逐记录（参见生产清单）。

每个方法都是一个 Lua 脚本，Redis 原子运行：

```typescript
import { Inject, Injectable } from '@nestjs/common';
import {
  IdempotencyStorage,
  type IdempotencyAcquireResult,
  type IdempotencyStore,
  type IdempotencyStoredPayload,
} from '@nestjs/idempotency';
import { REDIS } from '../redis/redis.module.js';

/** The one ioredis method this store needs. */
export interface RedisClient {
  eval(script: string, numKeys: number, ...args: (string | number)[]): Promise<unknown>;
}

// Creates the lock if no record exists. Otherwise returns the record, in the
// same round trip.
const ACQUIRE = `
if redis.call('EXISTS', KEYS[1]) == 0 then
  redis.call('HSET', KEYS[1], 'state', 'in-flight', 'fp', ARGV[1], 'owner', ARGV[2])
  redis.call('PEXPIRE', KEYS[1], ARGV[3])
  return {1}
end
local r = redis.call('HMGET', KEYS[1], 'state', 'fp', 'resp')
return {0, r[1], r[2], r[3]}
`;

// Turns our lock into a completed record, unless another attempt took it over.
const COMPLETE = `
if redis.call('HGET', KEYS[1], 'owner') ~= ARGV[1] then return 0 end
redis.call('HSET', KEYS[1], 'state', 'completed', 'resp', ARGV[2])
redis.call('HDEL', KEYS[1], 'owner')
redis.call('PEXPIRE', KEYS[1], ARGV[3])
return 1
`;

// Deletes the lock, but only if it is still ours.
const RELEASE = `
if redis.call('HGET', KEYS[1], 'owner') == ARGV[1] then
  return redis.call('DEL', KEYS[1])
end
return 0
`;

// Renews our lock while the handler runs, but only if it is still ours.
const EXTEND = `
if redis.call('HGET', KEYS[1], 'owner') ~= ARGV[1] then return 0 end
redis.call('PEXPIRE', KEYS[1], ARGV[2])
return 1
`;

type AcquireReply =
  | [1]
  | [0, 'in-flight' | 'completed', string, string | null];

@Injectable()
export class RedisIdempotencyStore implements IdempotencyStore {
  constructor(
    @Inject(REDIS) private readonly redis: RedisClient,
    storage: IdempotencyStorage,
  ) {
    storage.registerSource(this);
  }

  async acquire(
    key: string,
    owner: string,
    fingerprint: string,
    lockTtl: number,
  ): Promise<IdempotencyAcquireResult> {
    const reply = (await this.redis.eval(
      ACQUIRE, 1, this.key(key), fingerprint, owner, lockTtl,
    )) as AcquireReply;
    if (reply[0] === 1) {
      return { state: 'acquired' };
    }
    const [, state, storedFingerprint, response] = reply;
    return state === 'completed'
      ? { state, fingerprint: storedFingerprint, response: JSON.parse(response!) }
      : { state, fingerprint: storedFingerprint };
  }

  async complete(
    key: string,
    owner: string,
    response: IdempotencyStoredPayload,
    ttl: number,
  ): Promise<boolean> {
    const done = await this.redis.eval(
      COMPLETE, 1, this.key(key), owner, JSON.stringify(response), ttl,
    );
    return done === 1;
  }

  async release(key: string, owner: string): Promise<boolean> {
    const released = await this.redis.eval(RELEASE, 1, this.key(key), owner);
    return released === 1;
  }

  async extend(key: string, owner: string, lockTtl: number): Promise<boolean> {
    const extended = await this.redis.eval(EXTEND, 1, this.key(key), owner, lockTtl);
    return extended === 1;
  }

  private key(key: string) {
    return `idem:${key}`;
  }
}
```

每个记录都是在 `idem:<scope>:<key>`，带有字段 `state`, `fp` （指纹）， `owner` 和 `resp` （存储的响应为 JSON).散列会自行过期： `lockTtl` 在飞行中最后一次更新后，以及在 `ttl` 一旦完成，就不需要清理工作。每个脚本触摸一个键，因此存储也可以使用 Redis 聚集。 Redis 原子地运行脚本，但当后续命令失败时，它不会撤消脚本的写入。 `PEXPIRE` 例如，拒绝几毫秒，并在 `HSET` 它会留下一个永远不会过期的锁。这就是为什么拦截器在毫秒内交出商店。

Nest 注入 Redis 客户端，构造函数注册存储，就像在 PostgreSQL 存储中一样。一个应用程序有一个存储，因此 `RedisIdempotencyStore` 取代了 `AppModule` 中的另一个应用程序：

```typescript
import { Module } from '@nestjs/common';
import { IdempotencyModule } from '@nestjs/idempotency';
import { RedisIdempotencyStore } from './idempotency/redis-idempotency.store.js';
import type { User } from './orders/order.js';
import { OrdersModule } from './orders/orders.module.js';
import { RedisModule } from './redis/redis.module.js';

@Module({
  imports: [
    RedisModule,
    IdempotencyModule.forRoot({
      scope: (req: { user?: User }) => req.user?.id,
    }),
    OrdersModule,
  ],
  providers: [RedisIdempotencyStore],
})
export class AppModule {}
```

`RedisModule` 代表您的应用程序 Redis 模块：一个全局模块，在 `REDIS` 令牌，例如 `useFactory: () => new Redis(process.env.REDIS_URL!)`，并用 `quit()` 在其 `onApplicationShutdown()`，在包在飞行中完成请求之后。`RedisClient` 除了 `eval()`，其中一个 ioredis`Redis` 实例按原样提供。启动时，日志行读取 `IdempotencyStorage: RedisIdempotencyStore`PostgreSQL 存储中的注册表规则适用：一个存储，从构造函数注册。

示例项目也针对此存储运行合同套件：

```typescript
import { idempotencyStoreContract } from '@nestjs/idempotency/testing';
// ...
describe('RedisIdempotencyStore, the IdempotencyStore contract (on FakeRedis)', () => {
  let redis: FakeRedis;
  const cases = idempotencyStoreContract(
    () => {
      redis = new FakeRedis();
      return new RedisIdempotencyStore(redis, new IdempotencyStorage());
    },
    // Redis expires keys on its own clock: the fake's.
    { advanceTime: (ms) => redis.advance(ms), concurrent: true },
  );
  for (const c of cases) {
    it(c.name, c.run);
  }
});
```

> info **Hint** 本教程的示例项目没有 Redis 服务器，因此它的测试针对实现 JavaScript 中相同四个脚本的进程中的伪造运行存储。这涵盖了商店的逻辑和它读取回复的方式，但不包括 Lua 本身。在依赖存储之前，针对真实的 Redis 运行合同套件，例如在容器中。如果没有 `advanceTime`，套件将等待真正的过期，这大约需要十秒钟。

其余步骤显示 `DrizzleIdempotencyStore` 在他们的模块列表中。和 Redis,注册 `RedisIdempotencyStore` 取而代之的是：加密、运输服务和调整选项的工作方式相同，并且在打开加密后，`resp` 字段保存密封信封，而不是 `response` 柱子。

#### 加密存储的收据

存储的响应是整个收据：支付提供者的收据 id、金额和卡的最后四位数字。他们坐在里面 `idempotency_keys` 在纯文本中，在数据库的每个备份和每个转储中，因此在静止时加密记录。

加密密钥是应用程序在启动时应该读取的秘密，而不是在导入 `app.module.ts` 时，所以切换到 `forRootAsync()`。商店保持原样，是注册自己的 `AppModule` 提供者，工厂返回选项：

```typescript
IdempotencyModule.forRootAsync({
  useFactory: () => ({
    scope: (req: { user?: User }) => req.user?.id,
    encryption: {
      // Newest first: seal with the first key, open with any of them.
      keys: process.env.IDEMPOTENCY_KEYS!.split(','),
    },
  }),
}),
```

使用 `openssl rand -base64 32` 生成一个密钥，并将其作为 `IDEMPOTENCY_KEYS` 存储在您的秘密管理器中。启用加密后，`response` 列保存密封信封 `v1.<keyId>.<iv>.<ciphertext>.<tag>`，而不是收据：

- 记录使用 AES-256-GCM，随机 IV 对于每张唱片。
- 指纹保留在纯文本中。商店要对比，反正是哈希。
- 记录密钥与数据一起经过身份验证，因此在另一个用户密钥下复制的记录无法打开，而是在那里重放。
- 启用加密时，纯文本记录将被拒绝，因此对该表具有写访问权限的任何人都不能植入响应。
- 字符串键必须至少有 32 个字符，并且使用 HKDF-SHA256.对于像上面这样的随机秘密来说，这很好，但它不是密码哈希，所以不要使用一个人选择的密码。较短的键，或周围有空格的键（`IDEMPOTENCY_KEYS=new, old` 分裂成以空格开头的第二个键），在启动时停止应用程序，并有一个命名它的错误。

在端点存储第一条记录之前打开加密。它以两种方式改变记录格式：存储在交换机之前的纯文本记录，就像关闭加密后的密封记录一样，在过期之前无法打开，其重播得到下面描述的 500。

要在不中断重放的情况下旋转按键，请执行以下操作：

1. 生成新密钥并部署 `IDEMPOTENCY_KEYS=old-key,new-key`。实例仍然使用旧密钥密封记录，但可以打开使用新密钥密封的记录。
2. 每个实例运行该配置后，部署 `IDEMPOTENCY_KEYS=new-key,old-key`。新记录用新密钥密封，旧记录仍然打开。在滚动部署期间，由于第一步，尚未重新启动的实例已经可以打开新记录。
3. 当 `ttl` 过去时（48 小时，参见 [Tune TTLs and failure handling](/reliability/idempotency#tune-ttls-and-failure-handling)），用旧密钥密封的每条记录都过期了。部署 `IDEMPOTENCY_KEYS=new-key`。

如果过早移除密钥，用它密封的记录的重放将**关闭失败**。客户得到 500`IDEMPOTENCY_RECORD_UNREADABLE` 错误，故障被记录，处理程序不会再次运行：记录证明卡已经充电，因此运行处理程序可能会对其充电两次。当记录过期时，错误停止。

#### 通过付款 GraphQL

商店的网站通过 GraphQL 突变支付。在 `AppModule` 中注册 `GraphQLModule`：

```typescript
GraphQLModule.forRoot<ApolloDriverConfig>({
  driver: ApolloDriver,
  autoSchemaFile: true,
}),
```

然后将突变添加到订单解析器的查询旁边。在 GraphQL，密钥可以来自 `Idempotency-Key` 标题，如 REST，或者来自一个论点。参数将键放在模式中，代码生成器和审阅者可以看到它。也适合 GraphQL 客户端，通常每个连接而不是每个操作设置一次头。`@Idempotent()` 读取突变的 `idempotencyKey` 当它有一个参数时，否则为头，因此解析器只需声明参数：

```typescript
@Mutation(() => PaymentReceipt)
@Idempotent({ required: true })
payOrder(
  @Args('orderId', { type: () => ID }) orderId: string,
  @Args('input') input: PayOrderDto,
  @Args('idempotencyKey') _idempotencyKey: string,
  @CurrentUser() user: User,
) {
  return this.ordersService.pay(orderId, user, input);
}
```

`PayOrderDto` 班级是 REST 端点用途，具有 `@InputType()` 和 `@Field()` 添加，以及 `PaymentReceipt` 是一个 `@ObjectType()` 收据上的字段。解析器使用相同的 `AuthGuard`，它从 GraphQL 上下文。模块的 `scope` 接收到相同的请求，因此这里也是每个用户的密钥。参数是非空的 `String`,所以 GraphQL 验证已经拒绝没有它的操作：

```graphql
mutation PayOrder($orderId: ID!, $paymentMethod: String!, $key: String!) {
  payOrder(orderId: $orderId, input: { paymentMethod: $paymentMethod }, idempotencyKey: $key) {
    receiptId
    amount
    cardLast4
    paidAt
  }
}
```

使用相同变量的重试返回存储的 `payOrder` 结果，解析器返回的类型相同，因此 `Date` 现场回放作为 `Date`.record 键会附加字段的路径，如中所示 `usr_alice:<key>:payOrder`，因为一个操作可以包含几个突变。每个字段都是单独存储和重放的，别名是路径的一部分，因此重试必须发送相同的文档。

拒绝是该字段上的错误，而不是 HTTP 状况。响应仍然是 200，因为同一操作中的其他字段可能已经成功，并且状态和重试延迟在 `extensions`(`locations` 省略）：

```json
{
  "errors": [
    {
      "message": "A request with this idempotency key is still being processed.",
      "path": ["payOrder"],
      "extensions": {
        "code": "IDEMPOTENCY_KEY_IN_USE",
        "httpStatus": 409,
        "retryAfter": 2
      }
    }
  ],
  "data": null
}
```

出于同样的原因，GraphQL 重播不会设置 `Idempotent-Replayed` 头球。

#### 去重 order.paid 事件

付款后，`OrdersService` 发出 `order.paid` 事件，运输服务安排快递。实际上，事件至少传递一次。超时后重试的发布者或代理（RabbitMQ,Kafka,NATSJetStream）重新传递未确认的消息，可以传递两次相同的事件，客户会收到两个包裹。

事件重复数据删除需要一个对事件的每次传递都相同的 id，因此它是从数据中派生的，而不是在每次发送时生成的。订单支付一次，所以 `OrdersService` 使用 `order-paid:` 后面是订单 id。标记 [事件处理程序](/microservices/basics#event-based) 和 `@Idempotent()`，和点 `keyFrom` 在 id 处：

```typescript
import { Controller } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { Idempotent } from '@nestjs/idempotency';
import { ShipmentsService } from './shipments.service.js';

export interface OrderPaidEvent {
  eventId: string;
  orderId: string;
}

@Controller()
export class ShippingController {
  constructor(private readonly shipmentsService: ShipmentsService) {}

  @EventPattern('order.paid')
  @Idempotent({ required: true, keyFrom: { payload: 'eventId' } })
  async onOrderPaid(@Payload() event: OrderPaidEvent) {
    await this.shipmentsService.createFor(event.orderId);
  }
}
```

默认情况下，微服务处理程序从有效载荷的密钥中读取密钥 `idempotencyKey` 属性，然后从名为 `header` 选择。这里，`keyFrom` 阅读 `eventId` 相反，并且 `required: true` 拒绝没有事件的事件。

运输服务是一个独立的应用程序，有自己的数据库和自己的 `IdempotencyModule`，并且它注册相同的存储类：

```typescript
import { Module } from '@nestjs/common';
import { DrizzleModule } from '@nestjs/drizzle';
import { IdempotencyModule } from '@nestjs/idempotency';
import { drizzle } from 'drizzle-orm/node-postgres';
import { DrizzleIdempotencyStore } from '../idempotency/drizzle-idempotency.store.js';
import { ShipmentsService } from './shipments.service.js';
import { ShippingController } from './shipping.controller.js';

@Module({
  imports: [
    DrizzleModule.forRootAsync({
      useFactory: () => ({ drizzle, connection: process.env.DATABASE_URL! }),
    }),
    IdempotencyModule.forRoot({
      ttl: '7d', // brokers can redeliver long after the first delivery
    }),
  ],
  controllers: [ShippingController],
  providers: [ShipmentsService, DrizzleIdempotencyStore],
})
export class ShippingModule {}
```

```typescript
import { NestFactory } from '@nestjs/core';
import { Transport, type MicroserviceOptions } from '@nestjs/microservices';
import { ShippingModule } from './shipping.module.js';

async function bootstrap() {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(ShippingModule, {
    transport: Transport.TCP,
    options: { host: '0.0.0.0', port: 4001 },
  });
  await app.listen();
}
bootstrap();
```

一些细节与 API 不同：

- 没有 `scope`，因为事件 ID 在整个系统中是唯一的。
- `ttl` 是 7 天，因为消息可能会在第一次处理后很久才从死信队列中返回。
- 记录属于处理程序：记录键以处理程序的类和方法结尾，如 `order-paid%3Aord_1001:ShippingController.onOrderPaid` 所示。Nest 运行为事件注册的每个处理程序，因此 `order.paid` 的第二个处理程序，即通过电子邮件发送跟踪号码的处理程序，保留自己的记录，并且仍然处理每个事件一次。

以以下两种方式之一处理重复事件：

- 如果第一次交付已经完成，则会跳过重复。存储的结果被“重放”，由于事件没有回复，所以什么也不会发生。
- 如果第一个传递仍在运行，则重复的传递将被拒绝 `IDEMPOTENCY_KEY_IN_USE`，和 Nest 记录错误。具有确认消息的传输，例如 RabbitMQ 或者 Kafka，不确认交付已处理。让运输机稍后再送，等它被跳过了。

不管怎样，快递都订了一次。HTTP 支付的重试首先不会产生重复事件，因为重播的请求永远不会到达 `OrdersService`。

#### 调整 TTL 和故障处理

默认值是一个起点。这是 API 的最终配置：

```typescript
IdempotencyModule.forRootAsync({
  useFactory: () => ({
    scope: (req: { user?: User }) => req.user?.id,
    encryption: {
      // Newest first: seal with the first key, open with any of them.
      keys: process.env.IDEMPOTENCY_KEYS!.split(','),
    },
    // Longer than the app keeps retrying a queued payment (24 hours).
    ttl: '48h',
    // A crashed instance blocks a key for at most 45 seconds. While a
    // charge runs, its lock is renewed every 15 seconds.
    lockTtl: '45s',
    // How long a client waits after a 409 before it asks again.
    retryAfter: '2s',
  }),
}),
```

每个持续时间以毫秒为单位，或字符串，如 `'45s'`、`'48h'` 或 `'7d'`。不解析的值会在启动时停止应用程序，并出现命名选项的错误。

- **`ttl`**（默认值：`'24h'`) 是完成的结果可以重放多长时间。它必须比客户不断重试的最长时间长。该应用程序将离线支付排队长达一天，所以这里是 48 小时。之后 `ttl` 时，密钥被遗忘，重试将再次运行处理程序。在这个应用程序中，最终会出现 409“已支付”错误，而不是第二次收费，但客户没有收到收据。
- **`lockTtl`**（默认值：`'60s'`) 是运行处理程序的实例崩溃后，飞行中锁的存活时间。处理程序运行时，拦截器每次都会更新锁 `lockTtl / 3` 这里每 15 秒一次，所以充电时间超过 45 秒仍然可以保留它，重试得到 409。一旦更新停止，锁将过期，重试将接管密钥。更短的 `lockTtl` 崩溃后更快释放密钥，但更频繁地更新。如果无法联系到存储来更新锁，拦截器会记录锁丢失的警告。
- **`retryAfter`**（默认值：`'1s'`）是 `Retry-After`409 上的标题，整数秒钟。卡充值通常需要一两秒钟，所以 API 要求客户等待 2 秒钟，而不是在一秒钟后回来查看。

`@Idempotent()` 接受 `required`, `ttl`, `lockTtl`, `retryAfter`, `keyFrom`, `scope`, `fingerprint` 和 `storeIf`，它覆盖该处理程序的模块选项。 `fingerprint` 选择重试必须重复的内容，例如没有客户端时间戳的主体；该方法和 URL 永远算数。装饰器还适用于控制器或解析器类，其中它涵盖了更改状态的处理程序： GET 路线和 GraphQL 除非查询有自己的查询，否则会跳过 `@Idempotent()`.处理程序自己的 `@Idempotent()` 与类的选项合并，因此类级别 `required: true` 仍然适用于仅设置的处理程序 `lockTtl`.

一个 `scope` 函数为每种类型的处理程序运行，它接收的内容取决于处理程序：HTTP 和 GraphQL，而是微服务处理程序的消息有效载荷。在一个同时提供服务的应用程序中 `IdempotencyModule`, 通过 `scope` 对象，每个上下文都有一个函数 `http`,`graphql` 和 `rpc` 钥匙。每个函数都是根据其上下文传入的内容键入的，没有上下文的上下文不被作用域。

不是每个结果都被存储。默认情况下，任何低于 500 的值都是：

| 结果 | 默认的 | 为什么 |
| --------------------------------------------------------------------------- | ----------------------------------------------------------- | ---------------------------------------------------------- |
| 2xx | 存储和重放 | 付款成功 |
| 4xx`HttpException`（验证 400，拒绝 402，404，409 已支付） | 存储，并在每次重播时再次抛出 | 它是确定性的：相同的请求得到相同的答案 |
| 4xx 的另一个错误 `status`(`AuthorizationError`,403) | 存储为 Nest 状态异常，并重放 | 它的包把它变成了那种状态 |
| 5xx 或未知错误（支付提供者 503，数据库关闭） | 未存储。密钥被释放，因此再次运行重试 | 大多数故障发生在副作用发生之前 |
| `StreamableFile`，流，`@Res()` 没有 `passthrough` | 未存储。释放密钥，并记录警告 | 不能重播 |

重放错误被重建为普通错误 `HttpException` 与存储的状态和正文，它再次通过您的异常过滤器。筛选器 `instanceof` 反对自定义异常类在重播中看到基类。

这个 `storeIf` 选项更改规则。它接收状态，当处理程序抛出时，接收错误。例如，`storeIf: () => true` 和 Stripe 一样，也存储 5xx 错误。这对于默认值留下的一个空白很重要：在**副作用之后**发生的 5xx。如果支付提供者向卡收费，然后 `markPaid()` 失败，密钥被释放，重试再次收费。有三种方法可以缩小差距：

- 将从用户的 id 和幂等密钥导出的密钥传递给支付提供者。大多数支付提供者都接受自己的幂等密钥，因此提供者也会删除费用。只有幂等密钥是不够的，因为两个用户可以发送同一个密钥。
- 使用 `storeIf` 存储此处理程序的 5xx 错误，并让应用程序在 5xx 后开始新的尝试。要只存储充电后的故障，请在那里抛出一个专用异常并检查它：`storeIf: (status, error) => status < 500 || error instanceof ChargeCapturedError`。
- 用 [事务性发件箱](/reliability/outbox#prerequisites) 在一个事务中写入付款和事件。

#### 试试

启动运输服务，并 API 和 `DATABASE_URL`（应用迁移），`IDEMPOTENCY_KEYS` 以及支付提供者的沙盒配置。沙盒大约需要半秒钟才能响应。下面的输出被修剪到相关的标题。

没有钥匙的付款被拒绝：

```bash
$ curl -i localhost:3000/orders/ord_1001/pay \
    -H 'Authorization: Bearer alice-token' \
    --json '{"paymentMethod":"pm_card_visa"}'
HTTP/1.1 400 Bad Request

{"statusCode":400,"error":"Bad Request","code":"IDEMPOTENCY_KEY_REQUIRED","message":"An idempotency key is required for this operation."}
```

使用钥匙的第一次呼叫会向卡收费：

```bash
$ KEY=$(uuidgen)
$ curl -i localhost:3000/orders/ord_1001/pay \
    -H 'Authorization: Bearer alice-token' \
    -H "Idempotency-Key: $KEY" \
    --json '{"paymentMethod":"pm_card_visa"}'
HTTP/1.1 201 Created
Content-Type: application/json; charset=utf-8

{"orderId":"ord_1001","receiptId":"ch_0001","amount":4098,"cardLast4":"4242","paidAt":"2026-09-22T11:09:25.813Z"}
```

使用相同密钥重试将获得相同的收据，直至 `paidAt`，并且支付提供者不被调用：

```bash
$ curl -i localhost:3000/orders/ord_1001/pay \
    -H 'Authorization: Bearer alice-token' \
    -H "Idempotency-Key: $KEY" \
    --json '{"paymentMethod":"pm_card_visa"}'
HTTP/1.1 201 Created
Idempotent-Replayed: true
Content-Type: application/json; charset=utf-8

{"orderId":"ord_1001","receiptId":"ch_0001","amount":4098,"cardLast4":"4242","paidAt":"2026-09-22T11:09:25.813Z"}
```

具有不同卡的相同密钥是客户端错误：

```bash
$ curl -i localhost:3000/orders/ord_1001/pay \
    -H 'Authorization: Bearer alice-token' \
    -H "Idempotency-Key: $KEY" \
    --json '{"paymentMethod":"pm_card_mastercard"}'
HTTP/1.1 422 Unprocessable Entity

{"statusCode":422,"error":"Unprocessable Entity","code":"IDEMPOTENCY_KEY_REUSED","message":"This idempotency key was already used for a different request."}
```

最后，对于另一个订单，同时发送两个带有新密钥的请求。一个充电，另一个得到一个 409`Retry-After: 2` 当支付提供者仍在工作时：

```bash
$ KEY=$(uuidgen)
$ for i in 1 2; do
  curl -s -o /dev/null -w '%{http_code} %header{retry-after}\n' \
    localhost:3000/orders/ord_1002/pay \
    -H 'Authorization: Bearer alice-token' \
    -H "Idempotency-Key: $KEY" \
    --json '{"paymentMethod":"pm_card_visa"}' &
done; wait
409 2
201
```

> info **Hint** `--json` 需要卷曲 7.82 或更高版本，并且 `%header` 在 `-w` 需要卷曲 7.84 或更高。

#### 检测

在端到端测试中，保留应用程序的真实配置，但重写 `DrizzleIdempotencyStore` 提供简单的 `InMemoryIdempotencyStore`.普通实例不注册自己，因此模块返回到其内存存储，并且由于 Nest 从不创造 `DrizzleIdempotencyStore`，没有任何内容查询数据库（节点-postgres 池在第一次查询时连接，因此 `DrizzleModule` 也不打开连接）。加密密钥仍然来自 `IDEMPOTENCY_KEYS`，因此在测试环境中设置它，例如使用 `test.env` 在 `vitest.config.mts`.

以较小的延迟模拟支付提供者，使一起发送的两个请求重叠：

```typescript
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { InMemoryIdempotencyStore } from '@nestjs/idempotency';
import { Test } from '@nestjs/testing';
import { setTimeout } from 'node:timers/promises';
import { EMPTY } from 'rxjs';
import request from 'supertest';
import type { MockInstance } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { DrizzleIdempotencyStore } from '../src/idempotency/drizzle-idempotency.store.js';
import { SHIPPING_SERVICE } from '../src/orders/orders.service.js';
import { PaymentProviderClient } from '../src/payments/payment-provider.client.js';

describe('POST /orders/:id/pay', () => {
  let app: INestApplication;
  let charge: MockInstance<PaymentProviderClient['charge']>;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DrizzleIdempotencyStore)
      .useValue(new InMemoryIdempotencyStore())
      .overrideProvider(SHIPPING_SERVICE)
      .useValue({ emit: () => EMPTY })
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.listen(0, '127.0.0.1');

    charge = vi.spyOn(app.get(PaymentProviderClient), 'charge').mockImplementation(async (input) => {
      await setTimeout(100); // slow enough for duplicates to overlap
      return {
        id: 'ch_test',
        amount: input.amount,
        cardLast4: '4242',
        reference: input.reference,
        createdAt: new Date().toISOString(),
      };
    });
  });

  afterEach(() => app.close());

  const pay = (key: string) =>
    request(app.getHttpServer())
      .post('/orders/ord_1001/pay')
      .set('Authorization', 'Bearer alice-token')
      .set('Idempotency-Key', key)
      .send({ paymentMethod: 'pm_card_visa' });

  it('charges once when the app retries', async () => {
    const first = await pay('key-1').expect(201);
    const retry = await pay('key-1').expect(201).expect('Idempotent-Replayed', 'true');

    expect(retry.body).toEqual(first.body);
    expect(charge).toHaveBeenCalledTimes(1);
  });

  it('rejects a duplicate that arrives while the first is in flight', async () => {
    const [a, b] = await Promise.all([pay('key-2'), pay('key-2')]);

    expect([a.status, b.status].sort()).toEqual([201, 409]);
    expect(charge).toHaveBeenCalledTimes(1);
  });
});
```

应用程序初始化后，`app.get(IdempotencyStorage).source` 返回正在使用的存储，这里是内存中的存储。它的 `peek(key)` 方法返回记录键下的原始记录，例如 `usr_alice:key-1`(`state`,`fingerprint` 和 `response`)，对于诸如“拒绝的付款被存储”之类的断言。使用合同套件单独测试您自己的商店 [Store keys in PostgreSQL](/reliability/idempotency#store-keys-in-postgresql) 对抗真实的服务器。为了保持 Drizzle 相反，存储在端到端测试中，替换数据库 `DrizzleModule` 注册，与 `overrideProvider(getDrizzleToken()).useValue(db)`(`getDrizzleToken` 来自 `@nestjs/drizzle`），其中 `db` 是一个 DrizzlePGlite 上的数据库随着您的迁移而迁移。示例项目测试加密，GraphQL，事件和调谐。

看 [End-to-end testing](/fundamentals/testing#end-to-end-testing) 有关测试设置的更多信息。

#### 生产检查表

- 注册共享存储（您的数据库，或 Redis)，即使对于单个实例：内存中的记录在每次重新启动或部署时都会丢失，并且在一次重试后会再次运行处理程序。针对它运行合同套件 `concurrent` 在。在生产中，应用程序拒绝在没有它的情况下启动，除非 `allowInMemoryStorage` 已经设置好了。和 Redis,配置 `maxmemory-policy noeviction`.提前驱逐的记录是等待发生的双重电荷，并且由于每个幂等记录都有一个 TTL，这个 `volatile-*` 政策也会驱逐他们。
- 设置 `required: true` 在每个转移资金或创造客户会注意到两次的东西的端点上。
- 设置 `scope` 对于每个面向客户端的端点。没有它，一个用户的密钥可以重放另一个用户的响应。当登录用户调用没有警告的处理程序时，该模块会记录一个警告。
- 保持幂等拦截器在其他全局拦截器之外。全局拦截器按照注册的顺序运行，并且 `APP_INTERCEPTOR` 供应商 `AppModule` 在它导入的模块之前注册，这样它们就可以在它外部运行，并查看每次重播。该模块在启动时会发出警告。当其中一个 `ClassSerializerInterceptor`，因为重放会给它一个普通对象，并发送以下字段 `@Exclude()` 隐藏。注册此类拦截器 `app.useGlobalInterceptors()` 在 `main.ts`，或在之后导入的模块中 `IdempotencyModule`.
- 使用数据库存储，通过迁移创建其表，调整其语句的连接池大小，使实例的时钟保持同步，并调用 `prune()` 按计划进行。
- 保持 `ttl` 在客户端的重试窗口上方。`lockTtl` 只需要覆盖崩溃，因为在处理程序运行时锁会被更新。
- 观看事件。`IdempotencyEvents` 是可注射的，其 `events$` 流报告每一次重放，每一次拒绝 `code` 还有每一把丢失的锁。相同的事件发布在 `nestjs:idempotency:replayed`,`nestjs:idempotency:rejected` 和 `nestjs:idempotency:lock-lost` 跟踪工具的诊断通道。警戒 `lock-lost`：这意味着尝试的结果不在存储中，因为续订失败（存储无法访问，或者事件循环被阻塞的时间超过 `lockTtl`) 或者因为写入结果时存储失败，重试可能会再次运行处理程序。
- 打开 `encryption` 当响应包含个人或支付数据时，在端点存储其第一条记录之前。将密钥保存在一个秘密管理器中，在上述三个步骤中旋转它们，并且在此之前永远不要移除密钥 `ttl` 已经过去了。
- 将从用户的 id 和幂等密钥导出的密钥传递给支付提供者，以覆盖收费后的故障。
- 当多个服务共享一个服务时 Redis，给每个密钥前缀（`idem:` 在商店中）或其自己的数据库中。记录键只在一个服务中是唯一的：两个服务可以各自有一个同名的处理程序类，客户端可以向两个服务发送一个键。
- 在服务中保留状态检查，最好是作为有条件的数据库更新。幂等键会删除一次尝试的重复，但创建两个键的两次点击是两次尝试。
- 让浏览器发送标题。对于跨源客户端，将 `Idempotency-Key` 添加到 CORS`allowedHeaders`，将 `Idempotent-Replayed` 和 `Retry-After` 添加到 `exposedHeaders`。
- 保持幂等响应较小。整个响应体被存储，并且包还没有大小限制。

#### 商店合同

教程用 Drizzle、TypeORM 和 Redis 编写了存储。本节总结了任何 `IdempotencyStore` 必须做的事情，用另一个 ORM 编写一个。包 README 的“实现存储”详细介绍了每种方法。

**注册。**该商店是一家普通的单身供应商，致电 `registerSource(this)` 关于注射剂 `IdempotencyStorage` 在它的构造函数中。注册表会立即检查形状，除非通过，否则拒绝第二次注册 `replace: true`，并在 `IdempotencyModule` 初始化，记录正在使用的存储。在没有注册任何内容的情况下，该模块使用 `InMemoryIdempotencyStore`，其中一个实例不能与另一个实例共享，并且在重新启动时丢失其记录。和 `NODE_ENV=production`，启动失败，除非您设置 `allowInMemoryStorage: true`，它接受在每次重新启动或部署时丢失记录。

**方法。**所有四种方法都是原子的：每个方法决定谁持有密钥，读取后单独写入让两个请求都运行处理程序，这是包存在的双重收费。没有人接受您的交易：幂等记录是单独编写的，绝不会作为您业务交易的一部分。

| 方法 | 它的作用 | 它如何保持原子状态 |
| --- | --- | --- |
| `acquire(key, owner, fingerprint, lockTtl)` | 锁定空闲或过期的密钥，或返回找到的记录 | 一个插入接管同一语句中过期的行，因此在许多并发调用者中，只有一个获胜；其他人读了获胜者的记录 |
| `complete(key, owner, response, ttl)` | 将所有者的实时锁转换为完整记录 | 比较设置：所有者和到期检查在 `WHERE` 声明中写道 |
| `release(key, owner)` | 删除所有者的活动锁，以便重试可以运行处理程序 | 比较集，如 `complete()` |
| `extend(key, owner, lockTtl)` | 更新所有者的活动锁 | 比较集，如 `complete()` |

**与 Prisma.** 这 Drizzle 和 TypeORM 商店是模型，有相同的表：

- **`acquire()`**是一个 `INSERT ... ON CONFLICT (key_hash) DO UPDATE ... WHERE expires_at <= now RETURNING`。Prisma 的 `upsert()` 对更新没有条件，因此使用 `$queryRaw`。当没有行返回时，像其他存储一样读取记录。
- **`complete()`, `release()` 和 `extend()`**将所有者和到期日放入 `WHERE` 并计算行数： `updateMany()` 或者 `deleteMany()` 和 `keyHash`, `owner` 和一个 `gt: now` 过滤器开启 `expiresAt` 在 `where`，和 `count === 1`.不 `update()` 之后 `findUnique()`：它先读。
- **响应栏**是 `json` 而不是 `jsonb`，在任何 ORM:`jsonb` 拒绝 a`\u0000` 字符串内部，响应体可以包含一个。

**使用套件进行测试**`@nestjs/idempotency/testing`，作为 Drizzle,TypeORM 和 Redis 商店有。`idempotencyStoreContract()` 返回任何测试运行程序的案例。`concurrent: true` 每个密钥竞争 16 个呼叫者；针对带有连接池的 PostgreSQL 运行它，其中调用实际上是重叠的。`advanceTime` 为过期案例移动商店的时钟，没有时钟，他们会实时等待。

#### 参考

##### 模块选项

`IdempotencyModule.forRoot()` 采取这些选项。`forRootAsync()` 采取 `isGlobal` 和 `imports` 在顶层，旁边 `useFactory`,`useClass` 或者 `useExisting`，工厂返回其余部分。除了 `header`,`replayHeaders`,`encryption`,`allowInMemoryStorage` 和 `isGlobal` 也可以在中按类或处理程序设置 `@Idempotent()`，其中它在模块上逐字段合并。

| 选择 | 类型 | 默认的 | 描述 |
| --- | --- | --- | --- |
| `required` | `boolean` | `false` | 使用 `IDEMPOTENCY_KEY_REQUIRED` 拒绝没有密钥的呼叫。参见 [Make the payment endpoint idempotent](/reliability/idempotency#make-the-payment-endpoint-idempotent)。 |
| `scope` | 功能、对象或 `false` | 没有一个 | 密钥命名空间，如用户 id。对象在 `http`、`graphql` 和 `rpc` 下的每个上下文有一个函数。`false` 故意共享一个命名空间。 |
| `ttl` | `Duration` | `'24h'` | 完成的结果重放多长时间。参见 [Tune TTLs and failure handling](/reliability/idempotency#tune-ttls-and-failure-handling)。 |
| `lockTtl` | `Duration` | `'60s'` | 续订停止后，飞行中锁能持续多长时间。锁每 `lockTtl / 3` 更新一次。 |
| `retryAfter` | `Duration` | `'1s'` | 等待 `IDEMPOTENCY_KEY_IN_USE`，在整数秒内，四舍五入。 |
| `keyFrom` | 源，或每个上下文一个源 | 见下文 | 其中密钥来自：`header`、`arg`（GraphQL）、`payload`（微服务）或 `ExecutionContext` 的函数。 |
| `fingerprint` | `(payload, context) => unknown` | 整个有效载荷 | 重试必须重复什么。该方法和 URL,GraphQL 字段或消息模式，作用域始终很重要。 |
| `storeIf` | `(status, error) => boolean` | `status < 500` | 存储和重放哪些结果。其他人释放钥匙。 |
| `header` | `string` | `'Idempotency-Key'` | 这个 HTTP 标题，也读作 GraphQL，以及微服务的传输头名称。 |
| `replayHeaders` | `string[]` | 没有一个 | 除了 `Location`、`Content-Type`、`Content-Language`、`Content-Location`、`ETag` 和 `Last-Modified` 之外，还播放了响应头。`Set-Cookie` 和平台为每个响应编写的标头在启动时被拒绝。 |
| `encryption` | 具有 `keys` | 离开 | AES-256-GCM 存储记录的加密。`keys` 列出 32 字节的 `Buffer` 或至少 32 个字符的字符串，以最新字符为准。参见 [Encrypt stored receipts](/reliability/idempotency#encrypt-stored-receipts)。 |
| `allowInMemoryStorage` | `boolean` | `false` | 让生产应用程序在没有注册存储的情况下启动。 |
| `isGlobal` | `boolean` | `true` | 全局注册模块。 |

每个持续时间需要毫秒或字符串，如 `'45s'`、`'48h'` 或 `'7d'`。

默认情况下，密钥来自以下来源：

| 上下文 | 默认源 |
| --- | --- |
| HTTP | 这个 `Idempotency-Key` 标题（`header` 选项） |
| GraphQL | 突变的 `idempotencyKey` 参数，然后是标题 |
| 微服务 | 有效载荷的 `idempotencyKey` 属性，然后传输头命名为 `header` |

密钥是 1 到 255 可打印 ASCII 人物。有效载荷中的数字算作它的位数。

##### 事件

`IdempotencyEvents.events$` 输出每个事件，并且每个事件也发布在诊断通道上。每个有效载荷都有 `type`、`context`（`'http'`、`'graphql'` 或 `'rpc'`）、`handler`（如 `OrdersController.pay`）、`key`，如果有的话，`scope`。

| 类型 | 渠道 | 有效载荷类型 | 其他领域 | 何时 |
| --- | --- | --- | --- | --- |
| `replayed` | `nestjs:idempotency:replayed` | `IdempotencyReplayedEvent` | `status` | 重试获得存储的结果，或者跳过了重复的事件 |
| `rejected` | `nestjs:idempotency:rejected` | `IdempotencyRejectedEvent` | `code`,`status` | 调用在其处理程序运行之前被拒绝。`IDEMPOTENCY_KEY_REQUIRED` 和 `IDEMPOTENCY_KEY_INVALID` 没有 `key`。 |
| `lock-lost` | `nestjs:idempotency:lock-lost` | `IdempotencyLockLostEvent` | `phase`（`'extend'`、`'complete'` 或 `'release'`） | 尝试的结果不在存储中，因此重试可能会再次运行处理程序 |

`IdempotencyEvent` 是三种有效载荷类型的结合。

##### 错误

拒绝携带这些代码之一，键入为 `IdempotencyErrorCode`.完毕 HTTP，代码在响应体中。在 GraphQL 它在字段错误中 `extensions`，与 `httpStatus` 并且，对于 409， `retryAfter`.关于微服务， `RpcException` 有效载荷有 `status`, `code`, `statusCode`, `message` 并且，对于 409， `retryAfter`.

| 代码 | 状况 | 消息 | 原因 |
| --- | --- | --- | --- |
| `IDEMPOTENCY_KEY_REQUIRED` | 400 | 此操作需要幂等键。 | 没有钥匙，用 `required: true` |
| `IDEMPOTENCY_KEY_INVALID` | 400 | 幂等密钥必须为 1 到 255 可打印 ASCII 人物。 | 太长、有其他字符或不是字符串或数字的键 |
| `IDEMPOTENCY_KEY_IN_USE` | 409，与 `Retry-After` | 使用此幂等密钥的请求仍在处理中。 | 使用密钥的第一个调用仍在运行 |
| `IDEMPOTENCY_KEY_REUSED` | 422 | 这个幂等密钥已经用于不同的请求。 | 相同的钥匙，不同的指纹 |
| `IDEMPOTENCY_RECORD_UNREADABLE` | 500 | 无法读取此幂等密钥的存储结果。 | 存储的记录无法解密，例如，因为其密钥已被删除 |
