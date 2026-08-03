import { useRouter } from 'expo-router';
import { AuthShell, Button, Heading, Stack, Text } from '../../src/ui/primitives';

export default function HouseholdHandoffRoute() {
  const router = useRouter();

  return (
    <AuthShell>
      <Stack gap={6}>
        <Stack gap={2}>
          <Heading>开始设置你的家庭</Heading>
          <Text>创建一个新家庭，或接受家人发来的邀请。</Text>
        </Stack>
        <Stack gap={4}>
          <Button
            label="创建家庭"
            onPress={() => void router.push('/households/new')}
          />
          <Button
            label="接受邀请"
            onPress={() => {
              // Phase 2 invitation acceptance — not owned by this plan.
            }}
          />
        </Stack>
      </Stack>
    </AuthShell>
  );
}
