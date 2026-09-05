const express = require('express')
const line = require('@line/bot-sdk')
const path = require('path')
const { Pool } = require('pg')

const config = {
  channelAccessToken: process.env.LINE_TOKEN,
  channelSecret: process.env.LINE_SECRET
}

const client = new line.messagingApi.MessagingApiClient(config)
const app = express()

// เชื่อมต่อ Supabase (PostgreSQL) ผ่าน pg Pool — ใช้ DATABASE_URL ที่ตั้งไว้ใน Render Environment แล้ว
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
})

app.post('/webhook', line.middleware(config), async (req, res) => {
  const events = req.body.events
  await Promise.all(events.map(handleEvent))
  res.json({ status: 'ok' })
})

async function handleEvent(event) {
  if (event.type !== 'message' || event.message.type !== 'text') return

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

  return client.replyMessage({
    replyToken: event.replyToken,
    messages: [{ type: 'text', text: resultText }]
  })
}

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

app.use(express.static(__dirname))
app.get('/liff', (req, res) => {
  res.sendFile(path.join(__dirname, 'liff_final.html'))
})

const PORT = process.env.PORT || 3000
app.listen(PORT, () => console.log(`Bot running on port ${PORT}`))
