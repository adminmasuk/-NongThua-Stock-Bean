// lib/migrate.js — อัปเดตโครงสร้างฐานข้อมูลอัตโนมัติตอน server เริ่มทำงาน
// ทุกคำสั่งรันซ้ำได้ปลอดภัย (IF NOT EXISTS / CREATE OR REPLACE) ไม่กระทบข้อมูลเดิม
// เนื้อหาเดียวกับ claude/supabase_migration_user_credits.sql ใน Project
// (.gitignore ของ repo ตัดไฟล์ *.sql ออก จึงเก็บ SQL ไว้ในไฟล์นี้)

const pool = require('./db')

const MIGRATION_SQL = `
alter table public.users
  add column if not exists usage_period text,
  add column if not exists last_consumed_at timestamptz;

-- usage_count เดิมเป็นตัวนับสะสมช่วงทดสอบ → เริ่มนับใหม่ (เฉพาะแถวที่ยังไม่เคยใช้ระบบเครดิตใหม่)
update public.users set usage_count = 0 where usage_period is null and usage_count <> 0;

create or replace view public.current_memberships as
select distinct on (user_id)
    id, user_id, tier, status, started_at, expires_at, source, payment_id, created_at
from public.memberships
order by user_id, created_at desc, id desc;

insert into public.memberships (user_id, tier, status, source)
select u.id, 'free', 'active', 'signup'
from public.users u
where not exists (select 1 from public.memberships m where m.user_id = u.id);
`

let state = { done: false, error: null }

// ต่อ DB ไม่ได้ต้องไม่ทำให้ server ล่ม (หน้า LIFF/คำนวณยังต้องใช้ได้) — จะลองใหม่ทุก 1 นาที
async function runMigrations() {
  let client
  try {
    client = await pool.connect()
    await client.query('begin')
    // กันกรณีมีหลาย instance เริ่มพร้อมกัน
    await client.query('select pg_advisory_xact_lock(20261107)')
    await client.query(MIGRATION_SQL)
    await client.query('commit')
    state = { done: true, error: null }
    console.log('DB migration: OK')
  } catch (err) {
    if (client) await client.query('rollback').catch(() => {})
    state = { done: false, error: err.message }
    console.error('DB migration failed (จะลองใหม่ใน 1 นาที):', err.message)
    setTimeout(runMigrations, 60 * 1000).unref()
  } finally {
    if (client) client.release()
  }
}

module.exports = { runMigrations, migrationState: () => state }
