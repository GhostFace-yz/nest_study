import { Module, DynamicModule } from '@nestjs/common';
import { FEATURE_FLAGS } from './feature-flags.constants.js'
import { FeatureFlagsService } from './feature-flags.service.js'


@Module({
  providers: [FeatureFlagsService],
  exports: [FeatureFlagsService]
})
export class FeatureFlagsModule {
  static forRoot(flags: Record<string, boolean>): DynamicModule {
    return {
      module: FeatureFlagsModule,
      providers: [{ provide: FEATURE_FLAGS, useValue: flags }]
    }
  }
}
