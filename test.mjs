import assert from 'node:assert/strict';
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
import './site/questions.js';
import './site/game.js';
const bank=globalThis.DEMO_QUESTIONS;
const {avatars,select,grade,thresholds}=Quiz;
const data=p=>fs.readFileSync(new URL(p,import.meta.url),'utf8');
assert.equal(bank.length,1000);
assert.equal(new Set(bank.map(q=>q.id)).size,1000);
assert.equal(new Set(bank.map(q=>q.prompt+'|'+(q.image??''))).size,1000);
assert.equal(new Set(bank.filter(q=>q.image).map(q=>q.image)).size,194);
assert.equal(new Set(bank.map(q=>q.topic)).size,5);
assert.equal(new Set(avatars).size,20);
for(const q of bank){
 assert.equal(new Set(q.options).size,4);
 assert.ok(q.options.includes(q.answer));
 assert.ok(new URL(q.source).protocol==='https:');
 assert.ok(q.tier>=1&&q.tier<=3);
 if(q.image) assert.match(data('site/assets/flags/'+q.image+'.svg'),/<svg\b/);
}
for(let level=1;level<=6;level++) for(let d=1;d<=3;d++){
 const q=select(bank,level,d);
 assert.equal(new Set(q.map(q=>q.id)).size,[10,15,20][d-1]);
 assert.notDeepEqual(q.map(q=>q.id),select(bank,level,d).map(q=>q.id));
 const earned=[100,150,240][d-1], answers=q.map(q=>q.answer);
 const r=grade({level,points:level<6?thresholds[level]-earned+1:3500},d,q,answers);
 assert.equal(r.earned,earned);
 assert.equal(r.level,Math.min(level+1,6));
 assert.equal(r.points,level===6?3500+earned:0);
 assert.equal(r.review.length,q.length);
 if(level<6) assert.equal(grade({level,points:thresholds[level]-earned},d,q,answers).points,0);
 assert.throws(()=>grade({level,points:0},d,q,['neplatná odpoveď']));
}
console.log('OK — 1 000 otázok, 194 vlajok, 5 tém, 20 avatarov, výber, vyhodnotenie a postup.');
if(process.env.PGLITE_MODULE){
 const {PGlite}=await import(pathToFileURL(process.env.PGLITE_MODULE).href);
 const db=new PGlite();
 await db.exec(`
 create role anon; create role authenticated; create schema auth;
 create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql as
 $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 grant usage on schema auth to anon,authenticated;
 `);
 for(const f of ['20261113000100_schema.sql','20261113000200_questions.sql']) await db.exec(data('supabase/migrations/'+f));
 const a='10000000-0000-0000-0000-000000000001',b='20000000-0000-0000-0000-000000000002';
 await db.query('insert into auth.users values ($1),($2)',[a,b]);
 const query=async(sql,args)=>(await db.query(sql,args)).rows;
 assert.equal((await query('select count(*) as n from private.quiz_questions'))[0].n,1000);
 const [fresh]=await query('select level,points from public.profiles where id=$1',[a]);
 assert.deepEqual(fresh,{level:1,points:0});
 const user=async id=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated');};
 await db.exec('set role anon');
 await assert.rejects(query('select public.quiz_start(1)'),/permission denied/);
 assert.equal((await query('select * from public.quiz_leaderboard()')).length,2);
 await user(a);
 assert.equal((await query('select * from public.profiles')).length,1);
 await assert.rejects(query('update public.profiles set points=999'),/permission denied/);
 await assert.rejects(query('select * from private.quiz_questions'),/permission denied/);
 await assert.rejects(query('select * from private.quiz_runs'),/permission denied/);
 assert.equal((await query("update public.profiles set name='Atlas' where id=$1 returning name",[b])).length,0);
 await db.exec('reset role');
 await query('update public.profiles set points=499 where id=$1',[a]);
 await user(a);
 const [started]=await query('select public.quiz_start(1) as r');
 const run=started.r;
 assert.equal(run.questions.length,10);
 assert.ok(run.questions.every(q=>!Object.hasOwn(q,'answer')&&!Object.hasOwn(q,'source')));
 assert.equal((await query('select public.quiz_start(3) as r'))[0].r.id,run.id);
 await assert.rejects(query('select public.quiz_finish($1,$2) as r',[run.id,'[]']),/Vyplň/);
 await user(b);
 await assert.rejects(query('select public.quiz_finish($1,$2) as r',[run.id,'[]']),/neexistuje/);
 assert.equal((await query('select * from public.quiz_history()')).length,0);
 await db.exec('reset role');
 const [stored]=await query('select questions from private.quiz_runs where id=$1',[run.id]);
 const answers=JSON.stringify(stored.questions.map(q=>q.answer));
 await user(a);
 const finished=(await query('select public.quiz_finish($1,$2) as r',[run.id,answers]))[0].r;
 assert.equal(finished.earned,100);
 assert.equal(finished.points,0);
 assert.equal(finished.level,2);
 assert.deepEqual((await query('select public.quiz_finish($1,$2) as r',[run.id,answers]))[0].r,finished);
 assert.equal((await query('select * from public.quiz_history()')).length,1);
 assert.equal((await query('select * from public.quiz_leaderboard()'))[0].level,2);
 await db.close();
 console.log('OK — PostgreSQL: migrácie, RLS, súkromné odpovede RPC, nový profil, cudzí kvíz, opakované vyhodnotenie a reset.');
}
