import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ElectronService } from '../../services/electron.service';

@Component({
  selector: 'app-report',
  imports: [FormsModule],
  template: `
    <div class="report-page">
      <h1 class="page-title">📝 보고서 생성</h1>

      <!-- 생성 폼 -->
      <section class="card generate-card">
        <div class="form-row">
          <div class="form-group">
            <label class="field-label">시작일</label>
            <input type="date" class="input" [(ngModel)]="startDate" />
          </div>
          <div class="form-group">
            <label class="field-label">종료일</label>
            <input type="date" class="input" [(ngModel)]="endDate" />
          </div>
          <div class="form-group">
            <label class="field-label">유형</label>
            <div class="type-buttons">
              <button
                class="type-btn"
                [class.active]="reportType === 'MONDAY'"
                (click)="reportType = 'MONDAY'"
              >
                📅 월요일 (계획)
              </button>
              <button
                class="type-btn"
                [class.active]="reportType === 'FRIDAY'"
                (click)="reportType = 'FRIDAY'"
              >
                ✅ 금요일 (결과)
              </button>
            </div>
          </div>
        </div>
        <button
          class="btn btn-primary btn-generate"
          (click)="fetchSchedules()"
          [disabled]="loading()"
        >
          {{ loading() ? '⏳ 일정 조회 중...' : '🔍 일정 조회' }}
        </button>
        @if (errorMessage()) {
          <p class="error-msg">{{ errorMessage() }}</p>
        }
      </section>

      <!-- 확인 다이얼로그 -->
      @if (showConfirm()) {
        <section class="card confirm-card">
          <div class="confirm-content">
            <div class="confirm-icon">📋</div>
            <div class="confirm-text">
              <p class="confirm-main">
                <strong>{{ fetchedSchedules().length }}</strong
                >개의 일정을 찾았습니다.
              </p>
              <p class="confirm-sub">AI 요약을 포함한 보고서를 생성할까요?</p>
            </div>
          </div>
          <div class="confirm-schedule-preview">
            @for (s of fetchedSchedules().slice(0, 5); track s.id) {
              <div class="schedule-item">
                <span
                  class="schedule-status"
                  [class.done]="s.status === '완료'"
                  >{{ s.status || '-' }}</span
                >
                <span class="schedule-title">{{ s.title }}</span>
                <span class="schedule-date">{{ s.date }}</span>
              </div>
            }
            @if (fetchedSchedules().length > 5) {
              <p class="more-text">
                ... 외 {{ fetchedSchedules().length - 5 }}건
              </p>
            }
          </div>
          <div class="confirm-actions">
            <button class="btn btn-secondary" (click)="cancelGenerate()">
              취소
            </button>
            <button
              class="btn btn-primary"
              (click)="confirmGenerate()"
              [disabled]="generating()"
            >
              {{ generating() ? '⏳ 보고서 생성 중...' : '🚀 보고서 생성' }}
            </button>
          </div>
        </section>
      }

      <!-- 결과 (에디터 + 미리보기) -->
      @if (reportMarkdown()) {
        <section class="card result-card">
          <div class="result-header">
            <div class="tab-buttons">
              <button
                class="tab-btn"
                [class.active]="activeTab() === 'edit'"
                (click)="activeTab.set('edit')"
              >
                ✏️ 편집
              </button>
              <button
                class="tab-btn"
                [class.active]="activeTab() === 'preview'"
                (click)="activeTab.set('preview')"
              >
                👁️ 미리보기
              </button>
            </div>
            <div class="action-buttons">
              <button class="btn btn-secondary" (click)="copyToClipboard()">
                {{ copied() ? '✅ 복사됨!' : '📋 마크다운 복사' }}
              </button>
            </div>
          </div>

          <div class="result-body">
            @if (activeTab() === 'edit') {
              <textarea
                class="editor"
                [(ngModel)]="reportMarkdown"
                (ngModelChange)="onMarkdownChange($event)"
              ></textarea>
            } @else {
              <div class="preview" [innerHTML]="previewHtml()"></div>
            }
          </div>
        </section>

        <!-- 일정 요약 -->
        @if (scheduleCount() > 0) {
          <section class="card info-card">
            <p class="info-text">
              📊 총 <strong>{{ scheduleCount() }}</strong
              >개 일정이 반영되었습니다.
            </p>
          </section>
        }
      }
    </div>
  `,
  styles: [
    `
      .report-page {
        max-width: 900px;
      }
      .page-title {
        font-size: 24px;
        font-weight: 700;
        margin-bottom: 24px;
        color: #fff;
      }
      .card {
        background: #1a1a2e;
        border: 1px solid #2a2a4a;
        border-radius: 12px;
        padding: 20px;
        margin-bottom: 16px;
      }
      .form-row {
        display: flex;
        gap: 16px;
        align-items: flex-end;
        flex-wrap: wrap;
        margin-bottom: 16px;
      }
      .form-group {
        flex: 1;
        min-width: 140px;
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
        box-sizing: border-box;
      }
      .input:focus {
        border-color: #667eea;
      }
      .input[type='date']::-webkit-calendar-picker-indicator {
        filter: invert(0.7);
      }
      .type-buttons {
        display: flex;
        gap: 8px;
      }
      .type-btn {
        padding: 8px 14px;
        background: #0f0f1a;
        border: 1px solid #2a2a4a;
        border-radius: 8px;
        color: #8888aa;
        font-size: 13px;
        cursor: pointer;
        transition: all 0.2s;
        white-space: nowrap;
      }
      .type-btn:hover {
        border-color: #667eea;
        color: #c0c0e0;
      }
      .type-btn.active {
        background: rgba(102, 126, 234, 0.15);
        border-color: #667eea;
        color: #667eea;
        font-weight: 600;
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
      .btn-secondary:hover {
        background: rgba(102, 126, 234, 0.25);
      }
      .btn-generate {
        padding: 12px 28px;
        font-size: 15px;
        width: 100%;
      }
      .error-msg {
        color: #ff6363;
        font-size: 13px;
        margin-top: 8px;
      }

      /* 확인 다이얼로그 */
      .confirm-card {
        background: linear-gradient(135deg, #1a1a3e, #1e1e42);
        border-color: #667eea40;
        animation: slideIn 0.3s ease;
      }
      @keyframes slideIn {
        from {
          opacity: 0;
          transform: translateY(-10px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }
      .confirm-content {
        display: flex;
        align-items: center;
        gap: 16px;
        margin-bottom: 16px;
      }
      .confirm-icon {
        font-size: 36px;
        flex-shrink: 0;
      }
      .confirm-main {
        font-size: 18px;
        color: #fff;
        margin: 0 0 4px;
      }
      .confirm-main strong {
        color: #667eea;
        font-size: 22px;
      }
      .confirm-sub {
        font-size: 14px;
        color: #8888aa;
        margin: 0;
      }
      .confirm-schedule-preview {
        background: #0f0f1a;
        border: 1px solid #2a2a4a;
        border-radius: 8px;
        padding: 12px 16px;
        margin-bottom: 16px;
        max-height: 200px;
        overflow-y: auto;
      }
      .schedule-item {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 6px 0;
        border-bottom: 1px solid #1a1a2e;
        font-size: 13px;
      }
      .schedule-item:last-child {
        border-bottom: none;
      }
      .schedule-status {
        padding: 2px 8px;
        border-radius: 4px;
        font-size: 11px;
        font-weight: 600;
        background: rgba(136, 136, 170, 0.15);
        color: #8888aa;
        white-space: nowrap;
        min-width: 50px;
        text-align: center;
      }
      .schedule-status.done {
        background: rgba(72, 187, 120, 0.15);
        color: #48bb78;
      }
      .schedule-title {
        flex: 1;
        color: #d0d0e0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .schedule-date {
        color: #6868aa;
        font-size: 12px;
        white-space: nowrap;
      }
      .more-text {
        color: #6868aa;
        font-size: 12px;
        text-align: center;
        margin: 8px 0 0;
      }
      .confirm-actions {
        display: flex;
        justify-content: flex-end;
        gap: 10px;
      }
      .confirm-actions .btn {
        padding: 10px 24px;
        font-size: 14px;
      }

      .result-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 12px;
        padding-bottom: 12px;
        border-bottom: 1px solid #2a2a4a;
      }
      .tab-buttons {
        display: flex;
        gap: 4px;
      }
      .tab-btn {
        padding: 6px 14px;
        background: transparent;
        border: 1px solid #2a2a4a;
        border-radius: 6px;
        color: #8888aa;
        font-size: 13px;
        cursor: pointer;
        transition: all 0.2s;
      }
      .tab-btn.active {
        background: rgba(102, 126, 234, 0.15);
        border-color: #667eea;
        color: #667eea;
      }
      .action-buttons {
        display: flex;
        gap: 8px;
      }
      .editor {
        width: 100%;
        min-height: 400px;
        padding: 16px;
        background: #0f0f1a;
        border: 1px solid #2a2a4a;
        border-radius: 8px;
        color: #e0e0e0;
        font-family: 'Consolas', 'Monaco', monospace;
        font-size: 13px;
        line-height: 1.7;
        resize: vertical;
        outline: none;
        box-sizing: border-box;
      }
      .editor:focus {
        border-color: #667eea;
      }
      .preview {
        padding: 20px;
        background: #0f0f1a;
        border: 1px solid #2a2a4a;
        border-radius: 8px;
        min-height: 400px;
        font-size: 14px;
        line-height: 1.8;
        color: #d0d0e0;
      }
      .preview :deep(h2) {
        font-size: 18px;
        color: #fff;
        margin: 20px 0 12px;
        padding-bottom: 8px;
        border-bottom: 1px solid #2a2a4a;
      }
      .preview :deep(h3) {
        font-size: 15px;
        color: #667eea;
        margin: 16px 0 8px;
      }
      .preview :deep(h4) {
        font-size: 14px;
        color: #b0b0d0;
        margin: 12px 0 6px;
      }
      .preview :deep(strong) {
        color: #fff;
      }
      .preview :deep(a) {
        color: #667eea;
        text-decoration: none;
      }
      .preview :deep(a:hover) {
        text-decoration: underline;
      }
      .preview :deep(ul),
      .preview :deep(ol) {
        padding-left: 20px;
        margin: 4px 0;
      }
      .preview :deep(li) {
        margin: 2px 0;
      }
      .info-card {
        background: rgba(102, 126, 234, 0.08);
        border-color: rgba(102, 126, 234, 0.2);
      }
      .info-text {
        font-size: 14px;
        color: #b0b0d0;
        margin: 0;
      }
      .info-text strong {
        color: #667eea;
      }
    `,
  ],
})
export class ReportPage {
  protected startDate = '';
  protected endDate = '';
  protected reportType: 'MONDAY' | 'FRIDAY' = 'FRIDAY';
  protected reportMarkdown = signal('');
  protected loading = signal(false);
  protected generating = signal(false);
  protected errorMessage = signal('');
  protected activeTab = signal<'edit' | 'preview'>('edit');
  protected copied = signal(false);
  protected scheduleCount = signal(0);
  protected previewHtml = signal('');
  protected showConfirm = signal(false);
  protected fetchedSchedules = signal<any[]>([]);

  constructor(private electron: ElectronService) {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const monday = new Date(now);
    monday.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
    const friday = new Date(monday);
    friday.setDate(monday.getDate() + 4);

    this.startDate = this.formatDate(monday);
    this.endDate = this.formatDate(friday);
  }

  /**
   * Step 1: 일정 조회 → 확인 다이얼로그 표시
   */
  async fetchSchedules() {
    if (!this.startDate || !this.endDate) {
      this.errorMessage.set('시작일과 종료일을 입력해주세요.');
      return;
    }

    this.loading.set(true);
    this.errorMessage.set('');
    this.showConfirm.set(false);
    this.reportMarkdown.set('');

    try {
      const result = await this.electron.fetchSchedules({
        startDate: this.startDate,
        endDate: this.endDate,
        type: this.reportType,
      });

      if (result?.success) {
        const schedules = result.data || [];
        this.fetchedSchedules.set(schedules);

        if (schedules.length === 0) {
          this.errorMessage.set('해당 기간에 일정이 없습니다.');
        } else {
          this.showConfirm.set(true);
        }
      } else {
        this.errorMessage.set(result?.error || '일정 조회 실패');
      }
    } catch (e: any) {
      this.errorMessage.set(e.message || '오류가 발생했습니다.');
    }

    this.loading.set(false);
  }

  /**
   * Step 2: 확인 → 보고서 생성
   */
  async confirmGenerate() {
    this.generating.set(true);
    this.errorMessage.set('');

    try {
      const result = await this.electron.generateReport({
        schedules: this.fetchedSchedules(),
        type: this.reportType,
        startDate: this.startDate,
        endDate: this.endDate,
      });

      if (result?.success) {
        this.reportMarkdown.set(result.data.markdown);
        this.scheduleCount.set(result.data.schedules?.length || 0);
        this.previewHtml.set(this.markdownToHtml(result.data.markdown));
        this.showConfirm.set(false);
      } else {
        this.errorMessage.set(result?.error || '보고서 생성 실패');
      }
    } catch (e: any) {
      this.errorMessage.set(e.message || '오류가 발생했습니다.');
    }

    this.generating.set(false);
  }

  cancelGenerate() {
    this.showConfirm.set(false);
    this.fetchedSchedules.set([]);
  }

  onMarkdownChange(value: string) {
    this.previewHtml.set(this.markdownToHtml(value));
  }

  async copyToClipboard() {
    const markdown = this.reportMarkdown();
    if (!markdown) return;

    try {
      await navigator.clipboard.writeText(markdown);
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = markdown;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    }
  }

  private formatDate(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  private markdownToHtml(md: string): string {
    let html = md
      .replace(/^#### (.+)$/gm, '<h4>$1</h4>')
      .replace(/^### (.+)$/gm, '<h3>$1</h3>')
      .replace(/^## (.+)$/gm, '<h2>$1</h2>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(
        /\[([^\]]+)\]\(([^)]+)\)/g,
        '<a href="$2" target="_blank">$1</a>',
      )
      .replace(/^    - (.+)$/gm, '<li class="sub">$1</li>')
      .replace(/^- (.+)$/gm, '<li>$1</li>');

    html = html.replace(/((?:<li[^>]*>.*<\/li>\n?)+)/g, '<ul>$1</ul>');
    html = html.replace(/\n\n/g, '<br/>');

    return html;
  }
}
