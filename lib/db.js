// lib/db.js — pg Pool ตัวเดียวของทั้งโปรเจกต์ (เชื่อม Supabase ผ่าน DATABASE_URL)
const { Pool } = require('pg')

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Supabase ต้องใช้ SSL — ตอนทดสอบกับ Postgres ในเครื่องตั้ง DATABASE_SSL=false ได้
  ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false }
})

// connection ที่ว่างอยู่หลุด (เช่น Supabase ตัดการเชื่อมต่อ) ต้องไม่ทำให้ server ล่ม
pool.on('error', err => console.error('pg pool error:', err.message))

module.exports = pool
