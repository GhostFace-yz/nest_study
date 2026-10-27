# Asynchronous providers

Source: https://docs.nestjs.com/fundamentals/async-providers

有时应用程序启动应该延迟到一个或多个**异步任务**完成。例如，在建立到数据库的连接之前，您可能不想开始接受请求。异步提供程序允许您这样做。

要创建一个，请使用 `async/await` 与 `useFactory` 句法。工厂返回一个 `Promise`，工厂函数可以 `await` 异步任务。Nest 在实例化依赖于（注入）此类提供程序的任何类之前，等待承诺的解析。

```typescript
{
  provide: 'ASYNC_CONNECTION',
  useFactory: async () => {
    const connection = await createConnection(options);
    return connection;
  },
}
```

> info **Hint** 了解有关自定义提供程序语法的更多信息 [定制提供者](/fundamentals/custom-providers) 篇章。

#### 注射

异步提供程序通过其令牌注入到其他组件中，就像任何其他提供程序一样。在上面的例子中，您将使用 `@Inject('ASYNC_CONNECTION')`。
