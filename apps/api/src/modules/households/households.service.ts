import type { Prisma } from '../../generated/prisma/client.js';
import { removeMemberAssignments } from '../shared/task-assignment.js';
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import type {
  CreateHouseholdResponseDto,
  ListMyHouseholdsItemDto,
  MembershipResponseDto,
} from './dto/create-household.dto.js';
import type { GetHouseholdMemberDto, GetHouseholdResponseDto } from './dto/membership.dto.js';
import { leaveFailure, removalFailure, roleChangeFailure, transferFailure, type Role } from './household-policy.js';

interface HouseholdMemberRow {
  membershipId: string;
  userId: string;
  displayName: string;
  usernameCanonical: string;
  username: string;
  dbRole: string;
  isOwner: boolean;
}

const ROLE_ORDER: Record<string, number> = Object.freeze({ OWNER: 0, ADMIN: 1, MEMBER: 2 });

const NAME_MIN_CODE_POINTS = 1;
const NAME_MAX_CODE_POINTS = 40;
const INVITE_LIFETIME_MS = 7 * 24 * 60 * 60 * 1_000;

@Injectable()
export class HouseholdsService {
  constructor(
    private readonly prisma: PrismaService,
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
      role: (m.id === m.household.ownerMembershipId ? 'OWNER' : m.role) as 'OWNER' | 'ADMIN' | 'MEMBER',
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
      usernameCanonical: m.user.usernameCanonical,
      username: m.user.username,
      dbRole: m.role,
      isOwner: m.id === household.ownerMembershipId,
    }));

    // Total order:
    // 1. Role: OWNER (0) < ADMIN (1) < MEMBER (2)
    // 2. Within same role: current actor first
    // 3. Within same role (after current actor): NFC-normalized displayName locale ascending
    // 4. Same displayName: canonical username ascending
    // 5. Same username: membershipId code-point ascending
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

      // Canonical username ascending.
      const usernameCompare = a.usernameCanonical.localeCompare(b.usernameCanonical);
      if (usernameCompare !== 0) return usernameCompare;

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
      username: r.username,
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

  private async invitationManager(tx: Prisma.TransactionClient, actorId: string, householdId: string) {
    // Invitations and membership changes use the same household lock.
    await tx.$queryRaw`SELECT id FROM households WHERE id = ${householdId}::uuid FOR UPDATE`;
    const household = await tx.household.findUnique({ where: { id: householdId }, include: { memberships: true } });
    const member = household?.memberships.find(m => m.userId === actorId);
    if (!household || !member) throw new NotFoundException({ code: 'HOUSEHOLD_NOT_FOUND', message: 'Household not found.' });
    if (household.ownerMembershipId !== member.id && member.role !== 'ADMIN') {
      throw new ForbiddenException({ code: 'INSUFFICIENT_ROLE', message: '只有所有者和管理员可以管理邀请。' });
    }
    return { household, member };
  }

  private async deliverInvitation(tx: Prisma.TransactionClient, actorId: string, householdId: string, recipientId: string, username: string, membershipId: string) {
    const existing = await tx.membership.findUnique({ where: { userId_householdId: { userId: recipientId, householdId } } });
    if (existing) throw new ConflictException({ code: 'ALREADY_MEMBER', message: '这个账户已经是该家庭的成员。' });
    const now = new Date();
    // One actionable invitation per recipient and household, even after resends.
    await tx.invitation.updateMany({ where: { householdId, recipientUserId: recipientId, consumedAt: null, declinedAt: null, invalidatedAt: null }, data: { invalidatedAt: now } });
    return tx.invitation.create({ data: {
      inviterUserId: actorId, inviterMembershipId: membershipId, householdId,
      recipientUserId: recipientId, username, role: 'MEMBER',
      expiresAt: new Date(now.getTime() + INVITE_LIFETIME_MS),
    } });
  }

  async sendHouseholdInvitation(actorId: string, householdId: string, input: { username: string }) {
    const invitation = await this.prisma.$transaction(async tx => {
      const { member } = await this.invitationManager(tx, actorId, householdId);
      const recipient = await tx.user.findUnique({ where: { usernameCanonical: input.username.trim().normalize('NFC').toLowerCase() } });
      if (!recipient) throw new BadRequestException({ code: 'INVITATION_USER_NOT_FOUND', message: '未找到这个用户名，请让家人先注册账户。' });
      return this.deliverInvitation(tx, actorId, householdId, recipient.id, recipient.username, member.id);
    });
    return { code: 'INVITATION_SENT' as const, message: '邀请已发送到对方的收件箱。', invitationId: invitation.id };
  }

  async listInvitationInbox(actorId: string) {
    const invitations = await this.prisma.invitation.findMany({
      where: { recipientUserId: actorId, consumedAt: null, declinedAt: null, invalidatedAt: null, expiresAt: { gt: new Date() } },
      include: { household: true, inviterUser: true }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    return { invitations: invitations.map(inv => ({
      id: inv.id, householdName: inv.household.name, inviterDisplayName: inv.inviterUser.displayName,
      expiresAt: inv.expiresAt.toISOString(), createdAt: inv.createdAt.toISOString(),
    })) };
  }

  private async respondToInvitation(actorId: string, invitationId: string, accept: boolean) {
    // Scope before returning any invitation details: another account sees 404.
    const scope = await this.prisma.invitation.findFirst({ where: { id: invitationId, recipientUserId: actorId } });
    if (!scope) throw new NotFoundException({ code: 'INVITATION_NOT_FOUND', message: 'Invitation not found.' });
    return this.prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM households WHERE id = ${scope.householdId}::uuid FOR UPDATE`;
      const now = new Date();
      const claimed = await tx.invitation.updateMany({
        where: { id: invitationId, recipientUserId: actorId, consumedAt: null, declinedAt: null, invalidatedAt: null, expiresAt: { gt: now } },
        data: accept ? { consumedAt: now } : { declinedAt: now },
      });
      if (claimed.count !== 1) throw new ConflictException({ code: 'INVITATION_UNAVAILABLE', message: '邀请已处理、撤销或过期，请刷新收件箱。' });
      if (accept) {
        // Idempotent membership creation also handles a separately accepted invite.
        await tx.membership.upsert({ where: { userId_householdId: { userId: actorId, householdId: scope.householdId } },
          create: { userId: actorId, householdId: scope.householdId, role: 'MEMBER' }, update: {} });
      }
      return scope.householdId;
    });
  }

  async acceptInvitation(actorId: string, invitationId: string): Promise<GetHouseholdResponseDto> {
    const householdId = await this.respondToInvitation(actorId, invitationId, true);
    return (await this.getHousehold(actorId, householdId))!;
  }

  async declineInvitation(actorId: string, invitationId: string): Promise<void> {
    await this.respondToInvitation(actorId, invitationId, false);
  }

  async listInvitations(actorId: string, householdId: string) {
    return this.prisma.$transaction(async tx => {
      await this.invitationManager(tx, actorId, householdId);
      const now = new Date();
      const invitations = await tx.invitation.findMany({ where: { householdId }, orderBy: { createdAt: 'desc' } });
      return { invitations: invitations.map(inv => ({
        id: inv.id, username: inv.username,
        status: inv.consumedAt !== null ? 'accepted' as const
          : inv.declinedAt !== null ? 'declined' as const
          : inv.invalidatedAt !== null ? 'revoked' as const
          : inv.expiresAt <= now ? 'expired' as const : 'pending' as const,
        expiresAt: inv.expiresAt.toISOString(), role: inv.role, createdAt: inv.createdAt.toISOString(),
      })) };
    });
  }

  async resendInvitation(actorId: string, householdId: string, invitationId: string) {
    const invitation = await this.prisma.$transaction(async tx => {
      const { member } = await this.invitationManager(tx, actorId, householdId);
      const previous = await tx.invitation.findFirst({ where: { id: invitationId, householdId } });
      if (!previous) throw new NotFoundException({ code: 'INVITATION_NOT_FOUND', message: 'Invitation not found.' });
      if (previous.consumedAt !== null) throw new BadRequestException({ code: 'INVITATION_ALREADY_ACCEPTED', message: '邀请已经接受。' });
      if (previous.declinedAt !== null) throw new BadRequestException({ code: 'INVITATION_ALREADY_DECLINED', message: '邀请已被拒绝，请重新邀请。' });
      if (previous.invalidatedAt !== null) throw new BadRequestException({ code: 'INVITATION_ALREADY_REVOKED', message: '邀请已经撤销。' });
      return this.deliverInvitation(tx, actorId, householdId, previous.recipientUserId, previous.username, member.id);
    });
    return { code: 'INVITATION_RESENT' as const, message: '邀请已重新发送到对方的收件箱。', invitationId: invitation.id };
  }

  async revokeInvitation(actorId: string, householdId: string, invitationId: string) {
    await this.prisma.$transaction(async tx => {
      await this.invitationManager(tx, actorId, householdId);
      const invitation = await tx.invitation.findFirst({ where: { id: invitationId, householdId } });
      if (!invitation) throw new NotFoundException({ code: 'INVITATION_NOT_FOUND', message: 'Invitation not found.' });
      await tx.invitation.updateMany({ where: { id: invitationId, consumedAt: null, declinedAt: null, invalidatedAt: null }, data: { invalidatedAt: new Date() } });
    });
    return { code: 'INVITATION_REVOKED' as const, message: '邀请已撤销。' };
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
        message: '只有所有者可以任免管理员。',
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
          await transaction.$queryRaw`
            SELECT "id" FROM "households"
            WHERE "id" = ${householdId}::uuid
            FOR UPDATE
          `;
          await transaction.$queryRaw`
            SELECT "id" FROM "memberships"
            WHERE "household_id" = ${householdId}::uuid
              AND ("user_id" = ${actorId}::uuid OR "id" = ${targetMembershipId}::uuid)
            FOR UPDATE
          `;
          const locked = await transaction.household.findUnique({
            where: { id: householdId },
            include: { memberships: true },
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

          const currentActor = locked.memberships.find((membership) => membership.userId === actorId);
          const currentTarget = locked.memberships.find((membership) => membership.id === targetMembershipId);
          if (currentActor === undefined || currentTarget === undefined) {
            throw new NotFoundException({
              code: 'HOUSEHOLD_NOT_FOUND',
              message: 'Household not found or access denied.',
            });
          }
          const currentActorRole: Role = currentActor.id === locked.ownerMembershipId
            ? 'OWNER'
            : currentActor.role as Role;
          const currentTargetIsOwner = currentTarget.id === locked.ownerMembershipId;
          const currentTargetRole: Role = currentTargetIsOwner ? 'OWNER' : currentTarget.role as Role;
          const currentFailure = roleChangeFailure(
            currentTargetIsOwner,
            currentActorRole,
            currentTargetRole,
            newRole,
          );
          if (currentFailure === 'TARGET_IS_OWNER') {
            throw new ForbiddenException({ code: 'OWNER_UNTOUCHABLE', message: '所有者的角色不能变更。' });
          }
          if (currentFailure === 'INSUFFICIENT_ROLE') {
            throw new ForbiddenException({ code: 'INSUFFICIENT_ROLE', message: '只有所有者可以任免管理员。' });
          }
          if (currentFailure === 'SAME_ROLE') {
            throw new BadRequestException({ code: 'ROLE_UNCHANGED', message: '目标成员已经是该角色。' });
          }

          // Conditional update: only change if the target membership still has
          // the role we loaded and is not the owner pointer.
          const updated = await transaction.membership.updateMany({
            where: {
              id: targetMembershipId,
              householdId,
              role: currentTarget.role,
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
    const policyFailure = removalFailure(targetIsOwner, actorRole, targetIsActor, targetMembership.role as Role);
    if (policyFailure === 'TARGET_IS_OWNER') {
      throw new ForbiddenException({
        code: 'OWNER_UNTOUCHABLE',
        message: '所有者的成员关系不能移除。',
      });
    }
    if (policyFailure === 'INSUFFICIENT_ROLE') {
      throw new ForbiddenException({
        code: 'INSUFFICIENT_ROLE',
        message: '只有所有者可以移除管理员；管理员只能移除普通成员。',
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
          await transaction.$queryRaw`
            SELECT "id" FROM "households"
            WHERE "id" = ${householdId}::uuid
            FOR UPDATE
          `;
          await transaction.$queryRaw`
            SELECT "id" FROM "memberships"
            WHERE "household_id" = ${householdId}::uuid
              AND ("user_id" = ${actorId}::uuid OR "id" = ${targetMembershipId}::uuid)
            FOR UPDATE
          `;
          const locked = await transaction.household.findUnique({
            where: { id: householdId },
            include: { memberships: true },
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

          const currentActor = locked.memberships.find((membership) => membership.userId === actorId);
          const currentTarget = locked.memberships.find((membership) => membership.id === targetMembershipId);
          if (currentActor === undefined || currentTarget === undefined) {
            throw new NotFoundException({ code: 'HOUSEHOLD_NOT_FOUND', message: 'Household not found or access denied.' });
          }
          const currentActorRole: Role = currentActor.id === locked.ownerMembershipId
            ? 'OWNER'
            : currentActor.role as Role;
          const currentFailure = removalFailure(
            currentTarget.id === locked.ownerMembershipId,
            currentActorRole,
            currentTarget.userId === actorId,
            currentTarget.role as Role,
          );
          if (currentFailure === 'TARGET_IS_OWNER') {
            throw new ForbiddenException({ code: 'OWNER_UNTOUCHABLE', message: '所有者的成员关系不能移除。' });
          }
          if (currentFailure === 'INSUFFICIENT_ROLE') {
            throw new ForbiddenException({ code: 'INSUFFICIENT_ROLE', message: '只有所有者可以移除管理员；管理员只能移除普通成员。' });
          }
          if (currentFailure === 'TARGET_IS_SELF') {
            throw new BadRequestException({ code: 'CANNOT_REMOVE_SELF', message: '不能移除自己的成员关系，请使用离开家庭流程。' });
          }

          await removeMemberAssignments(transaction, householdId, currentTarget.userId);

          // Conditional delete: only remove if the target membership still
          // has the role we loaded (stale detection) and is NOT the owner.
          const deleted = await transaction.membership.deleteMany({
            where: {
              id: targetMembershipId,
              householdId,
              role: currentTarget.role,
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

    // Guarded, stale-proof ownership transfer inside a Serializable transaction.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        await this.prisma.$transaction(async (transaction) => {
          await transaction.$queryRaw`
            SELECT "id" FROM "households"
            WHERE "id" = ${householdId}::uuid
            FOR UPDATE
          `;
          await transaction.$queryRaw`
            SELECT "id" FROM "memberships"
            WHERE "household_id" = ${householdId}::uuid
              AND ("user_id" = ${actorId}::uuid OR "id" = ${successorMembershipId}::uuid)
            FOR UPDATE
          `;
          const locked = await transaction.household.findUnique({
            where: { id: householdId },
            include: { memberships: true },
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

          const currentActor = locked.memberships.find((membership) => membership.userId === actorId);
          const currentSuccessor = locked.memberships.find((membership) => membership.id === successorMembershipId);
          if (currentActor === undefined || currentSuccessor === undefined) {
            throw new NotFoundException({ code: 'HOUSEHOLD_NOT_FOUND', message: 'Household not found or access denied.' });
          }
          const currentFailure = transferFailure(
            currentActor.id === locked.ownerMembershipId,
            currentSuccessor.id === currentActor.id,
          );
          if (currentFailure === 'NOT_OWNER') {
            throw new ForbiddenException({ code: 'NOT_OWNER', message: '只有家庭所有者可以转移所有权。' });
          }
          if (currentFailure === 'SUCCESSOR_IS_OWNER') {
            throw new BadRequestException({ code: 'SUCCESSOR_IS_OWNER', message: '不能将所有权转移给自己。' });
          }

          // Reset former owner's role to MEMBER (D-10 / D-11).
          const demoted = await transaction.membership.updateMany({
            where: {
              id: currentActor.id,
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
              ownerMembershipId: currentActor.id,
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

  /** Remove the caller's membership and task assignments. Content belongs to the household,
   * not the membership, so events, tasks, notes and their authors remain intact.
   */
  async leaveMembership(actorId: string, householdId: string): Promise<void> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        await this.prisma.$transaction(async (tx) => {
          // Use the same household lock as ownership transfer and member removal.
          await tx.$queryRaw`SELECT "id" FROM "households" WHERE "id" = ${householdId}::uuid FOR UPDATE`;
          const household = await tx.household.findUnique({
            where: { id: householdId }, include: { memberships: { where: { userId: actorId } } },
          });
          const membership = household?.memberships[0];
          if (household === null || membership === undefined) {
            throw new NotFoundException({ code: 'HOUSEHOLD_NOT_FOUND', message: 'Household not found or access denied.' });
          }
          if (household.ownerMembershipId === membership.id) {
            throw new ForbiddenException({ code: 'OWNER_TRANSFER_REQUIRED', message: '请先转让家庭所有权，再离开家庭。' });
          }
          await removeMemberAssignments(tx, householdId, actorId);
          await tx.membership.delete({ where: { id: membership.id } });
        }, { isolationLevel: 'Serializable' });
        return;
      } catch (error) {
        if (this.isSerializationConflict(error) && attempt < 2) continue;
        throw error;
      }
    }
  }

  // ---- Owner leave (D-11, D-12) ----

  /**
   * D-11 atomic owner-leave handoff: selects a successor, moves the owner
   * pointer, deletes the former membership in one Serializable transaction.
   *
   * On success, returns `{ kind: 'completed' }` — the caller was already
   * removed from the household and must not query the household projection.
   * The response status code is 204 (no content).
   *
   * D-12 recovery: the former owner's membership no longer exists in the DB.
   * The client must freeze household actions, clear any cached household
   * state and device persistence for this household, and render the
   * AccessChangedPanel before any further routing.
   */
  async leaveHousehold(
    actorId: string,
    householdId: string,
    successorMembershipId: string,
  ): Promise<{ kind: 'completed' } | { kind: 'not_found' }> {
    // Load household with fresh membership rows.
    const household = await this.prisma.household.findUnique({
      where: { id: householdId },
      include: {
        memberships: {
          include: { user: true },
        },
      },
    });

    if (household === null || household.ownerMembershipId === null) return { kind: 'not_found' };

    // Resolve actor.
    const actorMembership = household.memberships.find((m) => m.userId === actorId);
    if (actorMembership === undefined) return { kind: 'not_found' };

    const actorIsOwner = actorMembership.id === household.ownerMembershipId;

    // Resolve successor — must belong to the same household.
    const successorMembership = household.memberships.find((m) => m.id === successorMembershipId);
    if (successorMembership === undefined) return { kind: 'not_found' };

    const successorIsActor = successorMembership.id === actorMembership.id;
    const otherMemberCount = household.memberships.length - 1;
    const hasOtherMembers = otherMemberCount > 0;

    // Pure policy check (no DB access).
    const policyFailure = leaveFailure(actorIsOwner, successorIsActor, hasOtherMembers);
    if (policyFailure === 'NOT_OWNER') {
      throw new ForbiddenException({
        code: 'NOT_OWNER',
        message: '只有家庭所有者可以离开家庭。',
      });
    }
    if (policyFailure === 'SUCCESSOR_IS_OWNER') {
      throw new BadRequestException({
        code: 'SUCCESSOR_IS_OWNER',
        message: '不能将所有权转移给自己后离开。',
      });
    }
    if (policyFailure === 'LAST_MEMBER') {
      throw new BadRequestException({
        code: 'LAST_MEMBER',
        message: '不能离开家庭，因为你是唯一的成员。',
      });
    }

    // Guarded, stale-proof owner leave inside a Serializable transaction.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        await this.prisma.$transaction(async (transaction) => {
          await transaction.$queryRaw`
            SELECT "id" FROM "households"
            WHERE "id" = ${householdId}::uuid
            FOR UPDATE
          `;
          await transaction.$queryRaw`
            SELECT "id" FROM "memberships"
            WHERE "household_id" = ${householdId}::uuid
              AND ("user_id" = ${actorId}::uuid OR "id" = ${successorMembershipId}::uuid)
            FOR UPDATE
          `;
          const locked = await transaction.household.findUnique({
            where: { id: householdId },
            include: { memberships: true },
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

          const currentActor = locked.memberships.find((membership) => membership.userId === actorId);
          const currentSuccessor = locked.memberships.find((membership) => membership.id === successorMembershipId);
          if (currentActor === undefined || currentSuccessor === undefined) {
            throw new NotFoundException({ code: 'HOUSEHOLD_NOT_FOUND', message: 'Household not found or access denied.' });
          }
          const currentFailure = leaveFailure(
            currentActor.id === locked.ownerMembershipId,
            currentSuccessor.id === currentActor.id,
            locked.memberships.length > 1,
          );
          if (currentFailure === 'NOT_OWNER') {
            throw new ForbiddenException({ code: 'NOT_OWNER', message: '只有家庭所有者可以离开家庭。' });
          }
          if (currentFailure === 'SUCCESSOR_IS_OWNER') {
            throw new BadRequestException({ code: 'SUCCESSOR_IS_OWNER', message: '不能将所有权转移给自己后离开。' });
          }
          if (currentFailure === 'LAST_MEMBER') {
            throw new BadRequestException({ code: 'LAST_MEMBER', message: '不能离开家庭，因为你是唯一的成员。' });
          }

          // Move owner pointer to successor atomically (compare-and-set).
          const transferred = await transaction.household.updateMany({
            where: {
              id: householdId,
              ownerMembershipId: currentActor.id,
            },
            data: { ownerMembershipId: successorMembershipId },
          });

          if (transferred.count !== 1) {
            throw new ConflictException({
              code: 'HOUSEHOLD_OWNER_CHANGED',
              message: '家庭所有权已变更，请刷新后重试。',
            });
          }

          await removeMemberAssignments(transaction, householdId, actorId);

          // Delete the former owner's membership.
          // The deferred composite FK and non-null pointer validate at commit.
          await transaction.membership.delete({
            where: { id: currentActor.id },
          });
        }, { isolationLevel: 'Serializable' });

        // Success — former owner membership is deleted, owner pointer moved.
        return { kind: 'completed' };
      } catch (error) {
        if (this.isSerializationConflict(error) && attempt < 2) continue;
        throw error;
      }
    }

    throw new Error('Unreachable: leaveHousehold retry loop exhausted.');
  }

  private isSerializationConflict(error: unknown): boolean {
    if (typeof error !== 'object' || error === null || !('code' in error)) return false;
    if (error.code === 'P2034') return true;
    // Raw row-lock queries surface PostgreSQL 40001 through the pg adapter,
    // rather than Prisma's model-query P2034 code. Retry the whole transaction.
    if (error.code !== 'P2010' || !('meta' in error)) return false;
    const meta = error.meta;
    if (typeof meta !== 'object' || meta === null || !('driverAdapterError' in meta)) return false;
    const adapter = meta.driverAdapterError;
    if (typeof adapter !== 'object' || adapter === null || !('cause' in adapter)) return false;
    const cause = adapter.cause;
    return typeof cause === 'object' && cause !== null && 'kind' in cause && cause.kind === 'TransactionWriteConflict';
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
