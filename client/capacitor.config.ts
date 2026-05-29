import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'br.com.farmsteadrental.app',
  appName: 'Farmstead Rental',
  webDir: 'dist/client/browser',
  server: {
    androidScheme: 'https',
  },
};

export default config;
