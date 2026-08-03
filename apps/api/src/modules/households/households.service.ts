import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import type { CreateHouseholdResponseDto, MembershipResponseDto } from './dto/create-household.dto.js';

const NAME_MIN_CODE_POINTS = 1;
const NAME_MAX_CODE_POINTS = 40;

@Injectable()
export class HouseholdsService {
  constructor(private readonly prisma: PrismaService) {}

  async createHousehold(
    creatorId: string,
    name: string,
  ): Promise<CreateHouseholdResponseDto> {
    const trimmedName = name.trim().normalize('NFC');
    const codePointCount = [...trimmedName].length;
    if (
      codePointCount < NAME_MIN_CODE_POINTS ||
      codePointCount > NAME_MAX_CODE_POINTS
    ) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: 'Request validation failed.',
        details: [
          {
            field: 'name',
            codes: ['length'],
            message: '请输入 1–40 个字符的家庭名称。',
          },
        ],
      });
    }

    const outcome = await this.prisma.$transaction(async (transaction) => {
      const household = await transaction.household.create({
        data: { name: trimmedName },
      });

      const membership = await transaction.membership.create({
        data: {
          userId: creatorId,
          householdId: household.id,
          role: 'ADMIN',
        },
      });

      const updated = await transaction.household.update({
        where: { id: household.id },
        data: { ownerMembershipId: membership.id },
      });

      return { household: updated, membership };
    }, { isolationLevel: 'Serializable' });

    return {
      id: outcome.household.id,
      name: outcome.household.name,
      ownerMembershipId: outcome.household.ownerMembershipId!,
      createdAt: outcome.household.createdAt.toISOString(),
      membership: this.toMembershipResponse(outcome.membership),
    };
  }

  private toMembershipResponse(membership: {
    id: string;
    userId: string;
    householdId: string;
    role: string;
  }): MembershipResponseDto {
    return {
      id: membership.id,
      userId: membership.userId,
      householdId: membership.householdId,
      role: membership.role as 'ADMIN' | 'MEMBER',
    };
  }
}
