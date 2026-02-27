import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ElectronService } from '../../services/electron.service';

@Component({
  selector: 'app-settings',
  imports: [FormsModule],
  template: `
    <div class="settings-page">
      <div class="page-header">
        <h1 class="page-title">⚙️ 설정</h1>
        <div class="header-actions">
          @if (saveMessage()) {
            <span class="save-message">{{ saveMessage() }}</span>
          }
          <button
            class="btn btn-primary btn-large"
            (click)="saveSettings()"
            [disabled]="loading()"
          >
            저장
          </button>
        </div>
      </div>

      @if (!initialized()) {
        <div class="loading-container">
          <div class="spinner"></div>
          <span class="loading-text">설정 불러오는 중...</span>
        </div>
      } @else {
        <!-- Notion 연동 -->
        <section class="card">
          <h2 class="card-title">Notion 연동</h2>
          <div class="status-row">
            <span class="status-label">상태:</span>
            @if (notionConnected()) {
              <span class="status-badge connected"
                >✅ 연결됨 ({{ notionUserName() }})</span
              >
            } @else {
              <span class="status-badge disconnected">❌ 연결 안됨</span>
            }
          </div>
          <div class="button-row">
            @if (!notionConnected()) {
              <button
                class="btn btn-primary"
                (click)="loginNotion()"
                [disabled]="loading()"
              >
                {{ loading() ? '로그인 중...' : '🔑 Notion 로그인' }}
              </button>
            } @else {
              <button
                class="btn btn-secondary"
                (click)="testNotion()"
                [disabled]="loading()"
              >
                연결 테스트
              </button>
              <button class="btn btn-danger" (click)="logoutNotion()">
                로그아웃
              </button>
            }
          </div>
          @if (notionMessage()) {
            <p class="message" [class.error]="notionError()">
              {{ notionMessage() }}
            </p>
          }
        </section>

        <!-- Gemini API -->
        <section class="card">
          <h2 class="card-title">Gemini API</h2>
          <label class="field-label">API Key</label>
          <input
            type="password"
            class="input"
            [(ngModel)]="geminiApiKey"
            placeholder="Gemini API 키 입력"
          />
          <label class="field-label" style="margin-top: 12px;">모델</label>
          <select class="input" [(ngModel)]="geminiModel">
            <option value="gemini-2.5-flash">gemini-2.5-flash (추천)</option>
            <option value="gemini-2.5-pro">gemini-2.5-pro</option>
            <option value="gemini-2.0-flash">gemini-2.0-flash</option>
          </select>
          <div class="button-row" style="margin-top: 12px;">
            <button
              class="btn btn-secondary"
              (click)="testGemini()"
              [disabled]="loading()"
            >
              연결 테스트
            </button>
          </div>
          @if (geminiMessage()) {
            <p class="message" [class.error]="geminiError()">
              {{ geminiMessage() }}
            </p>
          }
        </section>

        <!-- Notion DB ID -->
        <section class="card">
          <h2 class="card-title">캘린더 DB 설정</h2>
          <label class="field-label">Database ID</label>
          <input
            type="text"
            class="input"
            [(ngModel)]="dbId"
            placeholder="14993e1c9d5881ba9f62c3e9b3de0284"
          />
          <p class="field-hint">노션 캘린더 페이지 URL에서 추출한 ID</p>
        </section>
      }
    </div>
  `,
  styles: [
    `
      .settings-page {
      }
      .page-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 24px;
      }
      .page-title {
        font-size: 24px;
        font-weight: 700;
        color: #fff;
        margin: 0;
      }
      .header-actions {
        display: flex;
        align-items: center;
        gap: 12px;
      }
      .card {
        background: #1a1a2e;
        border: 1px solid #2a2a4a;
        border-radius: 12px;
        padding: 20px;
        margin-bottom: 16px;
      }
      .card-title {
        font-size: 16px;
        font-weight: 600;
        color: #c0c0e0;
        margin-bottom: 16px;
      }
      .status-row {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 12px;
      }
      .status-label {
        color: #8888aa;
        font-size: 14px;
      }
      .status-badge {
        font-size: 13px;
        padding: 4px 10px;
        border-radius: 6px;
        font-weight: 500;
      }
      .status-badge.connected {
        background: rgba(72, 199, 142, 0.15);
        color: #48c78e;
      }
      .status-badge.disconnected {
        background: rgba(255, 99, 99, 0.15);
        color: #ff6363;
      }
      .button-row {
        display: flex;
        gap: 8px;
      }
      .btn {
        padding: 8px 16px;
        border: none;
        border-radius: 8px;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
      }
      .btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      .btn-primary {
        background: linear-gradient(135deg, #667eea, #764ba2);
        color: #fff;
      }
      .btn-primary:hover:not(:disabled) {
        opacity: 0.9;
        transform: translateY(-1px);
      }
      .btn-secondary {
        background: rgba(102, 126, 234, 0.15);
        color: #667eea;
      }
      .btn-secondary:hover:not(:disabled) {
        background: rgba(102, 126, 234, 0.25);
      }
      .btn-danger {
        background: rgba(255, 99, 99, 0.15);
        color: #ff6363;
      }
      .btn-danger:hover {
        background: rgba(255, 99, 99, 0.25);
      }
      .btn-large {
        padding: 12px 24px;
        font-size: 15px;
      }
      .message {
        font-size: 13px;
        margin-top: 8px;
        color: #48c78e;
      }
      .message.error {
        color: #ff6363;
      }
      .field-label {
        display: block;
        font-size: 13px;
        color: #8888aa;
        margin-bottom: 6px;
        font-weight: 500;
      }
      .input {
        width: 100%;
        padding: 10px 12px;
        background: #0f0f1a;
        border: 1px solid #2a2a4a;
        border-radius: 8px;
        color: #e0e0e0;
        font-size: 14px;
        outline: none;
        transition: border-color 0.2s;
        box-sizing: border-box;
      }
      .input:focus {
        border-color: #667eea;
      }
      .input option {
        background: #0f0f1a;
      }
      .field-hint {
        font-size: 12px;
        color: #6666888;
        margin-top: 4px;
      }
      .save-message {
        font-size: 13px;
        color: #48c78e;
      }
      .loading-container {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 60px 0;
        gap: 16px;
      }
      .spinner {
        width: 32px;
        height: 32px;
        border: 3px solid #2a2a4a;
        border-top-color: #667eea;
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
      }
      @keyframes spin {
        to {
          transform: rotate(360deg);
        }
      }
      .loading-text {
        font-size: 14px;
        color: #6868aa;
      }
    `,
  ],
})
export class SettingsPage implements OnInit {
  protected notionConnected = signal(false);
  protected notionUserName = signal('');
  protected notionMessage = signal('');
  protected notionError = signal(false);
  protected geminiMessage = signal('');
  protected geminiError = signal(false);
  protected saveMessage = signal('');
  protected loading = signal(false);
  protected initialized = signal(false);

  protected dbId = '';
  protected geminiApiKey = '';
  protected geminiModel = 'gemini-2.5-flash';

  constructor(private electron: ElectronService) {}

  async ngOnInit() {
    await Promise.all([this.loadSettings(), this.checkAuth()]);
    this.initialized.set(true);
  }

  private async loadSettings() {
    const settings = await this.electron.getSettings();
    if (settings) {
      this.dbId = settings.notionDbId || '';
      this.geminiApiKey = settings.geminiApiKey || '';
      this.geminiModel = settings.geminiModel || 'gemini-2.5-flash';
    }
  }

  private async checkAuth() {
    const result = await this.electron.checkAuth();
    if (result) {
      this.notionConnected.set(result.isLoggedIn);
      this.notionUserName.set(result.userName || '');
    }
  }

  async loginNotion() {
    this.loading.set(true);
    this.notionMessage.set('');
    try {
      const result = await this.electron.login();
      if (result?.success) {
        this.notionConnected.set(true);
        this.notionUserName.set(result.userName || '');
        this.notionMessage.set('로그인 성공!');
        this.notionError.set(false);
      } else {
        this.notionMessage.set(result?.error || '로그인 실패');
        this.notionError.set(true);
      }
    } catch (e: any) {
      this.notionMessage.set(e.message);
      this.notionError.set(true);
    }
    this.loading.set(false);
  }

  async testNotion() {
    this.loading.set(true);
    const result = await this.electron.testNotion();
    if (result?.success) {
      this.notionMessage.set('연결 테스트 성공!');
      this.notionError.set(false);
    } else {
      this.notionMessage.set('연결 실패: ' + (result?.error || ''));
      this.notionError.set(true);
    }
    this.loading.set(false);
  }

  async logoutNotion() {
    await this.electron.logout();
    this.notionConnected.set(false);
    this.notionUserName.set('');
    this.notionMessage.set('로그아웃 완료');
    this.notionError.set(false);
  }

  async testGemini() {
    this.loading.set(true);
    // 먼저 설정 저장
    await this.electron.saveSettings({
      geminiApiKey: this.geminiApiKey,
      geminiModel: this.geminiModel,
    });
    const result = await this.electron.testGemini();
    if (result?.success) {
      this.geminiMessage.set('연결 테스트 성공!');
      this.geminiError.set(false);
    } else {
      this.geminiMessage.set('연결 실패: ' + (result?.error || ''));
      this.geminiError.set(true);
    }
    this.loading.set(false);
  }

  async saveSettings() {
    this.loading.set(true);
    try {
      await this.electron.saveSettings({
        notionDbId: this.dbId,
        geminiApiKey: this.geminiApiKey,
        geminiModel: this.geminiModel,
      });
      this.saveMessage.set('✅ 설정이 저장되었습니다.');
      setTimeout(() => this.saveMessage.set(''), 3000);
    } catch (e: any) {
      this.saveMessage.set('❌ 저장 실패: ' + e.message);
    }
    this.loading.set(false);
  }
}
