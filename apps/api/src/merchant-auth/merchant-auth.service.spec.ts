import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ApprovalStatus, MerchantUserRole } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { MerchantAuthService } from './merchant-auth.service';
import { PrismaService } from '../prisma/prisma.service';

jest.mock('bcryptjs', () => ({
  compare: jest.fn(),
}));

describe('MerchantAuthService.login', () => {
  it('accepts merchant credentials using phone or email and creates a session', async () => {
    const prisma = {
      user: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'user-1',
          isActive: true,
          passwordHash: '$2a$12$Vx99KX9A6I7b4xO3H0p3f.jj0V4liQ6.2oP0Cq74r4d6k2pW1zo6',
          merchantUser: {
            id: 'mu-1',
            role: MerchantUserRole.OWNER,
            isActive: true,
            merchant: { approvalStatus: ApprovalStatus.APPROVED },
            user: { id: 'user-1', phone: '08030000002', email: 'cedar@bodija.example.com' },
          },
        }),
      },
    } as unknown as PrismaService;

    (bcrypt.compare as jest.Mock).mockResolvedValue(true);

    const jwt = { sign: jest.fn().mockReturnValue('token') } as unknown as JwtService;

    const moduleRef = await Test.createTestingModule({
      providers: [MerchantAuthService, { provide: PrismaService, useValue: prisma }, { provide: JwtService, useValue: jwt }],
    }).compile();

    const service = moduleRef.get(MerchantAuthService);
    const result = await service.login({ identifier: '08030000002', password: 'merchant123' });

    expect(result.accessToken).toBe('token');
    expect(result.merchantUser.user.email).toBe('cedar@bodija.example.com');
  });
});
