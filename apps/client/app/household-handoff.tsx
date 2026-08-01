import { AuthShell, Heading, Stack, Text } from '../src/ui/primitives';

export default function HouseholdHandoffRoute() {
  return (
    <AuthShell>
      <Stack gap={4}>
        <Heading>账户已准备好</Heading>
        <Text>家庭创建与加入将在下一步提供。你的登录状态已经安全保存。</Text>
      </Stack>
    </AuthShell>
  );
}
