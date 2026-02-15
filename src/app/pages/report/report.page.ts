import { Component, signal, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ElectronService } from '../../services/electron.service';

interface SelectableSchedule {
  id: string;
  title: string;
  project: string;
  projectUrl: string;
  category: string;
  priority: string;
  status: string;
  date: string;
  endDate: string;
  assignees: string[];
  childContent: string[];
  checked: boolean;
}

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

      <!-- 일정 선택 목록 -->
      @if (showScheduleList()) {
        <section class="card schedule-list-card">
          <div class="schedule-list-header">
            <div class="schedule-list-info">
              <span class="schedule-count">
                <strong>{{ selectedCount() }}</strong
                >개 선택됨
                <span class="schedule-total"
                  >(총 {{ fetchedSchedules().length }}건)</span
                >
              </span>
            </div>
            <div class="schedule-list-actions">
              <button class="btn btn-text" (click)="toggleAll()">
                {{ allSelected() ? '☐ 전체 해제' : '☑ 전체 선택' }}
              </button>
            </div>
          </div>

          <div class="schedule-list">
            @for (s of fetchedSchedules(); track s.id) {
              <label class="schedule-row" [class.unchecked]="!s.checked">
                <input
                  type="checkbox"
                  class="schedule-checkbox"
                  [(ngModel)]="s.checked"
                />
                <span
                  class="schedule-status"
                  [class.done]="s.status === '완료'"
                  >{{ s.status || '-' }}</span
                >
                <span class="schedule-title">{{ s.title }}</span>
                <span class="schedule-project">{{ s.project }}</span>
                <span class="schedule-date">{{ s.date }}</span>
              </label>
            }
          </div>

          <div class="schedule-list-footer">
            <button class="btn btn-secondary" (click)="cancelGenerate()">
              취소
            </button>
            <button
              class="btn btn-primary"
              (click)="confirmGenerate()"
              [disabled]="generating() || selectedCount() === 0"
            >
              {{
                generating()
                  ? '⏳ 보고서 생성 중...'
                  : '🚀 보고서 생성 (' + selectedCount() + '건)'
              }}
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
      .btn-text {
        background: transparent;
        color: #8888aa;
        padding: 6px 12px;
        font-size: 12px;
        border: 1px solid #2a2a4a;
        border-radius: 6px;
      }
      .btn-text:hover {
        color: #667eea;
        border-color: #667eea;
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

      /* 일정 선택 목록 */
      .schedule-list-card {
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
      .schedule-list-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 12px;
      }
      .schedule-count {
        font-size: 15px;
        color: #fff;
      }
      .schedule-count strong {
        color: #667eea;
        font-size: 18px;
      }
      .schedule-total {
        color: #6868aa;
        font-size: 13px;
        margin-left: 4px;
      }
      .schedule-list {
        background: #0f0f1a;
        border: 1px solid #2a2a4a;
        border-radius: 8px;
        max-height: 400px;
        overflow-y: auto;
      }
      .schedule-row {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 10px 14px;
        border-bottom: 1px solid #1a1a2e;
        font-size: 13px;
        cursor: pointer;
        transition: background 0.15s;
      }
      .schedule-row:last-child {
        border-bottom: none;
      }
      .schedule-row:hover {
        background: rgba(102, 126, 234, 0.05);
      }
      .schedule-row.unchecked {
        opacity: 0.45;
      }
      .schedule-checkbox {
        width: 16px;
        height: 16px;
        accent-color: #667eea;
        cursor: pointer;
        flex-shrink: 0;
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
        flex-shrink: 0;
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
      .schedule-project {
        color: #667eea;
        font-size: 11px;
        white-space: nowrap;
        max-width: 120px;
        overflow: hidden;
        text-overflow: ellipsis;
        flex-shrink: 0;
      }
      .schedule-date {
        color: #6868aa;
        font-size: 12px;
        white-space: nowrap;
        flex-shrink: 0;
      }
      .schedule-list-footer {
        display: flex;
        justify-content: flex-end;
        gap: 10px;
        margin-top: 16px;
      }
      .schedule-list-footer .btn {
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
  protected showScheduleList = signal(false);
  protected fetchedSchedules = signal<SelectableSchedule[]>([]);

  protected selectedCount = computed(
    () => this.fetchedSchedules().filter((s) => s.checked).length,
  );

  protected allSelected = computed(
    () =>
      this.fetchedSchedules().length > 0 &&
      this.fetchedSchedules().every((s) => s.checked),
  );

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
   * Step 1: 일정 조회 → 체크박스 목록 표시
   */
  async fetchSchedules() {
    if (!this.startDate || !this.endDate) {
      this.errorMessage.set('시작일과 종료일을 입력해주세요.');
      return;
    }

    this.loading.set(true);
    this.errorMessage.set('');
    this.showScheduleList.set(false);
    this.reportMarkdown.set('');

    try {
      const result = await this.electron.fetchSchedules({
        startDate: this.startDate,
        endDate: this.endDate,
        type: this.reportType,
      });

      if (result?.success) {
        const schedules: SelectableSchedule[] = (result.data || []).map(
          (s: any) => ({ ...s, checked: true }),
        );
        this.fetchedSchedules.set(schedules);

        if (schedules.length === 0) {
          this.errorMessage.set('해당 기간에 일정이 없습니다.');
        } else {
          this.showScheduleList.set(true);
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
   * 전체 선택 / 해제 토글
   */
  toggleAll() {
    const newValue = !this.allSelected();
    const updated = this.fetchedSchedules().map((s) => ({
      ...s,
      checked: newValue,
    }));
    this.fetchedSchedules.set(updated);
  }

  /**
   * Step 2: 선택된 일정으로 보고서 생성
   */
  async confirmGenerate() {
    const selected = this.fetchedSchedules().filter((s) => s.checked);
    if (selected.length === 0) return;

    this.generating.set(true);
    this.errorMessage.set('');

    try {
      const result = await this.electron.generateReport({
        schedules: selected,
        type: this.reportType,
        startDate: this.startDate,
        endDate: this.endDate,
      });

      if (result?.success) {
        this.reportMarkdown.set(result.data.markdown);
        this.scheduleCount.set(result.data.schedules?.length || 0);
        this.previewHtml.set(this.markdownToHtml(result.data.markdown));
        this.showScheduleList.set(false);
      } else {
        this.errorMessage.set(result?.error || '보고서 생성 실패');
      }
    } catch (e: any) {
      this.errorMessage.set(e.message || '오류가 발생했습니다.');
    }

    this.generating.set(false);
  }

  cancelGenerate() {
    this.showScheduleList.set(false);
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
