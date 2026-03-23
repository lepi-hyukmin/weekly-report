import { Injectable, signal, computed } from '@angular/core';

export interface SelectableSchedule {
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

export interface GeneratedProjectReport {
  projectName: string;
  projectUrl: string;
  markdown: string;
  previewHtml: string;
  scheduleCount: number;
  completedCount: number;
  pendingCount: number;
}

export interface IssueDraft {
  id: string;
  content: string;
}

export interface IssueSectionDraft {
  projectName: string;
  issues: IssueDraft[];
}

/**
 * 보고서 페이지 상태를 유지하는 싱글턴 서비스
 * 페이지 이동 후 돌아와도 상태가 유지됨
 */
@Injectable({ providedIn: 'root' })
export class ReportStateService {
  // 폼
  startDate = '';
  endDate = '';
  reportType: 'MONDAY' | 'FRIDAY' = 'MONDAY';

  // 상태
  readonly loading = signal(false);
  readonly generating = signal(false);
  readonly errorMessage = signal('');
  readonly showScheduleList = signal(false);
  readonly fetchedSchedules = signal<SelectableSchedule[]>([]);
  readonly generatedReports = signal<GeneratedProjectReport[]>([]);
  readonly activeProjectName = signal('');
  readonly activeTab = signal<'edit' | 'preview'>('preview');
  readonly copied = signal(false);
  readonly showIssueModal = signal(false);
  readonly issueSections = signal<IssueSectionDraft[]>([]);
  readonly pendingSelectedSchedules = signal<SelectableSchedule[]>([]);

  // 취소용 플래그
  private fetchAborted = false;
  private generateAborted = false;

  // Computed
  readonly selectedCount = computed(
    () => this.fetchedSchedules().filter((s) => s.checked).length,
  );

  readonly allSelected = computed(
    () =>
      this.fetchedSchedules().length > 0 &&
      this.fetchedSchedules().every((s) => s.checked),
  );

  readonly hasGeneratedReports = computed(
    () => this.generatedReports().length > 0,
  );

  readonly activeReport = computed<GeneratedProjectReport | null>(() => {
    const reports = this.generatedReports();
    if (reports.length === 0) return null;

    return (
      reports.find(
        (report) => report.projectName === this.activeProjectName(),
      ) || reports[0]
    );
  });

  readonly totalGeneratedScheduleCount = computed(() =>
    this.generatedReports().reduce(
      (sum, report) => sum + report.scheduleCount,
      0,
    ),
  );

  readonly issueProjectOptions = computed(() =>
    this.issueSections().map((section) => section.projectName),
  );

  // 초기화 여부
  private initialized = false;

  initDates(): void {
    if (this.initialized) return;
    this.initialized = true;

    const now = new Date();
    const dayOfWeek = now.getDay();
    const monday = new Date(now);
    monday.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
    const friday = new Date(monday);
    friday.setDate(monday.getDate() + 4);

    this.startDate = this.formatDate(monday);
    this.endDate = this.formatDate(friday);
  }

  /** 일정 조회 취소 */
  cancelFetch(): void {
    this.fetchAborted = true;
    this.loading.set(false);
  }

  /** 보고서 생성 취소 */
  cancelGenerate(): void {
    this.generateAborted = true;
    this.generating.set(false);
  }

  /** fetch 취소 여부 확인 후 리셋 */
  isFetchAborted(): boolean {
    const v = this.fetchAborted;
    this.fetchAborted = false;
    return v;
  }

  /** generate 취소 여부 확인 후 리셋 */
  isGenerateAborted(): boolean {
    const v = this.generateAborted;
    this.generateAborted = false;
    return v;
  }

  setGeneratedReports(reports: GeneratedProjectReport[]): void {
    this.generatedReports.set(reports);
    this.activeProjectName.set(reports[0]?.projectName || '');
    this.activeTab.set('preview');
    this.copied.set(false);
  }

  clearGeneratedReports(): void {
    this.generatedReports.set([]);
    this.activeProjectName.set('');
    this.activeTab.set('preview');
    this.copied.set(false);
  }

  setActiveProject(projectName: string): void {
    this.activeProjectName.set(projectName);
    this.copied.set(false);
  }

  updateActiveReport(markdown: string, previewHtml: string): void {
    const activeProjectName = this.activeProjectName();
    if (!activeProjectName) return;

    this.generatedReports.update((reports) =>
      reports.map((report) =>
        report.projectName === activeProjectName
          ? { ...report, markdown, previewHtml }
          : report,
      ),
    );
  }

  openIssueModal(selectedSchedules: SelectableSchedule[]): void {
    this.pendingSelectedSchedules.set(selectedSchedules);

    const projectNames = this.extractProjectNames(selectedSchedules);
    const currentSections = new Map(
      this.issueSections().map((section) => [section.projectName, section]),
    );

    this.issueSections.set(
      projectNames.map((projectName) => ({
        projectName,
        issues: currentSections.get(projectName)?.issues || [],
      })),
    );

    this.showIssueModal.set(true);
  }

  closeIssueModal(): void {
    this.showIssueModal.set(false);
  }

  addIssueDraft(projectName: string): void {
    this.issueSections.update((sections) =>
      sections.map((section) =>
        section.projectName === projectName
          ? {
              ...section,
              issues: [...section.issues, this.createIssueDraft()],
            }
          : section,
      ),
    );
  }

  removeIssueDraft(projectName: string, id: string): void {
    this.issueSections.update((sections) =>
      sections.map((section) =>
        section.projectName === projectName
          ? {
              ...section,
              issues: section.issues.filter((draft) => draft.id !== id),
            }
          : section,
      ),
    );
  }

  updateIssueDraft(projectName: string, id: string, value: string): void {
    this.issueSections.update((sections) =>
      sections.map((section) =>
        section.projectName === projectName
          ? {
              ...section,
              issues: section.issues.map((draft) =>
                draft.id === id ? { ...draft, content: value } : draft,
              ),
            }
          : section,
      ),
    );
  }

  resetIssueModalState(): void {
    this.showIssueModal.set(false);
    this.issueSections.set([]);
    this.pendingSelectedSchedules.set([]);
  }

  private createIssueDraft(): IssueDraft {
    return {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      content: '',
    };
  }

  private extractProjectNames(schedules: SelectableSchedule[]): string[] {
    const counts = new Map<string, number>();

    for (const schedule of schedules) {
      const projectName = (schedule.project || '').trim();
      if (!projectName || projectName === '기타') continue;
      counts.set(projectName, (counts.get(projectName) || 0) + 1);
    }

    return Array.from(counts.entries())
      .sort((a, b) => {
        const countDiff = b[1] - a[1];
        if (countDiff !== 0) return countDiff;
        return a[0].localeCompare(b[0], 'ko');
      })
      .map(([projectName]) => projectName);
  }

  private formatDate(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
}
