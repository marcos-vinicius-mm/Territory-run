-- Rode isso no SQL Editor do seu projeto Supabase (Database > SQL Editor)

-- Importante: instalamos o PostGIS no schema "extensions", não em "public".
-- Isso evita que a tabela interna spatial_ref_sys apareça no schema public
-- (o que geraria um aviso de segurança que você não consegue resolver pelo
-- dashboard, já que essa tabela pertence ao role supabase_admin, não ao seu).
create extension if not exists postgis with schema extensions;
-- Nota: NÃO rode "create extension postgis" de novo sem o "if not exists" —
-- vai dar erro dizendo que a extensão já existe.

-- Perfis de jogador (espelha auth.users)
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  color text not null default '#22d3ee',
  total_area_m2 double precision not null default 0,
  created_at timestamptz not null default now()
);

-- Territórios conquistados: UMA linha por dono, geom é o MultiPolygon com
-- tudo que ele possui (pode ter áreas desconexas). Simplifica muito o ranking
-- e a lógica de conquista, comparado a "uma linha por célula".
--
-- Se você já rodou uma versão anterior deste schema, dropamos e recriamos —
-- ainda não há dados de produção em jogo nesse ponto do projeto.
drop table if exists territories cascade;
create table territories (
  owner_id uuid primary key references profiles(id) on delete cascade,
  geom geometry(MultiPolygon, 4326) not null,
  area_m2 double precision not null default 0,
  updated_at timestamptz not null default now()
);

create index territories_geom_idx on territories using gist (geom);

-- Histórico de corridas (útil pra replay / auditoria / estatísticas)
drop table if exists runs cascade;
create table runs (
  id uuid primary key default gen_random_uuid(),
  runner_id uuid not null references profiles(id) on delete cascade,
  path geometry(LineString, 4326) not null,
  area_claimed_m2 double precision not null default 0,
  started_at timestamptz not null,
  finished_at timestamptz not null default now()
);

-- View de territórios já com dono/cor, pra não precisar fazer join no client
create or replace view territories_view as
select
  t.owner_id,
  p.username as owner_name,
  p.color,
  t.geom,
  t.area_m2,
  t.updated_at
from territories t
join profiles p on p.id = t.owner_id;

-- View de ranking, ordenada pela área total conquistada
create or replace view leaderboard as
select
  id,
  username,
  color,
  total_area_m2,
  rank() over (order by total_area_m2 desc) as rank
from profiles
order by total_area_m2 desc;

-- Habilita Realtime na tabela territories, pra outros jogadores verem
-- conquistas ao vivo no mapa (usado numa próxima etapa)
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'territories'
  ) then
    alter publication supabase_realtime add table territories;
  end if;
end $$;

-- Row Level Security
alter table profiles enable row level security;
alter table territories enable row level security;
alter table runs enable row level security;

drop policy if exists "Perfis são públicos pra leitura" on profiles;
create policy "Perfis são públicos pra leitura" on profiles for select using (true);

drop policy if exists "Usuário edita o próprio perfil" on profiles;
create policy "Usuário edita o próprio perfil" on profiles for update using (auth.uid() = id);

drop policy if exists "Territórios são públicos pra leitura" on territories;
create policy "Territórios são públicos pra leitura" on territories for select using (true);
-- Escrita de territórios deve passar por uma função/edge function que roda a
-- lógica de conquista (applyTerritoryCapture) com validação server-side —
-- não deixar o client escrever território diretamente evita trapaça.

drop policy if exists "Corridas são públicas pra leitura" on runs;
create policy "Corridas são públicas pra leitura" on runs for select using (true);

drop policy if exists "Usuário insere a própria corrida" on runs;
create policy "Usuário insere a própria corrida" on runs for insert with check (auth.uid() = runner_id);

-- Cria o perfil automaticamente quando um usuário se cadastra.
-- security definer é necessário pois RLS bloquearia o client de inserir
-- diretamente em profiles (só existe policy de select/update, de propósito).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  chosen_username text;
  palette text[] := array['#22d3ee', '#f472b6', '#a3e635', '#fb923c', '#818cf8', '#facc15'];
begin
  chosen_username := coalesce(
    new.raw_user_meta_data->>'username',
    split_part(new.email, '@', 1)
  );

  insert into public.profiles (id, username, color)
  values (
    new.id,
    chosen_username,
    palette[1 + floor(random() * array_length(palette, 1))::int]
  )
  on conflict (id) do nothing;

  return new;
exception
  when unique_violation then
    -- username já existe: adiciona um sufixo curto e tenta de novo
    insert into public.profiles (id, username, color)
    values (
      new.id,
      chosen_username || '_' || substr(md5(random()::text), 1, 4),
      palette[1 + floor(random() * array_length(palette, 1))::int]
    )
    on conflict (id) do nothing;

    return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- Função principal do jogo: recebe o percurso de uma corrida,
-- valida e persiste a conquista de território.
--
-- coords: jsonb no formato [[lng,lat], [lng,lat], ...] (o percurso do GPS)
-- run_started_at: timestamp de quando a corrida começou
--
-- security definer: roda com privilégios elevados, ignorando RLS,
-- mas SEMPRE valida auth.uid() manualmente — é assim que garantimos
-- que só o próprio usuário logado pode reivindicar território pra si.
-- ============================================================
create or replace function public.claim_territory(coords jsonb, run_started_at timestamptz)
returns table (owner_id uuid, geom_geojson jsonb, area_m2 double precision)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  uid uuid := auth.uid();
  pts extensions.geometry[];
  n_pts int;
  ring extensions.geometry;
  claim_poly extensions.geometry;
  claim_area double precision;
  rec record;
  remaining extensions.geometry;
  merged extensions.geometry;
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  n_pts := jsonb_array_length(coords);
  if n_pts < 4 then
    raise exception 'path_too_short';
  end if;

  select array_agg(extensions.ST_MakePoint((pt->>0)::double precision, (pt->>1)::double precision))
  into pts
  from jsonb_array_elements(coords) as pt;

  -- Fecha o anel se o cliente não mandou o ponto final = inicial
  if not extensions.ST_Equals(pts[1], pts[array_length(pts, 1)]) then
    pts := pts || pts[1];
  end if;

  ring := extensions.ST_SetSRID(extensions.ST_MakeLine(pts), 4326);
  claim_poly := extensions.ST_MakeValid(extensions.ST_MakePolygon(ring));
  claim_poly := extensions.ST_Multi(claim_poly);

  claim_area := extensions.ST_Area(claim_poly::extensions.geography);
  if claim_area < 25 then
    -- área menor que 25m² normalmente é ruído de GPS, não uma corrida real
    raise exception 'claimed_area_too_small';
  end if;

  -- Subtrai a área invadida dos territórios de QUALQUER outro dono que sobrepõe
  for rec in
    select t.owner_id as oid, t.geom as g
    from territories t
    where t.owner_id <> uid and extensions.ST_Intersects(t.geom, claim_poly)
  loop
    remaining := extensions.ST_Difference(rec.g, claim_poly);
    if remaining is null or extensions.ST_IsEmpty(remaining) then
      delete from territories where territories.owner_id = rec.oid;
    else
      remaining := extensions.ST_Multi(remaining);
      update territories
      set geom = remaining,
          area_m2 = extensions.ST_Area(remaining::extensions.geography),
          updated_at = now()
      where territories.owner_id = rec.oid;
    end if;
    update profiles
    set total_area_m2 = coalesce((select t2.area_m2 from territories t2 where t2.owner_id = rec.oid), 0)
    where id = rec.oid;
  end loop;

  -- Une com o território que o próprio usuário já tinha, se houver
  select t.geom into merged from territories t where t.owner_id = uid;
  if merged is not null then
    merged := extensions.ST_Multi(extensions.ST_Union(merged, claim_poly));
  else
    merged := claim_poly;
  end if;

  insert into territories (owner_id, geom, area_m2, updated_at)
  values (uid, merged, extensions.ST_Area(merged::extensions.geography), now())
  on conflict (owner_id) do update
  set geom = excluded.geom, area_m2 = excluded.area_m2, updated_at = now();

  update profiles
  set total_area_m2 = extensions.ST_Area(merged::extensions.geography)
  where id = uid;

  insert into runs (runner_id, path, area_claimed_m2, started_at, finished_at)
  values (uid, ring, claim_area, run_started_at, now());

  return query
  select uid, extensions.ST_AsGeoJSON(merged)::jsonb, extensions.ST_Area(merged::extensions.geography);
end;
$$;

grant execute on function public.claim_territory(jsonb, timestamptz) to authenticated;
