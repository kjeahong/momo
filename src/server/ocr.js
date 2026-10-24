import fs from 'node:fs';
import path from 'node:path';
import { queryAll, queryOne, runSql } from './db.js';

let isProcessing = false;
let ocrProgress = { total: 0, current: 0, status: 'idle' };

export function getOcrProgress() {
  return ocrProgress;
}

export function updateNoteImageText(noteId) {
  const note = queryOne('SELECT body FROM notes WHERE id = ?', [noteId]);
  if (!note) return;

  const resourceIds = [];
  const regex = /:\/([a-zA-Z0-9]{32})/g;
  let match;
  while ((match = regex.exec(note.body)) !== null) {
    resourceIds.push(match[1]);
  }

  if (resourceIds.length === 0) return;

  const placeholders = resourceIds.map(() => '?').join(',');
  const res = queryAll(`
    SELECT ocr_text FROM resources 
    WHERE id IN (${placeholders}) AND length(trim(ocr_text)) > 0
  `, resourceIds);

  const combinedText = res.map(r => r.ocr_text).join('\n');
  runSql('UPDATE notes SET image_text = ? WHERE id = ?', [combinedText, noteId]);
}

export async function runOcrPipeline() {
  if (isProcessing) return ocrProgress;
  isProcessing = true;

  try {
    const pendingResources = queryAll(`
      SELECT id, filepath, filename, mime 
      FROM resources 
      WHERE (ocr_status = 0 OR ocr_text = '') 
        AND (mime LIKE 'image/%' OR filepath LIKE '%.png' OR filepath LIKE '%.jpg' OR filepath LIKE '%.jpeg')
    `);

    ocrProgress = {
      total: pendingResources.length,
      current: 0,
      status: pendingResources.length > 0 ? 'running' : 'completed'
    };

    if (pendingResources.length === 0) {
      isProcessing = false;
      return ocrProgress;
    }

    let createWorker;
    try {
      const tesseract = await import('tesseract.js');
      createWorker = tesseract.createWorker;
    } catch (e) {
      isProcessing = false;
      ocrProgress.status = 'error';
      return ocrProgress;
    }

    const worker = await createWorker('kor+eng');

    for (const res of pendingResources) {
      if (!fs.existsSync(res.filepath)) {
        runSql('UPDATE resources SET ocr_status = -1 WHERE id = ?', [res.id]);
        ocrProgress.current++;
        continue;
      }

      try {
        const ret = await worker.recognize(res.filepath);
        const extractedText = ret.data.text.trim();

        runSql(`
          UPDATE resources 
          SET ocr_text = ?, ocr_status = 1 
          WHERE id = ?
        `, [extractedText, res.id]);

        const referringNotes = queryAll('SELECT id FROM notes WHERE body LIKE ?', [`%${res.id}%`]);
        for (const n of referringNotes) {
          updateNoteImageText(n.id);
        }
      } catch (err) {
        runSql('UPDATE resources SET ocr_status = -1 WHERE id = ?', [res.id]);
      }

      ocrProgress.current++;
    }

    await worker.terminate();
    ocrProgress.status = 'completed';
  } catch (err) {
    ocrProgress.status = 'error';
  } finally {
    isProcessing = false;
  }

  return ocrProgress;
}
