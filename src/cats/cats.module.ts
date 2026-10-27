import { Global, Module } from '@nestjs/common';
import { CatsController } from './cats.controller.js'
import { CatsService } from './cats.service.js'

@Global()
@Module({
  controllers: [CatsController],
  providers: [CatsService],
  exports: [CatsService]
})
export class CatsModule {
}
