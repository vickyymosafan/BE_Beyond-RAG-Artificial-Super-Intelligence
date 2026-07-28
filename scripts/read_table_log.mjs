import fs from 'fs';

const log = fs.readFileSync('C:\\Users\\vickymosafan\\.gemini/antigravity/brain/22d2b744-6155-465c-9174-091f40cb418d/.system_generated/tasks/task-1757.log', 'utf8');
const lines = log.split('\n');
const answerLine = lines.find(l => l.includes('| No | Bagian |'));
if (answerLine) {
  const tableRows = answerLine.split('\n');
  console.log('Row count:', tableRows.length);
  for (let i = 0; i < Math.min(10, tableRows.length); i++) {
    console.log(`Row ${i}:`, tableRows[i].slice(0, 100));
  }
} else {
  console.log('Answer line not found, raw log sample:', log.slice(0, 500));
}
