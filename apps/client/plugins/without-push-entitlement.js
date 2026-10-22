const { withEntitlementsPlist } = require('expo/config-plugins');

// expo-notifications always adds the iOS push entitlement, which needs the
// Push Notifications capability on the Apple account. Reminders are local
// notifications only, so the app does not ask for push.
//
// Mods run in reverse order of registration: listed before expo-notifications
// in app.json, this one runs after it and removes what it added.
module.exports = function withoutPushEntitlement(config) {
  return withEntitlementsPlist(config, (config) => {
    delete config.modResults['aps-environment'];
    return config;
  });
};
