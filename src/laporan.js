// Dashboard & Laporan membaca RINGKASAN HARIAN (1 dokumen per hari), bukan semua transaksi.
// Hasilnya hemat kuota Firestore: laporan setahun hanya ±365 baca, bukan puluhan ribu.

const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']
const HARI_MS = 86400000
const pad = n => String(n).padStart(2, '0')
const awalHari = d => new Date(d.getFullYear(), d.getMonth(), d.getDate())

// "2026-11-14" (tanggal lokal browser)
export const kunciTanggal = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

// harian = hari ini | mingguan = 7 hari terakhir | bulanan = sejak tgl 1 | tahunan = sejak 1 Januari
export function awalPeriode(jenis, sekarang = new Date()) {
  const d = awalHari(sekarang)
  if (jenis === 'mingguan') d.setDate(d.getDate() - 6)
  if (jenis === 'bulanan') d.setDate(1)
  if (jenis === 'tahunan') {
    d.setMonth(0)
    d.setDate(1)
  }
  return d
}

// Jumlahkan dokumen ringkasan harian
export function jumlahRingkasan(docs) {
  return docs.reduce(
    (a, d) => ({
      omzet: a.omzet + (d.omzet || 0),
      hpp: a.hpp + (d.hpp || 0),
      transaksi: a.transaksi + (d.transaksi || 0),
      item: a.item + (d.item || 0),
    }),
    { omzet: 0, hpp: 0, transaksi: 0, item: 0 }
  )
}

// Titik grafik: harian per jam (06-18), mingguan/bulanan per hari, tahunan per bulan
export function kelompokRingkasan(docs, jenis, dari, sekarang = new Date()) {
  if (jenis === 'harian') {
    const out = Array.from({ length: 13 }, (_, i) => ({ label: pad(6 + i) + ':00', omzet: 0, laba: 0 }))
    const dok = docs.find(d => d.tanggal === kunciTanggal(sekarang))
    for (const [jam, v] of Object.entries(dok?.jam || {})) {
      const k = Math.min(12, Math.max(0, parseInt(jam, 10) - 6))
      out[k].omzet += v.omzet || 0
      out[k].laba += (v.omzet || 0) - (v.hpp || 0)
    }
    return out
  }
  if (jenis === 'tahunan') {
    const n = sekarang.getMonth() + 1
    const out = Array.from({ length: n }, (_, i) => ({ label: BULAN[i], omzet: 0, laba: 0 }))
    for (const d of docs) {
      const m = parseInt(String(d.tanggal).slice(5, 7), 10) - 1
      if (m >= 0 && m < n) {
        out[m].omzet += d.omzet || 0
        out[m].laba += (d.omzet || 0) - (d.hpp || 0)
      }
    }
    return out
  }
  const n = Math.round((awalHari(sekarang) - dari) / HARI_MS) + 1
  const peta = Object.fromEntries(docs.map(d => [d.tanggal, d]))
  return Array.from({ length: n }, (_, i) => {
    const tgl = new Date(dari)
    tgl.setDate(tgl.getDate() + i)
    const d = peta[kunciTanggal(tgl)]
    return {
      label: tgl.getDate() + ' ' + BULAN[tgl.getMonth()],
      tgl,
      omzet: d?.omzet || 0,
      laba: (d?.omzet || 0) - (d?.hpp || 0),
    }
  })
}

// Produk terlaris dari gabungan dokumen ringkasan
export function produkTerlaris(docs, n = 4) {
  const m = {}
  for (const d of docs) {
    for (const [kode, v] of Object.entries(d.produk || {})) {
      if (!m[kode]) m[kode] = { kode, nama: v.nama || kode, qty: 0, omzet: 0 }
      m[kode].qty += v.qty || 0
      m[kode].omzet += v.omzet || 0
    }
  }
  return Object.values(m)
    .sort((a, b) => b.qty - a.qty)
    .slice(0, n)
}

// 1500000 -> "1,5jt", 500000 -> "500rb"
export function ringkas(n) {
  if (n >= 1e6) return (n / 1e6).toFixed(1).replace('.', ',').replace(',0', '') + 'jt'
  if (n >= 1e3) return Math.round(n / 1e3) + 'rb'
  return String(Math.round(n))
}

export function formatWaktu(d) {
  if (!d) return '-'
  const tgl = d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
  return `${tgl}, ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function waktuRelatif(d) {
  if (!d) return ''
  const menit = Math.floor((Date.now() - d.getTime()) / 60000)
  if (menit < 1) return 'Baru saja'
  if (menit < 60) return `${menit} menit lalu`
  if (menit < 1440) return `${Math.floor(menit / 60)} jam lalu`
  return formatWaktu(d)
}

export const kodeTrx = t => '#' + t.id.slice(0, 8).toUpperCase()

// Unduh CSV ringkasan per hari (pemisah ';' supaya rapi di Excel Indonesia)
export function unduhCsv(docs, namaFile) {
  const esc = v => '"' + String(v ?? '').replace(/"/g, '""') + '"'
  const baris = [['Tanggal', 'Transaksi', 'Item', 'Omzet', 'HPP', 'Laba'].map(esc).join(';')]
  for (const d of docs) {
    baris.push(
      [d.tanggal, d.transaksi || 0, d.item || 0, d.omzet || 0, d.hpp || 0, (d.omzet || 0) - (d.hpp || 0)]
        .map(esc)
        .join(';')
    )
  }
  const blob = new Blob(['\uFEFF' + baris.join('\n')], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = namaFile
  a.click()
  URL.revokeObjectURL(a.href)
}

// ---- HOOK (pengambilan data dari Firestore) ----
import { useEffect, useState } from 'react'
import { collection, getDocs, limit, orderBy, query, Timestamp, where } from 'firebase/firestore'
import { db } from './firebase'

function useAmbil(buatQuery, kunci, petakan) {
  const [state, setState] = useState({ data: [], loading: true, error: '' })
  useEffect(() => {
    let batal = false
    setState(s => ({ ...s, loading: true, error: '' }))
    ;(async () => {
      try {
        if (!db) throw new Error('Firebase belum terkonfigurasi')
        const snap = await getDocs(buatQuery())
        if (!batal) setState({ data: snap.docs.map(petakan), loading: false, error: '' })
      } catch (err) {
        console.error('Gagal memuat data laporan:', err)
        if (!batal) setState({ data: [], loading: false, error: err.message })
      }
    })()
    return () => {
      batal = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kunci])
  return state
}

// Ringkasan harian sejak tanggal `dari` (maks 1 baca per hari)
export function useRingkasan(dari) {
  const kunci = 'r' + dari.getTime()
  return useAmbil(
    () =>
      query(
        collection(db, 'ringkasanHarian'),
        where('tanggal', '>=', kunciTanggal(new Date(dari.getTime()))),
        orderBy('tanggal')
      ),
    kunci,
    d => ({ id: d.id, ...d.data() })
  )
}

// `jumlah` transaksi terbaru sejak `dari` (maks `jumlah` baca)
export function useTransaksiTerbaru(dari, jumlah = 20) {
  const kunci = 't' + dari.getTime() + '-' + jumlah
  return useAmbil(
    () =>
      query(
        collection(db, 'transaksi'),
        where('waktu', '>=', Timestamp.fromDate(new Date(dari.getTime()))),
        orderBy('waktu', 'desc'),
        limit(jumlah)
      ),
    kunci,
    d => {
      const x = d.data()
      return { id: d.id, ...x, waktu: x.waktu?.toDate ? x.waktu.toDate() : null }
    }
  )
}
