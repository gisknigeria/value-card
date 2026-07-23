import { Injectable } from '@nestjs/common';
import { BenefitType, OfferStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const TONES = [
  'green', 'blue', 'coral', 'violet', 'gold', 'slate',
];

function categoryTone(category: string, index: number): string {
  const lower = category.toLowerCase();
  if (lower.includes('pharmacy') || lower.includes('health')) return 'blue';
  if (lower.includes('restaurant') || lower.includes('food') || lower.includes('kitchen')) return 'coral';
  if (lower.includes('clinic') || lower.includes('diagnostic')) return 'violet';
  if (lower.includes('laundry') || lower.includes('clean')) return 'gold';
  if (lower.includes('auto') || lower.includes('garage') || lower.includes('repair')) return 'slate';
  return TONES[index % TONES.length];
}

function merchantInitials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase();
}

@Injectable()
export class MerchantsService {
  constructor(private readonly prisma: PrismaService) {}

  async listActiveOffers(filters: { category?: string; benefitType?: string }) {
    const benefitType = Object.values(BenefitType).includes(
      filters.benefitType as BenefitType,
    )
      ? (filters.benefitType as BenefitType)
      : undefined;

    const offers = await this.prisma.offer.findMany({
      where: {
        status: OfferStatus.ACTIVE,
        merchant: { approvalStatus: 'APPROVED', ...(filters.category ? { category: filters.category } : {}) },
        benefitType,
      },
      include: {
        merchant: {
          select: { businessName: true, category: true, location: true },
        },
      },
      orderBy: [{ merchant: { businessName: 'asc' } }],
    });

    return offers.map((offer, index) => ({
      id: offer.id,
      merchant: offer.merchant.businessName,
      initials: merchantInitials(offer.merchant.businessName),
      category: offer.merchant.category,
      value: offer.displayValue,
      model: offer.redemptionModel === 'ACCUMULATED' ? 'Accumulated' : 'Immediate',
      rule: offer.redemptionRule,
      location: offer.merchant.location,
      validUntil: offer.validUntil ? offer.validUntil.toISOString() : null,
      tone: categoryTone(offer.merchant.category, index),
    }));
  }

  async listCategories() {
    const merchants = await this.prisma.merchant.findMany({
      where: { offers: { some: { status: OfferStatus.ACTIVE } } },
      distinct: ['category'],
      select: { category: true },
      orderBy: { category: 'asc' },
    });
    return merchants.map(({ category }) => category);
  }
}
