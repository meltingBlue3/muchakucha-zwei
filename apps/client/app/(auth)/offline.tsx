import { router } from 'expo-router';

import { AuthShell, Button, StatusPanel } from '../../src/ui/primitives';

export default function OfflineRoute() {
  return (
    <AuthShell>
      <StatusPanel
        action={<Button label="重试连接" onPress={() => router.replace('/' as never)} />}
        body="你的登录状态仍保留。连接网络后重试即可。"
        heading="暂时无法连接"
        kind="offline"
      />
    </AuthShell>
  );
}
