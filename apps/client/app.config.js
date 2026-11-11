module.exports = ({ config }) => {
  if (process.env.APP_VARIANT !== 'development') return config;

  return {
    ...config,
    name: `${config.name} Dev`,
    scheme: 'muchakucha-zwei-dev',
    android: { ...config.android, package: 'app.muchakucha.zwei.dev' },
    ios: { ...config.ios, bundleIdentifier: 'app.muchakucha.zwei.dev' },
  };
};
