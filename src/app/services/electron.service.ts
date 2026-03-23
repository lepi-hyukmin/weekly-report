import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ElectronService {
  private get api() {
    return (window as any).electronAPI;
  }

  get isElectron(): boolean {
    return !!(window as any).electronAPI;
  }

  // 설정
  getSettings() {
    return this.api?.getSettings();
  }
  saveSettings(config: any) {
    return this.api?.saveSettings(config);
  }

  // 인증
  login() {
    return this.api?.login();
  }
  checkAuth() {
    return this.api?.checkAuth();
  }
  logout() {
    return this.api?.logout();
  }

  // Notion
  testNotion() {
    return this.api?.testNotion();
  }
  fetchSchedules(params: { startDate: string; endDate: string; type: string }) {
    return this.api?.fetchSchedules(params);
  }

  // Gemini
  testGemini() {
    return this.api?.testGemini();
  }

  // 보고서
  generateReport(params: {
    schedules: any[];
    type: string;
    startDate: string;
    endDate: string;
    issues: Array<{ id: string; projectName: string; content: string }>;
  }) {
    return this.api?.generateReport(params);
  }

  // 기타
  openExternal(url: string) {
    return this.api?.openExternal(url);
  }
}
