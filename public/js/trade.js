// trade.js — บันทึกการซื้อ-ขายหุ้น (ต้องโหลดหลัง app.js)
// Trade tab listeners
document.addEventListener('DOMContentLoaded', function() {
  const tabBuy = document.getElementById('tab-buy')
  const tabSell = document.getElementById('tab-sell')
  if (tabBuy) tabBuy.addEventListener('click', function() { switchTradeTab('buy') })
  if (tabSell) tabSell.addEventListener('click', function() { switchTradeTab('sell') })
})
// Fallback for LIFF (DOMContentLoaded may have already fired)
window.addEventListener('load', function() {
  const tabBuy = document.getElementById('tab-buy')
  const tabSell = document.getElementById('tab-sell')
  if (tabBuy) tabBuy.onclick = function() { switchTradeTab('buy') }
  if (tabSell) tabSell.onclick = function() { switchTradeTab('sell') }
})

// ── Trade Tab Functions ──
let currentTradeTab = 'buy'
function switchTradeTab(tab) {
  currentTradeTab = tab
  const buyForm = document.getElementById('trade-buy-form')
  const sellForm = document.getElementById('trade-sell-form')
  const buyBtn = document.getElementById('tab-buy')
  const sellBtn = document.getElementById('tab-sell')
  if (tab === 'buy') {
    buyForm.style.display = ''
    sellForm.style.display = 'none'
    buyBtn.classList.add('active-buy')
    sellBtn.classList.remove('active-buy','active-sell')
    const sb = document.getElementById('trade-submit-btn'); if (sb) { sb.textContent = 'บันทึกการซื้อ'; sb.classList.remove('sell') }
  } else {
    buyForm.style.display = 'none'
    sellForm.style.display = ''
    sellBtn.classList.add('active-sell')
    buyBtn.classList.remove('active-buy','active-sell')
    const sb = document.getElementById('trade-submit-btn'); if (sb) { sb.textContent = 'บันทึกการขาย'; sb.classList.add('sell') }
  }
}

// วันที่ซื้อ/ขาย ตั้งค่าเริ่มต้นเป็นวันนี้ (แก้ได้)
(function setTradeDefaultDates() {
  const d = new Date()
  const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  ;['buy-date', 'sell-date'].forEach(id => { const el = document.getElementById(id); if (el && !el.value) el.value = iso })
})()

function calcBuy() {
  const price = +document.getElementById('buy-price').value || 0
  const qty = +document.getElementById('buy-qty').value || 0
  document.getElementById('buy-total').textContent = fmt(price * qty) + ' บาท'
}

function calcSell() {
  const qty = +document.getElementById('sell-qty').value || 0
  const oldPrice = +document.getElementById('sell-old-price').value || 0
  const newPrice = +document.getElementById('sell-price').value || 0
  const cost = qty * oldPrice
  const total = qty * newPrice
  const profit = total - cost
  document.getElementById('sell-cost').textContent = fmt(cost) + ' บาท'
  document.getElementById('sell-total').textContent = fmt(total) + ' บาท'
  const profitEl = document.getElementById('sell-profit')
  const profitLabel = document.getElementById('sell-profit-label')
  if (profit > 0) {
    profitLabel.textContent = 'กำไร'
    profitEl.textContent = '+' + fmt(profit) + ' บาท'
    profitEl.className = 'tr-summary-val'
  } else if (profit < 0) {
    profitLabel.textContent = 'ขาดทุน'
    profitEl.textContent = fmt(profit) + ' บาท'
    profitEl.className = 'tr-summary-val'
  } else {
    profitLabel.textContent = 'กำไร/ขาดทุน'
    profitEl.textContent = '0.00 บาท'
    profitEl.className = 'tr-summary-val'
  }
  const pctEl = document.getElementById('sell-profit-pct')
  const summary = document.getElementById('sell-summary')
  if (summary) summary.classList.toggle('loss', profit < 0)
  if (pctEl) pctEl.textContent = (cost > 0 && profit !== 0) ? `${profit > 0 ? '+' : ''}${(profit / cost * 100).toFixed(2)}% จากต้นทุน` : ''
}

async function submitTrade() {
  let msg = ''
  if (currentTradeTab === 'buy') {
    const ticker = document.getElementById('buy-ticker').value.trim()
    const price = +document.getElementById('buy-price').value
    const qty = +document.getElementById('buy-qty').value
    const dateRaw = document.getElementById('buy-date').value
    const note = document.getElementById('buy-note').value.trim()
    let valid = true
    if (!ticker) { document.getElementById('buy-ticker').classList.add('error'); document.getElementById('err-buy-ticker').style.display='block'; valid=false }
    if (!price) { document.getElementById('buy-price').classList.add('error'); document.getElementById('err-buy-price').style.display='block'; valid=false }
    if (!qty) { document.getElementById('buy-qty').classList.add('error'); document.getElementById('err-buy-qty').style.display='block'; valid=false }
    if (!valid) return
    let dateDisplay = '-'
    if (dateRaw) { const [y,m,d] = dateRaw.split('-'); const months=['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.']; dateDisplay=`${+d} ${months[+m-1]} ${+y+543}` }
    msg = `🟢 บันทึกการซื้อหุ้น
วันที่ : ${thaiDateNow()}
─────────────────
ชื่อหุ้น : ${ticker}
ราคาหุ้นที่ซื้อ : ${fmt(price)} บาท
จำนวนหุ้นที่ซื้อ : ${fmtQty(qty)} หุ้น
จำนวนเงินที่ซื้อ : ${fmt(price * qty)} บาท
วันที่ซื้อ : ${dateDisplay}
หมายเหตุ : ${note || '-'}
─────────────────
คำนวณด้วย น้องถั่ว ถัวหุ้น @nongthuastockbean`
  } else {
    const ticker = document.getElementById('sell-ticker').value.trim()
    const qty = +document.getElementById('sell-qty').value
    const oldPrice = +document.getElementById('sell-old-price').value
    const newPrice = +document.getElementById('sell-price').value
    const dateRaw = document.getElementById('sell-date').value
    const note = document.getElementById('sell-note').value.trim()
    let valid = true
    if (!ticker) { document.getElementById('sell-ticker').classList.add('error'); document.getElementById('err-sell-ticker').style.display='block'; valid=false }
    if (!qty) { document.getElementById('sell-qty').classList.add('error'); document.getElementById('err-sell-qty').style.display='block'; valid=false }
    if (!oldPrice) { document.getElementById('sell-old-price').classList.add('error'); document.getElementById('err-sell-old-price').style.display='block'; valid=false }
    if (!newPrice) { document.getElementById('sell-price').classList.add('error'); document.getElementById('err-sell-price').style.display='block'; valid=false }
    if (!valid) return
    const cost = qty * oldPrice
    const total = qty * newPrice
    const profit = total - cost
    let dateDisplay = '-'
    if (dateRaw) { const [y,m,d] = dateRaw.split('-'); const months=['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.']; dateDisplay=`${+d} ${months[+m-1]} ${+y+543}` }
    msg = `🔴 บันทึกการขายหุ้น
วันที่ : ${thaiDateNow()}
─────────────────
ชื่อหุ้น : ${ticker}
จำนวนหุ้นที่ขาย : ${fmtQty(qty)} หุ้น
ราคาหุ้นเดิม : ${fmt(oldPrice)} บาท
ราคาทุน : ${fmt(cost)} บาท
ราคาหุ้นที่ขาย : ${fmt(newPrice)} บาท
ราคาขาย : ${fmt(total)} บาท
กำไร/ขาดทุน : ${profit >= 0 ? '+' : ''}${fmt(profit)} บาท
วันที่ขาย : ${dateDisplay}
หมายเหตุ : ${note || '-'}
─────────────────
คำนวณด้วย น้องถั่ว ถัวหุ้น @nongthuastockbean`
  }
  try {
    await liffInitPromise
    if (!liffReady) { alert('เชื่อมต่อ LINE ไม่สำเร็จ กรุณาปิดหน้านี้แล้วเปิดใหม่'); return }
    if (!liff.isInClient()) { alert('ฟีเจอร์นี้ใช้ได้เฉพาะเมื่อเปิดผ่านแอป LINE เท่านั้น'); return }
    await liff.sendMessages([{ type: 'text', text: msg }])
    liff.closeWindow()
  } catch(e) {
    alert('ส่งข้อความไม่สำเร็จ: ' + (e.message || 'กรุณาลองใหม่'))
  }
}

// Clear errors on input
document.querySelectorAll('input').forEach(el => {
  el.addEventListener('input', () => {
    el.classList.remove('error')
    const err = document.getElementById('err-' + el.id)
    if (err) err.style.display = 'none'
  })
})

