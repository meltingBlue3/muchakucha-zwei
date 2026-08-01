import { useLocalSearchParams } from 'expo-router';
import { Linking } from 'react-native';

import { AuthShell, Button, Heading, Stack, Text } from '../../src/ui/primitives';

export default function VerifyPendingRoute() {
  const { email } = useLocalSearchParams<{ email?: string }>();
  const deliveryAddress = typeof email === 'string' ? email : '';

  return (
    <AuthShell>
      <Stack gap={6}>
        <Stack gap={2}>
          <Heading>去邮箱完成验证</Heading>
          <Text>我们已向 {deliveryAddress} 发送验证链接。打开邮件后即可继续。</Text>
        </Stack>
        <Button
          label="打开邮箱"
          onPress={() => {
            void Linking.openURL('mailto:');
          }}
        />
        <Text variant="bodySm">没有收到邮件？稍后可重新发送。</Text>
      </Stack>
    </AuthShell>
  );
}
