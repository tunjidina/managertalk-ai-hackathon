import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  // Reverse-DNS, lowercase, no hyphens. This is permanent once published
  // to Google Play — it cannot be changed without publishing a new listing.
  appId: 'com.managertalk.app',
  appName: 'ManagerTalk',

  // Create React App outputs here. `npx cap sync` copies the contents of
  // this folder into android/app/src/main/assets/public.
  webDir: 'build',

  server: {
    // Serve the bundled files over https://localhost rather than file://.
    //
    // This is the default in Capacitor 6+ and it MUST stay https for this
    // app: localStorage (sessionPersistence.ts) and Firebase Auth's
    // IndexedDB persistence are both origin-scoped, and a file:// origin
    // is opaque — Firebase treats it as unauthenticated storage and the
    // session is dropped on every launch.
    androidScheme: 'https'
  },

  android: {
    // Google Play requires the release build to be debuggable=false; this
    // keeps the WebView inspectable in debug builds only, so you can
    // attach chrome://inspect while testing.
    webContentsDebuggingEnabled: true,

    // Capacitor's default. Left explicit because the certificate screen
    // relies on normal document scrolling and text selection.
    allowMixedContent: false
  },

  plugins: {
    SplashScreen: {
      // Shown while the WebView boots and React mounts. 2s is enough for a
      // cold start on a mid-range device; launchAutoHide lets Capacitor
      // dismiss it rather than requiring a call from JS.
      launchShowDuration: 2000,
      launchAutoHide: true,
      backgroundColor: '#ffffff',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      splashFullScreen: false,
      splashImmersive: false
    },

    StatusBar: {
      // The app chrome is white with dark text.
      style: 'LIGHT',
      backgroundColor: '#ffffff'
    }
  }
};

export default config;
