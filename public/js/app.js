// app.js — LIFF, เมนู/นำทาง, คำนวณ, Popup ผลลัพธ์, ส่งเข้าแชต, การ์ดเครดิต, โปรไฟล์

const LIFF_ID = '2010243171-8Hhy0bHv'
let avgData = null, divData = null
let liffReady = false

function thaiDateNow() {
  const months = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.']
  const d = new Date()
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear() + 543}`
}

// Initialize LIFF ONCE when the page loads (not on every share click)
// กัน error กรณี LIFF SDK โหลดไม่ทัน/ไม่สำเร็จ ไม่ให้ทั้งหน้าหยุดทำงาน (ปุ่ม/เมนู/popup อื่นๆ ยังใช้งานได้)
const liffInitPromise = (typeof liff !== 'undefined'
  ? liff.init({ liffId: LIFF_ID })
  : Promise.reject(new Error('LIFF SDK ยังไม่โหลด')))
  .then(() => { liffReady = true })
  .catch(err => {
    console.error('LIFF init failed:', err)
    liffReady = false
  })

// Read URL parameter and go to correct page on load
function initPage() {
  let params = new URLSearchParams(window.location.search)
  let page = params.get('page')
  // LINE LIFF wraps extra query params inside liff.state, e.g. ?liff.state=%3Fpage%3Davg
  if (!page) {
    const liffState = params.get('liff.state')
    if (liffState) {
      const decoded = decodeURIComponent(liffState)
      const stateParams = new URLSearchParams(decoded.startsWith('?') ? decoded.slice(1) : decoded)
      page = stateParams.get('page')
    }
  }
  // รองรับลิงก์จาก Rich Menu: ?page=avg | div (หรือ dividend) | divstock | trade | xd | pkg
  const PAGE_ALIASES = { dividend: 'div', calendar: 'xd', package: 'pkg', pro: 'pkg' }
  const VALID_PAGES = ['home', 'avg', 'div', 'divstock', 'trade', 'xd', 'pkg']
  page = PAGE_ALIASES[page] || page
  goPage(VALID_PAGES.includes(page) ? page : 'home')
  window.scrollTo(0, 0)
}

// Navigation
function goPage(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'))
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'))
  document.querySelectorAll('.menu-item').forEach(n => n.classList.remove('active'))
  const pageEl = document.getElementById('page-' + page)
  if (pageEl) pageEl.classList.add('active')
  const navEl = document.getElementById('nav-' + page)
  if (navEl) navEl.classList.add('active')
  document.querySelectorAll('.menu-item').forEach(el => {
    const onclick = el.getAttribute('onclick') || ''
    if (onclick.includes(page)) el.classList.add('active')
  })
}

// เมนู: ไปยัง section ในหน้าแรก (ปฏิทินหลักทรัพย์ / แพ็กเกจ)
function goSection(id, el) {
  goPage('home')
  document.querySelectorAll('.menu-item').forEach(n => n.classList.remove('active'))
  if (el) el.classList.add('active')
  setTimeout(() => {
    const target = document.getElementById(id)
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, 50)
}

function toggleMenu() {
  document.getElementById('menuOverlay').classList.toggle('show')
  document.getElementById('menuPanel').classList.toggle('show')
}

function closeModal(id) {
  document.getElementById(id).classList.remove('show')
  // ล้างฟอร์มที่เกี่ยวข้อง
  if (id === 'modal-avg') clearForm('avg')
  else if (id === 'modal-div') clearForm('div')
  else if (id === 'modal-divstock') clearForm('divstock')
}

function clearForm(type) {
  if (type === 'avg') {
    ['avg-ticker','avg-oldQty','avg-oldPrice','avg-newQty','avg-newPrice'].forEach(id => {
      const el = document.getElementById(id)
      if (el) { el.value = ''; el.classList.remove('error') }
    })
  } else if (type === 'div') {
    ['div-ticker','div-qty','div-dps','div-xd','div-paydate'].forEach(id => {
      const el = document.getElementById(id)
      if (el) { el.value = ''; el.classList.remove('error') }
    })
  } else if (type === 'divstock') {
    ['ds-ticker','ds-qty','ds-price','ds-dps'].forEach(id => {
      const el = document.getElementById(id)
      if (el) { el.value = ''; el.classList.remove('error') }
    })
    const tax = document.getElementById('ds-tax')
    if (tax) tax.value = '10'
  }
  // ซ่อน error messages
  document.querySelectorAll('.err-msg').forEach(el => el.style.display = 'none')
}

document.querySelectorAll('.modal-overlay').forEach(el => {
  el.addEventListener('click', e => { if(e.target === el) closeModal(el.id) })
})

// Format
function fmt(n) { return Number(n).toLocaleString('th-TH',{minimumFractionDigits:2,maximumFractionDigits:2}) }
function fmt6(n) { return Number(n).toLocaleString('th-TH',{minimumFractionDigits:2,maximumFractionDigits:6}) }
function fmtQty(n) { return Number(n).toLocaleString('th-TH') }
function fmtInput(el) { if(el.value && !isNaN(el.value)) el.value = parseFloat(el.value).toFixed(2) }
function fmtInputDps(el) { if(el.value && !isNaN(el.value)) el.value = parseFloat(el.value).toFixed(6).replace(/\.?0+$/, '') }

// Validate
function validate(fields) {
  let ok = true
  fields.forEach(f => {
    const el = document.getElementById(f.id)
    const err = document.getElementById('err-' + f.id)
    if (!f.check(el.value)) {
      el.classList.add('error'); if(err) err.style.display = 'block'; ok = false
    } else {
      el.classList.remove('error'); if(err) err.style.display = 'none'
    }
  })
  return ok
}

// Calc Avg
function calcAvg() {
  const ok = validate([
    {id:'avg-ticker', check: v => v.trim() !== ''},
    {id:'avg-oldQty', check: v => v !== '' && +v >= 100},
    {id:'avg-oldPrice', check: v => v !== '' && +v > 0},
    {id:'avg-newQty', check: v => v !== '' && +v >= 100},
    {id:'avg-newPrice', check: v => v !== '' && +v > 0},
  ])
  if (!ok) return
  const ticker = document.getElementById('avg-ticker').value.trim().toUpperCase()
  const oldQty = +document.getElementById('avg-oldQty').value
  const oldPrice = +document.getElementById('avg-oldPrice').value
  const newQty = +document.getElementById('avg-newQty').value
  const newPrice = +document.getElementById('avg-newPrice').value
  const totalQty = oldQty + newQty
  const totalCost = (oldQty * oldPrice) + (newQty * newPrice)
  const avgPrice = totalCost / totalQty
  const moneyNeeded = newQty * newPrice
  const note = document.getElementById('avg-note').value.trim()
  avgData = { ticker, totalQty, avgPrice, moneyNeeded, totalCost, note, newQty, oldPrice }
  document.getElementById('res-avg-date').textContent = thaiDateNow()
  document.getElementById('res-avg-ticker').textContent = ticker
  document.getElementById('res-avg-old').textContent = fmt(oldPrice) + ' บาท'
  document.getElementById('res-avg-price').textContent = fmt(avgPrice) + ' บาท'
  document.getElementById('res-avg-newqty').textContent = fmtQty(newQty) + ' หุ้น'
  document.getElementById('res-avg-qty').textContent = fmtQty(totalQty) + ' หุ้น'
  document.getElementById('res-avg-money').textContent = fmt(moneyNeeded) + ' บาท'
  document.getElementById('res-avg-note').textContent = note || '-'
  document.getElementById('modal-avg').classList.add('show')
}


// Calc Dividend Stock
function calcDivStock() {
  const ok = validate([
    {id:'ds-ticker', check: v => v.trim() !== ''},
    {id:'ds-qty', check: v => v !== '' && +v > 0},
    {id:'ds-price', check: v => v !== '' && +v > 0},
    {id:'ds-dps', check: v => v !== '' && +v > 0},
  ])
  if (!ok) return
  const ticker = document.getElementById('ds-ticker').value.trim().toUpperCase()
  const qty = +document.getElementById('ds-qty').value
  const price = +document.getElementById('ds-price').value
  const dps = +document.getElementById('ds-dps').value
  const taxRate = +document.getElementById('ds-tax').value || 0
  const divYield = (dps / price) * 100
  const gross = qty * dps
  const tax = gross * (taxRate / 100)
  const net = gross - tax
  document.getElementById('res-ds-ticker').textContent = ticker
  document.getElementById('res-ds-yield').textContent = divYield.toFixed(2) + '%'
  document.getElementById('res-ds-gross').textContent = fmt(gross) + ' บาท'
  document.getElementById('res-ds-taxrate').textContent = taxRate + '%'
  document.getElementById('res-ds-tax').textContent = '- ' + fmt(tax) + ' บาท'
  document.getElementById('res-ds-net').textContent = fmt(net) + ' บาท'
  window._dsData = { ticker, qty, price, dps, taxRate, divYield, gross, tax, net }
  document.getElementById('modal-divstock').classList.add('show')
}

// Calc Div
function calcDiv() {
  const ok = validate([
    {id:'div-ticker', check: v => v.trim() !== ''},
    {id:'div-qty', check: v => v !== '' && +v > 0},
    {id:'div-dps', check: v => v !== '' && +v > 0},
  ])
  if (!ok) return
  const ticker = document.getElementById('div-ticker').value.trim().toUpperCase()
  const qty = +document.getElementById('div-qty').value
  const dps = +document.getElementById('div-dps').value
  const xdRaw = document.getElementById('div-xd').value
  const payRaw = document.getElementById('div-paydate').value
  const gross = qty * dps
  const taxRate = 10
  const tax = gross * (taxRate / 100)
  const net = gross - tax
  const note = document.getElementById('div-note').value.trim()

  // Format XD date to Thai
  let xdDisplay = '-'
  if (xdRaw) {
    const [y, m, d] = xdRaw.split('-')
    const months = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.']
    xdDisplay = `${+d} ${months[+m-1]} ${+y + 543}`
  }
  let payDisplay = '-'
  if (payRaw) {
    const [y, m, d] = payRaw.split('-')
    const months = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.']
    payDisplay = `${+d} ${months[+m-1]} ${+y + 543}`
  }

  divData = { ticker, qty, dps, taxRate, gross, tax, net, note, xdDisplay, payDisplay }
  document.getElementById('res-div-date').textContent = thaiDateNow()
  document.getElementById('res-div-ticker').textContent = ticker
  document.getElementById('res-div-qty').textContent = fmtQty(qty) + ' หุ้น'
  document.getElementById('res-div-dps').textContent = fmt6(dps) + ' บาท'
  document.getElementById('res-div-gross').textContent = fmt6(gross) + ' บาท'
  document.getElementById('res-div-taxrate').textContent = taxRate + '%'
  document.getElementById('res-div-tax').textContent = '- ' + fmt6(tax) + ' บาท'
  document.getElementById('res-div-net').textContent = fmt6(net) + ' บาท'
  document.getElementById('res-div-xd').textContent = xdDisplay
  document.getElementById('res-div-paydate').textContent = payDisplay
  document.getElementById('res-div-note').textContent = note || '-'
  document.getElementById('modal-div').classList.add('show')
}

// Save image
async function saveImg(modalId) {
  try {
    const { default: html2canvas } = await import('https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/+esm')
    const modal = document.querySelector('#' + modalId + ' .modal')
    const canvas = await html2canvas(modal, { scale: 2, useCORS: true })
    const link = document.createElement('a')
    link.download = 'nongthua-result.png'
    link.href = canvas.toDataURL()
    link.click()
  } catch(e) {
    alert('ไม่สามารถบันทึกรูปได้ใน LINE กรุณาใช้ปุ่มแคปหน้าจอแทน')
  }
}

// Share to LINE
async function shareResult(type) {
  let msg = ''
  if (type === 'avg' && avgData) {
    msg = `📊 ผลการคำนวณราคาหุ้นใหม่
วันที่ : ${thaiDateNow()}
─────────────────
ชื่อหุ้น : ${avgData.ticker}
ราคาเฉลี่ยใหม่: ${fmt(avgData.avgPrice)} บาท
ราคาเฉลี่ยเดิม : ${fmt(avgData.oldPrice)} บาท

จำนวนหุ้นที่ต้องซื้อเพิ่ม: ${fmtQty(avgData.newQty)} หุ้น
จำนวนหุ้นทั้งหมด : ${fmtQty(avgData.totalQty)} หุ้น

จำนวนเงินที่ใช้ซื้อเพิ่ม: ${fmt(avgData.moneyNeeded)} บาท
หมายเหตุ : ${avgData.note ? avgData.note : '-'}
─────────────────
คำนวณด้วย น้องถั่ว ถัวหุ้น @nongthuastockbean`
  } else if (type === 'divstock' && window._dsData) {
    const d = window._dsData
    msg = `📊 ${d.ticker} — ปันผลหุ้น
─────────────────
Dividend Yield: ${d.divYield.toFixed(2)}%
ปันผลก่อนหักภาษี: ${fmt(d.gross)} บาท
ภาษีหัก ${d.taxRate}%: -${fmt(d.tax)} บาท
ปันผลสุทธิ/ปี: ${fmt(d.net)} บาท
─────────────────
คำนวณด้วย น้องถั่ว ถัวหุ้น @nongthuastockbean`
  } else if (type === 'div' && divData) {
    msg = `💰 ผลการคำนวณเงินปันผล
วันที่ : ${thaiDateNow()}
─────────────────
ชื่อหุ้น : ${divData.ticker}
จำนวนหุ้น : ${fmtQty(divData.qty)} หุ้น
ปันผล/หุ้น : ${fmt6(divData.dps)} บาท
วันประกาศ XD : ${divData.xdDisplay}
วันจ่ายปันผล : ${divData.payDisplay}

ปันผลสุทธิ: ${fmt6(divData.net)} บาท

หมายเหตุ : ${divData.note ? divData.note : '-'}
─────────────────
คำนวณด้วย น้องถั่ว ถัวหุ้น @nongthuastockbean`
  }
  try {
    await liffInitPromise
    if (!liffReady) {
      alert('เชื่อมต่อ LINE ไม่สำเร็จ กรุณาปิดหน้านี้แล้วเปิดใหม่อีกครั้ง')
      return
    }
    if (!liff.isInClient()) {
      alert('ฟีเจอร์ส่งผลเข้าแชทใช้ได้เฉพาะเมื่อเปิดผ่านแอป LINE เท่านั้น')
      return
    }
    await liff.sendMessages([{ type: 'text', text: msg }])
    liff.closeWindow()
  } catch(e) {
    alert('ส่งข้อความไม่สำเร็จ: ' + (e.message || 'กรุณาลองใหม่อีกครั้ง'))
  }
}

// Init page from URL param
initPage()

// Thai month names (ใช้ร่วมกันหลายจุดในหน้าแรก)
const THAI_MONTHS_SHORT = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.']
const THAI_MONTHS_FULL = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม']

// Credit status display (หน้าแรก) — placeholder UI รอเชื่อม Supabase users.usage_count จริงผ่าน backend API
function updateCreditDisplay(used, total) {
  const remainEl = document.getElementById('credit-remaining-text')
  const usedEl = document.getElementById('credit-used-text')
  const fillEl = document.getElementById('credit-progress-fill')
  const resetEl = document.getElementById('credit-reset-text')
  if (total == null) {
    // Pro / เครดิตไม่จำกัด
    if (remainEl) remainEl.textContent = '∞'
    if (usedEl) usedEl.textContent = 'ใช้งานได้ไม่จำกัด'
    if (fillEl) fillEl.style.width = '100%'
  } else {
    const remaining = Math.max(total - used, 0)
    const pct = total > 0 ? Math.min((used / total) * 100, 100) : 0
    if (remainEl) remainEl.textContent = remaining
    if (usedEl) usedEl.textContent = `ใช้ไป ${used} จาก ${total} เครดิต`
    if (fillEl) fillEl.style.width = pct + '%'
  }
  if (resetEl) {
    const now = new Date()
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1)
    resetEl.textContent = `รีเซ็ต ${nextMonth.getDate()} ${THAI_MONTHS_SHORT[nextMonth.getMonth()]} ${nextMonth.getFullYear() + 543}`
  }
}
// TODO: แทนที่บรรทัดนี้ด้วยการดึงค่าจริงจาก Supabase (users.usage_count) ผ่าน backend API
// เมื่อระบบ access control + usage count เขียนเสร็จ เช่น:
// fetch('/api/user-status?userId=' + lineUserId).then(r => r.json()).then(d => updateCreditDisplay(d.usageCount, d.tier === 'pro' ? null : d.creditLimit))
updateCreditDisplay(20, 30)


// โปรไฟล์จาก LIFF — ใช้ชื่อจริงของผู้ใช้เมื่อเปิดผ่าน LINE ("สมาชิกตั้งแต่" ต้องรอข้อมูล created_at จาก Supabase จึงยังไม่แสดง)
async function loadProfileInfo() {
  const nameEl = document.getElementById('profile-name')
  const subEl = document.getElementById('profile-sub')
  try {
    await liffInitPromise
    if (liffReady && liff.isLoggedIn && liff.isLoggedIn()) {
      const profile = await liff.getProfile()
      if (nameEl && profile.displayName) nameEl.textContent = profile.displayName
      if (subEl && profile.userId) subEl.textContent = 'ID ' + profile.userId.slice(-8)
    }
  } catch (err) {
    console.error('โหลดโปรไฟล์ไม่สำเร็จ:', err)
  }
}
loadProfileInfo()

