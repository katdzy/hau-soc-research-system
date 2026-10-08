// Device notifications and install guidance per mobile browser (revision
// 2026-10-07). Real user-agent strings, one per browser the team is likely to meet.
import { describe, it, expect } from 'vitest'
import { browserInfo, installHint, notificationSupport } from '../browserSupport.js'

const UA = {
  iosSafari: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1',
  iosHomeScreen: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
  iosChrome: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/138.0.7204.119 Mobile/15E148 Safari/604.1',
  iosEdge: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 EdgiOS/138.3351.83 Mobile/15E148 Safari/605.1.15',
  iosFirefox: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/141.0 Mobile/15E148 Safari/605.1.15',
  iosOld: 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_8 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.6 Mobile/15E148 Safari/604.1',
  ios163: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1',
  ios164: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.4 Mobile/15E148 Safari/604.1',
  iosMessenger: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/MessengerForiOS;FBAV/500.0.0.31.110;FBBV/700000000;FBDV/iPhone15,2;FBMD/iPhone;FBSN/iOS;FBSV/18.5;FBSS/3;FBID/phone;FBLC/en_US;FBOP/5]',
  iosInstagram: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 390.0.0.27.81 (iPhone15,2; iOS 18_5; en_US; en; scale=3.00; 1179x2556; 700000000)',
  iosGoogleApp: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) GSA/380.0.762000000 Mobile/15E148 Safari/604.1',
  iosUnknownWebView: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
  iPadDesktop: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15',
  androidChrome: 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Mobile Safari/537.36',
  androidSamsung: 'Mozilla/5.0 (Linux; Android 14; SAMSUNG SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/28.0 Chrome/130.0.0.0 Mobile Safari/537.36',
  androidFirefox: 'Mozilla/5.0 (Android 14; Mobile; rv:141.0) Gecko/141.0 Firefox/141.0',
  androidEdge: 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Mobile Safari/537.36 EdgA/138.0.0.0',
  androidOpera: 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Mobile Safari/537.36 OPR/90.0.0.0',
  androidWebView: 'Mozilla/5.0 (Linux; Android 14; Pixel 8; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/138.0.0.0 Mobile Safari/537.36',
  androidMessenger: 'Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AP2A.240805.005; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/138.0.0.0 Mobile Safari/537.36 [FB_IAB/Orca-Android;FBAV/500.0.0.31.110;]',
  desktopChrome: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
}

// A full browser: the notification and service worker APIs exist.
const env = (ua, extra = {}) => ({ ua, platform: '', maxTouchPoints: 0, standalone: false, hasNotification: true, hasServiceWorker: true, ...extra })
// iOS Safari in a tab exposes no Notification API; the Home Screen app does.
const iosTab = (ua) => env(ua, { platform: 'iPhone', maxTouchPoints: 5, hasNotification: false })
const iosApp = (ua) => env(ua, { platform: 'iPhone', maxTouchPoints: 5, standalone: true })

describe('notifications per browser', () => {
  it('iOS: only the Home Screen app notifies, from 16.4', () => {
    expect(notificationSupport(iosTab(UA.iosSafari))).toBe('needs-install')
    expect(notificationSupport(iosTab(UA.iosChrome))).toBe('needs-install')
    expect(notificationSupport(iosTab(UA.iosEdge))).toBe('needs-install')
    expect(notificationSupport(iosTab(UA.iosFirefox))).toBe('needs-install')
    expect(notificationSupport(iosApp(UA.iosHomeScreen))).toBe('ready')
    expect(notificationSupport(iosTab(UA.ios164))).toBe('needs-install')
    expect(notificationSupport(iosTab(UA.ios163))).toBe('ios-too-old')
    expect(notificationSupport(iosTab(UA.iosOld))).toBe('ios-too-old')
  })

  it('in-app browsers send people to Safari or Chrome', () => {
    for (const ua of [UA.iosMessenger, UA.iosInstagram, UA.iosGoogleApp, UA.iosUnknownWebView]) {
      expect(notificationSupport(iosTab(ua))).toBe('in-app')
      expect(installHint(iosTab(ua))).toBe('in-app')
    }
    for (const ua of [UA.androidWebView, UA.androidMessenger]) {
      expect(notificationSupport(env(ua))).toBe('in-app')
      expect(installHint(env(ua))).toBe('in-app')
    }
  })

  it('the Home Screen app is never taken for an in-app browser', () => {
    // Both drop the "Safari/" token; only standalone tells them apart.
    expect(browserInfo(iosApp(UA.iosHomeScreen)).inApp).toBe(false)
    expect(browserInfo(iosTab(UA.iosUnknownWebView)).inApp).toBe(true)
  })

  it('Android browsers notify from a tab', () => {
    for (const ua of [UA.androidChrome, UA.androidSamsung, UA.androidFirefox, UA.androidEdge, UA.androidOpera]) {
      expect(notificationSupport(env(ua))).toBe('ready')
    }
  })

  it('a browser without the APIs says so instead of showing nothing', () => {
    expect(notificationSupport(env(UA.androidChrome, { hasServiceWorker: false }))).toBe('unsupported')
    expect(notificationSupport(env(UA.desktopChrome, { hasNotification: false }))).toBe('unsupported')
  })
})

describe('install guidance per browser', () => {
  it('iOS: Safari has its own wording; other iOS browsers get theirs', () => {
    expect(installHint(iosTab(UA.iosSafari))).toBe('ios-safari')
    expect(installHint(iosTab(UA.iosChrome))).toBe('ios-other')
    expect(installHint(iosTab(UA.iosEdge))).toBe('ios-other')
    expect(installHint(iosTab(UA.iosFirefox))).toBe('ios-other')
    expect(installHint(iosApp(UA.iosHomeScreen))).toBe(null)
  })

  it('iPadOS in desktop mode is still iOS', () => {
    const ipad = env(UA.iPadDesktop, { platform: 'MacIntel', maxTouchPoints: 5, hasNotification: false })
    expect(browserInfo(ipad).ios).toBe(true)
    expect(installHint(ipad)).toBe('ios-safari')
    // Its version is not in the user agent: treated as current, not as too old.
    expect(notificationSupport(ipad)).toBe('needs-install')
  })

  it('Android: the browser menu where there is no install prompt', () => {
    for (const ua of [UA.androidChrome, UA.androidSamsung, UA.androidFirefox]) {
      expect(installHint(env(ua))).toBe('android-menu')
    }
    expect(installHint(env(UA.androidChrome, { standalone: true }))).toBe(null)
  })

  it('names the browser', () => {
    expect(browserInfo(env(UA.androidSamsung)).browser).toBe('samsung')
    expect(browserInfo(env(UA.androidEdge)).browser).toBe('edge')
    expect(browserInfo(env(UA.androidOpera)).browser).toBe('opera')
    expect(browserInfo(env(UA.androidFirefox)).browser).toBe('firefox')
    expect(browserInfo(iosTab(UA.iosChrome)).browser).toBe('chrome')
    expect(browserInfo(iosTab(UA.iosSafari)).browser).toBe('safari')
  })

  it('desktop gets no mobile hint', () => {
    expect(installHint(env(UA.desktopChrome))).toBe(null)
    expect(notificationSupport(env(UA.desktopChrome))).toBe('ready')
  })
})
