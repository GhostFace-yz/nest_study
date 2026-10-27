# Overview

Source: https://docs.nestjs.com/data/overview

Nest 与数据库无关，因此您可以将其与任何 SQL 或 NoSQL 数据库集成。在最基本的层次上，将 Nest 连接到数据库意味着为该数据库加载适当的 Node.js 驱动程序，就像使用 [Express](https://expressjs.com/en/guide/database-integration.html) 或 Fastify 一样，并通过 [供应商](/providers) 使客户端对应用程序的其余部分可用。

大多数应用程序在更高的抽象层次上工作，具有 ORM 或者查询生成器。此类别中的章节涵盖以下集成：

- **[TypeORM](/data/typeorm)**（`@nestjs/typeorm`）：具有基于装饰器的实体和存储库模式的 ORM。它支持大多数 SQL 数据库，以及 MongoDB。
- **[Drizzle](/data/drizzle)**（`@nestjs/drizzle`）：轻量级，TypeScript 优先的 ORM。您用普通函数声明表，并使用类似 SQL 的查询生成器编写查询，Drizzle 从模式中推断每个结果类型。
- **[MongoDB](/data/mongodb)**（`@nestjs/mongoose`）：[Mongoose](https://mongoosejs.com/) MongoDB 的模式和模型。
- **[Prisma](/data/prisma)**：安 ORM 它从模式文件生成类型安全的客户端。它没有 Nest-特定包：您通过提供程序公开生成的客户端。
- **[MikroORM](/data/mikroorm)**(`@mikro-orm/nestjs`，由 MikroORM 团队维护）：一个 ORM 基于数据映射器、工作单元和身份映射模式。
- **[Sequelize](/data/sequelize)**(`@nestjs/sequelize`)：基于承诺的 ORM 为了 SQL 数据库。与 `sequelize-typescript` 包，你用装饰器声明模型。

这个 Nest 团队维护 `@nestjs/typeorm`,`@nestjs/drizzle`,`@nestjs/mongoose`，和 `@nestjs/sequelize` 包裹。他们补充道 Nest-特定功能，如存储库或模型注入、可测试性和异步配置。

您也可以直接使用任何其他库。例如，请参阅如何 [build a Nest module for Knex.js](https://dev.to/nestjs/build-a-nestjs-module-for-knex-js-or-other-resource-based-libraries-in-5-minutes-12an)。若要缓存查询结果，请参见 [Caching](/data/caching)。
