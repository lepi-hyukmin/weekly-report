import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { marked } from 'marked';
import { ElectronService } from '../../services/electron.service';
import {
  ReportStateService,
  ReportType,
  SelectableSchedule,
} from '../../services/report-state.service';

@Component({
  selector: 'app-report',
  imports: [FormsModule],
  template: `
    <div class="report-page">
      <h1 class="page-title">📝 보고서 생성</h1>

      <!-- 생성 폼 -->
      <section class="card generate-card">
        <div
          class="form-row"
          [class.disabled-form]="state.loading() || state.generating()"
        >
          <div class="form-group">
            <label class="field-label">시작일</label>
            <input
              type="date"
              class="input"
              [(ngModel)]="state.startDate"
              [disabled]="state.loading() || state.generating()"
            />
          </div>
          <div class="form-group">
            <label class="field-label">종료일</label>
            <input
              type="date"
              class="input"
              [(ngModel)]="state.endDate"
              [disabled]="state.loading() || state.generating()"
            />
          </div>
          <div class="form-group">
            <label class="field-label">유형</label>
            <div class="type-buttons">
              <button
                class="type-btn"
                [class.active]="state.reportType === 'WORK'"
                (click)="setReportType('WORK')"
                [disabled]="
                  state.loading() ||
                  state.generating() ||
                  state.showScheduleList()
                "
              >
                업무 보고서
              </button>
              <button
                class="type-btn"
                [class.active]="state.reportType === 'PROJECT'"
                (click)="setReportType('PROJECT')"
                [disabled]="
                  state.loading() ||
                  state.generating() ||
                  state.showScheduleList()
                "
              >
                프로젝트 보고서
              </button>
            </div>
          </div>
        </div>
        @if (state.loading()) {
          <div class="btn-row">
            <button class="btn btn-primary btn-generate loading-btn" disabled>
              <span class="loading-spinner"></span>
              일정 조회 중...
            </button>
            <button class="btn btn-cancel" (click)="cancelFetch()">취소</button>
          </div>
        } @else {
          <button
            class="btn btn-primary btn-generate"
            (click)="fetchSchedules()"
          >
            일정 조회
          </button>
        }
        @if (state.errorMessage()) {
          <p class="error-msg">{{ state.errorMessage() }}</p>
        }
      </section>

      <!-- 일정 선택 목록 -->
      @if (state.showScheduleList()) {
        <section class="card schedule-list-card">
          <div class="schedule-list-header">
            <div class="schedule-list-info">
              <span class="schedule-count">
                총 <strong>{{ state.fetchedSchedules().length }}</strong
                >건 조회
                <span class="schedule-total"
                  >(선택 {{ state.selectedCount() }}건)</span
                >
              </span>
            </div>
            <div class="schedule-list-actions">
              <button class="btn btn-text" (click)="toggleAll()">
                {{ state.allSelected() ? '☐ 전체 해제' : '☑ 전체 선택' }}
              </button>
            </div>
          </div>

          <div class="schedule-list">
            @for (s of state.fetchedSchedules(); track s.id; let i = $index) {
              @if (
                i === 0 || s.project !== state.fetchedSchedules()[i - 1].project
              ) {
                <div
                  class="project-group-header"
                  (click)="onGroupToggle(s.project)"
                >
                  📁 {{ s.project || '기타' }}
                </div>
              }
              <label class="schedule-row" [class.unchecked]="!s.checked">
                <input
                  type="checkbox"
                  class="schedule-checkbox"
                  [checked]="s.checked"
                  (change)="onCheckChange(s.id, $event)"
                />
                <span
                  class="schedule-status"
                  [class.done]="s.status === '완료'"
                  >{{ s.status || '-' }}</span
                >
                <span class="schedule-title">{{ s.title }}</span>
                <span class="schedule-date">{{
                  formatDisplayDate(s.date)
                }}</span>
              </label>
            }
          </div>

          <div class="schedule-list-footer">
            @if (!state.generating()) {
              <button class="btn btn-secondary" (click)="cancelSelection()">
                취소
              </button>
            }
            @if (state.generating()) {
              <div class="btn-row">
                <button class="btn btn-primary" disabled>
                  <span class="loading-spinner"></span>
                  보고서 생성 중...
                </button>
                <button
                  class="btn btn-cancel"
                  (click)="cancelGenerateProcess()"
                >
                  취소
                </button>
              </div>
            } @else {
              <button
                class="btn btn-primary"
                (click)="confirmGenerate()"
                [disabled]="state.selectedCount() === 0"
              >
                보고서 생성 ({{ state.selectedCount() }}건)
              </button>
            }
          </div>
        </section>
      }

      <!-- 결과 (에디터 + 미리보기) -->
      @if (state.hasWorkReport()) {
        <section class="card result-card">
          @if (state.workReport(); as workReport) {
            <div class="result-header">
              <div class="project-report-summary">
                <div class="project-report-title">업무 보고서</div>
                <div class="project-report-meta">
                  총 {{ workReport.scheduleCount }}건 일정 반영
                </div>
              </div>
              <div class="result-header-right">
                <div class="tab-buttons">
                  <button
                    class="tab-btn"
                    [class.active]="state.activeTab() === 'preview'"
                    (click)="state.activeTab.set('preview')"
                  >
                    👁️ 미리보기
                  </button>
                  <button
                    class="tab-btn"
                    [class.active]="state.activeTab() === 'edit'"
                    (click)="state.activeTab.set('edit')"
                  >
                    ✏️ 편집
                  </button>
                </div>
                <div class="action-buttons">
                  <button class="btn btn-secondary" (click)="copyToClipboard()">
                    {{ state.copied() ? '✅ 복사됨!' : '📋 마크다운 복사' }}
                  </button>
                </div>
              </div>
            </div>

            <div class="result-body">
              @if (state.activeTab() === 'edit') {
                <textarea
                  class="editor"
                  [ngModel]="workReport.markdown"
                  (ngModelChange)="onWorkMarkdownChange($event)"
                ></textarea>
              } @else {
                <div class="preview" [innerHTML]="workReport.previewHtml"></div>
              }
            </div>
          }
        </section>

        <section class="card info-card">
          <p class="info-text">
            📊 총 <strong>1</strong>개 업무 보고서에
            <strong>{{ state.workReport()?.scheduleCount || 0 }}</strong
            >개 일정이 반영되었습니다.
          </p>
        </section>
      }

      @if (state.hasGeneratedReports()) {
        <section class="card result-card">
          <div class="project-report-tabs">
            @for (
              report of state.generatedReports();
              track report.projectName
            ) {
              <button
                class="project-report-tab"
                [class.active]="
                  state.activeProjectName() === report.projectName
                "
                (click)="selectProjectReport(report.projectName)"
              >
                <span>{{ report.projectName }}</span>
                <span class="project-report-badge">{{
                  report.scheduleCount
                }}</span>
              </button>
            }
          </div>

          @if (state.activeReport(); as activeReport) {
            <div class="result-header">
              <div class="project-report-summary">
                <div class="project-report-title">
                  {{ activeReport.projectName }}
                </div>
                <div class="project-report-meta">
                  총 {{ activeReport.scheduleCount }}건 · 완료
                  {{ activeReport.completedCount }}건 · 남은 업무
                  {{ activeReport.pendingCount }}건
                </div>
              </div>
              <div class="result-header-right">
                <div class="tab-buttons">
                  <button
                    class="tab-btn"
                    [class.active]="state.activeTab() === 'preview'"
                    (click)="state.activeTab.set('preview')"
                  >
                    👁️ 미리보기
                  </button>
                  <button
                    class="tab-btn"
                    [class.active]="state.activeTab() === 'edit'"
                    (click)="state.activeTab.set('edit')"
                  >
                    ✏️ 편집
                  </button>
                </div>
                <div class="action-buttons">
                  <button class="btn btn-secondary" (click)="copyToClipboard()">
                    {{ state.copied() ? '✅ 복사됨!' : '📋 마크다운 복사' }}
                  </button>
                </div>
              </div>
            </div>

            <div class="result-body">
              @if (state.activeTab() === 'edit') {
                <textarea
                  class="editor"
                  [ngModel]="activeReport.markdown"
                  (ngModelChange)="onProjectMarkdownChange($event)"
                ></textarea>
              } @else {
                <div
                  class="preview"
                  [innerHTML]="activeReport.previewHtml"
                ></div>
              }
            </div>
          }
        </section>

        <!-- 일정 요약 -->
        @if (state.totalGeneratedScheduleCount() > 0) {
          <section class="card info-card">
            <p class="info-text">
              📊 총 <strong>{{ state.generatedReports().length }}</strong
              >개 프로젝트,
              <strong>{{ state.totalGeneratedScheduleCount() }}</strong
              >개 일정이 반영되었습니다.
            </p>
          </section>
        }
      }

      @if (state.showIssueModal()) {
        <div class="modal-backdrop">
          <section class="issue-modal">
            <div class="issue-modal-header">
              <div>
                <h2 class="issue-modal-title">이슈 입력</h2>
                <p class="issue-modal-subtitle">
                  해당 내용으로 보고서를 작성하시겠습니까?
                </p>
              </div>
              <button class="btn btn-text" (click)="closeIssueModal()">
                닫기
              </button>
            </div>

            <div class="issue-modal-body">
              <div class="issue-section-title">프로젝트별 이슈 입력</div>

              @for (
                section of state.issueSections();
                track section.projectName
              ) {
                <section class="issue-project-section">
                  <div class="issue-project-header">
                    <h3 class="issue-project-title">
                      {{ section.projectName }}
                    </h3>
                  </div>

                  @if (section.issues.length === 0) {
                    <p class="issue-empty">이슈 없음</p>
                  }

                  @for (
                    issue of section.issues;
                    track issue.id;
                    let i = $index
                  ) {
                    <div class="issue-row">
                      <div class="issue-row-top">
                        <span class="issue-row-label">이슈{{ i + 1 }}</span>
                        <button
                          class="btn btn-text issue-delete-btn"
                          (click)="
                            removeIssueDraft(section.projectName, issue.id)
                          "
                        >
                          삭제
                        </button>
                      </div>

                      <div class="issue-row-fields single-field">
                        <input
                          type="text"
                          class="input issue-content-input"
                          [ngModel]="issue.content"
                          (ngModelChange)="
                            updateIssueContent(
                              section.projectName,
                              issue.id,
                              $event
                            )
                          "
                          placeholder="이슈 내용을 입력하세요"
                        />
                      </div>
                    </div>
                  }

                  <button
                    class="btn btn-secondary issue-add-btn"
                    (click)="addIssueDraft(section.projectName)"
                  >
                    + 추가
                  </button>
                </section>
              }

              <p class="issue-help-text">
                프로젝트별로 이슈를 추가할 수 있으며, 이슈가 없으면 그대로 생성
                가능합니다.
              </p>
            </div>

            <div class="issue-modal-footer">
              <button class="btn btn-secondary" (click)="closeIssueModal()">
                취소
              </button>
              <button class="btn btn-primary" (click)="submitIssueModal()">
                보고서 생성
              </button>
            </div>
          </section>
        </div>
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
        width: 100%;
      }
      .type-btn {
        flex: 1;
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
      .type-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      .disabled-form {
        opacity: 0.5;
        pointer-events: none;
      }
      .loading-spinner {
        display: inline-block;
        width: 14px;
        height: 14px;
        border: 2px solid rgba(255, 255, 255, 0.3);
        border-top-color: #fff;
        border-radius: 50%;
        animation: spin 0.7s linear infinite;
        vertical-align: middle;
        margin-right: 6px;
      }
      @keyframes spin {
        to {
          transform: rotate(360deg);
        }
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
      .btn-cancel {
        background: rgba(255, 99, 99, 0.15);
        color: #ff6363;
        padding: 12px 20px;
        font-size: 14px;
      }
      .btn-cancel:hover {
        background: rgba(255, 99, 99, 0.25);
      }
      .btn-generate {
        padding: 12px 28px;
        font-size: 15px;
        width: 100%;
      }
      .btn-row {
        display: flex;
        gap: 8px;
        width: 100%;
      }
      .btn-row .btn-generate,
      .btn-row .loading-btn {
        flex: 1;
      }
      .btn-row .btn-cancel {
        flex-shrink: 0;
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
        max-height: 490px;
        overflow-y: auto;
      }
      .project-group-header {
        padding: 8px 14px;
        font-size: 12px;
        font-weight: 700;
        color: #667eea;
        background: rgba(102, 126, 234, 0.08);
        border-bottom: 1px solid #2a2a4a;
        letter-spacing: 0.5px;
        cursor: pointer;
        user-select: none;
        transition: background 0.15s;
      }
      .project-group-header:hover {
        background: rgba(102, 126, 234, 0.15);
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
      .schedule-list-footer .btn-row {
        width: auto;
      }

      .result-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 12px;
        padding-bottom: 12px;
        border-bottom: 1px solid #2a2a4a;
        gap: 16px;
      }
      .project-report-tabs {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-bottom: 14px;
      }
      .project-report-tab {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 8px 12px;
        background: #0f0f1a;
        border: 1px solid #2a2a4a;
        border-radius: 999px;
        color: #a7a7c8;
        font-size: 12px;
        cursor: pointer;
        transition: all 0.2s;
      }
      .project-report-tab:hover {
        border-color: #667eea;
        color: #d8d8f0;
      }
      .project-report-tab.active {
        background: rgba(102, 126, 234, 0.15);
        border-color: #667eea;
        color: #fff;
      }
      .project-report-badge {
        min-width: 20px;
        padding: 2px 6px;
        background: rgba(255, 255, 255, 0.08);
        border-radius: 999px;
        font-size: 11px;
        text-align: center;
      }
      .project-report-summary {
        min-width: 0;
      }
      .project-report-title {
        font-size: 16px;
        font-weight: 700;
        color: #fff;
        margin-bottom: 4px;
      }
      .project-report-meta {
        font-size: 12px;
        color: #9a9ac2;
      }
      .result-header-right {
        display: flex;
        align-items: center;
        gap: 10px;
        flex-wrap: wrap;
        justify-content: flex-end;
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
        display: block;
        width: 100%;
        height: 450px;
        margin: 0;
        padding: 16px;
        background: #0f0f1a;
        border: 1px solid #2a2a4a;
        border-radius: 8px;
        color: #e0e0e0;
        font-family: 'Consolas', 'Monaco', monospace;
        font-size: 13px;
        line-height: 1.7;
        resize: none;
        outline: none;
        box-sizing: border-box;
      }
      .editor:focus {
        border-color: #667eea;
      }
      .preview {
        padding: 16px;
        background: #0f0f1a;
        border: 1px solid #2a2a4a;
        border-radius: 8px;
        height: 450px;
        overflow-y: auto;
        font-size: 14px;
        line-height: 1.8;
        color: #d0d0e0;
        box-sizing: border-box;
      }
      :host ::ng-deep .preview > *:last-child {
        margin-bottom: 0;
      }
      :host ::ng-deep .preview h1 {
        font-size: 20px;
        color: #fff;
        margin: 20px 0 12px;
        padding-bottom: 8px;
        border-bottom: 1px solid #2a2a4a;
      }
      :host ::ng-deep .preview h2 {
        font-size: 18px;
        color: #fff;
        margin: 20px 0 12px;
        padding-bottom: 6px;
        border-bottom: 1px solid #2a2a4a;
      }
      :host ::ng-deep .preview h3 {
        font-size: 15px;
        color: #667eea;
        margin: 16px 0 8px;
      }
      :host ::ng-deep .preview h4 {
        font-size: 14px;
        color: #b0b0d0;
        margin: 12px 0 6px;
      }
      :host ::ng-deep .preview h1:first-child,
      :host ::ng-deep .preview h2:first-child {
        margin-top: 0;
      }
      :host ::ng-deep .preview strong {
        color: #fff;
      }
      :host ::ng-deep .preview a {
        color: #667eea;
        text-decoration: none;
      }
      :host ::ng-deep .preview a:hover {
        text-decoration: underline;
      }
      :host ::ng-deep .preview p {
        margin: 6px 0;
      }
      :host ::ng-deep .preview ul,
      :host ::ng-deep .preview ol {
        padding-left: 24px;
        margin: 4px 0;
        list-style-type: disc;
      }
      :host ::ng-deep .preview ul ul {
        list-style-type: circle;
      }
      :host ::ng-deep .preview ul ul ul {
        list-style-type: square;
      }
      :host ::ng-deep .preview li {
        margin: 3px 0;
      }
      :host ::ng-deep .preview li > ul,
      :host ::ng-deep .preview li > ol {
        margin: 2px 0;
        padding-left: 24px;
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
  constructor(
    private electron: ElectronService,
    protected state: ReportStateService,
  ) {
    state.initDates();
  }

  /**
   * Step 1: 일정 조회 → 체크박스 목록 표시
   */
  async fetchSchedules() {
    if (!this.state.startDate || !this.state.endDate) {
      this.state.errorMessage.set('시작일과 종료일을 입력해주세요.');
      return;
    }

    this.state.loading.set(true);
    this.state.errorMessage.set('');
    this.state.showScheduleList.set(false);
    this.state.clearGeneratedReports();
    this.state.resetIssueModalState();

    try {
      const result = await this.electron.fetchSchedules({
        startDate: this.state.startDate,
        endDate: this.state.endDate,
        type: this.state.reportType,
      });

      // 취소됐으면 결과 무시
      if (this.state.isFetchAborted()) return;

      if (result?.success) {
        const schedules: SelectableSchedule[] = (result.data || []).map(
          (s: any) => ({
            ...s,
            checked: (s.project || '기타') !== '기타',
          }),
        );

        // 프로젝트별 그룹화 후 그룹 내 날짜순 정렬 (기타는 맨 하단)
        const grouped = new Map<string, SelectableSchedule[]>();
        for (const s of schedules) {
          const key = s.project || '기타';
          if (!grouped.has(key)) grouped.set(key, []);
          grouped.get(key)!.push(s);
        }
        const etcGroup = grouped.get('기타') || [];
        grouped.delete('기타');
        const sorted = Array.from(grouped.values()).flatMap((items) =>
          items.sort((a, b) => a.date.localeCompare(b.date)),
        );
        if (etcGroup.length > 0) {
          sorted.push(...etcGroup.sort((a, b) => a.date.localeCompare(b.date)));
        }
        this.state.fetchedSchedules.set(sorted);

        if (schedules.length === 0) {
          this.state.errorMessage.set('해당 기간에 일정이 없습니다.');
        } else {
          this.state.showScheduleList.set(true);
        }
      } else {
        this.state.errorMessage.set(result?.error || '일정 조회 실패');
      }
    } catch (e: any) {
      if (!this.state.isFetchAborted()) {
        this.state.errorMessage.set(e.message || '오류가 발생했습니다.');
      }
    } finally {
      this.state.loading.set(false);
    }
  }

  /**
   * 전체 선택 / 해제 토글
   */
  toggleAll() {
    const newValue = !this.state.allSelected();
    const updated = this.state.fetchedSchedules().map((s) => ({
      ...s,
      checked: newValue,
    }));
    this.state.fetchedSchedules.set(updated);
  }

  /**
   * Step 2: 선택된 일정으로 보고서 생성
   */
  confirmGenerate() {
    const selected = this.state.fetchedSchedules().filter((s) => s.checked);
    if (selected.length === 0) return;

    this.state.errorMessage.set('');

    if (this.state.reportType === 'PROJECT') {
      this.state.openIssueModal(selected);
      return;
    }

    void this.generateWorkReport(selected);
  }

  private async generateWorkReport(selected: SelectableSchedule[]) {
    this.state.generating.set(true);
    this.state.errorMessage.set('');

    try {
      const result = await this.electron.generateReport({
        schedules: selected,
        type: this.state.reportType,
        startDate: this.state.startDate,
        endDate: this.state.endDate,
        issues: [],
      });

      if (this.state.isGenerateAborted()) return;

      if (result?.success && result.data?.workReport) {
        this.state.setWorkReport({
          ...result.data.workReport,
          previewHtml: this.markdownToHtml(result.data.workReport.markdown),
        });
        this.state.showScheduleList.set(false);
      } else {
        this.state.errorMessage.set(result?.error || '보고서 생성 실패');
      }
    } catch (e: any) {
      if (!this.state.isGenerateAborted()) {
        this.state.errorMessage.set(e.message || '오류가 발생했습니다.');
      }
    } finally {
      this.state.generating.set(false);
    }
  }

  async submitIssueModal() {
    const selected = this.state.pendingSelectedSchedules();
    if (selected.length === 0) return;

    this.state.generating.set(true);
    this.state.errorMessage.set('');
    this.state.closeIssueModal();

    const issues = this.state
      .issueSections()
      .flatMap((section) =>
        section.issues.map((issue) => ({
          id: issue.id,
          projectName: section.projectName.trim(),
          content: issue.content.trim(),
        })),
      )
      .filter((issue) => issue.projectName && issue.content);

    try {
      const result = await this.electron.generateReport({
        schedules: selected,
        type: this.state.reportType,
        startDate: this.state.startDate,
        endDate: this.state.endDate,
        issues,
      });

      // 취소됐으면 결과 무시
      if (this.state.isGenerateAborted()) return;

      if (result?.success) {
        const projectReports = (result.data?.projectReports || []).map(
          (report: any) => ({
            ...report,
            previewHtml: this.markdownToHtml(report.markdown),
          }),
        );

        if (projectReports.length === 0) {
          this.state.errorMessage.set(
            result.data?.excludedScheduleCount > 0
              ? '프로젝트가 지정된 일정만 보고서를 생성할 수 있습니다.'
              : '생성 가능한 프로젝트 보고서가 없습니다.',
          );
          return;
        }

        this.state.setGeneratedReports(projectReports);
        this.state.showScheduleList.set(false);
      } else {
        this.state.errorMessage.set(result?.error || '보고서 생성 실패');
      }
    } catch (e: any) {
      if (!this.state.isGenerateAborted()) {
        this.state.errorMessage.set(e.message || '오류가 발생했습니다.');
      }
    } finally {
      this.state.generating.set(false);
    }
  }

  cancelFetch() {
    this.state.cancelFetch();
  }

  cancelGenerateProcess() {
    this.state.cancelGenerate();
  }

  cancelSelection() {
    this.state.showScheduleList.set(false);
    this.state.fetchedSchedules.set([]);
    this.state.resetIssueModalState();
  }

  closeIssueModal() {
    this.state.closeIssueModal();
  }

  addIssueDraft(projectName: string) {
    this.state.addIssueDraft(projectName);
  }

  setReportType(type: ReportType) {
    this.state.reportType = type;
  }

  removeIssueDraft(projectName: string, id: string) {
    this.state.removeIssueDraft(projectName, id);
  }

  updateIssueContent(projectName: string, id: string, content: string) {
    this.state.updateIssueDraft(projectName, id, content);
  }

  selectProjectReport(projectName: string) {
    this.state.setActiveProject(projectName);
  }

  onGroupToggle(project: string) {
    const key = project || '기타';
    const group = this.state
      .fetchedSchedules()
      .filter((s) => (s.project || '기타') === key);
    const anyChecked = group.some((s) => s.checked);
    const updated = this.state
      .fetchedSchedules()
      .map((s) =>
        (s.project || '기타') === key ? { ...s, checked: !anyChecked } : s,
      );
    this.state.fetchedSchedules.set(updated);
  }

  onProjectMarkdownChange(value: string) {
    this.state.updateActiveReport(value, this.markdownToHtml(value));
  }

  onWorkMarkdownChange(value: string) {
    this.state.updateWorkReport(value, this.markdownToHtml(value));
  }

  onCheckChange(id: string, event: Event) {
    const checked = (event.target as HTMLInputElement).checked;
    const updated = this.state
      .fetchedSchedules()
      .map((s) => (s.id === id ? { ...s, checked } : s));
    this.state.fetchedSchedules.set(updated);
  }

  formatDisplayDate(dateStr: string): string {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    const days = ['일', '월', '화', '수', '목', '금', '토'];
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${mm}.${dd} (${days[d.getDay()]})`;
  }

  async copyToClipboard() {
    const markdown =
      this.state.workReport()?.markdown ||
      this.state.activeReport()?.markdown ||
      '';
    if (!markdown) return;

    try {
      await navigator.clipboard.writeText(markdown);
      this.state.copied.set(true);
      setTimeout(() => this.state.copied.set(false), 2000);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = markdown;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      this.state.copied.set(true);
      setTimeout(() => this.state.copied.set(false), 2000);
    }
  }

  private markdownToHtml(md: string): string {
    return marked.parse(md, { async: false }) as string;
  }
}
