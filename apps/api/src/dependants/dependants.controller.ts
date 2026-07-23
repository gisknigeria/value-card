import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApprovalStatus } from '@prisma/client';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminGuard } from '../admin/admin.guard';
import { DependantsService } from './dependants.service';
import { CreateDependantDto } from './dto/create-dependant.dto';
import { UpdateDependantDto } from './dto/update-dependant.dto';
import { UpdateDependantStatusDto } from './dto/update-dependant-status.dto';

type AuthRequest = Request & { user: { userId: string; role: string } };

// ── Resident-facing routes: /dependants ──────────────────────────────
@Controller('dependants')
@UseGuards(JwtAuthGuard)
export class DependantsController {
  constructor(@Inject(DependantsService) private readonly svc: DependantsService) {}

  @Get()
  list(@Req() req: AuthRequest) {
    return this.svc.listForResident(req.user.userId);
  }

  @Post()
  create(@Req() req: AuthRequest, @Body() body: CreateDependantDto) {
    return this.svc.create(req.user.userId, body);
  }

  @Patch(':id')
  update(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() body: UpdateDependantDto,
  ) {
    return this.svc.update(req.user.userId, id, body);
  }

  @Delete(':id')
  remove(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.svc.remove(req.user.userId, id);
  }
}

// ── Admin-facing routes: /admin/dependants ───────────────────────────
@Controller('admin/dependants')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminDependantsController {
  constructor(@Inject(DependantsService) private readonly svc: DependantsService) {}

  @Get()
  list(
    @Query('status') status?: ApprovalStatus,
    @Query('query') query?: string,
  ) {
    return this.svc.adminList(status, query);
  }

  @Patch(':id/status')
  updateStatus(
    @Param('id') id: string,
    @Body() body: UpdateDependantStatusDto,
    @Req() req: AuthRequest,
  ) {
    return this.svc.adminUpdateStatus(id, body.status, req.user.userId, body.reason);
  }
}
