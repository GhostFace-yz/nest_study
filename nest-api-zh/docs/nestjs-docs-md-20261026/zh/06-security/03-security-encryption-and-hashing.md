# Encryption and Hashing

Source: https://docs.nestjs.com/security/encryption-and-hashing

**加密**是对信息进行编码的过程。这个过程将信息的原始表示（称为明文）转换为称为密文的替代形式。理想情况下，只有授权方才能将密文破译回明文并访问原始信息。加密本身并不能防止干扰，但它会阻止潜在的拦截器获取可理解的内容。加密是一个双向功能：加密的东西可以用正确的密钥解密。

**散列**是将给定的键转换为另一个值的过程。散列函数根据数学算法生成新值。一旦一个值被散列，就不可能从输出返回到输入。

#### 加密

Node.js 提供内置 [密码模块](https://nodejs.org/api/crypto.html) 您可以使用它来加密和解密字符串、数字、缓冲区、流等。Nest 没有在此模块之上提供额外的包，以避免引入不必要的抽象。

例如，让我们使用 AES（高级加密标准）`'aes-256-ctr'` 算法，它使用 CTR 加密模式。

```typescript
import { createCipheriv, randomBytes, scrypt } from 'node:crypto';
import { promisify } from 'node:util';

const iv = randomBytes(16);
const password = 'Password used to generate key';

// The key length is dependent on the algorithm.
// In this case for aes256, it is 32 bytes.
const key = (await promisify(scrypt)(password, 'salt', 32)) as Buffer;
const cipher = createCipheriv('aes-256-ctr', key, iv);

const textToEncrypt = 'Nest';
const encryptedText = Buffer.concat([
  cipher.update(textToEncrypt),
  cipher.final(),
]);
```

解密 `encryptedText` 价值：

```typescript
import { createDecipheriv } from 'node:crypto';

const decipher = createDecipheriv('aes-256-ctr', key, iv);
const decryptedText = Buffer.concat([
  decipher.update(encryptedText),
  decipher.final(),
]);
```

#### 散列

若要散列密码，请使用 `PasswordHasher` 来自 [`@nestjs/authentication`](/security/authentication).它用脚本散列 `node:crypto` 在参数处 OWASP 在 libuv 线程池上推荐（N=2^17，r=8，p=1：每个散列大约 128 MiB 内存），所以它不会阻塞事件循环，也不需要本地依赖关系。scrypt 是硬内存的，这使得在 GPU 上猜测密码比使用 bcrypt 昂贵得多。

当您的应用程序导入 `AuthenticationModule`,`PasswordHasher` 是提供程序，因此请将其注入存储和检查密码的位置：

```typescript
import { Injectable } from '@nestjs/common';
import { PasswordHasher } from '@nestjs/authentication';

@Injectable()
export class CredentialsService {
  constructor(private readonly passwordHasher: PasswordHasher) {}

  async hashPassword(password: string) {
    return this.passwordHasher.hash(password);
  }

  async checkPassword(password: string, storedHash: string | undefined) {
    return this.passwordHasher.verify(password, storedHash);
  }
}
```

- `hash()` 返回一个自描述字符串，例如 `$scrypt$ln=17,r=8,p=1$<salt>$<hash>`：参数和随机盐与散列一起存储，因此没有其他东西要保留。
- `verify()` 在恒定时间内进行比较。通过 `undefined` 对于未知用户：它检查一个虚拟散列，因此响应时间不会显示哪些帐户存在。
- 密码是 Unicode 标准化的（NFKC) 在散列之前，因此在不同键盘上键入的相同密码会进行验证。
- `hash()` 拒绝一个空密码和一个超过 4 KiB 的密码 `RangeError`，和 `verify()` 答案 `false` 对他们来说没有散列。任何其他规则，如最小长度，都是你先检查的。
- `needsRehash()` 告诉您存储的哈希是使用比当前参数更弱的参数创建的。成功后检查 `verify()`，并在拥有明文时存储新的散列：

```typescript
if (this.passwordHasher.needsRehash(storedHash)) {
  await this.usersRepository.updatePasswordHash(user.id, await this.passwordHasher.hash(password));
}
```

成本来自模块的 `password` 选项：设置其 `logN` 增加到 18 倍。它的内存上限为 1 GiB，每个散列的工作量是默认工作量的 16 倍，因此默认 `r` 8 个， `logN` 20 点停止；创建散列时会抛出超出它的参数，用它们制作的存储散列永远不会验证。在模块外部，您可以使用 `new PasswordHasher()` 在测试中，一个更便宜的实例可以保持套件的速度， `logN` 设置为 10。

> info **Hint** 如果您想使用 argon2 或 bcrypt，[argon2](https://www.npmjs.com/package/argon2) 和 [bcrypt](https://www.npmjs.com/package/bcrypt) 软件包适用于 Nest 就像他们一样：打电话给他们 `hash()` 和 `verify()`（氩 2）或 `compare()`（bcrypt）来自您自己的提供者的函数。两者都是原生模块，bcrypt 只读取密码的前 72 个字节。
