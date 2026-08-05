import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { useHouseholdContext } from '../../src/features/households/household-context';
import { AuthShell, Button, Heading, Spinner, Stack, Text } from '../../src/ui/primitives';

export default function HouseholdHandoffRoute() {
  const router = useRouter();
  const { viewState, households, currentHouseholdId } = useHouseholdContext();

  // Auto-redirect to the current household detail when user already has households.
  useEffect(() => {
    if (viewState === 'ready' && households.length > 0 && currentHouseholdId !== null) {
      void router.replace(`/households/${encodeURIComponent(currentHouseholdId)}`);
    }
  }, [viewState, households.length, currentHouseholdId, router]);

  // Show loading spinner while resolving.
  if (viewState === 'resolving') {
    return (
      <AuthShell>
        <Stack accessibilityLabel="正在加载家庭" gap={6} style={{ alignItems: 'center', paddingTop: 48 }}>
          <Spinner label="正在加载家庭" />
          <Text variant="bodySm">正在检查你的家庭</Text>
        </Stack>
      </AuthShell>
    );
  }

  // Offline but has cached data — redirect to list.
  if (viewState === 'offlineRetained') {
    void router.replace('/households');
    return null;
  }

  // Only show dual-entry when user genuinely has no households.
  return (
    <AuthShell>
      <Stack gap={6}>
        <Stack gap={2}>
          <Heading>开始设置你的家庭</Heading>
          <Text>创建一个新家庭，或使用家人发来的邀请链接加入。</Text>
        </Stack>
        <Stack gap={4}>
          <Button
            label="创建家庭"
            onPress={() => void router.push('/households/new')}
          />
          <Button
            label="我有邀请链接"
            onPress={() => void router.push('/invite')}
          />
        </Stack>
      </Stack>
    </AuthShell>
  );
}
