// lib/liffAuth.js — middleware ยืนยันตัวตนผู้ใช้จาก LIFF
//
// หน้า LIFF ส่ง header:
//   Authorization: Bearer <liff.getAccessToken()>
//   X-Line-Id-Token: <liff.getIDToken()>   (ถ้า LIFF app เปิด scope openid)
// server ตรวจกับ LINE ว่า access token ยังใช้ได้และออกให้ LIFF app ของเราจริง (client_id = channel id)
// แล้วหา userId จาก LINE Profile API (scope profile) — ถ้าไม่ได้ ใช้ ID token (scope openid) แทน
// ไม่เชื่อ userId ที่หน้าเว็บส่งมาเอง (ปลอมได้)
//
// LIFF ID มีรูปแบบ <channelId>-<xxxx> จึงหา channel id จาก LIFF ID ได้เลย
// (ตั้ง env LIFF_CHANNEL_ID ทับได้ถ้าย้าย LIFF app ไป channel อื่น)

const LIFF_ID = '2010243171-8Hhy0bHv'
const LIFF_CHANNEL_ID = process.env.LIFF_CHANNEL_ID || LIFF_ID.split('-')[0]

// แคชผลตรวจ token ไว้ 5 นาที ลดการเรียก LINE API ซ้ำทุกครั้งที่เปิดหน้า/กดบันทึก
const CACHE_MS = 5 * 60 * 1000
const MAX_CACHE = 1000
const cache = new Map()

// คืน { user } ถ้าผ่าน หรือ { reason } บอกว่าไม่ผ่านเพราะอะไร (แสดงในข้อความ error ช่วยหาสาเหตุ)
async function verifyToken(token, idToken) {
  const hit = cache.get(token)
  if (hit && hit.until > Date.now()) return { user: hit.user }

  const verifyRes = await fetch(
    'https://api.line.me/oauth2/v2.1/verify?access_token=' + encodeURIComponent(token)
  )
  if (!verifyRes.ok) return { reason: 'verify-' + verifyRes.status }
  const v = await verifyRes.json()
  if (String(v.client_id) !== String(LIFF_CHANNEL_ID)) return { reason: 'channel-' + v.client_id }
  if (!(v.expires_in > 0)) return { reason: 'expired' }

  let user = null
  let reason = null

  // 1) Profile API (ต้องมี scope profile)
  const profileRes = await fetch('https://api.line.me/v2/profile', {
    headers: { Authorization: 'Bearer ' + token }
  })
  if (profileRes.ok) {
    const p = await profileRes.json()
    if (p.userId) user = { userId: p.userId, displayName: p.displayName || null }
  } else {
    reason = 'profile-' + profileRes.status
  }

  // 2) สำรอง: ID token (ต้องมี scope openid) — LINE ตรวจลายเซ็น + client_id ให้
  if (!user && idToken) {
    const idRes = await fetch('https://api.line.me/oauth2/v2.1/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ id_token: idToken, client_id: String(LIFF_CHANNEL_ID) })
    })
    if (idRes.ok) {
      const d = await idRes.json()
      if (d.sub) user = { userId: d.sub, displayName: d.name || null }
    } else {
      reason = (reason ? reason + ',' : '') + 'idtoken-' + idRes.status
    }
  } else if (!user) {
    reason = (reason ? reason + ',' : '') + 'no-idtoken'
  }

  if (!user) return { reason }

  if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value)
  cache.set(token, { user, until: Date.now() + Math.min(CACHE_MS, v.expires_in * 1000) })
  return { user }
}

async function requireLiffUser(req, res, next) {
  const auth = req.get('authorization') || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : ''
  if (!token) return res.status(401).json({ ok: false, error: 'กรุณาเปิดผ่านแอป LINE' })
  try {
    const { user, reason } = await verifyToken(token, req.get('x-line-id-token') || '')
    if (!user) {
      console.warn('LIFF auth failed:', reason)
      return res.status(401).json({ ok: false, error: `ยืนยันตัวตนไม่สำเร็จ (${reason})`, reason })
    }
    req.lineUser = user
    next()
  } catch (err) {
    console.error('LIFF token verify error:', err)
    res.status(503).json({ ok: false, error: 'เชื่อมต่อ LINE ไม่สำเร็จ' })
  }
}

module.exports = { requireLiffUser }
