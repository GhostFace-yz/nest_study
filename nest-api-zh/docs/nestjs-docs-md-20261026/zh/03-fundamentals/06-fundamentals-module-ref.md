# Module reference

Source: https://docs.nestjs.com/fundamentals/module-ref

Nest 提供 `ModuleRef` 类导航提供程序的内部列表并获取对任何提供程序的引用，使用其注入令牌作为查找键。`ModuleRef` 还允许您动态实例化静态提供程序和作用域提供程序。注射 `ModuleRef` 像任何其他依赖项一样进入类中：

```typescript
@Injectable()
export class CatsService {
  constructor(private moduleRef: ModuleRef) {}
}
```

> info **Hint** 这个 `ModuleRef` 类是从 `@nestjs/core` 包装。

#### 检索实例

这个 `ModuleRef` 实例（以下称为**模块参考**）具有 `get()` 方法。默认情况下，此方法使用注入令牌或类名来返回在*当前模块*中注册和实例化的提供程序、控制器或可注入（例如，保护或拦截器）。如果找不到实例，将引发异常。

```typescript
@Injectable()
export class CatsService implements OnModuleInit {
  private service: Service;
  constructor(private moduleRef: ModuleRef) {}

  onModuleInit() {
    this.service = this.moduleRef.get(Service);
  }
}
```

> warning **Warning** 无法检索作用域提供程序（瞬态或请求作用域，包括通过依赖项隐式请求作用域的提供程序）`get()` 方法。相反，请使用下面<a href="/fundamentals/module-ref#resolving-scoped-providers">解析作用域提供程序</a>中描述的技术。了解如何控制中的范围 [注射镜](/fundamentals/injection-scopes) 篇章。

要从全局上下文检索提供程序（例如，如果提供程序注册在不同的模块中），请将 `{ strict: false }` 选项作为第二个参数传递给 `get()`。

```typescript
this.moduleRef.get(Service, { strict: false });
```

#### 解析作用域提供程序

若要动态解析作用域提供程序（瞬态或请求作用域），请使用 `resolve()` 方法，将提供程序的注入令牌作为参数传递。

```typescript
@Injectable()
export class CatsService implements OnModuleInit {
  private transientService: TransientService;
  constructor(private moduleRef: ModuleRef) {}

  async onModuleInit() {
    this.transientService = await this.moduleRef.resolve(TransientService);
  }
}
```

这个 `resolve()` 方法从自己的**返回提供程序的唯一实例 DI 容器子树**。每个子树都有一个唯一的**上下文标识符**，所以如果你多次调用这个方法并比较实例引用，你会发现它们是不相等的。

```typescript
@Injectable()
export class CatsService implements OnModuleInit {
  constructor(private moduleRef: ModuleRef) {}

  async onModuleInit() {
    const transientServices = await Promise.all([
      this.moduleRef.resolve(TransientService),
      this.moduleRef.resolve(TransientService),
    ]);
    console.log(transientServices[0] === transientServices[1]); // false
  }
}
```

跨越多个实例获取单个实例 `resolve()` 调用，并确保它们共享相同的生成 DI 容器子树，将上下文标识符传递给 `resolve()` 方法。使用 `ContextIdFactory` 生成上下文标识符的类：它 `create()` 方法返回一个新的唯一标识符。

```typescript
@Injectable()
export class CatsService implements OnModuleInit {
  constructor(private moduleRef: ModuleRef) {}

  async onModuleInit() {
    const contextId = ContextIdFactory.create();
    const transientServices = await Promise.all([
      this.moduleRef.resolve(TransientService, contextId),
      this.moduleRef.resolve(TransientService, contextId),
    ]);
    console.log(transientServices[0] === transientServices[1]); // true
  }
}
```

> info **Hint** 这个 `ContextIdFactory` 类是从 `@nestjs/core` 包装。

#### 注册 `REQUEST` 供应商

手动生成的上下文标识符（使用 `ContextIdFactory.create()`) 代表 DI 子树 `REQUEST` 提供者是 `undefined`，因为这些子树不是由 Nest 依赖注入系统。

注册自定义 `REQUEST` 手动创建的对象 DI 子树，使用 `ModuleRef#registerRequestByContextId()` 方法：

```typescript
const contextId = ContextIdFactory.create();
this.moduleRef.registerRequestByContextId(/* YOUR_REQUEST_OBJECT */, contextId);
```

#### 获取当前子树

有时，您可能希望在**请求上下文**中解析请求范围提供程序的实例。假设 `CatsService` 是请求范围的，并且您希望解析 `CatsRepository` 实例，它也是一个请求作用域提供程序。分享相同的 DI 容器子树，则必须获取当前上下文标识符，而不是生成新的上下文标识符（例如，使用 `ContextIdFactory.create()` 函数，如上所示）。要获取当前上下文标识符，首先使用 `@Inject()` 装饰师：

```typescript
@Injectable()
export class CatsService {
  constructor(
    @Inject(REQUEST) private request: Record<string, unknown>,
  ) {}
}
```

> info **Hint** 了解有关请求提供程序的详细信息 [Request provider](/fundamentals/injection-scopes#request-provider) 注入范围章节。

现在使用 `getByRequest()` 方法 `ContextIdFactory` 类获取与请求对象关联的上下文标识符，并将其传递给 `resolve()` 呼叫：

```typescript
const contextId = ContextIdFactory.getByRequest(this.request);
const catsRepository = await this.moduleRef.resolve(CatsRepository, contextId);
```

#### 动态实例化自定义类

要将**以前未注册**的类动态实例化为**提供程序**，请使用模块引用的 `create()` 方法：

```typescript
@Injectable()
export class CatsService implements OnModuleInit {
  private catsFactory: CatsFactory;
  constructor(private moduleRef: ModuleRef) {}

  async onModuleInit() {
    this.catsFactory = await this.moduleRef.create(CatsFactory);
  }
}
```

这种技术允许您在框架容器之外有条件地实例化不同的类。
