import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  // 설정
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (config: any) => ipcRenderer.invoke('settings:save', config),

  // 인증
  login: () => ipcRenderer.invoke('auth:login'),
  checkAuth: () => ipcRenderer.invoke('auth:check'),
  logout: () => ipcRenderer.invoke('auth:logout'),

  // Notion
  testNotion: () => ipcRenderer.invoke('notion:test'),
  fetchSchedules: (params: {
    startDate: string;
    endDate: string;
    type: string;
  }) => ipcRenderer.invoke('notion:fetch-schedules', params),

  // Gemini
  testGemini: () => ipcRenderer.invoke('gemini:test'),
  summarize: (content: string) =>
    ipcRenderer.invoke('gemini:summarize', { content }),
  generatePlanDraft: (content: string) =>
    ipcRenderer.invoke('gemini:plan-draft', { content }),

  // 보고서
  generateReport: (params: {
    schedules: any[];
    type: string;
    startDate: string;
    endDate: string;
  }) => ipcRenderer.invoke('report:generate', params),

  // 기타
  openExternal: (url: string) => ipcRenderer.invoke('open-external', url),
});

// TypeScript 타입 정의
declare global {
  interface Window {
    electronAPI: {
      getSettings: () => Promise<any>;
      saveSettings: (config: any) => Promise<any>;
      login: () => Promise<{
        success: boolean;
        tokenV2?: string;
        userId?: string;
        userName?: string;
        error?: string;
      }>;
      checkAuth: () => Promise<{ isLoggedIn: boolean; userName?: string }>;
      logout: () => Promise<{ success: boolean }>;
      testNotion: () => Promise<{ success: boolean; error?: string }>;
      fetchSchedules: (params: {
        startDate: string;
        endDate: string;
        type: string;
      }) => Promise<any>;
      testGemini: () => Promise<{ success: boolean; error?: string }>;
      summarize: (content: string) => Promise<any>;
      generatePlanDraft: (content: string) => Promise<any>;
      generateReport: (params: {
        schedules: any[];
        type: string;
        startDate: string;
        endDate: string;
      }) => Promise<any>;
      openExternal: (url: string) => Promise<any>;
    };
  }
}
