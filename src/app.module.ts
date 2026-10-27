import { Module } from '@nestjs/common';
import { FeatureFlagsModule } from './feature-flags/feature-flags.module.js';
import { CatsModule } from './cats/cats.module.js'
import { CoreModule } from './core/core.module.js';
import { AppService } from './app.service.js'
import { AppController } from './app.controller.js'
@Module({
  imports: [
    CoreModule,
    CatsModule
  ],
  controllers: [AppController],
  providers: [AppService]
})
export class AppModule { }
