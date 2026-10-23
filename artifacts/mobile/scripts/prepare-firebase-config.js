'use strict';

const fs = require('node:fs');
const path = require('node:path');

if (process.env.EAS_BUILD_PLATFORM !== 'android') {
  process.exit(0);
}

const appRoot = path.resolve(__dirname, '..');
const appConfigPath = path.join(appRoot, 'app.json');
const appConfig = JSON.parse(fs.readFileSync(appConfigPath, 'utf8'));
const androidConfig = appConfig.expo && appConfig.expo.android;
const relativeFirebasePath = androidConfig && androidConfig.googleServicesFile;

if (!relativeFirebasePath) {
  throw new Error('Android app config is missing android.googleServicesFile.');
}

const destination = path.resolve(appRoot, relativeFirebasePath);
const configuredSource = process.env.GOOGLE_SERVICES_JSON;
const source = configuredSource ? path.resolve(configuredSource) : destination;

if (!fs.existsSync(source) || !fs.statSync(source).isFile()) {
  throw new Error(
    'Android push setup is incomplete: provide the Firebase file as the EAS file variable GOOGLE_SERVICES_JSON, or place it at artifacts/mobile/google-services.json for a local build.',
  );
}

let firebaseConfig;
try {
  firebaseConfig = JSON.parse(fs.readFileSync(source, 'utf8'));
} catch {
  throw new Error('The Android Firebase configuration file is not valid JSON.');
}

const expectedPackage = androidConfig.package;
const packages = Array.isArray(firebaseConfig.client)
  ? firebaseConfig.client.map((client) => (
      client && client.client_info && client.client_info.android_client_info
        && client.client_info.android_client_info.package_name
    ))
  : [];

if (!packages.includes(expectedPackage)) {
  throw new Error(
    'The Android Firebase configuration does not include this app package ID: ' + expectedPackage + '. Download the file for the matching Firebase Android app.',
  );
}

if (path.resolve(source) !== destination) {
  fs.copyFileSync(source, destination);
}

console.log('Android Firebase configuration is ready for the build.');
