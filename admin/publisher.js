import { extractProjectFields } from './plc/extract.js';
const $ = id => document.getElementById(id);
let state, selectedId = null, dirty = false, busy = false, selectedHtml = null;
let pendingPayload = null, pendingSignature = '', publication = null, pollTimer, pollCount = 0;
const blobUrls = [];
const plcIds = { unit: 'plcUnit', learningTarget: 'plcLearningTarget', successCriteria: 'plcSuccessCriteria', requirements: 'plcRequirements' };
const statusNames = { now: 'In progress', soon: 'Coming up', done: 'Finished' };

function notice(message = '', error = false) {
  $('notice').textContent = message; $('notice').hidden = !message; $('notice').classList.toggle('error', error);
}
async function api(path, options = {}) {
  const response = await fetch(`/api/admin/${path}`, { ...options, credentials: 'same-origin', headers: { 'X-Hub-Request': '1', ...options.headers } });
  const type = response.headers.get('Content-Type') || '';
  if (!type.includes('application/json')) throw new Error('Your session is unavailable. Sign in to the dashboard again.');
  const data = await response.json();
  if (!response.ok) { const error = new Error(data.error || 'The operation could not be completed.'); error.status = response.status; throw error; }
  return data;
}
function lock(value) {
  busy = value;
  $('fields').disabled = value || !state;
  for (const id of ['refresh', 'newActivity', 'confirmRemove']) $(id).disabled = value;
  $('activities').querySelectorAll('button').forEach(b => b.disabled = value);
  $('publishButton').textContent = value ? 'Saving to GitHub…' : selectedId ? 'Publish changes ↗' : 'Publish assignment ↗';
}
async function loadState(preserve = true) {
  const previousSubject = $('subject').value;
  const next = await api('state'); state = next;
  $('account').textContent = next.email;
  const filterValue = $('filter').value;
  $('subject').replaceChildren(); $('filter').replaceChildren(new Option('All subjects', ''));
  for (const name of Object.keys(next.groups)) { $('subject').add(new Option(name, name)); $('filter').add(new Option(name, name)); }
  if (Object.hasOwn(next.groups, previousSubject)) $('subject').value = previousSubject;
  $('filter').value = filterValue;
  lock(false);
  if (!preserve) resetForm(false);
  renderList();
}
function renderList() {
  $('activities').replaceChildren();
  const search = $('search').value.trim().toLowerCase(), groupFilter = $('filter').value;
  let count = 0;
  for (const [group, { activities }] of Object.entries(state?.groups || {})) {
    if (groupFilter && group !== groupFilter) continue;
    for (const a of activities) {
      if (search && !`${a.title} ${a.description} ${group}`.toLowerCase().includes(search)) continue;
      const button = document.createElement('button'); button.type = 'button'; button.className = 'activity';
      button.classList.toggle('selected', a.id === selectedId); button.disabled = busy;
      const meta = document.createElement('small'), dot = document.createElement('span'); dot.className = `dot ${a.status}`;
      meta.append(dot, `${group} · ${a.pinned ? 'Reference' : statusNames[a.status]}`);
      const title = document.createElement('strong'); title.textContent = a.title; button.append(meta, title);
      button.addEventListener('click', () => selectActivity(group, a)); $('activities').append(button); count++;
    }
  }
  if (!count) { const empty = document.createElement('p'); empty.className = 'empty'; empty.textContent = 'No matching assignments.'; $('activities').append(empty); }
}
function canLeave() { return !dirty || confirm('You have unpublished changes. Discard them?'); }
function resetFiles() {
  selectedHtml = null; $('htmlFile').value = ''; $('assetFiles').value = ''; $('assetFolder').value = '';
  $('fileName').textContent = 'No file selected'; $('clearFile').hidden = true; $('assetCount').textContent = '';
  $('link').disabled = false;
}
function resetForm(check = true) {
  if (busy || (check && !canLeave())) return;
  const subject = $('subject').value; $('editorForm').reset(); if (subject) $('subject').value = subject;
  selectedId = null; resetFiles(); pendingPayload = null; dirty = false;
  $('modeLabel').textContent = 'NEW ASSIGNMENT'; $('editorTitle').textContent = 'What’s next in class?';
  $('removeButton').hidden = true; $('replaceHint').hidden = true; $('assetsSection').hidden = false;
  lock(false); renderList();
}
function selectActivity(group, a) {
  if (busy || !canLeave()) return;
  resetForm(false); selectedId = a.id; $('subject').value = group;
  for (const key of ['title', 'description', 'date', 'status', 'link']) $(key).value = a[key] || '';
  $('pinned').checked = Boolean(a.pinned);
  for (const [key, id] of Object.entries(plcIds)) $(id).value = a.plc?.[key] || '';
  $('modeLabel').textContent = 'EDIT ASSIGNMENT'; $('editorTitle').textContent = 'Ready for an update.';
  $('removeButton').hidden = false;
  const local = /^(assignments|comp-apps|makerspace|ap-cs-principles|games|resources)\//.test(a.link || '');
  $('replaceHint').hidden = !local;
  $('assetsSection').hidden = local && !a.link.startsWith('assignments/');
  dirty = false; lock(false); renderList();
}
async function chooseHtml(file) {
  if (!file) return;
  if (!/\.html?$/i.test(file.name) || file.size > 5 * 1024 * 1024) { notice('Choose an HTML file up to 5 MB.', true); return; }
  selectedHtml = file; dirty = true; pendingPayload = null;
  $('fileName').textContent = `${file.name} · ${Math.ceil(file.size / 1024)} KB`;
  $('clearFile').hidden = false; $('link').disabled = true; notice();
  const extracted = extractProjectFields(await file.text());
  let filled = 0;
  for (const [key, value] of Object.entries(extracted)) { const field = $(plcIds[key]); if (!field.value.trim() && value) { field.value = value; filled++; } }
  if (filled) { $('plcMetadata').open = true; notice('Assignment sections copied into ' + filled + ' empty PLC fields. Review them before publishing.'); }
}
function assetSelection() {
  return [...$('assetFiles').files, ...$('assetFolder').files]
    .filter(file => file.name !== '.DS_Store' && file.name !== selectedHtml?.name)
    .map(file => ({ file, path: file.webkitRelativePath ? file.webkitRelativePath.split('/').slice(1).join('/') : file.name }));
}
async function toBase64(file) {
  const bytes = new Uint8Array(await file.arrayBuffer()); let binary = '';
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(binary);
}
function validateLink(link) {
  if (!link) return;
  if (/[\x00-\x20\\<>"']/.test(link) || (!/^https?:\/\//i.test(link) && !/^[\w.-]+(?:\/[\w.%~-]+)*(?:[?#][^\s]*)?$/.test(link))) throw new Error('Use an https:// link or a hub path; replace spaces with %20.');
}
async function formPayload() {
  const assets = assetSelection();
  if (assets.length > 30 || assets.reduce((s, a) => s + a.file.size, selectedHtml?.size || 0) > 20 * 1024 * 1024) throw new Error('Use no more than 30 files and 20 MB total.');
  if (assets.length && !selectedHtml) throw new Error('Choose the HTML file along with its supporting files.');
  const entry = Object.fromEntries(['title', 'description', 'date', 'status', 'link'].map(key => [key, $(key).value.trim()]));
  entry.plc = Object.fromEntries(Object.entries(plcIds).map(([key, id]) => [key, $(id).value.trim()]));
  entry.pinned = $('pinned').checked; if (!selectedHtml) validateLink(entry.link);
  if (!entry.title) throw new Error('Enter an assignment title.');
  if (selectedHtml) entry.link = '';
  const html = selectedHtml ? await selectedHtml.text() : null;
  if (html !== null && !/<(?:!doctype\s+html|html|body)\b/i.test(html)) throw new Error('The selected file does not appear to be an HTML document.');
  return { action: 'save', revision: state.revision, id: selectedId, group: $('subject').value, entry, html, assets: await Promise.all(assets.map(async a => ({ path: a.path, content: await toBase64(a.file) }))) };
}
async function submit(payload) {
  const signature = JSON.stringify(payload);
  if (!pendingPayload || signature !== pendingSignature) { pendingPayload = { ...payload, requestId: crypto.randomUUID() }; pendingSignature = signature; }
  lock(true); notice('Saving the assignment and its files to GitHub…');
  try {
    const result = await api('publish', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(pendingPayload) });
    const removing = payload.action === 'remove';
    publication = { requestId: result.requestId, link: result.link || (removing ? '' : payload.entry?.link || ''), title: result.title || payload.entry?.title || '', removing };
    try { sessionStorage.setItem('hub-publication', JSON.stringify(publication)); } catch {}
    pendingPayload = null; dirty = false; notice();
    $('publication').hidden = false; $('publishedLink').hidden = true; $('copyLink').hidden = true;
    $('publicationText').textContent = 'Saved to GitHub. Waiting for publication on pelenlab.com…';
    $('checkPublication').hidden = true; startPolling();
    try { await loadState(false); } catch { notice('Saved to GitHub, but the list could not be reloaded. Select Refresh.', true); }
  } catch (error) {
    notice(`${error.message}${error.status === 409 ? ' Select Refresh to load the latest version; your form entries will be kept.' : ''}`, true);
  } finally { lock(false); }
}
function startPolling() { clearTimeout(pollTimer); pollCount = 0; checkPublication(); }
async function checkPublication() {
  if (!publication) return;
  $('publication').hidden = false; $('checkPublication').hidden = true;
  try {
    const response = await fetch(`/publication.json?publication=${encodeURIComponent(publication.requestId)}&t=${Date.now()}`, { cache: 'no-store' });
    const marker = response.ok ? await response.json() : null;
    if (marker?.requestId === publication.requestId) {
      $('publicationText').textContent = publication.removing ? 'Published: the assignment has been removed from the hub.' : 'Published. Your assignment link is ready for Classroom.';
      const link = publication.removing ? '/' : publication.link || '/';
      $('publishedLink').href = link.startsWith('http') ? link : '/' + link.replace(/^\//, '');
      $('publishedLink').textContent = publication.removing || !publication.link ? 'View hub ↗' : 'Open assignment ↗';
      $('publishedLink').hidden = false; $('copyLink').hidden = publication.removing || !publication.link;
      try { sessionStorage.removeItem('hub-publication'); } catch {}
      return;
    }
  } catch { /* A deployment can temporarily return a non-JSON response. */ }
  if (++pollCount >= 30) {
    $('publicationText').textContent = 'Saved to GitHub. Publication is not confirmed yet; check the Cloudflare deployment if it takes longer than usual.';
    $('checkPublication').hidden = false; return;
  }
  $('publicationText').textContent = 'Saved to GitHub. Cloudflare is preparing your publication…';
  pollTimer = setTimeout(checkPublication, 5000);
}
async function preview() {
  $('previewMeta').textContent = `${$('subject').value} · ${$('date').value || 'TBA'} · ${statusNames[$('status').value]}`;
  $('previewTitle').textContent = $('title').value || 'Your assignment title';
  $('previewDescription').textContent = $('description').value;
  blobUrls.splice(0).forEach(URL.revokeObjectURL);
  $('previewFrame').hidden = !selectedHtml;
  $('previewNote').textContent = selectedHtml ? 'Sandboxed preview. Some external features are unavailable here; check the supporting files before publishing.' : 'Card preview. Choose an HTML file to preview its contents too.';
  if (selectedHtml) {
    const doc = new DOMParser().parseFromString(await selectedHtml.text(), 'text/html');
    doc.querySelectorAll('base, meta[http-equiv="refresh" i]').forEach(el => el.remove());
    const assets = new Map();
    for (const { file, path } of assetSelection()) { const url = URL.createObjectURL(file); blobUrls.push(url); assets.set(path, url); }
    for (const el of doc.querySelectorAll('[src],link[href]')) {
      for (const attr of ['src', 'href']) { const value = el.getAttribute(attr); if (value && assets.has(value.replace(/^\.\//, ''))) el.setAttribute(attr, assets.get(value.replace(/^\.\//, ''))); }
    }
    const policy = doc.createElement('meta'); policy.httpEquiv = 'Content-Security-Policy';
    policy.content = "default-src 'none'; script-src 'unsafe-inline' blob:; style-src 'unsafe-inline' https: blob:; img-src data: blob: https:; font-src data: https: blob:; media-src data: blob:; connect-src 'none'; form-action 'none'; base-uri 'none'";
    doc.head.prepend(policy); $('previewFrame').srcdoc = '<!doctype html>' + doc.documentElement.outerHTML;
  }
  $('previewDialog').showModal();
}
$('editorForm').addEventListener('input', () => { dirty = true; pendingPayload = null; });
$('editorForm').addEventListener('submit', async event => { event.preventDefault(); if (busy || !state) return; lock(true); try { await submit(await formPayload()); } catch (error) { notice(error.message, true); lock(false); } });
$('newActivity').onclick = () => { resetForm(); $('title').focus(); };
$('refresh').onclick = async () => { if (busy) return; lock(true); try { await loadState(); pendingPayload = null; notice('List refreshed. Your form entries have been kept.'); } catch (error) { notice(error.message, true); } finally { lock(false); } };
$('search').oninput = renderList; $('filter').onchange = renderList;
$('htmlFile').onchange = () => chooseHtml($('htmlFile').files[0]);
$('clearFile').onclick = () => { resetFiles(); dirty = true; pendingPayload = null; };
for (const id of ['assetFiles', 'assetFolder']) $(id).onchange = () => { $('assetCount').textContent = `${assetSelection().length} supporting files selected`; dirty = true; pendingPayload = null; };
const drop = document.querySelector('.upload');
drop.addEventListener('dragover', e => { e.preventDefault(); if (!busy && state) drop.classList.add('dragging'); });
drop.addEventListener('dragleave', () => drop.classList.remove('dragging'));
drop.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('dragging'); if (!busy && state) chooseHtml(e.dataTransfer.files[0]); });
$('previewButton').onclick = () => preview().catch(e => notice(e.message, true));
$('closePreview').onclick = () => { $('previewDialog').close(); $('previewFrame').srcdoc = ''; };
$('removeButton').onclick = () => { $('removeTitle').textContent = $('title').value; $('removeDialog').showModal(); };
$('cancelRemove').onclick = () => $('removeDialog').close();
$('confirmRemove').onclick = () => { $('removeDialog').close(); submit({ action: 'remove', id: selectedId, revision: state.revision }); };
$('checkPublication').onclick = startPolling;
window.addEventListener('beforeunload', e => { if (dirty || busy) { e.preventDefault(); e.returnValue = ''; } });
try { publication = JSON.parse(sessionStorage.getItem('hub-publication') || 'null'); if (publication) startPolling(); } catch {}
loadState(false).catch(error => { notice(error.message, true); $('activities').textContent = 'The list could not be loaded.'; });

$('copyLink').onclick = async () => { try { await navigator.clipboard.writeText($('publishedLink').href); $('copyLink').textContent = 'Link copied ✓'; setTimeout(() => $('copyLink').textContent = 'Copy link for Classroom', 2500); } catch { notice('The link could not be copied automatically. Use Open assignment instead.', true); } };

$('previewDialog').addEventListener('close', () => { $('previewFrame').srcdoc = ''; blobUrls.splice(0).forEach(URL.revokeObjectURL); });
