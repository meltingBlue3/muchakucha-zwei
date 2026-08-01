import { AuthShell, Button, Heading, Stack, Text } from '../../src/ui/primitives';

export default function HouseholdHandoffRoute() {
  return (
    <AuthShell>
      <Stack gap={6}>
        <Stack gap={2}>
          <Heading>账户已准备好</Heading>
          <Text>家庭创建与加入将在下一阶段提供。你的登录状态已经安全保存。</Text>
        </Stack>
        <Button disabled label="继续设置家庭" />
      </Stack>
    </AuthShell>
  );
}
