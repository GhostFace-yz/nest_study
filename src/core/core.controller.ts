import { Controller, Get } from '@nestjs/common'
import { CoreService } from './core.service.js'

@Controller('core') 
export class CoreController {
  constructor (private readonly core: CoreService) {}

  @Get('flags') 
  flags() {
    return this.core.describe();
  }
}