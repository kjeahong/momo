import fs from 'node:fs';
import path from 'node:path';
import { db } from './db.js';

let isProcessing = false;
let ocrProgress = { total: 0, current: 0, status: 'idle' };

export function getOcrProgress() {
  return ocrProgress;
}

// Map note resources
export function updateNoteImageText(noteId) {
  // Find all resources associated with this note or in its body
  const note = db.prepare('SELECT body FROM notes WHERE id = ?').get(noteId);
  if (!note) return;

  const resourceIds = [];
  const regex = /:\/([a-zA-Z0-9]{32})/g;
  let match;
  while ((match = regex.exec(note.body)) !== null) {
    resourceIds.push(match[1]);
  }

  if (resourceIds.length === 0) return;

  const placeholders = resourceIds.map(() => '?').join(',');
  const res = db.prepare(`
    SELECT ocr_text FROM resources 
    WHERE id IN (${placeholders}) AND length(trim(ocr_text)) > 0
  `).all(...resourceIds);

  const combinedText = res.map(r => r.ocr_text).join('\n');
  db.prepare('UPDATE notes SET image_text = ? WHERE id = ?').run(combinedText, noteId);

  // Update FTS
  const n = db.prepare('SELECT title, body, image_text FROM notes WHERE id = ?').get(noteId);
  db.prepare('DELETE FROM notes_fts WHERE id = ?').run(noteId);
  db.prepare('INSERT INTO notes_fts (id, title, body, image_text) VALUES (?, ?, ?, ?)').run(noteId, n.title, n.body, n.image_text);
}

// Background OCR Runner using tesseract.js
export async function runOcrPipeline() {
  if (isProcessing) return ocrProgress;
  isProcessing = true;

  try {
    const pendingResources = db.prepare(`
      SELECT id, filepath, filename, mime 
      FROM resources 
      WHERE (ocr_status = 0 OR ocr_text = '') 
        AND (mime LIKE 'image/%' OR filepath LIKE '%.png' OR filepath LIKE '%.jpg' OR filepath LIKE '%.jpeg')
    `).all();

    ocrProgress = {
      total: pendingResources.length,
      current: 0,
      status: pendingResources.length > 0 ? 'running' : 'completed'
    };

    if (pendingResources.length === 0) {
      isProcessing = false;
      return ocrProgress;
    }

    // Dynamic import tesseract
    let createWorker;
    try {
      const tesseract = await import('tesseract.js');
      createWorker = tesseract.createWorker;
    } catch (e) {
      console.warn('Tesseract.js not yet loaded:', e.message);
      isProcessing = false;
      ocrProgress.status = 'error';
      return ocrProgress;
    }

    const worker = await createWorker('kor+eng');

    for (const res of pendingResources) {
      if (!fs.existsSync(res.filepath)) {
        db.prepare('UPDATE resources SET ocr_status = -1 WHERE id = ?').run(res.id);
        ocrProgress.current++;
        continue;
      }

      try {
        const ret = await worker.recognize(res.filepath);
        const extractedText = ret.data.text.trim();

        db.prepare(`
          UPDATE resources 
          SET ocr_text = ?, ocr_status = 1 
          WHERE id = ?
        `).run(extractedText, res.id);

        // Find notes referencing this resource and update them
        const referringNotes = db.prepare(`
          SELECT id FROM notes WHERE body LIKE ?
        `).all(`%${res.id}%`);

        for (const n of referringNotes) {
          updateNoteImageText(n.id);
        }
      } catch (err) {
        console.error(`OCR Error for resource ${res.id}:`, err.message);
        db.prepare('UPDATE resources SET ocr_status = -1 WHERE id = ?').run(res.id);
      }

      ocrProgress.current++;
    }

    await worker.terminate();
    ocrProgress.status = 'completed';
  } catch (err) {
    console.error('OCR pipeline failed:', err);
    ocrProgress.status = 'error';
  } finally {
    isProcessing = false;
  }

  return ocrProgress;
}
