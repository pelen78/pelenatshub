import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { plcStore, readPLCInput } from '../server/plc.js';
import { catalogue, newEntry, normalizeEntry, completion, set, FIELDS, projectPLC } from '../admin/plc/model.js';
import { extractProjectFields } from '../admin/plc/extract.js';
import { parseGroups } from '../server/repository.js';
import { preparePublication } from '../server/publish.js';
import { onRequestGet, onRequestPut } from '../functions/api/admin/plc/entries.js';

function database() {
  const db=new DatabaseSync(':memory:');db.exec(readFileSync(new URL('../migrations/0001_plc.sql',import.meta.url),'utf8'));
  return { prepare(sql){return {bind(...values){return {async all(){return {results:db.prepare(sql).all(...values)};},async run(){return {meta:{changes:Number(db.prepare(sql).run(...values).changes)}};}};}};}};
}
function entry(){return newEntry('computer-applications','2026-09-23',[{id:'project-1',title:'Project',url:'https://pelenlab.com/project',learningTarget:'Understand files.'}]);}
test('private records are owner-scoped, persisted, versioned, and soft deleted',async()=>{
  const store=plcStore(database()),e=entry();
  const first=await store.save('a@example.test',{entry:e,revision:0});assert.equal(first.revision,1);
  assert.equal((await store.list('a@example.test')).length,1);assert.deepEqual(await store.list('b@example.test'),[]);
  const second=await store.save('a@example.test',{entry:{...e,deleted:true},revision:1});assert.equal(second.revision,2);
  assert.equal((await store.list('a@example.test'))[0].entry.deleted,true);
  await store.save('b@example.test',{entry:e,revision:0});assert.equal((await store.list('b@example.test'))[0].revision,1);
});
test('stale edits and duplicate creates cannot overwrite the winner',async()=>{
  const store=plcStore(database()),e=entry();await store.save('owner',{entry:e,revision:0});
  e.analyze.strengths='First writer';await store.save('owner',{entry:e,revision:1});
  e.analyze.strengths='Stale writer';
  await assert.rejects(()=>store.save('owner',{entry:e,revision:1}),{status:409});
  await assert.rejects(()=>store.save('owner',{entry:e,revision:0}),{status:409});
  assert.equal((await store.list('owner'))[0].entry.analyze.strengths,'First writer');
});
test('legacy backups preserve reflection and convert project data without prototype merging',()=>{
  const old={id:'sample-digital-passport',courseId:'computer-applications',weekOf:'2026-09-22',projectName:'Digital Passport',projectUrl:'https://pelenlab.com/project',project:{learningTarget:'Learn'},analyze:{strengths:'Original observation'},evidence:[{id:'e1',note:'Evidence',image:'https://example.test/image.jpg'}]};
  const normalized=normalizeEntry(old);assert.equal(normalized.weekOf,'2026-09-21');assert.equal(normalized.analyze.strengths,'Original observation');assert.equal(normalized.projects[0].learningTarget,'Learn');
  assert.equal(normalized.evidence[0].image,'https://example.test/image.jpg');
  assert.throws(()=>normalizeEntry({...old,weekOf:'2026-02-31'}));
  const polluted=normalizeEntry(JSON.parse(JSON.stringify(old).slice(0,-1)+',"__proto__":{"polluted":true}}'));
  assert.equal(polluted.polluted,undefined);assert.equal({}.polluted,undefined);
});
test('completion requires all essential reflection fields and the next commitment',()=>{
  const e=entry();for(const key of ['reassess','analyze','respond','plan','design','calibrate'])set(e,key+'.placeholder','Some text');
  assert.equal(completion(e).complete,false);
  for(const f of FIELDS.filter(f=>f.quick))set(e,f.path,f.type==='date'?'2026-09-28':'Documented');
  assert.equal(completion(e).complete,true);e.design.when='';assert.equal(completion(e).complete,false);
});
test('catalogue uses stable IDs, maps subjects, suggests NOW and excludes references',()=>{
  const groups=parseGroups(readFileSync(new URL('../index.html',import.meta.url),'utf8'));
  const result=catalogue(groups,'revision');assert.equal(result.length,3);
  assert.equal(result[0].projects[0].status,'now');assert.ok(result[0].projects[0].id);
  assert.ok(!result[2].projects.some(p=>p.title==='Class Important Info'));
  const p=result[0].projects.find(p=>p.title.includes('Digital Passport'));assert.ok(p.successCriteria.includes('I can make navigation, text and layout work on both desktop and mobile.'));
  const e=newEntry(result[0].id,'2026-09-23',[p]);p.successCriteria='Changed catalogue';assert.notEqual(e.projects[0].successCriteria,p.successCriteria);
});
test('HTML extraction copies recognized text and ignores scripts, unknown sections and missing criteria',()=>{
  const html='<section><span class="silk">What You Will Learn</span><p>Test &amp; debug.</p><script>alert(1)</script></section><section><span class="silk">Unrelated</span><p>Not a learning target.</p></section>';
  assert.deepEqual(extractProjectFields(html),{learningTarget:'Test & debug.',successCriteria:'',requirements:''});
});
test('new weeks carry the previous action without inventing student outcomes',()=>{
  const previous=entry();previous.commitment.action='Try a small group demonstration.';
  const next=newEntry(previous.courseId,'2026-09-28',previous.projects,previous);
  assert.equal(next.reassess.previousResponse,previous.commitment.action);assert.equal(next.analyze.strengths,'');assert.equal(next.firstEntry,false);
});
test('publisher preserves optional PLC metadata and validates it before publication',()=>{
  const source=readFileSync(new URL('../index.html',import.meta.url),'utf8'),groups=parseGroups(source),revision='a'.repeat(40),old=groups['Comp Apps'].activities[0];
  const state={source,groups,revision,files:[]};
  const input={revision,requestId:crypto.randomUUID(),action:'save',id:old.id,group:'Comp Apps',entry:{...old,plc:{unit:'Unit 1',learningTarget:'A target',successCriteria:'A criterion',requirements:'A task'}}};
  assert.equal(preparePublication(state,input).entry.plc.learningTarget,'A target');
  input.entry.plc.learningTarget='x'.repeat(12001);assert.throws(()=>preparePublication(state,input));
});
test('API uses authenticated identity, reports unavailable storage and limits requests',async()=>{
  const env={PLC_DB:database()},e=entry();
  const request=new Request('https://pelenlab.com/api/admin/plc/entries',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({owner:'victim',entry:e,revision:0})});
  const response=await onRequestPut({request,env,data:{identity:{email:'Owner@Example.test'}}});assert.equal(response.status,200);
  const other=await onRequestGet({env,data:{identity:{email:'victim'}}});assert.equal((await other.json()).records.length,0);
  const missing=await onRequestGet({env:{},data:{identity:{email:'owner'}}});assert.equal(missing.status,503);assert.equal(missing.headers.get('Cache-Control'),'no-store');
  const tooLarge=new Request('https://example.test',{method:'PUT',headers:{'Content-Type':'application/json'},body:'x'.repeat(250001)});
  await assert.rejects(()=>readPLCInput(tooLarge),{status:413});
});
test('projects in the same subject and week keep separate PLC answers',async()=>{
  const store=plcStore(database()),week='2026-09-21';
  const a=newEntry('computer-applications',week,[{id:'project-a',title:'Project A'}]),b=newEntry('computer-applications',week,[{id:'project-b',title:'Project B'}]);
  a.analyze.strengths='Only A';a.plan.priorityTarget='After A';b.analyze.strengths='Only B';b.commitment.reassessDate='2026-09-28';
  await store.save('owner',{entry:a,revision:0});await store.save('owner',{entry:b,revision:0});
  const byId=async()=>new Map((await store.list('owner')).map(r=>[r.entry.id,r]));
  let saved=await byId();const editedA=saved.get(a.id).entry;editedA.analyze.strengths='A edited';
  await store.save('owner',{entry:editedA,revision:saved.get(a.id).revision});
  saved=await byId();
  assert.equal(saved.get(a.id).entry.analyze.strengths,'A edited');assert.equal(saved.get(a.id).entry.plan.priorityTarget,'After A');
  assert.equal(saved.get(b.id).entry.analyze.strengths,'Only B');assert.equal(saved.get(b.id).entry.plan.priorityTarget,'');assert.equal(saved.get(b.id).revision,1);
  const entries=[...saved.values()].map(r=>r.entry);
  assert.equal(projectPLC(entries,'computer-applications',week,'project-a').id,a.id);assert.equal(projectPLC(entries,'computer-applications',week,'project-b').id,b.id);
  assert.equal(projectPLC(entries,'computer-applications','2026-09-28','project-a'),undefined);
});
test('older PLCs with several projects stay intact and do not block a PLC per project',async()=>{
  const store=plcStore(database()),legacy=newEntry('computer-applications','2026-09-21',[{id:'project-a',title:'Project A'},{id:'project-b',title:'Project B'}]);
  legacy.classroom.observed='Shared observation';await store.save('owner',{entry:legacy,revision:0});
  const [row]=await store.list('owner');assert.equal(row.entry.projects.length,2);assert.equal(row.entry.classroom.observed,'Shared observation');
  assert.equal(projectPLC([row.entry],'computer-applications','2026-09-21','project-a'),undefined);
  const trashed={...normalizeEntry(newEntry('computer-applications','2026-09-21',[{id:'project-a',title:'Project A'}])),deleted:true};
  assert.equal(projectPLC([trashed],'computer-applications','2026-09-21','project-a'),undefined);
});
