# Global path prefix

Source: https://docs.nestjs.com/faq/global-prefix

为注册在 an 中的 **每条路由** 设置前缀 HTTP 应用程序，调用 `setGlobalPrefix()` 方法 `INestApplication` 实例。

```typescript
const app = await NestFactory.create(AppModule);
app.setGlobalPrefix('v1');
```

若要从全局前缀中排除路由，请使用 `exclude` 选项：

```typescript
app.setGlobalPrefix('v1', {
  exclude: [{ path: 'health', method: RequestMethod.GET }],
});
```

或者，您可以将路由指定为字符串，这将排除每个请求方法的路由：

```typescript
app.setGlobalPrefix('v1', { exclude: ['cats'] });
```

> info **Hint** 这个 `path` 属性通过 [path-to-regexp](https://github.com/pillarjs/path-to-regexp#parameters) 包装。纯通配符星号（`*`）被弃用；使用参数（`:param`）或命名通配符（`*splat`）而是。命名通配符至少需要一个额外的段，因此 `health/*splat` 排除 `/health/status` 但不是 `/health` 本身。若要排除两者，请将通配符用括号括起来： `health/{*splat&#125;`.
