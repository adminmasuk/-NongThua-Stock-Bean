const express = require('express')
const line = require('@line/bot-sdk')
const path = require('path')
const pool = require('./lib/db')
const users = require('./lib/userService')
const { requireLiffUser } = require('./lib/liffAuth')
const { runMigrations, migrationState } = require('./lib/migrate')

const config = {
  channelAccessToken: process.env.LINE_TOKEN,
  channelSecret: process.env.LINE_SECRET
}

const client = new line.messagingApi.MessagingApiClient(config)
const app = express()

// เปิดรับสมัคร Pro หรือยัง (ตั้ง env PRO_OPEN=true บน Render เมื่อ flow PromptPay + SlipOK พร้อม)
const PRO_OPEN = process.env.PRO_OPEN === 'true'
const ADMIN_LINE_USER_ID = process.env.ADMIN_LINE_USER_ID

// กันไว้อีกชั้น: error ที่หลุดจาก async ไหนก็ตามต้องไม่ทำให้ server ล่ม (Node ≥15 ปิด process ถ้าไม่มีตัวจับ)
process.on('unhandledRejection', err => console.error('unhandledRejection:', err))

app.post('/webhook', line.middleware(config), async (req, res) => {
  const events = Array.isArray(req.body && req.body.events) ? req.body.events : []
  // allSettled: event ไหนพัง (ข้อมูลผิดรูปแบบ / LINE reply ไม่สำเร็จ) ก็แค่ log ไว้ ไม่ลาม event อื่นหรือทั้ง server
  const results = await Promise.allSettled(events.map(handleEvent))
  results.forEach(r => { if (r.status === 'rejected') console.error('webhook event error:', r.reason) })
  res.json({ status: 'ok' })
})

// ตัวเลขจากข้อความ JSON ที่ผู้ใช้พิมพ์มา — ต้องเป็นตัวเลขจริงและไม่ติดลบ ไม่งั้นถือว่าไม่ถูกต้อง
function toNum(v) {
  const n = typeof v === 'number' ? v : (typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN)
  return Number.isFinite(n) && n >= 0 ? n : null
}
const MAX_TICKER_LEN = 20

async function handleEvent(event) {
  // เพิ่มเพื่อน OA → สร้าง user ไว้เลย (ได้ Free 30 เครดิต/เดือน)
  if (event.type === 'follow' && event.source && event.source.userId) {
    try {
      let displayName = null
      try { displayName = (await client.getProfile(event.source.userId)).displayName } catch {}
      await users.ensureUser(event.source.userId, displayName)
    } catch (err) {
      console.error('follow → ensureUser error:', err)
    }
    return
  }

  if (event.type !== 'message' || event.message.type !== 'text') return

  // คำสั่งทดสอบ /dev-* (เฉพาะแอดมิน)
  const text = event.message.text.trim()
  if (text.startsWith('/dev-')) {
    if (!ADMIN_LINE_USER_ID || event.source.userId !== ADMIN_LINE_USER_ID) return
    return replyText(event.replyToken, await handleDevCommand(event.source.userId, text))
  }

  let data
  try {
    data = JSON.parse(event.message.text)
  } catch {
    return
  }

  // JSON.parse ให้ null / ตัวเลข / array ได้ด้วย → รับเฉพาะ object
  if (!data || typeof data !== 'object' || Array.isArray(data)) return

  const ticker = String(data.ticker == null ? '' : data.ticker).trim().slice(0, MAX_TICKER_LEN) || '-'
  const qty = toNum(data.qty)
  const cost = toNum(data.cost)

  let resultText = ''

  if (data.action === 'avgcost') {
    const price = toNum(data.price)
    if (qty == null || cost == null || price == null || qty === 0 || cost === 0) return
    const total = qty * cost
    const current = qty * price
    const profit = current - total
    const profitPct = ((profit / total) * 100).toFixed(2)
    resultText =
`📊 ${ticker} — ราคาเฉลี่ย
ราคาเฉลี่ย: ${cost} บาท
จำนวน: ${qty.toLocaleString()} หุ้น
ทุนรวม: ${total.toLocaleString()} บาท
มูลค่าปัจจุบัน: ${current.toLocaleString()} บาท
กำไร/ขาดทุน: ${profit >= 0 ? '+' : ''}${profit.toLocaleString()} บาท (${profitPct}%)`

  } else if (data.action === 'dividend') {
    const dps = toNum(data.dps)
    if (qty == null || cost == null || dps == null || cost === 0) return
    const divYield = ((dps / cost) * 100).toFixed(2)
    const totalDiv = qty * dps
    resultText =
`💰 ${ticker} — ปันผล
ราคาทุน: ${cost} บาท
เงินปันผลต่อหุ้น: ${dps} บาท
Dividend Yield: ${divYield}%
ปันผลที่จะได้รับ: ${totalDiv.toLocaleString()} บาท`
  }

  if (!resultText) return
  return replyText(event.replyToken, resultText)
}

function replyText(replyToken, text) {
  return client.replyMessage({ replyToken, messages: [{ type: 'text', text }] })
}

// ---------- /dev-* commands: ทดสอบระบบเครดิต/แพ็กเกจกับบัญชีแอดมินเอง ----------
const DEV_HELP = `คำสั่งทดสอบ
/dev-status — ดูสถานะ
/dev-set-pro — เป็น Pro 1 ปี
/dev-set-pro-expiring 7 — Pro ใกล้หมดอายุ (อีก 7 วัน)
/dev-set-pro-expired — Pro ที่หมดอายุแล้ว
/dev-set-starter — กลับเป็น Free
/dev-set-used 30 — ตั้งเครดิตที่ใช้ไปเดือนนี้
/dev-reset — รีเซ็ตเครดิตที่ใช้ไปเป็น 0`

async function handleDevCommand(lineUserId, text) {
  const [cmd, arg] = text.split(/\s+/)
  try {
    const userId = await users.ensureUser(lineUserId)
    switch (cmd) {
      case '/dev-set-pro': await users.activatePro(userId, { source: 'admin' }); break
      case '/dev-set-pro-expiring': await users.devSetProExpiring(userId, Math.max(parseInt(arg, 10) || 7, 0)); break
      case '/dev-set-pro-expired': await users.devSetProExpired(userId); break
      case '/dev-set-starter':
      case '/dev-set-free': await users.devSetFree(userId); break
      case '/dev-set-used': await users.devSetUsed(userId, Math.max(parseInt(arg, 10) || 0, 0)); break
      case '/dev-reset': await users.devSetUsed(userId, 0); break
      case '/dev-status': break
      default: return DEV_HELP
    }
    const s = await users.getStatus(userId)
    return `✅ ${cmd}
แพ็กเกจ: ${s.tier.toUpperCase()}
เครดิต: ${s.limit == null ? `ไม่จำกัด (ใช้ไป ${s.used})` : `ใช้ไป ${s.used}/${s.limit} เหลือ ${s.remaining}`}
รีเซ็ต: ${s.resetAt}${s.expiresAt ? `\nPro หมดอายุ: ${s.expiresAt.slice(0, 10)}` : ''}${s.proExpiredAt ? `\nPro หมดอายุไปแล้ว: ${s.proExpiredAt.slice(0, 10)}` : ''}`
  } catch (err) {
    console.error('dev command error:', err)
    return '❌ ' + cmd + ' ไม่สำเร็จ: ' + err.message
  }
}

// ---------- API ระบบ user + เครดิต (หน้า LIFF เรียก พร้อม LIFF access token) ----------
const api = express.Router()
api.use(express.json())
api.use(requireLiffUser)

// GET /api/me — สถานะแพ็กเกจ + เครดิตของผู้ใช้ (สร้าง user ให้อัตโนมัติถ้ายังไม่มี)
api.get('/me', async (req, res) => {
  try {
    const userId = await users.ensureUser(req.lineUser.userId, req.lineUser.displayName)
    res.json({ ok: true, ...(await users.getStatus(userId)), proOpen: PRO_OPEN })
  } catch (err) {
    console.error('GET /api/me error:', err)
    res.status(500).json({ ok: false, error: 'โหลดข้อมูลผู้ใช้ไม่สำเร็จ' })
  }
})

// POST /api/credits/consume — หัก 1 เครดิตก่อนส่งผลเข้าแชต
// 200 = หักแล้ว ส่งต่อได้ / 402 = เครดิตเดือนนี้หมด
api.post('/credits/consume', async (req, res) => {
  try {
    const userId = await users.ensureUser(req.lineUser.userId, req.lineUser.displayName)
    const { ok, status } = await users.consumeCredit(userId)
    res.status(ok ? 200 : 402).json({
      ok, ...status, proOpen: PRO_OPEN,
      ...(ok ? {} : { error: 'เครดิตเดือนนี้หมดแล้ว' })
    })
  } catch (err) {
    console.error('POST /api/credits/consume error:', err)
    res.status(500).json({ ok: false, error: 'ตัดเครดิตไม่สำเร็จ' })
  }
})

// POST /api/credits/refund — คืนเครดิต เมื่อหักแล้วแต่ส่งข้อความเข้าแชตไม่สำเร็จ
api.post('/credits/refund', async (req, res) => {
  try {
    const userId = await users.ensureUser(req.lineUser.userId, req.lineUser.displayName)
    const { ok, status } = await users.refundCredit(userId)
    res.json({ ok, ...status, proOpen: PRO_OPEN })
  } catch (err) {
    console.error('POST /api/credits/refund error:', err)
    res.status(500).json({ ok: false, error: 'คืนเครดิตไม่สำเร็จ' })
  }
})


// GET /api/xd-calendar — ปฏิทินหลักทรัพย์ (Phase 5) อ่านจากตาราง public.xd_calendar ใน Supabase
app.get('/api/xd-calendar', async (req, res) => {
  try {
    const { type, upcoming } = req.query
    const conditions = []
    const values = []

    if (type) {
      values.push(type)
      conditions.push(`type = $${values.length}`)
    }
    if (upcoming === 'true') {
      conditions.push('xd_date >= current_date')
    }

    const whereClause = conditions.length ? `where ${conditions.join(' and ')}` : ''
    const sql = `
      select
        id, ticker, type, xd_date, record_date, book_close_date, pay_date,
        dps, category, period_start, period_end, dividend_source, yield_pct
      from public.xd_calendar
      ${whereClause}
      order by xd_date asc
      limit 100
    `
    const { rows } = await pool.query(sql, values)
    res.json({ ok: true, data: rows })
  } catch (err) {
    console.error('GET /api/xd-calendar error:', err)
    res.status(500).json({ ok: false, error: 'โหลดข้อมูลปฏิทินหลักทรัพย์ไม่สำเร็จ' })
  }
})

// GET /healthz — เช็คว่า server + ฐานข้อมูลพร้อม (ใช้กับ UptimeRobot ได้) ไม่เปิดเผยข้อมูลผู้ใช้
app.get('/healthz', async (req, res) => {
  const m = migrationState()
  let db = false
  let dbError = null
  try { await pool.query('select 1'); db = true } catch (err) {
    // แสดงเฉพาะรหัส error + ข้อความสั้น ๆ ไว้ช่วยหาสาเหตุ (ไม่มีรหัสผ่านอยู่ในข้อความ)
    dbError = [err.code, String(err.message || '')].filter(Boolean).join(' ').replace(/:\/\/[^@\s]*@/g, '://***@').slice(0, 160)
  }
  res.status(db && m.done ? 200 : 503).json({
    ok: db && m.done,
    db,
    ...(dbError ? { dbError } : {}),
    migration: m.done ? 'ok' : (m.error ? 'failed' : 'pending'),
    adminConfigured: !!ADMIN_LINE_USER_ID,
    proOpen: PRO_OPEN
  })
})

// API ที่ต้องยืนยันตัวตน (วางหลัง /api/xd-calendar ซึ่งเป็นข้อมูลสาธารณะ)
app.use('/api', api)

// หน้าเว็บ LIFF แยกไฟล์อยู่ในโฟลเดอร์ public/ (liff.html, css/, js/, img/)
// เปิดให้เข้าถึงเฉพาะโฟลเดอร์ public — ไฟล์โค้ดฝั่ง server (index.js ฯลฯ) จะไม่ถูกเปิดให้ดาวน์โหลด
app.use(express.static(path.join(__dirname, 'public')))
app.get('/liff', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'liff.html'))
})

const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
  console.log(`Bot running on port ${PORT}`)
  runMigrations()
})
