import { router } from 'expo-router';

import { ResetSuccess } from '../../src/features/auth/password-reset-flow';

export default function ResetSuccessRoute() {
  return <ResetSuccess onLogin={() => router.replace('/login' as never)} />;
}
