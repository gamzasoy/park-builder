import { describe, expect, it } from 'vitest';
import { installSteps, platformOf } from '../src/ui/install';

const UA = {
  iphoneSafari: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  iphoneChrome: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.54 Mobile/15E148 Safari/604.1',
  ipad: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  androidChrome: 'Mozilla/5.0 (Linux; Android 14; SM-S918N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
  samsung: 'Mozilla/5.0 (Linux; Android 14; SM-S918N) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36',
  kakaoAndroid: 'Mozilla/5.0 (Linux; Android 14; SM-S918N Build/UP1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/126.0.0.0 Mobile Safari/537.36;KAKAOTALK 2410620',
  kakaoIphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 KAKAOTALK 10.8.5',
  naver: 'Mozilla/5.0 (Linux; Android 14; SM-S918N Build/UP1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/126.0.0.0 Mobile Safari/537.36 NAVER(inapp; search; 2000; 12.6.1)',
  desktop: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
};

describe('install guide', () => {
  it('detects the phone browser to explain the right menu', () => {
    expect(platformOf(UA.iphoneSafari)).toBe('ios-safari');
    expect(platformOf(UA.ipad)).toBe('ios-safari');
    expect(platformOf(UA.iphoneChrome)).toBe('ios-other');
    expect(platformOf(UA.androidChrome)).toBe('android-chrome');
    expect(platformOf(UA.samsung)).toBe('samsung');
    expect(platformOf(UA.desktop)).toBe('other');
  });

  it('asks in-app browsers (KakaoTalk, Naver) to open another browser first', () => {
    for (const ua of [UA.kakaoAndroid, UA.kakaoIphone, UA.naver]) expect(platformOf(ua)).toBe('inapp');
    expect(installSteps('inapp').map(([, t]) => t).join(' ')).toContain('다른 브라우저로 열기');
  });

  it('has steps for every platform', () => {
    for (const p of ['ios-safari', 'ios-other', 'android-chrome', 'samsung', 'inapp', 'other'] as const) {
      expect(installSteps(p).length).toBeGreaterThan(0);
    }
    expect(installSteps('ios-safari').map(([, t]) => t).join(' ')).toContain('홈 화면에 추가');
  });
});
