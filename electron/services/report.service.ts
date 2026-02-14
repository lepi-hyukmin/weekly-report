import { NotionSchedule } from './notion.service';

export interface ProjectGroup {
  projectName: string;
  projectUrl: string;
  categories: CategoryGroup[];
}

export interface CategoryGroup {
  categoryName: string;
  schedules: NotionSchedule[];
}

/**
 * 보고서 생성 엔진
 */
export class ReportService {
  /**
   * 보고서 마크다운 생성
   */
  generateReport(
    schedules: NotionSchedule[],
    type: 'MONDAY' | 'FRIDAY',
    startDate: string,
    endDate: string,
    summary: string,
    planDraft: string,
  ): string {
    const projectGroups = this.groupByProject(schedules);
    const detailSection = this.renderDetailSection(
      projectGroups,
      startDate,
      endDate,
    );

    const typeLabel = type === 'MONDAY' ? '월요일' : '금요일';
    const reportLines: string[] = [];

    // 1. 3줄 요약
    reportLines.push('## 1. 3줄 요약');
    reportLines.push('');
    reportLines.push(summary.trim());
    reportLines.push('');

    // 2. 상세 보고
    reportLines.push('## 2. 상세 보고');
    reportLines.push('');
    reportLines.push(`- **발생 시각/기간: ${startDate} ~ ${endDate}**`);
    reportLines.push('');
    reportLines.push('- **상세 내용:**');
    reportLines.push('');
    reportLines.push(detailSection);
    reportLines.push('');

    // 3. 의사결정 요청 및 향후 계획
    reportLines.push('## 3. 의사결정 요청 및 향후 계획');
    reportLines.push('');
    reportLines.push(planDraft.trim());
    reportLines.push('');

    // 4. 첨부 자료
    reportLines.push('## 4. 첨부 자료');
    reportLines.push('');
    reportLines.push('- ');
    reportLines.push('');

    return reportLines.join('\n');
  }

  /**
   * 프로젝트별 그룹핑
   */
  private groupByProject(schedules: NotionSchedule[]): ProjectGroup[] {
    const projectMap = new Map<string, ProjectGroup>();

    for (const schedule of schedules) {
      const projectName = schedule.project || '기타';
      const projectUrl = schedule.projectUrl || '';

      if (!projectMap.has(projectName)) {
        projectMap.set(projectName, {
          projectName,
          projectUrl,
          categories: [],
        });
      }

      const group = projectMap.get(projectName)!;
      const categoryName = schedule.category || '';

      let categoryGroup = group.categories.find(
        (c) => c.categoryName === categoryName,
      );
      if (!categoryGroup) {
        categoryGroup = { categoryName, schedules: [] };
        group.categories.push(categoryGroup);
      }

      categoryGroup.schedules.push(schedule);
    }

    return Array.from(projectMap.values());
  }

  /**
   * 상세 보고 섹션 렌더링
   */
  private renderDetailSection(
    projectGroups: ProjectGroup[],
    _startDate: string,
    _endDate: string,
  ): string {
    const lines: string[] = [];

    for (const project of projectGroups) {
      // 프로젝트 헤더 (링크 포함)
      if (project.projectUrl) {
        lines.push(`### [${project.projectName}](${project.projectUrl})`);
      } else {
        lines.push(`### ${project.projectName}`);
      }
      lines.push('');

      // 상위 항목 그룹핑 필요 여부 판단
      const totalSchedules = project.categories.reduce(
        (sum, cat) => sum + cat.schedules.length,
        0,
      );
      const hasMultipleCategories =
        project.categories.filter((c) => c.categoryName).length > 1;
      const needsCategoryGrouping = hasMultipleCategories && totalSchedules > 1;

      if (needsCategoryGrouping) {
        // 카테고리별 서브 그룹
        for (const category of project.categories) {
          if (category.categoryName) {
            lines.push(`#### ${category.categoryName}`);
            lines.push('');
          }
          for (const schedule of category.schedules) {
            lines.push(...this.renderSchedule(schedule));
          }
          lines.push('');
        }
      } else {
        // 프로젝트 하위로 바로 일정 나열
        const allSchedules = project.categories.flatMap((c) => c.schedules);
        for (const schedule of allSchedules) {
          lines.push(...this.renderSchedule(schedule));
        }
        lines.push('');
      }
    }

    return lines.join('\n');
  }

  /**
   * 개별 일정 렌더링
   */
  private renderSchedule(schedule: NotionSchedule): string[] {
    const lines: string[] = [];

    lines.push(`- ${schedule.title}`);

    // 하위 내용 (서브 불릿)
    for (const child of schedule.childContent) {
      lines.push(`    - ${child}`);
    }

    return lines;
  }
}
