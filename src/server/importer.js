import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { db } from './db.js';

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

export function importFromJoplin(customDbPath = null, customResDir = null, onProgress = null) {
  const defaults = getDefaultJoplinPaths();
  const joplinDbPath = customDbPath || defaults.dbPath;
  const joplinResDir = customResDir || defaults.resDir;

  if (!fs.existsSync(joplinDbPath)) {
    throw new Error(`Joplin 데이터베이스를 찾을 수 없습니다: ${joplinDbPath}`);
  }

  const startTime = Date.now();
  const joplinDb = new DatabaseSync(joplinDbPath, { readOnly: true });

  // 1. Import Folders
  const folders = joplinDb.prepare(`
    SELECT id, title, parent_id, created_time, updated_time 
    FROM folders
  `).all();

  const insertFolder = db.prepare(`
    INSERT OR REPLACE INTO folders (id, title, parent_id, created_time, updated_time)
    VALUES (?, ?, ?, ?, ?)
  `);

  for (const f of folders) {
    insertFolder.run(f.id, f.title || '이름 없음', f.parent_id || '', f.created_time || Date.now(), f.updated_time || Date.now());
  }

  // 2. Import Notes
  const notes = joplinDb.prepare(`
    SELECT id, parent_id as folder_id, title, body, created_time, updated_time 
    FROM notes 
    WHERE deleted_time = 0
  `).all();

  const insertNote = db.prepare(`
    INSERT OR REPLACE INTO notes (id, folder_id, title, body, image_text, created_time, updated_time)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const insertFts = db.prepare(`
    INSERT INTO notes_fts (id, title, body, image_text)
    VALUES (?, ?, ?, ?)
  `);

  // Clear existing FTS for fresh sync
  db.exec('DELETE FROM notes_fts');

  let importedNotes = 0;
  for (const n of notes) {
    const title = n.title || '무제';
    const body = n.body || '';
    insertNote.run(n.id, n.folder_id || 'default', title, body, '', n.created_time || Date.now(), n.updated_time || Date.now());
    insertFts.run(n.id, title, body, '');
    importedNotes++;
    if (onProgress && importedNotes % 500 === 0) {
      onProgress({ current: importedNotes, total: notes.length });
    }
  }

  // 3. Import Resources (Images)
  const momoResDir = path.resolve(process.cwd(), 'data', 'resources');
  if (!fs.existsSync(momoResDir)) {
    fs.mkdirSync(momoResDir, { recursive: true });
  }

  let importedResources = 0;
  const resources = joplinDb.prepare(`
    SELECT id, title, mime, filename, file_extension, ocr_text, ocr_status 
    FROM resources
  `).all();

  const insertRes = db.prepare(`
    INSERT OR REPLACE INTO resources (id, note_id, filename, mime, filepath, ocr_text, ocr_status, created_time)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const r of resources) {
    const ext = r.file_extension ? `.${r.file_extension.replace('.', '')}` : '';
    const srcFileName = `${r.id}${ext}`;
    const srcPath = path.join(joplinResDir, srcFileName);
    const destPath = path.join(momoResDir, srcFileName);

    if (fs.existsSync(srcPath)) {
      // Fast file copy or hardlink
      try {
        fs.copyFileSync(srcPath, destPath);
      } catch (e) {
        // Fallback
      }
    }

    insertRes.run(
      r.id,
      '',
      r.title || r.filename || srcFileName,
      r.mime || 'application/octet-stream',
      destPath,
      r.ocr_text || '',
      r.ocr_status || 0,
      Date.now()
    );
    importedResources++;
  }

  return {
    folderCount: folders.length,
    noteCount: importedNotes,
    resourceCount: importedResources,
    timeTakenMs: Date.now() - startTime
  };
}
