const { withAndroidStyles } = require('expo/config-plugins');

// The Material 3 date and time pickers (`design: 'material'` in
// @react-native-community/datetimepicker) require the app theme to inherit
// from Theme.Material3; Expo generates an AppCompat theme by default.
const MATERIAL3_THEME = 'Theme.Material3.DayNight.NoActionBar';

module.exports = function withMaterial3Theme(config) {
  return withAndroidStyles(config, (config) => {
    const appTheme = (config.modResults.resources.style ?? []).find((style) => style.$.name === 'AppTheme');
    if (appTheme) appTheme.$.parent = MATERIAL3_THEME;
    return config;
  });
};
