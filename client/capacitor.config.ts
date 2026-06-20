import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'br.com.farmsteadrental.app',
  appName: 'Farmstead Rental',
  webDir: 'dist/client/browser',
  server: {
    androidScheme: 'http',
  },
  android: {
    allowMixedContent: true,
  },
  plugins: {
    SocialLogin: {
      providers: {
        google: true,
        facebook: false,
        apple: false,
        twitter: false,
      },
      logLevel: 1,
    },
  },
};

export default config;
