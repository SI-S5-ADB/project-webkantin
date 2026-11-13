import { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { collection, getDocs, onSnapshot, orderBy, query } from 'firebase/firestore'
import { db } from './firebase'
import { getAuth, onAuthStateChanged, signOut, updateProfile } from 'firebase/auth'
import Login from './Login'
import { simpanPenjualan, simpanBarangMasuk, simpanOpname, simpanBarangBaru } from './stokService'
import {
  LayoutDashboard,
  LogOut,
  ShoppingBag,
  PackagePlus,
  ClipboardCheck,
  BarChart3,
  Boxes,
  Search,
  Plus,
  Minus,
  Trash2,
  ChevronDown,
  Bell,
  Settings,
  ChevronRight,
  TrendingUp,
  WalletCards,
  PackageSearch,
  AlertTriangle,
  ArrowUpRight,
  Check,
  X,
  Menu,
  UserRound,
  ReceiptText,
  Download,
  Eye,
  Pencil,
} from 'lucide-react'
import './style.css'

const format = n =>
  new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(n || 0)

const parseDate = waktu => {
  if (!waktu) return new Date()
  if (typeof waktu.toDate === 'function') return waktu.toDate()
  if (waktu.seconds) return new Date(waktu.seconds * 1000)
  if (waktu instanceof Date) return waktu
  const d = new Date(waktu)
  return isNaN(d.getTime()) ? new Date() : d
}

const isSameDay = (d1, d2) => {
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  )
}

const formatCompact = n => {
  if (!n || isNaN(n)) return '0'
  if (n >= 1000000) return (n / 1000000).toFixed(1).replace('.0', '').replace('.', ',') + 'jt'
  if (n >= 1000) return Math.round(n / 1000) + 'rb'
  return String(Math.round(n))
}

const formatRelativeTime = date => {
  if (!date) return ''
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffSecs = Math.max(0, Math.floor(diffMs / 1000))
  const diffMins = Math.floor(diffSecs / 60)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffSecs < 60) return 'Baru saja'
  if (diffMins < 60) return `${diffMins} menit lalu`
  if (diffHours < 24) return `${diffHours} jam lalu`
  if (diffDays === 1) return 'Kemarin'
  if (diffDays < 7) return `${diffDays} hari lalu`
  return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short' }).format(date)
}

const getGreeting = () => {
  const hour = new Date().getHours()
  if (hour >= 4 && hour < 11) return 'Selamat pagi'
  if (hour >= 11 && hour < 15) return 'Selamat siang'
  if (hour >= 15 && hour < 18) return 'Selamat sore'
  return 'Selamat malam'
}

const getInitials = name => {
  if (!name || !name.trim()) return 'U'
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[1][0]).toUpperCase()
}

const getTransactionMetrics = (t, productMap) => {
  const omzet = Number(t.total || 0)
  let hpp = 0
  let units = 0
  if (Array.isArray(t.items)) {
    t.items.forEach(item => {
      const q = Number(item.qty || 0)
      units += q
      const p = productMap.get(String(item.kode))
      const modal = Number(item.hargaModal ?? p?.buy ?? p?.hargaModal ?? 0)
      hpp += q * modal
    })
  }
  const profit = omzet - hpp
  return {
    omzet,
    hpp,
    profit,
    units,
    kinds: Array.isArray(t.items) ? t.items.length : 0,
  }
}

const nav = [
  { id: 'dashboard', text: 'Dashboard', icon: LayoutDashboard },
  { id: 'pos', text: 'Kasir / Transaksi', icon: ShoppingBag },
  { id: 'products', text: 'Data Barang', icon: Boxes },
  { id: 'incoming', text: 'Barang Masuk', icon: PackagePlus },
  { id: 'opname', text: 'Stok Opname', icon: ClipboardCheck },
  { id: 'reports', text: 'Laporan Keuangan', icon: BarChart3 },
]

const getCategoryMeta = cat => {
  switch (cat) {
    case 'Makanan':
      return { color: '#f8bd49', icon: '🍜' }
    case 'Minuman':
      return { color: '#ff8f65', icon: '🧋' }
    case 'Gorengan':
      return { color: '#eea374', icon: '🍢' }
    case 'Snack':
      return { color: '#e9cc9b', icon: '🥨' }
    case 'Jajanan Pasar':
      return { color: '#ce7152', icon: '🍡' }
    case 'Beku':
      return { color: '#9dd9e6', icon: '🧊' }
    case 'Olahan':
      return { color: '#805a48', icon: '🍲' }
    default:
      return { color: '#d68c55', icon: '🍱' }
  }
}

function App() {
  const [view, setView] = useState('dashboard'),
    [products, setProducts] = useState([]),
    [cart, setCart] = useState([]),
    [search, setSearch] = useState(''),
    [role, setRole] = useState('Operator'),
    [toast, setToast] = useState(''),
    [loading, setLoading] = useState(true),
    [user, setUser] = useState(null),
    [authReady, setAuthReady] = useState(false),
    [transactions, setTransactions] = useState([]),
    [movements, setMovements] = useState([]),
    [trxLoading, setTrxLoading] = useState(true),
    [userName, setUserName] = useState(() => {
      return localStorage.getItem('user_display_name') || 'Rani Aprillia'
    }),
    [showEditProfile, setShowEditProfile] = useState(false),
    [tempName, setTempName] = useState('')

  useEffect(() => {
    const unsub = onAuthStateChanged(getAuth(), u => {
      setUser(u)
      setAuthReady(true)
      if (u) {
        const saved = localStorage.getItem('user_display_name')
        if (saved) {
          setUserName(saved)
        } else if (u.displayName) {
          setUserName(u.displayName)
          localStorage.setItem('user_display_name', u.displayName)
        }
      }
    })
    return unsub
  }, [])

  useEffect(() => {
    if (!user) {
      setProducts([])
      return
    }
    async function fetchBarang() {
      if (!db) {
        setLoading(false)
        return
      }
      try {
        const snap = await getDocs(query(collection(db, 'barang'), orderBy('nama')))
        const data = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        const formatted = data.map(item => {
          const meta = getCategoryMeta(item.kategori || item.category)
          return {
            ...item,
            name: item.nama || item.name || '',
            category: item.kategori || item.category || 'Lainnya',
            buy: item.hargaModal ?? item.buy ?? 0,
            sell: item.hargaJual ?? item.sell ?? 0,
            stock: item.stok ?? item.stock ?? 0,
            min: item.batasMinimal ?? item.min ?? 0,
            unit: item.unit || 'pcs',
            color: item.color || meta.color,
            icon: item.icon || meta.icon,
          }
        })
        setProducts(formatted)
      } catch (err) {
        console.error('Error fetching barang from Firestore:', err)
      } finally {
        setLoading(false)
      }
    }
    fetchBarang()
  }, [user])

  // Real-time listener untuk transaksi dan pergerakan stok dari Firestore
  useEffect(() => {
    if (!user || !db) {
      setTransactions([])
      setMovements([])
      setTrxLoading(false)
      return
    }

    setTrxLoading(true)

    const unsubTrx = onSnapshot(
      collection(db, 'transaksi'),
      snap => {
        const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }))
        list.sort((a, b) => parseDate(b.waktu).getTime() - parseDate(a.waktu).getTime())
        setTransactions(list)
        setTrxLoading(false)
      },
      err => {
        console.error('Error listening to transaksi:', err)
        setTrxLoading(false)
      }
    )

    const unsubMov = onSnapshot(
      collection(db, 'pergerakanStok'),
      snap => {
        const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }))
        list.sort((a, b) => parseDate(b.waktu).getTime() - parseDate(a.waktu).getTime())
        setMovements(list)
      },
      err => {
        console.error('Error listening to pergerakanStok:', err)
      }
    )

    return () => {
      unsubTrx()
      unsubMov()
    }
  }, [user])

  const notify = t => {
    setToast(t)
    setTimeout(() => setToast(''), 3500)
  }

  const access = item =>
    role === 'Admin'
      ? ['dashboard', 'reports'].includes(item.id)
      : role === 'Kasir'
      ? ['dashboard', 'pos'].includes(item.id)
      : true

  const addCart = p => {
    const stock = p.stock ?? p.stok ?? 0
    if (stock <= 0) return notify('Stok barang sudah habis')
    setCart(c => {
      const found = c.find(x => x.id === p.id)
      return found
        ? c.map(x => (x.id === p.id ? { ...x, qty: Math.min(x.qty + 1, stock) } : x))
        : [...c, { ...p, qty: 1 }]
    })
  }

  const changeQty = (id, amount) =>
    setCart(c =>
      c.map(x => {
        if (x.id !== id) return x
        const stock = x.stock ?? x.stok ?? 0
        return { ...x, qty: Math.max(1, Math.min(stock, x.qty + amount)) }
      })
    )

  const total = cart.reduce((s, x) => s + (x.sell ?? x.hargaJual ?? 0) * x.qty, 0)

  const complete = async paid => {
    if (!cart.length) return notify('Pilih barang terlebih dahulu')
    try {
      await simpanPenjualan(cart, paid, userName || role || 'Operator')
    } catch (err) {
      console.error('Gagal menyimpan transaksi:', err)
      return notify('Gagal menyimpan transaksi: ' + err.message)
    }
    setProducts(ps =>
      ps.map(p => {
        const x = cart.find(i => i.id === p.id)
        if (!x) return p
        const currentStock = p.stock ?? p.stok ?? 0
        const updated = Math.max(0, currentStock - x.qty)
        return { ...p, stock: updated, stok: updated }
      })
    )
    setCart([])
    notify('Transaksi berhasil disimpan dan stok diperbarui')
  }

  const handleSaveProfileName = async () => {
    const trimmed = tempName.trim()
    if (!trimmed) return notify('Nama tidak boleh kosong')
    setUserName(trimmed)
    localStorage.setItem('user_display_name', trimmed)
    if (user) {
      try {
        await updateProfile(user, { displayName: trimmed })
      } catch (err) {
        console.warn('Gagal update displayName di Firebase Auth:', err)
      }
    }
    setShowEditProfile(false)
    notify('Nama profil berhasil disimpan: ' + trimmed)
  }

  const todayTrxCount = useMemo(() => {
    const now = new Date()
    return transactions.filter(t => isSameDay(parseDate(t.waktu), now)).length
  }, [transactions])

  if (!authReady) return <div style={{ padding: 24 }}>Memuat...</div>
  if (!user) return <Login />

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brandmark">B</div>
          <div>
            <b>Biber FOOD</b>
            <span>POINT OF SALE</span>
          </div>
        </div>
        <div className="store">
          <div className="store-icon">🏪</div>
          <div>
            <small>Outlet aktif</small>
            <b>Biber Food & Drink</b>
          </div>
          <ChevronDown size={16} />
        </div>
        <p className="nav-label">MENU UTAMA</p>
        <nav>
          {nav.map(n => {
            const Icon = n.icon
            const enabled = access(n)
            return (
              <button
                key={n.id}
                disabled={!enabled}
                onClick={() => setView(n.id)}
                className={view === n.id ? 'active' : ''}
              >
                <Icon size={19} />
                {n.text}
                {n.id === 'incoming' && <em>3</em>}
              </button>
            )
          })}
        </nav>
        <div className="sidebar-bottom">
          <button>
            <Settings size={19} /> Pengaturan
          </button>
          <button onClick={() => signOut(getAuth())}>
            <LogOut size={19} /> Keluar
          </button>
          <div
            className="profile"
            onClick={() => {
              setTempName(userName)
              setShowEditProfile(true)
            }}
            style={{ cursor: 'pointer', borderRadius: 10, padding: '6px 8px', transition: 'background 0.2s' }}
            title="Klik untuk mengubah nama profil"
          >
            <div className="avatar">{getInitials(userName)}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <b style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block' }}>
                {userName}
              </b>
              <span>{role}</span>
            </div>
            <Pencil size={14} style={{ color: 'var(--muted)', marginLeft: 'auto', flexShrink: 0 }} />
          </div>
        </div>
      </aside>
      <main>
        <header>
          <div className="mobile-menu">
            <Menu />
          </div>
          <div>
            <p className="crumb">
              Biber Food & Drink <ChevronRight size={14} /> {nav.find(x => x.id === view)?.text}
            </p>
            <h1>
              {view === 'dashboard'
                ? `${getGreeting()}, ${userName}! 👋`
                : nav.find(x => x.id === view)?.text}
            </h1>
          </div>
          <div className="header-actions">
            <button className="date">
              {new Intl.DateTimeFormat('id-ID', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              }).format(new Date())}{' '}
              <ChevronDown size={15} />
            </button>
            <button className="bell">
              <Bell size={20} />
              <i />
            </button>
            <select
              value={role}
              onChange={e => {
                setRole(e.target.value)
                setView(e.target.value === 'Admin' ? 'reports' : e.target.value === 'Kasir' ? 'pos' : 'dashboard')
              }}
            >
              <option>Operator</option>
              <option>Kasir</option>
              <option>Admin</option>
            </select>
          </div>
        </header>
        {(loading || trxLoading) && (
          <div style={{ padding: '16px 28px', color: '#666', fontSize: 14 }}>Memuat data...</div>
        )}
        {view === 'dashboard' && (
          <Dashboard
            products={products}
            transactions={transactions}
            movements={movements}
            loading={trxLoading}
            setView={setView}
          />
        )}
        {view === 'pos' && (
          <POS
            products={products}
            cart={cart}
            search={search}
            setSearch={setSearch}
            addCart={addCart}
            changeQty={changeQty}
            setCart={setCart}
            total={total}
            complete={complete}
            todayTrxCount={todayTrxCount}
          />
        )}
        {view === 'products' && <Products products={products} setProducts={setProducts} notify={notify} />}
        {view === 'incoming' && <Incoming products={products} setProducts={setProducts} notify={notify} />}
        {view === 'opname' && <Opname products={products} setProducts={setProducts} notify={notify} />}
        {view === 'reports' && (
          <Reports
            products={products}
            transactions={transactions}
            loading={trxLoading}
            notify={notify}
          />
        )}
      </main>
      {toast && (
        <div className="toast" style={{ zIndex: 9999 }}>
          <Check size={18} />
          {toast}
        </div>
      )}
      {showEditProfile && (
        <Modal title="Ubah Nama Profil" close={() => setShowEditProfile(false)}>
          <form
            onSubmit={e => {
              e.preventDefault()
              handleSaveProfileName()
            }}
          >
            <label>
              Nama Pengguna / Kasir
              <input
                type="text"
                value={tempName}
                onChange={e => setTempName(e.target.value)}
                placeholder="Masukkan nama Anda..."
                autoFocus
                required
              />
            </label>
            <p style={{ fontSize: 11, color: 'var(--muted)', margin: '8px 0 18px' }}>
              Nama ini akan ditampilkan pada profil dan ucapan salam di Dashboard.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setShowEditProfile(false)}
                style={{ padding: '9px 15px', borderRadius: 8, border: '1px solid var(--line)', fontSize: 12, cursor: 'pointer' }}
              >
                Batal
              </button>
              <button type="submit" className="primary" style={{ padding: '9px 18px', fontSize: 12, cursor: 'pointer' }}>
                Simpan
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}

function Dashboard({ products, transactions, movements, loading, setView }) {
  const productMap = useMemo(() => {
    const map = new Map()
    products.forEach(p => {
      map.set(String(p.id), p)
      if (p.kode) map.set(String(p.kode), p)
    })
    return map
  }, [products])

  const low = useMemo(
    () => products.filter(p => (p.stock ?? p.stok ?? 0) <= (p.min ?? p.batasMinimal ?? 0)),
    [products]
  )

  const today = useMemo(() => new Date(), [])
  const yesterday = useMemo(() => {
    const d = new Date()
    d.setDate(d.getDate() - 1)
    return d
  }, [])

  const todayTrx = useMemo(() => {
    return transactions.filter(t => isSameDay(parseDate(t.waktu), today))
  }, [transactions, today])

  const yesterdayTrx = useMemo(() => {
    return transactions.filter(t => isSameDay(parseDate(t.waktu), yesterday))
  }, [transactions, yesterday])

  const todayMetrics = useMemo(() => {
    let omzet = 0
    let hpp = 0
    todayTrx.forEach(t => {
      const m = getTransactionMetrics(t, productMap)
      omzet += m.omzet
      hpp += m.hpp
    })
    const profit = omzet - hpp
    const margin = omzet > 0 ? (profit / omzet) * 100 : 0
    return { omzet, hpp, profit, margin, count: todayTrx.length }
  }, [todayTrx, productMap])

  const yesterdayMetrics = useMemo(() => {
    let omzet = 0
    yesterdayTrx.forEach(t => {
      omzet += Number(t.total || 0)
    })
    return { omzet, count: yesterdayTrx.length }
  }, [yesterdayTrx])

  const omzetDelta = useMemo(() => {
    if (yesterdayMetrics.omzet > 0) {
      const diff = ((todayMetrics.omzet - yesterdayMetrics.omzet) / yesterdayMetrics.omzet) * 100
      return `${diff >= 0 ? '+' : ''}${diff.toFixed(1).replace('.', ',')}% vs kemarin`
    }
    if (todayMetrics.count > 0) return `${todayMetrics.count} transaksi hari ini`
    return '0 transaksi hari ini'
  }, [todayMetrics, yesterdayMetrics])

  const profitDelta = useMemo(() => {
    if (todayMetrics.omzet > 0) {
      return `${todayMetrics.margin.toFixed(1).replace('.', ',')}% margin`
    }
    return '0% margin'
  }, [todayMetrics])

  const trxDelta = useMemo(() => {
    const avg = todayMetrics.count > 0 ? Math.round(todayMetrics.omzet / todayMetrics.count) : 0
    return `Rata-rata ${format(avg)}`
  }, [todayMetrics])

  // 7 hari terakhir untuk grafik batang ringkasan penjualan
  const last7Days = useMemo(() => {
    const dayNames = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab']
    const days = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      d.setHours(0, 0, 0, 0)
      const endD = new Date(d)
      endD.setHours(23, 59, 59, 999)

      const dayTrx = transactions.filter(t => {
        const td = parseDate(t.waktu)
        return td >= d && td <= endD
      })
      const dayOmzet = dayTrx.reduce((s, t) => s + Number(t.total || 0), 0)
      days.push({
        label: dayNames[d.getDay()],
        formattedDate: `${d.getDate()}/${d.getMonth() + 1}`,
        omzet: dayOmzet,
        count: dayTrx.length,
        isToday: i === 0,
      })
    }
    return days
  }, [transactions])

  const total7Days = useMemo(() => last7Days.reduce((s, d) => s + d.omzet, 0), [last7Days])

  const prev7Days = useMemo(() => {
    const start = new Date()
    start.setDate(start.getDate() - 13)
    start.setHours(0, 0, 0, 0)
    const end = new Date()
    end.setDate(end.getDate() - 7)
    end.setHours(23, 59, 59, 999)
    return transactions
      .filter(t => {
        const d = parseDate(t.waktu)
        return d >= start && d <= end
      })
      .reduce((s, t) => s + Number(t.total || 0), 0)
  }, [transactions])

  const max7Days = useMemo(() => {
    const m = Math.max(...last7Days.map(d => d.omzet), 0)
    return m > 0 ? m : 1000000
  }, [last7Days])

  // Produk terlaris dari data transaksi riil
  const topProducts = useMemo(() => {
    const map = new Map()
    transactions.forEach(t => {
      if (Array.isArray(t.items)) {
        t.items.forEach(item => {
          const id = String(item.kode || item.id || item.nama)
          const existing = map.get(id) || {
            id,
            name: item.nama || 'Barang',
            qty: 0,
            revenue: 0,
          }
          existing.qty += Number(item.qty || 0)
          existing.revenue += Number(item.qty || 0) * Number(item.hargaJual || 0)
          map.set(id, existing)
        })
      }
    })
    return Array.from(map.values())
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 4)
      .map(item => {
        const p = productMap.get(item.id) || products.find(prod => (prod.name || prod.nama) === item.name)
        return {
          ...item,
          name: p?.name || p?.nama || item.name,
          color: p?.color || '#f8bd49',
          icon: p?.icon || '🍱',
        }
      })
  }, [transactions, productMap, products])

  // Riwayat aktivitas riil dari transaksi & pergerakan stok
  const activities = useMemo(() => {
    const list = []
    transactions.forEach(t => {
      list.push({
        id: t.id,
        type: 'trx',
        icon: '✓',
        iconClass: 'i0',
        title: `Transaksi #${t.id.slice(-6).toUpperCase()} berhasil`,
        sub: format(t.total || 0),
        date: parseDate(t.waktu),
      })
    })
    movements.forEach(m => {
      const date = parseDate(m.waktu)
      const p = productMap.get(String(m.kode))
      const prodName = m.nama || p?.name || p?.nama || m.kode || 'Barang'
      if (m.jenis === 'masuk') {
        list.push({
          id: m.id || `${m.kode}-${date.getTime()}`,
          type: 'masuk',
          icon: '+',
          iconClass: 'i1',
          title: `Stok masuk: +${m.qty} ${prodName}`,
          sub: m.hargaBeli ? format(m.hargaBeli) + '/unit' : '',
          date,
        })
      } else if (m.jenis === 'opname') {
        const diff = Number(m.qty || 0)
        list.push({
          id: m.id || `${m.kode}-${date.getTime()}`,
          type: 'opname',
          icon: '◉',
          iconClass: 'i2',
          title: `Stok opname: ${prodName}`,
          sub: `Selisih ${diff >= 0 ? '+' : ''}${diff}`,
          date,
        })
      }
    })
    return list.sort((a, b) => b.date.getTime() - a.date.getTime()).slice(0, 4)
  }, [transactions, movements, productMap])

  return (
    <section className="content">
      <div className="stat-grid">
        <Stat
          icon={<WalletCards />}
          label="Omzet hari ini"
          value={format(todayMetrics.omzet)}
          delta={omzetDelta}
        />
        <Stat
          icon={<TrendingUp />}
          label="Keuntungan hari ini"
          value={format(todayMetrics.profit)}
          delta={profitDelta}
          tone="purple"
        />
        <Stat
          icon={<ReceiptText />}
          label="Total transaksi"
          value={`${todayMetrics.count} transaksi`}
          delta={trxDelta}
          tone="blue"
        />
        <Stat
          icon={<PackageSearch />}
          label="Stok menipis"
          value={`${low.length} barang`}
          delta={low.length ? 'Perlu diperiksa' : 'Stok aman'}
          tone="orange"
        />
      </div>
      <div className="dashboard-grid">
        <div className="card revenue">
          <div className="card-head">
            <div>
              <h3>Ringkasan penjualan</h3>
              <p>Performa penjualan 7 hari terakhir</p>
            </div>
            <button>
              Minggu ini <ChevronDown size={15} />
            </button>
          </div>
          <div className="chart">
            <div className="axis">
              <span>{formatCompact(max7Days)}</span>
              <span>{formatCompact(max7Days * 0.66)}</span>
              <span>{formatCompact(max7Days * 0.33)}</span>
              <span>0</span>
            </div>
            <div className="bars">
              {last7Days.map((d, i) => {
                const pct =
                  max7Days > 0 && d.omzet > 0
                    ? Math.max(6, Math.min(100, Math.round((d.omzet / max7Days) * 100)))
                    : 0
                return (
                  <div
                    className="barcol"
                    key={i}
                    title={`${d.label} (${d.formattedDate}): ${format(d.omzet)} (${d.count} transaksi)`}
                  >
                    <div
                      style={{ height: (pct || 4) + '%', opacity: pct ? 1 : 0.25 }}
                      className={d.isToday ? 'hot' : ''}
                    />
                    <small>{d.label}</small>
                  </div>
                )
              })}
            </div>
          </div>
          <div className="chart-total">
            <b>{format(total7Days)}</b>
            <span>
              <ArrowUpRight size={15} />{' '}
              {prev7Days > 0
                ? `${(((total7Days - prev7Days) / prev7Days) * 100).toFixed(1).replace('.', ',')}% dari minggu lalu`
                : `${total7Days > 0 ? 'Total penjualan 7 hari terakhir' : 'Belum ada transaksi minggu ini'}`}
            </span>
          </div>
        </div>
        <div className="card popular">
          <div className="card-head">
            <div>
              <h3>Produk terlaris</h3>
              <p>Berdasarkan jumlah terjual</p>
            </div>
            <button className="link" onClick={() => setView('products')}>Lihat semua</button>
          </div>
          {topProducts.length === 0 ? (
            <div style={{ padding: '35px 10px', textAlign: 'center', color: '#9ba39d', fontSize: 12 }}>
              Belum ada produk terjual
            </div>
          ) : (
            topProducts.map((p, i) => (
              <div className="rank" key={p.id || i}>
                <strong>{i + 1}</strong>
                <div className="prod-icon" style={{ background: p.color }}>
                  {p.icon}
                </div>
                <div>
                  <b>{p.name}</b>
                  <span>{p.qty} terjual</span>
                </div>
                <em>{format(p.revenue)}</em>
              </div>
            ))
          )}
        </div>
      </div>
      <div className="bottom-grid">
        <div className="card low-stock">
          <div className="card-head">
            <div>
              <h3>
                Stok perlu perhatian <span>{low.length}</span>
              </h3>
              <p>Barang di bawah batas minimum</p>
            </div>
            <button className="link" onClick={() => setView('opname')}>
              Kelola stok
            </button>
          </div>
          {low.length === 0 ? (
            <div style={{ padding: '30px 10px', textAlign: 'center', color: '#367d59', fontSize: 12 }}>
              Semua stok barang dalam batas aman ✓
            </div>
          ) : (
            low.slice(0, 4).map(p => (
              <div className="low-item" key={p.id}>
                <div className="prod-icon" style={{ background: p.color }}>
                  {p.icon}
                </div>
                <b>{p.name || p.nama}</b>
                <span>
                  Sisa <strong>{p.stock ?? p.stok ?? 0} {p.unit || 'pcs'}</strong> · Min.{' '}
                  {p.min ?? p.batasMinimal ?? 0}
                </span>
                <AlertTriangle size={19} />
              </div>
            ))
          )}
        </div>
        <div className="card activity">
          <h3>Aktivitas terbaru</h3>
          {activities.length === 0 ? (
            <div style={{ padding: '30px 10px', textAlign: 'center', color: '#9ba39d', fontSize: 12 }}>
              Belum ada aktivitas tercatat
            </div>
          ) : (
            activities.map(x => (
              <div className="activity-row" key={x.id}>
                <div className={'activity-icon ' + x.iconClass}>{x.icon}</div>
                <div>
                  <b>{x.title}</b>
                  <span>{formatRelativeTime(x.date)} {x.sub && `· ${x.sub}`}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  )
}

function Stat({ icon, label, value, delta, tone = '' }) {
  return (
    <div className={'stat ' + tone}>
      <div className="stat-icon">{icon}</div>
      <div>
        <p>{label}</p>
        <h2>{value}</h2>
        <span>
          {tone === 'orange' ? <AlertTriangle size={13} /> : <ArrowUpRight size={13} />} {delta}
        </span>
      </div>
    </div>
  )
}

function POS({ products, cart, search, setSearch, addCart, changeQty, setCart, total, complete, todayTrxCount = 0 }) {
  const [paid, setPaid] = useState(50000),
    [cat, setCat] = useState('Semua')

  const categories = useMemo(() => {
    const list = ['Semua']
    const cats = new Set(products.map(p => p.category || p.kategori).filter(Boolean))
    cats.forEach(c => list.push(c))
    return list
  }, [products])

  const list = products.filter(p => {
    const pCat = p.category || p.kategori
    const pName = (p.name || p.nama || '').toLowerCase()
    const matchesCat = cat === 'Semua' || pCat === cat
    const matchesSearch = pName.includes(search.toLowerCase())
    return matchesCat && matchesSearch
  })

  return (
    <section className="pos-page">
      <div className="catalog">
        <div className="pos-tools">
          <div className="search">
            <Search size={19} />
            <input
              autoFocus
              placeholder="Cari nama atau kode barang..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <button className="scan">⌘ Scan barcode</button>
        </div>
        <div className="chips">
          {categories.map(x => (
            <button onClick={() => setCat(x)} className={cat === x ? 'selected' : ''} key={x}>
              {x}
            </button>
          ))}
        </div>
        <div className="product-grid">
          {list.map(p => (
            <button className="product" onClick={() => addCart(p)} key={p.id}>
              <div className="product-img" style={{ background: p.color }}>
                {p.icon}
                <span>
                  {p.stock ?? p.stok ?? 0} {p.unit || 'pcs'}
                </span>
              </div>
              <b>{p.name || p.nama}</b>
              <small>{p.category || p.kategori}</small>
              <strong>{format(p.sell ?? p.hargaJual ?? 0)}</strong>
            </button>
          ))}
        </div>
      </div>
      <div className="checkout">
        <div className="checkout-head">
          <div>
            <h2>Pesanan baru</h2>
            <p>#{String(todayTrxCount + 1).padStart(4, '0')} · Hari ini</p>
          </div>
          <button onClick={() => setCart([])} className="clear">
            <Trash2 size={17} /> Kosongkan
          </button>
        </div>
        <div className="cart">
          {cart.length === 0 ? (
            <div className="empty">
              <ShoppingBag size={34} />
              <b>Keranjang masih kosong</b>
              <span>Pilih barang dari katalog di samping</span>
            </div>
          ) : (
            cart.map(x => (
              <div className="cart-row" key={x.id}>
                <div className="prod-icon" style={{ background: x.color }}>
                  {x.icon}
                </div>
                <div className="cart-info">
                  <b>{x.name || x.nama}</b>
                  <span>{format(x.sell ?? x.hargaJual ?? 0)}</span>
                  <div className="qty">
                    <button onClick={() => changeQty(x.id, -1)}>
                      <Minus size={14} />
                    </button>
                    <strong>{x.qty}</strong>
                    <button onClick={() => changeQty(x.id, 1)}>
                      <Plus size={14} />
                    </button>
                  </div>
                </div>
                <strong>{format((x.sell ?? x.hargaJual ?? 0) * x.qty)}</strong>
                <button className="remove" onClick={() => setCart(c => c.filter(i => i.id !== x.id))}>
                  <X size={16} />
                </button>
              </div>
            ))
          )}
        </div>
        <div className="payment">
          <div>
            <span>Subtotal</span>
            <b>{format(total)}</b>
          </div>
          <div>
            <span>Diskon</span>
            <b>Rp0</b>
          </div>
          <div className="total">
            <span>Total bayar</span>
            <b>{format(total)}</b>
          </div>
          <label>Uang diterima</label>
          <div className="cash">
            <span>Rp</span>
            <input type="number" value={paid} onChange={e => setPaid(Number(e.target.value))} />
          </div>
          <div className="change">
            <span>Kembalian</span>
            <b>{format(Math.max(0, paid - total))}</b>
          </div>
          <button className="pay" disabled={!cart.length || paid < total} onClick={() => complete(paid)}>
            Bayar & simpan <ChevronRight size={19} />
          </button>
          <p className="shortcut">
            Tekan <kbd>F9</kbd> untuk menyelesaikan pembayaran
          </p>
        </div>
      </div>
    </section>
  )
}

function Products({ products, setProducts, notify }) {
  const [query, setQuery] = useState('')
  const [show, setShow] = useState(false)
  const [form, setForm] = useState({
    name: '',
    category: 'Makanan',
    buy: '',
    sell: '',
    stock: '',
    min: '',
    unit: 'pcs',
  })

  const save = async () => {
    if (!form.name || !form.sell) return notify('Nama dan harga jual wajib diisi')
    const meta = getCategoryMeta(form.category)
    const newId = 'SKU-' + Date.now()
    try {
      await simpanBarangBaru({
        kode: newId,
        nama: form.name,
        kategori: form.category,
        hargaModal: +form.buy,
        hargaJual: +form.sell,
        batasMinimal: +form.min,
        stok: +form.stock,
      })
    } catch (err) {
      console.error('Gagal menyimpan barang:', err)
      return notify('Gagal menyimpan barang: ' + err.message)
    }
    setProducts([
      {
        ...form,
        id: newId,
        kode: newId,
        nama: form.name,
        kategori: form.category,
        buy: +form.buy,
        sell: +form.sell,
        stock: +form.stock,
        min: +form.min,
        hargaModal: +form.buy,
        hargaJual: +form.sell,
        stok: +form.stock,
        batasMinimal: +form.min,
        color: meta.color,
        icon: meta.icon,
      },
      ...products,
    ])
    setShow(false)
    notify('Barang baru berhasil ditambahkan')
  }

  return (
    <section className="content">
      <div className="page-actions">
        <div className="search wide">
          <Search size={19} />
          <input placeholder="Cari nama atau kode barang" value={query} onChange={e => setQuery(e.target.value)} />
        </div>
        <button className="primary" onClick={() => setShow(true)}>
          <Plus size={18} /> Tambah barang
        </button>
      </div>
      <div className="card table-card">
        <table>
          <thead>
            <tr>
              <th>BARANG</th>
              <th>KATEGORI</th>
              <th>HARGA MODAL</th>
              <th>HARGA JUAL</th>
              <th>STOK</th>
              <th>STATUS</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {products
              .filter(p => (p.name || p.nama || '').toLowerCase().includes(query.toLowerCase()))
              .map(p => {
                const stock = p.stock ?? p.stok ?? 0
                const min = p.min ?? p.batasMinimal ?? 0
                return (
                  <tr key={p.id}>
                    <td>
                      <div className="table-prod">
                        <div className="prod-icon" style={{ background: p.color }}>
                          {p.icon}
                        </div>
                        <div>
                          <b>{p.name || p.nama}</b>
                          <span>
                            {p.kode || p.id} · {p.unit || 'pcs'}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className="tag">{p.category || p.kategori}</span>
                    </td>
                    <td>{format(p.buy ?? p.hargaModal ?? 0)}</td>
                    <td>
                      <b>{format(p.sell ?? p.hargaJual ?? 0)}</b>
                    </td>
                    <td>
                      <b>{stock}</b> / min {min}
                    </td>
                    <td>
                      <span className={stock <= min ? 'status low' : 'status'}>
                        {stock <= min ? 'Menipis' : 'Tersedia'}
                      </span>
                    </td>
                    <td>•••</td>
                  </tr>
                )
              })}
          </tbody>
        </table>
      </div>
      {show && (
        <Modal title="Tambah data barang" close={() => setShow(false)}>
          <div className="form-grid">
            {[
              ['name', 'Nama barang'],
              ['buy', 'Harga beli'],
              ['sell', 'Harga jual'],
              ['stock', 'Stok awal'],
              ['min', 'Batas minimum'],
              ['unit', 'Satuan'],
            ].map(([key, label]) => (
              <label key={key}>
                {label}
                <input
                  type={['buy', 'sell', 'stock', 'min'].includes(key) ? 'number' : 'text'}
                  value={form[key]}
                  onChange={e => setForm({ ...form, [key]: e.target.value })}
                />
              </label>
            ))}
            <label>
              Jenis barang
              <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
                {['Makanan', 'Minuman', 'Snack', 'Gorengan', 'Jajanan Pasar', 'Beku', 'Olahan', 'Lainnya'].map(x => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>
          </div>
          <button className="primary save" onClick={save}>
            Simpan barang
          </button>
        </Modal>
      )}
    </section>
  )
}

function Incoming({ products, setProducts, notify }) {
  const [selected, setSelected] = useState(products[0]?.id || '')
  const [qty, setQty] = useState(12)
  const [hargaBeli, setHargaBeli] = useState('')
  const p = products.find(x => x.id === selected || x.id === +selected) || products[0] || {}

  const save = async () => {
    if (!p.id) return notify('Pilih barang terlebih dahulu')
    if (!(Number(qty) > 0)) return notify('Jumlah masuk harus lebih dari 0')
    try {
      const harga = hargaBeli === '' ? p.buy ?? p.hargaModal ?? 0 : Number(hargaBeli)
      await simpanBarangMasuk(p.id, Number(qty), harga, p.name || p.nama || '')
    } catch (err) {
      console.error('Gagal menyimpan barang masuk:', err)
      return notify('Gagal menyimpan barang masuk: ' + err.message)
    }
    setProducts(ps =>
      ps.map(x =>
        x.id === p.id
          ? {
              ...x,
              stock: (x.stock ?? x.stok ?? 0) + Number(qty),
              stok: (x.stok ?? x.stock ?? 0) + Number(qty),
            }
          : x
      )
    )
    notify(`${qty} ${p.unit || 'pcs'} ${p.name || p.nama} ditambahkan ke stok`)
  }

  return (
    <section className="content narrow">
      <div className="feature-title">
        <div className="feature-icon green">
          <PackagePlus />
        </div>
        <div>
          <h2>Catat barang masuk</h2>
          <p>Stok akan bertambah otomatis setelah disimpan.</p>
        </div>
      </div>
      <div className="card form-card">
        <label>
          Barang
          <select value={selected || p.id || ''} onChange={e => {
              setSelected(e.target.value)
              setHargaBeli('')
            }}>
            {products.map(x => (
              <option value={x.id} key={x.id}>
                {x.name || x.nama} — stok {x.stock ?? x.stok ?? 0} {x.unit || 'pcs'}
              </option>
            ))}
          </select>
        </label>
        <div className="form-grid">
          <label>
            Jumlah masuk
            <input type="number" value={qty} onChange={e => setQty(e.target.value)} />
          </label>
          <label>
            Harga beli per unit
            <input
              type="number"
              value={hargaBeli === '' ? p.buy ?? p.hargaModal ?? 0 : hargaBeli}
              onChange={e => setHargaBeli(e.target.value)}
            />
          </label>
          <label>
            Supplier / sumber
            <input placeholder="Contoh: Pasar Antapani" />
          </label>
          <label>
            Tanggal penerimaan
            <input type="date" defaultValue={new Date().toISOString().slice(0, 10)} />
          </label>
        </div>
        <label>
          Catatan
          <input placeholder="Nomor nota atau keterangan lain" />
        </label>
        <button className="primary save" onClick={save}>
          <PackagePlus size={18} /> Simpan barang masuk
        </button>
      </div>
    </section>
  )
}

function Opname({ products, setProducts, notify }) {
  const [physical, setPhysical] = useState({})
  const save = async () => {
    const daftar = products
      .filter(p => physical[p.id] !== undefined && physical[p.id] !== '')
      .map(p => ({
        kode: p.id,
        nama: p.name || p.nama || '',
        stokSistem: p.stock ?? p.stok ?? 0,
        stokFisik: Number(physical[p.id]),
      }))
    if (!daftar.length) return notify('Isi stok fisik minimal satu barang')
    try {
      await simpanOpname(daftar)
    } catch (err) {
      console.error('Gagal menyimpan opname:', err)
      return notify('Gagal menyimpan opname: ' + err.message)
    }
    setProducts(ps =>
      ps.map(x => {
        if (physical[x.id] === undefined || physical[x.id] === '') return x
        const val = Number(physical[x.id])
        return { ...x, stock: val, stok: val }
      })
    )
    notify('Stok opname berhasil disimpan')
  }

  return (
    <section className="content">
      <div className="feature-title">
        <div className="feature-icon purple">
          <ClipboardCheck />
        </div>
        <div>
          <h2>Stok opname</h2>
          <p>Masukkan jumlah fisik untuk mencocokkan stok di sistem.</p>
        </div>
        <button className="primary right" onClick={save}>
          <Check size={18} /> Selesaikan opname
        </button>
      </div>
      <div className="card table-card">
        <table>
          <thead>
            <tr>
              <th>BARANG</th>
              <th>STOK SISTEM</th>
              <th>STOK FISIK</th>
              <th>SELISIH</th>
              <th>KETERANGAN</th>
            </tr>
          </thead>
          <tbody>
            {products.map(p => {
              const stock = p.stock ?? p.stok ?? 0
              const actual = physical[p.id]
              const diff = actual === undefined ? null : Number(actual) - stock
              return (
                <tr key={p.id}>
                  <td>
                    <div className="table-prod">
                      <div className="prod-icon" style={{ background: p.color }}>
                        {p.icon}
                      </div>
                      <b>{p.name || p.nama}</b>
                    </div>
                  </td>
                  <td>
                    <b>
                      {stock} {p.unit || 'pcs'}
                    </b>
                  </td>
                  <td>
                    <input
                      className="stock-input"
                      type="number"
                      placeholder={stock}
                      value={actual ?? ''}
                      onChange={e => setPhysical({ ...physical, [p.id]: e.target.value })}
                    />
                  </td>
                  <td className={diff < 0 ? 'negative' : diff > 0 ? 'positive' : ''}>
                    {diff === null ? '—' : diff > 0 ? `+${diff}` : diff} {diff !== null && (p.unit || 'pcs')}
                  </td>
                  <td>{diff === null ? 'Belum dihitung' : diff === 0 ? 'Sesuai' : 'Perlu penyesuaian'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function Reports({ products, transactions, loading, notify }) {
  const [period, setPeriod] = useState('bulanan')
  const [selectedTrx, setSelectedTrx] = useState(null)

  const productMap = useMemo(() => {
    const map = new Map()
    products.forEach(p => {
      map.set(String(p.id), p)
      if (p.kode) map.set(String(p.kode), p)
    })
    return map
  }, [products])

  const { filteredTrx, periodLabel } = useMemo(() => {
    const now = new Date()
    let start = new Date(now)
    let end = new Date(now)
    let label = ''

    if (period === 'harian') {
      start.setHours(0, 0, 0, 0)
      end.setHours(23, 59, 59, 999)
      label = new Intl.DateTimeFormat('id-ID', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }).format(now)
    } else if (period === 'mingguan') {
      start.setDate(now.getDate() - 6)
      start.setHours(0, 0, 0, 0)
      end.setHours(23, 59, 59, 999)
      const startStr = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short' }).format(start)
      const endStr = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }).format(end)
      label = `${startStr} – ${endStr}`
    } else if (period === 'bulanan') {
      start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0)
      end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)
      label = new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric' }).format(now)
    } else if (period === 'tahunan') {
      start = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0)
      end = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999)
      label = `Tahun ${now.getFullYear()}`
    } else {
      // 'semua'
      start = new Date(0)
      end = new Date(now.getTime() + 86400000 * 365)
      label = 'Semua Transaksi'
    }

    const list = transactions.filter(t => {
      const d = parseDate(t.waktu)
      return d >= start && d <= end
    })

    return { filteredTrx: list, periodLabel: label, start, end }
  }, [transactions, period])

  const metrics = useMemo(() => {
    let omzet = 0
    let hpp = 0
    let totalItemsSold = 0

    filteredTrx.forEach(t => {
      const m = getTransactionMetrics(t, productMap)
      omzet += m.omzet
      hpp += m.hpp
      totalItemsSold += m.units
    })

    const profit = omzet - hpp
    const hppPct = omzet > 0 ? (hpp / omzet) * 100 : 0
    const marginPct = omzet > 0 ? (profit / omzet) * 100 : 0
    const avgTrx = filteredTrx.length > 0 ? Math.round(omzet / filteredTrx.length) : 0

    return {
      omzet,
      hpp,
      profit,
      hppPct: hppPct.toFixed(1).replace('.', ','),
      marginPct: marginPct.toFixed(1).replace('.', ','),
      avgTrx,
      count: filteredTrx.length,
      totalItemsSold,
    }
  }, [filteredTrx, productMap])

  // Chart data buckets
  const chartData = useMemo(() => {
    if (period === 'harian') {
      const buckets = [
        { label: '06:00', shortLabel: '06:00', startH: 6, endH: 9, omzet: 0, profit: 0 },
        { label: '09:00', shortLabel: '09:00', startH: 9, endH: 12, omzet: 0, profit: 0 },
        { label: '12:00', shortLabel: '12:00', startH: 12, endH: 15, omzet: 0, profit: 0 },
        { label: '15:00', shortLabel: '15:00', startH: 15, endH: 18, omzet: 0, profit: 0 },
        { label: '18:00', shortLabel: '18:00', startH: 18, endH: 21, omzet: 0, profit: 0 },
        { label: '21:00', shortLabel: '21:00', startH: 21, endH: 24, omzet: 0, profit: 0 },
      ]
      filteredTrx.forEach(t => {
        const d = parseDate(t.waktu)
        const h = d.getHours()
        const m = getTransactionMetrics(t, productMap)
        const bucket = buckets.find(b => h >= b.startH && h < b.endH) || buckets[buckets.length - 1]
        bucket.omzet += m.omzet
        bucket.profit += m.profit
      })
      return buckets
    } else if (period === 'mingguan') {
      const dayNames = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab']
      const buckets = []
      for (let i = 6; i >= 0; i--) {
        const d = new Date()
        d.setDate(d.getDate() - i)
        d.setHours(0, 0, 0, 0)
        const endD = new Date(d)
        endD.setHours(23, 59, 59, 999)
        const dayTrx = filteredTrx.filter(t => {
          const td = parseDate(t.waktu)
          return td >= d && td <= endD
        })
        let omzet = 0,
          profit = 0
        dayTrx.forEach(t => {
          const m = getTransactionMetrics(t, productMap)
          omzet += m.omzet
          profit += m.profit
        })
        buckets.push({
          label: `${dayNames[d.getDay()]} (${d.getDate()}/${d.getMonth() + 1})`,
          shortLabel: dayNames[d.getDay()],
          omzet,
          profit,
        })
      }
      return buckets
    } else if (period === 'bulanan') {
      const now = new Date()
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
      const buckets = [
        { label: 'Tgl 1-5', shortLabel: '1-5', start: 1, end: 5, omzet: 0, profit: 0 },
        { label: 'Tgl 6-10', shortLabel: '6-10', start: 6, end: 10, omzet: 0, profit: 0 },
        { label: 'Tgl 11-15', shortLabel: '11-15', start: 11, end: 15, omzet: 0, profit: 0 },
        { label: 'Tgl 16-20', shortLabel: '16-20', start: 16, end: 20, omzet: 0, profit: 0 },
        { label: 'Tgl 21-25', shortLabel: '21-25', start: 21, end: 25, omzet: 0, profit: 0 },
        { label: `Tgl 26-${lastDay}`, shortLabel: `26-${lastDay}`, start: 26, end: lastDay, omzet: 0, profit: 0 },
      ]
      filteredTrx.forEach(t => {
        const d = parseDate(t.waktu)
        const dayNum = d.getDate()
        const m = getTransactionMetrics(t, productMap)
        const b = buckets.find(b => dayNum >= b.start && dayNum <= b.end) || buckets[buckets.length - 1]
        b.omzet += m.omzet
        b.profit += m.profit
      })
      return buckets
    } else if (period === 'tahunan') {
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']
      const buckets = monthNames.map((name, idx) => ({
        label: name,
        shortLabel: name,
        month: idx,
        omzet: 0,
        profit: 0,
      }))
      filteredTrx.forEach(t => {
        const d = parseDate(t.waktu)
        const mon = d.getMonth()
        const m = getTransactionMetrics(t, productMap)
        if (buckets[mon]) {
          buckets[mon].omzet += m.omzet
          buckets[mon].profit += m.profit
        }
      })
      return buckets
    } else {
      // 'semua'
      const map = new Map()
      filteredTrx.forEach(t => {
        const d = parseDate(t.waktu)
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
        const m = getTransactionMetrics(t, productMap)
        const cur = map.get(key) || {
          label: new Intl.DateTimeFormat('id-ID', { month: 'short', year: '2-digit' }).format(d),
          shortLabel: new Intl.DateTimeFormat('id-ID', { month: 'short' }).format(d),
          omzet: 0,
          profit: 0,
          time: d.getTime(),
        }
        cur.omzet += m.omzet
        cur.profit += m.profit
        map.set(key, cur)
      })
      const sorted = Array.from(map.values()).sort((a, b) => a.time - b.time)
      return sorted.length ? sorted : [{ label: 'Belum ada', shortLabel: '-', omzet: 0, profit: 0 }]
    }
  }, [filteredTrx, period, productMap])

  // SVG chart paths
  const { omzetPath, profitPath, chartPoints, maxChartVal } = useMemo(() => {
    const points = chartData || []
    const maxVal = Math.max(...points.map(p => Math.max(p.omzet, p.profit)), 0)
    const ceiling = maxVal > 0 ? maxVal * 1.15 : 1000000

    const width = 600
    const height = 180
    const paddingX = 40
    const paddingY = 25
    const usableW = width - paddingX * 2
    const usableH = height - paddingY * 2

    const coords = points.map((p, i) => {
      const x = points.length > 1 ? paddingX + (i / (points.length - 1)) * usableW : width / 2
      const yOmzet = usableH + paddingY - (p.omzet / ceiling) * usableH
      const yProfit = usableH + paddingY - (p.profit / ceiling) * usableH
      return {
        ...p,
        x,
        yOmzet,
        yProfit,
      }
    })

    const makePath = key => {
      if (!coords.length) return ''
      if (coords.length === 1) return `M ${coords[0].x - 30} ${coords[0][key]} L ${coords[0].x + 30} ${coords[0][key]}`
      return coords.reduce((acc, pt, i) => {
        if (i === 0) return `M ${pt.x} ${pt[key]}`
        const prev = coords[i - 1]
        const cpX1 = prev.x + (pt.x - prev.x) / 2
        const cpY1 = prev[key]
        const cpX2 = prev.x + (pt.x - prev.x) / 2
        const cpY2 = pt[key]
        return `${acc} C ${cpX1} ${cpY1}, ${cpX2} ${cpY2}, ${pt.x} ${pt[key]}`
      }, '')
    }

    return {
      omzetPath: makePath('yOmzet'),
      profitPath: makePath('yProfit'),
      chartPoints: coords,
      maxChartVal: ceiling,
    }
  }, [chartData])

  const downloadCSV = () => {
    if (!filteredTrx.length) {
      if (notify) notify('Tidak ada data transaksi pada periode ini untuk diunduh')
      return
    }

    const csvRows = []
    csvRows.push([
      'No',
      'No. Transaksi',
      'Waktu',
      'Kasir',
      'Metode',
      'Macam Barang',
      'Total Unit',
      'Rincian Barang',
      'Total Omzet (Rp)',
      'Total HPP (Rp)',
      'Keuntungan Kotor (Rp)',
    ])

    filteredTrx.forEach((t, idx) => {
      const d = parseDate(t.waktu)
      const dateFormatted = new Intl.DateTimeFormat('id-ID', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }).format(d)
      const m = getTransactionMetrics(t, productMap)
      const itemsDetail = (t.items || [])
        .map(i => `${i.nama || i.kode} (${i.qty}x @${i.hargaJual})`)
        .join('; ')

      csvRows.push([
        idx + 1,
        `#${t.id.slice(-6).toUpperCase()}`,
        `"${dateFormatted}"`,
        `"${t.kasir || 'Operator'}"`,
        `"${t.metode || 'tunai'}"`,
        m.kinds,
        m.units,
        `"${itemsDetail.replace(/"/g, '""')}"`,
        m.omzet,
        m.hpp,
        m.profit,
      ])
    })

    csvRows.push([])
    csvRows.push([
      '"TOTAL"',
      '""',
      '""',
      '""',
      '""',
      '""',
      metrics.totalItemsSold,
      '""',
      metrics.omzet,
      metrics.hpp,
      metrics.profit,
    ])

    const csvContent = csvRows.map(r => r.join(',')).join('\r\n')
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.setAttribute('href', url)
    link.setAttribute('download', `laporan-keuangan-biber-${period}-${new Date().toISOString().slice(0, 10)}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
    if (notify) notify('Laporan transaksi berhasil diunduh (CSV)')
  }

  return (
    <section className="content">
      <div className="report-top">
        <div>
          <p className="eyebrow">PERIODE LAPORAN</p>
          <h2>{periodLabel}</h2>
        </div>
        <div className="period">
          <button className={period === 'harian' ? 'selected' : ''} onClick={() => setPeriod('harian')}>
            Harian
          </button>
          <button className={period === 'mingguan' ? 'selected' : ''} onClick={() => setPeriod('mingguan')}>
            Mingguan
          </button>
          <button className={period === 'bulanan' ? 'selected' : ''} onClick={() => setPeriod('bulanan')}>
            Bulanan
          </button>
          <button className={period === 'tahunan' ? 'selected' : ''} onClick={() => setPeriod('tahunan')}>
            Tahunan
          </button>
          <button className={period === 'semua' ? 'selected' : ''} onClick={() => setPeriod('semua')}>
            Semua
          </button>
        </div>
      </div>
      <div className="stat-grid">
        <Stat
          icon={<WalletCards />}
          label="Total omzet"
          value={format(metrics.omzet)}
          delta={`${metrics.count} transaksi`}
        />
        <Stat
          icon={<PackageSearch />}
          label="Harga pokok penjualan"
          value={format(metrics.hpp)}
          delta={`${metrics.hppPct}% dari omzet`}
          tone="blue"
        />
        <Stat
          icon={<TrendingUp />}
          label="Keuntungan kotor"
          value={format(metrics.profit)}
          delta={`${metrics.marginPct}% margin`}
          tone="purple"
        />
        <Stat
          icon={<ReceiptText />}
          label="Transaksi"
          value={String(metrics.count)}
          delta={`Rata-rata ${format(metrics.avgTrx)}`}
          tone="orange"
        />
      </div>
      <div className="dashboard-grid report-grid">
        <div className="card revenue">
          <div className="card-head">
            <div>
              <h3>Omzet & keuntungan</h3>
              <p>Perbandingan penjualan vs keuntungan kotor</p>
            </div>
            <div className="legend">
              <span />
              <b>Omzet</b>
              <span className="profit" />
              <b>Keuntungan</b>
            </div>
          </div>
          <div className="line-chart">
            <svg viewBox="0 0 600 200" preserveAspectRatio="none">
              {[0.25, 0.5, 0.75].map(ratio => (
                <line
                  key={ratio}
                  x1="30"
                  y1={25 + (180 - 50) * ratio}
                  x2="570"
                  y2={25 + (180 - 50) * ratio}
                  stroke="#eef0ed"
                  strokeWidth="1"
                  strokeDasharray="4 4"
                />
              ))}
              <path d={omzetPath} fill="none" stroke="#ed6b45" strokeWidth="3.5" strokeLinecap="round" />
              <path d={profitPath} fill="none" stroke="#5f9c78" strokeWidth="3.5" strokeLinecap="round" />
              {chartPoints.map((pt, i) => (
                <g key={i}>
                  <circle cx={pt.x} cy={pt.yOmzet} r="4" fill="#ed6b45">
                    <title>{`${pt.label}: Omzet ${format(pt.omzet)}`}</title>
                  </circle>
                  <circle cx={pt.x} cy={pt.yProfit} r="4" fill="#5f9c78">
                    <title>{`${pt.label}: Keuntungan ${format(pt.profit)}`}</title>
                  </circle>
                  <text x={pt.x} y="195" textAnchor="middle" fontSize="10" fill="#88928b">
                    {pt.shortLabel || pt.label}
                  </text>
                </g>
              ))}
            </svg>
          </div>
        </div>
        <div className="card finance">
          <h3>Rincian keuangan</h3>
          {[
            ['Penjualan kotor', format(metrics.omzet)],
            ['Diskon transaksi', 'Rp 0'],
            ['Harga pokok penjualan', `(${format(metrics.hpp)})`],
            ['Keuntungan kotor', format(metrics.profit)],
            ['Margin keuntungan', `${metrics.marginPct}%`],
            ['Rata-rata transaksi', format(metrics.avgTrx)],
            ['Total barang terjual', `${metrics.totalItemsSold} unit`],
          ].map((r, i) => (
            <div className={i === 3 ? 'finance-total' : ''} key={r[0]}>
              <span>{r[0]}</span>
              <b>{r[1]}</b>
            </div>
          ))}
        </div>
      </div>
      <div className="card table-card">
        <div className="card-head">
          <div>
            <h3>Transaksi terbaru</h3>
            <p>Rekap penjualan periode terpilih ({filteredTrx.length} transaksi)</p>
          </div>
          <button className="link" onClick={downloadCSV}>
            <Download size={15} style={{ verticalAlign: 'middle', marginRight: 4 }} /> Unduh laporan (CSV)
          </button>
        </div>
        <table>
          <thead>
            <tr>
              <th>NO. TRANSAKSI</th>
              <th>WAKTU</th>
              <th>KASIR</th>
              <th>ITEM</th>
              <th>METODE</th>
              <th>TOTAL</th>
              <th>AKSI</th>
            </tr>
          </thead>
          <tbody>
            {filteredTrx.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', padding: 28, color: '#999' }}>
                  Belum ada transaksi pada periode {periodLabel}
                </td>
              </tr>
            ) : (
              filteredTrx.map(t => {
                const date = parseDate(t.waktu)
                const dateStr = new Intl.DateTimeFormat('id-ID', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                }).format(date)
                const m = getTransactionMetrics(t, productMap)
                return (
                  <tr key={t.id}>
                    <td>
                      <b>#{t.id.slice(-6).toUpperCase()}</b>
                    </td>
                    <td>{dateStr}</td>
                    <td>
                      <span className="tag">{t.kasir || 'Operator'}</span>
                    </td>
                    <td>
                      {m.kinds} macam ({m.units} unit)
                    </td>
                    <td>
                      <span className="status">{t.metode || 'tunai'}</span>
                    </td>
                    <td>
                      <b>{format(t.total || 0)}</b>
                    </td>
                    <td>
                      <button
                        className="link"
                        style={{ fontSize: 11, padding: '4px 8px', cursor: 'pointer' }}
                        onClick={() => setSelectedTrx(t)}
                      >
                        Detail
                      </button>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {selectedTrx && (
        <Modal
          title={`Detail Transaksi #${selectedTrx.id.slice(-6).toUpperCase()}`}
          close={() => setSelectedTrx(null)}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              marginBottom: 16,
              fontSize: 12,
              color: 'var(--muted)',
              borderBottom: '1px solid var(--line)',
              paddingBottom: 12,
            }}
          >
            <div>
              <div>
                <b>Waktu: </b>
                {new Intl.DateTimeFormat('id-ID', {
                  dateStyle: 'full',
                  timeStyle: 'medium',
                }).format(parseDate(selectedTrx.waktu))}
              </div>
              <div>
                <b>Kasir: </b>
                {selectedTrx.kasir || 'Operator'}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div>
                <b>Metode: </b>
                <span className="status">{selectedTrx.metode || 'tunai'}</span>
              </div>
              <div>
                <b>ID: </b>
                <small>{selectedTrx.id}</small>
              </div>
            </div>
          </div>
          <div style={{ maxHeight: 220, overflowY: 'auto', marginBottom: 16 }}>
            <table style={{ width: '100%', fontSize: 12 }}>
              <thead>
                <tr>
                  <th>BARANG</th>
                  <th style={{ textAlign: 'center' }}>QTY</th>
                  <th style={{ textAlign: 'right' }}>HARGA</th>
                  <th style={{ textAlign: 'right' }}>SUBTOTAL</th>
                </tr>
              </thead>
              <tbody>
                {(selectedTrx.items || []).map((it, i) => (
                  <tr key={i}>
                    <td>
                      <b>{it.nama || it.kode}</b>
                    </td>
                    <td style={{ textAlign: 'center' }}>{it.qty}</td>
                    <td style={{ textAlign: 'right' }}>{format(it.hargaJual || 0)}</td>
                    <td style={{ textAlign: 'right' }}>
                      <b>{format((it.hargaJual || 0) * (it.qty || 1))}</b>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="finance" style={{ background: '#fafbf9', padding: '12px 16px', borderRadius: 10 }}>
            {(() => {
              const m = getTransactionMetrics(selectedTrx, productMap)
              return (
                <>
                  <div>
                    <span>Total Belanja</span>
                    <b>{format(m.omzet)}</b>
                  </div>
                  <div>
                    <span>Harga Pokok (HPP)</span>
                    <span>({format(m.hpp)})</span>
                  </div>
                  <div>
                    <span>Keuntungan Kotor</span>
                    <b style={{ color: 'var(--green)' }}>{format(m.profit)}</b>
                  </div>
                  <div>
                    <span>Uang Diterima</span>
                    <span>{format(selectedTrx.bayar ?? selectedTrx.total)}</span>
                  </div>
                  <div className="finance-total">
                    <span>Kembalian</span>
                    <b>{format(selectedTrx.kembalian ?? 0)}</b>
                  </div>
                </>
              )
            })()}
          </div>
        </Modal>
      )}
    </section>
  )
}

function Modal({ title, close, children }) {
  return (
    <div className="modal-back">
      <div className="modal">
        <button className="modal-x" onClick={close}>
          <X />
        </button>
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  )
}

createRoot(document.getElementById('root')).render(<App />)