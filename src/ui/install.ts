/**
 * "앱처럼 설치하기" 안내: 휴대폰 브라우저에서 홈 화면에 추가하는 방법.
 * 안드로이드 크롬처럼 설치 창(beforeinstallprompt)을 띄울 수 있으면 버튼 한 번으로 설치하고,
 * 아니면 브라우저마다 다른 메뉴 위치를 글로 알려 준다.
 */

export type InstallPlatform = 'ios-safari' | 'ios-other' | 'android-chrome' | 'samsung' | 'inapp' | 'other';

/** 앱 안 브라우저(카카오톡·네이버·인스타그램 등)는 홈 화면 추가를 못 하므로 다른 브라우저로 열어야 한다 */
const INAPP = /KAKAOTALK|NAVER\(inapp|Instagram|FBAN|FBAV|Line\/|DaumApps|everytimeApp|; wv\)/i;

export function platformOf(ua: string): InstallPlatform {
  if (INAPP.test(ua)) return 'inapp';
  const ios = /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && /Mobile/i.test(ua));
  if (ios) return /CriOS|FxiOS|EdgiOS|Whale/i.test(ua) ? 'ios-other' : 'ios-safari';
  if (/SamsungBrowser/i.test(ua)) return 'samsung';
  if (/Android/i.test(ua)) return 'android-chrome';
  return 'other';
}

/** 이미 홈 화면 앱으로 실행 중인가 */
export function isStandalone(): boolean {
  try {
    if (matchMedia('(display-mode: fullscreen)').matches || matchMedia('(display-mode: standalone)').matches) return true;
  } catch { /* 지원 안 함 */ }
  return (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

/** 단계별 안내(제목, 설명) */
export function installSteps(p: InstallPlatform): [string, string][] {
  switch (p) {
    case 'ios-safari':
      return [
        ['1단계', '화면 아래(아이패드는 위)의 공유 버튼 ⬆️(네모에서 화살표가 나오는 모양)을 누르세요.'],
        ['2단계', '메뉴를 위로 올려 「홈 화면에 추가」를 누르세요.'],
        ['3단계', '오른쪽 위 「추가」를 누르면 홈 화면에 Park Builder 아이콘이 생겨요.'],
      ];
    case 'ios-other':
      return [
        ['1단계', '주소창 옆의 공유 버튼 ⬆️을 누르세요. (안 보이면 Safari로 열어 주세요)'],
        ['2단계', '「홈 화면에 추가」를 누르세요.'],
        ['3단계', '「추가」를 누르면 홈 화면에 Park Builder 아이콘이 생겨요.'],
      ];
    case 'samsung':
      return [
        ['1단계', '화면 아래의 메뉴 버튼 ☰ 을 누르세요.'],
        ['2단계', '「현재 페이지 추가」 → 「홈 화면」을 누르세요.'],
        ['3단계', '「추가」를 누르면 홈 화면에 Park Builder 아이콘이 생겨요.'],
      ];
    case 'android-chrome':
      return [
        ['1단계', '오른쪽 위의 메뉴 버튼 ⋮ 을 누르세요.'],
        ['2단계', '「앱 설치」 또는 「홈 화면에 추가」를 누르세요.'],
        ['3단계', '「설치」(또는 「추가」)를 누르면 홈 화면에 Park Builder 아이콘이 생겨요.'],
      ];
    case 'inapp':
      return [
        ['1단계', '지금은 앱 안의 브라우저라 홈 화면에 추가할 수 없어요.'],
        ['2단계', '오른쪽 위나 아래의 메뉴(⋮ 또는 ···)에서 「다른 브라우저로 열기」(아이폰은 「Safari로 열기」)를 누르세요.'],
        ['3단계', '열린 브라우저에서 이 안내를 다시 따라 하면 돼요. 「📖 설명」에서 언제든 다시 볼 수 있어요.'],
      ];
    default:
      return [
        ['방법', '브라우저 메뉴에서 「홈 화면에 추가」 또는 「앱 설치」를 찾아 누르세요.'],
      ];
  }
}

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/** 브라우저가 준 설치 창(안드로이드 크롬 등). 받으면 우리 버튼으로 띄운다 */
let deferred: InstallPromptEvent | null = null;
let onInstalled: (() => void) | null = null;

export function watchInstallPrompt(installed: () => void): void {
  onInstalled = installed;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // 브라우저 기본 띠 대신 게임 안 버튼으로 띄운다
    deferred = e as InstallPromptEvent;
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    onInstalled?.();
  });
}

export const canPromptInstall = (): boolean => deferred !== null;

/** 브라우저 설치 창을 띄운다. 설치했으면 true */
export async function promptInstall(): Promise<boolean> {
  const e = deferred;
  if (!e) return false;
  deferred = null; // 한 번 쓴 이벤트는 다시 쓸 수 없다
  try {
    await e.prompt();
    return (await e.userChoice).outcome === 'accepted';
  } catch {
    return false;
  }
}
