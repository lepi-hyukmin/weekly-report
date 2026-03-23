import { GoogleGenerativeAI } from '@google/generative-ai';
import { loadConfig } from './config.service';

/**
 * Gemini API를 사용한 보고서 AI 요약 서비스
 */
export class GeminiService {
  private getClient(): GoogleGenerativeAI {
    const config = loadConfig();
    if (!config.geminiApiKey) {
      throw new Error('Gemini API 키가 설정되지 않았습니다.');
    }
    return new GoogleGenerativeAI(config.geminiApiKey);
  }

  /**
   * 3줄 요약 생성 (상황/진행/요청)
   */
  async generateSummary(reportContent: string): Promise<string> {
    const config = loadConfig();
    const genAI = this.getClient();
    const model = genAI.getGenerativeModel({ model: config.geminiModel });

    const prompt = `당신은 IT 회사의 주간 업무 보고서 작성 전문가입니다.
아래 상세 업무 내용을 바탕으로 3줄 요약을 작성해주세요.

규칙:
1. 반드시 "상황", "진행", "요청" 3가지 항목으로 작성
2. 각 항목은 1줄로 간결하게
3. "상황"은 전체적인 프로젝트 현황
4. "진행"은 구체적으로 진행 중인 작업
5. "요청"은 의사결정이나 협조가 필요한 사항 (없으면 "없음")
6. 마크다운 형식으로 출력

출력 형식:
- **상황:** [내용]
- **진행:** [내용]
- **요청:** [내용]

상세 업무 내용:
${reportContent}`;

    const result = await model.generateContent(prompt);
    const response = result.response;
    return response.text();
  }

  /**
   * 의사결정/향후 계획 초안 생성
   */
  async generatePlanDraft(reportContent: string): Promise<string> {
    const config = loadConfig();
    const genAI = this.getClient();
    const model = genAI.getGenerativeModel({ model: config.geminiModel });

    const prompt = `당신은 IT 회사의 주간 업무 보고서 작성 전문가입니다.
아래 상세 업무 내용을 바탕으로 "의사결정 요청 및 향후 계획" 섹션의 초안을 작성해주세요.

규칙:
1. 진행 중인 프로젝트의 차주 계획을 간결하게 정리
2. 의사결정이 필요한 사항이 있으면 포함
3. 마크다운 불릿 포인트로 작성
4. 2-3줄 이내로 간결하게

상세 업무 내용:
${reportContent}`;

    const result = await model.generateContent(prompt);
    const response = result.response;
    return response.text();
  }

  /**
   * 프로젝트별 완료 업무 설명 생성
   */
  async generateCompletedWorkSummary(
    projectName: string,
    schedules: Array<{ title: string; childContent: string[] }>,
  ): Promise<string[]> {
    if (schedules.length === 0) return [];

    const config = loadConfig();
    const genAI = this.getClient();
    const model = genAI.getGenerativeModel({ model: config.geminiModel });

    const content = schedules
      .map((schedule, index) => {
        const details =
          schedule.childContent.length > 0
            ? schedule.childContent.map((item) => `- ${item}`).join('\n')
            : '- 세부 내용 없음';
        return `[완료 업무 ${index + 1}] ${schedule.title}\n${details}`;
      })
      .join('\n\n');

    const prompt = `당신은 IT 회사의 프로젝트 주간 보고서 작성 전문가입니다.
아래는 프로젝트 "${projectName}" 에서 완료된 업무 목록입니다.

규칙:
1. 각 완료 업무마다 1개의 불릿 라인을 작성합니다.
2. 각 라인은 자연스러운 한국어 문장 1문장으로 작성합니다.
3. 일정 제목과 세부 내용을 바탕으로 "무엇이 완료되었는지"를 간결하게 정리합니다.
4. 출력은 반드시 마크다운 불릿 목록만 사용합니다.
5. 각 줄은 "- " 로 시작합니다.
6. 항목 수는 입력된 완료 업무 수를 넘지 않습니다.

입력:
${content}`;

    const result = await model.generateContent(prompt);
    const response = result.response.text();

    return response
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.startsWith('-'))
      .map((line) => line.replace(/^-\s*/, '').trim())
      .filter(Boolean);
  }

  /**
   * 긴 상세내용을 요약 (5개 초과 시)
   * schedules 배열을 받아서 childContent가 5개 초과인 항목만 요약
   */
  async summarizeChildContents(
    schedules: Array<{ title: string; childContent: string[] }>,
  ): Promise<Map<string, string[]>> {
    const THRESHOLD = 5;
    const longItems = schedules.filter(
      (s) => s.childContent.length > THRESHOLD,
    );

    if (longItems.length === 0) return new Map();

    const config = loadConfig();
    const genAI = this.getClient();
    const model = genAI.getGenerativeModel({ model: config.geminiModel });

    // 배치 프롬프트: 여러 일정을 한번에 요약
    const itemsText = longItems
      .map(
        (s, i) =>
          `[일정 ${i + 1}] ${s.title}\n${s.childContent.map((c) => `- ${c}`).join('\n')}`,
      )
      .join('\n\n');

    const prompt = `당신은 IT 회사의 업무 보고서 작성 전문가입니다.
아래 각 일정의 상세 항목들을 요약해주세요.

규칙:
1. 각 일정별로 핵심 업무 내용만 추려서 최대 5개 불릿포인트로 요약
2. 참고자료, URL, 내부 메모 등 보고서에 불필요한 내용은 제외
3. 구체적인 업무 내용 위주로 간결하게 작성
4. 각 일정을 [일정 N] 형태로 구분하여 출력
5. 각 항목은 "- " 로 시작

출력 형식:
[일정 1]
- 요약된 항목1
- 요약된 항목2

[일정 2]
- 요약된 항목1

상세 항목:
${itemsText}`;

    try {
      const result = await model.generateContent(prompt);
      const responseText = result.response.text();

      // 응답 파싱
      const summaryMap = new Map<string, string[]>();
      const sections = responseText.split(/\[일정 \d+\]/);

      for (let i = 1; i < sections.length && i <= longItems.length; i++) {
        const lines = sections[i]
          .trim()
          .split('\n')
          .filter((l) => l.trim().startsWith('-'))
          .map((l) => l.trim().replace(/^- /, ''));

        if (lines.length > 0) {
          summaryMap.set(longItems[i - 1].title, lines);
        }
      }

      return summaryMap;
    } catch (error) {
      console.error('[Gemini] 상세내용 요약 실패:', error);
      // 실패 시 앞 5개만 잘라서 반환
      const fallbackMap = new Map<string, string[]>();
      for (const item of longItems) {
        fallbackMap.set(item.title, [
          ...item.childContent.slice(0, THRESHOLD),
          `외 ${item.childContent.length - THRESHOLD}건`,
        ]);
      }
      return fallbackMap;
    }
  }

  /**
   * 연결 테스트
   */
  async testConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      const genAI = this.getClient();
      const config = loadConfig();
      const model = genAI.getGenerativeModel({ model: config.geminiModel });
      const result = await model.generateContent('Hello');
      result.response.text();
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }
}
