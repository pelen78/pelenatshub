import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { learningCatalogue, renderTodayClass } from '../scripts/learning-catalog.mjs';
import { parseGroups } from '../server/repository.js';
import { preparePublication } from '../server/publish.js';
import { catalogue, newEntry } from '../admin/plc/model.js';
const source = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const template = fs.readFileSync(new URL('../resources/today-class.html', import.meta.url), 'utf8');
const groups = parseGroups(source);
const revision = 'a'.repeat(40);
const embedded = html => JSON.parse(html.match(/id="learning-catalog">([\s\S]*?)<\/script>/)[1]);

test('Today’s Class and PLC share published objectives and criteria for every project', () => {
  const publicProjects = learningCatalogue(groups).classrooms.flatMap(c => c.assignments);
  for (const p of catalogue(groups, revision).flatMap(c => c.projects)) {
    const board = publicProjects.find(a => a.id === p.id);
    assert.ok(board, p.title);
    assert.equal(board.learningTarget, p.learningTarget.trim());
    assert.deepEqual(board.successCriteria, p.successCriteria.split(/\r?\n/).map(s => s.trim()).filter(Boolean));
  }
  const files = publicProjects.find(a => a.path.includes('task-03-file-management'));
  assert.equal(files.learningTarget, 'I can identify file types and use names, extensions and paths to organize and locate my files.');
});

test('newly published assignments and changed goals reach the board while historical PLCs keep their snapshot', () => {
  const state = { source, groups, revision, files: [] };
  const saved = newEntry('computer-applications', '2026-09-21', catalogue(groups, revision)[0].projects);
  const old = structuredClone(saved);
  const input = { revision, requestId: crypto.randomUUID(), action: 'save', group: 'Comp Apps',
    entry: { title: 'New classroom project', description: '', date: 'Today', status: 'now', pinned: false, link: 'assignments/new/index.html', plc: { learningTarget: 'I can test my solution.', successCriteria: 'I can explain it.\nI can improve it.' } } };
  const result = preparePublication(state, input);
  const built = embedded(renderTodayClass(template, result.groups));
  assert.equal(built.classrooms[0].assignments.find(a => a.id === result.entry.id).learningTarget, input.entry.plc.learningTarget);
  const updated = preparePublication({ ...state, groups: result.groups }, { ...input, id: result.entry.id, entry: { ...input.entry, plc: { learningTarget: 'An updated goal', successCriteria: 'An updated criterion' } } });
  assert.equal(embedded(renderTodayClass(template, updated.groups)).classrooms[0].assignments.find(a => a.id === result.entry.id).learningTarget, 'An updated goal');
  assert.deepEqual(saved, old);
});

test('projection contains only public curriculum and safely embeds script-like text', () => {
  const unsafe = structuredClone(groups);
  const item = unsafe['Comp Apps'].activities[0];
  item.plc = { learningTarget: '</script><script>alert(1)</script>', successCriteria: 'First\nSecond', classroom: 'PRIVATE FIXTURE', observations: 'PRIVATE FIXTURE' };
  item.evidence = [{ note: 'PRIVATE FIXTURE' }];
  const html = renderTodayClass(template, unsafe);
  assert.equal(html.includes(item.plc.learningTarget), false);
  assert.equal(html.includes('PRIVATE FIXTURE'), false);
  assert.equal(embedded(html).classrooms[0].assignments.find(a => a.id === item.id).learningTarget, item.plc.learningTarget);
  assert.equal(html.match(/<style>[\s\S]*?<\/style>/)[0], template.match(/<style>[\s\S]*?<\/style>/)[0]);
});

test('missing goals remain blank and unsafe assignment links are excluded', () => {
  const minimal = { 'Comp Apps': { activities: [
    { id: 'new', title: 'New project', link: 'assignments/new/index.html', status: 'soon' },
    { id: 'bad', title: 'Unsafe', link: 'javascript:alert(1)' }
  ] } };
  const result = learningCatalogue(minimal).classrooms[0].assignments;
  assert.equal(result.length, 1);
  assert.equal(result[0].learningTarget, '');
  assert.deepEqual(result[0].successCriteria, []);
  assert.throws(() => renderTodayClass('<html></html>', minimal));
});
