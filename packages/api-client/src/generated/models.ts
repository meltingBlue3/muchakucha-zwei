// Generated from openapi.json. Do not edit.
export interface RegisterDto {
  email: string;
  displayName: string;
  password: string;
  platform: 'native' | 'web';
}

export interface RegistrationAcceptedDto {
  code: 'REGISTRATION_ACCEPTED';
  /** Native-only pending proof. Web responses omit this property. */
  pendingProof?: string;
}

export interface LoginDto {
  email: string;
  password: string;
  platform: 'native' | 'web';
}

export interface LoginResponseDto {
  accessToken: string;
  /** Native-only refresh credential. Web responses omit this property. */
  refreshToken?: string;
}

export interface RefreshDto {
  /** Native-only refresh credential. Web requests omit this property. */
  refreshToken?: string;
}

export interface RefreshResponseDto {
  accessToken: string;
  /** Native-only rotated refresh credential. Web responses omit this property. */
  refreshToken?: string;
}

export interface UpdateMeDto {
  displayName: string;
}

export interface CurrentUserDto {
  id: string;
  email: string;
  displayName: string;
  emailVerified: boolean;
  hasHousehold: false;
}

export interface CompleteEmailVerificationDto {
  token: string;
  platform?: 'native';
  pendingProof?: string;
}

export type VerificationOutcome =
  | 'verified_auto_login'
  | 'verified_login_required'
  | 'expired'
  | 'used'
  | 'invalid'
  | 'superseded';

export interface CompleteEmailVerificationResponseDto {
  outcome: VerificationOutcome;
  accessToken?: string;
  /** Native-only refresh credential. Web responses omit this property. */
  refreshToken?: string;
}

export interface ResendEmailVerificationDto {
  email: string;
}

export interface ResendEmailVerificationResponseDto {
  code: 'RESEND_ACCEPTED';
  retryAfterSeconds: number;
}

export interface RequestPasswordResetDto {
  email: string;
}

export interface PasswordResetRequestAcceptedDto {
  code: 'PASSWORD_RESET_REQUEST_ACCEPTED';
}

export interface CompletePasswordResetDto {
  token: string;
  password: string;
}

export interface CreateHouseholdDto {
  /** 1–40 Unicode code points after trim and NFC normalization. */
  name: string;
}

export interface UpdateHouseholdDto {
  /** 1–40 Unicode code points after trim and NFC normalization. */
  name: string;
}

export interface MembershipResponseDto {
  id: string;
  userId: string;
  householdId: string;
  role: 'ADMIN' | 'MEMBER';
}

export interface CreateHouseholdResponseDto {
  id: string;
  name: string;
  ownerMembershipId: string;
  createdAt: string;
  membership: MembershipResponseDto;
}

export interface ListMyHouseholdsItemDto {
  id: string;
  name: string;
  role: 'OWNER' | 'ADMIN' | 'MEMBER';
  memberCount: number;
  ownerMembershipId: string;
}

export interface GetHouseholdMemberDto {
  membershipId: string;
  userId: string;
  displayName: string;
  email: string;
  role: 'OWNER' | 'ADMIN' | 'MEMBER';
  isCurrentUser: boolean;
}

export interface GetHouseholdResponseDto {
  id: string;
  name: string;
  ownerMembershipId: string;
  createdAt: string;
  members: GetHouseholdMemberDto[];
}

export interface SendHouseholdInvitationDto {
  /** Canonical invited email address. Role is server-fixed to MEMBER per D-05. */
  email: string;
}

export interface SendHouseholdInvitationResponseDto {
  code: 'INVITATION_SENT';
  message: string;
}

export interface InvitationPreviewResponseDto {
  kind: 'valid' | 'invalid' | 'expired' | 'used';
  householdName?: string;
  inviterDisplayName?: string;
  expiresAt?: string;
}

export interface AcceptInvitationDto {
  token: string;
}

export interface InvitationListItemDto {
  id: string;
  emailCanonical: string;
  status: 'pending' | 'expired' | 'accepted' | 'revoked';
  expiresAt: string;
  role: string;
  createdAt: string;
}

export interface ListInvitationsResponseDto {
  invitations: InvitationListItemDto[];
}

export interface ResendInvitationResponseDto {
  code: 'INVITATION_RESENT';
  message: string;
}

export interface RevokeInvitationResponseDto {
  code: 'INVITATION_REVOKED';
  message: string;
}

export interface ChangeMemberRoleDto {
  role: 'ADMIN' | 'MEMBER';
}

export interface TransferOwnershipDto {
  /** Membership ID of the successor who will become the new owner. */
  successorMembershipId: string;
}

export interface LeaveHouseholdDto {
  /** Membership ID of the successor who will become the new owner after the current owner leaves. */
  successorMembershipId: string;
}

export interface CreateEventDto {
  title: string;
  description?: string;
  startTime: string;
  endTime: string;
  allDay?: boolean;
  location?: string;
}

export interface UpdateEventDto {
  title?: string;
  description?: string;
  startTime?: string;
  endTime?: string;
  allDay?: boolean;
  location?: string;
}

export interface EventResponseDto {
  id: string;
  householdId: string;
  title: string;
  description?: string | null;
  startTime: string;
  endTime: string;
  allDay: boolean;
  location?: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  labels: LabelResponseDto[];
}

export interface EventListResponseDto {
  events: EventResponseDto[];
  total: number;
}

export interface CreateTaskDto {
  title: string;
  description?: string;
  status?: string;
  priority?: string;
  assigneeId?: string;
  dueDate?: string;
}

export interface UpdateTaskDto {
  title?: string;
  description?: string;
  status?: string;
  priority?: string;
  assigneeId?: string;
  dueDate?: string;
}

export interface TaskResponseDto {
  id: string;
  householdId: string;
  title: string;
  description?: string | null;
  status: string;
  priority: string;
  assigneeId?: string | null;
  dueDate?: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  labels: LabelResponseDto[];
}

export interface TaskListResponseDto {
  tasks: TaskResponseDto[];
  total: number;
}

export interface CreateNoteDto {
  title: string;
  body?: string;
}

export interface UpdateNoteDto {
  title?: string;
  body?: string;
}

export interface NoteResponseDto {
  id: string;
  householdId: string;
  title: string;
  body?: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface NoteListResponseDto {
  notes: NoteResponseDto[];
  total: number;
}

export interface CreateLabelDto {
  name: string;
  color: string;
}

export interface UpdateLabelDto {
  name?: string;
  color?: string;
}

export interface LabelResponseDto {
  id: string;
  householdId: string;
  name: string;
  color: string;
  createdBy: string;
  createdAt: string;
}

export interface LabelListResponseDto {
  labels: LabelResponseDto[];
  total: number;
}

export interface TagEntitiesDto {
  labelIds: string[];
}
