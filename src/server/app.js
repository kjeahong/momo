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

  // 1. Folders API
  app.get('/api/folders', (req, res) => {
    const folders = queryAll(`
      SELECT f.*, 
        (
          SELECT count(*) FROM notes 
          WHERE folder_id = f.id OR folder_id IN (SELECT id FROM folders WHERE parent_id = f.id)
        ) as note_count
      FROM folders f 
      ORDER BY f.order_index ASC, f.created_time ASC
    `);
    res.json(folders);
  });

  app.post('/api/folders', (req, res) => {
    const { title, parent_id = '' } = req.body;
    if (!title) return res.status(400).json({ error: '폴더 제목이 필요합니다.' });
    const id = 'folder_' + Date.now();
    const now = Date.now();
    const maxOrderRow = queryOne('SELECT max(order_index) as max_order FROM folders WHERE parent_id = ?', [parent_id]);
    const nextOrder = (maxOrderRow?.max_order ?? -1) + 1;

    runSql(`
      INSERT INTO folders (id, title, parent_id, order_index, created_time, updated_time)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [id, title, parent_id, nextOrder, now, now]);
    res.json({ id, title, parent_id, order_index: nextOrder, created_time: now, updated_time: now, note_count: 0 });
  });

  app.put('/api/folders/:id', (req, res) => {
    const { title, parent_id, order_index } = req.body;
    const folder = queryOne('SELECT * FROM folders WHERE id = ?', [req.params.id]);
    if (!folder) return res.status(404).json({ error: '폴더를 찾을 수 없습니다.' });

    const newTitle = title !== undefined ? title : folder.title;
    const newParentId = parent_id !== undefined ? parent_id : folder.parent_id;
    const newOrder = order_index !== undefined ? order_index : folder.order_index;
    const now = Date.now();

    runSql(`
      UPDATE folders 
      SET title = ?, parent_id = ?, order_index = ?, updated_time = ?
      WHERE id = ?
    `, [newTitle, newParentId, newOrder, now, req.params.id]);

    res.json({ success: true, id: req.params.id, title: newTitle, parent_id: newParentId, order_index: newOrder });
  });

  app.delete('/api/folders/:id', (req, res) => {
    const folderId = req.params.id;
    // Delete subfolders as well
    const subFolders = queryAll('SELECT id FROM folders WHERE parent_id = ?', [folderId]);
    for (const sf of subFolders) {
      runSql('DELETE FROM folders WHERE id = ?', [sf.id]);
      runSql('DELETE FROM notes WHERE folder_id = ?', [sf.id]);
    }
    runSql('DELETE FROM folders WHERE id = ?', [folderId]);
    runSql('DELETE FROM notes WHERE folder_id = ?', [folderId]);
    res.json({ success: true });
  });

  // Reorder folders
  app.post('/api/folders/reorder', (req, res) => {
    const { folder_id, direction } = req.body; // direction: 'up' or 'down'
    const current = queryOne('SELECT * FROM folders WHERE id = ?', [folder_id]);
    if (!current) return res.status(404).json({ error: '폴더 없음' });

    const siblings = queryAll('SELECT * FROM folders WHERE parent_id = ? ORDER BY order_index ASC, created_time ASC', [current.parent_id]);
    const currentIndex = siblings.findIndex(f => f.id === folder_id);

    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex >= 0 && targetIndex < siblings.length) {
      const temp = siblings[currentIndex];
      siblings[currentIndex] = siblings[targetIndex];
      siblings[targetIndex] = temp;

      siblings.forEach((f, idx) => {
        runSql('UPDATE folders SET order_index = ? WHERE id = ?', [idx, f.id]);
      });
    }

    res.json({ success: true });
  });

  // Drag & Drop move folder (reorder or nest inside)
  app.post('/api/folders/move', (req, res) => {
    const { source_id, target_id, position } = req.body;
    // position: 'before' | 'after' | 'inside'
    if (!source_id || !target_id || source_id === target_id) {
      return res.status(400).json({ error: '잘못된 이동 대상입니다.' });
    }

    const source = queryOne('SELECT * FROM folders WHERE id = ?', [source_id]);
    const target = queryOne('SELECT * FROM folders WHERE id = ?', [target_id]);
    if (!source || !target) {
      return res.status(404).json({ error: '폴더를 찾을 수 없습니다.' });
    }

    // Prevent cycle: cannot move folder into its own descendant
    let curr = target;
    while (curr && curr.parent_id) {
      if (curr.parent_id === source.id) {
        return res.status(400).json({ error: '자신의 하위 폴더로 이동할 수 없습니다.' });
      }
      curr = queryOne('SELECT * FROM folders WHERE id = ?', [curr.parent_id]);
    }

    const now = Date.now();

    if (position === 'inside') {
      const children = queryAll('SELECT * FROM folders WHERE parent_id = ? ORDER BY order_index ASC', [target.id]);
      const maxOrder = children.length > 0 ? Math.max(...children.map(c => c.order_index || 0)) : -1;
      runSql('UPDATE folders SET parent_id = ?, order_index = ?, updated_time = ? WHERE id = ?', [
        target.id,
        maxOrder + 1,
        now,
        source.id
      ]);
    } else {
      const newParentId = target.parent_id || '';
      const siblings = queryAll(
        'SELECT * FROM folders WHERE parent_id = ? AND id != ? ORDER BY order_index ASC, created_time ASC',
        [newParentId, source.id]
      );
      const targetIndex = siblings.findIndex(f => f.id === target.id);
      const insertIndex = position === 'before' ? Math.max(0, targetIndex) : targetIndex + 1;

      siblings.splice(insertIndex, 0, source);

      siblings.forEach((f, idx) => {
        runSql('UPDATE folders SET parent_id = ?, order_index = ?, updated_time = ? WHERE id = ?', [
          newParentId,
          idx,
          now,
          f.id
        ]);
      });
    }

    res.json({ success: true });
  });

  // 2. Notes API
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

  // Fast note title update
  app.put('/api/notes/:id/title', (req, res) => {
    const { title } = req.body;
    if (title === undefined) return res.status(400).json({ error: '제목을 입력하세요.' });

    const note = queryOne('SELECT * FROM notes WHERE id = ?', [req.params.id]);
    if (!note) return res.status(404).json({ error: '메모를 찾을 수 없습니다.' });

    const now = Date.now();
    runSql('UPDATE notes SET title = ?, updated_time = ? WHERE id = ?', [title, now, req.params.id]);
    res.json({ success: true, id: req.params.id, title, updated_time: now });
  });

  // Move note to folder
  app.post('/api/notes/:id/move', (req, res) => {
    const { folder_id } = req.body;
    const note = queryOne('SELECT * FROM notes WHERE id = ?', [req.params.id]);
    if (!note) return res.status(404).json({ error: '메모 없음' });

    const targetFolder = queryOne('SELECT * FROM folders WHERE id = ?', [folder_id]);
    if (!targetFolder && folder_id !== 'default') {
      return res.status(404).json({ error: '대상 폴더 없음' });
    }

    runSql('UPDATE notes SET folder_id = ?, updated_time = ? WHERE id = ?', [
      folder_id,
      Date.now(),
      req.params.id
    ]);
    res.json({ success: true, folder_id });
  });

  // Duplicate note
  app.post('/api/notes/:id/duplicate', (req, res) => {
    const note = queryOne('SELECT * FROM notes WHERE id = ?', [req.params.id]);
    if (!note) return res.status(404).json({ error: '메모 없음' });

    const newId = 'note_' + Date.now();
    const now = Date.now();
    runSql(`
      INSERT INTO notes (id, folder_id, title, body, image_text, created_time, updated_time, is_pinned, is_todo, todo_completed)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [newId, note.folder_id, `${note.title} (복사본)`, note.body, note.image_text || '', now, now, 0, note.is_todo || 0, 0]);

    res.json({ success: true, id: newId });
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
