import { parseGroups } from '../server/repository.js';
import { renderTodayClass } from './learning-catalog.mjs';
import { cp, mkdir, rm, access, readFile, writeFile } from 'node:fs/promises';
const folders = ['admin', 'assignments', 'ap-cs-principles', 'comp-apps', 'games', 'makerspace', 'resources', 'sellos'];
await rm('dist', { recursive: true, force: true });
await mkdir('dist');
for (const name of ['index.html', '_routes.json', '_headers', 'publication.json', ...folders]) {
  try { await access(name); } catch { continue; }
  await cp(name, `dist/${name}`, { recursive: true });
}
const groups = parseGroups(await readFile('index.html', 'utf8'));
await writeFile('dist/resources/today-class.html', renderTodayClass(await readFile('resources/today-class.html', 'utf8'), groups));
console.log('Hub listo en dist/ · Today’s Class shares the project catalogue with PLC');
