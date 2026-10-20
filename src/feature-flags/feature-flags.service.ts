import { Injectable } from '@nestjs/common';
import { FEATURE_FLAGS } from './feature-flags.constants.js'

@Injectable()
export class FeatureFlagsService {
  constructor(
    @Injectable(FEATURE_FLAGS) private readonly flags: Record<string, boolean>
  ) { }

  isEnabled(flag: string): boolean {
    return this.flags[flag]?? false;
  }
}
