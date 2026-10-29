import { Capacitor } from "@capacitor/core";
import { App as CapacitorApp } from "@capacitor/app";
import { Keyboard } from "@capacitor/keyboard";
import { SplashScreen } from "@capacitor/splash-screen";
import { StatusBar, Style } from "@capacitor/status-bar";

/**
 * Native-only bridge. On the web these calls are no-ops because Capacitor
 * reports a non-native platform and every plugin is guarded.
 */
export async function initializeMobile(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;

  try {
    await StatusBar.setOverlaysWebView({ overlay: false });
    await StatusBar.setStyle({ style: Style.Light });
    await StatusBar.setBackgroundColor({ color: "#f4f7fa" });
  } catch {
    // Status bar is optional; do not block the app on OEM/WebView differences.
  }

  try {
    await Keyboard.setAccessoryBarVisible({ isVisible: false });
  } catch {
    // Keyboard accessory configuration is iOS-oriented.
  }

  try {
    await SplashScreen.hide();
  } catch {
    // The splash plugin may already have hidden itself.
  }

  try {
    await CapacitorApp.addListener("backButton", ({ canGoBack }) => {
      if (canGoBack || window.history.length > 1) {
        window.history.back();
      } else {
        void CapacitorApp.exitApp();
      }
    });
  } catch {
    // Browser/back-button support is only meaningful on native.
  }
}
