# Circular dependency

Source: https://docs.nestjs.com/fundamentals/circular-dependency

当两个类相互依赖时，就会发生循环依赖。例如，A 类需要 B 类，B 类也需要 A 类。循环依赖可以出现在 Nest 模块之间和提供者之间。

尽可能避免循环依赖，但你不能总是这样做。在这种情况下，Nest 允许您以两种方式解析提供程序之间的循环依赖关系：使用**前向引用**，或者使用**ModuleRef**类从 DI 容器。本章描述了这两种技术，以及如何解决模块之间的循环依赖关系。

> warning **Warning** 使用“桶文件”（`index.ts` 文件）对导入进行分组也会导致循环依赖。避免模块和提供程序类的桶文件。特别是，不要使用桶文件导入与桶文件相同目录下的文件，即 `cats/cats.controller` 不应导入 `cats` 来导入 `cats/cats.service` 文件。有关更多详细信息，请参见 [this GitHub issue on barrel files and circular dependencies](https://github.com/nestjs/nest/issues/1181#issuecomment-430197191)。

#### 正向引用

**正向引用**，使用 `forwardRef()` 效用函数，让 Nest 尚未定义的引用类。例如，如果 `CatsService` 和 `CommonService` 相互依赖，双方的关系都可以使用 `@Inject()` 和 `forwardRef()` 解决循环依赖性的效用。否则，Nest 不会实例化它们，因为并非所有必要的元数据都可用。下面是一个例子：

```typescript
@Injectable()
export class CatsService {
  constructor(
    @Inject(forwardRef(() => CommonService))
    private commonService: CommonService,
  ) {}
}
```

> info **Hint** 这个 `forwardRef()` 函数是从 `@nestjs/common` 包装。

这涵盖了关系的一面。现在对 `CommonService` 执行相同的操作：

```typescript
@Injectable()
export class CommonService {
  constructor(
    @Inject(forwardRef(() => CatsService))
    private catsService: CatsService,
  ) {}
}
```

> warning **Warning** 实例化的顺序是不确定的。确保您的代码不依赖于首先调用哪个构造函数。依赖于提供程序的循环依赖关系 `Scope.REQUEST` 可能导致未定义的依赖关系。看 [this GitHub issue on request-scoped circular dependencies](https://github.com/nestjs/nest/issues/5778) 欲了解更多信息。

#### ModuleRef 类替代方案

替代方案 `forwardRef()` 是重构代码并使用 `ModuleRef` 类，以检索（否则）循环关系一侧的提供程序。了解有关 `ModuleRef` 中的实用类 [模块参考](/fundamentals/module-ref) 篇章。

#### 模块正向参考

若要解决模块之间的循环依赖关系，请使用相同的 `forwardRef()` 模块关联两侧的效用函数。例如：

```typescript
@Module({
  imports: [forwardRef(() => CatsModule)],
})
export class CommonModule {}
```

这涵盖了关系的一面。现在对 `CatsModule` 执行相同的操作：

```typescript
@Module({
  imports: [forwardRef(() => CommonModule)],
})
export class CatsModule {}
```
