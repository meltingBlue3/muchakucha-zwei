import type {
  CompleteEmailVerificationDto,
  CompleteEmailVerificationResponseDto,
  ResendEmailVerificationDto,
  ResendEmailVerificationResponseDto,
  VerificationOutcome,
} from '@muchakucha/api-client';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import type { PendingProofStore } from '../../platform/session/pending-proof';
import type { SessionTransport } from '../../platform/session/session-transport';
import {
  Banner,
  Button,
  Heading,
  LinkText,
  Stack,
  StatusPanel,
  Text,
} from '../../ui/primitives';
import type { SessionStateStore } from './session-state';

export interface VerificationApi {
  completeEmailVerification(
    body: CompleteEmailVerificationDto,
    signal?: AbortSignal,
  ): Promise<CompleteEmailVerificationResponseDto>;
  resendEmailVerification(
    body: ResendEmailVerificationDto,
    signal?: AbortSignal,
  ): Promise<ResendEmailVerificationResponseDto>;
}

type VerificationPlatform = 'native' | 'web';

type VerificationFlowProps = {
  apiClient: VerificationApi;
  onHouseholdHandoff(): void;
  onLogin(): void;
  pendingProofStore?: PendingProofStore;
  platform: VerificationPlatform;
  sessionStateStore: SessionStateStore;
  sessionTransport: SessionTransport;
  token: string;
};

type ResultState = VerificationOutcome | 'loading' | 'request_failed';

const terminalCopy: Record<
  Exclude<VerificationOutcome, 'verified_auto_login' | 'verified_login_required'>,
  { action: string; body: string; heading: string }
> = {
  expired: {
    action: '重新发送验证邮件',
    body: '这个验证链接已经过期。请重新发送邮件后再试。',
    heading: '验证链接已过期',
  },
  invalid: {
    action: '重新发起验证',
    body: '这个验证链接无效。请从验证等待页重新开始。',
    heading: '无法验证此链接',
  },
  superseded: {
    action: '使用最新邮件',
    body: '这个链接已被更新的验证邮件替代。请打开最新收到的邮件。',
    heading: '请使用最新验证链接',
  },
  used: {
    action: '前往登录',
    body: '这个链接已经使用过，邮箱也已经完成验证。',
    heading: '邮箱已验证',
  },
};

function isInvalidRequest(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'status' in error && error.status === 400;
}

export function VerificationFlow({
  apiClient,
  onHouseholdHandoff,
  onLogin,
  pendingProofStore,
  platform,
  sessionStateStore,
  sessionTransport,
  token,
}: VerificationFlowProps) {
  const [result, setResult] = useState<ResultState>('loading');
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const controller = new AbortController();

    void (async () => {
      try {
        const pendingProof = platform === 'native' ? await pendingProofStore?.read() : undefined;
        const response = await apiClient.completeEmailVerification(
          {
            token,
            ...(platform === 'native' ? { platform: 'native' as const } : {}),
            ...(pendingProof ? { pendingProof } : {}),
          },
          controller.signal,
        );
        if (platform === 'native') await pendingProofStore?.clear();

        if (response.outcome === 'verified_auto_login') {
          const session = await sessionTransport.acceptIssuedSession({
            accessToken: response.accessToken ?? '',
            ...(response.refreshToken === undefined ? {} : { refreshToken: response.refreshToken }),
          });
          sessionStateStore.enterAuthenticated(session);
        }
        setResult(response.outcome);
      } catch (error) {
        if (controller.signal.aborted) return;
        if (isInvalidRequest(error)) {
          if (platform === 'native') await pendingProofStore?.clear();
          setResult('invalid');
        } else {
          setResult('request_failed');
        }
      }
    })();

    return () => controller.abort();
  }, [apiClient, pendingProofStore, platform, sessionStateStore, sessionTransport, token]);

  if (result === 'loading') {
    return (
      <Stack accessibilityLiveRegion="polite" gap={4}>
        <Heading>正在验证邮箱</Heading>
        <Text>请稍候，我们正在安全地完成验证。</Text>
      </Stack>
    );
  }

  if (result === 'request_failed') {
    return (
      <Stack gap={4}>
        <Heading>暂时无法完成验证</Heading>
        <Banner>这次没有完成。请检查网络后重新打开验证邮件。</Banner>
      </Stack>
    );
  }

  if (result === 'verified_auto_login') {
    return (
      <StatusPanel
        action={<Button label="继续" onPress={onHouseholdHandoff} />}
        body="账户已经准备好。接下来可以继续设置家庭。"
        heading="验证成功"
        kind="success"
      />
    );
  }

  if (result === 'verified_login_required') {
    return (
      <StatusPanel
        action={<Button label="前往登录" onPress={onLogin} />}
        body="邮箱已经完成验证。请在这台设备上登录以继续。"
        heading="邮箱已验证"
        kind="success"
      />
    );
  }

  const copy = terminalCopy[result];
  const loginAction = result === 'used';
  return (
    <StatusPanel
      action={
        loginAction ? (
          <Button label={copy.action} onPress={onLogin} />
        ) : (
          <LinkText onPress={onLogin}>{copy.action}</LinkText>
        )
      }
      body={copy.body}
      heading={copy.heading}
      kind={result === 'expired' ? 'expired' : 'offline'}
    />
  );
}

type VerificationLandingProps = VerificationFlowProps & {
  replaceTokenBearingLocation(): void;
};

export function VerificationLanding({
  replaceTokenBearingLocation,
  token,
  ...flowProps
}: VerificationLandingProps) {
  const [sanitizedToken, setSanitizedToken] = useState<string>();
  const sanitized = useRef(false);

  useLayoutEffect(() => {
    if (sanitized.current) return;
    sanitized.current = true;
    replaceTokenBearingLocation();
    setSanitizedToken(token);
  }, [replaceTokenBearingLocation, token]);

  return sanitizedToken ? <VerificationFlow {...flowProps} token={sanitizedToken} /> : null;
}

type VerificationPendingProps = {
  apiClient: Pick<VerificationApi, 'resendEmailVerification'>;
  email: string;
  initialRetryAfterSeconds?: number;
  onOpenEmail(): void;
};

function retryAfterFromError(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null || !('body' in error)) return undefined;
  const body = error.body;
  if (typeof body !== 'object' || body === null || !('error' in body)) return undefined;
  const apiError = body.error;
  if (typeof apiError !== 'object' || apiError === null || !('retryAfterSeconds' in apiError)) {
    return undefined;
  }
  return typeof apiError.retryAfterSeconds === 'number' ? apiError.retryAfterSeconds : undefined;
}

export function VerificationPending({
  apiClient,
  email,
  initialRetryAfterSeconds = 60,
  onOpenEmail,
}: VerificationPendingProps) {
  const [seconds, setSeconds] = useState(initialRetryAfterSeconds);
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState<string>();

  useEffect(() => {
    if (seconds <= 0) return;
    const timer = setInterval(() => setSeconds((current) => Math.max(0, current - 1)), 1_000);
    return () => clearInterval(timer);
  }, [seconds > 0]);

  const resend = async () => {
    if (!email || seconds > 0 || sending) return;
    setSending(true);
    setFeedback(undefined);
    try {
      const response = await apiClient.resendEmailVerification({ email });
      setSeconds(response.retryAfterSeconds);
      setFeedback('验证邮件已重新发送。请查看最新邮件。');
    } catch (error) {
      const retryAfterSeconds = retryAfterFromError(error);
      if (retryAfterSeconds !== undefined) setSeconds(retryAfterSeconds);
      setFeedback(
        retryAfterSeconds === undefined
          ? '这次没有完成。请检查网络后重试。'
          : `请在 ${retryAfterSeconds} 秒后重新发送。`,
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <Stack gap={6}>
      <Stack gap={2}>
        <Heading>去邮箱完成验证</Heading>
        <Text>我们已向 {email} 发送验证链接。打开邮件后即可继续。</Text>
      </Stack>
      <Button label="打开邮箱" onPress={onOpenEmail} />
      {feedback ? (
        <Text accessibilityLiveRegion="polite" variant="bodySm">
          {feedback}
        </Text>
      ) : null}
      <Button
        disabled={!email || seconds > 0}
        label="重新发送验证邮件"
        loading={sending}
        onPress={() => void resend()}
      />
      <Text accessibilityLiveRegion="polite" variant="caption">
        {seconds > 0 ? `${seconds} 秒后可重新发送` : '现在可以重新发送'}
      </Text>
    </Stack>
  );
}
