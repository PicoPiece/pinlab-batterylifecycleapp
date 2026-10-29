import type { CapacitorConfig } from "@capacitor/cli";

const remoteServerUrl = process.env.CAPACITOR_SERVER_URL?.trim();

const config: CapacitorConfig = {
  appId: "com.pinlab.batterylifecycle",
  appName: "PinLab Battery Lifecycle",
  webDir: "dist",
  server: remoteServerUrl
    ? { url: remoteServerUrl, cleartext: false }
    : {
        androidScheme: "http",
        hostname: "localhost",
        cleartext: true,
      },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      backgroundColor: "#0b1220",
      showSpinner: false,
    },
    Keyboard: {
      resize: "native",
      resizeOnFullScreen: true,
    },
  },
};

export default config;
