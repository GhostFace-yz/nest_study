# Standalone apps

Source: https://docs.nestjs.com/standalone-applications

有几种方法可以挂载 Nest 应用。您可以创建 web 应用程序、微服务或裸 Nest**独立应用程序**（没有任何网络侦听器）。独立应用程序是一个包装器 Nest**IoC 容器**，它保存所有实例化的类。通过独立应用程序对象，您可以从任何导入的模块中获取对任何现有实例的引用。这使您可以利用 Nest 任何地方的框架，包括脚本**CRON**工作。你甚至可以建立一个**CLI**最重要的是。

#### 入门

创建一个 Nest 独立应用程序，请使用以下结构：

```typescript
async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  // your application logic here ...
}
await bootstrap();
```

#### 从静态模块检索提供程序

独立应用程序对象允许您获取对在 Nest 应用程序中注册的任何实例的引用。假设一个 `TasksService` 提供程序驻留在由 `AppModule` 导入的 `TasksModule` 中。该类提供了一组您想要在 CRON 作业中调用的方法。

```typescript
const tasksService = app.get(TasksService);
```

访问 `TasksService` 实例，使用 `get()` 方法。它的作用类似于一个**查询**，在每个注册模块中搜索一个实例，并接受任何提供者的令牌。若要进行严格的上下文检查，请使用 `strict: true` 财产。此选项生效后，您必须导航到特定模块，才能从选定的上下文中获取实例。

```typescript
const tasksService = app.select(TasksModule).get(TasksService, { strict: true });
```

下表总结了可用于从独立应用程序对象检索实例引用的方法。

<table>
  <tr>
    <td>
      <code>get()</code>
    </td>
    <td>
      Retrieves an instance of a controller or provider (including guards, filters, and so on) available in the application context.
    </td>
  </tr>
  <tr>
    <td>
      <code>select()</code>
    </td>
    <td>
      Navigates through the module graph to pull out a specific instance of the selected module (used together with strict mode, as described above).
    </td>
  </tr>
</table>

> info **Hint** 在非严格模式下，默认选择根模块。要选择任何其他模块，请逐步手动浏览模块图表。

独立应用程序没有任何网络侦听器，因此 Nest 与请求处理相关的功能（例如，中间件、拦截器、管道和防护）在此上下文中不可用。

例如，即使您在应用程序中注册了全局拦截器，然后使用 `app.get()` 方法，当您调用控制器的方法时，拦截器不会被执行。

#### 从动态模块检索提供程序

使用时 [动态模块](/fundamentals/dynamic-modules), 通过 `app.select()` 表示应用程序中注册的动态模块的对象相同。例如：

```typescript
export const dynamicConfigModule = ConfigModule.register({ folder: './config' });

@Module({
  imports: [dynamicConfigModule],
})
export class AppModule {}
```

然后，您可以稍后选择该模块：

```typescript
const configService = app.select(dynamicConfigModule).get(ConfigService, { strict: true });
```

#### 终止阶段

如果你想要 Node.js 脚本完成后退出的进程（例如，对于正在运行的脚本 CRON 作业），调用 `app.close()` 方法结束时 `bootstrap()` 功能：

```typescript
async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  // application logic...
  await app.close();
}
await bootstrap();
```

如 [生命周期事件](/fundamentals/lifecycle-events) 章，呼唤 `app.close()` 触发关机生命周期挂钩。

#### 例子

工作示例可在 [独立应用示例](https://github.com/nestjs/nest/tree/master/sample/18-context) 在 GitHub 上。
