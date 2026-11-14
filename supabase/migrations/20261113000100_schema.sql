begin;
create schema private;
revoke all on schema private from public, anon, authenticated;
create table private.quiz_questions (
 id integer primary key, topic text not null, prompt text not null,
 answer text not null, options jsonb not null check (jsonb_array_length(options)=4 and options ? answer),
 source text not null, image text, tier integer not null check(tier between 1 and 3)
);
create table public.profiles (
 id uuid primary key references auth.users on delete cascade,
 name text not null default 'Geograf' check(char_length(btrim(name)) between 2 and 24),
 avatar text not null default '🦁' check(avatar in ('🦁','🐯','🐻','🐼','🦊','🐺','🐨','🐸','🐵','🐱','🐶','🐰','🐮','🐷','🦉','🐧','🐢','🐙','🦋','🐬')),
 level integer not null default 1 check(level between 1 and 6),
 points bigint not null default 0 check(points>=0)
);
create table private.quiz_runs (
 id uuid primary key default gen_random_uuid(),
 player uuid not null references public.profiles on delete cascade,
 difficulty integer not null check(difficulty between 1 and 3),
 created_at timestamptz not null default now(),
 questions jsonb not null, result jsonb
);
create index quiz_runs_player_date on private.quiz_runs(player,created_at desc);
alter table private.quiz_questions enable row level security;
alter table private.quiz_runs enable row level security;
alter table public.profiles enable row level security;
revoke all on all tables in schema private from public, anon, authenticated;
revoke all on public.profiles from public, anon, authenticated;
grant select on public.profiles to authenticated;
grant update(name,avatar) on public.profiles to authenticated;
create policy own_profile on public.profiles for select to authenticated using ((select auth.uid())=id);
create policy edit_own_profile on public.profiles for update to authenticated
 using ((select auth.uid())=id) with check ((select auth.uid())=id);

create function private.new_quiz_player() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.profiles(id) values(new.id);
 return new;
end $$;
revoke all on function private.new_quiz_player() from public, anon, authenticated;
create trigger quiz_profile after insert on auth.users for each row execute function private.new_quiz_player();
insert into public.profiles(id) select id from auth.users on conflict do nothing;

create function public.quiz_leaderboard() returns table(name text, avatar text, level integer, points bigint)
language sql stable security definer set search_path='' as $$
 select p.name,p.avatar,p.level,p.points from public.profiles p
 order by p.level desc,p.points desc,p.name,p.id limit 100
$$;
create function public.quiz_history() returns setof jsonb language sql stable security definer set search_path='' as $$
 select r.result from private.quiz_runs r where r.player=auth.uid() and r.result is not null
 order by r.created_at desc
$$;

create function public.quiz_start(p_difficulty integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare player_id uuid := auth.uid(); current_level integer; quantity integer; target numeric;
 active private.quiz_runs; items jsonb; public_items jsonb;
begin
 if player_id is null or p_difficulty is null or p_difficulty not between 1 and 3 then
  raise exception 'Neplatný režim alebo účet.';
 end if;
 select level into strict current_level from public.profiles where id=player_id for update;
 select * into active from private.quiz_runs
 where player=player_id and result is null and created_at>now()-interval '2 hours'
 order by created_at desc limit 1;
 if not found then
  quantity := (array[10,15,20])[p_difficulty];
  target := least(3,1+(p_difficulty-1)*0.65+(current_level-1)*0.15);
  select jsonb_agg(to_jsonb(q) || jsonb_build_object('options',(
   select jsonb_agg(v order by random()) from jsonb_array_elements(q.options) v
  )) order by random()) into items
  from (
   select * from private.quiz_questions order by random()*2 - abs(tier-target) limit quantity
  ) q;
  if coalesce(jsonb_array_length(items),0) <> quantity then raise exception 'Databáza otázok nie je pripravená.'; end if;
  insert into private.quiz_runs(player,difficulty,questions) values(player_id,p_difficulty,items) returning * into active;
 end if;
 select jsonb_agg(q - 'answer' - 'source' - 'id' - 'tier' order by n) into public_items
 from jsonb_array_elements(active.questions) with ordinality as t(q,n);
 return jsonb_build_object('id',active.id,'difficulty',active.difficulty,'questions',public_items);
end $$;

create function public.quiz_finish(p_run uuid,p_answers jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare player_id uuid := auth.uid(); run private.quiz_runs; profile public.profiles;
 checked jsonb; correct_count integer; earned integer; previous integer; final_result jsonb;
begin
 if player_id is null then raise exception 'Prihlás sa.'; end if;
 select * into strict profile from public.profiles where id=player_id for update;
 select * into run from private.quiz_runs where id=p_run and player=player_id;
 if not found then raise exception 'Kvíz neexistuje.'; end if;
 if run.result is not null then return run.result; end if;
 if run.created_at<=now()-interval '2 hours' then raise exception 'Kvíz vypršal. Spusť nový.'; end if;
 if jsonb_typeof(p_answers) is distinct from 'array' then raise exception 'Neplatné odpovede.'; end if;
 if jsonb_array_length(p_answers)<>jsonb_array_length(run.questions) then raise exception 'Vyplň všetky odpovede.'; end if;
 if exists (
  select 1 from jsonb_array_elements(run.questions) with ordinality t(q,n)
  where not ((q->'options') @> jsonb_build_array(p_answers->(n::integer-1)))
 ) then raise exception 'Neplatný výber odpovede.'; end if;
 select jsonb_agg(q || jsonb_build_object('selected',p_answers->(n::integer-1)) order by n),
  count(*) filter(where q->'answer'=p_answers->(n::integer-1))
 into checked,correct_count from jsonb_array_elements(run.questions) with ordinality t(q,n);
 earned := correct_count * (array[10,10,12])[run.difficulty];
 previous := profile.level;
 profile.points := profile.points+earned;
 if previous<6 and profile.points >= (array[500,1200,2000,2750,3500])[previous] then
  profile.level := previous+1;
  profile.points := 0;
 end if;
 update public.profiles set level=profile.level,points=profile.points where id=player_id;
 final_result := jsonb_build_object('id',run.id,'date',now(),'difficulty',run.difficulty,'correct',correct_count,
  'total',jsonb_array_length(checked),'earned',earned,'previous',previous,'level',profile.level,'points',profile.points,'review',checked);
 update private.quiz_runs set result=final_result where id=run.id;
 return final_result;
end $$;
revoke all on function public.quiz_start(integer),public.quiz_finish(uuid,jsonb),public.quiz_history(),public.quiz_leaderboard() from public,anon,authenticated;
grant execute on function public.quiz_start(integer),public.quiz_finish(uuid,jsonb),public.quiz_history() to authenticated;
grant execute on function public.quiz_leaderboard() to anon,authenticated;
commit;
