// Public curriculum only. Weekly PLC records are never read by the build.
export const CLASSROOMS = [
  { id: 'comp-apps', group: 'Comp Apps', name: 'Comp Apps' },
  { id: 'makerspace', group: 'MakerSpace', name: 'MakerSpace' },
  { id: 'ap-cs-principles', group: 'AP CS Principles', name: 'AP CS Principles' }
];
const text = value => typeof value === 'string' ? value.trim() : '';
function safePath(value) {
  if (!text(value)) return '';
  try {
    const url = new URL(value, 'https://pelenlab.com/');
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? value : '';
  } catch { return ''; }
}
export function learningCatalogue(groups) {
  return { schema: 1, source: 'Published project learning goals in the Pelen Hub', classrooms: CLASSROOMS.map(course => ({
    id: course.id, name: course.name,
    assignments: (groups[course.group]?.activities || []).filter(a => a.id && safePath(a.link)).map(a => ({
      id: a.id, title: a.title, label: a.date || '', status: ['now', 'soon', 'done'].includes(a.status) ? a.status : 'soon', path: a.link,
      learningTarget: text(a.plc?.learningTarget),
      successCriteria: text(a.plc?.successCriteria).split(/\r?\n/).map(s => s.trim()).filter(Boolean)
    })).sort((a,b) => ({ now: 0, soon: 1, done: 2 }[a.status] - { now: 0, soon: 1, done: 2 }[b.status]))
  })).filter(c => c.assignments.length) };
}
export function renderTodayClass(template, groups) {
  const marker = /(<script type="application\/json" id="learning-catalog">)[\s\S]*?(<\/script>)/;
  if (!marker.test(template)) throw new Error('Today’s Class catalogue placeholder is missing.');
  const json = JSON.stringify(learningCatalogue(groups), null, 2).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  return template.replace(marker, (_, start, end) => start + json + end);
}
