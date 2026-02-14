import { BrowserWindow, session } from 'electron';
import { saveConfig, loadConfig } from './config.service';

/**
 * Notion Google OAuth 로그인 후 token_v2 자동 추출
 */
export async function loginToNotion(parentWindow: BrowserWindow): Promise<{
  success: boolean;
  tokenV2?: string;
  userId?: string;
  userName?: string;
  error?: string;
}> {
  return new Promise((resolve) => {
    let resolved = false;
    let pollTimer: NodeJS.Timeout | null = null;

    const loginWindow = new BrowserWindow({
      width: 800,
      height: 700,
      parent: parentWindow,
      modal: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
      },
      title: 'Notion 로그인',
      autoHideMenuBar: true,
    });

    loginWindow.loadURL('https://www.notion.so/login');

    // 쿠키 폴링: 모든 notion.so 쿠키를 확인
    pollTimer = setInterval(async () => {
      if (resolved || loginWindow.isDestroyed()) {
        if (pollTimer) clearInterval(pollTimer);
        return;
      }

      try {
        const windowSession = loginWindow.webContents.session;

        // 모든 notion.so 쿠키 가져오기
        const allCookies = await windowSession.cookies.get({
          url: 'https://www.notion.so',
        });

        // 디버그: 쿠키 이름 목록 출력
        const cookieNames = allCookies.map(
          (c) => `${c.name}=${c.value.substring(0, 20)}...`,
        );
        console.log(
          `[Auth] Notion cookies (${allCookies.length}):`,
          cookieNames.join(', '),
        );

        // token_v2 찾기 (다양한 방법)
        let tokenV2 = '';
        const tokenCookie = allCookies.find((c) => c.name === 'token_v2');
        if (tokenCookie && tokenCookie.value) {
          tokenV2 = tokenCookie.value;
        }

        if (!tokenV2) {
          // 혹시 다른 형태의 인증 토큰이 있는지 체크
          const possibleAuthCookies = allCookies.filter(
            (c) =>
              c.name.includes('token') ||
              c.name.includes('session') ||
              c.name.includes('auth'),
          );
          if (possibleAuthCookies.length > 0) {
            console.log(
              '[Auth] 가능한 인증 쿠키:',
              possibleAuthCookies
                .map((c) => `${c.name}(${c.value.length}자)`)
                .join(', '),
            );
          }
        }

        if (tokenV2) {
          console.log('[Auth] ✅ token_v2 발견! 길이:', tokenV2.length);

          // Notion 로드 대기
          await new Promise((r) => setTimeout(r, 2000));

          if (loginWindow.isDestroyed()) {
            if (!resolved) {
              resolved = true;
              saveConfig({ notionTokenV2: tokenV2 });
              resolve({ success: true, tokenV2, userId: '', userName: '' });
            }
            return;
          }

          const userInfo = await extractUserInfo(tokenV2);

          if (!resolved) {
            resolved = true;
            if (pollTimer) clearInterval(pollTimer);

            saveConfig({
              notionTokenV2: tokenV2,
              notionUserId: userInfo.userId,
              notionUserName: userInfo.userName,
            });

            if (!loginWindow.isDestroyed()) {
              loginWindow.close();
            }

            resolve({
              success: true,
              tokenV2,
              userId: userInfo.userId,
              userName: userInfo.userName,
            });
          }
        }
      } catch (error: any) {
        if (!error.message?.includes('destroyed')) {
          console.error('[Auth] 폴링 에러:', error.message);
        }
        if (error.message?.includes('destroyed') && pollTimer) {
          clearInterval(pollTimer);
        }
      }
    }, 2000);

    loginWindow.on('closed', () => {
      if (pollTimer) clearInterval(pollTimer);
      if (!resolved) {
        resolved = true;
        resolve({ success: false, error: '로그인이 취소되었습니다.' });
      }
    });
  });
}

/**
 * 로그인된 유저 정보 추출 — Notion API 사용
 */
async function extractUserInfo(
  tokenV2: string,
): Promise<{ userId: string; userName: string }> {
  try {
    console.log('[Auth] Notion API로 유저 정보 조회...');
    const response = await fetch('https://www.notion.so/api/v3/getSpaces', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `token_v2=${tokenV2}`,
      },
      body: JSON.stringify({}),
    });

    if (!response.ok) {
      console.log(`[Auth] getSpaces 실패: ${response.status}`);
      return { userId: '', userName: '' };
    }

    const data = await response.json();

    // getSpaces 응답에서 현재 유저 ID와 이름 추출
    // 구조: { "userId": { notion_user: { "userId": { value: { id, name, ... } } } } }
    for (const [topUserId, spaceData] of Object.entries(data) as any[]) {
      const notionUsers = spaceData?.notion_user || {};
      for (const [uid, userData] of Object.entries(notionUsers) as any[]) {
        const val = userData?.value;
        if (!val) continue;
        const name =
          val.name || `${val.given_name || ''} ${val.family_name || ''}`.trim();
        if (name) {
          console.log(`[Auth] ✅ 유저 확인: ${name} (${uid})`);
          return { userId: uid, userName: name };
        }
      }
    }

    console.log('[Auth] getSpaces에서 유저 정보 추출 실패');
    return { userId: '', userName: '' };
  } catch (e: any) {
    console.log(`[Auth] 유저 정보 조회 에러: ${e.message}`);
    return { userId: '', userName: '' };
  }
}

/**
 * 저장된 token_v2 유효성 확인 + 유저 이름 자동 보충
 */
export async function checkAuthStatus(): Promise<{
  isLoggedIn: boolean;
  userName?: string;
}> {
  const config = loadConfig();
  if (!config.notionTokenV2) {
    return { isLoggedIn: false };
  }

  try {
    const response = await fetch('https://www.notion.so/api/v3/getSpaces', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `token_v2=${config.notionTokenV2}`,
      },
      body: JSON.stringify({}),
    });

    if (!response.ok) return { isLoggedIn: false };

    // 유저 이름이 없으면 응답에서 추출
    let userName = config.notionUserName || '';
    if (!userName) {
      const userInfo = await extractUserInfo(config.notionTokenV2);
      if (userInfo.userName) {
        userName = userInfo.userName;
        saveConfig({
          notionUserId: userInfo.userId,
          notionUserName: userInfo.userName,
        });
        console.log(`[Auth] 유저 이름 자동 보충: ${userName}`);
      }
    }

    return { isLoggedIn: true, userName };
  } catch {
    return { isLoggedIn: false };
  }
}

/**
 * 로그아웃 (토큰 삭제)
 */
export function logout(): void {
  saveConfig({
    notionTokenV2: '',
    notionUserId: '',
    notionUserName: '',
  });
  session.defaultSession.cookies.remove('https://www.notion.so', 'token_v2');
}
