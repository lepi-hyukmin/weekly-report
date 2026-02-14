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
