import { useEffect, useRef, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { Html5QrcodeScanner } from 'html5-qrcode'
import { supabase } from './supabaseClient'

const aujourdhui = () => new Date().toISOString().slice(0, 10)
const carte = { border: '1px solid #ddd', borderRadius: 8, padding: 12, margin: '8px 0' }
const libelles = { reservee: 'Réservée', payee: 'Payée', servie: 'Servie', annulee: 'Annulée' }

// Recharge la liste dès qu'une table change dans Supabase (temps réel)
function useTempsReel(nom, table, recharger) {
  useEffect(() => {
    const canal = supabase.channel(nom)
      .on('postgres_changes', { event: '*', schema: 'public', table }, () => recharger())
      .subscribe()
    return () => { supabase.removeChannel(canal) }
  }, [])
}

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

// ---------- Écran étudiant : réserver, payer, afficher son ticket QR ----------
function Etudiant({ user }) {
  const [menus, setMenus] = useState([])
  const [resas, setResas] = useState([])
  const [solde, setSolde] = useState(0)
  const [message, setMessage] = useState('')

  async function charger() {
    const { data: m } = await supabase.from('menus').select('*')
      .gte('date_service', aujourdhui()).order('date_service')
    const { data: r } = await supabase.from('reservations')
      .select('id, statut, ticket, menus(plat, date_service, prix)')
      .eq('user_id', user.id).neq('statut', 'annulee')
      .order('created_at', { ascending: false })
    const { data: p } = await supabase.from('profiles').select('solde').eq('id', user.id).single()
    setMenus(m || [])
    setResas(r || [])
    setSolde(p?.solde ?? 0)
  }
  useEffect(() => { charger() }, [])
  useTempsReel('etudiant-resas', 'reservations', charger)
  useTempsReel('etudiant-solde', 'profiles', charger)

  async function reserver(menu) {
    const { error } = await supabase.from('reservations').insert({ user_id: user.id, menu_id: menu.id })
    if (error) setMessage(error.code === '23505' ? 'Tu as déjà réservé ce plat.' : error.message)
    else setMessage('Réservé : ' + menu.plat + '. Pense à payer.')
    charger()
  }
  async function payer(id) {
    const { data, error } = await supabase.rpc('payer_reservation', { resa_id: id })
    setMessage(error ? error.message : data === 'ok' ? 'Payé ! Ton ticket QR est prêt.' : data)
    charger()
  }
  async function annuler(id) {
    await supabase.from('reservations').update({ statut: 'annulee' }).eq('id', id)
    charger()
  }

  return (
    <div>
      <h2>Mon solde : {solde} FCFA</h2>
      <h2>Menus à venir</h2>
      {menus.map(m => (
        <div key={m.id} style={carte}>
          <b>{m.plat}</b> · {m.date_service} · {m.prix} FCFA{' '}
          <button onClick={() => reserver(m)}>Réserver</button>
        </div>
      ))}
      <p><b>{message}</b></p>
      <h2>Mes réservations</h2>
      {resas.length === 0 && <p>Aucune réservation pour l'instant.</p>}
      {resas.map(r => (
        <div key={r.id} style={carte}>
          {r.menus?.plat} · {r.menus?.date_service} · {r.menus?.prix} FCFA · <b>{libelles[r.statut]}</b>{' '}
          {r.statut === 'reservee' && (
            <>
              <button onClick={() => payer(r.id)}>Payer</button>{' '}
              <button onClick={() => annuler(r.id)}>Annuler</button>
            </>
          )}
          {r.statut === 'payee' && (
            <div style={{ marginTop: 8 }}>
              <QRCodeSVG value={r.ticket} size={160} />
              <div style={{ fontSize: 12, color: '#666' }}>Code : {r.ticket}</div>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// ---------- Lecteur de QR code (caméra) ----------
function Lecteur({ onScan }) {
  const dernier = useRef('')
  useEffect(() => {
    const lecteur = new Html5QrcodeScanner('lecteur-qr', { fps: 10, qrbox: 220 }, false)
    lecteur.render(texte => {
      if (texte === dernier.current) return // évite de scanner 10 fois le même ticket
      dernier.current = texte
      onScan(texte)
    }, () => {})
    return () => { lecteur.clear().catch(() => {}) }
  }, [])
  return <div id="lecteur-qr" style={{ maxWidth: 320 }} />
}

// ---------- Écran cuisine : scanner les tickets, voir quoi préparer ----------
function Cuisine() {
  const [resas, setResas] = useState([])
  const [resultat, setResultat] = useState('')
  const [code, setCode] = useState('')
  const [camera, setCamera] = useState(false)

  async function charger() {
    const { data } = await supabase.from('reservations')
      .select('id, statut, ticket, menus!inner(plat, date_service), profiles(email)')
      .gte('menus.date_service', aujourdhui())
      .neq('statut', 'annulee')
    setResas(data || [])
  }
  useEffect(() => { charger() }, [])
  useTempsReel('cuisine', 'reservations', charger)

  async function servir(ticket) {
    const { data, error } = await supabase.rpc('servir_ticket', { p_ticket: ticket })
    setResultat(error ? error.message : data)
    charger()
  }

  const totaux = {}
  resas.forEach(r => {
    const cle = r.menus.date_service + ' · ' + r.menus.plat
    if (!totaux[cle]) totaux[cle] = { total: 0, servis: 0 }
    totaux[cle].total += 1
    if (r.statut === 'servie') totaux[cle].servis += 1
  })

  return (
    <div>
      <h2>Scanner un ticket</h2>
      <button onClick={() => setCamera(!camera)}>{camera ? 'Fermer la caméra' : 'Ouvrir la caméra'}</button>
      {camera && <Lecteur onScan={servir} />}
      <p>
        Ou saisir le code :{' '}
        <input value={code} onChange={e => setCode(e.target.value)} placeholder="Code du ticket" />{' '}
        <button onClick={() => { servir(code); setCode('') }}>Valider</button>
      </p>
      {resultat && <p style={{ fontSize: 20 }}><b>{resultat}</b></p>}

      <h2>À préparer</h2>
      {Object.keys(totaux).length === 0 && <p>Aucune réservation.</p>}
      {Object.entries(totaux).map(([cle, t]) => (
        <div key={cle} style={carte}><b>{t.total}×</b> {cle} · {t.servis} servis</div>
      ))}

      <h2>Réservations (mise à jour en direct)</h2>
      {resas.map(r => (
        <div key={r.id} style={carte}>
          {r.menus.date_service} · {r.menus.plat} · {r.profiles?.email} · <b>{libelles[r.statut]}</b>{' '}
          {r.statut === 'payee' && <button onClick={() => servir(r.ticket)}>Servi</button>}
        </div>
      ))}
    </div>
  )
}

// ---------- Écran gestionnaire : menus et recharges de solde ----------
function Gestionnaire() {
  const [menus, setMenus] = useState([])
  const [form, setForm] = useState({ date_service: aujourdhui(), plat: '', prix: 1000, quantite_max: 100 })
  const [recharge, setRecharge] = useState({ email: '', montant: 5000 })
  const [message, setMessage] = useState('')

  async function charger() {
    const { data } = await supabase.from('menus')
      .select('*, reservations(statut)').order('date_service', { ascending: false })
    setMenus(data || [])
  }
  useEffect(() => { charger() }, [])
  useTempsReel('gestionnaire', 'reservations', charger)

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
  async function recharger() {
    const { data, error } = await supabase.rpc('recharger', {
      p_email: recharge.email.trim(), p_montant: Number(recharge.montant)
    })
    setMessage(error ? error.message : data === 'ok' ? 'Solde rechargé !' : data)
  }

  return (
    <div>
      <h2>Recharger un solde</h2>
      <input placeholder="E-mail de l'étudiant" value={recharge.email} onChange={e => setRecharge({ ...recharge, email: e.target.value })} />{' '}
      <input type="number" value={recharge.montant} onChange={e => setRecharge({ ...recharge, montant: e.target.value })} style={{ width: 90 }} /> FCFA{' '}
      <button onClick={recharger}>Recharger</button>

      <h2>Ajouter un menu</h2>
      <input type="date" value={form.date_service} onChange={e => setForm({ ...form, date_service: e.target.value })} />{' '}
      <input placeholder="Plat" value={form.plat} onChange={e => setForm({ ...form, plat: e.target.value })} />{' '}
      <input type="number" placeholder="Prix" value={form.prix} onChange={e => setForm({ ...form, prix: e.target.value })} style={{ width: 80 }} /> FCFA{' '}
      <input type="number" placeholder="Quantité" value={form.quantite_max} onChange={e => setForm({ ...form, quantite_max: e.target.value })} style={{ width: 70 }} /> portions{' '}
      <button onClick={ajouter}>Ajouter</button>
      <p><b>{message}</b></p>

      <h2>Tous les menus</h2>
      {menus.map(m => {
        const actives = (m.reservations || []).filter(r => r.statut !== 'annulee')
        const servis = actives.filter(r => r.statut === 'servie').length
        return (
          <div key={m.id} style={carte}>
            <b>{m.plat}</b> · {m.date_service} · {m.prix} FCFA · {actives.length}/{m.quantite_max} réservés · {servis} servis{' '}
            <button onClick={() => supprimer(m.id)}>Supprimer</button>
          </div>
        )
      })}
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
        {profil.email} · rôle : <b>{profil.role}</b>{' '}
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
