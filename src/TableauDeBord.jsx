import { useEffect, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { supabase } from './supabaseClient'

const aujourdhui = () => new Date().toISOString().slice(0, 10)
const carte = { border: '1px solid #ddd', borderRadius: 8, padding: 12, margin: '8px 0' }
const tuile = { border: '1px solid #ddd', borderRadius: 8, padding: 12, flex: '1 1 140px' }

export default function TableauDeBord() {
  const [historique, setHistorique] = useState([])
  const [resas, setResas] = useState([])
  const [stocks, setStocks] = useState([])

  async function charger() {
    const { data: h } = await supabase.from('frequentation').select('*')
      .order('jour', { ascending: false }).limit(14)
    const { data: r } = await supabase.from('reservations')
      .select('statut, menus(plat, date_service, prix)').neq('statut', 'annulee')
    const { data: s } = await supabase.from('stocks').select('*').order('nom')
    setHistorique((h || []).reverse())
    setResas(r || [])
    setStocks(s || [])
  }

  useEffect(() => {
    charger()
    const canal = supabase.channel('tableau')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reservations' }, () => charger())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stocks' }, () => charger())
      .subscribe()
    return () => { supabase.removeChannel(canal) }
  }, [])

  // Chiffres du jour
  const duJour = resas.filter(r => r.menus?.date_service === aujourdhui())
  const servis = duJour.filter(r => r.statut === 'servie').length
  const recette = duJour
    .filter(r => r.statut === 'payee' || r.statut === 'servie')
    .reduce((total, r) => total + (r.menus?.prix || 0), 0)

  // Gaspillage sur les 14 derniers jours
  const prepares = historique.reduce((t, j) => t + j.repas_prepares, 0)
  const jetes = historique.reduce((t, j) => t + (j.repas_prepares - j.repas_servis), 0)
  const tauxGaspi = prepares ? Math.round((jetes / prepares) * 100) : 0

  // Plats les plus réservés
  const parPlat = {}
  resas.forEach(r => { const p = r.menus?.plat; if (p) parPlat[p] = (parPlat[p] || 0) + 1 })
  const top = Object.entries(parPlat).sort((a, b) => b[1] - a[1]).slice(0, 5)

  async function changerStock(stock, delta) {
    const quantite = Math.max(0, Number(stock.quantite) + delta)
    await supabase.from('stocks').update({ quantite }).eq('id', stock.id)
    charger()
  }

  const enAlerte = stocks.filter(s => Number(s.quantite) <= Number(s.seuil_alerte))

  return (
    <div>
      <h2>Aujourd'hui</h2>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <div style={tuile}>Réservations<br /><b style={{ fontSize: 28 }}>{duJour.length}</b></div>
        <div style={tuile}>Repas servis<br /><b style={{ fontSize: 28 }}>{servis}</b></div>
        <div style={tuile}>Recette<br /><b style={{ fontSize: 28 }}>{recette} FCFA</b></div>
        <div style={tuile}>Gaspillage (14 j)<br /><b style={{ fontSize: 28 }}>{tauxGaspi} %</b><br /><small>{jetes} repas jetés</small></div>
      </div>

      <h2>Préparés et servis, 14 derniers jours</h2>
      <div style={{ width: '100%', height: 260 }}>
        <ResponsiveContainer>
          <BarChart data={historique.map(j => ({ ...j, jour: j.jour.slice(5) }))}>
            <XAxis dataKey="jour" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Bar dataKey="repas_prepares" name="Préparés" fill="#c4b5fd" />
            <Bar dataKey="repas_servis" name="Servis" fill="#7c3aed" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <h2>Plats les plus réservés</h2>
      {top.length === 0 && <p>Pas encore de réservations.</p>}
      {top.map(([plat, n]) => <div key={plat} style={carte}><b>{n}</b> × {plat}</div>)}

      <h2>Stocks {enAlerte.length > 0 && <span style={{ color: '#dc2626' }}>· {enAlerte.length} en alerte</span>}</h2>
      {stocks.map(s => {
        const alerte = Number(s.quantite) <= Number(s.seuil_alerte)
        return (
          <div key={s.id} style={{ ...carte, borderColor: alerte ? '#dc2626' : '#ddd' }}>
            <b>{s.nom}</b> : {s.quantite} {s.unite} (seuil {s.seuil_alerte}){' '}
            {alerte && <b style={{ color: '#dc2626' }}>⚠️ À racheter</b>}{' '}
            <button onClick={() => changerStock(s, -1)}>−1</button>{' '}
            <button onClick={() => changerStock(s, 1)}>+1</button>{' '}
            <button onClick={() => changerStock(s, 10)}>+10</button>
          </div>
        )
      })}
    </div>
  )
}
