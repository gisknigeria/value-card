import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { AdminRole, UserRole } from '@prisma/client';
import type { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<Request & { user?: { userId?: string; role?: string } }>();
    if (request.user?.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Administrator access is required');
    }

    const admin = await this.prisma.user.findUnique({
      where: { id: request.user.userId },
      select: { adminRole: true, isActive: true },
    });
    if (!admin?.isActive || !admin.adminRole) {
      throw new ForbiddenException('Active administrator access is required');
    }

    if (admin.adminRole === AdminRole.ASSOCIATION_REP) {
      const path = request.originalUrl.split('?')[0];
      const isAssociationReviewRoute = /^\/api\/admin\/(residents|dependants|merchants)(\/|$)/.test(path);
      if (!isAssociationReviewRoute) {
        throw new ForbiddenException('Association representatives can only review residents, dependants and merchants in their association');
      }
    }
    return true;
  }
}
