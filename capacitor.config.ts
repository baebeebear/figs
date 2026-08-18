/// <reference types="@codetrix-studio/capacitor-google-auth" />
import type { CapacitorConfig } from '@capacitor/cli';

const GOOGLE_WEB_CLIENT_ID =
  '327999147197-0ub120p3a2galvma9etnc2iurga3fl8d.apps.googleusercontent.com';

const config: CapacitorConfig = {
  appId: 'com.figsapp.figs',
  appName: 'figs',
  webDir: 'dist',
  zoomEnabled: false,
  ios: {
    contentInset: 'never',
    scrollEnabled: true,
  },
  plugins: {
    GoogleAuth: {
      scopes: ['profile', 'email'],
      serverClientId: GOOGLE_WEB_CLIENT_ID,
      clientId: GOOGLE_WEB_CLIENT_ID,
      iosClientId: GOOGLE_WEB_CLIENT_ID,
      forceCodeForRefreshToken: true,
    },
  },
};

export default config;
