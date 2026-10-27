import { Module } from '@nestjs/common';
import { FeatureFlagsModule } from '../feature-flags/feature-flags.module.js'
import { CoreService } from './core.service.js'
import { CoreController } from './core.controller.js'

@Module({
  imports: [
    FeatureFlagsModule.forRoot({
      newCheckout: true,
      betaDashboard: false,
    })
  ],
  providers: [CoreService],
  controllers: [CoreController],
  exports: [FeatureFlagsModule]
})
export class CoreModule {}
