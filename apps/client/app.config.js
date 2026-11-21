module.exports = ({ config }) => {
  if (process.env.EXPO_PUBLIC_REMINDER_PUSH_ENABLED === 'true' && process.env.GOOGLE_SERVICES_JSON) {
    config = { ...config, android: { ...config.android, googleServicesFile: process.env.GOOGLE_SERVICES_JSON } };
  }
  if (process.env.APP_VARIANT !== 'development') return config;

  return {
    ...config,
    name: `${config.name} Dev`,
    scheme: 'muchakucha-zwei-dev',
    android: { ...config.android, package: 'app.muchakucha.zwei.dev' },
    ios: { ...config.ios, bundleIdentifier: 'app.muchakucha.zwei.dev' },
    // Only the development build reaches an API over plain HTTP, on the local
    // network; preview and production use HTTPS, so they keep Android's default
    // of refusing cleartext.
    plugins: [...(config.plugins ?? []), ['expo-build-properties', { android: { usesCleartextTraffic: true } }]],
  };
};
