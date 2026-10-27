import { Injectable, Inject } from '@nestjs/common';
import { FEATURE_FLAGS } from './feature-flags.constants.js'

@Injectable()
export class FeatureFlagsService {
  constructor(
    @Inject(FEATURE_FLAGS) private readonly flags: Record<string, boolean>
  ) { }

  isEnabled(flag: string): boolean {
    return this.flags[flag]?? false;
  }
}
