-- Jour 2 : base de données de la cantine
-- À coller dans Supabase > SQL Editor > New query, puis "Run"

-- 1. Profils : un par utilisateur, avec son rôle et son solde (en FCFA)
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  nom text,
  role text not null default 'etudiant' check (role in ('etudiant', 'cuisine', 'gestionnaire')),
  solde integer not null default 0
);

-- Crée automatiquement un profil à chaque nouveau compte
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Profil pour le compte déjà créé hier
insert into public.profiles (id, email)
select id, email from auth.users
on conflict (id) do nothing;

-- Renvoie le rôle de la personne connectée
create or replace function public.mon_role()
returns text language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;

-- 2. Menus : un plat proposé un jour donné
create table public.menus (
  id bigint generated always as identity primary key,
  date_service date not null,
  plat text not null,
  prix integer not null,
  quantite_max integer not null default 100
);

-- 3. Réservations : un étudiant réserve un plat
create table public.reservations (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  menu_id bigint not null references public.menus(id) on delete cascade,
  statut text not null default 'reservee' check (statut in ('reservee', 'payee', 'servie', 'annulee')),
  created_at timestamptz not null default now(),
  unique (user_id, menu_id)
);

-- 4. Sécurité : chacun ne voit et ne modifie que ce qu'il a le droit
alter table public.profiles enable row level security;
alter table public.menus enable row level security;
alter table public.reservations enable row level security;

create policy "voir son profil ou staff" on public.profiles for select to authenticated
  using (id = auth.uid() or public.mon_role() in ('cuisine', 'gestionnaire'));
create policy "gestionnaire modifie les profils" on public.profiles for update to authenticated
  using (public.mon_role() = 'gestionnaire');

create policy "tout le monde voit les menus" on public.menus for select to authenticated
  using (true);
create policy "gestionnaire gère les menus" on public.menus for all to authenticated
  using (public.mon_role() = 'gestionnaire') with check (public.mon_role() = 'gestionnaire');

create policy "voir ses réservations ou staff" on public.reservations for select to authenticated
  using (user_id = auth.uid() or public.mon_role() in ('cuisine', 'gestionnaire'));
create policy "réserver pour soi" on public.reservations for insert to authenticated
  with check (user_id = auth.uid());
create policy "modifier sa réservation ou staff" on public.reservations for update to authenticated
  using (user_id = auth.uid() or public.mon_role() in ('cuisine', 'gestionnaire'));

-- 5. Quelques plats pour tester
insert into public.menus (date_service, plat, prix, quantite_max) values
  (current_date + 1, 'Garba', 1000, 80),
  (current_date + 1, 'Attiéké poisson braisé', 1500, 60),
  (current_date + 2, 'Riz sauce graine', 1200, 70),
  (current_date + 2, 'Alloco poulet', 1500, 50),
  (current_date + 3, 'Foutou sauce claire', 1300, 60);
