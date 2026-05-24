const express = require('express')
const line = require('@line/bot-sdk')

const config = {
  channelAccessToken: process.env.LINE_TOKEN,
  channelSecret: process.env.LINE_SECRET
}

const client = new line.messagingApi.MessagingApiClient(config)
const app = express()

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

const PORT = process.env.PORT || 3000
app.listen(PORT, () => console.log(`Bot running on port ${PORT}`))
