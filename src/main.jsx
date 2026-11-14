import { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { collection, getDocs, orderBy, query } from 'firebase/firestore'
import { db } from './firebase'
import { getAuth, onAuthStateChanged, signOut, updateProfile } from 'firebase/auth'
import Login from './Login'
import { simpanPenjualan, simpanBarangMasuk, simpanOpname, simpanBarangBaru } from './stokService'
import {
  useRingkasan,
  useTransaksiTerbaru,
  awalPeriode,
  kunciTanggal,
  jumlahRingkasan,
  kelompokRingkasan,
  produkTerlaris,
  ringkas,
  formatWaktu,
  waktuRelatif,
  kodeTrx,
  unduhCsv,
} from './laporan'
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
} from 'lucide-react'
import './style.css'

const format = n =>
  new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(n)

// Sapaan sesuai jam: pagi (00-10), siang (11-14), sore (15-17), malam (18-23)
const sapaan = d => {
  const h = d.getHours()
  return h < 11 ? 'Selamat pagi' : h < 15 ? 'Selamat siang' : h < 18 ? 'Selamat sore' : 'Selamat malam'
}

// "Rani Aprillia" -> "RA"
const inisial = nama =>
  nama
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0].toUpperCase())
    .join('') || '?'

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
    [now, setNow] = useState(new Date()),
    [profilNama, setProfilNama] = useState(''),
    [editProfil, setEditProfil] = useState(false)

  useEffect(() => {
    const unsub = onAuthStateChanged(getAuth(), u => {
      setUser(u)
      setProfilNama(u?.displayName || '')
      setAuthReady(true)
    })
    return unsub
  }, [])

  // Jam berjalan: sapaan dan tanggal di header ikut berubah tiap menit
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60000)
    return () => clearInterval(t)
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
      await simpanPenjualan(cart, paid)
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

  if (!authReady) return <div style={{ padding: 24 }}>Memuat...</div>
  if (!user) return <Login />

  const namaTampil = profilNama || user.email?.split('@')[0] || 'Pengguna'

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
          <button onClick={() => setEditProfil(true)}>
            <Settings size={19} /> Pengaturan
          </button>
          <button onClick={() => signOut(getAuth())}>
            <LogOut size={19} /> Keluar
          </button>
          <div className="profile" style={{ cursor: 'pointer' }} onClick={() => setEditProfil(true)}>
            <div className="avatar">{inisial(namaTampil)}</div>
            <div>
              <b>{namaTampil}</b>
              <span>{role}</span>
            </div>
            <ChevronDown size={15} />
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
                ? `${sapaan(now)}, ${namaTampil.split(' ')[0]}! 👋`
                : nav.find(x => x.id === view)?.text}
            </h1>
          </div>
          <div className="header-actions">
            <button className="date">
              {now.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}{' '}
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
        {loading && <div style={{ padding: '16px 28px', color: '#666', fontSize: 14 }}>Memuat data produk...</div>}
        {view === 'dashboard' && <Dashboard products={products} setView={setView} />}
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
          />
        )}
        {view === 'products' && <Products products={products} setProducts={setProducts} notify={notify} />}
        {view === 'incoming' && <Incoming products={products} setProducts={setProducts} notify={notify} />}
        {view === 'opname' && <Opname products={products} setProducts={setProducts} notify={notify} />}
        {view === 'reports' && <Reports />}
      </main>
      {editProfil && (
        <ProfilModal
          namaAwal={namaTampil}
          email={user.email || ''}
          close={() => setEditProfil(false)}
          onSaved={setProfilNama}
          notify={notify}
        />
      )}
      {toast && (
        <div className="toast" style={{ zIndex: 9999 }}>
          <Check size={18} />
          {toast}
        </div>
      )}
    </div>
  )
}

const dibanding = (a, b) =>
  b > 0
    ? `${a >= b ? '+' : '−'}${Math.abs(((a - b) / b) * 100).toFixed(1).replace('.', ',')}% dari kemarin`
    : 'Belum ada data kemarin'
const persen = (a, b) => (b > 0 ? ((a / b) * 100).toFixed(1).replace('.', ',') : '0')

function Dashboard({ products, setView }) {
  const dari = useMemo(() => awalPeriode('mingguan'), [])
  const ring = useRingkasan(dari)
  const terbaru = useTransaksiTerbaru(dari, 5)
  const low = products.filter(p => (p.stock ?? p.stok ?? 0) <= (p.min ?? p.batasMinimal ?? 0))

  const harian = useMemo(() => kelompokRingkasan(ring.data, 'mingguan', dari), [ring.data, dari])
  const hariIni = harian[harian.length - 1] || { omzet: 0, laba: 0 }
  const kemarin = harian[harian.length - 2] || { omzet: 0, laba: 0 }
  const dok = ring.data.find(d => d.tanggal === kunciTanggal(new Date())) || {}
  const terlaris = useMemo(() => produkTerlaris(ring.data, 4), [ring.data])

  const total7 = harian.reduce((s, h) => s + h.omzet, 0)
  const skala = Math.max(...harian.map(h => h.omzet), 0) || 300000
  const namaHari = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab']

  return (
    <section className="content">
      {ring.error && <p style={{ color: '#c0392b' }}>Gagal memuat data laporan: {ring.error}</p>}
      <div className="stat-grid">
        <Stat icon={<WalletCards />} label="Omzet hari ini" value={format(hariIni.omzet)} delta={dibanding(hariIni.omzet, kemarin.omzet)} />
        <Stat
          icon={<TrendingUp />}
          label="Keuntungan hari ini"
          value={format(hariIni.laba)}
          delta={dibanding(hariIni.laba, kemarin.laba)}
          tone="purple"
        />
        <Stat
          icon={<ReceiptText />}
          label="Total transaksi"
          value={`${dok.transaksi || 0} transaksi`}
          delta={`${dok.item || 0} item terjual`}
          tone="blue"
        />
        <Stat
          icon={<PackageSearch />}
          label="Stok menipis"
          value={`${low.length} barang`}
          delta="Perlu diperiksa"
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
              {[skala, (skala * 2) / 3, skala / 3, 0].map((v, i) => (
                <span key={i}>{ringkas(v)}</span>
              ))}
            </div>
            <div className="bars">
              {harian.map((h, i) => (
                <div className="barcol" key={i} title={`${h.label}: ${format(h.omzet)}`}>
                  <div
                    style={{ height: Math.max((h.omzet / skala) * 100, h.omzet > 0 ? 3 : 0) + '%' }}
                    className={i === harian.length - 1 ? 'hot' : ''}
                  />
                  <small>{namaHari[h.tgl.getDay()]}</small>
                </div>
              ))}
            </div>
          </div>
          <div className="chart-total">
            <b>{format(total7)}</b>
            <span>Total 7 hari terakhir</span>
          </div>
        </div>
        <div className="card popular">
          <div className="card-head">
            <div>
              <h3>Produk terlaris</h3>
              <p>Berdasarkan jumlah terjual (7 hari)</p>
            </div>
          </div>
          {terlaris.length === 0 && <p style={{ color: '#999', padding: 12 }}>Belum ada penjualan</p>}
          {terlaris.map((x, i) => {
            const p = products.find(q => q.id === x.kode)
            return (
              <div className="rank" key={x.kode}>
                <strong>{i + 1}</strong>
                <div className="prod-icon" style={{ background: p?.color || '#d68c55' }}>
                  {p?.icon || '🍱'}
                </div>
                <div>
                  <b>{x.nama}</b>
                  <span>{x.qty} terjual</span>
                </div>
                <em>{format(x.omzet)}</em>
              </div>
            )
          })}
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
          {low.map(p => (
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
          ))}
        </div>
        <div className="card activity">
          <h3>Aktivitas terbaru</h3>
          {terbaru.data.length === 0 && <p style={{ color: '#999' }}>Belum ada aktivitas</p>}
          {terbaru.data.slice(0, 3).map(t => (
            <div className="activity-row" key={t.id}>
              <div className="activity-icon i0">✓</div>
              <div>
                <b>
                  Transaksi {kodeTrx(t)} berhasil · {format(t.total ?? 0)}
                </b>
                <span>{waktuRelatif(t.waktu)}</span>
              </div>
            </div>
          ))}
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

function POS({ products, cart, search, setSearch, addCart, changeQty, setCart, total, complete }) {
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
            <p>#{String(87).padStart(4, '0')} · Hari ini</p>
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
      await simpanBarangMasuk(p.id, Number(qty), harga)
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
            <input type="date" defaultValue="2026-11-05" />
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

function Reports() {
  const [periode, setPeriode] = useState('harian')
  const sekarang = new Date()
  const dari = awalPeriode(periode, sekarang)
  const ring = useRingkasan(dari)
  const terbaru = useTransaksiTerbaru(dari, 20)

  const total = useMemo(() => jumlahRingkasan(ring.data), [ring.data])
  const laba = total.omzet - total.hpp
  const grafik = useMemo(
    () => kelompokRingkasan(ring.data, periode, dari, sekarang),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ring.data, periode]
  )

  const tgl = d => d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
  const labelPeriode = periode === 'harian' ? tgl(sekarang) : `${tgl(dari)} – ${tgl(sekarang)}`

  const maks = Math.max(...grafik.map(g => g.omzet), 0)
  const titik = kunci =>
    grafik
      .map((g, i) => {
        const x = grafik.length > 1 ? (i / (grafik.length - 1)) * 600 : 300
        const y = 200 - (maks ? (Math.max(0, g[kunci]) / maks) * 180 : 0)
        return `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`
      })
      .join(' ')

  return (
    <section className="content">
      <div className="report-top">
        <div>
          <p className="eyebrow">PERIODE LAPORAN</p>
          <h2>{labelPeriode}</h2>
        </div>
        <div className="period">
          {[
            ['harian', 'Harian'],
            ['mingguan', 'Mingguan'],
            ['bulanan', 'Bulanan'],
            ['tahunan', 'Tahunan'],
          ].map(([k, t]) => (
            <button key={k} className={periode === k ? 'selected' : ''} onClick={() => setPeriode(k)}>
              {t}
            </button>
          ))}
        </div>
      </div>
      {ring.error && <p style={{ color: '#c0392b' }}>Gagal memuat data laporan: {ring.error}</p>}
      <div className="stat-grid">
        <Stat icon={<WalletCards />} label="Total omzet" value={format(total.omzet)} delta={`${total.item} item terjual`} />
        <Stat
          icon={<PackageSearch />}
          label="Harga pokok penjualan"
          value={format(total.hpp)}
          delta={`${persen(total.hpp, total.omzet)}% dari omzet`}
          tone="blue"
        />
        <Stat
          icon={<TrendingUp />}
          label="Keuntungan kotor"
          value={format(laba)}
          delta={`${persen(laba, total.omzet)}% margin`}
          tone="purple"
        />
        <Stat
          icon={<ReceiptText />}
          label="Transaksi"
          value={String(total.transaksi)}
          delta={`Rata-rata ${format(total.transaksi ? Math.round(total.omzet / total.transaksi) : 0)}`}
          tone="orange"
        />
      </div>
      <div className="dashboard-grid report-grid">
        <div className="card revenue">
          <div className="card-head">
            <div>
              <h3>Omzet & keuntungan</h3>
              <p>{periode === 'harian' ? 'Perbandingan per jam' : periode === 'tahunan' ? 'Perbandingan per bulan' : 'Perbandingan per hari'}</p>
            </div>
            <div className="legend">
              <span />
              <b>Omzet</b>
              <span className="profit" />
              <b>Keuntungan</b>
            </div>
          </div>
          <div className="line-chart">
            {maks === 0 ? (
              <p style={{ color: '#999', textAlign: 'center', paddingTop: 80 }}>
                {ring.loading ? 'Memuat data...' : 'Belum ada penjualan pada periode ini'}
              </p>
            ) : (
              <svg viewBox="0 0 600 220" preserveAspectRatio="none">
                <path d={titik('omzet')} fill="none" stroke="#ed6b45" strokeWidth="4" vectorEffect="non-scaling-stroke" />
                <path d={titik('laba')} fill="none" stroke="#5f9c78" strokeWidth="4" vectorEffect="non-scaling-stroke" />
              </svg>
            )}
          </div>
          {grafik.length > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#999', padding: '6px 4px 0' }}>
              <span>{grafik[0].label}</span>
              <span>{grafik[Math.floor((grafik.length - 1) / 2)].label}</span>
              <span>{grafik[grafik.length - 1].label}</span>
            </div>
          )}
        </div>
        <div className="card finance">
          <h3>Rincian keuangan</h3>
          {[
            ['Penjualan kotor', format(total.omzet)],
            ['Diskon transaksi', format(0)],
            ['Harga pokok penjualan', `(${format(total.hpp)})`],
            ['Keuntungan kotor', format(laba)],
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
            <p>20 transaksi terakhir pada periode terpilih</p>
          </div>
          <button
            className="link"
            onClick={() => unduhCsv(ring.data, `laporan-${periode}-${kunciTanggal(new Date())}.csv`)}
          >
            Unduh laporan
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
            </tr>
          </thead>
          <tbody>
            {terbaru.data.length === 0 && (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: 24, color: '#999' }}>
                  {terbaru.loading ? 'Memuat data...' : 'Belum ada transaksi'}
                </td>
              </tr>
            )}
            {terbaru.data.map(t => (
              <tr key={t.id}>
                <td>
                  <b>{kodeTrx(t)}</b>
                </td>
                <td>{formatWaktu(t.waktu)}</td>
                <td>{t.kasir || '-'}</td>
                <td>{(t.items || []).reduce((s, i) => s + (i.qty || 0), 0)} item</td>
                <td>
                  <span className="tag">{t.metode === 'tunai' || !t.metode ? 'Tunai' : t.metode}</span>
                </td>
                <td>
                  <b>{format(t.total ?? 0)}</b>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function ProfilModal({ namaAwal, email, close, onSaved, notify }) {
  const [nama, setNama] = useState(namaAwal)
  const [saving, setSaving] = useState(false)

  const simpan = async () => {
    const bersih = nama.trim()
    if (!bersih) return notify('Nama tidak boleh kosong')
    if (!navigator.onLine) return notify('Tidak ada koneksi internet. Profil belum disimpan.')
    setSaving(true)
    try {
      await updateProfile(getAuth().currentUser, { displayName: bersih })
      onSaved(bersih)
      notify('Profil berhasil diperbarui')
      close()
    } catch (err) {
      console.error('Gagal menyimpan profil:', err)
      notify('Gagal menyimpan profil: ' + err.message)
      setSaving(false)
    }
  }

  return (
    <Modal title="Edit profil" close={close}>
      <div className="form-grid">
        <label>
          Nama tampilan
          <input value={nama} maxLength={40} autoFocus onChange={e => setNama(e.target.value)} />
        </label>
        <label>
          Email (tidak bisa diubah)
          <input value={email} disabled />
        </label>
      </div>
      <button className="primary save" onClick={simpan} disabled={saving}>
        {saving ? 'Menyimpan...' : 'Simpan profil'}
      </button>
    </Modal>
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