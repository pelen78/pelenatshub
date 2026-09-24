import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { preparePublication, safeLink, readInput } from '../server/publish.js';
import { parseGroups, writeGroups, github } from '../server/repository.js';
import { addBackLink } from '../server/back-link.js';
const source = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const revision = 'a'.repeat(40);
function state() {
  const groups = parseGroups(source);
  return { source, groups, revision, baseTree: 'b'.repeat(40), files: Object.values(groups).flatMap(g => g.activities).filter(a => a.link && !a.link.startsWith('http')).map(a => ({ path: a.link, type: 'blob', mode: '100644' })) };
}
function input() { return { action: 'save', revision, requestId: crypto.randomUUID(), group: 'Comp Apps', entry: { title: 'Una actividad nueva', description: 'Descripción con acentos', date: 'Week 4', status: 'now', link: '', pinned: false }, html: '<!doctype html><html><body>Hola</body></html>' }; }

test('student subjects publish without a hub button, including reuploaded legacy HTML', () => {
  const plain = '<html><body><a href="reading.html">Reading</a><style>body{color:red}</style></body></html>';
  const legacy = addBackLink(plain, 'assignments/old/index.html', 'Resources');
  for (const group of ['Comp Apps', 'MakerSpace', 'AP CS Principles']) {
    for (const html of [plain, legacy]) {
      const result = preparePublication(state(), { ...input(), group, html });
      const page = result.files.find(f => f.path === result.entry.link).content;
      assert.doesNotMatch(page, /data-hub-back|Pelen Hub/);
      assert.ok(page.includes('<a href="reading.html">Reading</a><style>body{color:red}</style>'));
    }
  }
});
test('other groups keep their hub button when publishing or reuploading', () => {
  for (const group of ['Resources', 'Games']) {
    const value = { ...input(), group };
    const result = preparePublication(state(), value);
    const page = result.files.find(f => f.path === result.entry.link).content;
    assert.match(page, /<a data-hub-back href="\.\.\/\.\.\/index.html#/);
    const replacement = preparePublication(state(), { ...value, html: page });
    assert.equal(replacement.files.find(f => f.path === replacement.entry.link).content, page);
  }
});

test('new HTML, metadata and publication marker are written together; existing entries survive', () => {
  const initial = state(); const result = preparePublication(initial, input());
  assert.equal(result.files.length, 3);
  assert.match(result.entry.link, /^assignments\/[a-f0-9-]+\/index.html$/);
  const groups = parseGroups(result.files.find(f => f.path === 'index.html').content);
  assert.equal(groups['Comp Apps'].activities.length, initial.groups['Comp Apps'].activities.length + 1);
  assert.deepEqual(groups.MakerSpace, initial.groups.MakerSpace);
  assert.deepEqual(groups['Comp Apps'].activities.slice(1), initial.groups['Comp Apps'].activities);
});
test('HTML replacement keeps original link, pinned state, position, and other activities', () => {
  const initial = state(), previous = initial.groups.Resources.activities.find(a => a.pinned) || initial.groups.Resources.activities[0];
  const value = input(); value.group = 'Resources'; value.id = previous.id; value.entry = { ...previous, pinned: true, title: 'Updated' };
  const result = preparePublication(initial, value);
  assert.equal(result.entry.link, previous.link); assert.equal(result.entry.pinned, true);
  assert.equal(result.groups.Resources.activities.length, initial.groups.Resources.activities.length);
  assert.equal(result.groups.Resources.activities.findIndex(a => a.id === previous.id), initial.groups.Resources.activities.findIndex(a => a.id === previous.id));
});
test('metadata-only edit can move groups and retain reference information', () => {
  const initial = state(), previous = initial.groups['Comp Apps'].activities[0];
  const value = input(); Object.assign(value, { id: previous.id, group: 'MakerSpace', html: null, entry: { ...previous, pinned: true } });
  const result = preparePublication(initial, value);
  assert.equal(result.files.length, 2); assert.equal(result.groups.MakerSpace.activities[0].id, previous.id);
  assert.equal(result.groups['Comp Apps'].activities.some(a => a.id === previous.id), false);
});
test('concurrent or stale save never generates a replacement commit', () => {
  assert.throws(() => preparePublication(state(), { ...input(), revision: 'c'.repeat(40) }), { status: 409 });
});
test('removal retires a card, leaving its HTML untouched', () => {
  const initial = state(), previous = initial.groups['Comp Apps'].activities[0];
  const result = preparePublication(initial, { ...input(), id: previous.id, action: 'remove' });
  assert.equal(result.files.some(f => f.path === previous.link), false);
  assert.equal(result.groups['Comp Apps'].activities.some(a => a.id === previous.id), false);
});
test('HTML injection in metadata cannot escape the public inline script', () => {
  const value = input(); value.entry.title = '</script><script>alert(1)</script>'; value.entry.description = '$& $$ $`';
  const result = preparePublication(state(), value);
  const html = result.files.find(f => f.path === 'index.html').content;
  assert.equal(html.includes(value.entry.title), false);
  assert.equal(parseGroups(html)['Comp Apps'].activities[0].title, value.entry.title);
  assert.equal(parseGroups(html)['Comp Apps'].activities[0].description, value.entry.description);
});
test('unsafe links, malformed uploads and directory traversal are rejected', () => {
  for (const link of ['javascript:alert(1)', '//evil.com', '../admin/', 'https://x/\" onmouseover=1', 'data:text/html,hi']) assert.throws(() => safeLink(link));
  assert.equal(safeLink('makerspace/task-01/task.html'), 'makerspace/task-01/task.html');
  const value = input(); value.assets = [{ path: '../index.js', content: 'YQ==' }];
  assert.throws(() => preparePublication(state(), value));
  assert.throws(() => preparePublication(state(), { ...input(), html: 'hello' }));
  assert.throws(() => preparePublication(state(), { ...input(), html: '<html>' + 'x'.repeat(5 * 1024 * 1024) }));
});
test('nested supporting assets stay inside the new activity directory', () => {
  const value = input(); value.assets = [{ path: 'images/test.png', content: 'YQ==' }];
  const result = preparePublication(state(), value);
  assert.equal(result.files[1].path, result.entry.link.replace('index.html', 'images/test.png'));
  assert.equal(result.files[1].encoding, 'base64');
});
test('invalid source and invalid upload request fail without touching repository', async () => {
  assert.throws(() => writeGroups('invalid', {}), { status: 409 });
  await assert.rejects(() => readInput(new Request('https://example.com', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: '{}' })), { status: 415 });
});
test('repository performs one non-forced branch update for every file, after creating a commit', async () => {
  const calls = [];
  const repo = github({ GITHUB_TOKEN: 'test' }, async (url, options) => {
    const data = options.body ? JSON.parse(options.body) : null; calls.push({ url, method: options.method, data });
    return Response.json({ sha: 'd'.repeat(40) });
  });
  await repo.commitFiles(state(), [{ path: 'index.html', content: 'test' }, { path: 'assignment.html', content: 'test' }], 'Publish');
  assert.equal(calls.filter(c => c.method === 'PATCH').length, 1);
  assert.deepEqual(calls.at(-1).data, { sha: 'd'.repeat(40), force: false });
  assert.deepEqual(calls.at(-2).data.parents, [revision]);
  const conflict = github({ GITHUB_TOKEN: 'test' }, async () => Response.json({}, { status: 422 }));
  await assert.rejects(() => conflict.commitFiles(state(), [{ path: 'index.html', content: '' }], 'Publish'), { status: 409 });
});
