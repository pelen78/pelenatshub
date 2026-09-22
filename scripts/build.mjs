import { cp, mkdir, rm, access } from 'node:fs/promises';
const folders = ['admin', 'assignments', 'ap-cs-principles', 'comp-apps', 'games', 'makerspace', 'resources', 'sellos'];
await rm('dist', { recursive: true, force: true });
await mkdir('dist');
for (const name of ['index.html', '_routes.json', '_headers', 'publication.json', ...folders]) {
  try { await access(name); } catch { continue; }
  await cp(name, `dist/${name}`, { recursive: true });
}
console.log('Hub listo en dist/');
