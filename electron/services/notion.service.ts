import { NotionAPI } from 'notion-client';
import { loadConfig } from './config.service';

export interface NotionSchedule {
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
}

/**
 * NotionMap 이중 중첩 value 추출
 */
function unwrap(entry: any): any {
  if (!entry) return null;
  if (entry?.value?.value !== undefined && entry?.value?.role !== undefined) {
    return entry.value.value;
  }
  if (entry?.value !== undefined) return entry.value;
  return entry;
}

export class NotionService {
  private client: NotionAPI | null = null;

  private getClient(): NotionAPI {
    const config = loadConfig();
    if (!config.notionTokenV2) {
      throw new Error('Notion 로그인이 필요합니다.');
    }
    if (!this.client) {
      this.client = new NotionAPI({
        authToken: config.notionTokenV2,
        userTimeZone: 'Asia/Seoul',
      });
    }
    return this.client;
  }

  resetClient(): void {
    this.client = null;
  }

  async testConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      const config = loadConfig();
      const client = this.getClient();
      await client.getPage(config.notionDbId, {
        chunkLimit: 1,
        fetchCollections: false,
        fetchMissingBlocks: false,
        signFileUrls: false,
      });
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * 기간별 일정 조회 — getCollectionData 사용
   */
  async fetchSchedules(
    startDate: string,
    endDate: string,
    type: 'MONDAY' | 'FRIDAY',
  ): Promise<NotionSchedule[]> {
    const config = loadConfig();
    const client = this.getClient();
    const dbId = config.notionDbId;

    console.log(`[Notion] 일정 조회: ${startDate} ~ ${endDate}, 유형: ${type}`);

    // Step 1: getPage로 컬렉션/뷰 ID 확보
    const pageMap = await client.getPage(dbId, {
      fetchCollections: false,
      fetchMissingBlocks: false,
      signFileUrls: false,
    });

    // 컬렉션 ID와 뷰 ID 찾기
    let collectionId = '';
    let viewId = '';
    const blockEntries = Object.entries(pageMap.block || {});
    for (const [, blockEntry] of blockEntries) {
      const block = unwrap(blockEntry);
      if (
        block &&
        (block.type === 'collection_view' ||
          block.type === 'collection_view_page')
      ) {
        collectionId = block.collection_id || '';
        viewId = block.view_ids?.[0] || '';
        break;
      }
    }

    if (!collectionId || !viewId) {
      console.log('[Notion] 컬렉션 또는 뷰 ID 없음');
      return [];
    }

    console.log(`[Notion] 컬렉션: ${collectionId}, 뷰: ${viewId}`);

    // Step 2: getCollectionData로 전체 데이터 조회
    const collectionData = await client.getCollectionData(
      collectionId,
      viewId,
      undefined,
      { limit: 9999, userTimeZone: 'Asia/Seoul' },
    );

    const recordMap = collectionData.recordMap || {};
    const queryResult = collectionData.result || {};

    // 디버그: 응답 구조 확인
    console.log('[Notion] collectionData 키:', Object.keys(collectionData));
    console.log('[Notion] result 키:', Object.keys(queryResult));
    console.log('[Notion] result.type:', (queryResult as any).type);
    console.log('[Notion] recordMap 키:', Object.keys(recordMap));
    console.log(
      '[Notion] recordMap.block 수:',
      Object.keys(recordMap.block || {}).length,
    );
    // reducerResults 확인
    if ((queryResult as any).reducerResults) {
      console.log(
        '[Notion] reducerResults 키:',
        Object.keys((queryResult as any).reducerResults),
      );
      const rr = (queryResult as any).reducerResults;
      for (const [k, v] of Object.entries(rr) as any[]) {
        console.log(
          `[Notion]   reducer ${k}:`,
          Object.keys(v),
          v.blockIds?.length ?? 'no blockIds',
        );
      }
    }
    // collection_group_results 확인
    if ((queryResult as any).collection_group_results) {
      const cgr = (queryResult as any).collection_group_results;
      console.log(
        '[Notion] collection_group_results:',
        JSON.stringify(cgr).substring(0, 300),
      );
    }

    // 스키마 추출
    const collections = recordMap.collection || {};
    let schema: any = {};
    for (const [, colData] of Object.entries(collections)) {
      const colValue = unwrap(colData);
      if (colValue?.schema) {
        schema = colValue.schema;
        break;
      }
    }

    if (Object.keys(schema).length === 0) {
      console.log('[Notion] 스키마 없음');
      return [];
    }
    console.log(`[Notion] ✅ 스키마 ${Object.keys(schema).length}개 필드`);

    // 블록 ID 목록 (여러 경로에서 추출)
    let blockIds: string[] = queryResult.blockIds || [];

    // reducerResults에서 추출
    if (blockIds.length === 0 && (queryResult as any).reducerResults) {
      const rr = (queryResult as any).reducerResults;
      for (const [, reducer] of Object.entries(rr) as any[]) {
        const ids = reducer?.blockIds || [];
        for (const id of ids) {
          if (!blockIds.includes(id)) blockIds.push(id);
        }
      }
    }

    // collection_group_results에서 추출
    if (
      blockIds.length === 0 &&
      (queryResult as any).collection_group_results
    ) {
      const cgr = (queryResult as any).collection_group_results;
      if (cgr.blockIds) {
        blockIds = cgr.blockIds;
      }
    }

    // 마지막 fallback: recordMap.block에서 직접 추출
    if (blockIds.length === 0) {
      const allBlocks = recordMap.block || {};
      for (const [bid, bdata] of Object.entries(allBlocks)) {
        const bval = unwrap(bdata);
        if (bval?.type === 'page') {
          blockIds.push(bid);
        }
      }
      console.log(
        `[Notion] fallback: recordMap.block에서 ${blockIds.length}개 추출`,
      );
    }

    // groupResults에서도 블록 ID 수집
    if (queryResult.groupResults) {
      for (const group of queryResult.groupResults) {
        if (group.blockIds) {
          for (const id of group.blockIds) {
            if (!blockIds.includes(id)) blockIds.push(id);
          }
        }
      }
    }
    console.log(`[Notion] 블록 수: ${blockIds.length}`);

    // 유저 매핑
    const userMap: Record<string, string> = {};
    const notionUsers = recordMap.notion_user || {};
    for (const [userId, userData] of Object.entries(notionUsers) as any[]) {
      const val = unwrap(userData);
      if (!val) continue;
      const name =
        val.name || `${val.given_name || ''} ${val.family_name || ''}`.trim();
      if (name) userMap[userId] = name;
    }

    // 유저맵이 비어있으면 API로 시도
    if (Object.keys(userMap).length === 0) {
      const userIds = new Set<string>();
      const blocks = recordMap.block || {};
      for (const bid of blockIds.slice(0, 30)) {
        const bval = unwrap((blocks as any)[bid]);
        if (!bval?.properties) continue;
        const str = JSON.stringify(bval.properties);
        const uuids = str.match(
          /[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/g,
        );
        if (uuids) uuids.forEach((id: string) => userIds.add(id));
      }
      if (userIds.size > 0) {
        try {
          const res = await client.getUsers(Array.from(userIds).slice(0, 30));
          if (res?.results) {
            for (const u of res.results as any[]) {
              const n =
                u.name || `${u.given_name || ''} ${u.family_name || ''}`.trim();
              if (n && u.id) userMap[u.id] = n;
            }
          }
        } catch {}
      }
    }
    // userMap은 보고서 표시용으로만 사용 (필터링은 UUID로)
    console.log(`[Notion] 유저 ${Object.keys(userMap).length}명`);

    // === 일정 파싱 ===
    const blocks = recordMap.block || {};
    const schedules: NotionSchedule[] = [];
    const currentUserId = config.notionUserId || '';
    const currentUserName = config.notionUserName || '';

    // 참여자(person) 스키마 키 찾기
    let personSchemaKey = '';
    for (const [key, def] of Object.entries(schema) as any[]) {
      if (def.type === 'person' || (def.name || '').includes('참여자')) {
        personSchemaKey = key;
        break;
      }
    }
    console.log(
      `[Notion] 참여자 필드 키: ${personSchemaKey}, 현재유저ID: ${currentUserId}`,
    );

    let debugCount = 0;

    for (const blockId of blockIds) {
      const value = unwrap((blocks as any)[blockId]);
      if (!value) continue;

      const properties = value.properties || {};
      if (Object.keys(properties).length <= 1) continue;

      // UUID 기반 참여자 필터 (파싱 전에 빠르게 걸러냄)
      if (currentUserId && personSchemaKey) {
        const personProp = properties[personSchemaKey];
        if (personProp) {
          const personJson = JSON.stringify(personProp);
          if (!personJson.includes(currentUserId)) {
            continue; // 내 일정이 아님
          }
        } else {
          continue; // 참여자 속성 없음
        }
      }

      const parsed = this.parseBlockProperties(properties, schema, userMap);

      if (debugCount < 5) {
        console.log(
          `[Notion] ✅ 내 일정: "${parsed.title}" | 상태:${parsed.status} | 날짜:${parsed.date}`,
        );
        debugCount++;
      }

      // 날짜 필터
      if (!parsed.date) continue;
      const scheduleDate = new Date(parsed.date);
      const start = new Date(startDate);
      const end = new Date(endDate);
      end.setHours(23, 59, 59);
      if (scheduleDate < start || scheduleDate > end) continue;

      // 금요일: 완료만
      if (type === 'FRIDAY' && parsed.status !== '완료') continue;

      // 하위 블록 (필터 통과한 것만)
      let childContent: string[] = [];
      try {
        childContent = await this.fetchPageBlocks(blockId);
      } catch {}

      schedules.push({
        id: blockId,
        title: parsed.title,
        project: parsed.project,
        projectUrl: parsed.projectUrl,
        category: parsed.category,
        priority: parsed.priority,
        status: parsed.status,
        date: parsed.date,
        endDate: parsed.endDate,
        assignees: parsed.assignees,
        childContent,
      });
    }

    schedules.sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
    );

    console.log(`[Notion] ✅ 필터링 결과: ${schedules.length}건`);
    return schedules;
  }

  /**
   * 블록 속성 파싱
   */
  private parseBlockProperties(
    properties: any,
    schema: any,
    userMap: Record<string, string>,
  ): {
    title: string;
    project: string;
    projectUrl: string;
    category: string;
    priority: string;
    status: string;
    date: string;
    endDate: string;
    assignees: string[];
  } {
    let title = '';
    let project = '';
    let projectUrl = '';
    let category = '';
    let priority = '';
    let status = '';
    let date = '';
    let endDate = '';
    const assignees: string[] = [];

    for (const [key, schemaDef] of Object.entries(schema) as any[]) {
      const propValue = properties[key];
      if (!propValue) continue;

      const name = (schemaDef.name || '').toLowerCase();
      const type = schemaDef.type;

      if (type === 'title') {
        title = this.extractText(propValue);
      } else if (name.includes('프로젝트') || name === 'project') {
        project = this.extractText(propValue);
        projectUrl = this.extractRelationUrl(propValue);
      } else if (name.includes('구분') || name.includes('카테고리')) {
        category = this.extractText(propValue);
      } else if (name.includes('우선순위') || name === 'priority') {
        priority = this.extractText(propValue);
      } else if (
        name.includes('상태') ||
        name === 'status' ||
        type === 'status'
      ) {
        status = this.extractText(propValue);
      } else if (
        name.includes('완료') ||
        name.includes('날짜') ||
        name.includes('date') ||
        type === 'date'
      ) {
        const dateInfo = this.extractDate(propValue);
        if (dateInfo.start) {
          date = dateInfo.start;
          endDate = dateInfo.end;
        }
      } else if (name.includes('참여자') || type === 'person') {
        this.extractPersons(propValue, userMap).forEach((p) =>
          assignees.push(p),
        );
      }
    }

    return {
      title,
      project,
      projectUrl,
      category,
      priority,
      status,
      date,
      endDate,
      assignees,
    };
  }

  private extractText(propValue: any): string {
    if (!Array.isArray(propValue)) return '';
    try {
      return propValue
        .flat(Infinity)
        .filter((v: any) => typeof v === 'string' && v !== '‣' && v !== ',')
        .join('')
        .trim();
    } catch {
      return '';
    }
  }

  private extractRelationUrl(propValue: any): string {
    try {
      const flat = JSON.stringify(propValue);
      const match = flat.match(
        /([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/,
      );
      if (match) {
        return `https://www.notion.so/${match[1].replace(/-/g, '')}`;
      }
    } catch {}
    return '';
  }

  private extractDate(propValue: any): { start: string; end: string } {
    try {
      const flat = JSON.stringify(propValue);
      const dateMatches = flat.match(/\d{4}-\d{2}-\d{2}/g);
      if (dateMatches && dateMatches.length > 0) {
        return {
          start: dateMatches[0],
          end: dateMatches.length > 1 ? dateMatches[1] : '',
        };
      }
    } catch {}
    return { start: '', end: '' };
  }

  private extractPersons(
    propValue: any,
    userMap: Record<string, string>,
  ): string[] {
    const persons: string[] = [];
    try {
      const flat = JSON.stringify(propValue);
      const uuidPattern =
        /[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/g;
      const matches = flat.match(uuidPattern);
      if (matches) {
        for (const userId of matches) {
          const name = userMap[userId];
          if (name && !persons.includes(name)) {
            persons.push(name);
          }
        }
      }
    } catch {}
    return persons;
  }

  private async fetchPageBlocks(pageId: string): Promise<string[]> {
    const client = this.getClient();
    const page = await client.getPage(pageId, {
      fetchCollections: false,
      fetchMissingBlocks: false,
      signFileUrls: false,
    });

    const contents: string[] = [];
    const blockMap = page.block || {};

    for (const [, blockEntry] of Object.entries(blockMap) as any[]) {
      const value = unwrap(blockEntry);
      if (!value || value.id === pageId) continue;

      const type = value.type;
      const text = this.extractBlockText(value);
      if (!text) continue;

      if (type === 'to_do') {
        const checked = value.properties?.checked?.[0]?.[0] === 'Yes';
        contents.push(`${checked ? '☑' : '☐'} ${text}`);
      } else if (
        [
          'text',
          'bulleted_list',
          'numbered_list',
          'sub_header',
          'header',
        ].includes(type)
      ) {
        contents.push(text);
      }
    }

    return contents;
  }

  private extractBlockText(block: any): string {
    const title = block.properties?.title;
    if (!title) return '';
    try {
      return title
        .flat(Infinity)
        .filter((v: any) => typeof v === 'string')
        .join('')
        .trim();
    } catch {
      return '';
    }
  }
}
