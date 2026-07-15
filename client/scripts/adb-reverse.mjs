import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { delimiter, join } from 'node:path';

const port = process.env.API_PORT || '3000';

const pathCandidates = [
  process.env.ADB,
  process.env.ANDROID_HOME && join(process.env.ANDROID_HOME, 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb'),
  process.env.ANDROID_SDK_ROOT && join(process.env.ANDROID_SDK_ROOT, 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb'),
  process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, 'Android', 'Sdk', 'platform-tools', 'adb.exe'),
  ...(process.env.PATH || '').split(delimiter).map((entry) => join(entry, process.platform === 'win32' ? 'adb.exe' : 'adb')),
].filter(Boolean);

const adb = pathCandidates.find((candidate) => existsSync(candidate));

if (!adb) {
  console.error('ADB not found. Install Android SDK Platform Tools or set ANDROID_HOME/ANDROID_SDK_ROOT.');
  process.exit(1);
}

const devicesOutput = execFileSync(adb, ['devices'], { encoding: 'utf8' });
const devices = devicesOutput
  .split('\n')
  .map((line) => line.trim())
  .filter((line) => line.endsWith('\tdevice'));

if (!devices.length) {
  console.error('No authorized Android device found. Connect a device and accept USB debugging.');
  process.exit(1);
}

execFileSync(adb, ['reverse', `tcp:${port}`, `tcp:${port}`], { stdio: 'pipe' });
console.log(`ADB reverse active: Android 127.0.0.1:${port} -> computer 127.0.0.1:${port}`);
