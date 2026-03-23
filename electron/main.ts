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
    width: 1060,
    height: 1000,
    minWidth: 1060,
    minHeight: 1000,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
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
              projectReports: [],
              excludedScheduleCount: 0,
            },
          };
        }

        // 긴 상세내용 요약 (5개 초과 시 Gemini 요약)
        try {
          const summaryMap =
            await geminiService.summarizeChildContents(schedules);
          if (summaryMap.size > 0) {
            for (const s of schedules as any[]) {
              const summarized = summaryMap.get(s.title);
              if (summarized) {
                s.childContent = summarized;
              }
            }
          }
        } catch (err) {
          console.error('[Report] 상세내용 요약 실패, 원본 사용:', err);
        }

        const authorName = loadConfig().notionUserName || '-';
        const projectGroups = reportService.buildProjectGroups(schedules);
        const completedSummaryMap = new Map<string, string[]>();

        for (const projectGroup of projectGroups) {
          const completedSchedules = projectGroup.schedules.filter(
            (schedule) => (schedule.status || '').trim() === '완료',
          );

          if (completedSchedules.length === 0) continue;

          try {
            const summaryLines =
              await geminiService.generateCompletedWorkSummary(
                projectGroup.projectName,
                completedSchedules.map((schedule) => ({
                  title: schedule.title,
                  childContent: schedule.childContent,
                })),
              );

            if (summaryLines.length > 0) {
              completedSummaryMap.set(projectGroup.projectName, summaryLines);
            }
          } catch (err) {
            console.error(
              `[Report] 완료 업무 요약 실패 (${projectGroup.projectName}), 기본 제목 사용:`,
              err,
            );
          }
        }

        const projectReports = reportService.generateProjectReports(
          schedules,
          startDate,
          endDate,
          authorName,
          completedSummaryMap,
        );

        const includedScheduleCount = projectReports.reduce(
          (sum, report) => sum + report.scheduleCount,
          0,
        );
        const excludedScheduleCount = schedules.length - includedScheduleCount;

        return {
          success: true,
          data: {
            projectReports,
            excludedScheduleCount,
          },
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
