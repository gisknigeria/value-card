import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AdminModule } from '../admin/admin.module';
import { DependantsController, AdminDependantsController } from './dependants.controller';
import { DependantsService } from './dependants.service';

@Module({
  imports: [AuthModule, AdminModule],
  controllers: [DependantsController, AdminDependantsController],
  providers: [DependantsService],
})
export class DependantsModule {}
