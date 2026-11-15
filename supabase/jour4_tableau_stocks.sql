-- Jour 4 : historique de fréquentation et stocks
-- À coller dans Supabase > SQL Editor > New query, puis "Run"

-- 1. Historique : repas préparés et servis par jour (comme si on importait les anciens registres papier)
create table public.frequentation (
  jour date primary key,
  repas_prepares integer not null,
  repas_servis integer not null
);

insert into public.frequentation (jour, repas_prepares, repas_servis)
select d::date, s + (15 + floor(random() * 30))::int, s
from (
  select d,
    (case extract(isodow from d)
      when 7 then 0                              -- dimanche : fermé
      when 6 then 60 + floor(random() * 20)      -- samedi : peu de monde
      when 3 then 220 + floor(random() * 30)     -- mercredi : jour du plat préféré
      else 170 + floor(random() * 40)
    end)::int as s
  from generate_series(current_date - 28, current_date - 1, interval '1 day') d
) t
where s > 0;

-- 2. Stocks d'ingrédients, avec un seuil d'alerte
create table public.stocks (
  id bigint generated always as identity primary key,
  nom text not null,
  quantite numeric not null default 0,
  unite text not null default 'kg',
  seuil_alerte numeric not null default 0
);

insert into public.stocks (nom, quantite, unite, seuil_alerte) values
  ('Riz', 25, 'kg', 10),
  ('Attiéké', 30, 'kg', 10),
  ('Poulet', 12, 'kg', 8),
  ('Poisson', 6, 'kg', 8),
  ('Huile', 4, 'L', 5),
  ('Banane plantain', 40, 'unités', 20);

-- 3. Sécurité : seuls la cuisine et le gestionnaire voient ces données
alter table public.frequentation enable row level security;
alter table public.stocks enable row level security;

create policy "staff voit l'historique" on public.frequentation for select to authenticated
  using (public.mon_role() in ('cuisine', 'gestionnaire'));

create policy "staff voit les stocks" on public.stocks for select to authenticated
  using (public.mon_role() in ('cuisine', 'gestionnaire'));
create policy "staff modifie les stocks" on public.stocks for update to authenticated
  using (public.mon_role() in ('cuisine', 'gestionnaire'));
create policy "gestionnaire ajoute des stocks" on public.stocks for insert to authenticated
  with check (public.mon_role() = 'gestionnaire');

alter publication supabase_realtime add table public.stocks;
