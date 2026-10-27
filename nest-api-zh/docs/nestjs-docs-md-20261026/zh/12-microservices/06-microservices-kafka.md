# Kafka

Source: https://docs.nestjs.com/microservices/kafka

[Kafka](https://kafka.apache.org/) 是一个开源、分布式流媒体平台，具有三个关键功能：

- 发布和订阅记录流，类似于消息队列或企业消息传递系统。
- 以容错持久的方式存储记录流。
- 在记录流发生时处理它们。

这个 Kafka 项目旨在提供一个统一的、高吞吐量、低延迟的平台来处理实时数据馈送。它与 Apache Storm 和 Spark 集成，用于实时流数据分析。

#### 安装

开始建造 Kafka-基于微服务，首先安装所需的包：

```bash
$ npm i --save kafkajs
```

#### 概述

和其他 Nest 微服务传输层实现，您可以选择 Kafka 使用 `transport`options 对象的属性传递给 `createMicroservice()` 方法，以及可选的 `options` 属性，如下所示：

```typescript
const app = await NestFactory.createMicroservice<MicroserviceOptions>(AppModule, {
  transport: Transport.KAFKA,
  options: {
    client: {
      brokers: ['localhost:9092'],
    }
  }
});
```

> info **Hint** 这个 `Transport` 枚举是从 `@nestjs/microservices` 包装。

#### 选项

这个 `options` 属性特定于所选传输程序。<strong>Kafka</strong> transporter 显示以下属性。

<table>
  <tr>
    <td><code>client</code></td>
    <td>Client configuration options (see the
      <a
        href="https://kafka.js.org/docs/configuration"
        rel="nofollow"
        target="_blank"
        >KafkaJS client configuration</a
      >)</td>
  </tr>
  <tr>
    <td><code>consumer</code></td>
    <td>Consumer configuration options (see the
      <a
        href="https://kafka.js.org/docs/consuming#a-name-options-a-options"
        rel="nofollow"
        target="_blank"
        >KafkaJS consumer options</a
      >)</td>
  </tr>
  <tr>
    <td><code>run</code></td>
    <td>Options passed to the consumer's <code>run()</code> method (see
      <a
        href="https://kafka.js.org/docs/consuming"
        rel="nofollow"
        target="_blank"
        >KafkaJS consuming messages</a
      >)</td>
  </tr>
  <tr>
    <td><code>subscribe</code></td>
    <td>Options passed to the consumer's <code>subscribe()</code> method, except <code>topics</code>, which Nest derives from the registered patterns (see
      <a
        href="https://kafka.js.org/docs/consuming#frombeginning"
        rel="nofollow"
        target="_blank"
        >KafkaJS fromBeginning</a
      >)</td>
  </tr>
  <tr>
    <td><code>producer</code></td>
    <td>Producer configuration options (see the
      <a
        href="https://kafka.js.org/docs/producing#options"
        rel="nofollow"
        target="_blank"
        >KafkaJS producer options</a
      >)</td>
  </tr>
  <tr>
    <td><code>send</code></td>
    <td>Options passed to the producer's <code>send()</code> method, except <code>topic</code> and <code>messages</code> (see the
      <a
        href="https://kafka.js.org/docs/producing#options"
        rel="nofollow"
        target="_blank"
        >KafkaJS producing messages</a
      >)</td>
  </tr>
  <tr>
    <td><code>parser</code></td>
    <td>Options of the parser that decodes incoming messages: <code>keepBinary</code> passes message values to handlers as buffers instead of decoding them (<code>boolean</code>), and <code>maxMessageSize</code> is the size in bytes, after decompression, above which a message is skipped instead of decoded. Defaults to <code>16777216</code> (16 MiB) (<code>number</code>)</td>
  </tr>
  <tr>
    <td><code>producerOnlyMode</code></td>
    <td>Client only. Skips consumer group registration so the client acts only as a producer (<code>boolean</code>)</td>
  </tr>
  <tr>
    <td><code>postfixId</code></td>
    <td>Suffix appended to the <code>clientId</code> and <code>groupId</code> values. Defaults to <code>'-server'</code> on the server and <code>'-client'</code> on the client (<code>string</code>)</td>
  </tr>
</table>

#### 客户

Kafka 与其他微服务传输器略有不同：您使用 `ClientKafkaProxy` 而不是 `ClientProxy` 类型。

与其他微服务传输程序一样，您可以 [几种选择](/microservices/basics#client-producer-class) 创建一个 `ClientKafkaProxy` 实例。

一种选择是 `ClientsModule`.导入并使用它 `register()` 方法来传递具有与上面所示的相同属性的 options 对象 `createMicroservice()` 方法，加上 `name` 用作注入令牌的属性。参见 [微服务概述的客户端部分](/microservices/basics#client-producer-class) 了解更多 `ClientsModule`.

```typescript
@Module({
  imports: [
    ClientsModule.register([
      {
        name: 'HERO_SERVICE',
        transport: Transport.KAFKA,
        options: {
          client: {
            clientId: 'hero',
            brokers: ['localhost:9092'],
          },
          consumer: {
            groupId: 'hero-consumer'
          }
        }
      },
    ]),
  ]
  ...
})
```

您还可以使用 `ClientProxyFactory` 或 `@Client()` 装饰器创建客户端，两者都在 [微服务概述](/microservices/basics#client-producer-class) 中描述。

使用 `@Client()` 装饰器如下：

```typescript
@Client({
  transport: Transport.KAFKA,
  options: {
    client: {
      clientId: 'hero',
      brokers: ['localhost:9092'],
    },
    consumer: {
      groupId: 'hero-consumer'
    }
  }
})
client: ClientKafkaProxy;
```

#### 消息模式

这个 Kafka 微服务消息模式为请求和回复通道使用两个主题。这个 `ClientKafkaProxy.send()` 方法发送消息 [返回地址](https://www.enterpriseintegrationpatterns.com/patterns/messaging/ReturnAddress.html) 通过关联一个 [相关性 id](https://www.enterpriseintegrationpatterns.com/patterns/messaging/CorrelationIdentifier.html)，回复主题，并使用请求消息回复分区。这需要 `ClientKafkaProxy` 在发送消息之前，要订阅回复主题并分配给至少一个分区的实例。

因此，每次运行至少需要一个回复主题分区 Nest 应用。例如，如果运行 4Nest 应用程序，但回复主题只有 3 个分区，其中 1 个 Nest 当应用程序试图发送消息时，它将失败。

新的时候 `ClientKafkaProxy` 实例启动后，他们加入消费者组并订阅各自的主题。这将触发分配给组中消费者的主题分区的重新平衡。

通常，使用循环分配器分配主题分区，循环分配器将主题分区分配给按应用程序启动时随机设置的消费者名称排序的消费者集合。然而，当一个新的消费者加入消费者组时，它可以被定位在该集合中的任何位置。位于新消费者之后的预先存在的消费者然后可以被分配不同的分区，并且那些消费者丢失在再平衡之前发送的请求的响应消息。

防止 `ClientKafkaProxy` 防止消费者丢失响应消息，Nest 使用内置的自定义分区分配器。在重新平衡期间，它允许每个现有消费者保留其先前分配的回复分区，并将剩余分区分配给其他消费者。

#### 正则表达式模式

KafkaJS 支持通过正则表达式订阅主题。从 NestJSv12 开始，您可以将 `RegExp` 直接传递给 `@MessagePattern()` 或 `@EventPattern()`。Nest 保留模式，将其转发到 KafkaJS`subscribe()` 调用，并在解析传入主题的处理程序时返回到正则表达式匹配。

```typescript
@EventPattern(/^hero\..+$/)
handleHeroEvents(@Payload() data: any, @Ctx() context: KafkaContext) {
  console.log(`Topic: ${context.getTopic()}`);
}
```

这会将处理程序订阅与表达式匹配的每个主题（`hero.kill.dragon`,`hero.rescue.villager` 等等）而无需显式注册每个。使用 `context.getTopic()` 找出哪个主题传递了信息。

> info **Hint** 正则表达式模式是 Kafka-特定能力；其他转运蛋白继续通过精确值匹配模式。Nest 重置 `lastIndex` 在匹配之前，所以全局（`/g`）和粘性（`/y`) 表达式不会产生有状态的未命中。

#### 消息响应订阅

> warning **Note** 仅当您使用 [request-response](/microservices/basics#request-response) 消息样式（`@MessagePattern()` 装饰和 `ClientKafkaProxy.send()` 方法）。无需订阅响应主题 [event-based](/microservices/basics#event-based) 沟通（`@EventPattern()` 装饰和 `ClientKafkaProxy.emit()` 方法）。

`ClientKafkaProxy` 提供 `subscribeToResponseOf()` 方法，该方法将请求的主题名称作为参数，并将派生的回复主题名称添加到回复主题集合中。实现消息模式时需要此方法。

```typescript
onModuleInit() {
  this.client.subscribeToResponseOf('hero.kill.dragon');
}
```

如果 `ClientKafkaProxy` 实例是异步创建的，调用 `subscribeToResponseOf()` 方法在调用 `connect()` 方法。

```typescript
async onModuleInit() {
  this.client.subscribeToResponseOf('hero.kill.dragon');
  await this.client.connect();
}
```

#### 传入

Nest 接收传入 Kafka 消息作为对象 `key`, `value`，和 `headers` 其值为类型的属性 `Buffer`. Nest 通过将缓冲区转换为字符串来解析这些值。如果字符串是“类对象”的（即，它以大括号或方括号开头）， Nest 尝试将其解析为 JSON，除了 `kafka_correlationId`, `kafka_replyTopic` 和 `kafka_replyPartition` 它路由回复的头，这些头总是以字符串的形式保存。这个 `value` 然后传递给关联的处理程序。

Nest 不对解压缩后大于 16 MiB 的消息进行解码，计算其密钥、报头，除非 `parser.keepBinary` 设置，其值。它记录并跳过消息，以便提交其偏移量，并且 `ClientKafkaProxy` 此类回复应答的请求失败。要更改限制，请设置 `parser.maxMessageSize` 选择。

#### 外向的

Nest 序列化输出 Kafka 发布事件或发送消息之前的消息。序列化应用于传递给 `ClientKafkaProxy``emit()` 和 `send()` 方法，以及从 `@MessagePattern()` 方法。它通过使用 `JSON.stringify()` 或者 `toString()` 原型方法。

```typescript
@Controller()
export class HeroesController {
  @MessagePattern('hero.kill.dragon')
  killDragon(@Payload() message: KillDragonMessage): any {
    const dragonId = message.dragonId;
    const items = [
      { id: 1, name: 'Mythical Sword' },
      { id: 2, name: 'Key to Dungeon' },
    ];
    return items;
  }
}
```

> info **Hint** `@Payload()` 是从 `@nestjs/microservices` 包装。

您还可以通过传递具有 `key` 和 `value` 属性的对象来密钥传出消息。键入消息对于满足 [共分区要求](https://docs.confluent.io/current/ksql/docs/developer-guide/partition-data.html#co-partitioning-requirements) 非常重要。

```typescript
@Controller()
export class HeroesController {
  @MessagePattern('hero.kill.dragon')
  killDragon(@Payload() message: KillDragonMessage): any {
    const realm = 'Nest';
    const heroId = message.heroId;
    const dragonId = message.dragonId;

    const items = [
      { id: 1, name: 'Mythical Sword' },
      { id: 2, name: 'Key to Dungeon' },
    ];

    return {
      headers: {
        realm
      },
      key: heroId,
      value: items
    }
  }
}
```

以这种格式传递的消息还可以包含在 `headers` 财产。标头值必须为 `string` 或者 `Buffer`，一条消息最多可以携带 10,000 个，数组值每项计数一次。Nest 不发送包含更多信息的消息：`emit()` 和 `send()` 失败，并且 `@MessagePattern()` 回复被记录并丢弃。

```typescript
@Controller()
export class HeroesController {
  @MessagePattern('hero.kill.dragon')
  killDragon(@Payload() message: KillDragonMessage): any {
    const realm = 'Nest';
    const heroId = message.heroId;
    const dragonId = message.dragonId;

    const items = [
      { id: 1, name: 'Mythical Sword' },
      { id: 2, name: 'Key to Dungeon' },
    ];

    return {
      headers: {
        kafka_nestRealm: realm
      },
      key: heroId,
      value: items
    }
  }
}
```

#### 基于事件的

虽然请求-响应方法非常适合在服务之间交换消息，但如果您的消息样式是基于事件的（这对于 Kafka)，也就是说，当您想要发布事件**而不等待响应**时。在这种情况下，您不需要维护请求响应所需的两个主题的开销。

看 [Overview: Event-based](/microservices/basics#event-based) 和 [Overview: Publishing events](/microservices/basics#publishing-events) 了解更多。

#### 上下文

在更复杂的场景中，您可能需要有关传入请求的附加信息。使用时 Kafka 传送器，您可以访问 `KafkaContext` 物体。

```typescript
@MessagePattern('hero.kill.dragon')
killDragon(@Payload() message: KillDragonMessage, @Ctx() context: KafkaContext) {
  console.log(`Topic: ${context.getTopic()}`);
}
```

> info **Hint** `@Payload()`,`@Ctx()` 和 `KafkaContext` 是从 `@nestjs/microservices` 包装。

访问原始 Kafka`IncomingMessage` 对象，使用 `getMessage()` 方法 `KafkaContext` 对象，如下：

```typescript
@MessagePattern('hero.kill.dragon')
killDragon(@Payload() message: KillDragonMessage, @Ctx() context: KafkaContext) {
  const originalMessage = context.getMessage();
  const partition = context.getPartition();
  const { headers, timestamp } = originalMessage;
}
```

这个 `IncomingMessage` 对象实现以下接口：

```typescript
interface IncomingMessage {
  topic: string;
  partition: number;
  timestamp: string;
  size: number;
  attributes: number;
  offset: string;
  key: any;
  value: any;
  headers: Record<string, any>;
}
```

如果处理程序处理每条消息需要很长时间，请考虑使用 `heartbeat` 回调。检索 `heartbeat` 函数，使用 `getHeartbeat()` 方法 `KafkaContext`，如下：

```typescript
@MessagePattern('hero.kill.dragon')
async killDragon(@Payload() message: KillDragonMessage, @Ctx() context: KafkaContext) {
  const heartbeat = context.getHeartbeat();

  // Do some slow processing
  await doWorkPart1();

  // Send heartbeat to not exceed the sessionTimeout
  await heartbeat();

  // Do some slow processing again
  await doWorkPart2();
}
```

#### 命名惯例

这个 Kafka 微服务组件将其角色的描述附加到 `client.clientId` 和 `consumer.groupId` 防止之间冲突的选项 Nest 微服务客户端和服务器组件。默认情况下，`ClientKafkaProxy` 组件附加 `-client` 和 `ServerKafka` 组件附加 `-server` 两个选项。下面的注释显示了如何转换提供的值。

```typescript
const app = await NestFactory.createMicroservice<MicroserviceOptions>(AppModule, {
  transport: Transport.KAFKA,
  options: {
    client: {
      clientId: 'hero', // hero-server
      brokers: ['localhost:9092'],
    },
    consumer: {
      groupId: 'hero-consumer' // hero-consumer-server
    },
  }
});
```

对于客户：

```typescript
@Client({
  transport: Transport.KAFKA,
  options: {
    client: {
      clientId: 'hero', // hero-client
      brokers: ['localhost:9092'],
    },
    consumer: {
      groupId: 'hero-consumer' // hero-consumer-client
    }
  }
})
client: ClientKafkaProxy;
```

> info **Hint** 若要更改附加后缀，请设置 `postfixId` 选择。若要进一步自定义客户端和使用者命名约定，请扩展 `ClientKafka` 和 `ServerKafka` 类在您自己的自定义提供程序中并覆盖构造函数。

因为 Kafka 微服务消息模式的请求和回复通道使用两个主题，回复模式来源于请求主题。默认情况下，回复主题的名称是请求主题名称 `.reply` 附加。

```typescript
onModuleInit() {
  this.client.subscribeToResponseOf('hero.get'); // hero.get.reply
}
```

> info **Hint** 要自定义回复主题命名约定，请扩展 `ClientKafka` 类在您自己的自定义提供程序中并覆盖 `getResponsePatternName()` 方法。

#### 可追溯例外

与其他传输程序一样，未处理的异常会自动转换为“用户友好”格式。但是，在某些边缘情况下，您可能希望绕过此机制并让 `kafkajs` 相反，驱动程序消耗异常。在处理消息时抛出异常指示 `kafkajs` **重试**它（重新传递它），这意味着即使消息（或事件）处理程序被触发，偏移量也不会提交给 Kafka.

> warning **Warning** 对于事件处理程序（基于事件的通信），默认情况下，所有未处理的异常都被视为**可重试异常**。

对于消息处理程序，请使用专用 `KafkaRetriableException` 类，如下：

```typescript
throw new KafkaRetriableException('...');
```

> info **Hint** 这个 `KafkaRetriableException` 类是从 `@nestjs/microservices` 包装。

> warning **Warning** Nest 仅当消息携带 `kafka_correlationId` 和 `kafka_replyTopic` 标题 `ClientKafkaProxy.send()` 补充。任何其他讯息，例如由制作人编写的讯息 Nest，被视为事件处理，即使它达到 `@MessagePattern()` 处理程序：其未处理的异常是可检索的，并且只有在处理程序返回的流完成后，才会处理分区的下一个消息。对于其他生产者写入的主题，确保消息处理程序返回完成的流，并处理他们无法处理的消息，而不是丢弃，除非这些消息应该重新传递。

#### 自定义异常处理

除了默认错误处理机制外，您还可以为 Kafka 管理重试逻辑的事件。例如，下面的筛选器会在可配置次数的重试后跳过有问题的事件：

```typescript
import { Catch, ArgumentsHost, ExceptionFilter, Logger } from '@nestjs/common';
import { KafkaContext } from '@nestjs/microservices';
import { Producer } from 'kafkajs';

@Catch()
export class KafkaMaxRetryExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(KafkaMaxRetryExceptionFilter.name);

  constructor(
    private readonly producer: Producer,
    private readonly maxRetries: number,
    // Optional custom function executed when max retries are exceeded
    private readonly skipHandler?: (message: any) => Promise<void>,
  ) {}

  async catch(exception: unknown, host: ArgumentsHost) {
    const kafkaContext = host.switchToRpc().getContext<KafkaContext>();
    const message = kafkaContext.getMessage();
    const currentRetryCount = this.getRetryCountFromContext(kafkaContext);

    if (currentRetryCount >= this.maxRetries) {
      this.logger.warn(
        `Max retries (${
          this.maxRetries
        }) exceeded for message: ${JSON.stringify(message)}`,
      );

      if (this.skipHandler) {
        try {
          await this.skipHandler(message);
        } catch (err) {
          this.logger.error('Error in skipHandler:', err);
        }
      }

      try {
        await this.commitOffset(kafkaContext);
      } catch (commitError) {
        this.logger.error('Failed to commit offset:', commitError);
      }
      return; // Stop propagating the exception
    }

    // Republish the message to the same topic with incremented retry count
    try {
      await this.republishWithRetry(kafkaContext, currentRetryCount + 1);
      await this.commitOffset(kafkaContext);
    } catch (republishError) {
      this.logger.error(
        'Failed to republish message for retry:',
        republishError,
      );
      // Rethrow so that KafkaJS retries the message
      throw exception;
    }
  }

  private getRetryCountFromContext(context: KafkaContext): number {
    const headers = context.getMessage().headers || {};
    const retryHeader = headers['retry-count'];
    if (!retryHeader) {
      return 0;
    }
    // Header values are Buffers, so convert to string first
    const value = Buffer.isBuffer(retryHeader)
      ? retryHeader.toString()
      : String(retryHeader);
    return parseInt(value, 10) || 0;
  }

  private async republishWithRetry(
    context: KafkaContext,
    retryCount: number,
  ): Promise<void> {
    const topic = context.getTopic();
    const message = context.getMessage();

    await this.producer.send({
      topic,
      messages: [
        {
          key: message.key,
          value: message.value,
          headers: {
            ...message.headers,
            'retry-count': retryCount.toString(),
          },
        },
      ],
    });
  }

  private async commitOffset(context: KafkaContext): Promise<void> {
    const consumer = context.getConsumer();
    if (!consumer) {
      throw new Error('Consumer instance is not available from KafkaContext.');
    }

    const topic = context.getTopic();
    const partition = context.getPartition();
    const message = context.getMessage();
    const offset = message.offset;

    if (!topic || partition === undefined || offset === undefined) {
      throw new Error(
        'Incomplete Kafka message context for committing offset.',
      );
    }

    await consumer.commitOffsets([
      {
        topic,
        partition,
        // When committing an offset, commit the next number (i.e., current offset + 1)
        offset: (Number(offset) + 1).toString(),
      },
    ]);
  }
}
```

此筛选器重试处理 Kafka 事件最多可配置的次数。当发生异常时，它会将消息重新发布到同一主题，并增加 `retry-count` 头，然后提交当前偏移量。一旦达到最大重试次数，它就会调用自定义 `skipHandler`（如果提供）并提交偏移量，跳过有问题的事件。这允许不间断地处理后续事件。

您可以全局注册此筛选器，也可以在控制器级别注册。它需要一个 Kafka 生产者实例：

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { Producer } from 'kafkajs';

@Injectable()
export class AppKafkaRetryFilter extends KafkaMaxRetryExceptionFilter {
  constructor(@Inject('KAFKA_PRODUCER') producer: Producer) {
    super(producer, 5); // maxRetries = 5
  }
}
```

```typescript
@Controller()
@UseFilters(AppKafkaRetryFilter)
export class MyEventHandler {
  @EventPattern('your-topic')
  async handleEvent(@Payload() data: any, @Ctx() context: KafkaContext) {
    // Your event processing logic...
  }
}
```

确保提供 Kafka 模块中的生产者：

```typescript
import { Kafka } from 'kafkajs';

@Module({
  providers: [
    AppKafkaRetryFilter,
    {
      provide: 'KAFKA_PRODUCER',
      useFactory: async () => {
        const kafka = new Kafka({ brokers: ['localhost:9092'] });
        const producer = kafka.producer();
        await producer.connect();
        return producer;
      },
    },
  ],
})
export class AppModule {}
```

#### 提交偏移量

使用时，提交偏移量至关重要 Kafka 默认情况下，消息会在特定时间后自动提交（请参见 [KafkaJS autocommit documentation](https://kafka.js.org/docs/consuming#autocommit)). `KafkaContext` 允许您访问活动消费者手动提交偏移量。消费者是 KafkaJS 消费者，其工作方式类似于 [native KafkaJS implementation](https://kafka.js.org/docs/consuming#manual-committing).

```typescript
@EventPattern('user.created')
async handleUserCreated(@Payload() data: IncomingMessage, @Ctx() context: KafkaContext) {
  // business logic

  const { offset } = context.getMessage();
  const partition = context.getPartition();
  const topic = context.getTopic();
  const consumer = context.getConsumer();
  // Commit the next offset to consume (i.e., current offset + 1)
  await consumer.commitOffsets([
    { topic, partition, offset: (Number(offset) + 1).toString() },
  ]);
}
```

若要禁用自动提交，请设置 `autoCommit: false` 在 `run` 配置，如下：

```typescript
const app = await NestFactory.createMicroservice<MicroserviceOptions>(AppModule, {
  transport: Transport.KAFKA,
  options: {
    client: {
      brokers: ['localhost:9092'],
    },
    run: {
      autoCommit: false
    }
  }
});
```

#### 实例状态更新

要获取有关连接和底层驱动程序实例状态的实时更新，请订阅 `status` 溪流。此流提供特定于所选驱动程序的状态更新。为了 Kafka 司机 `status` 流发射 `connected`,`disconnected`,`rebalancing`,`crashed`，和 `stopped` 事件。

```typescript
this.client.status.subscribe((status: KafkaStatus) => {
  console.log(status);
});
```

> info **Hint** 这个 `KafkaStatus` 类型是从 `@nestjs/microservices` 包装。

同样，您可以订阅服务器的 `status` 流以接收有关服务器状态的通知：

```typescript
const server = app.connectMicroservice<MicroserviceOptions>(...);
server.status.subscribe((status: KafkaStatus) => {
  console.log(status);
});
```

#### 潜在生产者和消费者

对于更高级的用例，您可能需要访问底层的生产者和消费者实例，例如，手动关闭连接或使用特定于驱动程序的方法。然而，在大多数情况下，您**不应该**直接访问驱动程序。

为此，请使用 `producer` 和 `consumer` 暴露的属性 `ClientKafkaProxy` 实例。

```typescript
const producer = this.client.producer;
const consumer = this.client.consumer;
```
