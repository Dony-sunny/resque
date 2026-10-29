const { withAndroidManifest, withDangerousMod } = require('expo/config-plugins');
const fs = require('node:fs');
const path = require('node:path');

// QR paste and manual landmarks must remain usable on devices without a camera/GPS.
module.exports = function withResQAndroid(config) {
  const hosts = (process.env.RESQ_DEMO_TLS_HOSTS || '').split(',').map(x => x.trim()).filter(Boolean);
  const certificate = process.env.RESQ_DEMO_TLS_CA;
  if (hosts.length && (!certificate || hosts.some(host => !/^(localhost|127\.0\.0\.1|10\.0\.2\.2|192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3})$/.test(host)))) {
    throw new Error('Demo TLS trust requires a public CA certificate and explicit private-network hosts.');
  }
  config = withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;
    const features = manifest['uses-feature'] || [];
    for (const name of ['android.hardware.camera', 'android.hardware.camera.autofocus', 'android.hardware.location.gps']) {
      const feature = features.find((item) => item.$['android:name'] === name);
      if (feature) feature.$['android:required'] = 'false';
      else features.push({ $: { 'android:name': name, 'android:required': 'false' } });
    }
    manifest['uses-feature'] = features;
    const app = manifest.application[0].$;
    app['android:allowBackup'] = 'false';
    if (hosts.length) app['android:networkSecurityConfig'] = '@xml/resq_demo_network_security';
    return config;
  });
  if (hosts.length) config = withDangerousMod(config, ['android', async config => {
    const resources = path.join(config.modRequest.platformProjectRoot, 'app/src/main/res');
    fs.mkdirSync(path.join(resources, 'raw'), { recursive: true });
    fs.mkdirSync(path.join(resources, 'xml'), { recursive: true });
    fs.copyFileSync(certificate, path.join(resources, 'raw/resq_demo_ca.crt'));
    const domains = hosts.map(host => `    <domain includeSubdomains="false">${host}</domain>`).join('\n');
    fs.writeFileSync(path.join(resources, 'xml/resq_demo_network_security.xml'),
      `<?xml version="1.0" encoding="utf-8"?>\n<network-security-config>\n  <base-config cleartextTrafficPermitted="false"><trust-anchors><certificates src="system" /></trust-anchors></base-config>\n  <domain-config cleartextTrafficPermitted="false">\n${domains}\n    <trust-anchors><certificates src="@raw/resq_demo_ca" /><certificates src="system" /></trust-anchors>\n  </domain-config>\n</network-security-config>\n`);
    return config;
  }]);
  return config;
};
