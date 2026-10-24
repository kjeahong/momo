import express from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import { db, initDb, ensureDefaultFolder, searchNotes } from './db.js';
import { getDefaultJoplinPaths, importFromJoplin } from './importer.js';
import { runOcrPipeline, getOcrProgress } from './ocr.js';

initDb();
ensureDefaultFolder();

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Serve resources
const RES_DIR = path.resolve(process.cwd(), 'data', 'resources');
if (!fs.existsSync(RES_DIR)) {
  fs.mkdirSync(RES_DIR, { recursive: true });
}
app.use('/resources', express.static(RES_DIR));

// 1. Folders API
app.get('/api/folders', (req, res) => {
  const folders = db.prepare(`
    SELECT f.*, (SELECT count(*) FROM notes WHERE folder_id = f.id) as note_count
    FROM folders f 
    ORDER BY f.title ASC
  `).all();
  res.json(folders);
});

app.post('/api/folders', (req, res) => {
  const { title, parent_id = '' } = req.body;
  if (!title) return res.status(400).json({ error: '폴더 제목이 필요합니다.' });
  const id = 'folder_' + Date.now();
  const now = Date.now();
  db.prepare(`
    INSERT INTO folders (id, title, parent_id, created_time, updated_time)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, title, parent_id, now, now);
  res.json({ id, title, parent_id, created_time: now, updated_time: now });
});

// 2. Notes API & Hybrid Search
app.get('/api/notes', (req, res) => {
  const { q = '', folder_id = '' } = req.query;
  const results = searchNotes(q, folder_id);
  res.json(results);
});

app.get('/api/notes/:id', (req, res) => {
  const note = db.prepare('SELECT * FROM notes WHERE id = ?').get(req.params.id);
  if (!note) return res.status(404).json({ error: '노트를 찾을 수 없습니다.' });
  res.json(note);
});

app.post('/api/notes', (req, res) => {
  const { id, folder_id = 'default', title = '무제', body = '' } = req.body;
  const noteId = id || ('note_' + Date.now());
  const now = Date.now();

  const existing = db.prepare('SELECT * FROM notes WHERE id = ?').get(noteId);
  if (existing) {
    db.prepare(`
      UPDATE notes 
      SET folder_id = ?, title = ?, body = ?, updated_time = ?
      WHERE id = ?
    `).run(folder_id, title, body, now, noteId);

    db.prepare('DELETE FROM notes_fts WHERE id = ?').run(noteId);
    db.prepare('INSERT INTO notes_fts (id, title, body, image_text) VALUES (?, ?, ?, ?)').run(noteId, title, body, existing.image_text || '');
  } else {
    db.prepare(`
      INSERT INTO notes (id, folder_id, title, body, image_text, created_time, updated_time)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(noteId, folder_id, title, body, '', now, now);

    db.prepare('INSERT INTO notes_fts (id, title, body, image_text) VALUES (?, ?, ?, ?)').run(noteId, title, body, '');
  }

  res.json({ id: noteId, folder_id, title, body, updated_time: now });
});

app.delete('/api/notes/:id', (req, res) => {
  const noteId = req.params.id;
  db.prepare('DELETE FROM notes WHERE id = ?').run(noteId);
  db.prepare('DELETE FROM notes_fts WHERE id = ?').run(noteId);
  res.json({ success: true });
});

// 3. Joplin Auto-Detect & 1-Click Import
app.get('/api/joplin/detect', (req, res) => {
  const defaults = getDefaultJoplinPaths();
  res.json(defaults);
});

app.post('/api/joplin/import', (req, res) => {
  const { dbPath, resDir } = req.body;
  try {
    const summary = importFromJoplin(dbPath, resDir);
    // Auto-trigger background OCR after import
    runOcrPipeline().catch(console.error);
    res.json({ success: true, summary });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 4. OCR Status & Trigger
app.get('/api/ocr/status', (req, res) => {
  res.json(getOcrProgress());
});

app.post('/api/ocr/start', (req, res) => {
  runOcrPipeline().catch(console.error);
  res.json({ message: 'OCR 작업이 백그라운드에서 시작되었습니다.' });
});

const PORT = process.env.PORT || 3001;

// Serve built frontend if available
const DIST_DIR = path.resolve(process.cwd(), 'dist');
if (fs.existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/resources')) {
      return next();
    }
    res.sendFile(path.join(DIST_DIR, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`Momo 백엔드 & 앱 서버 실행 중: http://localhost:${PORT}`);
});
