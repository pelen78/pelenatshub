import { STAGES, COMMITMENT_FIELDS, CLASSROOM_FIELDS } from './fields.js';

export const COURSES = [
  { id: 'computer-applications', group: 'Comp Apps', name: 'Computer Applications' },
  { id: 'makerspace', group: 'MakerSpace', name: 'Makerspace' },
  { id: 'ap-csp', group: 'AP CS Principles', name: 'AP Computer Science Principles' }
];
export const PROJECT_FIELDS = ['unit', 'learningTarget', 'successCriteria', 'requirements'];
export const get = (o, path) => path.split('.').reduce((v, key) => v?.[key], o);
export function set(o, path, value) {
  const keys = path.split('.'); let target = o;
  for (const key of keys.slice(0, -1)) { if (['__proto__', 'constructor', 'prototype'].includes(key)) throw new Error('Invalid field.'); target = target[key] ||= {}; }
  if (['__proto__', 'constructor', 'prototype'].includes(keys.at(-1))) throw new Error('Invalid field.');
  target[keys.at(-1)] = value;
}
export const stageFields = s => s.groups.flatMap(g => g.fields.map(f => ({ ...f, path: [s.key, g.key, f.key].filter(Boolean).join('.'), group: g.title || '' })));
export const FIELDS = [...STAGES.flatMap(stageFields), ...COMMITMENT_FIELDS.map(f => ({ ...f, path: 'commitment.' + f.key })), ...CLASSROOM_FIELDS.map(f => ({ ...f, path: 'classroom.' + f.key }))];
export function isoDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value + 'T12:00:00Z').toISOString().slice(0, 10) === value;
}
export function monday(value = new Date()) {
  const d = typeof value === 'string' ? new Date(value + 'T12:00:00') : new Date(value);
  d.setDate(d.getDate() - (d.getDay() + 6) % 7);
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
}
export function safeURL(value) {
  try { const u = new URL(value); return ['https:', 'http:'].includes(u.protocol) && !u.username && !u.password ? u.href : ''; } catch { return ''; }
}
function text(value, max = 12000) {
  if (value == null) return '';
  if (typeof value !== 'string' || value.length > max) throw new Error('A text field is invalid or too long.');
  return value;
}
export function projectSnapshot(p = {}) {
  const result = { id: text(p.id, 120), title: text(p.title, 300), url: safeURL(p.url), sourceRevision: text(p.sourceRevision, 80) };
  for (const key of PROJECT_FIELDS) result[key] = text(p[key]);
  return result;
}
export function normalizeEntry(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Invalid PLC entry.');
  if (!/^[a-zA-Z0-9_-]{1,120}$/.test(raw.id || '') || !COURSES.some(c => c.id === raw.courseId) || !isoDate(raw.weekOf)) throw new Error('Check the course, week and entry ID.');
  const e = { id: raw.id, courseId: raw.courseId, weekOf: monday(raw.weekOf), firstEntry: Boolean(raw.firstEntry), deleted: Boolean(raw.deleted), projects: [], evidence: [] };
  for (const f of FIELDS) set(e, f.path, text(get(raw, f.path)));
  if (raw.commitment?.reassessDate && !isoDate(raw.commitment.reassessDate)) throw new Error('Check the reassessment date.');
  const projects = raw.projects ?? [{ id: '', title: raw.projectName || '', url: raw.projectUrl || '', unit: raw.unit || '', ...raw.project }];
  if (!Array.isArray(projects) || projects.length > 20) throw new Error('Use up to 20 projects per PLC.');
  e.projects = projects.map(projectSnapshot);
  if (!Array.isArray(raw.evidence || []) || (raw.evidence || []).length > 50) throw new Error('Use up to 50 pieces of evidence.');
  e.evidence = (raw.evidence || []).map(v => ({ id: text(v.id || crypto.randomUUID(), 120), type: text(v.type, 120), title: text(v.title, 300), note: text(v.note), url: safeURL(v.url), image: safeURL(v.image) }));
  for (const key of ['createdAt', 'updatedAt']) e[key] = Number.isFinite(raw[key]) ? raw[key] : Date.now();
  return e;
}
export function newEntry(courseId, weekOf, projects, previous) {
  const e = normalizeEntry({ id: crypto.randomUUID(), courseId, weekOf, projects, firstEntry: !previous });
  e.reassess.previousResponse = previous?.commitment?.action || '';
  return e;
}
export function completion(entry) {
  // Completion measures documented reflection, not imported assignment metadata.
  const done = STAGES.map(s => s.key === 'reassess' && entry.firstEntry || stageFields(s).filter(f => f.quick).every(f => Boolean(get(entry, f.path)?.trim())));
  const commitment = Boolean(entry.commitment?.action?.trim() && entry.commitment?.reassessDate);
  return { done, count: done.filter(Boolean).length, commitment, complete: done.every(Boolean) && commitment };
}
export function catalogue(groups, revision, origin = 'https://pelenlab.com') {
  return COURSES.map(course => ({ ...course, projects: (groups[course.group]?.activities || []).filter(a => !a.pinned && a.link).map(a => ({
    ...projectSnapshot({ ...a.plc, id: a.id, title: a.title, url: new URL(a.link, origin + '/').href, sourceRevision: revision }),
    description: a.description || '', date: a.date || '', status: a.status || 'soon'
  })).sort((a, b) => ({ now: 0, soon: 1, done: 2 }[a.status] - { now: 0, soon: 1, done: 2 }[b.status])) }));
}
