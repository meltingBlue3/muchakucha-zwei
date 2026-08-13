// Generated from openapi.json. Do not edit.
import type {
  RegisterDto,
  RegistrationAcceptedDto,
  CompleteEmailVerificationDto,
  CompleteEmailVerificationResponseDto,
  CreateHouseholdDto,
  CreateHouseholdResponseDto,
  GetHouseholdResponseDto,
  ListMyHouseholdsItemDto,
  LoginDto,
  LoginResponseDto,
  RefreshDto,
  RefreshResponseDto,
  UpdateMeDto,
  CurrentUserDto,
  ResendEmailVerificationDto,
  ResendEmailVerificationResponseDto,
  RequestPasswordResetDto,
  PasswordResetRequestAcceptedDto,
  CompletePasswordResetDto,
  UpdateHouseholdDto,
  SendHouseholdInvitationDto,
  SendHouseholdInvitationResponseDto,
  InvitationPreviewResponseDto,
  AcceptInvitationDto,
  ListInvitationsResponseDto,
  ResendInvitationResponseDto,
  RevokeInvitationResponseDto,
  ChangeMemberRoleDto,
  TransferOwnershipDto,
  LeaveHouseholdDto,
  CreateEventDto,
  UpdateEventDto,
  UpdateSeriesDto,
  SeriesMutationResponseDto,
  SeriesScope,
  EventResponseDto,
  EventListResponseDto,
  CreateTaskDto,
  UpdateTaskDto,
  TaskResponseDto,
  TaskListResponseDto,
  CreateNoteDto,
  UpdateNoteDto,
  NoteResponseDto,
  NoteListResponseDto,
  CreateLabelDto,
  UpdateLabelDto,
  LabelResponseDto,
  LabelListResponseDto,
  TagEntitiesDto,
  RecurrenceRuleListItemDto,
  RecurrenceRuleListResponseDto,
  UpdateRecurrenceRuleDto,
} from './models';

export class ApiClientError extends Error {
  constructor(readonly status: number, readonly body: unknown) {
    super(`API request failed with status ${status}.`);
    this.name = 'ApiClientError';
  }
}

export class ApiClient {
  constructor(private readonly baseUrl: string) {}

  async register(body: RegisterDto, signal?: AbortSignal): Promise<RegistrationAcceptedDto> {
    const response = await fetch(`${this.baseUrl}/api/v1/auth/register`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      ...(signal === undefined ? {} : { signal }),
    });
    const payload: unknown = await response.json();
    if (!response.ok) {
      throw new ApiClientError(response.status, payload);
    }
    return payload as RegistrationAcceptedDto;
  }

  async login(body: LoginDto, signal?: AbortSignal): Promise<LoginResponseDto> {
    return this.post('/api/v1/auth/login', body, signal);
  }

  async refresh(body: RefreshDto = {}, signal?: AbortSignal): Promise<RefreshResponseDto> {
    return this.post('/api/v1/auth/refresh', body, signal);
  }

  async logout(accessToken: string, signal?: AbortSignal): Promise<void> {
    await this.authenticated<void>('POST', '/api/v1/auth/logout', accessToken, undefined, signal);
  }

  async getMe(accessToken: string, signal?: AbortSignal): Promise<CurrentUserDto> {
    return this.authenticated<CurrentUserDto>('GET', '/api/v1/users/me', accessToken, undefined, signal);
  }

  async updateMe(
    accessToken: string,
    body: UpdateMeDto,
    signal?: AbortSignal,
  ): Promise<CurrentUserDto> {
    return this.authenticated<CurrentUserDto>('PATCH', '/api/v1/users/me', accessToken, body, signal);
  }

  async completeEmailVerification(
    body: CompleteEmailVerificationDto,
    signal?: AbortSignal,
  ): Promise<CompleteEmailVerificationResponseDto> {
    return this.post('/api/v1/auth/email-verifications/complete', body, signal);
  }

  async resendEmailVerification(
    body: ResendEmailVerificationDto,
    signal?: AbortSignal,
  ): Promise<ResendEmailVerificationResponseDto> {
    return this.post('/api/v1/auth/email-verifications/resend', body, signal);
  }

  async requestPasswordReset(
    body: RequestPasswordResetDto,
    signal?: AbortSignal,
  ): Promise<PasswordResetRequestAcceptedDto> {
    return this.post('/api/v1/auth/password-reset/request', body, signal);
  }

  async completePasswordReset(body: CompletePasswordResetDto, signal?: AbortSignal): Promise<void> {
    const response = await fetch(
      `${this.baseUrl}/api/v1/auth/password-reset/complete`,
      {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        ...(signal === undefined ? {} : { signal }),
      },
    );
    if (!response.ok) {
      const text = await response.text();
      throw new ApiClientError(response.status, text === '' ? undefined : JSON.parse(text));
    }
  }

  async createHousehold(
    accessToken: string,
    body: CreateHouseholdDto,
    signal?: AbortSignal,
  ): Promise<CreateHouseholdResponseDto> {
    return this.authenticated<CreateHouseholdResponseDto>(
      'POST',
      '/api/v1/households',
      accessToken,
      body,
      signal,
    );
  }

  async listMyHouseholds(
    accessToken: string,
    signal?: AbortSignal,
  ): Promise<ListMyHouseholdsItemDto[]> {
    return this.authenticated<ListMyHouseholdsItemDto[]>(
      'GET',
      '/api/v1/households',
      accessToken,
      undefined,
      signal,
    );
  }

  async getHousehold(
    accessToken: string,
    householdId: string,
    signal?: AbortSignal,
  ): Promise<GetHouseholdResponseDto> {
    return this.authenticated<GetHouseholdResponseDto>(
      'GET',
      `/api/v1/households/${encodeURIComponent(householdId)}`,
      accessToken,
      undefined,
      signal,
    );
  }

  async updateHousehold(
    accessToken: string,
    householdId: string,
    body: UpdateHouseholdDto,
    signal?: AbortSignal,
  ): Promise<GetHouseholdResponseDto> {
    return this.authenticated<GetHouseholdResponseDto>(
      'PATCH',
      `/api/v1/households/${encodeURIComponent(householdId)}`,
      accessToken,
      body,
      signal,
    );
  }

  async sendHouseholdInvitation(
    accessToken: string,
    householdId: string,
    body: SendHouseholdInvitationDto,
    signal?: AbortSignal,
  ): Promise<SendHouseholdInvitationResponseDto> {
    return this.authenticated<SendHouseholdInvitationResponseDto>(
      'POST',
      `/api/v1/households/${encodeURIComponent(householdId)}/invitations`,
      accessToken,
      body,
      signal,
    );
  }

  async previewInvitation(token: string, signal?: AbortSignal): Promise<InvitationPreviewResponseDto> {
    const response = await fetch(
      `${this.baseUrl}/api/v1/households/invitations/preview?token=${encodeURIComponent(token)}`,
      {
        method: 'GET',
        credentials: 'include',
        ...(signal === undefined ? {} : { signal }),
      },
    );
    const payload: unknown = await response.json();
    if (!response.ok) {
      throw new ApiClientError(response.status, payload);
    }
    return payload as InvitationPreviewResponseDto;
  }

  async acceptInvitation(
    accessToken: string,
    body: AcceptInvitationDto,
    signal?: AbortSignal,
  ): Promise<GetHouseholdResponseDto> {
    return this.authenticated<GetHouseholdResponseDto>(
      'POST',
      '/api/v1/households/invitations/accept',
      accessToken,
      body,
      signal,
    );
  }

  async listInvitations(
    accessToken: string,
    householdId: string,
    signal?: AbortSignal,
  ): Promise<ListInvitationsResponseDto> {
    return this.authenticated<ListInvitationsResponseDto>(
      'GET',
      `/api/v1/households/${encodeURIComponent(householdId)}/invitations`,
      accessToken,
      undefined,
      signal,
    );
  }

  async resendInvitation(
    accessToken: string,
    householdId: string,
    invitationId: string,
    signal?: AbortSignal,
  ): Promise<ResendInvitationResponseDto> {
    return this.authenticated<ResendInvitationResponseDto>(
      'POST',
      `/api/v1/households/${encodeURIComponent(householdId)}/invitations/${encodeURIComponent(invitationId)}/resend`,
      accessToken,
      undefined,
      signal,
    );
  }

  async revokeInvitation(
    accessToken: string,
    householdId: string,
    invitationId: string,
    signal?: AbortSignal,
  ): Promise<RevokeInvitationResponseDto> {
    return this.authenticated<RevokeInvitationResponseDto>(
      'POST',
      `/api/v1/households/${encodeURIComponent(householdId)}/invitations/${encodeURIComponent(invitationId)}/revoke`,
      accessToken,
      undefined,
      signal,
    );
  }

  async changeMemberRole(
    accessToken: string,
    householdId: string,
    membershipId: string,
    body: ChangeMemberRoleDto,
    signal?: AbortSignal,
  ): Promise<GetHouseholdResponseDto> {
    return this.authenticated<GetHouseholdResponseDto>(
      'PATCH',
      `/api/v1/households/${encodeURIComponent(householdId)}/members/${encodeURIComponent(membershipId)}/role`,
      accessToken,
      body,
      signal,
    );
  }

  async removeMember(
    accessToken: string,
    householdId: string,
    membershipId: string,
    signal?: AbortSignal,
  ): Promise<GetHouseholdResponseDto> {
    return this.authenticated<GetHouseholdResponseDto>(
      'DELETE',
      `/api/v1/households/${encodeURIComponent(householdId)}/members/${encodeURIComponent(membershipId)}`,
      accessToken,
      undefined,
      signal,
    );
  }

  async transferOwnership(
    accessToken: string,
    householdId: string,
    body: TransferOwnershipDto,
    signal?: AbortSignal,
  ): Promise<GetHouseholdResponseDto> {
    return this.authenticated<GetHouseholdResponseDto>(
      'POST',
      `/api/v1/households/${encodeURIComponent(householdId)}/ownership/transfer`,
      accessToken,
      body,
      signal,
    );
  }

  async leaveHousehold(
    accessToken: string,
    householdId: string,
    body: LeaveHouseholdDto,
    signal?: AbortSignal,
  ): Promise<void> {
    return this.authenticated<void>(
      'POST',
      `/api/v1/households/${encodeURIComponent(householdId)}/ownership/leave`,
      accessToken,
      body,
      signal,
    );
  }

  async createEvent(
    accessToken: string,
    householdId: string,
    body: CreateEventDto,
    signal?: AbortSignal,
  ): Promise<EventResponseDto> {
    return this.authenticated<EventResponseDto>(
      'POST',
      `/api/v1/households/${encodeURIComponent(householdId)}/events`,
      accessToken,
      body,
      signal,
    );
  }

  async listEvents(
    accessToken: string,
    householdId: string,
    startDate?: string,
    endDate?: string,
    recurring?: boolean,
    signal?: AbortSignal,
  ): Promise<EventListResponseDto> {
    const params = new URLSearchParams();
    if (startDate) params.set('startDate', startDate);
    if (endDate) params.set('endDate', endDate);
    if (recurring !== undefined) params.set('recurring', recurring ? 'true' : 'false');
    const qs = params.toString();
    return this.authenticated<EventListResponseDto>(
      'GET',
      `/api/v1/households/${encodeURIComponent(householdId)}/events${qs ? `?${qs}` : ''}`,
      accessToken,
      undefined,
      signal,
    );
  }

  async getEvent(
    accessToken: string,
    householdId: string,
    eventId: string,
    signal?: AbortSignal,
  ): Promise<EventResponseDto> {
    return this.authenticated<EventResponseDto>(
      'GET',
      `/api/v1/households/${encodeURIComponent(householdId)}/events/${encodeURIComponent(eventId)}`,
      accessToken,
      undefined,
      signal,
    );
  }

  async updateEvent(
    accessToken: string,
    householdId: string,
    eventId: string,
    body: UpdateEventDto,
    signal?: AbortSignal,
  ): Promise<EventResponseDto> {
    return this.authenticated<EventResponseDto>(
      'PUT',
      `/api/v1/households/${encodeURIComponent(householdId)}/events/${encodeURIComponent(eventId)}`,
      accessToken,
      body,
      signal,
    );
  }

  async deleteEvent(
    accessToken: string,
    householdId: string,
    eventId: string,
    signal?: AbortSignal,
  ): Promise<void> {
    return this.authenticated<void>(
      'DELETE',
      `/api/v1/households/${encodeURIComponent(householdId)}/events/${encodeURIComponent(eventId)}`,
      accessToken,
      undefined,
      signal,
    );
  }

  async updateEventSeries(
    accessToken: string,
    householdId: string,
    eventId: string,
    body: UpdateSeriesDto,
    signal?: AbortSignal,
  ): Promise<SeriesMutationResponseDto> {
    return this.authenticated<SeriesMutationResponseDto>(
      'PUT',
      `/api/v1/households/${encodeURIComponent(householdId)}/events/${encodeURIComponent(eventId)}/series`,
      accessToken,
      body,
      signal,
    );
  }

  async deleteEventSeries(
    accessToken: string,
    householdId: string,
    eventId: string,
    scope: SeriesScope,
    signal?: AbortSignal,
  ): Promise<void> {
    return this.authenticated<void>(
      'DELETE',
      `/api/v1/households/${encodeURIComponent(householdId)}/events/${encodeURIComponent(eventId)}/series?scope=${encodeURIComponent(scope)}`,
      accessToken,
      undefined,
      signal,
    );
  }

  async createTask(
    accessToken: string,
    householdId: string,
    body: CreateTaskDto,
    signal?: AbortSignal,
  ): Promise<TaskResponseDto> {
    return this.authenticated<TaskResponseDto>(
      'POST',
      `/api/v1/households/${encodeURIComponent(householdId)}/tasks`,
      accessToken,
      body,
      signal,
    );
  }

  async listTasks(
    accessToken: string,
    householdId: string,
    status?: string,
    priority?: string,
    assigneeId?: string,
    recurring?: boolean,
    signal?: AbortSignal,
  ): Promise<TaskListResponseDto> {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (priority) params.set('priority', priority);
    if (assigneeId) params.set('assigneeId', assigneeId);
    if (recurring !== undefined) params.set('recurring', recurring ? 'true' : 'false');
    const qs = params.toString();
    return this.authenticated<TaskListResponseDto>(
      'GET',
      `/api/v1/households/${encodeURIComponent(householdId)}/tasks${qs ? '?' + qs : ''}`,
      accessToken,
      undefined,
      signal,
    );
  }

  async getTask(
    accessToken: string,
    householdId: string,
    taskId: string,
    signal?: AbortSignal,
  ): Promise<TaskResponseDto> {
    return this.authenticated<TaskResponseDto>(
      'GET',
      `/api/v1/households/${encodeURIComponent(householdId)}/tasks/${encodeURIComponent(taskId)}`,
      accessToken,
      undefined,
      signal,
    );
  }

  async updateTask(
    accessToken: string,
    householdId: string,
    taskId: string,
    body: UpdateTaskDto,
    signal?: AbortSignal,
  ): Promise<TaskResponseDto> {
    return this.authenticated<TaskResponseDto>(
      'PUT',
      `/api/v1/households/${encodeURIComponent(householdId)}/tasks/${encodeURIComponent(taskId)}`,
      accessToken,
      body,
      signal,
    );
  }

  async deleteTask(
    accessToken: string,
    householdId: string,
    taskId: string,
    signal?: AbortSignal,
  ): Promise<void> {
    return this.authenticated<void>(
      'DELETE',
      `/api/v1/households/${encodeURIComponent(householdId)}/tasks/${encodeURIComponent(taskId)}`,
      accessToken,
      undefined,
      signal,
    );
  }

  async updateTaskSeries(
    accessToken: string,
    householdId: string,
    taskId: string,
    body: UpdateSeriesDto,
    signal?: AbortSignal,
  ): Promise<SeriesMutationResponseDto> {
    return this.authenticated<SeriesMutationResponseDto>(
      'PUT',
      `/api/v1/households/${encodeURIComponent(householdId)}/tasks/${encodeURIComponent(taskId)}/series`,
      accessToken,
      body,
      signal,
    );
  }

  async deleteTaskSeries(
    accessToken: string,
    householdId: string,
    taskId: string,
    scope: SeriesScope,
    signal?: AbortSignal,
  ): Promise<void> {
    return this.authenticated<void>(
      'DELETE',
      `/api/v1/households/${encodeURIComponent(householdId)}/tasks/${encodeURIComponent(taskId)}/series?scope=${encodeURIComponent(scope)}`,
      accessToken,
      undefined,
      signal,
    );
  }

  // ---- Notes ----

  async createNote(
    accessToken: string,
    householdId: string,
    body: CreateNoteDto,
    signal?: AbortSignal,
  ): Promise<NoteResponseDto> {
    return this.authenticated<NoteResponseDto>(
      'POST',
      `/api/v1/households/${encodeURIComponent(householdId)}/notes`,
      accessToken,
      body,
      signal,
    );
  }

  async listNotes(
    accessToken: string,
    householdId: string,
    signal?: AbortSignal,
  ): Promise<NoteListResponseDto> {
    return this.authenticated<NoteListResponseDto>(
      'GET',
      `/api/v1/households/${encodeURIComponent(householdId)}/notes`,
      accessToken,
      undefined,
      signal,
    );
  }

  async getNote(
    accessToken: string,
    householdId: string,
    noteId: string,
    signal?: AbortSignal,
  ): Promise<NoteResponseDto> {
    return this.authenticated<NoteResponseDto>(
      'GET',
      `/api/v1/households/${encodeURIComponent(householdId)}/notes/${encodeURIComponent(noteId)}`,
      accessToken,
      undefined,
      signal,
    );
  }

  async updateNote(
    accessToken: string,
    householdId: string,
    noteId: string,
    body: UpdateNoteDto,
    signal?: AbortSignal,
  ): Promise<NoteResponseDto> {
    return this.authenticated<NoteResponseDto>(
      'PUT',
      `/api/v1/households/${encodeURIComponent(householdId)}/notes/${encodeURIComponent(noteId)}`,
      accessToken,
      body,
      signal,
    );
  }

  async deleteNote(
    accessToken: string,
    householdId: string,
    noteId: string,
    signal?: AbortSignal,
  ): Promise<void> {
    return this.authenticated<void>(
      'DELETE',
      `/api/v1/households/${encodeURIComponent(householdId)}/notes/${encodeURIComponent(noteId)}`,
      accessToken,
      undefined,
      signal,
    );
  }

  // ---- Labels ----

  async createLabel(
    accessToken: string,
    householdId: string,
    body: CreateLabelDto,
    signal?: AbortSignal,
  ): Promise<LabelResponseDto> {
    return this.authenticated<LabelResponseDto>(
      'POST',
      `/api/v1/households/${encodeURIComponent(householdId)}/labels`,
      accessToken,
      body,
      signal,
    );
  }

  async listLabels(
    accessToken: string,
    householdId: string,
    signal?: AbortSignal,
  ): Promise<LabelListResponseDto> {
    return this.authenticated<LabelListResponseDto>(
      'GET',
      `/api/v1/households/${encodeURIComponent(householdId)}/labels`,
      accessToken,
      undefined,
      signal,
    );
  }

  async updateLabel(
    accessToken: string,
    householdId: string,
    labelId: string,
    body: UpdateLabelDto,
    signal?: AbortSignal,
  ): Promise<LabelResponseDto> {
    return this.authenticated<LabelResponseDto>(
      'PUT',
      `/api/v1/households/${encodeURIComponent(householdId)}/labels/${encodeURIComponent(labelId)}`,
      accessToken,
      body,
      signal,
    );
  }

  async deleteLabel(
    accessToken: string,
    householdId: string,
    labelId: string,
    signal?: AbortSignal,
  ): Promise<void> {
    return this.authenticated<void>(
      'DELETE',
      `/api/v1/households/${encodeURIComponent(householdId)}/labels/${encodeURIComponent(labelId)}`,
      accessToken,
      undefined,
      signal,
    );
  }

  // ---- Tag / Untag ----

  async tagEvent(
    accessToken: string,
    householdId: string,
    eventId: string,
    body: TagEntitiesDto,
    signal?: AbortSignal,
  ): Promise<void> {
    return this.authenticated<void>(
      'POST',
      `/api/v1/households/${encodeURIComponent(householdId)}/events/${encodeURIComponent(eventId)}/labels`,
      accessToken,
      body,
      signal,
    );
  }

  async untagEvent(
    accessToken: string,
    householdId: string,
    eventId: string,
    labelId: string,
    signal?: AbortSignal,
  ): Promise<void> {
    return this.authenticated<void>(
      'DELETE',
      `/api/v1/households/${encodeURIComponent(householdId)}/events/${encodeURIComponent(eventId)}/labels/${encodeURIComponent(labelId)}`,
      accessToken,
      undefined,
      signal,
    );
  }

  async tagTask(
    accessToken: string,
    householdId: string,
    taskId: string,
    body: TagEntitiesDto,
    signal?: AbortSignal,
  ): Promise<void> {
    return this.authenticated<void>(
      'POST',
      `/api/v1/households/${encodeURIComponent(householdId)}/tasks/${encodeURIComponent(taskId)}/labels`,
      accessToken,
      body,
      signal,
    );
  }

  async untagTask(
    accessToken: string,
    householdId: string,
    taskId: string,
    labelId: string,
    signal?: AbortSignal,
  ): Promise<void> {
    return this.authenticated<void>(
      'DELETE',
      `/api/v1/households/${encodeURIComponent(householdId)}/tasks/${encodeURIComponent(taskId)}/labels/${encodeURIComponent(labelId)}`,
      accessToken,
      undefined,
      signal,
    );
  }

  // ---- Recurrence rules ----

  async listRecurrenceRules(
    accessToken: string,
    householdId: string,
    signal?: AbortSignal,
  ): Promise<RecurrenceRuleListResponseDto> {
    return this.authenticated<RecurrenceRuleListResponseDto>(
      'GET',
      `/api/v1/households/${encodeURIComponent(householdId)}/recurrence-rules`,
      accessToken,
      undefined,
      signal,
    );
  }

  async getRecurrenceRule(
    accessToken: string,
    householdId: string,
    ruleId: string,
    signal?: AbortSignal,
  ): Promise<RecurrenceRuleListItemDto> {
    return this.authenticated<RecurrenceRuleListItemDto>(
      'GET',
      `/api/v1/households/${encodeURIComponent(householdId)}/recurrence-rules/${encodeURIComponent(ruleId)}`,
      accessToken,
      undefined,
      signal,
    );
  }

  async updateRecurrenceRule(
    accessToken: string,
    householdId: string,
    ruleId: string,
    body: UpdateRecurrenceRuleDto,
    signal?: AbortSignal,
  ): Promise<SeriesMutationResponseDto> {
    return this.authenticated<SeriesMutationResponseDto>(
      'PUT',
      `/api/v1/households/${encodeURIComponent(householdId)}/recurrence-rules/${encodeURIComponent(ruleId)}`,
      accessToken,
      body,
      signal,
    );
  }

  async endRecurrenceRule(
    accessToken: string,
    householdId: string,
    ruleId: string,
    signal?: AbortSignal,
  ): Promise<void> {
    return this.authenticated<void>(
      'POST',
      `/api/v1/households/${encodeURIComponent(householdId)}/recurrence-rules/${encodeURIComponent(ruleId)}/end`,
      accessToken,
      undefined,
      signal,
    );
  }

  private async post<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      ...(signal === undefined ? {} : { signal }),
    });
    const payload: unknown = await response.json();
    if (!response.ok) {
      throw new ApiClientError(response.status, payload);
    }
    return payload as T;
  }

  private async authenticated<T>(
    method: 'GET' | 'PATCH' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    accessToken: string,
    body?: unknown,
    signal?: AbortSignal,
  ): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      credentials: 'include',
      headers: {
        authorization: `Bearer ${accessToken}`,
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      ...(signal === undefined ? {} : { signal }),
    });
    const text = await response.text();
    const payload: unknown = text === '' ? undefined : JSON.parse(text);
    if (!response.ok) {
      throw new ApiClientError(response.status, payload);
    }
    return payload as T;
  }
}
