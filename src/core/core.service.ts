import { Injectable } from '@nestjs/common'
import { FeatureFlagsService } from '../feature-flags/feature-flags.service.js'

@Injectable() 
export class CoreService {
  constructor (private readonly flags: FeatureFlagsService) {}

  describe() {
    return {
      newCheckout: this.flags.isEnabled('newCheckout'),
      betaDashboard: this.flags.isEnabled('betaDashboard')
    }
  }
}