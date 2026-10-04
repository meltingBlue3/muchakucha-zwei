// Generated from openapi.json. Do not edit.
export interface RegisterDto {
  username: string;
  password: string;
  confirmPassword: string;
  platform: 'native' | 'web';
}

export interface RegistrationAcceptedDto {
  code: 'REGISTRATION_ACCEPTED';
  /** Username registration signs in immediately. */
  accessToken: string;
  /** Native-only refresh credential for username registration. */
  refreshToken?: string;
}

export interface LoginDto {
  username: string;
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
  username: string;
  displayName: string;
  hasHousehold: false;
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
  username: string;
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

/** Invite a registered username. */
export interface SendHouseholdInvitationDto {
  username: string;
}

export interface SendHouseholdInvitationResponseDto {
  code: 'INVITATION_SENT';
  message: string;
  invitationId: string;
}

export interface InboxInvitationDto {
  id: string;
  householdName: string;
  inviterDisplayName: string;
  expiresAt: string;
  createdAt: string;
}

export interface InvitationInboxResponseDto {
  invitations: InboxInvitationDto[];
}

export interface AcceptInvitationDto {
  invitationId: string;
}

export interface InvitationListItemDto {
  id: string;
  username: string;
  status: 'pending' | 'expired' | 'accepted' | 'revoked' | 'declined';
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
  invitationId: string;
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
  recurrence?: RecurrenceDto;
}

export interface UpdateEventDto {
  expectedUpdatedAt: string;
  expectedRuleUpdatedAt?: string;
  labelIds?: string[];

  title?: string;
  description?: string;
  startTime?: string;
  endTime?: string;
  allDay?: boolean;
  location?: string;
  recurrence?: RecurrenceDto;
}

export interface RecurrenceDto {
  freq: string;
  interval?: number;
  byWeekday?: number[];
  startsOn: string;
  endsOn?: string;
  count?: number;
  timezone: string;
  startTimeLocal?: string;
  durationMinutes?: number;
}

export interface RecurrenceResponseDto {
  updatedAt: string;
  id: string;
  freq: string;
  interval: number;
  byWeekday: number[];
  startsOn: string;
  endsOn?: string | null;
  count?: number | null;
  timezone: string;
  materializedThrough?: string | null;
  startTimeLocal?: string | null;
  durationMinutes?: number | null;
}

export type SeriesScope = 'this_only' | 'this_and_following';

export interface UpdateSeriesDto {
  expectedUpdatedAt: string;
  expectedRuleUpdatedAt: string;

  title?: string;
  description?: string;
  status?: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  assigneeIds?: string[];
  labelIds?: string[];
  dueDate?: string;
  startTime?: string;
  endTime?: string;
  allDay?: boolean;
  location?: string;
  recurrence?: RecurrenceDto;
}

/**
 * Rule-level edit body. Carries only `recurrence` on purpose — a rule-level
 * edit has no selected occurrence, so it must not be able to express
 * instance-level intent (title, status, assignees).
 */
export interface UpdateRecurrenceRuleDto {
  expectedUpdatedAt: string;

  recurrence: RecurrenceDto;
}

export interface SeriesMutationResponseDto {
  recurrenceRuleId: string;
}

export interface RecurrenceRuleListItemDto {
  updatedAt: string;
  id: string;
  kind: 'task' | 'event' | null;
  title: string;
  freq: string;
  interval: number;
  byWeekday: number[];
  startsOn: string;
  endsOn: string | null;
  count: number | null;
  timezone: string;
  startTimeLocal: string | null;
  durationMinutes: number | null;
  nextOccurrenceDate: string | null;
}

export interface RecurrenceRuleListResponseDto {
  rules: RecurrenceRuleListItemDto[];
  total: number;
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
  recurrenceRuleId?: string | null;
  occurrenceDate?: string | null;
  cancelledAt?: string | null;
  recurrence?: RecurrenceResponseDto | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  labels: LabelResponseDto[];
}

export interface EventListResponseDto {
  events: EventResponseDto[];
  total: number;
  materializedThrough?: string | null;
}

export interface CreateTaskDto {
  title: string;
  description?: string;
  status?: string;
  priority?: string;
  assigneeIds?: string[];
  dueDate?: string;
  recurrence?: RecurrenceDto;
}

export interface UpdateTaskDto {
  expectedUpdatedAt: string;
  expectedRuleUpdatedAt?: string;
  labelIds?: string[];

  title?: string;
  description?: string;
  status?: string;
  priority?: string;
  assigneeIds?: string[];
  dueDate?: string;
  recurrence?: RecurrenceDto;
}

export interface TaskResponseDto {
  id: string;
  householdId: string;
  title: string;
  description?: string | null;
  status: string;
  priority: string;
  assigneeIds: string[];
  dueDate?: string | null;
  recurrenceRuleId?: string | null;
  occurrenceDate?: string | null;
  recurrence?: RecurrenceResponseDto | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  labels: LabelResponseDto[];
}

export interface TaskListResponseDto {
  tasks: TaskResponseDto[];
  total: number;
  materializedThrough?: string | null;
}

export interface CreateNoteDto {
  title: string;
  body?: string;
}

export interface UpdateNoteDto {
  expectedUpdatedAt: string;

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

export interface CreateAssistantProviderDto {
  name: string;
  protocol: 'openai-compatible' | 'anthropic';
  baseUrl: string;
  model: string;
  visibility: 'private' | 'household';
  apiKey: string;
}
export interface UpdateAssistantProviderDto extends Partial<CreateAssistantProviderDto> {
  expectedUpdatedAt: string;
}
export interface AssistantProviderResponseDto {
  id: string;
  name: string;
  protocol: 'openai-compatible' | 'anthropic';
  baseUrl: string;
  model: string;
  visibility: 'private' | 'household';
  ownedByMe: boolean;
  hasCredential: boolean;
  updatedAt: string;
}
export interface AssistantProviderListResponseDto { providers: AssistantProviderResponseDto[] }
export interface CreateAssistantConversationDto { providerId: string }
export interface SendAssistantMessageDto { message: string; timeZone: string; expectedVersion: number }
export interface DecideAssistantActionDto { approve: boolean; expectedVersion: number }
export interface AssistantVisibleMessageDto { role: 'user' | 'assistant' | 'tool'; content: string }
export interface AssistantPendingActionDto { name: string; arguments: Record<string, unknown> }
export interface AssistantConversationSummaryDto { id: string; title: string; updatedAt: string }
export interface AssistantConversationListResponseDto { conversations: AssistantConversationSummaryDto[] }
export interface AssistantConversationResponseDto extends AssistantConversationSummaryDto {
  providerId: string | null;
  version: number;
  state: 'idle' | 'running';
  messages: AssistantVisibleMessageDto[];
  pendingAction: AssistantPendingActionDto | null;
}
