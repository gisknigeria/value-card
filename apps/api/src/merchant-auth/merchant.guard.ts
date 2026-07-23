import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import type { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Ensures the authenticated user is a MERCHANT role, belongs to an active
 * MerchantUser record, and that their merchant account is not SUSPENDED.
 * Attaches `merchantId` and `merchantRole` to request.user for downstream use.
 */
@Injectable()
export class MerchantGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context
      .switchToHttp()
      .getRequest<Request & { user?: { userId?: string; role?: string; merchantId?: string; merchantRole?: string } }>();

    if (req.user?.role !== UserRole.MERCHANT) {
      throw new ForbiddenException('Merchant access is required');
    }

    const merchantUser = await this.prisma.merchantUser.findFirst({
      where: { userId: req.user.userId, isActive: true },
      select: {
        role: true,
        merchant: { select: { id: true, approvalStatus: true } },
      },
    });

    if (!merchantUser) {
      throw new UnauthorizedException('Merchant account not found');
    }

    if (merchantUser.merchant.approvalStatus === 'SUSPENDED') {
      throw new ForbiddenException(
        'Your merchant account has been suspended. Contact BERA for assistance.',
      );
    }

    // Attach for use in controllers/services
    req.user.merchantId = merchantUser.merchant.id;
    req.user.merchantRole = merchantUser.role;

    return true;
  }
}
