# HTTPS & multiple servers

Source: https://docs.nestjs.com/faq/multiple-servers

创建使用 HTTPS 协议，设置 `httpsOptions`options 对象中的属性传递给 `NestFactory.create()` 方法：

```typescript
const httpsOptions = {
  key: fs.readFileSync('./secrets/private-key.pem'),
  cert: fs.readFileSync('./secrets/public-certificate.pem'),
};
const app = await NestFactory.create(AppModule, {
  httpsOptions,
});
await app.listen(process.env.PORT ?? 3000);
```

如果您使用 `FastifyAdapter`，按如下方式创建应用程序：

```typescript
const app = await NestFactory.create<NestFastifyApplication>(
  AppModule,
  new FastifyAdapter({ https: httpsOptions }),
);
```

#### 多个并发服务器

下面的食谱展示了如何创建一个 Nest 同时监听多个端口的应用程序（例如，在 HTTP 端口和 HTTPS 口)：

```typescript
const httpsOptions = {
  key: fs.readFileSync('./secrets/private-key.pem'),
  cert: fs.readFileSync('./secrets/public-certificate.pem'),
};

const server = express();
const app = await NestFactory.create(AppModule, new ExpressAdapter(server));
await app.init();

const httpServer = http.createServer(server).listen(3000);
const httpsServer = https.createServer(httpsOptions, server).listen(443);
```

因为我们自己创建了服务器 `http.createServer()` 和 `https.createServer()`,Nest 打电话时不会关闭 `app.close()` 或者当进程接收到终止信号时。您需要自己关闭它们，例如使用实现 `OnApplicationShutdown` 钩子：

```typescript
@Injectable()
export class ShutdownObserver implements OnApplicationShutdown {
  private httpServers: http.Server[] = [];

  public addHttpServer(server: http.Server): void {
    this.httpServers.push(server);
  }

  public async onApplicationShutdown(): Promise<void> {
    await Promise.all(
      this.httpServers.map(
        (server) =>
          new Promise((resolve, reject) => {
            server.close((error) => {
              if (error) {
                reject(error);
              } else {
                resolve(null);
              }
            });
          }),
      ),
    );
  }
}

const shutdownObserver = app.get(ShutdownObserver);
shutdownObserver.addHttpServer(httpServer);
shutdownObserver.addHttpServer(httpsServer);
```

> info **Hint** `ExpressAdapter` 是从 `@nestjs/platform-express` 包导入的。`http` 和 `https` 模块内置在 Node.js 中。

> warning **Warning** 此食谱不适用于 [GraphQL subscriptions](/graphql/subscriptions)。
