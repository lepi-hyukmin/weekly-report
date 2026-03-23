import { NotionSchedule } from './notion.service';

export interface ProjectGroup {
  projectName: string;
  projectUrl: string;
  schedules: NotionSchedule[];
}

export interface ProjectReport {
  projectName: string;
  projectUrl: string;
  markdown: string;
  scheduleCount: number;
  completedCount: number;
  pendingCount: number;
}

export interface ReportIssueInput {
  id: string;
  projectName: string;
  content: string;
}

/**
 * 보고서 생성 엔진
 */
export class ReportService {
  buildProjectGroups(schedules: NotionSchedule[]): ProjectGroup[] {
    const projectMap = new Map<string, ProjectGroup>();

    for (const schedule of schedules) {
      const projectName = (schedule.project || '').trim();
      if (!projectName || projectName === '기타') continue;

      if (!projectMap.has(projectName)) {
        projectMap.set(projectName, {
          projectName,
          projectUrl: schedule.projectUrl || '',
          schedules: [],
        });
      }

      projectMap.get(projectName)!.schedules.push(schedule);
    }

    return Array.from(projectMap.values())
      .map((group) => ({
        ...group,
        schedules: [...group.schedules].sort((a, b) =>
          a.date.localeCompare(b.date),
        ),
      }))
      .sort((a, b) => {
        const countDiff = b.schedules.length - a.schedules.length;
        if (countDiff !== 0) return countDiff;
        return a.projectName.localeCompare(b.projectName, 'ko');
      });
  }

  generateProjectReports(
    schedules: NotionSchedule[],
    startDate: string,
    endDate: string,
    authorName: string,
    completedSummaryMap: Map<string, string[]>,
    issueMap: Map<string, ReportIssueInput[]>,
  ): ProjectReport[] {
    const projectGroups = this.buildProjectGroups(schedules);

    return projectGroups.map((projectGroup) => {
      const completedSchedules = projectGroup.schedules.filter((schedule) =>
        this.isCompleted(schedule.status),
      );
      const pendingSchedules = projectGroup.schedules.filter(
        (schedule) => !this.isCompleted(schedule.status),
      );
      const markdown = this.renderProjectReport(
        projectGroup,
        startDate,
        endDate,
        authorName,
        completedSummaryMap.get(projectGroup.projectName) || [],
        issueMap.get(projectGroup.projectName) || [],
      );

      return {
        projectName: projectGroup.projectName,
        projectUrl: projectGroup.projectUrl,
        markdown,
        scheduleCount: projectGroup.schedules.length,
        completedCount: completedSchedules.length,
        pendingCount: pendingSchedules.length,
      };
    });
  }

  private renderProjectReport(
    projectGroup: ProjectGroup,
    startDate: string,
    endDate: string,
    authorName: string,
    completedSummaryLines: string[],
    issues: ReportIssueInput[],
  ): string {
    const completedSchedules = projectGroup.schedules.filter((schedule) =>
      this.isCompleted(schedule.status),
    );
    const pendingSchedules = projectGroup.schedules.filter(
      (schedule) => !this.isCompleted(schedule.status),
    );

    const lines: string[] = [];

    lines.push('### **1. 프로젝트 개요 (Properties)**');
    lines.push('');
    lines.push('---');
    lines.push('');
    lines.push(`- **프로젝트명:** ${projectGroup.projectName}`);
    lines.push(
      `- **보고 기간:** ${this.formatReportPeriod(startDate)} ~ ${this.formatReportPeriod(endDate)}`,
    );
    lines.push(`- **작성자:** ${authorName || '-'}`);
    lines.push(
      '- **현 단계 (Phase):** 기획(%) -> 디자인(%) -> 개발(%) -> 테스트(%)',
    );
    lines.push('');
    lines.push(
      '### **2. 🗺️ 마일스톤(목표) 및 체크리스트 점검 (Process Check)**',
    );
    lines.push('');
    lines.push('---');
    lines.push('');
    lines.push(
      '*기존 업무분장표(매뉴얼)의 프로세스를 기준으로 현재 위치를 점검합니다.*',
    );
    lines.push('');
    lines.push("[해당 프로젝트의 '해당 기간(주/월) 중' 해결 된 업무 분장]");
    lines.push('');
    lines.push(
      ...this.renderCompletedLines(completedSchedules, completedSummaryLines),
    );
    lines.push('');
    lines.push("[해당 프로젝트의 '남은' 업무 분장]");
    lines.push('');
    lines.push('- 예정');
    lines.push(...this.renderPendingLines(pendingSchedules));
    lines.push('');
    lines.push('### **3. ⚠️ 이슈 (Issue)**');
    lines.push('');
    lines.push('---');
    lines.push('');
    lines.push(...this.renderIssueLines(issues, authorName, endDate));
    lines.push('');

    return lines.join('\n');
  }

  private renderCompletedLines(
    completedSchedules: NotionSchedule[],
    completedSummaryLines: string[],
  ): string[] {
    if (completedSchedules.length === 0) {
      return ['- 없음'];
    }

    const sanitized = completedSummaryLines
      .map((line) => line.trim().replace(/^-\s*/, ''))
      .filter(Boolean);

    if (sanitized.length > 0) {
      return sanitized.map((line) => `- ${line}`);
    }

    return completedSchedules.map((schedule) => `- ${schedule.title}`);
  }

  private renderPendingLines(pendingSchedules: NotionSchedule[]): string[] {
    if (pendingSchedules.length === 0) {
      return ['    - 없음'];
    }

    return pendingSchedules
      .slice()
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(
        (schedule) =>
          `    - ${this.formatPendingDate(schedule.date)}: ${schedule.title}`,
      );
  }

  private formatReportPeriod(date: string): string {
    if (!date) return '-';

    const value = new Date(date);
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}.${month}.${day}`;
  }

  private formatPendingDate(date: string): string {
    if (!date) return '~-';

    const value = new Date(date);
    const days = ['일', '월', '화', '수', '목', '금', '토'];
    const month = value.getMonth() + 1;
    const day = String(value.getDate()).padStart(2, '0');
    return `~${month}/${day} (${days[value.getDay()]})`;
  }

  private renderIssueLines(
    issues: ReportIssueInput[],
    authorName: string,
    endDate: string,
  ): string[] {
    if (issues.length === 0) {
      return ['- 이슈 없음'];
    }

    const deadline = this.formatIssueDeadline(endDate);
    const lines: string[] = [];

    issues.forEach((issue, index) => {
      const content = issue.content.trim();
      lines.push(`- 이슈 ${index + 1}`);
      lines.push('    - 내용');
      lines.push(`        - ${content}`);
      lines.push('    - 원인');
      lines.push(`        - ${this.buildIssueCause(content)}`);
      lines.push('    - 대응 방안');
      lines.push('        - 방안');
      lines.push(`            - ${this.buildIssueAction(content)}`);
      lines.push('        - 담당자');
      lines.push(`            - ${authorName || '-'}`);
      lines.push('        - 기한');
      lines.push(`            - ${deadline}`);
    });

    return lines;
  }

  private buildIssueCause(content: string): string {
    const normalized = content.replace(/\s*상태$/, '').trim();
    if (!normalized) {
      return '관련 선행 자료 확인 및 요청 절차가 아직 진행되지 않음';
    }
    return `${normalized}와 관련된 선행 자료 확인 및 요청 절차가 아직 완료되지 않음`;
  }

  private buildIssueAction(content: string): string {
    const normalized = content.replace(/\s*상태$/, '').trim();
    if (!normalized) {
      return '필요 자료를 확인하고 요청을 진행해 선행 조건을 확보할 예정';
    }
    return `${normalized} 문제를 해소하기 위해 필요한 자료 확인 및 요청을 우선 진행할 예정`;
  }

  private formatIssueDeadline(date: string): string {
    if (!date) return '~-';

    const value = new Date(date);
    const days = ['일', '월', '화', '수', '목', '금', '토'];
    return `~${value.getMonth() + 1}/${String(value.getDate()).padStart(2, '0')}(${days[value.getDay()]})`;
  }

  private isCompleted(status: string): boolean {
    return (status || '').trim() === '완료';
  }
}
