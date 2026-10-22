import { Capacitor, SystemBars, SystemBarsStyle } from '@capacitor/core';

/**
 * Edge-to-edge is mandatory on Android 15+. Capacitor's bundled SystemBars
 * plugin is configured with insetsHandling: "css" (see capacitor.config.json),
 * so the WebView receives real safe-area values on every device. Here we only
 * select dark system-bar icons for the light wort. surface.
 */
export async function initNativeShell() {
  const native = Capacitor.isNativePlatform();
  document.documentElement.classList.toggle('is-native', native);
  document.documentElement.dataset.platform = Capacitor.getPlatform();
  if (!native) return;

  try {
    await SystemBars.setStyle({ style: SystemBarsStyle.Light });
  } catch {
    // Older WebView / Capacitor fallback: CSS env() insets still apply.
  }
}
