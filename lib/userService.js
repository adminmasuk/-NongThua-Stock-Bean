// lib/userService.js — ระบบ user + เครดิต
//
// กติกา
// - Free: 30 เครดิต/เดือน (ตั้งค่าได้ด้วย env FREE_CREDIT_LIMIT) รีเซ็ตทุกวันที่ 1 ตามเวลาไทย
// - Pro : ไม่จำกัด (ยังนับจำนวนครั้งไว้เป็นสถิติ)
// - 1 เครดิต = กด "บันทึกข้อมูล" ส่งผลเข้าแชต LINE 1 ครั้ง (คำนวณดูผลบนจอไม่เสียเครดิต)
//
// การรีเซ็ตรายเดือนไม่ต้องใช้ cron: users.usage_period เก็บเดือนที่นับอยู่ ('YYYY-MM')
// ถ้าเดือนไม่ตรงกับเดือนปัจจุบัน = ยังไม่ได้ใช้เลยในเดือนนี้ → ครั้งแรกที่ใช้จะเริ่มนับ 1 ใหม่
//
// สถานะ Pro อ่านจาก view current_memberships (memberships เป็น append-only log)
// Pro ที่ expires_at เลยแล้วถือเป็น Free ทันที (ไม่ต้องรอ cron)

const pool = require('./db')

const FREE_CREDIT_LIMIT = parseInt(process.env.FREE_CREDIT_LIMIT, 10) || 30
const PRO_DURATION = '1 year'
const REFUND_WINDOW = '2 minutes'

// เดือนปัจจุบันตามเวลาไทย เช่น '2026-11'
const PERIOD_SQL = `to_char(now() at time zone 'Asia/Bangkok', 'YYYY-MM')`
// วันรีเซ็ตครั้งถัดไป (วันที่ 1 ของเดือนหน้า เวลาไทย) เป็นข้อความ 'YYYY-MM-DD'
const RESET_AT_SQL = `to_char(date_trunc('month', now() at time zone 'Asia/Bangkok') + interval '1 month', 'YYYY-MM-DD')`

// หา user จาก LINE user id ถ้ายังไม่มีให้สร้างใหม่ + ใส่ membership แรกเป็น free (source = signup)
async function ensureUser(lineUserId, displayName) {
  const client = await pool.connect()
  try {
    await client.query('begin')
    const inserted = await client.query(
      `insert into public.users (line_user_id, display_name)
       values ($1, $2)
       on conflict (line_user_id) do nothing
       returning id`,
      [lineUserId, displayName || null]
    )
    let userId
    if (inserted.rows.length) {
      userId = inserted.rows[0].id
      await client.query(
        `insert into public.memberships (user_id, tier, status, source)
         values ($1, 'free', 'active', 'signup')`,
        [userId]
      )
    } else {
      // อัปเดตชื่อเฉพาะตอนที่เปลี่ยนจริง (ไม่เขียน DB ทุกครั้งที่เปิดหน้า)
      const { rows } = await client.query(
        `select id, display_name from public.users where line_user_id = $1`,
        [lineUserId]
      )
      userId = rows[0].id
      if (displayName && rows[0].display_name !== displayName) {
        await client.query(`update public.users set display_name = $2 where id = $1`, [userId, displayName])
      }
    }
    await client.query('commit')
    return userId
  } catch (err) {
    await client.query('rollback').catch(() => {})
    throw err
  } finally {
    client.release()
  }
}

// สถานะผู้ใช้สำหรับหน้า LIFF (การ์ดเครดิต + หน้าแพ็กเกจ)
async function getStatus(userId) {
  const { rows } = await pool.query(
    `select
       u.created_at,
       case when u.usage_period = ${PERIOD_SQL} then u.usage_count else 0 end as used,
       ${RESET_AT_SQL} as reset_at,
       m.tier, m.status, m.expires_at,
       coalesce(m.tier = 'pro' and m.status = 'active'
                and (m.expires_at is null or m.expires_at > now()), false) as is_pro
     from public.users u
     left join public.current_memberships m on m.user_id = u.id
     where u.id = $1`,
    [userId]
  )
  const r = rows[0]
  if (!r) return null
  const isPro = r.is_pro
  const limit = isPro ? null : FREE_CREDIT_LIMIT
  return {
    tier: isPro ? 'pro' : 'free',
    used: r.used,
    limit,
    remaining: isPro ? null : Math.max(FREE_CREDIT_LIMIT - r.used, 0),
    resetAt: r.reset_at,
    // วันหมดอายุ Pro (ถ้าเป็น Pro อยู่) — ถ้าเคยเป็น Pro แล้วหมดอายุ ส่ง proExpiredAt ไว้ให้หน้าเว็บชวนต่ออายุได้
    expiresAt: isPro && r.expires_at ? r.expires_at.toISOString() : null,
    proExpiredAt: !isPro && r.tier === 'pro' && r.expires_at ? r.expires_at.toISOString() : null,
    memberSince: r.created_at ? r.created_at.toISOString() : null
  }
}

// หัก 1 เครดิตแบบ atomic (กดรัว ๆ / เปิดหลายแท็บพร้อมกันก็หักไม่เกินโควตา)
// คืนค่า { ok: true, status } ถ้าหักได้ หรือ { ok: false, status } ถ้าเครดิตหมด
async function consumeCredit(userId) {
  const before = await getStatus(userId)
  const limit = before.tier === 'pro' ? null : FREE_CREDIT_LIMIT
  const { rows } = await pool.query(
    `update public.users u set
       usage_count = case when u.usage_period = p.period then u.usage_count + 1 else 1 end,
       usage_period = p.period,
       last_consumed_at = now()
     from (select ${PERIOD_SQL} as period) p
     where u.id = $1
       and ($2::int is null or u.usage_period is distinct from p.period or u.usage_count < $2::int)
     returning u.usage_count`,
    [userId, limit]
  )
  const status = await getStatus(userId)
  return { ok: rows.length > 0, status }
}

// คืน 1 เครดิต กรณีหักไปแล้วแต่ส่งข้อความเข้าแชตไม่สำเร็จ
// คืนได้ครั้งเดียวต่อการหัก และต้องภายใน 2 นาทีหลังหัก (กันการเรียกคืนมั่ว)
async function refundCredit(userId) {
  const { rows } = await pool.query(
    `update public.users set
       usage_count = greatest(usage_count - 1, 0),
       last_consumed_at = null
     where id = $1
       and last_consumed_at > now() - interval '${REFUND_WINDOW}'
       and usage_period = ${PERIOD_SQL}
     returning usage_count`,
    [userId]
  )
  return { ok: rows.length > 0, status: await getStatus(userId) }
}

// เปิด/ต่ออายุ Pro 1 ปี — ถ้ายังเป็น Pro อยู่ ต่อจากวันหมดอายุเดิม ไม่ใช่จากวันนี้
// ใช้ทั้ง /dev-set-pro (source='admin') และ flow ชำระเงิน SlipOK ในอนาคต (source='payment'/'renewal')
async function activatePro(userId, { source = 'admin', paymentId = null } = {}) {
  await pool.query(
    `insert into public.memberships (user_id, tier, status, started_at, expires_at, source, payment_id)
     select $1, 'pro', 'active', now(),
            greatest(now(), coalesce(
              (select expires_at from public.current_memberships
                where user_id = $1 and tier = 'pro' and status = 'active'), now()
            )) + interval '${PRO_DURATION}',
            $2, $3`,
    [userId, source, paymentId]
  )
}

// ---------- ใช้กับ /dev-* commands (ทดสอบเท่านั้น) ----------
async function devSetFree(userId) {
  await pool.query(
    `insert into public.memberships (user_id, tier, status, source) values ($1, 'free', 'active', 'admin')`,
    [userId]
  )
}

// Pro ที่หมดอายุไปแล้วเมื่อวาน — ใช้ทดสอบว่าระบบถือเป็น Free อัตโนมัติ
async function devSetProExpired(userId) {
  await pool.query(
    `insert into public.memberships (user_id, tier, status, started_at, expires_at, source)
     values ($1, 'pro', 'active', now() - interval '1 year 1 day', now() - interval '1 day', 'admin')`,
    [userId]
  )
}

// Pro ที่ใกล้หมดอายุ (อีก n วัน) — ใช้ทดสอบป้ายเตือน + ปุ่มต่ออายุ
async function devSetProExpiring(userId, days) {
  await pool.query(
    `insert into public.memberships (user_id, tier, status, started_at, expires_at, source)
     values ($1, 'pro', 'active', now() - interval '1 year' + make_interval(days => $2), now() + make_interval(days => $2), 'admin')`,
    [userId, days]
  )
}

// ตั้งจำนวนเครดิตที่ใช้ไปในเดือนนี้ (0 = รีเซ็ต)
async function devSetUsed(userId, used) {
  await pool.query(
    `update public.users set usage_count = $2, usage_period = ${PERIOD_SQL}, last_consumed_at = null where id = $1`,
    [userId, used]
  )
}

module.exports = {
  FREE_CREDIT_LIMIT,
  ensureUser,
  getStatus,
  consumeCredit,
  refundCredit,
  activatePro,
  devSetFree,
  devSetProExpired,
  devSetProExpiring,
  devSetUsed
}
