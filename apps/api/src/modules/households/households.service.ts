import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import type {
  CreateHouseholdResponseDto,
  ListMyHouseholdsItemDto,
  MembershipResponseDto,
} from './dto/create-household.dto.js';
import type { GetHouseholdMemberDto, GetHouseholdResponseDto } from './dto/membership.dto.js';

interface HouseholdMemberRow {
  membershipId: string;
  userId: string;
  displayName: string;
  email: string;
  emailCanonical: string;
  dbRole: string;
  isOwner: boolean;
}

const ROLE_ORDER: Record<string, number> = Object.freeze({ OWNER: 0, ADMIN: 1, MEMBER: 2 });

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

  async listMyHouseholds(userId: string): Promise<ListMyHouseholdsItemDto[]> {
    const memberships = await this.prisma.membership.findMany({
      where: { userId },
      include: {
        household: {
          include: {
            _count: { select: { memberships: true } },
          },
        },
      },
      orderBy: { household: { name: 'asc' } },
    });

    return memberships.map((m) => ({
      id: m.household.id,
      name: m.household.name,
      role: m.role as 'ADMIN' | 'MEMBER',
      memberCount: m.household._count.memberships,
      ownerMembershipId: m.household.ownerMembershipId!,
    }));
  }

  async getHousehold(
    actorId: string,
    householdId: string,
  ): Promise<GetHouseholdResponseDto | null> {
    const household = await this.prisma.household.findUnique({
      where: { id: householdId },
      include: {
        memberships: {
          include: { user: true },
        },
      },
    });

    if (household === null) return null;

    // Verify the actor is a member of this household.
    const actorMembership = household.memberships.find((m) => m.userId === actorId);
    if (actorMembership === undefined) return null;

    // If the household has no owner (inconsistent state), refuse to serve.
    if (household.ownerMembershipId === null) return null;

    // Build member rows with derived roles.
    const rows: HouseholdMemberRow[] = household.memberships.map((m) => ({
      membershipId: m.id,
      userId: m.userId,
      displayName: m.user.displayName,
      email: m.user.email,
      emailCanonical: m.user.emailCanonical,
      dbRole: m.role,
      isOwner: m.id === household.ownerMembershipId,
    }));

    // Total order:
    // 1. Role: OWNER (0) < ADMIN (1) < MEMBER (2)
    // 2. Within same role: current actor first
    // 3. Within same role (after current actor): NFC-normalized displayName locale ascending
    // 4. Same displayName: canonical email ascending
    // 5. Same email: membershipId code-point ascending
    // 6. Same membershipId: userId code-point ascending
    rows.sort((a, b) => {
      const aRole = a.isOwner ? 'OWNER' : a.dbRole;
      const bRole = b.isOwner ? 'OWNER' : b.dbRole;
      const aRoleOrder = ROLE_ORDER[aRole] ?? 99;
      const bRoleOrder = ROLE_ORDER[bRole] ?? 99;
      if (aRoleOrder !== bRoleOrder) return aRoleOrder - bRoleOrder;

      // Current actor first within role.
      const aIsActor = a.userId === actorId ? 0 : 1;
      const bIsActor = b.userId === actorId ? 0 : 1;
      if (aIsActor !== bIsActor) return aIsActor - bIsActor;

      // NFC-normalized displayName locale ascending.
      const displayNameCompare = a.displayName
        .normalize('NFC')
        .localeCompare(b.displayName.normalize('NFC'), 'zh-CN-u-co-phonebk', { sensitivity: 'base' });
      if (displayNameCompare !== 0) return displayNameCompare;

      // Canonical email ascending.
      const emailCompare = a.emailCanonical.localeCompare(b.emailCanonical);
      if (emailCompare !== 0) return emailCompare;

      // Membership ID code-point ascending.
      const membershipCompare = a.membershipId.localeCompare(b.membershipId);
      if (membershipCompare !== 0) return membershipCompare;

      // User ID code-point ascending.
      return a.userId.localeCompare(b.userId);
    });

    const members: GetHouseholdMemberDto[] = rows.map((r) => ({
      membershipId: r.membershipId,
      userId: r.userId,
      displayName: r.displayName,
      email: r.email,
      role: (r.isOwner ? 'OWNER' : r.dbRole) as 'OWNER' | 'ADMIN' | 'MEMBER',
      isCurrentUser: r.userId === actorId,
    }));

    return {
      id: household.id,
      name: household.name,
      ownerMembershipId: household.ownerMembershipId,
      createdAt: household.createdAt.toISOString(),
      members,
    };
  }

  async updateHousehold(
    actorId: string,
    householdId: string,
    name: string,
  ): Promise<GetHouseholdResponseDto | null> {
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

    const household = await this.prisma.household.findUnique({
      where: { id: householdId },
      include: { memberships: true },
    });

    if (household === null) return null;

    // Verify the actor is a member of this household.
    const actorMembership = household.memberships.find((m) => m.userId === actorId);
    if (actorMembership === undefined) return null;

    // Require current owner.
    if (actorMembership.id !== household.ownerMembershipId) return null;

    await this.prisma.household.update({
      where: { id: householdId },
      data: { name: trimmedName },
    });

    // Return authoritative household projection.
    return this.getHousehold(actorId, householdId);
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
