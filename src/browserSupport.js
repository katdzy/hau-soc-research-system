/**
 * What this browser can do with the installed app and device notifications.
 *
 * Mobile browsers differ more than the APIs suggest:
 *   - iOS: every browser is WebKit, and web notifications exist only in an app
 *     added to the Home Screen, on iOS 16.4 or later. Safari keeps Share under
 *     ••• on newer iPhones; Chrome and Edge have their own Share button.
 *   - In-app browsers (Messenger, Facebook, Instagram, the Google app, Android
 *     WebViews) can neither install nor notify: the page must be opened in
 *     Safari or Chrome first.
 *   - Android: Chrome, Edge and Samsung Internet offer an install prompt;
 *     Firefox and others install from their menu. All of them notify from a tab.
 *
 * The functions here are pure (they read an `env`, never `window`) so each
 * browser can be tested from its user-agent string.
 */

/** The facts the decisions below need, read from the running browser. */
export function currentEnv() {
  if (typeof window === 'undefined') return { ua: '' }
  const nav = window.navigator
  return {
    ua: nav.userAgent ?? '',
    platform: nav.platform ?? '',
    maxTouchPoints: nav.maxTouchPoints ?? 0,
    standalone: window.matchMedia?.('(display-mode: standalone)').matches || nav.standalone === true,
    hasNotification: 'Notification' in window,
    hasServiceWorker: 'serviceWorker' in nav,
  }
}

// In-app browsers name themselves in the user agent; "; wv)" marks an Android WebView.
const IN_APP = /FBAN|FBAV|FB_IAB|FBIOS|Instagram|Messenger|Line\/|MicroMessenger|TikTok|musical_ly|Snapchat|Twitter|LinkedInApp|GSA\/|; wv\)/i

export function browserInfo(env) {
  const ua = env.ua ?? ''
  // iPadOS reports itself as a Mac; touch points tell them apart.
  const ios = /iPad|iPhone|iPod/.test(ua) ||
    (env.platform === 'MacIntel' && (env.maxTouchPoints ?? 0) > 1 && !/Android/.test(ua))
  const android = !ios && /Android/.test(ua)
  // iPadOS in desktop mode reports a Mac version, so its iOS version is unknown (null).
  const v = ios && /iPad|iPhone|iPod/.test(ua) ? ua.match(/OS (\d+)[._](\d+)/) : null
  const iosVersion = v ? { major: Number(v[1]), minor: Number(v[2]) } : null
  const browser =
    /EdgiOS|EdgA|Edg\//.test(ua) ? 'edge'
    : /CriOS/.test(ua) ? 'chrome'
    : /FxiOS|Firefox\//.test(ua) ? 'firefox'
    : /SamsungBrowser/.test(ua) ? 'samsung'
    : /OPiOS|OPR\/|Opera/.test(ua) ? 'opera'
    : /Chrome\//.test(ua) ? 'chrome'
    : /Safari\//.test(ua) ? 'safari'
    : 'other'
  // An iOS in-app browser drops Safari's "Safari/" token, but so does the app
  // opened from the Home Screen, which is why standalone is excluded.
  const inApp = !env.standalone && (IN_APP.test(ua) || (ios && browser === 'other'))
  return { ios, android, iosVersion, browser, inApp, standalone: !!env.standalone }
}

/**
 * Whether notifications can be offered here, before permission is asked:
 * 'ready' | 'in-app' | 'ios-too-old' | 'needs-install' | 'unsupported'.
 */
export function notificationSupport(env) {
  const b = browserInfo(env)
  const v = b.iosVersion
  if (b.inApp) return 'in-app'
  // Apple added web notifications for Home Screen apps in iOS 16.4.
  if (v && (v.major < 16 || (v.major === 16 && v.minor < 4))) return 'ios-too-old'
  if (b.ios && !b.standalone) return 'needs-install'
  return env.hasNotification && env.hasServiceWorker ? 'ready' : 'unsupported'
}

/**
 * How to install when the browser offers no prompt of its own:
 * null (installed, or nothing to say) | 'in-app' | 'ios-safari' | 'ios-other' | 'android-menu'.
 */
export function installHint(env) {
  const b = browserInfo(env)
  if (b.standalone) return null
  if (b.inApp) return 'in-app'
  if (b.ios) return b.browser === 'safari' ? 'ios-safari' : 'ios-other'
  if (b.android) return 'android-menu'
  return null
}
