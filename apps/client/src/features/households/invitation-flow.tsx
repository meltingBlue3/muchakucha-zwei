import type { GetHouseholdResponseDto, InvitationPreviewResponseDto } from '@muchakucha/api-client';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

import {
  Banner,
  Button,
  Heading,
  LinkText,
  Stack,
  StatusPanel,
  Text,
} from '../../ui/primitives';

export interface InvitationFlowApi {
  previewInvitation(
    token: string,
    signal?: AbortSignal,
  ): Promise<InvitationPreviewResponseDto>;
  acceptInvitation(
    accessToken: string,
    body: { token: string },
    signal?: AbortSignal,
  ): Promise<GetHouseholdResponseDto>;
}

type FlowState =
  | { kind: 'loading' }
  | { kind: 'unauthenticated'; householdName: string; inviterDisplayName: string }
  | { kind: 'matching'; householdName: string; inviterDisplayName: string }
  | { kind: 'mismatch' }
  | { kind: 'terminal'; reason: 'invalid' | 'expired' | 'used' }
  | { kind: 'accepted'; household: GetHouseholdResponseDto }
  | { kind: 'request_failed' };

interface InvitationFlowProps {
  apiClient: InvitationFlowApi;
  accessToken?: string;
  isAuthenticated: boolean;
  onLogin(): void;
  onRegister(): void;
  onSwitchAccount(): void;
  onReset?(): void;
  onEnterHousehold(household: GetHouseholdResponseDto): void;
  token: string;
}

function useInvitationPreview(
  apiClient: InvitationFlowApi,
  token: string,
  isAuthenticated: boolean,
  accessToken: string | undefined,
): { state: FlowState; accept(): void; accepting: boolean; acceptError: boolean; retry(): void } {
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<FlowState>({ kind: 'loading' });
  const [accepting, setAccepting] = useState(false);
  const [acceptError, setAcceptError] = useState(false);

  // Phase 1: preview the invitation
  useEffect(() => {
    const controller = new AbortController();
    setState({ kind: 'loading' });

    void (async () => {
      try {
        const preview = await apiClient.previewInvitation(token, controller.signal);
        if (controller.signal.aborted) return;

        if (preview.kind !== 'valid') {
          setState({ kind: 'terminal', reason: preview.kind as 'invalid' | 'expired' | 'used' });
          return;
        }

        // Authentication can resolve while this request is pending. The effect
        // below applies the latest account state without cancelling the preview.
        setState({
          kind: 'unauthenticated',
          householdName: preview.householdName!,
          inviterDisplayName: preview.inviterDisplayName!,
        });
      } catch (error) {
        if (controller.signal.aborted) return;
        setState({ kind: 'request_failed' });
      }
    })();

    return () => controller.abort();
  }, [apiClient, token, revision]);

  // Re-evaluate authentication transitions: when the user logs in,
  // the unauthenticated preview should transition to matching.
  useEffect(() => {
    if (isAuthenticated && state.kind === 'unauthenticated') {
      setState((current) =>
        current.kind === 'unauthenticated'
          ? {
              kind: 'matching',
              householdName: current.householdName,
              inviterDisplayName: current.inviterDisplayName,
            }
          : current,
      );
    } else if (!isAuthenticated && state.kind === 'matching') {
      setState((current) => current.kind === 'matching'
        ? { ...current, kind: 'unauthenticated' }
        : current);
    }
  }, [isAuthenticated, state.kind]);

  const accept = useCallback(() => {
    if (accepting || !accessToken) return;
    setAccepting(true);
    setAcceptError(false);

    void (async () => {
      try {
        const household = await apiClient.acceptInvitation(accessToken, { token });
        setState({ kind: 'accepted', household });
      } catch (error) {
        // The account must match the invitation recipient.
        if (
          typeof error === 'object' &&
          error !== null &&
          'status' in error &&
          (error as { status: number }).status === 403
        ) {
          setState({ kind: 'mismatch' });
        } else {
          setAcceptError(true);
        }
      } finally {
        setAccepting(false);
      }
    })();
  }, [accepting, accessToken, apiClient, token]);

  return { state, accept, accepting, acceptError, retry: () => setRevision((value) => value + 1) };
}

const terminalCopy: Record<
  'invalid' | 'expired' | 'used',
  { heading: string; body: string }
> = {
  invalid: {
    heading: '无效的邀请链接',
    body: '这个邀请无效或已失效。请联系家庭管理员重新发送。',
  },
  expired: {
    heading: '邀请链接已过期',
    body: '这个邀请已过期。请联系家庭管理员重新发送。',
  },
  used: {
    heading: '邀请已经接受',
    body: '这个邀请已经接受过，不能再次使用。',
  },
};

export function InvitationFlow({
  apiClient,
  accessToken,
  isAuthenticated,
  onLogin,
  onRegister,
  onSwitchAccount,
  onReset,
  onEnterHousehold,
  token,
}: InvitationFlowProps) {
  const { state, accept, accepting, acceptError, retry } = useInvitationPreview(
    apiClient,
    token,
    isAuthenticated,
    accessToken,
  );

  // ---- Loading ----
  if (state.kind === 'loading') {
    return (
      <Stack accessibilityLiveRegion="polite" gap={4}>
        <Heading>正在加载邀请</Heading>
        <Text>请稍候，我们正在检查邀请信息。</Text>
      </Stack>
    );
  }

  // ---- Request failed (network error) ----
  if (state.kind === 'request_failed') {
    return (
      <Stack gap={4}>
        <Heading>暂时无法加载邀请</Heading>
        <Banner>这次没有完成。请检查网络后重试。</Banner>
        <Button label="重试加载邀请" onPress={retry} />
        {onReset ? <LinkText onPress={onReset}>重新输入邀请链接</LinkText> : null}
      </Stack>
    );
  }

  // ---- Terminal: invalid / expired / used ----
  if (state.kind === 'terminal') {
    const copy = terminalCopy[state.reason];
    return (
      <StatusPanel
        action={onReset ? <Button label="重新输入邀请链接" onPress={onReset} /> : null}
        heading={copy.heading}
        body={copy.body}
        kind="offline"
      />
    );
  }

  // ---- Unauthenticated: public preview (D-07) ----
  if (state.kind === 'unauthenticated') {
    return (
      <Stack gap={6}>
        <Stack gap={2}>
          <Heading>加入家庭</Heading>
          <Text>
            <Text variant="button">{state.inviterDisplayName}</Text>
            {' '}邀请你加入「
            <Text variant="button">{state.householdName}</Text>
            」。
          </Text>
        </Stack>

        <Stack gap={2}>
          <Button label="登录并继续" onPress={onLogin} />
          <Button label="创建账户并继续" onPress={onRegister} />
        </Stack>

        <Text variant="caption">
          登录或创建账户后即可接受邀请。
        </Text>
      </Stack>
    );
  }

  // ---- Authenticated & matching: explicit accept (D-07/D-08) ----
  if (state.kind === 'matching') {
    return (
      <Stack gap={6}>
        <Stack gap={2}>
          <Heading>接受邀请</Heading>
          <Text>
            <Text variant="button">{state.inviterDisplayName}</Text>
            {' '}邀请你加入「
            <Text variant="button">{state.householdName}</Text>
            」。
          </Text>
          <Text variant="bodySm" color="inkMuted">
            加入后，你的角色为成员。
          </Text>
        </Stack>

        {acceptError ? (
          <Banner>这次没有完成，当前家庭状态未改变。请重试。</Banner>
        ) : null}

        <Stack gap={2}>
          <Button
            label="接受邀请"
            loading={accepting}
            onPress={() => accept()}
          />
          <LinkText onPress={onSwitchAccount}>
            这不是我的账户
          </LinkText>
        </Stack>
      </Stack>
    );
  }

  // ---- Authenticated & mismatch: account doesn't match ----
  if (state.kind === 'mismatch') {
    return (
      <StatusPanel
        action={<Button label="切换账户" onPress={onSwitchAccount} />}
        body="请切换到受邀账户以接受此邀请。"
        heading="此邀请发给了另一个账户"
        kind="offline"
      />
    );
  }

  // ---- Accepted: enter household ----
  if (state.kind === 'accepted') {
    return (
      <StatusPanel
        action={
          <Button
            label="进入家庭"
            onPress={() => onEnterHousehold(state.household)}
          />
        }
        body={`你已加入「${state.household.name}」。`}
        heading="邀请已接受"
        kind="success"
      />
    );
  }

  // Exhaustive check — should never reach here.
  return null;
}

// ---- Landing wrapper: token sanitization (D-07) ----

interface InvitationLandingProps extends InvitationFlowProps {
  replaceTokenBearingLocation(): void;
}

export function InvitationLanding({
  replaceTokenBearingLocation,
  token,
  ...flowProps
}: InvitationLandingProps) {
  const [sanitizedToken, setSanitizedToken] = useState<string>();
  const sanitized = useRef(false);

  useLayoutEffect(() => {
    if (sanitized.current) return;
    sanitized.current = true;
    // D-07: Immediately sanitize the URL/history to remove the bearer token.
    replaceTokenBearingLocation();
    setSanitizedToken(token);
  }, [replaceTokenBearingLocation, token]);

  return sanitizedToken ? <InvitationFlow {...flowProps} token={sanitizedToken} /> : null;
}
