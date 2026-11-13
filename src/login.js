import { useState } from 'react'
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth'

const pesanError = code => {
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Email atau kata sandi salah'
    case 'auth/invalid-email':
      return 'Format email tidak valid'
    case 'auth/too-many-requests':
      return 'Terlalu banyak percobaan. Coba lagi beberapa menit lagi'
    case 'auth/network-request-failed':
      return 'Koneksi internet bermasalah'
    default:
      return 'Gagal masuk. Coba lagi'
  }
}

const s = {
  page: { minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#fff7ee', padding: 16 },
  card: {
    width: '100%', maxWidth: 380, background: '#fff', borderRadius: 16, padding: 28,
    boxShadow: '0 8px 30px rgba(0,0,0,.08)', display: 'grid', gap: 14, fontFamily: 'inherit',
  },
  input: { width: '100%', padding: '11px 12px', border: '1px solid #e5d5c5', borderRadius: 10, fontSize: 15, boxSizing: 'border-box' },
  button: { padding: 12, border: 0, borderRadius: 10, background: '#d68c55', color: '#fff', fontSize: 16, fontWeight: 700, cursor: 'pointer' },
  error: { color: '#c0392b', fontSize: 14, margin: 0 },
}

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function masuk(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await signInWithEmailAndPassword(getAuth(), email.trim(), password)
      // berhasil: onAuthStateChanged di main.jsx otomatis menampilkan aplikasi
    } catch (err) {
      setError(pesanError(err.code))
      setLoading(false)
    }
  }

  return (
    <div style={s.page}>
      <form style={s.card} onSubmit={masuk}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 40 }}>🏪</div>
          <h2 style={{ margin: '4px 0 0' }}>Biber Food & Drink</h2>
          <p style={{ margin: '4px 0 0', color: '#777' }}>Masuk untuk melanjutkan</p>
        </div>
        <input style={s.input} type="email" placeholder="Email" value={email}
          onChange={e => setEmail(e.target.value)} required autoFocus />
        <input style={s.input} type="password" placeholder="Kata sandi" value={password}
          onChange={e => setPassword(e.target.value)} required />
        {error && <p style={s.error}>{error}</p>}
        <button style={s.button} type="submit" disabled={loading}>
          {loading ? 'Memproses...' : 'Masuk'}
        </button>
      </form>
    </div>
  )
}