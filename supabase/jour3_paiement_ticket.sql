-- Jour 3 : solde prépayé, paiement, ticket QR, service en cuisine, temps réel
-- À coller dans Supabase > SQL Editor > New query, puis "Run"

-- 1. Chaque réservation reçoit un code de ticket unique (ce que contiendra le QR)
alter table public.reservations add column ticket uuid not null default gen_random_uuid() unique;

-- 2. Permettre de re-réserver un plat après l'avoir annulé
alter table public.reservations drop constraint if exists reservations_user_id_menu_id_key;
create unique index if not exists une_resa_active_par_plat
  on public.reservations (user_id, menu_id) where statut <> 'annulee';

-- 3. Payer une réservation avec son solde
create or replace function public.payer_reservation(resa_id bigint)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_prix integer;
  v_solde integer;
begin
  select m.prix into v_prix
  from reservations r join menus m on m.id = r.menu_id
  where r.id = resa_id and r.user_id = auth.uid() and r.statut = 'reservee';
  if v_prix is null then return 'Réservation introuvable ou déjà payée.'; end if;

  select solde into v_solde from profiles where id = auth.uid() for update;
  if v_solde < v_prix then return 'Solde insuffisant. Demande une recharge.'; end if;

  update profiles set solde = solde - v_prix where id = auth.uid();
  update reservations set statut = 'payee' where id = resa_id;
  return 'ok';
end;
$$;

-- 4. Recharger le solde d'un utilisateur (gestionnaire uniquement)
create or replace function public.recharger(p_email text, p_montant integer)
returns text language plpgsql security definer set search_path = public as $$
begin
  if mon_role() <> 'gestionnaire' then return 'Réservé au gestionnaire.'; end if;
  if p_montant <= 0 then return 'Montant invalide.'; end if;
  update profiles set solde = solde + p_montant where email = p_email;
  if not found then return 'Aucun compte avec cet e-mail.'; end if;
  return 'ok';
end;
$$;

-- 5. Servir un repas à partir du code du ticket (cuisine ou gestionnaire)
create or replace function public.servir_ticket(p_ticket text)
returns text language plpgsql security definer set search_path = public as $$
declare
  r record;
begin
  if mon_role() not in ('cuisine', 'gestionnaire') then return 'Réservé à la cuisine.'; end if;

  select res.id, res.statut, m.plat, m.date_service, p.email into r
  from reservations res
  join menus m on m.id = res.menu_id
  join profiles p on p.id = res.user_id
  where res.ticket::text = trim(p_ticket);

  if r.id is null then return '❌ Ticket inconnu.'; end if;
  if r.statut = 'servie' then return '⚠️ Déjà servi : ' || r.plat || ' (' || r.email || ')'; end if;
  if r.statut <> 'payee' then return '❌ Ticket non payé : ' || r.plat; end if;
  if r.date_service <> current_date then return '⚠️ Ce ticket est pour le ' || r.date_service; end if;

  update reservations set statut = 'servie' where id = r.id;
  return '✅ Servi : ' || r.plat || ' (' || r.email || ')';
end;
$$;

-- 6. Temps réel : l'app est prévenue dès qu'une réservation ou un solde change
alter publication supabase_realtime add table public.reservations, public.profiles;

-- 7. Un plat pour aujourd'hui, pour pouvoir tester le scan tout de suite
insert into public.menus (date_service, plat, prix, quantite_max)
values (current_date, 'Kedjenou de poulet', 1500, 40);
