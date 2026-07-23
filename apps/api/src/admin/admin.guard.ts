import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import type { Request } from 'express';

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<Request & { user?: { role?: string } }>();
    if (request.user?.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Administrator access is required');
    }
    return true;
  }
}
