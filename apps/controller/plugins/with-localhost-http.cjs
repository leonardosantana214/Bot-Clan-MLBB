/* Expo loads local config plugins synchronously as CommonJS. */
/* eslint-disable @typescript-eslint/no-require-imports */
const { withAndroidManifest, withDangerousMod } = require('expo/config-plugins');
const { mkdirSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');

module.exports = function withLocalhostHttp(config) {
  config = withAndroidManifest(config, config => {
    const application = config.modResults.manifest.application[0];
    application.$['android:usesCleartextTraffic'] = 'false';
    application.$['android:networkSecurityConfig'] = '@xml/aero_network_security_config';
    return config;
  });
  return withDangerousMod(config, ['android', async config => {
    const directory = join(config.modRequest.platformProjectRoot, 'app/src/main/res/xml');
    mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, 'aero_network_security_config.xml'), `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
  <base-config cleartextTrafficPermitted="false" />
  <domain-config cleartextTrafficPermitted="true">
    <domain includeSubdomains="false">localhost</domain>
    <domain includeSubdomains="false">127.0.0.1</domain>
  </domain-config>
</network-security-config>
`);
    return config;
  }]);
};
