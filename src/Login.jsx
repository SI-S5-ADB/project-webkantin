import { useState } from 'react'
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth'
import { Eye, EyeOff } from 'lucide-react'

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
  passwordWrapper: { position: 'relative', display: 'flex', alignItems: 'center', width: '100%' },
  passwordInput: { width: '100%', padding: '11px 40px 11px 12px', border: '1px solid #e5d5c5', borderRadius: 10, fontSize: 15, boxSizing: 'border-box' },
  eyeButton: {
    position: 'absolute', right: 10, background: 'none', border: 'none', cursor: 'pointer',
    padding: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888',
  },
  button: { padding: 12, border: 0, borderRadius: 10, background: '#d68c55', color: '#fff', fontSize: 16, fontWeight: 700, cursor: 'pointer' },
  error: { color: '#c0392b', fontSize: 14, margin: 0 },
}

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
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
        <div style={s.passwordWrapper}>
          <input
            style={s.passwordInput}
            type={showPassword ? 'text' : 'password'}
            placeholder="Kata sandi"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
          />
          <button
            type="button"
            style={s.eyeButton}
            onClick={() => setShowPassword(v => !v)}
            aria-label={showPassword ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}
          >
            {showPassword ? <EyeOff size={19} /> : <Eye size={19} />}
          </button>
        </div>
        {error && <p style={s.error}>{error}</p>}
        <button style={s.button} type="submit" disabled={loading}>
          {loading ? 'Memproses...' : 'Masuk'}
        </button>
      </form>
    </div>
  )
}