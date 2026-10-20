import { Module } from '@nestjs/common';
import { CatsModule } from './cats/cats.module.js'
import { FeatureFlagsModule } from './feature-flags/feature-flags.module.js';
import { CoreModule } from './core/core.module.js';

@Module({
  imports: [
    FeatureFlagsModule.forRoot({
      newCheckout: true,
      betaDashboard: false
    }),
    CoreModule
  ],
})
export class AppModule { }
