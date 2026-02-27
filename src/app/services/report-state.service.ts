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

/**
 * 보고서 페이지 상태를 유지하는 싱글턴 서비스
 * 페이지 이동 후 돌아와도 상태가 유지됨
 */
@Injectable({ providedIn: 'root' })
export class ReportStateService {
  // 폼
  startDate = '';
  endDate = '';
  reportType: 'MONDAY' | 'FRIDAY' = 'FRIDAY';

  // 상태
  readonly loading = signal(false);
  readonly generating = signal(false);
  readonly errorMessage = signal('');
  readonly showScheduleList = signal(false);
  readonly fetchedSchedules = signal<SelectableSchedule[]>([]);
  readonly reportMarkdown = signal('');
  readonly previewHtml = signal('');
  readonly scheduleCount = signal(0);
  readonly activeTab = signal<'edit' | 'preview'>('edit');
  readonly copied = signal(false);

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

  private formatDate(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
}
