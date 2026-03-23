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

function normalizeUuid(value: string): string {
  return (value || '').toLowerCase().replace(/-/g, '');
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
   * 기간별 일정 조회 — queryCollection API 직접 호출 (서버 필터링)
   */
  async fetchSchedules(
    startDate: string,
    endDate: string,
    type: 'WORK' | 'PROJECT',
  ): Promise<NotionSchedule[]> {
    const config = loadConfig();
    const client = this.getClient();
    const dbId = config.notionDbId;
    const currentUserId = config.notionUserId || '';

    console.log(`[Notion] 일정 조회: ${startDate} ~ ${endDate}, 유형: ${type}`);

    // Step 1: getPage로 컬렉션/뷰 ID + 스키마 확보
    const pageMap = await client.getPage(dbId, {
      fetchCollections: true,
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
    console.log(
      '[Notion] 참고: 조회는 선택된 뷰를 통해 시작되며, 이후 앱에서 날짜/참여자 필터를 적용합니다.',
    );

    // 스키마 추출
    const collections = pageMap.collection || {};
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

    // 스키마에서 날짜/참여자/상태 필드 키 찾기
    let dateSchemaKey = '';
    let personSchemaKey = '';
    let statusSchemaKey = '';
    for (const [key, def] of Object.entries(schema) as any[]) {
      const name = (def.name || '').toLowerCase();
      if (
        !dateSchemaKey &&
        (name.includes('완료') || name.includes('날짜') || def.type === 'date')
      ) {
        dateSchemaKey = key;
      }
      if (
        !personSchemaKey &&
        (name.includes('참여자') || def.type === 'person')
      ) {
        personSchemaKey = key;
      }
      if (
        !statusSchemaKey &&
        (name.includes('상태') || def.type === 'status')
      ) {
        statusSchemaKey = key;
      }
    }
    console.log(
      `[Notion] 필드키 — 날짜:${dateSchemaKey}, 참여자:${personSchemaKey}, 상태:${statusSchemaKey}`,
    );

    // Step 2: getCollectionData로 전체 데이터 조회 (서버 필터 없이)
    const collectionData = await client.getCollectionData(
      collectionId,
      viewId,
      undefined,
      { limit: 9999, userTimeZone: 'Asia/Seoul' },
    );

    const recordMap = collectionData.recordMap || {};
    const queryResult = collectionData.result || {};

    // 블록 ID 추출
    let blockIds: string[] = [];
    const reducerResults = (queryResult as any)?.reducerResults;
    if (reducerResults?.collection_group_results?.blockIds) {
      blockIds = reducerResults.collection_group_results.blockIds;
    } else if ((queryResult as any)?.blockIds) {
      blockIds = (queryResult as any).blockIds;
    }

    // recordMap.block에서도 추출 (fallback)
    if (blockIds.length === 0) {
      for (const [bid, bdata] of Object.entries(recordMap.block || {})) {
        const bval = unwrap(bdata);
        if (bval?.type === 'page') blockIds.push(bid);
      }
    }

    const loadedBlockCount = Object.keys(recordMap.block || {}).length;
    console.log(
      `[Notion] 블록 ID: ${blockIds.length}건, 로드된 블록: ${loadedBlockCount}건`,
    );

    // Step 3: 로드되지 않은 블록 배치 로드
    const blocks: Record<string, any> = { ...(recordMap.block || {}) };
    const missingIds = blockIds.filter((id) => !blocks[id]);
    if (missingIds.length > 0) {
      console.log(
        `[Notion] 누락 블록 ${missingIds.length}건 배치 로드 시작...`,
      );
      const BATCH_SIZE = 100;
      for (let i = 0; i < missingIds.length; i += BATCH_SIZE) {
        const batch = missingIds.slice(i, i + BATCH_SIZE);
        try {
          const result = await client.getBlocks(batch);
          const newBlocks = result?.recordMap?.block || {};
          Object.assign(blocks, newBlocks);
        } catch (e: any) {
          console.log(
            `[Notion] 배치 ${Math.floor(i / BATCH_SIZE) + 1} 로드 실패: ${e.message}`,
          );
        }
      }
      console.log(
        `[Notion] 배치 로드 완료, 총 블록: ${Object.keys(blocks).length}건`,
      );

      const stillMissingCount = blockIds.filter((id) => !blocks[id]).length;
      if (stillMissingCount > 0) {
        console.log(
          `[Notion] 경고: 배치 로드 후에도 블록 ${stillMissingCount}건이 비어 있습니다.`,
        );
      }
    }

    // Step 3.5: relation 페이지 (프로젝트 등) 배치 로드
    const relationIds = new Set<string>();
    const projectSchemaKey = Object.entries(schema).find(([, def]: any) => {
      const n = (def.name || '').toLowerCase();
      return n.includes('프로젝트') || n === 'project';
    })?.[0];

    if (projectSchemaKey) {
      for (const blockId of blockIds) {
        const value = unwrap(blocks[blockId]);
        if (!value?.properties?.[projectSchemaKey]) continue;
        const propJson = JSON.stringify(value.properties[projectSchemaKey]);
        const uuidPattern =
          /[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/g;
        const matches = propJson.match(uuidPattern);
        if (matches) {
          for (const id of matches) {
            if (!blocks[id]) relationIds.add(id);
          }
        }
      }
    }

    if (relationIds.size > 0) {
      console.log(
        `[Notion] relation 페이지 ${relationIds.size}건 배치 로드...`,
      );
      const relBatch = Array.from(relationIds);
      const REL_BATCH_SIZE = 100;
      for (let i = 0; i < relBatch.length; i += REL_BATCH_SIZE) {
        const batch = relBatch.slice(i, i + REL_BATCH_SIZE);
        try {
          const result = await client.getBlocks(batch);
          const newBlocks = result?.recordMap?.block || {};
          Object.assign(blocks, newBlocks);
        } catch (e: any) {
          console.log(`[Notion] relation 배치 로드 실패: ${e.message}`);
        }
      }
    }

    // Step 4: 클라이언트 사이드 필터링 + 파싱
    const schedules: NotionSchedule[] = [];
    const userMap: Record<string, string> = {};
    let debugCount = 0;
    const normalizedCurrentUserId = normalizeUuid(currentUserId);
    const filterStats = {
      missingBlock: 0,
      emptyProperties: 0,
      missingPersonProperty: 0,
      assigneeMismatch: 0,
      missingDate: 0,
      outOfRange: 0,
      included: 0,
    };

    if (currentUserId && !personSchemaKey) {
      console.log(
        '[Notion] 경고: notionUserId는 설정되어 있지만 참여자 필드를 찾지 못해 참여자 필터를 적용할 수 없습니다.',
      );
    }

    for (const blockId of blockIds) {
      const value = unwrap(blocks[blockId]);
      if (!value) {
        filterStats.missingBlock++;
        continue;
      }

      const properties = value.properties || {};
      if (Object.keys(properties).length === 0) {
        filterStats.emptyProperties++;
        continue;
      }

      // UUID 기반 참여자 필터
      if (currentUserId && personSchemaKey) {
        const personProp = properties[personSchemaKey];
        if (personProp) {
          const personIds = this.extractPersonIds(personProp);
          const hasCurrentUser = personIds.some(
            (personId) => normalizeUuid(personId) === normalizedCurrentUserId,
          );
          if (!hasCurrentUser) {
            filterStats.assigneeMismatch++;
            continue;
          }
        } else {
          filterStats.missingPersonProperty++;
          continue;
        }
      }

      const parsed = this.parseBlockProperties(
        properties,
        schema,
        userMap,
        blocks,
      );

      // 날짜 필터
      if (!parsed.date) {
        filterStats.missingDate++;
        continue;
      }
      const scheduleDate = new Date(parsed.date);
      const start = new Date(startDate);
      const end = new Date(endDate);
      end.setHours(23, 59, 59);
      if (scheduleDate < start || scheduleDate > end) {
        filterStats.outOfRange++;
        continue;
      }

      if (debugCount < 10) {
        console.log(
          `[Notion] ✅ "${parsed.title}" | ${parsed.status} | ${parsed.date}`,
        );
        debugCount++;
      }

      // 하위 블록 내용 수집
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
      filterStats.included++;
    }

    schedules.sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
    );

    console.log(
      `[Notion] 필터 통계 — 누락블록:${filterStats.missingBlock}, 빈속성:${filterStats.emptyProperties}, 참여자필드없음:${filterStats.missingPersonProperty}, 참여자불일치:${filterStats.assigneeMismatch}, 날짜없음:${filterStats.missingDate}, 기간외:${filterStats.outOfRange}, 포함:${filterStats.included}`,
    );
    console.log(`[Notion] ✅ 최종 결과: ${schedules.length}건`);
    return schedules;
  }

  /**
   * 블록 속성 파싱
   */
  private parseBlockProperties(
    properties: any,
    schema: any,
    userMap: Record<string, string>,
    blocks: Record<string, any>,
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
        if (type === 'relation') {
          const resolved = this.extractRelationTitle(propValue, blocks);
          if (resolved.title) {
            project = resolved.title;
            projectUrl = resolved.url;
          }
        } else {
          project = this.extractText(propValue);
        }
      } else if (name.includes('구분') || name.includes('카테고리')) {
        category = this.extractText(propValue);
      } else if (name.includes('우선순위') || name === 'priority') {
        priority = this.extractText(propValue);
      } else if (
        name.includes('상태') ||
        name === 'status' ||
        type === 'status'
      ) {
        status = this.extractStatus(propValue, schemaDef);
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

    // status가 비어있으면 schema에서 기본값 추출 (Notion 기본 상태)
    if (!status) {
      for (const [, schemaDef] of Object.entries(schema) as any[]) {
        const name = (schemaDef.name || '').toLowerCase();
        const type = schemaDef.type;
        if (name.includes('상태') || name === 'status' || type === 'status') {
          const options = schemaDef?.options || [];
          const groups = schemaDef?.groups || [];
          if (groups.length > 0 && groups[0].optionIds?.length > 0) {
            const defaultOpt = options.find(
              (o: any) => o.id === groups[0].optionIds[0],
            );
            if (defaultOpt?.value) {
              status = defaultOpt.value;
              break;
            }
          }
          if (!status && options.length > 0) {
            status = options[0].value || '';
            break;
          }
        }
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

  private extractRelationTitle(
    propValue: any,
    blocks: Record<string, any>,
  ): { title: string; url: string } {
    try {
      const flat = JSON.stringify(propValue);
      const uuidPattern =
        /[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/g;
      const matches = flat.match(uuidPattern);
      if (matches) {
        for (const relationId of matches) {
          const url = `https://www.notion.so/${relationId.replace(/-/g, '')}`;
          const blockEntry = blocks[relationId];
          if (!blockEntry) {
            console.log(`[Notion] relation ${relationId} 블록 없음`);
            continue;
          }

          // unwrap를 통해 실제 블록 데이터 추출
          const relBlock = unwrap(blockEntry);
          if (relBlock) {
            // 방법 1: properties.title
            if (relBlock.properties?.title) {
              const title = this.extractText(relBlock.properties.title);
              if (title) return { title, url };
            }
            // 방법 2: 직접 title 배열 (collection_view_page 등)
            if (Array.isArray(relBlock.title)) {
              const title = this.extractText(relBlock.title);
              if (title) return { title, url };
            }
            // 방법 3: properties 전체에서 첫 텍스트 추출
            if (relBlock.properties) {
              for (const [, pVal] of Object.entries(relBlock.properties)) {
                const text = this.extractText(pVal);
                if (text && text.length > 0 && text.length < 100) {
                  return { title: text, url };
                }
              }
            }
          }

          // 방법 4: raw value에서 탐색
          const raw = blockEntry?.value || blockEntry;
          if (raw?.properties?.title) {
            const title = this.extractText(raw.properties.title);
            if (title) return { title, url };
          }
          if (raw?.properties) {
            for (const [, pVal] of Object.entries(raw.properties)) {
              const text = this.extractText(pVal as any);
              if (text && text.length > 0 && text.length < 100) {
                return { title: text, url };
              }
            }
          }

          console.log(
            `[Notion] relation ${relationId} 타이틀 추출 실패.`,
            `type: ${relBlock?.type},`,
            `keys: ${relBlock ? Object.keys(relBlock).join(',') : 'null'},`,
            `props: ${relBlock?.properties ? Object.keys(relBlock.properties).join(',') : 'none'}`,
          );
          return { title: relationId, url };
        }
      }
    } catch (e: any) {
      console.log(`[Notion] extractRelationTitle 에러: ${e.message}`);
    }
    return { title: '', url: '' };
  }

  private extractStatus(propValue: any, schemaDef: any): string {
    // 먼저 일반 텍스트 추출 시도
    const text = this.extractText(propValue);
    if (text) return text;

    // status type의 경우 option ID로 저장됨 → schema options에서 이름 찾기
    try {
      const flat = JSON.stringify(propValue);
      const options = schemaDef?.options || [];
      const groups = schemaDef?.groups || [];

      // groups 내의 optionIds에서도 찾기
      const allOptions = [...options];
      for (const group of groups) {
        if (group.optionIds) {
          for (const optId of group.optionIds) {
            const opt = options.find((o: any) => o.id === optId);
            if (opt) allOptions.push(opt);
          }
        }
      }

      for (const opt of allOptions) {
        if (opt.id && flat.includes(opt.id)) {
          return opt.value || '';
        }
      }

      // property 값이 비어있거나 매칭 실패 → 기본 상태값 반환
      // Notion status type은 첫 번째 그룹의 첫 번째 옵션이 기본값
      if (groups.length > 0 && groups[0].optionIds?.length > 0) {
        const defaultOptId = groups[0].optionIds[0];
        const defaultOpt = options.find((o: any) => o.id === defaultOptId);
        if (defaultOpt?.value) return defaultOpt.value;
      }
      if (options.length > 0 && options[0]?.value) {
        return options[0].value;
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
      const matches = this.extractPersonIds(propValue);
      if (matches.length > 0) {
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

  private extractPersonIds(propValue: any): string[] {
    try {
      const flat = JSON.stringify(propValue);
      const uuidPattern =
        /[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi;
      const matches = flat.match(uuidPattern) || [];
      return Array.from(new Set(matches.map((id) => id.toLowerCase())));
    } catch {
      return [];
    }
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

    // 구조화된 항목(할일, 목록)만 수집. 일반 텍스트/헤더는 참고자료일 수 있어 제외.
    for (const [, blockEntry] of Object.entries(blockMap) as any[]) {
      const value = unwrap(blockEntry);
      if (!value || value.id === pageId) continue;

      const type = value.type;
      const text = this.extractBlockText(value);
      if (!text) continue;

      if (type === 'to_do') {
        const checked = value.properties?.checked?.[0]?.[0] === 'Yes';
        contents.push(`${checked ? '☑' : '☐'} ${text}`);
      } else if (type === 'bulleted_list' || type === 'numbered_list') {
        contents.push(text);
      }
      // text, header, sub_header 등은 참고자료이므로 보고서에 포함하지 않음
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
