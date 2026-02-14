import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';

export interface AppConfig {
  notionTokenV2: string;
  notionDbId: string;
  notionUserId: string;
  notionUserName: string;
  geminiApiKey: string;
  geminiModel: string;
}

const DEFAULT_CONFIG: AppConfig = {
  notionTokenV2: '',
  notionDbId: '14993e1c9d5881ba9f62c3e9b3de0284',
  notionUserId: '',
  notionUserName: '',
  geminiApiKey: '',
  geminiModel: 'gemini-2.5-flash',
};

function getConfigPath(): string {
  return path.join(app.getPath('userData'), 'config.json');
}

export function loadConfig(): AppConfig {
  try {
    const configPath = getConfigPath();
    if (fs.existsSync(configPath)) {
      const data = fs.readFileSync(configPath, 'utf-8');
      return { ...DEFAULT_CONFIG, ...JSON.parse(data) };
    }
  } catch (error) {
    console.error('설정 파일 읽기 실패:', error);
  }
  return { ...DEFAULT_CONFIG };
}

export function saveConfig(config: Partial<AppConfig>): AppConfig {
  try {
    const configPath = getConfigPath();
    const current = loadConfig();
    const merged = { ...current, ...config };
    fs.writeFileSync(configPath, JSON.stringify(merged, null, 2), 'utf-8');
    return merged;
  } catch (error) {
    console.error('설정 파일 쓰기 실패:', error);
    throw error;
  }
}
