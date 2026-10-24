import { getDefaultJoplinPaths, importFromJoplin } from './src/server/importer.js';
import { searchNotes, db } from './src/server/db.js';

console.log('Testing Joplin Detection:');
const paths = getDefaultJoplinPaths();
console.log(paths);

if (paths.exists) {
  console.log('Starting 1-Click Import test...');
  const summary = importFromJoplin(paths.dbPath, paths.resDir, (p) => {
    console.log(`Progress: ${p.current} / ${p.total}`);
  });
  console.log('IMPORT COMPLETE SUMMARY:', summary);

  const totalNotesInDb = db.prepare('SELECT count(*) as count FROM notes').get().count;
  const totalFoldersInDb = db.prepare('SELECT count(*) as count FROM folders').get().count;
  console.log(`Momo DB now contains: ${totalFoldersInDb} folders, ${totalNotesInDb} notes`);

  // Test Search on imported 3,000+ notes!
  const queries = ['메모', '회의', '프로젝트', '테스트'];
  for (const q of queries) {
    const res = searchNotes(q);
    console.log(`Search query "${q}": found ${res.length} notes (first match: "${res[0]?.title}")`);
  }
}
