const { withEntitlementsPlist } = require('expo/config-plugins');

// expo-notifications always adds the iOS push entitlement, which needs the
// Push Notifications capability on the Apple account. Builds without push
// credentials can still use local notifications.
//
// Mods run in reverse order of registration: listed before expo-notifications
// in app.json, this one runs after it and removes what it added.
module.exports = function withoutPushEntitlement(config) {
  if (process.env.EXPO_PUBLIC_REMINDER_PUSH_ENABLED === 'true') return config;
  return withEntitlementsPlist(config, (config) => {
    delete config.modResults['aps-environment'];
    return config;
  });
};
