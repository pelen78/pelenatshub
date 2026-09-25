import { STAGES, COMMITMENT_FIELDS, CLASSROOM_FIELDS } from './fields.js';
import { COURSES, FIELDS, PROJECT_FIELDS, get, set, stageFields, monday, isoDate, safeURL, normalizeEntry, newEntry, completion, projectSnapshot, projectPLC } from './model.js';

const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const colors = ['#46688f', '#24746e', '#956319', '#5c5896', '#865575', '#527337'];
const names = { unit: 'Unit', learningTarget: 'Learning target', successCriteria: 'Success criteria / rubric', requirements: 'Requirements / deliverables' };
const statusNames = { now: 'NOW', soon: 'COMING UP', done: 'FINISHED' };
let courses = [], records = new Map(), pending = new Map(), conflicts = new Set(), selected = null;
let account = '', cacheKey = '', busy = false, timer, fullMode = false, filter = 'all', trash = false, conflictCloud;
let cloudAvailable = false, localAvailable = true, cloudMessage = '';
let writerId = '', journalKey = '';
function journals() { const found=[]; try { for(let i=0;i<localStorage.length;i++){const key=localStorage.key(i);if(key.startsWith(cacheKey+':drafts:')&&key!==journalKey)found.push(key);} } catch {} return found; }
const revisions = new Map();
const courseName = id => COURSES.find(c => c.id === id)?.name || id;
const current = () => records.get(selected);
const sorted = () => [...records.values()].filter(e => Boolean(e.deleted) === trash && (filter === 'all' || e.courseId === filter)).sort((a,b) => b.weekOf.localeCompare(a.weekOf) || b.createdAt - a.createdAt);
const dateLabel = value => new Date(value + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const projectTitle = e => e.projects.map(p => p.title).join(' + ') || 'No project selected';
const shared = e => e.projects.length > 1;
function notice(message = '') { $('notice').textContent = message; $('notice').hidden = !message; }
async function api(path, options = {}) {
  const response = await fetch('/api/admin/plc/' + path, { ...options, cache: 'no-store', credentials: 'same-origin', headers: { 'X-Hub-Request': '1', ...options.headers } });
  if (!response.headers.get('Content-Type')?.includes('application/json')) throw new Error('Your session is unavailable. Sign in again; your browser draft is kept.');
  const data = await response.json();
  if (!response.ok) { const error = new Error(data.error || 'The request failed.'); error.status = response.status; throw error; }
  return data;
}
function cache() {
  if (!cacheKey) return;
  try {
    localStorage.setItem(cacheKey, JSON.stringify({ records: [...records.values()].filter(e=>!pending.has(e.id)), revisions: [...revisions], pending: [], savedAt: Date.now() }));
    if(pending.size) localStorage.setItem(journalKey,JSON.stringify([...pending].map(([id,generation])=>({entry:records.get(id),revision:revisions.get(id)||0,generation}))));
    else localStorage.removeItem(journalKey);
    localAvailable = true;
  }
  catch { localAvailable = false; notice('Browser storage is full or blocked. Keep this page open until cloud saving succeeds, or download a backup.'); }
}
function saveStatus() {
  const n = pending.size;
  $('saveStatus').textContent = busy ? 'Saving privately…' : conflicts.size ? 'Version conflict · draft kept' : n ? `${n} ${n === 1 ? 'draft' : 'drafts'} ${localAvailable ? 'saved on this browser' : 'not saved'} · cloud pending` : cloudAvailable ? 'Saved to private cloud ✓' : 'Cloud storage unavailable';
  $('retry').hidden = !n || busy;
}
function changed(entry, redraw = false) {
  entry.updatedAt = Date.now(); pending.set(entry.id, (pending.get(entry.id) || 0) + 1);
  cache(); saveStatus(); updateProgress(); renderWeeks();
  clearTimeout(timer); timer = setTimeout(flush, 850);
  if (redraw) renderContent();
}
async function flush() {
  clearTimeout(timer); if (busy) return;
  busy = true; saveStatus();
  try {
    for (const [id, generation] of [...pending]) {
      if (conflicts.has(id)) continue;
      const entry = structuredClone(records.get(id));
      try {
        const result = await api('entries', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ entry, revision: revisions.get(id) || 0 }) });
        revisions.set(id, result.revision); cloudAvailable = true; cloudMessage = '';
        if (pending.get(id) === generation) { records.set(id, result.entry); pending.delete(id); }
        cache(); renderWeeks();
      } catch (error) {
        if (error.status === 409) { conflicts.add(id); if (selected === id) renderContent(); }
        else { cloudAvailable = false; cloudMessage = error.message; }
        notice(error.message); break;
      }
    }
  } finally {
    busy = false; saveStatus();
    if (cloudAvailable && [...pending.keys()].some(id => !conflicts.has(id))) timer = setTimeout(flush, 1000);
  }
}
async function loadCatalogue() {
  const data = await api('projects');
  if (account && data.email.toLowerCase() !== account) throw new Error('Your signed-in account changed. Reload before continuing.');
  account = data.email.toLowerCase(); courses = data.courses; cacheKey = 'pelen.plc.v2.' + account;
  if(!writerId){try{writerId=sessionStorage.getItem(cacheKey+':writer')||crypto.randomUUID();sessionStorage.setItem(cacheKey+':writer',writerId);}catch{writerId=crypto.randomUUID();}}
  journalKey=cacheKey+':drafts:'+writerId;
  $('account').textContent = account + ' · private workspace';
}
async function start() {
  try {
    await loadCatalogue();
    let cached;
    try { cached = JSON.parse(localStorage.getItem(cacheKey) || 'null'); } catch { notice('The browser backup could not be read. Cloud records will still be loaded.'); }
    if (cached) {
      try {
        const entries = (cached.records || []).map(normalizeEntry);
        records = new Map(entries.map(e => [e.id, e]));
        for (const [id, revision] of cached.revisions || []) if (Number.isSafeInteger(revision)) revisions.set(id, revision);
        pending = new Map((cached.pending || []).filter(([id]) => records.has(id)));
      } catch { notice('Some browser backup data is invalid. Import a downloaded backup to recover it.'); }
    }
    try {
      const own=JSON.parse(localStorage.getItem(journalKey)||'[]');
      for(const item of own){const e=normalizeEntry(item.entry);records.set(e.id,e);revisions.set(e.id,item.revision);pending.set(e.id,item.generation||1);}
    } catch {notice('A browser draft could not be read. Use your downloaded backup if needed.');}
    try {
      const remote = await api('entries'); cloudAvailable = true;
      const remoteIds = new Set(remote.records.map(r => r.entry.id));
      for (const id of [...records.keys()]) if (!remoteIds.has(id) && !pending.has(id)) records.delete(id);
      for (const { entry, revision } of remote.records) {
        if (pending.has(entry.id)) { if ((revisions.get(entry.id) || 0) !== revision) conflicts.add(entry.id); }
        else { records.set(entry.id, normalizeEntry(entry)); revisions.set(entry.id, revision); }
      }
    } catch (error) { cloudMessage = error.message; notice(error.message); }
    cache();
    for (const id of ['newWeek', 'export', 'importFile', 'refresh', 'showTrash', 'recoverDrafts']) $(id).disabled = false;
    for (const course of COURSES) { $('courseFilter').add(new Option(course.name, course.id)); $('newCourse').add(new Option(course.name, course.id)); }
    selected = new URLSearchParams(location.hash.slice(1)).get('entry');
    if (!records.has(selected)) selected = null;
    render(); saveStatus();
    if(journals().length)notice('This browser has drafts from another tab or session. Use Recover browser drafts to inspect and preserve them.');
    if (cloudAvailable) flush();
  } catch (error) {
    notice(error.message);
    $('saveStatus').textContent = 'Connection required';
    $('content').innerHTML = `<div class="empty"><h2>Let’s reconnect.</h2><p>Sign in to the teacher dashboard, then reopen Weekly PLC.</p><a class="primary" href="/admin/">Teacher dashboard →</a></div>`;
  }
}
function render() { renderWeeks(); renderContent(); }
function select(id) { selected = id; trash = false; history.replaceState(null, '', id ? '#entry=' + encodeURIComponent(id) : location.pathname); render(); }
function renderWeeks() {
  $('weekList').innerHTML = sorted().map(e => `<button class="week-item" data-select="${esc(e.id)}" ${e.id === selected ? 'aria-current="page"' : ''}><strong>${esc(projectTitle(e))}</strong><small>${esc(courseName(e.courseId))} · ${esc(dateLabel(e.weekOf))}</small>${shared(e) ? '<small>Shared answers · several projects</small>' : ''}<small>${pending.has(e.id) ? 'Draft · ' : ''}${completion(e).complete ? 'Complete' : completion(e).count + '/6 stages'}</small></button>`).join('') || '<p class="hint">No weeks here yet.</p>';
}
function field(f, value) {
  return `<label class="field ${f.wide ? 'wide' : ''}">${esc(f.label)}${f.quick ? '<em>ESSENTIAL</em>' : ''}${f.short || f.type === 'date' || f.type === 'url' ? `<input type="${f.type || 'text'}" data-field="${esc(f.path)}" value="${esc(value)}" maxlength="12000">` : `<textarea rows="3" data-field="${esc(f.path)}" maxlength="12000" placeholder="${esc(f.prompt || '')}">${esc(value)}</textarea>`}${f.short || f.type ? `<small>${esc(f.prompt || '')}</small>` : ''}</label>`;
}
function renderContent() {
  const root = $('content');
  if (trash) {
    root.innerHTML = `<div class="toolbar"><h2>Trash</h2><button class="secondary" data-action="home">Back to weeks</button></div><p class="hint">Removed PLCs remain private and can be restored.</p>` + (sorted().map(e => `<div class="deleted-card"><h3>${esc(courseName(e.courseId))}</h3><p>${esc(dateLabel(e.weekOf))}</p><button class="secondary" data-restore="${esc(e.id)}">Restore PLC</button></div>`).join('') || '<p>No removed PLCs.</p>'); return;
  }
  const e = current();
  if (!e || e.deleted) {
    root.innerHTML = `<div class="empty"><p class="eyebrow">YOUR TEACHING JOURNAL</p><h2>What changed this week?</h2><p>Start with a project from your Hub. Capture the evidence, decide what to try, and come back to see what worked.</p><button class="primary" data-action="new">Start a weekly PLC →</button><p class="hint">Already have PLC notes? Import your original JSON backup from the sidebar.</p></div><div class="course-cards">${courses.map(c => `<button class="course-card" data-new="${esc(c.id)}"><span class="eyebrow">${c.projects.length} ACTIVITIES</span><strong>${esc(c.name)}</strong><small>${esc(c.projects.find(p => p.status === 'now')?.title || 'Choose a project from your Hub')} →</small></button>`).join('')}</div>`; return;
  }
  const p = completion(e);
  const previous = [...records.values()].filter(x => x.id !== e.id && !x.deleted && x.courseId === e.courseId && x.weekOf < e.weekOf).sort((a,b) => b.weekOf.localeCompare(a.weekOf))[0];
  const openStages = new Set([...root.querySelectorAll('details.stage[open]')].map(x => x.dataset.stage));
  const wasSame = root.dataset.entry === e.id; root.dataset.entry = e.id;
  root.innerHTML = `<div class="toolbar"><button class="text-button" data-action="home">← Overview</button><div><button class="mode" data-action="mode" aria-pressed="${fullMode}">${fullMode ? 'Full reflection' : 'Quick reflection'} ↔</button><button class="secondary" data-action="print">Print / PDF</button><button class="text-button danger" data-action="remove">Move to trash</button></div></div>
    ${conflicts.has(e.id) ? '<div class="conflict-banner">Another version was saved elsewhere. Your draft is safe. <button class="text-button" data-action="resolve">Compare versions</button></div>' : ''}
    <header class="entry-head"><div><p class="eyebrow">${esc(courseName(e.courseId))} · WEEK OF ${esc(dateLabel(e.weekOf).toUpperCase())}</p><h2>${esc(projectTitle(e))}</h2><p>${shared(e) ? 'Older PLC: these projects share one set of answers. Its content is kept as is.' : 'Project evaluated in this PLC'}</p></div><div class="progress" id="progress"></div></header>
    <section class="project-panel"><div class="panel-title"><h3>Project information</h3><span class="tag">FROM YOUR HUB</span></div><p class="hint">A snapshot for this week. Refreshing the catalogue never changes your historical notes. You can adapt these fields for this PLC.</p><p class="hint">Each PLC keeps its own observations, stages and commitment. To reflect on another project, start a separate PLC; this one stays unchanged.</p><button class="text-button" data-action="another">+ PLC for another project this week</button>${e.projects.map((project, index) => `<details class="project"><summary>${esc(project.title)} <small>View objectives & requirements</small></summary><p class="hint">${project.url ? `<a href="${esc(project.url)}" target="_blank" rel="noopener">Open assignment ↗</a>` : 'No assignment link'}</p>${courses.find(c => c.id === e.courseId)?.projects.some(p => p.id === project.id) ? `<p><a class="secondary" href="/resources/today-class.html?project=${encodeURIComponent(project.id)}" target="_blank" rel="noopener noreferrer">Project Today’s Class ↗</a></p><p class="hint">Opens current published learning goals only. This week’s snapshot and private notes stay here.</p>` : ''}${PROJECT_FIELDS.map(key => `<label class="field">${esc(names[key])}<textarea rows="3" data-project="${index}" data-key="${key}" maxlength="12000" placeholder="Not provided in the assignment. Add it here if needed.">${esc(project[key])}</textarea></label>`).join('')}${courses.find(c => c.id === e.courseId)?.projects.some(p => p.id && p.id === project.id && PROJECT_FIELDS.some(k => p[k] !== project[k])) ? '<p class="hint">Your snapshot differs from the current catalogue. Your version is preserved.</p>' : ''}</details>`).join('')}</section>
    <section class="evidence-panel"><div class="panel-title"><h3>What happened in class?</h3><span class="tag">YOUR OBSERVATIONS</span></div><p class="hint">Use group descriptions and links to student work. Nothing here is posted to the public Hub.</p><div class="grid">${CLASSROOM_FIELDS.filter((f,i) => fullMode || i < 3 || get(e,'classroom.' + f.key)).map(f => field({ ...f, path:'classroom.'+f.key }, get(e,'classroom.'+f.key))).join('')}</div><div id="evidenceList">${e.evidence.map((ev,i) => `<div class="evidence-item"><div class="grid"><label class="field">Evidence title<input data-evidence="${i}" data-key="title" value="${esc(ev.title)}" maxlength="300"></label><label class="field">Evidence link<input type="url" data-evidence="${i}" data-key="url" value="${esc(ev.url)}" placeholder="https://…"></label><label class="field wide">What does this evidence show?<textarea data-evidence="${i}" data-key="note" maxlength="12000">${esc(ev.note)}</textarea></label></div>${ev.image ? `<p><a href="${esc(ev.image)}" target="_blank" rel="noopener">Image evidence ↗</a></p>` : ''}<div class="actions"><button class="text-button danger" data-remove-evidence="${i}">Remove evidence</button></div></div>`).join('')}</div><button class="secondary" data-action="evidence">+ Add evidence</button></section>
    ${STAGES.map((s,i) => `<details class="stage" data-stage="${s.key}" style="--accent:${colors[i]}" ${(wasSame ? openStages.has(s.key) : i === Math.max(0,p.done.indexOf(false))) ? 'open' : ''}><summary><span class="stage-number">0${i+1}</span><span><span class="stage-name">${s.title}</span><span class="stage-question">${esc(s.question)}</span></span><span class="stage-check" id="check-${s.key}"></span></summary><div class="stage-body"><p class="hint">${esc(s.description)}</p>${s.key === 'reassess' ? `${previous?.commitment.action ? `<div class="previous"><b>Previous commitment · ${esc(dateLabel(previous.weekOf))}</b>\n${esc(previous.commitment.action)}</div>` : ''}<label class="check"><input type="checkbox" data-field="firstEntry" ${e.firstEntry ? 'checked' : ''}> No previous response to reassess this week</label>` : ''}${s.key === 'plan' ? `<div class="previous"><b>Looking ahead · next learning</b>\nPlan can name a later project or learning target. It does not change the project evaluated here: ${esc(projectTitle(e))}.</div>` : ''}${s.groups.map(g => { const fs = g.fields.map(f => ({...f,path:[s.key,g.key,f.key].filter(Boolean).join('.')})).filter(f => fullMode || f.quick || get(e,f.path));return fs.length ? `${g.title ? `<h4>${g.title}</h4>` : ''}<div class="grid">${fs.map(f=>field(f,get(e,f.path))).join('')}</div>` : ''; }).join('')}</div></details>`).join('')}
    <section class="commitment"><div class="panel-title"><h3>Next week, I will…</h3><span class="tag">CLOSE THE LOOP</span></div><p class="hint">Your action and reassessment date are required to mark this PLC complete.</p><div class="grid">${COMMITMENT_FIELDS.filter(f => fullMode || f.quick || get(e,'commitment.'+f.key)).map(f => field({...f,path:'commitment.'+f.key},get(e,'commitment.'+f.key))).join('')}</div></section>`;
  updateProgress();
}
function updateProgress() {
  const e = current(); if (!e || !$('progress')) return;
  const p = completion(e);
  $('progress').innerHTML = `<strong>${p.count}<small>/6</small></strong>${p.complete ? 'Complete' : p.count === 6 ? 'Add next action & date' : 'Stages documented'}<div class="progress-track"><span style="width:${p.count/6*100}%"></span></div>`;
  STAGES.forEach((s,i) => { const el=$('check-'+s.key); if(el) { const missing=stageFields(s).filter(f=>f.quick && !get(e,f.path)?.trim()).length; el.textContent=p.done[i] ? (s.key==='reassess' && e.firstEntry ? 'N/A ✓' : 'Ready ✓') : `${missing} to fill`; } });
}
function openNew(courseId, weekOf) {
  $('newForm').reset(); $('newError').textContent='';
  $('newCourse').value = courseId || current()?.courseId || (filter === 'all' ? COURSES[0].id : filter);
  $('newDate').value = weekOf || monday();
  renderChoices(); $('newDialog').showModal();
}
function renderChoices() {
  const projects = courses.find(c=>c.id===$('newCourse').value)?.projects || [];
  const weekOf = isoDate($('newDate').value) ? monday($('newDate').value) : '';
  const started = p => projectPLC([...records.values()], $('newCourse').value, weekOf, p.id);
  const suggested = projects.find(p => p.status === 'now' && !started(p))?.id;
  $('projectChoices').innerHTML = projects.map(p=>`<label class="project-choice"><input type="radio" name="newProject" value="${esc(p.id)}" ${p.id===suggested?'checked':''}><span><strong>${esc(p.title)}</strong><small>${statusNames[p.status] || ''} · ${esc(p.date)}</small>${started(p) ? '<small>PLC already started for this week · choosing it opens that PLC</small>' : ''}<small>${esc(p.description)}</small></span></label>`).join('') || '<p>No projects found. Add an assignment in the teacher dashboard first.</p>';
}
$('newCourse').onchange=renderChoices;$('newDate').onchange=renderChoices;
$('newForm').onsubmit=event=>{
  event.preventDefault();
  if(!isoDate($('newDate').value)) { $('newError').textContent='Choose a valid week.';return; }
  const courseId=$('newCourse').value, weekOf=monday($('newDate').value);
  const id=$('projectChoices').querySelector('input:checked')?.value;
  if(!id) { $('newError').textContent='Select the project to evaluate.';return; }
  const existing=projectPLC([...records.values()],courseId,weekOf,id);
  if(existing) { $('newDialog').close(); select(existing.id); notice('This project already has a PLC for this week. It was opened with its answers unchanged.'); return; }
  const catalogue=courses.find(c=>c.id===courseId).projects;
  const previous=[...records.values()].filter(e=>!e.deleted&&e.courseId===courseId&&e.weekOf<weekOf).sort((a,b)=>b.weekOf.localeCompare(a.weekOf))[0];
  const e=newEntry(courseId,weekOf,[projectSnapshot(catalogue.find(p=>p.id===id))],previous);
  records.set(e.id,e);revisions.set(e.id,0);selected=e.id;changed(e);select(e.id);
  $('newDialog').close();
};
function download(entries, name='plc-backup') {
  const blob=new Blob([JSON.stringify({version:2,exportedAt:new Date().toISOString(),entries},null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name+'-'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
async function resolveConflict() {
  try {
    const remote=await api('entries');conflictCloud=remote.records.find(r=>r.entry.id===selected);
    if(!conflictCloud) throw new Error('The cloud version could not be found. Download your draft and retry.');
    const local=current(),remoteEntry=conflictCloud.entry;
    const rows=[{path:'weekOf',label:'Week'},...FIELDS].filter(f=>get(local,f.path)!==get(remoteEntry,f.path));
    $('conflictDetails').innerHTML=`<div class="comparison"><b>Projects</b><p>My draft: ${esc(local.projects.map(p=>p.title).join(' · '))}</p><p>Cloud: ${esc(remoteEntry.projects.map(p=>p.title).join(' · '))}</p></div>`+rows.map(f=>`<div class="comparison"><b>${esc(f.label)}</b><p>My draft: ${esc(get(local,f.path)||'—')}</p><p>Cloud: ${esc(get(remoteEntry,f.path)||'—')}</p></div>`).join('');
    $('conflictDialog').showModal();
  }catch(error){notice(error.message);}
}
function finishConflict(keep) {
  const local=current(),id=local.id;download([local],'plc-conflict-draft');
  records.set(id,normalizeEntry(conflictCloud.entry));revisions.set(id,conflictCloud.revision);pending.delete(id);conflicts.delete(id);
  if(keep){const copy=structuredClone(local);copy.id=crypto.randomUUID();copy.createdAt=Date.now();records.set(copy.id,copy);revisions.set(copy.id,0);selected=copy.id;changed(copy);}
  cache();$('conflictDialog').close();notice('Versions resolved. A backup of your draft was downloaded.');select(selected);saveStatus();
}
$('useCloud').onclick=()=>finishConflict(false);$('keepCopy').onclick=()=>finishConflict(true);
document.addEventListener('input',event=>{
  const el=event.target,e=current();if(!e || !el.closest('#content'))return;
  if(el.dataset.field){set(e,el.dataset.field,el.type==='checkbox'?el.checked:el.value);}
  else if(el.dataset.project!==undefined){e.projects[Number(el.dataset.project)][el.dataset.key]=el.value;}
  else if(el.dataset.evidence!==undefined){e.evidence[Number(el.dataset.evidence)][el.dataset.key]=el.value;}
  else return;
  changed(e);
});
document.addEventListener('change',event=>{
  if(event.target.type==='url' && event.target.value && !safeURL(event.target.value))notice('Use a complete https:// or http:// link. Invalid links will not be saved.');
});
document.addEventListener('click',event=>{
  const button=event.target.closest('button');if(!button)return;
  if(button.dataset.close){$(button.dataset.close).close();return;}
  if(button.dataset.select){select(button.dataset.select);return;}
  if(button.dataset.new){openNew(button.dataset.new);return;}
  if(button.dataset.restore){const e=records.get(button.dataset.restore);e.deleted=false;changed(e);select(e.id);return;}
  const e=current();
  if(button.dataset.removeEvidence!==undefined){e.evidence.splice(Number(button.dataset.removeEvidence),1);changed(e,true);return;}
  switch(button.dataset.action){
    case 'home':select(null);break;
    case 'new':openNew();break;
    case 'another':openNew(e.courseId,e.weekOf);break;
    case 'mode':fullMode=!fullMode;renderContent();break;
    case 'evidence':e.evidence.push({id:crypto.randomUUID(),type:'Student Work',title:'',url:'',image:'',note:''});changed(e,true);break;
    case 'remove':if(confirm('Move this PLC to trash? You can restore it later.')){e.deleted=true;changed(e);selected=null;render();}break;
    case 'resolve':resolveConflict();break;
    case 'print':printEntry();break;
  }
});
function printEntry(){
  const oldFull=fullMode;fullMode=true;renderContent();
  const details=[...$('content').querySelectorAll('details')],open=details.map(d=>d.open);details.forEach(d=>d.open=true);
  $('content').querySelectorAll('input,textarea').forEach(el=>{const p=document.createElement('div');p.className='print-only print-value';p.textContent=el.type==='checkbox'?(el.checked?'Yes':'No'):el.value||'—';el.after(p);});
  window.print();details.forEach((d,i)=>d.open=open[i]);fullMode=oldFull;renderContent();
}
$('newWeek').onclick=()=>openNew();$('export').onclick=()=>download([...records.values()]);$('retry').onclick=()=>{cloudAvailable=true;flush();};
$('recoverDrafts').onclick=()=>{
  const candidates=[];
  try{for(const key of journals())for(const item of JSON.parse(localStorage.getItem(key)||'[]'))candidates.push(normalizeEntry(item.entry));}catch{notice('Some browser drafts could not be read.');return;}
  if(!candidates.length){notice('No other browser drafts were found.');return;}
  if(!confirm(`Recover ${candidates.length} browser drafts as separate copies? Existing PLCs will be kept.`))return;
  download(candidates,'plc-recovered-drafts');
  for(const e of candidates){e.id=crypto.randomUUID();e.createdAt=Date.now();records.set(e.id,e);revisions.set(e.id,0);pending.set(e.id,1);}
  cache();render();saveStatus();notice('Drafts recovered as additional PLCs. Original tab drafts were kept.');flush();
};
$('showTrash').onclick=()=>{trash=!trash;render();};
$('courseFilter').onchange=()=>{filter=$('courseFilter').value;renderWeeks();};
$('refresh').onclick=async()=>{try{await loadCatalogue();notice('Projects refreshed. Existing PLC snapshots were kept.');render();}catch(error){notice(error.message);}};
$('importFile').onchange=async event=>{
  const file=event.target.files?.[0];event.target.value='';if(!file)return;
  try{
    if(file.size>10*1024*1024)throw new Error('Use a JSON backup up to 10 MB.');
    const data=JSON.parse(await file.text());if(!Array.isArray(data.entries)||data.entries.length>1000)throw new Error('That file is not a supported PLC backup.');
    const incoming=data.entries.map(normalizeEntry);
    if(!confirm(`Import ${incoming.length} PLC entries? Existing entries will be kept. Different entries with the same ID will be imported as additional copies.`))return;
    let count=0;
    for(const e of incoming){
      const existing=records.get(e.id);
      if(existing && JSON.stringify(normalizeEntry(existing))===JSON.stringify(e))continue;
      if(existing)e.id=crypto.randomUUID();
      records.set(e.id,e);revisions.set(e.id,0);pending.set(e.id,1);count++;
    }
    cache();render();saveStatus();notice(`${count} PLC entries imported. Saving privately…`);flush();
  }catch(error){notice(error.message || 'The backup could not be imported.');}
};
window.addEventListener('online',()=>{cloudAvailable=true;flush();});
window.addEventListener('beforeunload',event=>{cache();if(pending.size){event.preventDefault();event.returnValue='';}});
window.addEventListener('storage',event=>{if(event.key===cacheKey)notice('Another tab changed your browser backup. Cloud version checks will protect concurrent edits.');});
$('todayWeek').textContent='WEEK OF '+dateLabel(monday()).toUpperCase();
start();
