import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
 
export default function App() {
  const [session, setSession] = useState(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
 
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])
 
  async function signUp() {
    const { error } = await supabase.auth.signUp({ email, password })
    setMessage(error ? error.message : 'Compte créé !')
  }
 
  async function signIn() {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setMessage(error ? error.message : '')
  }
 
  if (session) {
    return (
      <div style={{ padding: 24 }}>
        <h1>Bonjour cantine 🍽️</h1>
        <p>Connecté : {session.user.email}</p>
        <button onClick={() => supabase.auth.signOut()}>Se déconnecter</button>
      </div>
    )
  }
 
  return (
    <div style={{ padding: 24, maxWidth: 360, margin: 'auto' }}>
      <h1>Cantine</h1>
      <input placeholder="E-mail" value={email} onChange={e => setEmail(e.target.value)} />
      <br />
      <input type="password" placeholder="Mot de passe (6 caractères min.)" value={password} onChange={e => setPassword(e.target.value)} />
      <br />
      <button onClick={signIn}>Se connecter</button>{' '}
      <button onClick={signUp}>Créer un compte</button>
      <p>{message}</p>
    </div>
  )
}
 