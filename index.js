const express = require('express')
const line = require('@line/bot-sdk')
const path = require('path')
const pool = require('./lib/db')
const users = require('./lib/userService')
const { requireLiffUser } = require('./lib/liffAuth')

const config = {
  channelAccessToken: process.env.LINE_TOKEN,
  channelSecret: process.env.LINE_SECRET
}

const client = new line.messagingApi.MessagingApiClient(config)
const app = express()

// เปิดรับสมัคร Pro หรือยัง (ตั้ง env PRO_OPEN=true บน Render เมื่อ flow PromptPay + SlipOK พร้อม)
const PRO_OPEN = process.env.PRO_OPEN === 'true'
const ADMIN_LINE_USER_ID = process.env.ADMIN_LINE_USER_ID

app.post('/webhook', line.middleware(config), async (req, res) => {
  const events = req.body.events
  await Promise.all(events.map(handleEvent))
  res.json({ status: 'ok' })
})

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

  let resultText = ''

  if (data.action === 'avgcost') {
    const total = data.qty * data.cost
    const current = data.qty * data.price
    const profit = current - total
    const profitPct = ((profit / total) * 100).toFixed(2)
    resultText = 
`📊 ${data.ticker} — ราคาเฉลี่ย
ราคาเฉลี่ย: ${data.cost} บาท
จำนวน: ${data.qty.toLocaleString()} หุ้น
ทุนรวม: ${total.toLocaleString()} บาท
มูลค่าปัจจุบัน: ${current.toLocaleString()} บาท
กำไร/ขาดทุน: ${profit >= 0 ? '+' : ''}${profit.toLocaleString()} บาท (${profitPct}%)`

  } else if (data.action === 'dividend') {
    const divYield = ((data.dps / data.cost) * 100).toFixed(2)
    const totalDiv = data.qty * data.dps
    resultText =
`💰 ${data.ticker} — ปันผล
ราคาทุน: ${data.cost} บาท
เงินปันผลต่อหุ้น: ${data.dps} บาท
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

// API ที่ต้องยืนยันตัวตน (วางหลัง /api/xd-calendar ซึ่งเป็นข้อมูลสาธารณะ)
app.use('/api', api)

// หน้าเว็บ LIFF แยกไฟล์อยู่ในโฟลเดอร์ public/ (liff.html, css/, js/, img/)
// เปิดให้เข้าถึงเฉพาะโฟลเดอร์ public — ไฟล์โค้ดฝั่ง server (index.js ฯลฯ) จะไม่ถูกเปิดให้ดาวน์โหลด
app.use(express.static(path.join(__dirname, 'public')))
app.get('/liff', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'liff.html'))
})

const PORT = process.env.PORT || 3000
app.listen(PORT, () => console.log(`Bot running on port ${PORT}`))
