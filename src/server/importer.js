import initSqlJs from 'sql.js';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { runSql } from './db.js';

export function getDefaultJoplinPaths() {
  const home = os.homedir();
  const joplinDir = path.join(home, '.config', 'joplin-desktop');
  const dbPath = path.join(joplinDir, 'database.sqlite');
  const resDir = path.join(joplinDir, 'resources');

  const exists = fs.existsSync(dbPath);
  return {
    dir: joplinDir,
    dbPath,
    resDir,
    exists
  };
}

export async function importFromJoplin(customDbPath = null, customResDir = null) {
  const defaults = getDefaultJoplinPaths();
  const joplinDbPath = customDbPath || defaults.dbPath;
  const joplinResDir = customResDir || defaults.resDir;

  if (!fs.existsSync(joplinDbPath)) {
    throw new Error(`Joplin 데이터베이스를 찾을 수 없습니다: ${joplinDbPath}`);
  }

  const startTime = Date.now();
  const SQL = await initSqlJs();
  const fileBuffer = fs.readFileSync(joplinDbPath);
  const joplinDb = new SQL.Database(fileBuffer);

  // 1. Folders
  const folderStmt = joplinDb.prepare("SELECT id, title, parent_id, created_time, updated_time FROM folders");
  let folderCount = 0;
  while (folderStmt.step()) {
    const f = folderStmt.getAsObject();
    runSql(`
      INSERT OR REPLACE INTO folders (id, title, parent_id, created_time, updated_time)
      VALUES (?, ?, ?, ?, ?)
    `, [f.id, f.title || '이름 없음', f.parent_id || '', f.created_time || Date.now(), f.updated_time || Date.now()]);
    folderCount++;
  }
  folderStmt.free();

  // 2. Notes
  const noteStmt = joplinDb.prepare("SELECT id, parent_id as folder_id, title, body, created_time, updated_time FROM notes WHERE deleted_time = 0");
  let noteCount = 0;
  while (noteStmt.step()) {
    const n = noteStmt.getAsObject();
    runSql(`
      INSERT OR REPLACE INTO notes (id, folder_id, title, body, image_text, created_time, updated_time)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [n.id, n.folder_id || 'default', n.title || '무제', n.body || '', '', n.created_time || Date.now(), n.updated_time || Date.now()]);
    noteCount++;
  }
  noteStmt.free();

  // 3. Resources (Images)
  const momoResDir = path.resolve(process.cwd(), 'data', 'resources');
  if (!fs.existsSync(momoResDir)) {
    fs.mkdirSync(momoResDir, { recursive: true });
  }

  const resStmt = joplinDb.prepare("SELECT id, title, mime, filename, file_extension, ocr_text, ocr_status FROM resources");
  let resourceCount = 0;
  while (resStmt.step()) {
    const r = resStmt.getAsObject();
    const ext = r.file_extension ? `.${r.file_extension.replace('.', '')}` : '';
    const srcFileName = `${r.id}${ext}`;
    const srcPath = path.join(joplinResDir, srcFileName);
    const destPath = path.join(momoResDir, srcFileName);

    if (fs.existsSync(srcPath)) {
      try {
        fs.copyFileSync(srcPath, destPath);
      } catch (e) {}
    }

    runSql(`
      INSERT OR REPLACE INTO resources (id, note_id, filename, mime, filepath, ocr_text, ocr_status, created_time)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      r.id,
      '',
      r.title || r.filename || srcFileName,
      r.mime || 'application/octet-stream',
      destPath,
      r.ocr_text || '',
      r.ocr_status || 0,
      Date.now()
    ]);
    resourceCount++;
  }
  resStmt.free();

  joplinDb.close();

  return {
    folderCount,
    noteCount,
    resourceCount,
    timeTakenMs: Date.now() - startTime
  };
}
