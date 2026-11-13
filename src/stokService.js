import { db } from './firebase'
import { collection, doc, runTransaction, increment, serverTimestamp } from 'firebase/firestore'

let sibuk = false

// Semua penulisan lewat sini.
// - Cek internet dulu (tanpa internet: langsung gagal, tidak diantre).
// - Pakai transaksi Firestore: tidak diantre saat offline, jadi data tidak "muncul belakangan".
// - Kunci anti klik ganda: simpan kedua ditolak selama simpan pertama masih berjalan.
async function tulis(fn) {
  if (!db) throw new Error('Firebase belum terkonfigurasi')
  if (!navigator.onLine) throw new Error('Tidak ada koneksi internet. Data belum disimpan.')
  if (sibuk) throw new Error('Penyimpanan sebelumnya masih berjalan, tunggu sebentar.')
  sibuk = true
  try {
    await runTransaction(db, fn)
  } catch (err) {
    if (err.code === 'unavailable' || /offline/i.test(err.message)) {
      throw new Error('Koneksi internet bermasalah. Data belum disimpan.')
    }
    throw err
  } finally {
    sibuk = false
  }
}

// Penjualan: cek stok cukup, simpan transaksi, kurangi stok (semua berhasil atau semua gagal)
export async function simpanPenjualan(keranjang, bayar, kasir = 'Operator') {
  const total = keranjang.reduce((s, i) => s + (i.sell ?? i.hargaJual ?? 0) * i.qty, 0)
  const trxRef = doc(collection(db, 'transaksi'))
  const refs = keranjang.map(i => doc(db, 'barang', i.id))

  await tulis(async tx => {
    const snaps = await Promise.all(refs.map(r => tx.get(r)))
    snaps.forEach((snap, idx) => {
      const i = keranjang[idx]
      const stok = snap.exists() ? snap.data().stok ?? 0 : 0
      if (stok < i.qty) throw new Error(`Stok ${i.name || i.nama} tidak cukup (sisa ${stok})`)
    })

    tx.set(trxRef, {
      waktu: serverTimestamp(),
      metode: 'tunai',
      kasir: kasir || 'Operator',
      total,
      bayar,
      kembalian: bayar - total,
      items: keranjang.map(i => ({
        kode: i.id,
        nama: i.name || i.nama || '',
        qty: i.qty,
        hargaJual: i.sell ?? i.hargaJual ?? 0,
        hargaModal: i.buy ?? i.hargaModal ?? 0, // harga SAAT transaksi, untuk HPP aktual
      })),
    })
    keranjang.forEach((i, idx) => tx.update(refs[idx], { stok: increment(-i.qty) }))
  })
}

// Barang masuk: tambah stok + catat riwayat
export async function simpanBarangMasuk(kode, qty, hargaBeli, namaBarang = '') {
  await tulis(async tx => {
    tx.update(doc(db, 'barang', kode), { stok: increment(qty) })
    tx.set(doc(collection(db, 'pergerakanStok')), {
      kode,
      nama: namaBarang,
      jenis: 'masuk',
      qty,
      hargaBeli,
      waktu: serverTimestamp(),
    })
  })
}

// Stok opname: daftar = [{ kode, nama, stokSistem, stokFisik }]
export async function simpanOpname(daftar) {
  await tulis(async tx => {
    for (const d of daftar) {
      tx.update(doc(db, 'barang', d.kode), { stok: d.stokFisik })
      tx.set(doc(collection(db, 'pergerakanStok')), {
        kode: d.kode,
        nama: d.nama || '',
        jenis: 'opname',
        qty: d.stokFisik - d.stokSistem,
        stokSistem: d.stokSistem,
        stokFisik: d.stokFisik,
        waktu: serverTimestamp(),
      })
    }
  })
}

// Tambah barang baru (Data Barang)
export async function simpanBarangBaru(b) {
  await tulis(async tx => {
    tx.set(doc(db, 'barang', b.kode), { ...b, aktif: true, createdAt: serverTimestamp() })
  })
}