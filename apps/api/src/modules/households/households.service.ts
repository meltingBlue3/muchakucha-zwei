import { createHash, randomBytes } from 'node:crypto';
import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { isEmail } from 'class-validator';
import { MAIL_PORT, type MailPort } from '../../infrastructure/mail/mail.port.js';
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
const INVITE_TOKEN_BYTES = 32;
const INVITE_LIFETIME_MS = 7 * 24 * 60 * 60 * 1_000;

function validationError(field: string, code: string): BadRequestException {
  return new BadRequestException({
    code: 'VALIDATION_FAILED',
    message: 'Request validation failed.',
    details: [{ field, codes: [code] }],
  });
}

function opaqueToken(): string {
  return randomBytes(INVITE_TOKEN_BYTES).toString('base64url');
}

function hashOpaqueToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

function invitationUrl(token: string, environment: NodeJS.ProcessEnv = process.env): string {
  const configuredOrigin = environment.EMAIL_LINK_ORIGIN;
  if (environment.NODE_ENV === 'production' && !configuredOrigin) {
    throw new Error('EMAIL_LINK_ORIGIN is required in production.');
  }
  const origin = configuredOrigin ?? 'http://127.0.0.1:8081';
  const parsed = new URL(origin);
  if (
    !['http:', 'https:'].includes(parsed.protocol)
    || parsed.origin !== origin
    || parsed.pathname !== '/'
    || parsed.search !== ''
    || parsed.hash !== ''
    || parsed.username !== ''
    || parsed.password !== ''
  ) {
    throw new Error('EMAIL_LINK_ORIGIN must be an exact HTTP(S) origin.');
  }
  const link = new URL('/invite', parsed);
  link.searchParams.set('token', token);
  return link.href;
}

@Injectable()
export class HouseholdsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(MAIL_PORT) private readonly mailPort: MailPort,
  ) {}

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

  async sendHouseholdInvitation(
    actorId: string,
    householdId: string,
    email: string,
  ): Promise<{ code: 'INVITATION_SENT'; message: string }> {
    const emailCanonical = email.trim().normalize('NFC').toLowerCase();
    if (!isEmail(emailCanonical)) {
      throw validationError('email', 'isEmail');
    }

    const household = await this.prisma.household.findUnique({
      where: { id: householdId },
      include: {
        memberships: {
          include: { user: true },
        },
      },
    });

    if (household === null) {
      throw new NotFoundException({
        code: 'HOUSEHOLD_NOT_FOUND',
        message: 'Household not found or access denied.',
      });
    }

    if (household.ownerMembershipId === null) {
      throw new NotFoundException({
        code: 'HOUSEHOLD_NOT_FOUND',
        message: 'Household not found or access denied.',
      });
    }

    // Verify actor is a member.
    const actorMembership = household.memberships.find((m) => m.userId === actorId);
    if (actorMembership === undefined) {
      throw new NotFoundException({
        code: 'HOUSEHOLD_NOT_FOUND',
        message: 'Household not found or access denied.',
      });
    }

    // Only owner and admin can invite.
    const actorIsOwner = actorMembership.id === household.ownerMembershipId;
    const actorRole = actorIsOwner ? 'OWNER' : actorMembership.role;
    if (actorRole !== 'OWNER' && actorRole !== 'ADMIN') {
      throw new ForbiddenException({
        code: 'INSUFFICIENT_ROLE',
        message: '只有所有者和管理员可以发送邀请。',
      });
    }

    // Check if email is already a current member.
    const existingMember = household.memberships.find(
      (m) => m.user.emailCanonical === emailCanonical,
    );
    if (existingMember !== undefined) {
      throw new ConflictException({
        code: 'ALREADY_MEMBER',
        message: '这个邮箱已经是该家庭的成员。',
      });
    }

    // Generate opaque token and hash.
    const rawToken = opaqueToken();
    const tokenHash = hashOpaqueToken(rawToken);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + INVITE_LIFETIME_MS);

    // Transactionally rotate predecessor and create new invitation.
    const inviterDisplayName = actorMembership.user.displayName;
    const householdName = household.name;
    const deliveryEmail = email.trim().normalize('NFC');

    await this.prisma.$transaction(async (transaction) => {
      // Invalidate any pending active invitation for this household+email.
      await transaction.invitation.updateMany({
        where: {
          householdId,
          emailCanonical,
          invalidatedAt: null,
          consumedAt: null,
        },
        data: { invalidatedAt: now },
      });

      // Create the new invitation.
      await transaction.invitation.create({
        data: {
          inviterUserId: actorId,
          inviterMembershipId: actorMembership.id,
          householdId,
          emailCanonical,
          hash: tokenHash,
          role: 'MEMBER',
          expiresAt,
        },
      });
    }, { isolationLevel: 'Serializable' });

    // Send email after successful commit.
    void this.mailPort.sendHouseholdInvitation({
      to: deliveryEmail,
      invitationUrl: invitationUrl(rawToken),
      inviterDisplayName,
      householdDisplayName: householdName,
      expiresAt,
    });

    // Identical response for registered, absent, and repeated non-members (D-06).
    return { code: 'INVITATION_SENT', message: '邀请已发送。' };
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
