import { defineConfig } from '@playwright/test';

const LOCAL_ORIGINS = {
  WEB_ORIGIN: 'http://127.0.0.1:8081',
  API_ORIGIN: 'http://127.0.0.1:3000',
  EMAIL_LINK_ORIGIN: 'http://127.0.0.1:8081',
} as const;

type OriginName = keyof typeof LOCAL_ORIGINS;

function requireOrigin(name: OriginName): string {
  const value = process.env[name] ?? LOCAL_ORIGINS[name];
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be an absolute http(s) origin; received ${JSON.stringify(value)}`);
  }

  if (
    (url.protocol !== 'http:' && url.protocol !== 'https:') ||
    url.username !== '' ||
    url.password !== '' ||
    url.pathname !== '/' ||
    url.search !== '' ||
    url.hash !== '' ||
    url.origin !== value
  ) {
    throw new Error(`${name} must contain only scheme, host, and optional port; received ${JSON.stringify(value)}`);
  }

  return url.origin;
}

const webOrigin = requireOrigin('WEB_ORIGIN');
const apiOrigin = requireOrigin('API_ORIGIN');
const emailLinkOrigin = requireOrigin('EMAIL_LINK_ORIGIN');

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: webOrigin,
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'pnpm --filter api dev',
      url: `${apiOrigin}/api/v1/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        ...process.env,
        WEB_ORIGIN: webOrigin,
        API_ORIGIN: apiOrigin,
        EMAIL_LINK_ORIGIN: emailLinkOrigin,
      },
    },
    {
      command: `pnpm --filter client exec expo start --web --port ${new URL(webOrigin).port || '80'}`,
      url: webOrigin,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        ...process.env,
        CI: '1',
        WEB_ORIGIN: webOrigin,
        API_ORIGIN: apiOrigin,
        EMAIL_LINK_ORIGIN: emailLinkOrigin,
        EXPO_PUBLIC_API_ORIGIN: apiOrigin,
      },
    },
  ],
});
