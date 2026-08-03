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
import { removalFailure, roleChangeFailure, transferFailure, type Role } from './household-policy.js';

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
  // Use path-segment token per D-07 /invite/[token] route convention.
  // The route at apps/client/app/invite/[token].tsx extracts the token from the path.
  const link = new URL(`/invite/${encodeURIComponent(token)}`, parsed);
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

  async previewInvitation(
    token: string,
  ): Promise<
    | { kind: 'valid'; householdName: string; inviterDisplayName: string; expiresAt: string }
    | { kind: 'invalid' }
    | { kind: 'expired' }
    | { kind: 'used' }
  > {
    const tokenHash = hashOpaqueToken(token);
    const invitation = await this.prisma.invitation.findUnique({
      where: { hash: tokenHash },
      include: {
        household: true,
        inviterUser: true,
      },
    });

    // Terminal: not found or invalidated -> generic "invalid"
    if (invitation === null) return { kind: 'invalid' };

    // Terminal: already consumed
    if (invitation.consumedAt !== null) return { kind: 'used' };

    // Terminal: explicitly invalidated (replaced by rotation)
    if (invitation.invalidatedAt !== null) return { kind: 'invalid' };

    // Terminal: expired
    if (invitation.expiresAt <= new Date()) return { kind: 'expired' };

    // Valid: return the D-07 public-preview fields
    return {
      kind: 'valid',
      householdName: invitation.household.name,
      inviterDisplayName: invitation.inviterUser.displayName,
      expiresAt: invitation.expiresAt.toISOString(),
    };
  }

  async acceptInvitation(
    actorId: string,
    token: string,
  ): Promise<GetHouseholdResponseDto> {
    const tokenHash = hashOpaqueToken(token);

    // Load the invitation with related data outside the transaction.
    // We need the inviter user, household, and the actor user info.
    const invitation = await this.prisma.invitation.findUnique({
      where: { hash: tokenHash },
      include: {
        household: true,
        inviterUser: true,
      },
    });

    // D-08: Generic "invalid or expired" for unknown/handled tokens.
    // Do not disclose whether the token exists or what household it targets.
    const GENERIC_INVALID = {
      code: 'INVALID_INVITATION',
      message: '这个邀请无效或已失效。',
    } as const;

    if (invitation === null) {
      throw new BadRequestException(GENERIC_INVALID);
    }
    if (invitation.consumedAt !== null) {
      // D-08: "已经接受过，不能再次使用" — but still generic about household
      throw new BadRequestException({
        code: 'INVITATION_ALREADY_USED',
        message: '这个邀请已经接受过，不能再次使用。',
      });
    }
    if (invitation.invalidatedAt !== null || invitation.expiresAt <= new Date()) {
      throw new BadRequestException(GENERIC_INVALID);
    }

    // Load actor's canonical email from the trusted server state (D-08, T-02-15).
    const actor = await this.prisma.user.findUnique({
      where: { id: actorId },
      select: { emailCanonical: true, displayName: true },
    });

    if (actor === null) {
      throw new BadRequestException(GENERIC_INVALID);
    }

    // D-08: Email must match. Mismatch hides household and inviter details.
    if (actor.emailCanonical !== invitation.emailCanonical) {
      throw new ForbiddenException({
        code: 'INVITATION_EMAIL_MISMATCH',
        message: '此邀请发给了另一个邮箱。请切换到受邀账户。',
      });
    }

    // Already a member? Double-check to prevent duplicate membership.
    const existingMembership = await this.prisma.membership.findUnique({
      where: {
        userId_householdId: {
          userId: actorId,
          householdId: invitation.householdId,
        },
      },
    });

    if (existingMembership !== null) {
      // Already in the household — mark invitation as consumed and return household.
      await this.prisma.invitation.update({
        where: { id: invitation.id },
        data: { consumedAt: new Date() },
      });
      return (await this.getHousehold(actorId, invitation.householdId))!;
    }

    // D-08 / T-02-16: Atomic claim + membership creation in one Serializable transaction.
    const now = new Date();

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const outcome = await this.prisma.$transaction(async (transaction) => {
          // Conditional claim: only claim if invitation is still valid.
          const claimed = await transaction.invitation.updateMany({
            where: {
              id: invitation.id,
              consumedAt: null,
              invalidatedAt: null,
              expiresAt: { gt: now },
            },
            data: { consumedAt: now },
          });

          if (claimed.count !== 1) {
            return { kind: 'conflict' } as const;
          }

          // Create MEMBER membership atomically (D-05, D-08).
          await transaction.membership.create({
            data: {
              userId: actorId,
              householdId: invitation.householdId,
              role: 'MEMBER',
            },
          });

          return { kind: 'completed' } as const;
        }, { isolationLevel: 'Serializable' });

        if (outcome.kind === 'conflict') {
          throw new ConflictException({
            code: 'INVITATION_ALREADY_CLAIMED',
            message: '这个邀请已经接受过，不能再次使用。',
          });
        }

        // Success — return the authoritative household projection.
        return (await this.getHousehold(actorId, invitation.householdId))!;
      } catch (error) {
        if (this.isSerializationConflict(error) && attempt < 2) continue;
        throw error;
      }
    }

    // Should never reach here, but satisfy TypeScript.
    throw new Error('Unreachable: invitation accept retry loop exhausted.');
  }

  // ---- Invitation lifecycle: list, resend, revoke ----

  async listInvitations(
    actorId: string,
    householdId: string,
  ): Promise<{
    invitations: Array<{
      id: string;
      emailCanonical: string;
      status: 'pending' | 'expired' | 'accepted' | 'revoked';
      expiresAt: string;
      role: string;
      createdAt: string;
    }>;
  }> {
    const household = await this.prisma.household.findUnique({
      where: { id: householdId },
      include: { memberships: true },
    });

    if (household === null || household.ownerMembershipId === null) {
      throw new NotFoundException({
        code: 'HOUSEHOLD_NOT_FOUND',
        message: 'Household not found or access denied.',
      });
    }

    const actorMembership = household.memberships.find((m) => m.userId === actorId);
    if (actorMembership === undefined) {
      throw new NotFoundException({
        code: 'HOUSEHOLD_NOT_FOUND',
        message: 'Household not found or access denied.',
      });
    }

    const actorIsOwner = actorMembership.id === household.ownerMembershipId;
    const actorRole = actorIsOwner ? 'OWNER' : actorMembership.role;
    if (actorRole !== 'OWNER' && actorRole !== 'ADMIN') {
      throw new ForbiddenException({
        code: 'INSUFFICIENT_ROLE',
        message: '只有所有者和管理员可以查看邀请列表。',
      });
    }

    const now = new Date();
    const invitations = await this.prisma.invitation.findMany({
      where: { householdId },
      orderBy: { createdAt: 'desc' },
    });

    return {
      invitations: invitations.map((inv) => ({
        id: inv.id,
        emailCanonical: inv.emailCanonical,
        status: inv.consumedAt !== null
          ? 'accepted' as const
          : inv.invalidatedAt !== null
            ? 'revoked' as const
            : inv.expiresAt <= now
              ? 'expired' as const
              : 'pending' as const,
        expiresAt: inv.expiresAt.toISOString(),
        role: inv.role,
        createdAt: inv.createdAt.toISOString(),
      })),
    };
  }

  async resendInvitation(
    actorId: string,
    householdId: string,
    invitationId: string,
  ): Promise<{ code: 'INVITATION_RESENT'; message: string }> {
    const household = await this.prisma.household.findUnique({
      where: { id: householdId },
      include: {
        memberships: {
          include: { user: true },
        },
      },
    });

    if (household === null || household.ownerMembershipId === null) {
      throw new NotFoundException({
        code: 'HOUSEHOLD_NOT_FOUND',
        message: 'Household not found or access denied.',
      });
    }

    const actorMembership = household.memberships.find((m) => m.userId === actorId);
    if (actorMembership === undefined) {
      throw new NotFoundException({
        code: 'HOUSEHOLD_NOT_FOUND',
        message: 'Household not found or access denied.',
      });
    }

    const actorIsOwner = actorMembership.id === household.ownerMembershipId;
    const actorRole = actorIsOwner ? 'OWNER' : actorMembership.role;
    if (actorRole !== 'OWNER' && actorRole !== 'ADMIN') {
      throw new ForbiddenException({
        code: 'INSUFFICIENT_ROLE',
        message: '只有所有者和管理员可以重新发送邀请。',
      });
    }

    const invitation = await this.prisma.invitation.findFirst({
      where: { id: invitationId, householdId },
      include: { household: true, inviterUser: true },
    });

    if (invitation === null) {
      throw new NotFoundException({
        code: 'INVITATION_NOT_FOUND',
        message: 'Invitation not found in this household.',
      });
    }

    // Check if invitation is already in a terminal state
    if (invitation.consumedAt !== null) {
      throw new BadRequestException({
        code: 'INVITATION_ALREADY_ACCEPTED',
        message: '这个邀请已经接受过，不能重新发送。',
      });
    }

    // For resend eligibility: pending or expired are both valid
    if (invitation.invalidatedAt !== null) {
      throw new BadRequestException({
        code: 'INVITATION_ALREADY_REVOKED',
        message: '这个邀请已经撤销，不能重新发送。',
      });
    }

    // Generate new token, invalidate old, create new
    const rawToken = opaqueToken();
    const tokenHash = hashOpaqueToken(rawToken);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + INVITE_LIFETIME_MS);

    const householdName = invitation.household.name;
    const inviterDisplayName = invitation.inviterUser.displayName;
    const deliveryEmail = invitation.emailCanonical;

    await this.prisma.$transaction(async (transaction) => {
      // Invalidate the current invitation.
      await transaction.invitation.updateMany({
        where: {
          id: invitationId,
          invalidatedAt: null,
          consumedAt: null,
        },
        data: { invalidatedAt: now },
      });

      // Create a new invitation with rotated token and refreshed expiry.
      await transaction.invitation.create({
        data: {
          inviterUserId: actorId,
          inviterMembershipId: actorMembership.id,
          householdId,
          emailCanonical: invitation.emailCanonical,
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

    return { code: 'INVITATION_RESENT', message: '邀请已重新发送。' };
  }

  async revokeInvitation(
    actorId: string,
    householdId: string,
    invitationId: string,
  ): Promise<{ code: 'INVITATION_REVOKED'; message: string }> {
    const household = await this.prisma.household.findUnique({
      where: { id: householdId },
      include: { memberships: true },
    });

    if (household === null || household.ownerMembershipId === null) {
      throw new NotFoundException({
        code: 'HOUSEHOLD_NOT_FOUND',
        message: 'Household not found or access denied.',
      });
    }

    const actorMembership = household.memberships.find((m) => m.userId === actorId);
    if (actorMembership === undefined) {
      throw new NotFoundException({
        code: 'HOUSEHOLD_NOT_FOUND',
        message: 'Household not found or access denied.',
      });
    }

    const actorIsOwner = actorMembership.id === household.ownerMembershipId;
    const actorRole = actorIsOwner ? 'OWNER' : actorMembership.role;
    if (actorRole !== 'OWNER' && actorRole !== 'ADMIN') {
      throw new ForbiddenException({
        code: 'INSUFFICIENT_ROLE',
        message: '只有所有者和管理员可以撤销邀请。',
      });
    }

    const invitation = await this.prisma.invitation.findFirst({
      where: { id: invitationId, householdId },
    });

    if (invitation === null) {
      throw new NotFoundException({
        code: 'INVITATION_NOT_FOUND',
        message: 'Invitation not found in this household.',
      });
    }

    // Safe revoke: only pending invitations can be revoked.
    // Already terminal (consumed, expired, or previously revoked) succeed silently
    // to satisfy the "safe action has no effect" contract.
    if (invitation.consumedAt !== null || invitation.invalidatedAt !== null) {
      return { code: 'INVITATION_REVOKED', message: '邀请已撤销。' };
    }

    const now = new Date();

    // Conditional revoke: only revoke if still pending.
    await this.prisma.invitation.updateMany({
      where: {
        id: invitationId,
        consumedAt: null,
        invalidatedAt: null,
      },
      data: { invalidatedAt: now },
    });

    // If no rows updated (race condition), still return success.
    return { code: 'INVITATION_REVOKED', message: '邀请已撤销。' };
  }

  // ---- Role governance (D-09, D-10) ----

  async changeMemberRole(
    actorId: string,
    householdId: string,
    targetMembershipId: string,
    newRole: 'ADMIN' | 'MEMBER',
  ): Promise<GetHouseholdResponseDto | null> {
    // Load household with fresh membership rows.
    const household = await this.prisma.household.findUnique({
      where: { id: householdId },
      include: {
        memberships: {
          include: { user: true },
        },
      },
    });

    if (household === null || household.ownerMembershipId === null) return null;

    // Resolve actor.
    const actorMembership = household.memberships.find((m) => m.userId === actorId);
    if (actorMembership === undefined) return null;

    const actorIsOwner = actorMembership.id === household.ownerMembershipId;
    const actorRole: Role = actorIsOwner ? 'OWNER' : (actorMembership.role as Role);

    // Resolve target — must belong to the same household.
    const targetMembership = household.memberships.find((m) => m.id === targetMembershipId);
    if (targetMembership === undefined) return null;

    // D-09: owner is never a valid target for role change.
    const targetIsOwner = targetMembership.id === household.ownerMembershipId;
    const targetRole: Role = targetIsOwner ? 'OWNER' : (targetMembership.role as Role);

    // Pure policy check (no DB access).
    const policyFailure = roleChangeFailure(targetIsOwner, actorRole, targetRole, newRole);
    if (policyFailure === 'TARGET_IS_OWNER') {
      // Owner is untouchable — this leaks no household membership info
      // since the caller already knows the target is in this household.
      throw new ForbiddenException({
        code: 'OWNER_UNTOUCHABLE',
        message: '所有者的角色不能变更。',
      });
    }
    if (policyFailure === 'INSUFFICIENT_ROLE') {
      throw new ForbiddenException({
        code: 'INSUFFICIENT_ROLE',
        message: '只有所有者和管理员可以变更成员角色。',
      });
    }
    if (policyFailure === 'SAME_ROLE') {
      throw new BadRequestException({
        code: 'ROLE_UNCHANGED',
        message: '目标成员已经是该角色。',
      });
    }

    // Guarded, stale-proof role update inside a Serializable transaction.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        await this.prisma.$transaction(async (transaction) => {
          // Lock the household row to prevent concurrent ownership changes.
          const locked = await transaction.household.findUnique({
            where: { id: householdId },
            select: { ownerMembershipId: true },
          });
          if (locked === null || locked.ownerMembershipId === null) {
            throw new NotFoundException({
              code: 'HOUSEHOLD_NOT_FOUND',
              message: 'Household not found or access denied.',
            });
          }

          // Re-verify owner pointer hasn't changed under us.
          if (locked.ownerMembershipId !== household.ownerMembershipId) {
            throw new ConflictException({
              code: 'HOUSEHOLD_OWNER_CHANGED',
              message: '家庭所有权已变更，请刷新后重试。',
            });
          }

          // Conditional update: only change if the target membership still has
          // the role we loaded and is not the owner pointer.
          const updated = await transaction.membership.updateMany({
            where: {
              id: targetMembershipId,
              householdId,
              role: targetMembership.role,
            },
            data: { role: newRole },
          });

          if (updated.count !== 1) {
            throw new ConflictException({
              code: 'STALE_MEMBERSHIP',
              message: '成员信息已过期，请刷新后重试。',
            });
          }
        }, { isolationLevel: 'Serializable' });

        // Success — return the authoritative household projection.
        return this.getHousehold(actorId, householdId);
      } catch (error) {
        if (this.isSerializationConflict(error) && attempt < 2) continue;
        throw error;
      }
    }

    throw new Error('Unreachable: changeMemberRole retry loop exhausted.');
  }

  // ---- Member removal (D-09, D-10) ----

  async removeMember(
    actorId: string,
    householdId: string,
    targetMembershipId: string,
  ): Promise<GetHouseholdResponseDto | null> {
    // Load household with fresh membership rows.
    const household = await this.prisma.household.findUnique({
      where: { id: householdId },
      include: {
        memberships: {
          include: { user: true },
        },
      },
    });

    if (household === null || household.ownerMembershipId === null) return null;

    // Resolve actor.
    const actorMembership = household.memberships.find((m) => m.userId === actorId);
    if (actorMembership === undefined) return null;

    const actorIsOwner = actorMembership.id === household.ownerMembershipId;
    const actorRole: Role = actorIsOwner ? 'OWNER' : (actorMembership.role as Role);

    // Resolve target — must belong to the same household.
    const targetMembership = household.memberships.find((m) => m.id === targetMembershipId);
    if (targetMembership === undefined) return null;

    // D-09: owner is never a valid removal target.
    const targetIsOwner = targetMembership.id === household.ownerMembershipId;
    const targetIsActor = targetMembership.userId === actorId;

    // Pure policy check (no DB access).
    const policyFailure = removalFailure(targetIsOwner, actorRole, targetIsActor);
    if (policyFailure === 'TARGET_IS_OWNER') {
      throw new ForbiddenException({
        code: 'OWNER_UNTOUCHABLE',
        message: '所有者的成员关系不能移除。',
      });
    }
    if (policyFailure === 'INSUFFICIENT_ROLE') {
      throw new ForbiddenException({
        code: 'INSUFFICIENT_ROLE',
        message: '只有所有者和管理员可以移除成员。',
      });
    }
    if (policyFailure === 'TARGET_IS_SELF') {
      throw new BadRequestException({
        code: 'CANNOT_REMOVE_SELF',
        message: '不能移除自己的成员关系，请使用离开家庭流程。',
      });
    }

    // Guarded, stale-proof removal inside a Serializable transaction.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        await this.prisma.$transaction(async (transaction) => {
          // Lock the household row to prevent concurrent ownership changes.
          const locked = await transaction.household.findUnique({
            where: { id: householdId },
            select: { ownerMembershipId: true },
          });
          if (locked === null || locked.ownerMembershipId === null) {
            throw new NotFoundException({
              code: 'HOUSEHOLD_NOT_FOUND',
              message: 'Household not found or access denied.',
            });
          }

          // Re-verify owner pointer hasn't changed under us.
          if (locked.ownerMembershipId !== household.ownerMembershipId) {
            throw new ConflictException({
              code: 'HOUSEHOLD_OWNER_CHANGED',
              message: '家庭所有权已变更，请刷新后重试。',
            });
          }

          // Conditional delete: only remove if the target membership still
          // has the role we loaded (stale detection) and is NOT the owner.
          const deleted = await transaction.membership.deleteMany({
            where: {
              id: targetMembershipId,
              householdId,
              role: targetMembership.role,
            },
          });

          if (deleted.count !== 1) {
            throw new ConflictException({
              code: 'STALE_MEMBERSHIP',
              message: '成员信息已过期，请刷新后重试。',
            });
          }
        }, { isolationLevel: 'Serializable' });

        // Success — return the authoritative household projection.
        return this.getHousehold(actorId, householdId);
      } catch (error) {
        if (this.isSerializationConflict(error) && attempt < 2) continue;
        throw error;
      }
    }

    throw new Error('Unreachable: removeMember retry loop exhausted.');
  }

  // ---- Ownership transfer (D-10, D-11) ----

  async transferOwnership(
    actorId: string,
    householdId: string,
    successorMembershipId: string,
  ): Promise<GetHouseholdResponseDto | null> {
    // Load household with fresh membership rows.
    const household = await this.prisma.household.findUnique({
      where: { id: householdId },
      include: {
        memberships: {
          include: { user: true },
        },
      },
    });

    if (household === null || household.ownerMembershipId === null) return null;

    // Resolve actor.
    const actorMembership = household.memberships.find((m) => m.userId === actorId);
    if (actorMembership === undefined) return null;

    const actorIsOwner = actorMembership.id === household.ownerMembershipId;

    // Resolve successor — must belong to the same household.
    const successorMembership = household.memberships.find((m) => m.id === successorMembershipId);
    if (successorMembership === undefined) return null;

    // Pure policy check (no DB access).
    const successorIsActor = successorMembership.id === actorMembership.id;
    const policyFailure = transferFailure(actorIsOwner, successorIsActor);
    if (policyFailure === 'NOT_OWNER') {
      throw new ForbiddenException({
        code: 'NOT_OWNER',
        message: '只有家庭所有者可以转移所有权。',
      });
    }
    if (policyFailure === 'SUCCESSOR_IS_OWNER') {
      throw new BadRequestException({
        code: 'SUCCESSOR_IS_OWNER',
        message: '不能将所有权转移给自己。',
      });
    }

    const formerOwnerMembershipId = actorMembership.id;

    // Guarded, stale-proof ownership transfer inside a Serializable transaction.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        await this.prisma.$transaction(async (transaction) => {
          // Lock the household row to prevent concurrent transfers.
          const locked = await transaction.household.findUnique({
            where: { id: householdId },
            select: { ownerMembershipId: true },
          });
          if (locked === null || locked.ownerMembershipId === null) {
            throw new NotFoundException({
              code: 'HOUSEHOLD_NOT_FOUND',
              message: 'Household not found or access denied.',
            });
          }

          // Re-verify owner pointer hasn't changed under us.
          if (locked.ownerMembershipId !== household.ownerMembershipId) {
            throw new ConflictException({
              code: 'HOUSEHOLD_OWNER_CHANGED',
              message: '家庭所有权已变更，请刷新后重试。',
            });
          }

          // Reset former owner's role to MEMBER (D-10 / D-11).
          const demoted = await transaction.membership.updateMany({
            where: {
              id: formerOwnerMembershipId,
              householdId,
            },
            data: { role: 'MEMBER' },
          });

          if (demoted.count !== 1) {
            throw new ConflictException({
              code: 'STALE_MEMBERSHIP',
              message: '成员信息已过期，请刷新后重试。',
            });
          }

          // Conditionally update the owner pointer: only if it still points
          // to the former owner's membership (compare-and-set).
          const transferred = await transaction.household.updateMany({
            where: {
              id: householdId,
              ownerMembershipId: formerOwnerMembershipId,
            },
            data: { ownerMembershipId: successorMembershipId },
          });

          if (transferred.count !== 1) {
            throw new ConflictException({
              code: 'HOUSEHOLD_OWNER_CHANGED',
              message: '家庭所有权已变更，请刷新后重试。',
            });
          }
        }, { isolationLevel: 'Serializable' });

        // Success — return the authoritative household projection.
        return this.getHousehold(actorId, householdId);
      } catch (error) {
        if (this.isSerializationConflict(error) && attempt < 2) continue;
        throw error;
      }
    }

    throw new Error('Unreachable: transferOwnership retry loop exhausted.');
  }

  private isSerializationConflict(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code: string }).code === 'P2034'
    );
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
