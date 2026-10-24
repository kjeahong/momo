import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';

const DATA_DIR = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'momo.sqlite');
export const db = new DatabaseSync(DB_PATH);

// Initialize Tables
export function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS folders (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      parent_id TEXT DEFAULT '',
      created_time INTEGER NOT NULL,
      updated_time INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS notes (
      id TEXT PRIMARY KEY,
      folder_id TEXT DEFAULT '',
      title TEXT NOT NULL,
      body TEXT DEFAULT '',
      image_text TEXT DEFAULT '',
      created_time INTEGER NOT NULL,
      updated_time INTEGER NOT NULL,
      is_pinned INTEGER DEFAULT 0
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

    CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
      id UNINDEXED,
      title,
      body,
      image_text,
      tokenize = "trigram"
    );
  `);
}

// Ensure default folder exists
export function ensureDefaultFolder() {
  const count = db.prepare('SELECT count(*) as count FROM folders').get().count;
  if (count === 0) {
    const now = Date.now();
    db.prepare(`
      INSERT INTO folders (id, title, parent_id, created_time, updated_time)
      VALUES (?, ?, ?, ?, ?)
    `).run('default', '기본 메모장', '', now, now);

    // Sample welcome note
    const welcomeId = 'welcome-note';
    const title = '🎉 Momo에 오신 것을 환영합니다!';
    const body = `# Momo - 모든 메모를 기억하는 스마트 노트

Momo는 Joplin의 익숙함과 압도적인 검색 성능을 결합한 차세대 메모앱입니다.

### ✨ 왜 Momo인가요?
- **한국어 완벽 검색**: "회의", "예산" 같은 2글자 단어부터 "프로젝트에서", "보고서를" 같은 조사 결합 단어까지 100% 부분일치 검색됩니다.
- **이미지 속 글자 자동 검색 (OCR)**: 캡처해서 붙여넣은 이미지 속 영수증, 도표, 텍스트도 검색창에서 바로 찾아줍니다.
- **1클릭 Joplin 불러오기**: 상단 설정 아이콘에서 기존 Joplin의 수천 개 메모와 이미지를 1초 만에 그대로 가져올 수 있습니다.

상단 검색창에 **"회의"**, **"Joplin"**, **"스마트"**를 입력해 보세요!
`;
    db.prepare(`
      INSERT INTO notes (id, folder_id, title, body, image_text, created_time, updated_time)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(welcomeId, 'default', title, body, '', now, now);

    db.prepare(`
      INSERT INTO notes_fts (id, title, body, image_text)
      VALUES (?, ?, ?, ?)
    `).run(welcomeId, title, body, '');
  }
}

// Hybrid Search Function
export function searchNotes(query, folderId = '') {
  const trimmed = query.trim();
  if (!trimmed) {
    let sql = 'SELECT * FROM notes';
    const params = [];
    if (folderId) {
      sql += ' WHERE folder_id = ?';
      params.push(folderId);
    }
    sql += ' ORDER BY is_pinned DESC, updated_time DESC';
    return db.prepare(sql).all(...params);
  }

  // 1. Trigram MATCH for query length >= 3
  if (trimmed.length >= 3) {
    try {
      let ftsSql = `
        SELECT 
          n.*,
          highlight(notes_fts, 1, '<mark class="bg-yellow-400 text-black px-1 rounded">', '</mark>') as hl_title,
          highlight(notes_fts, 2, '<mark class="bg-yellow-400 text-black px-1 rounded">', '</mark>') as hl_body,
          highlight(notes_fts, 3, '<mark class="bg-yellow-400 text-black px-1 rounded">', '</mark>') as hl_image
        FROM notes_fts f
        JOIN notes n ON n.id = f.id
        WHERE notes_fts MATCH ?
      `;
      const params = [trimmed];
      if (folderId) {
        ftsSql += ' AND n.folder_id = ?';
        params.push(folderId);
      }
      ftsSql += ' ORDER BY n.updated_time DESC';

      const results = db.prepare(ftsSql).all(...params);
      if (results.length > 0) {
        return results.map(r => ({
          ...r,
          match_type: r.hl_image?.includes('<mark>') ? 'image' : 'text'
        }));
      }
    } catch (e) {
      // Fallback to LIKE if query syntax fails
    }
  }

  // 2. Substring LIKE for query length 1~2 or fallback
  const likePattern = `%${trimmed}%`;
  let sql = `
    SELECT * FROM notes
    WHERE (title LIKE ? OR body LIKE ? OR image_text LIKE ?)
  `;
  const params = [likePattern, likePattern, likePattern];
  if (folderId) {
    sql += ' AND folder_id = ?';
    params.push(folderId);
  }
  sql += ' ORDER BY is_pinned DESC, updated_time DESC';

  const results = db.prepare(sql).all(...params);
  return results.map(note => {
    const markRegex = new RegExp(`(${trimmed})`, 'gi');
    const hasImageMatch = note.image_text && markRegex.test(note.image_text);
    return {
      ...note,
      hl_title: note.title.replace(markRegex, '<mark class="bg-yellow-400 text-black px-1 rounded">$1</mark>'),
      hl_body: note.body.replace(markRegex, '<mark class="bg-yellow-400 text-black px-1 rounded">$1</mark>'),
      hl_image: note.image_text ? note.image_text.replace(markRegex, '<mark class="bg-yellow-400 text-black px-1 rounded">$1</mark>') : '',
      match_type: hasImageMatch ? 'image' : 'text'
    };
  });
}
