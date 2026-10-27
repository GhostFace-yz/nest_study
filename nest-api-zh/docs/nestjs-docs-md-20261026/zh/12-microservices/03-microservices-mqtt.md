# MQTT

Source: https://docs.nestjs.com/microservices/mqtt

[MQTT](https://mqtt.org/)（消息队列遥测传输）是一种开源、轻量级的消息传递协议，针对低延迟进行了优化。它提供了一种使用**发布/订阅**模型连接设备的可扩展且经济高效的方式。建立在 MQTT 由发布服务器、代理和一个或多个客户端组成。该协议是为受限设备和低带宽、高延迟或不可靠网络设计的。

#### 安装

开始建造 MQTT-基于微服务，首先安装所需的包：

```bash
$ npm i --save mqtt
```

#### 概述

使用 MQTT 传输器，将以下选项对象传递给 `createMicroservice()` 方法：

```typescript
const app = await NestFactory.createMicroservice<MicroserviceOptions>(AppModule, {
  transport: Transport.MQTT,
  options: {
    url: 'mqtt://localhost:1883',
  },
});
```

> info **Hint** 这个 `Transport` 枚举是从 `@nestjs/microservices` 包装。

#### 选项

这个 `options` 对象特定于所选的传送器。<strong>MQTT</strong> transporter 暴露 [MQTT.js client options](https://github.com/mqttjs/MQTT.js/#mqttclientstreambuilder-options)，以及 `url`,`subscribeOptions`（见 [Quality of Service](#quality-of-service-qos)），和 `userProperties`（见 [记录建设者](#record-builders)）属性。在服务器上，`maxConnectionAttempts` 属性限制建立初始连接的尝试次数（默认值：`-1`，即无限）。该限制不适用于服务器连接后的重新连接。

#### 客户

与其他微服务传输程序一样，您有<a href="/microservices/basics#client-producer-class">几个选项</a>来创建一个 MQTT`ClientProxy` 实例。

创建实例的一种方法是使用 `ClientsModule`.导入并使用它 `register()` 方法来传递具有与上面所示的相同属性的 options 对象 `createMicroservice()` 方法，加上 `name` 属性用作注入令牌。阅读有关 `ClientsModule` 在概述的<a href="/microservices/basics#client-producer-class">client 部分</a>中。

```typescript
@Module({
  imports: [
    ClientsModule.register([
      {
        name: 'MATH_SERVICE',
        transport: Transport.MQTT,
        options: {
          url: 'mqtt://localhost:1883',
        }
      },
    ]),
  ]
  ...
})
```

您还可以使用 `ClientProxyFactory` 或者 `@Client()` 装修师。两者都在概述</a>的<a href="/microservices/basics#client-producer-class">client 部分中进行了描述。

#### 上下文

在更复杂的场景中，您可能需要有关传入请求的附加信息。与 MQTT 传送器，您可以访问 `MqttContext` 物体。

```typescript
@MessagePattern('notifications')
getNotifications(@Payload() data: number[], @Ctx() context: MqttContext) {
  console.log(`Topic: ${context.getTopic()}`);
}
```

> info **Hint** `@Payload()`,`@Ctx()` 和 `MqttContext` 是从 `@nestjs/microservices` 包装。

访问原始 MQTT[包](https://github.com/mqttjs/mqtt-packet)，使用 `getPacket()` 方法 `MqttContext` 对象：

```typescript
@MessagePattern('notifications')
getNotifications(@Payload() data: number[], @Ctx() context: MqttContext) {
  console.log(context.getPacket());
}
```

#### 通配符

订阅可以针对显式主题，也可以包含通配符。有两个通配符可用：`+` 匹配单个主题级别，以及 `#` 匹配多个主题级别。

```typescript
@MessagePattern('sensors/+/temperature/+')
getTemperature(@Ctx() context: MqttContext) {
  console.log(`Topic: ${context.getTopic()}`);
}
```

#### 服务质量（QoS）

默认情况下，使用 `@MessagePattern()` 和 `@EventPattern()` 装饰者使用 QoS 0。如果需要更高的 QoS，请使用 `subscribeOptions` 建立连接时的块：

```typescript
const app = await NestFactory.createMicroservice<MicroserviceOptions>(AppModule, {
  transport: Transport.MQTT,
  options: {
    url: 'mqtt://localhost:1883',
    subscribeOptions: {
      qos: 2
    },
  },
});
```

#### 每模式 QoS

您可以通过传递 `qos`extras 对象中的属性，`@MessagePattern()` 或者 `@EventPattern()` 装修师。没有自己的模式 `qos` 使用全局 `subscribeOptions.qos` 价值。

```typescript
@EventPattern('critical-events', { qos: 2 })
handleCriticalEvent(@Payload() data: any) {
  // This subscription uses QoS 2
}

@EventPattern('metrics', { qos: 0 })
handleMetrics(@Payload() data: any) {
  // This subscription uses QoS 0
}
```

#### 记录建设者

配置消息选项（调整 QoS 级别、设置保留或 DUP 标志，或向有效载荷添加属性），使用 `MqttRecordBuilder` 班级。例如，以下记录将 QoS 设置为 `1` 与 `setQoS()` 方法，并使用 `setProperties()` 方法：

```typescript
const userProperties = { 'x-version': '1.0.0' };
const record = new MqttRecordBuilder(':cat:')
  .setProperties({ userProperties })
  .setQoS(1)
  .build();
client.send('replace-emoji', record).subscribe(...);
```

> info **Hint** 这个 `MqttRecordBuilder` 类是从 `@nestjs/microservices` 包装。

在服务器端，您可以通过 `MqttContext` 读取这些选项：

```typescript
@MessagePattern('replace-emoji')
replaceEmoji(@Payload() data: string, @Ctx() context: MqttContext): string {
  const { properties: { userProperties } } = context.getPacket();
  return userProperties['x-version'] === '1.0.0' ? '🐱' : '🐈';
}
```

要为客户端发送的所有请求配置用户属性，请将它们作为选项传递给 `ClientProxyFactory`：

```typescript
import { Module } from '@nestjs/common';
import { ClientProxyFactory, Transport } from '@nestjs/microservices';

@Module({
  providers: [
    {
      provide: 'API_v1',
      useFactory: () =>
        ClientProxyFactory.create({
          transport: Transport.MQTT,
          options: {
            url: 'mqtt://localhost:1883',
            userProperties: { 'x-version': '1.0.0' },
          },
        }),
    },
  ],
})
export class ApiModule {}
```

从 NestJSv12.1.3，消息处理程序也可以返回记录。Nest 将记录数据作为回复发送，并将记录选项（例如，QoS 级别和属性）应用于回复消息：

```typescript
@MessagePattern('replace-emoji')
replaceEmoji() {
  return new MqttRecordBuilder(':cat:')
    .setProperties({ userProperties: { 'x-version': '1.0.0' } })
    .setQoS(1)
    .build();
}
```

#### 实例状态更新

要获取有关连接和底层驱动程序实例状态的实时更新，请订阅 `status` 溪流。此流提供特定于所选驱动程序的状态更新。为了 MQTT 司机 `status` 流发射 `connected`,`disconnected`,`reconnecting`，和 `closed` 事件。

```typescript
this.client.status.subscribe((status: MqttStatus) => {
  console.log(status);
});
```

> info **Hint** 这个 `MqttStatus` 类型是从 `@nestjs/microservices` 包装。

同样，您可以订阅服务器的 `status` 流以接收有关服务器状态的通知。

```typescript
const server = app.connectMicroservice<MicroserviceOptions>(...);
server.status.subscribe((status: MqttStatus) => {
  console.log(status);
});
```

#### 听 MQTT 事件

在某些情况下，您可能希望监听微服务发出的内部事件。例如，您可以听 `error` 发生错误时触发其他操作的事件。为此，请使用 `on()` 方法如下所示：

```typescript
this.client.on('error', (err) => {
  console.error(err);
});
```

同样，您可以监听服务器的内部事件：

```typescript
server.on<MqttEvents>('error', (err) => {
  console.error(err);
});
```

> info **Hint** 这个 `MqttEvents` 类型是从 `@nestjs/microservices` 包装。

从 NestJSv12.1.2 开始，使用客户端的 `on()` 方法注册的侦听器将保持注册状态，直到您调用 `close()`，因此它们也附加到在上一个调用关闭而未重新连接后在下一个 `send()` 或 `emit()` 调用中创建的新 MQTT 客户端（例如，当 `reconnectPeriod` 是 `0` 时）。注册不会进行重复数据删除，因此请注册每个侦听器一次，而不是在其回调或每次重新连接后再次注册。

#### 底层驱动程序访问

对于更高级的用例，您可能需要访问底层驱动程序实例，例如，手动关闭连接或使用特定于驱动程序的方法。然而，在大多数情况下，您**不应该**直接访问驱动程序。

为此，请使用 `unwrap()` 方法，它返回底层驱动程序实例。通用类型参数指定您期望的驱动程序实例的类型。

```typescript
const mqttClient = this.client.unwrap<import('mqtt').MqttClient>();
```

同样，您可以访问服务器的底层驱动程序实例：

```typescript
const mqttClient = server.unwrap<import('mqtt').MqttClient>();
```
