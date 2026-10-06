import { useCallback } from 'react';
import { useRouter } from 'expo-router';
import Settings from 'lucide-react-native/icons/settings';
import type { AssistantProviderUsageDto } from '@muchakucha/api-client';
import { sessionApiClient } from '../auth/session-runtime';
import { AppShell } from '../../ui/household-components';
import { PageIntro } from '../../ui/page-intro';
import { Button, EmptyState, LoadError, LoadingState, Stack, Text } from '../../ui/primitives';
import { SettingsSection } from '../../ui/settings-section';
import { theme } from '../../ui/theme';
import { AssistantBoundary, assistantPath, type AssistantHouseholdProps } from './assistant-boundary';
import { useAssistantQuery } from './assistant-runtime';

/** Token counts in the units people read: 8500 or 3.2 万. */
export function formatTokens(count: number): string {
  return count >= 10_000 ? `${(count / 10_000).toFixed(1).replace(/\.0$/, '')} 万` : String(count);
}

/** What a configuration cost its owner this month, by member. */
export function UsageSummary({ usage }: { usage: AssistantProviderUsageDto }) {
  if (!usage.requests) return <Text variant="caption">本月（UTC）还没有使用。</Text>;
  return <Stack gap={1}>
    <Text variant="caption">本月（UTC）：{usage.requests} 次请求，输入 {formatTokens(usage.inputTokens)}、输出 {formatTokens(usage.outputTokens)} tokens</Text>
    {usage.members.map(member => <Text key={member.userId} variant="caption" color="inkMuted">
      {member.displayName}：{member.requests} 次，{formatTokens(member.inputTokens + member.outputTokens)} tokens
    </Text>)}
  </Stack>;
}

function AssistantProviders({ householdId, householdName, writable }: AssistantHouseholdProps) {
  const router = useRouter();
  const root = assistantPath(householdId);
  const load = useCallback((token: string) => sessionApiClient.listAssistantProviders(token, householdId), [householdId]);
  const query = useAssistantQuery(load);
  return <AppShell title="模型配置" showBack accessibilityLabel="助手模型配置" refreshing={query.loading && query.data !== null} onRefresh={() => { void query.reload(); }}>
    <Stack gap={4}>
      <PageIntro title="模型配置" action={<Button label="添加" accessibilityLabel="添加模型配置" disabled={!writable} onPress={() => router.push(`${root}/providers/new`)} />} />
      <Text variant="bodySm" color="inkMuted">{householdName} · 配置由创建者管理</Text>
      <Text variant="bodySm">家庭可用的配置允许家人调用你的模型并使用你的额度。密钥不会显示给其他成员，也不会随配置返回到客户端。</Text>
      {query.error ? <LoadError message={query.error} retrying={query.loading} onRetry={() => { void query.reload(); }} /> : null}
      {query.loading && query.data === null ? <LoadingState label="正在加载模型配置" /> : null}
      {query.data?.providers.length === 0 ? <EmptyState message="还没有模型配置。添加支持工具调用的模型后即可使用助手。" /> : null}
      {query.data?.providers.map(provider => <SettingsSection key={provider.id} title={provider.name} icon={<Settings color={theme.colors.coral} size={theme.controlSizes.icon} />} detail={provider.ownedByMe ? '由你管理' : '家人共享'}>
        <Text>{provider.model}</Text>
        <Text variant="bodySm" color="inkMuted">{provider.baseUrl}</Text>
        <Text variant="bodySm">{provider.visibility === 'private' ? '仅自己可用' : '本家庭成员可用'} · {provider.hasCredential ? '已配置密钥' : provider.ownedByMe ? '密钥无法读取，请编辑后重新填写' : '密钥无法读取，请联系配置创建者'}</Text>
        {provider.usage ? <UsageSummary usage={provider.usage} /> : null}
        {provider.ownedByMe ? <Stack gap={2}>
          <Button label="编辑" accessibilityLabel={`编辑模型配置：${provider.name}`} tone="secondary" disabled={!writable} onPress={() => router.push(`${root}/providers/${encodeURIComponent(provider.id)}/edit`)} />
          <Button label="删除" accessibilityLabel={`删除模型配置：${provider.name}`} tone="secondary" disabled={!writable} onPress={() => router.push(`${root}/providers/${encodeURIComponent(provider.id)}/delete`)} />
        </Stack> : <Text variant="caption">如需修改，请联系配置创建者。</Text>}
      </SettingsSection>)}
    </Stack>
  </AppShell>;
}

export default function AssistantProvidersScreen() {
  return <AssistantBoundary>{props => <AssistantProviders key={props.householdId} {...props} />}</AssistantBoundary>;
}
