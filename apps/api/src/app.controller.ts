import { Controller, Get } from '@nestjs/common';

@Controller()
export class AppController {
  @Get('health')
  health() {
    return {
      status: 'ok',
      service: 'Bodija Value Card API',
      timestamp: new Date().toISOString(),
    };
  }
}
