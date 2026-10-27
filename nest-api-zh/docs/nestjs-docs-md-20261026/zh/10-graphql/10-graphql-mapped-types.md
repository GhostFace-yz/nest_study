# Mapped types

Source: https://docs.nestjs.com/graphql/mapped-types

> warning **Warning** 本章仅适用于代码优先的方法。

当您构建以下功能时 CRUD（创建/读取/更新/删除），构造基本实体类型的变体通常很有用。Nest 提供了几个执行类型转换的实用程序函数，以使此任务更加方便。

#### 部分的

在构建输入验证类型（也称为数据传输对象或 DTO）时，在同一类型上构建**创建**和**更新**变体通常很有用。例如，**create**变体可能需要所有字段，而**update**变体可能使所有字段都是可选的。

Nest 提供 `PartialType()` 实用功能使这项任务更容易，并最大限度地减少样板。

这个 `PartialType()` 函数返回一个类型（类），输入类型的所有属性都设置为可选。例如，假设我们有一个**create**类型，如下所示：

```typescript
@InputType()
class CreateUserInput {
  @Field()
  email: string;

  @Field()
  password: string;

  @Field()
  firstName: string;
}
```

默认情况下，所有这些字段都是必需的。若要创建具有相同字段但每个字段都是可选的类型，请使用 `PartialType()` 传递类引用（`CreateUserInput`）作为参数：

```typescript
@InputType()
export class UpdateUserInput extends PartialType(CreateUserInput) {}
```

> info **Hint** 这个 `PartialType()` 函数是从 `@nestjs/graphql` 包装。

这个 `PartialType()` 函数接受一个可选的第二个参数：对装饰工厂的引用。使用它来更改应用于结果（子类）类的装饰器。如果不指定，子类将有效地使用与**parent**类（第一个参数中引用的类）相同的装饰器。在上面的例子中，我们扩展 `CreateUserInput`，用 `@InputType()` 装修师。既然我们想 `UpdateUserInput` 被视为也装饰有 `@InputType()` 我们不需要通过 `InputType` 作为第二个论点。如果父类型和子类型不同（例如，父类型用 `@ObjectType()`)，通过 `InputType` 作为第二个论点：

```typescript
@InputType()
export class UpdateUserInput extends PartialType(User, InputType) {}
```

您可以将 options 对象作为第二个参数传递，而不是 decorator 工厂。它接受 `decorator` 属性、`omitDefaultValues`（设置为 `true` 以删除从父字段继承的默认值）和 `skipNullProperties`（默认值为 `true`；设置为 `false` 以跳过仅对 `undefined` 值的验证，并且仍然验证 `null`）。

#### 选择

这个 `PickType()` 函数通过从输入类型中选择一组属性来构造一个新类型（类）。例如，假设我们从以下类型开始：

```typescript
@InputType()
class CreateUserInput {
  @Field()
  email: string;

  @Field()
  password: string;

  @Field()
  firstName: string;
}
```

可以使用 `PickType()` 效用函数：

```typescript
@InputType()
export class UpdateEmailInput extends PickType(CreateUserInput, [
  'email',
] as const) {}
```

> info **Hint** 这个 `PickType()` 函数是从 `@nestjs/graphql` 包装。

#### 省略

这个 `OmitType()` 函数通过从输入类型中挑选所有属性，然后删除一组特定的键来构造类型。例如，假设我们从以下类型开始：

```typescript
@InputType()
class CreateUserInput {
  @Field()
  email: string;

  @Field()
  password: string;

  @Field()
  firstName: string;
}
```

您可以生成一个派生类型，该类型具有所有属性**除外**`email`，如下所示。这里，第二个论点是 `OmitType()` 是属性名称的数组。

```typescript
@InputType()
export class UpdateUserInput extends OmitType(CreateUserInput, [
  'email',
] as const) {}
```

> info **Hint** 这个 `OmitType()` 函数是从 `@nestjs/graphql` 包装。

#### 十字路口

这个 `IntersectionType()` 函数将两种类型组合成一个新类型（类）。例如，假设我们从两种类型开始：

```typescript
@InputType()
class CreateUserInput {
  @Field()
  email: string;

  @Field()
  password: string;
}

@ObjectType()
export class AdditionalUserInfo {
  @Field()
  firstName: string;

  @Field()
  lastName: string;
}
```

您可以生成一个新类型，该类型结合了两种类型的所有属性：

```typescript
@InputType()
export class UpdateUserInput extends IntersectionType(
  CreateUserInput,
  AdditionalUserInfo,
) {}
```

> info **Hint** 这个 `IntersectionType()` 函数是从 `@nestjs/graphql` 包装。

#### 组成

类型映射实用程序函数是可组合的。例如，下面生成一个类型（类），它具有 `CreateUserInput` 类型除外 `email`，其中每一个都设置为可选：

```typescript
@InputType()
export class UpdateUserInput extends PartialType(
  OmitType(CreateUserInput, ['email'] as const),
) {}
```
