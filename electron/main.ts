import { app, BrowserWindow, ipcMain, shell } from 'electron';
import * as path from 'path';
import { loadConfig, saveConfig } from './services/config.service';
import {
  loginToNotion,
  checkAuthStatus,
  logout,
} from './services/auth.service';
import { NotionService } from './services/notion.service';
import { GeminiService } from './services/gemini.service';
import { ReportService } from './services/report.service';

let mainWindow: BrowserWindow | null = null;
const notionService = new NotionService();
const geminiService = new GeminiService();
const reportService = new ReportService();

/**
 * 메인 윈도우 생성
 */
function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 1000,
    minWidth: 900,
    minHeight: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
    title: '주간보고서 생성기',
    autoHideMenuBar: true,
  });

  // Angular 개발 서버 또는 빌드된 파일 로드
  const isDev = process.argv.includes('--dev');
  if (isDev) {
    mainWindow.loadURL('http://localhost:4200');
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'browser', 'index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

/**
 * IPC 핸들러 등록
 */
function registerIpcHandlers(): void {
  // === 설정 ===
  ipcMain.handle('settings:get', async () => {
    return loadConfig();
  });

  ipcMain.handle('settings:save', async (_event, config) => {
    const saved = saveConfig(config);
    notionService.resetClient();
    return saved;
  });

  // === 인증 ===
  ipcMain.handle('auth:login', async () => {
    if (!mainWindow) return { success: false, error: '윈도우 없음' };
    return loginToNotion(mainWindow);
  });

  ipcMain.handle('auth:check', async () => {
    return checkAuthStatus();
  });

  ipcMain.handle('auth:logout', async () => {
    logout();
    notionService.resetClient();
    return { success: true };
  });

  // === Notion ===
  ipcMain.handle('notion:test', async () => {
    return notionService.testConnection();
  });

  ipcMain.handle(
    'notion:fetch-schedules',
    async (_event, { startDate, endDate, type }) => {
      try {
        const schedules = await notionService.fetchSchedules(
          startDate,
          endDate,
          type,
        );
        return { success: true, data: schedules };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    },
  );

  // === Gemini ===
  ipcMain.handle('gemini:test', async () => {
    return geminiService.testConnection();
  });

  ipcMain.handle('gemini:summarize', async (_event, { content }) => {
    try {
      const summary = await geminiService.generateSummary(content);
      return { success: true, data: summary };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('gemini:plan-draft', async (_event, { content }) => {
    try {
      const draft = await geminiService.generatePlanDraft(content);
      return { success: true, data: draft };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // === 보고서 ===
  ipcMain.handle(
    'report:generate',
    async (_event, { schedules, type, startDate, endDate }) => {
      try {
        if (!schedules || schedules.length === 0) {
          return {
            success: true,
            data: {
              markdown: '해당 기간에 일정이 없습니다.',
              schedules: [],
            },
          };
        }

        // AI 요약용 텍스트
        const contentForAI = schedules
          .map(
            (s: any) =>
              `[${s.project}] ${s.title} (${s.status}) ${s.childContent.join(', ')}`,
          )
          .join('\n');

        // AI 3줄 요약 + 의사결정 초안
        let summary = '';
        let planDraft = '';
        try {
          summary = await geminiService.generateSummary(contentForAI);
          planDraft = await geminiService.generatePlanDraft(contentForAI);
        } catch {
          summary = '- **상황:** \n- **진행:** \n- **요청:** ';
          planDraft = '- ';
        }

        // 보고서 생성
        const markdown = reportService.generateReport(
          schedules,
          type,
          startDate,
          endDate,
          summary,
          planDraft,
        );

        return {
          success: true,
          data: { markdown, schedules },
        };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    },
  );

  // === 기타 ===
  ipcMain.handle('open-external', async (_event, url: string) => {
    try {
      await shell.openExternal(url);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });
}

/**
 * 앱 시작
 */
app.whenReady().then(() => {
  registerIpcHandlers();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
