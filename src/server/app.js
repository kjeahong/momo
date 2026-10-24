import express from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { getDb, queryAll, queryOne, runSql, searchNotes, resetToCleanState } from './db.js';
import { getDefaultJoplinPaths } from './importer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getValidDistDir() {
  const candidates = [
    path.resolve(__dirname, '../../dist'),
    path.resolve(__dirname, '../dist'),
    path.resolve(process.cwd(), 'dist'),
    path.resolve(process.cwd(), 'resources/app/dist')
  ];
  for (const c of candidates) {
    if (fs.existsSync(path.join(c, 'index.html'))) {
      return c;
    }
  }
  return candidates[0];
}

export async function createApp(options = {}) {
  await getDb();

  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '50mb' }));

  // Resources directory
  const RES_DIR = options.resDir || path.resolve(__dirname, '../../data/resources');
  if (!fs.existsSync(RES_DIR)) {
    fs.mkdirSync(RES_DIR, { recursive: true });
  }
  app.use('/resources', express.static(RES_DIR));

  // Folders API
  app.get('/api/folders', (req, res) => {
    const folders = queryAll(`
      SELECT f.*, (SELECT count(*) FROM notes WHERE folder_id = f.id) as note_count
      FROM folders f 
      ORDER BY f.created_time ASC
    `);
    res.json(folders);
  });

  app.post('/api/folders', (req, res) => {
    const { title, parent_id = '' } = req.body;
    if (!title) return res.status(400).json({ error: '폴더 제목이 필요합니다.' });
    const id = 'folder_' + Date.now();
    const now = Date.now();
    runSql(`
      INSERT INTO folders (id, title, parent_id, created_time, updated_time)
      VALUES (?, ?, ?, ?, ?)
    `, [id, title, parent_id, now, now]);
    res.json({ id, title, parent_id, created_time: now, updated_time: now, note_count: 0 });
  });

  app.delete('/api/folders/:id', (req, res) => {
    const folderId = req.params.id;
    runSql('DELETE FROM folders WHERE id = ?', [folderId]);
    runSql('DELETE FROM notes WHERE folder_id = ?', [folderId]);
    res.json({ success: true });
  });

  // Notes API
  app.get('/api/notes', (req, res) => {
    const { q = '', folder_id = '' } = req.query;
    const results = searchNotes(q, folder_id);
    res.json(results);
  });

  app.get('/api/notes/:id', (req, res) => {
    const note = queryOne('SELECT * FROM notes WHERE id = ?', [req.params.id]);
    if (!note) return res.status(404).json({ error: '노트를 찾을 수 없습니다.' });
    res.json(note);
  });

  app.post('/api/notes', (req, res) => {
    const { id, folder_id = 'default', title = '새로운 메모', body = '' } = req.body;
    const noteId = id || ('note_' + Date.now());
    const now = Date.now();

    const existing = queryOne('SELECT * FROM notes WHERE id = ?', [noteId]);
    if (existing) {
      runSql(`
        UPDATE notes 
        SET folder_id = ?, title = ?, body = ?, updated_time = ?
        WHERE id = ?
      `, [folder_id, title, body, now, noteId]);
    } else {
      runSql(`
        INSERT INTO notes (id, folder_id, title, body, image_text, created_time, updated_time)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [noteId, folder_id, title, body, '', now, now]);
    }

    res.json({ id: noteId, folder_id, title, body, updated_time: now });
  });

  app.delete('/api/notes/:id', (req, res) => {
    const noteId = req.params.id;
    runSql('DELETE FROM notes WHERE id = ?', [noteId]);
    res.json({ success: true });
  });

  app.post('/api/notes/:id/pin', (req, res) => {
    const note = queryOne('SELECT is_pinned FROM notes WHERE id = ?', [req.params.id]);
    if (note) {
      const nextPin = note.is_pinned ? 0 : 1;
      runSql('UPDATE notes SET is_pinned = ? WHERE id = ?', [nextPin, req.params.id]);
      res.json({ is_pinned: nextPin });
    } else {
      res.status(404).json({ error: '노트 없음' });
    }
  });

  // Reset Database API
  app.post('/api/db/reset', (req, res) => {
    resetToCleanState();
    res.json({ success: true, message: '초기화 완료' });
  });

  // Joplin 1-Click Import API
  app.get('/api/joplin/detect', (req, res) => {
    const defaults = getDefaultJoplinPaths();
    res.json(defaults);
  });

  // OCR API
  app.get('/api/ocr/status', (req, res) => {
    res.json({ total: 0, current: 0, status: 'idle' });
  });

  // Serve Frontend Dist - Guaranteed Path
  const DIST_DIR = options.distDir || getValidDistDir();
  console.log(`Momo serving frontend from: ${DIST_DIR}`);
  app.use(express.static(DIST_DIR));

  // Catch-all to serve index.html for Single Page App
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/resources')) {
      return next();
    }
    const indexFile = path.join(DIST_DIR, 'index.html');
    if (fs.existsSync(indexFile)) {
      res.sendFile(indexFile);
    } else {
      res.status(404).send(`index.html을 찾을 수 없습니다: ${indexFile}`);
    }
  });

  return app;
}
