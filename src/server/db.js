import initSqlJs from 'sql.js';
import path from 'node:path';
import fs from 'node:fs';

const DATA_DIR = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'momo.sqlite');

let SQL = null;
let db = null;

export async function getDb() {
  if (!SQL) {
    SQL = await initSqlJs();
  }
  if (!db) {
    if (fs.existsSync(DB_PATH)) {
      try {
        const fileBuffer = fs.readFileSync(DB_PATH);
        db = new SQL.Database(fileBuffer);
      } catch (e) {
        db = new SQL.Database();
      }
    } else {
      db = new SQL.Database();
    }
    await initDb();
    ensureDefaultFolder();
  }
  return db;
}

export function saveDb() {
  if (!db) return;
  try {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
  } catch (err) {
    console.error('Failed to save DB to disk:', err);
  }
}

// Helper: Query all rows as array of objects
export function queryAll(sql, params = []) {
  if (!db) return [];
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

// Helper: Query single row as object
export function queryOne(sql, params = []) {
  const rows = queryAll(sql, params);
  return rows.length > 0 ? rows[0] : null;
}

// Helper: Run statement and save
export function runSql(sql, params = []) {
  if (!db) return;
  db.run(sql, params);
  saveDb();
}

export async function initDb() {
  if (!db) await getDb();
  db.run(`
    CREATE TABLE IF NOT EXISTS folders (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      parent_id TEXT DEFAULT '',
      created_time INTEGER NOT NULL,
      updated_time INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS notes (
      id TEXT PRIMARY KEY,
      folder_id TEXT DEFAULT 'default',
      title TEXT NOT NULL,
      body TEXT DEFAULT '',
      image_text TEXT DEFAULT '',
      created_time INTEGER NOT NULL,
      updated_time INTEGER NOT NULL,
      is_pinned INTEGER DEFAULT 0,
      is_todo INTEGER DEFAULT 0,
      todo_completed INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS resources (
      id TEXT PRIMARY KEY,
      note_id TEXT DEFAULT '',
      filename TEXT NOT NULL,
      mime TEXT NOT NULL,
      filepath TEXT NOT NULL,
      ocr_text TEXT DEFAULT '',
      ocr_status INTEGER DEFAULT 0,
      created_time INTEGER NOT NULL
    );
  `);
  saveDb();
}

export function resetToCleanState() {
  if (!db) return;
  db.run(`
    DELETE FROM notes;
    DELETE FROM folders;
    DELETE FROM resources;
  `);

  const now = Date.now();
  runSql(`
    INSERT INTO folders (id, title, parent_id, created_time, updated_time)
    VALUES (?, ?, ?, ?, ?)
  `, ['default', '기본 노트북', '', now, now]);

  runSql(`
    INSERT INTO folders (id, title, parent_id, created_time, updated_time)
    VALUES (?, ?, ?, ?, ?)
  `, ['work', '업무 및 프로젝트', '', now, now]);

  runSql(`
    INSERT INTO folders (id, title, parent_id, created_time, updated_time)
    VALUES (?, ?, ?, ?, ?)
  `, ['daily', '일상 & 스크랩', '', now, now]);

  // Sample Note 1
  const note1Id = 'note_guide';
  const title1 = '📌 Momo 빠른 시작 & 검색 안내';
  const body1 = `# Momo 빠른 시작 가이드

Joplin의 익숙한 사용감 그대로, 어디에 적었든 원하는 내용을 1초 만에 찾아주는 스마트 메모앱입니다.

### 🔍 검색 테스트 방법
1. 우측 상단 검색창에 **"가이드"**, **"단축키"**, **"검색"** 등을 입력해 보세요.
2. 제목과 본문에서 찾은 위치를 정확하게 하이라이트해 보여줍니다.
3. 한국어 2글자 단어나 조사가 붙은 단어도 누락 없이 깔끔하게 찾아냅니다.

### 📝 주요 기능
- **[+ 새 메모]**: 상단 버튼으로 즉시 작성
- **[+ 새 할일]**: 체크리스트 메모 생성
- **Joplin 라이트 테마 배색**: 눈이 편안한 Joplin 클래식 디자인

자유롭게 메모를 작성하고 초고속 검색을 체감해 보세요!
`;

  runSql(`
    INSERT INTO notes (id, folder_id, title, body, image_text, created_time, updated_time, is_pinned)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, [note1Id, 'default', title1, body1, '', now, now, 1]);

  // Sample Note 2
  const note2Id = 'note_sample_meeting';
  const title2 = '💡 2026년 하반기 프로젝트 기획 회의록';
  const body2 = `# 2026 하반기 신규 프로젝트 기획안

- **일시**: 2026년 10월 24일
- **참석자**: 기획팀, 개발팀
- **핵심 목표**: Joplin 사용자들을 위한 초고속 한국어 검색 및 단독 데스크톱 메모 시스템 완성

### 논의 내용
1. **검색 엔진 개선**:
   - 키워드 타이핑 시 입력 렉(한글 끊김)을 100% 제거하고 부드러운 반응속도 확보.
   - 제목 일치 가중치를 최우선으로 하여 엉뚱한 결과가 섞이지 않도록 정렬.
2. **독립 데스크톱 실행**:
   - 도스창 없이 아이콘을 더블클릭하면 즉시 실행되는 네이티브 창 지원.

> 다음 회의 일정: 다음 주 수요일 오후 2시
`;

  runSql(`
    INSERT INTO notes (id, folder_id, title, body, image_text, created_time, updated_time, is_pinned)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, [note2Id, 'work', title2, body2, '', now - 1000 * 60 * 30, now - 1000 * 60 * 30, 0]);

  saveDb();
}

export function ensureDefaultFolder() {
  const countRow = queryOne('SELECT count(*) as count FROM folders');
  if (!countRow || countRow.count === 0) {
    resetToCleanState();
  }
}

function extractSnippet(text, query, maxLen = 70) {
  if (!text) return '';
  const cleanText = text.replace(/[#*`>~-]/g, ' ').replace(/\s+/g, ' ').trim();
  const qLower = query.toLowerCase();
  const tLower = cleanText.toLowerCase();

  const idx = tLower.indexOf(qLower);
  if (idx === -1) {
    return cleanText.slice(0, maxLen) + (cleanText.length > maxLen ? '...' : '');
  }

  const start = Math.max(0, idx - 20);
  const end = Math.min(cleanText.length, idx + query.length + 35);
  let snippet = cleanText.slice(start, end);
  if (start > 0) snippet = '...' + snippet;
  if (end < cleanText.length) snippet = snippet + '...';
  return snippet;
}

function highlightText(text, query) {
  if (!text || !query) return text || '';
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return text.replace(new RegExp(`(${escaped})`, 'gi'), '<mark class="bg-yellow-200 text-slate-900 px-0.5 rounded font-medium">$1</mark>');
}

export function searchNotes(query = '', folderId = '') {
  const trimmed = query.trim();

  if (!trimmed) {
    let sql = 'SELECT * FROM notes';
    const params = [];
    if (folderId) {
      sql += ' WHERE folder_id = ?';
      params.push(folderId);
    }
    sql += ' ORDER BY is_pinned DESC, updated_time DESC';

    const list = queryAll(sql, params);
    return list.map(n => ({
      ...n,
      snippet: extractSnippet(n.body, '', 70),
      match_type: null
    }));
  }

  const containsPattern = `%${trimmed}%`;
  const startsWithPattern = `${trimmed}%`;

  let sql = `
    SELECT *,
      (
        CASE 
          WHEN lower(title) = lower(?) THEN 1000
          WHEN lower(title) LIKE lower(?) THEN 500
          WHEN lower(title) LIKE lower(?) THEN 200
          ELSE 0
        END
        +
        CASE 
          WHEN lower(body) LIKE lower(?) THEN 50
          ELSE 0
        END
        +
        CASE 
          WHEN lower(image_text) LIKE lower(?) THEN 30
          ELSE 0
        END
      ) as relevance_score
    FROM notes
    WHERE (lower(title) LIKE lower(?) OR lower(body) LIKE lower(?) OR lower(image_text) LIKE lower(?))
  `;

  const params = [
    trimmed, startsWithPattern, containsPattern, 
    containsPattern, containsPattern, 
    containsPattern, containsPattern, containsPattern
  ];

  if (folderId) {
    sql += ' AND folder_id = ?';
    params.push(folderId);
  }

  sql += ' ORDER BY relevance_score DESC, is_pinned DESC, updated_time DESC';

  const results = queryAll(sql, params);

  return results.map(r => {
    let matchType = 'body';
    if (r.title.toLowerCase().includes(trimmed.toLowerCase())) {
      matchType = 'title';
    } else if (r.image_text && r.image_text.toLowerCase().includes(trimmed.toLowerCase())) {
      matchType = 'image';
    }

    const snippetSource = matchType === 'image' ? r.image_text : r.body;
    const rawSnippet = extractSnippet(snippetSource, trimmed, 70);

    return {
      ...r,
      hl_title: highlightText(r.title, trimmed),
      snippet: highlightText(rawSnippet, trimmed),
      match_type: matchType
    };
  });
}
