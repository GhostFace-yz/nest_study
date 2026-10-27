# Mapped Types

Source: https://docs.nestjs.com/openapi/mapped-types

当您构建类似**的功能时 CRUD**（创建/读取/更新/删除），构造基本实体类型的变体通常很有用。Nest 提供了几个执行类型转换的实用程序函数，以使此任务更加方便。

#### 部分的

在构建输入验证类型（也称为 DTO）时，在同一类型上构建**create**和**update**变体通常很有用。例如，**create**变体可能需要所有字段，而**update**变体可能使所有字段都是可选的。

Nest 提供 `PartialType()` 实用功能使这项任务更容易，并最大限度地减少样板。

这个 `PartialType()` 函数返回一个类型（类），输入类型的所有属性都设置为可选。例如，假设您有一个如下所示的**create**类型：

```typescript
import { ApiProperty } from '@nestjs/swagger';

export class CreateCatDto {
  @ApiProperty()
  name: string;

  @ApiProperty()
  age: number;

  @ApiProperty()
  breed: string;
}
```

默认情况下，所有这些字段都是必需的。若要创建具有相同字段但每个字段都是可选的类型，请使用 `PartialType()` 并传递类引用（`CreateCatDto`）作为参数：

```typescript
export class UpdateCatDto extends PartialType(CreateCatDto) {}
```

> info **Hint** 这个 `PartialType()` 函数是从 `@nestjs/swagger` 包装。

#### 选择

这个 `PickType()` 函数通过从输入类型中选择一组属性来构造一个新类型（类）。例如，假设您从以下类型开始：

```typescript
import { ApiProperty } from '@nestjs/swagger';

export class CreateCatDto {
  @ApiProperty()
  name: string;

  @ApiProperty()
  age: number;

  @ApiProperty()
  breed: string;
}
```

可以使用 `PickType()` 效用函数：

```typescript
export class UpdateCatAgeDto extends PickType(CreateCatDto, ['age'] as const) {}
```

> info **Hint** 这个 `PickType()` 函数是从 `@nestjs/swagger` 包装。

#### 省略

这个 `OmitType()` 函数通过从输入类型中挑选所有属性，然后删除一组特定的键来构造类型。例如，假设您从以下类型开始：

```typescript
import { ApiProperty } from '@nestjs/swagger';

export class CreateCatDto {
  @ApiProperty()
  name: string;

  @ApiProperty()
  age: number;

  @ApiProperty()
  breed: string;
}
```

您可以生成一个派生类型，该类型具有所有属性**除外**`name`，如下所示。在这个结构中，第二个参数是 `OmitType()` 是属性名称的数组。

```typescript
export class UpdateCatDto extends OmitType(CreateCatDto, ['name'] as const) {}
```

> info **Hint** 这个 `OmitType()` 函数是从 `@nestjs/swagger` 包装。

#### 十字路口

这个 `IntersectionType()` 函数将两个或多个类型组合成一个新类型（类）。例如，假设您从两种类型开始：

```typescript
import { ApiProperty } from '@nestjs/swagger';

export class CreateCatDto {
  @ApiProperty()
  name: string;

  @ApiProperty()
  breed: string;
}

export class AdditionalCatInfo {
  @ApiProperty()
  color: string;
}
```

您可以生成一个新类型，该类型结合了两种类型的所有属性：

```typescript
export class UpdateCatDto extends IntersectionType(
  CreateCatDto,
  AdditionalCatInfo,
) {}
```

> info **Hint** 这个 `IntersectionType()` 函数是从 `@nestjs/swagger` 包装。

#### 组成

类型映射实用程序函数是可组合的。例如，下面生成一个类型（类），它具有 `CreateCatDto` 类型除外 `name`，这些属性设置为可选：

```typescript
export class UpdateCatDto extends PartialType(
  OmitType(CreateCatDto, ['name'] as const),
) {}
```
