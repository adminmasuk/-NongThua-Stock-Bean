// lib/liffAuth.js — middleware ยืนยันตัวตนผู้ใช้จาก LIFF access token
//
// หน้า LIFF ส่ง header: Authorization: Bearer <liff.getAccessToken()>
// server ตรวจกับ LINE ว่า token ยังใช้ได้และออกให้ LIFF app ของเราจริง (client_id = channel id)
// แล้วดึง userId จาก LINE Profile API — ไม่เชื่อ userId ที่หน้าเว็บส่งมาเอง (ปลอมได้)
//
// LIFF ID มีรูปแบบ <channelId>-<xxxx> จึงหา channel id จาก LIFF ID ได้เลย
// (ตั้ง env LIFF_CHANNEL_ID ทับได้ถ้าย้าย LIFF app ไป channel อื่น)

const LIFF_ID = '2010243171-8Hhy0bHv'
const LIFF_CHANNEL_ID = process.env.LIFF_CHANNEL_ID || LIFF_ID.split('-')[0]

// แคชผลตรวจ token ไว้ 5 นาที ลดการเรียก LINE API ซ้ำทุกครั้งที่เปิดหน้า/กดบันทึก
const CACHE_MS = 5 * 60 * 1000
const MAX_CACHE = 1000
const cache = new Map()

async function verifyToken(token) {
  const hit = cache.get(token)
  if (hit && hit.until > Date.now()) return hit.user

  const verifyRes = await fetch(
    'https://api.line.me/oauth2/v2.1/verify?access_token=' + encodeURIComponent(token)
  )
  if (!verifyRes.ok) return null
  const v = await verifyRes.json()
  if (String(v.client_id) !== String(LIFF_CHANNEL_ID) || !(v.expires_in > 0)) return null

  const profileRes = await fetch('https://api.line.me/v2/profile', {
    headers: { Authorization: 'Bearer ' + token }
  })
  if (!profileRes.ok) return null
  const p = await profileRes.json()
  const user = { userId: p.userId, displayName: p.displayName }

  if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value)
  cache.set(token, { user, until: Date.now() + Math.min(CACHE_MS, v.expires_in * 1000) })
  return user
}

async function requireLiffUser(req, res, next) {
  const auth = req.get('authorization') || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : ''
  if (!token) return res.status(401).json({ ok: false, error: 'กรุณาเปิดผ่านแอป LINE' })
  try {
    const user = await verifyToken(token)
    if (!user) return res.status(401).json({ ok: false, error: 'ยืนยันตัวตนไม่สำเร็จ กรุณาเปิดหน้านี้ใหม่' })
    req.lineUser = user
    next()
  } catch (err) {
    console.error('LIFF token verify error:', err)
    res.status(503).json({ ok: false, error: 'เชื่อมต่อ LINE ไม่สำเร็จ' })
  }
}

module.exports = { requireLiffUser }
