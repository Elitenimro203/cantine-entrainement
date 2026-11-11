import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'

const aujourdhui = () => new Date().toISOString().slice(0, 10)
const carte = { border: '1px solid #ddd', borderRadius: 8, padding: 12, margin: '8px 0' }
const libelles = { reservee: 'Réservée', payee: 'Payée', servie: 'Servie', annulee: 'Annulée' }

// ---------- Connexion ----------
function Connexion() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')

  async function creerCompte() {
    const { error } = await supabase.auth.signUp({ email, password })
    setMessage(error ? error.message : 'Compte créé !')
  }
  async function seConnecter() {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setMessage(error ? error.message : '')
  }

  return (
    <div style={{ padding: 24, maxWidth: 360, margin: 'auto' }}>
      <h1>Cantine</h1>
      <input placeholder="E-mail" value={email} onChange={e => setEmail(e.target.value)} />
      <br />
      <input type="password" placeholder="Mot de passe (6 caractères min.)" value={password} onChange={e => setPassword(e.target.value)} />
      <br />
      <button onClick={seConnecter}>Se connecter</button>{' '}
      <button onClick={creerCompte}>Créer un compte</button>
      <p>{message}</p>
    </div>
  )
}

// ---------- Écran étudiant : voir les menus et réserver ----------
function Etudiant({ user }) {
  const [menus, setMenus] = useState([])
  const [resas, setResas] = useState([])
  const [message, setMessage] = useState('')

  async function charger() {
    const { data: m } = await supabase.from('menus').select('*')
      .gte('date_service', aujourdhui()).order('date_service')
    const { data: r } = await supabase.from('reservations')
      .select('id, statut, menus(plat, date_service, prix)')
      .eq('user_id', user.id).order('created_at', { ascending: false })
    setMenus(m || [])
    setResas(r || [])
  }
  useEffect(() => { charger() }, [])

  async function reserver(menu) {
    const { error } = await supabase.from('reservations').insert({ user_id: user.id, menu_id: menu.id })
    if (error) setMessage(error.code === '23505' ? 'Tu as déjà réservé ce plat.' : error.message)
    else setMessage('Réservé : ' + menu.plat)
    charger()
  }
  async function annuler(id) {
    await supabase.from('reservations').update({ statut: 'annulee' }).eq('id', id)
    charger()
  }

  return (
    <div>
      <h2>Menus à venir</h2>
      {menus.map(m => (
        <div key={m.id} style={carte}>
          <b>{m.plat}</b> · {m.date_service} · {m.prix} FCFA{' '}
          <button onClick={() => reserver(m)}>Réserver</button>
        </div>
      ))}
      <p>{message}</p>
      <h2>Mes réservations</h2>
      {resas.length === 0 && <p>Aucune réservation pour l'instant.</p>}
      {resas.map(r => (
        <div key={r.id} style={carte}>
          {r.menus?.plat} · {r.menus?.date_service} · <b>{libelles[r.statut]}</b>{' '}
          {r.statut === 'reservee' && <button onClick={() => annuler(r.id)}>Annuler</button>}
        </div>
      ))}
    </div>
  )
}

// ---------- Écran cuisine : combien de plats préparer, et marquer servi ----------
function Cuisine() {
  const [resas, setResas] = useState([])

  async function charger() {
    const { data } = await supabase.from('reservations')
      .select('id, statut, menus!inner(plat, date_service), profiles(email)')
      .gte('menus.date_service', aujourdhui())
      .neq('statut', 'annulee')
    setResas(data || [])
  }
  useEffect(() => { charger() }, [])

  async function servir(id) {
    await supabase.from('reservations').update({ statut: 'servie' }).eq('id', id)
    charger()
  }

  // Nombre de plats à préparer, par jour et par plat
  const totaux = {}
  resas.forEach(r => {
    const cle = r.menus.date_service + ' · ' + r.menus.plat
    totaux[cle] = (totaux[cle] || 0) + 1
  })

  return (
    <div>
      <h2>À préparer</h2>
      {Object.keys(totaux).length === 0 && <p>Aucune réservation.</p>}
      {Object.entries(totaux).map(([cle, n]) => (
        <div key={cle} style={carte}><b>{n}×</b> {cle}</div>
      ))}
      <h2>Réservations</h2>
      {resas.map(r => (
        <div key={r.id} style={carte}>
          {r.menus.date_service} · {r.menus.plat} · {r.profiles?.email} · <b>{libelles[r.statut]}</b>{' '}
          {r.statut !== 'servie' && <button onClick={() => servir(r.id)}>Servi</button>}
        </div>
      ))}
    </div>
  )
}

// ---------- Écran gestionnaire : créer et supprimer des menus ----------
function Gestionnaire() {
  const [menus, setMenus] = useState([])
  const [form, setForm] = useState({ date_service: aujourdhui(), plat: '', prix: 1000, quantite_max: 100 })
  const [message, setMessage] = useState('')

  async function charger() {
    const { data } = await supabase.from('menus')
      .select('*, reservations(count)').order('date_service', { ascending: false })
    setMenus(data || [])
  }
  useEffect(() => { charger() }, [])

  async function ajouter() {
    if (!form.plat) return setMessage('Indique le nom du plat.')
    const { error } = await supabase.from('menus').insert({
      ...form, prix: Number(form.prix), quantite_max: Number(form.quantite_max)
    })
    setMessage(error ? error.message : 'Menu ajouté !')
    setForm({ ...form, plat: '' })
    charger()
  }
  async function supprimer(id) {
    await supabase.from('menus').delete().eq('id', id)
    charger()
  }

  return (
    <div>
      <h2>Ajouter un menu</h2>
      <input type="date" value={form.date_service} onChange={e => setForm({ ...form, date_service: e.target.value })} />{' '}
      <input placeholder="Plat" value={form.plat} onChange={e => setForm({ ...form, plat: e.target.value })} />{' '}
      <input type="number" placeholder="Prix" value={form.prix} onChange={e => setForm({ ...form, prix: e.target.value })} style={{ width: 80 }} /> FCFA{' '}
      <input type="number" placeholder="Quantité" value={form.quantite_max} onChange={e => setForm({ ...form, quantite_max: e.target.value })} style={{ width: 70 }} /> portions{' '}
      <button onClick={ajouter}>Ajouter</button>
      <p>{message}</p>
      <h2>Tous les menus</h2>
      {menus.map(m => (
        <div key={m.id} style={carte}>
          <b>{m.plat}</b> · {m.date_service} · {m.prix} FCFA · {m.reservations?.[0]?.count ?? 0}/{m.quantite_max} réservés{' '}
          <button onClick={() => supprimer(m.id)}>Supprimer</button>
        </div>
      ))}
    </div>
  )
}

// ---------- Application : choisit l'écran selon le rôle ----------
export default function App() {
  const [session, setSession] = useState(null)
  const [profil, setProfil] = useState(null)
  const [vue, setVue] = useState(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) { setProfil(null); return }
    supabase.from('profiles').select('*').eq('id', session.user.id).single()
      .then(({ data }) => { setProfil(data); setVue(data?.role) })
  }, [session])

  if (!session) return <Connexion />
  if (!profil) return <p style={{ padding: 24 }}>Chargement…</p>

  return (
    <div style={{ padding: 24, maxWidth: 720, margin: 'auto', textAlign: 'left' }}>
      <h1>Cantine 🍽️</h1>
      <p>
        {profil.email} · rôle : <b>{profil.role}</b> · solde : {profil.solde} FCFA{' '}
        <button onClick={() => supabase.auth.signOut()}>Se déconnecter</button>
      </p>
      {profil.role === 'gestionnaire' && (
        <p>
          Voir l'écran :{' '}
          <button onClick={() => setVue('gestionnaire')}>Gestionnaire</button>{' '}
          <button onClick={() => setVue('cuisine')}>Cuisine</button>{' '}
          <button onClick={() => setVue('etudiant')}>Étudiant</button>
        </p>
      )}
      <hr />
      {vue === 'etudiant' && <Etudiant user={session.user} />}
      {vue === 'cuisine' && <Cuisine />}
      {vue === 'gestionnaire' && <Gestionnaire />}
    </div>
  )
}
