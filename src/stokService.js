import { db } from './firebase'
import { collection, doc, setDoc, writeBatch, increment, serverTimestamp } from 'firebase/firestore'

function cekDb() {
  if (!db) throw new Error('Firebase belum terkonfigurasi')
}

// Penjualan: simpan transaksi + kurangi stok tiap barang (satu batch: semua berhasil atau semua gagal)
export async function simpanPenjualan(keranjang, bayar) {
  cekDb()
  const batch = writeBatch(db)
  const trxRef = doc(collection(db, 'transaksi')) // ID otomatis
  const total = keranjang.reduce((s, i) => s + (i.sell ?? i.hargaJual ?? 0) * i.qty, 0)

  batch.set(trxRef, {
    waktu: serverTimestamp(),
    metode: 'tunai',
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

  for (const i of keranjang) {
    batch.update(doc(db, 'barang', i.id), { stok: increment(-i.qty) })
  }
  await batch.commit()
}

// Barang masuk: tambah stok + catat riwayat
export async function simpanBarangMasuk(kode, qty, hargaBeli) {
  cekDb()
  const batch = writeBatch(db)
  batch.update(doc(db, 'barang', kode), { stok: increment(qty) })
  batch.set(doc(collection(db, 'pergerakanStok')), {
    kode,
    jenis: 'masuk',
    qty,
    hargaBeli,
    waktu: serverTimestamp(),
  })
  await batch.commit()
}

// Stok opname: daftar = [{ kode, stokSistem, stokFisik }]
export async function simpanOpname(daftar) {
  cekDb()
  const batch = writeBatch(db)
  for (const d of daftar) {
    batch.update(doc(db, 'barang', d.kode), { stok: d.stokFisik })
    batch.set(doc(collection(db, 'pergerakanStok')), {
      kode: d.kode,
      jenis: 'opname',
      qty: d.stokFisik - d.stokSistem,
      stokSistem: d.stokSistem,
      stokFisik: d.stokFisik,
      waktu: serverTimestamp(),
    })
  }
  await batch.commit()
}

// Tambah barang baru (Data Barang)
export async function simpanBarangBaru(b) {
  cekDb()
  await setDoc(doc(db, 'barang', b.kode), {
    ...b,
    aktif: true,
    createdAt: serverTimestamp(),
  })
}