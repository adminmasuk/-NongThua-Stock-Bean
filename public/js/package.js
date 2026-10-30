// package.js — หน้าแพ็กเกจ (ต้องโหลดหลัง app.js)
// ============================================================
// หน้าแพ็กเกจ — แสดงตามสถานะผู้ใช้ (pkgUser)
// TODO: ดึงค่าจริงจาก backend เช่น GET /api/me → { tier, used, limit, expiresAt, proOpen }
// ============================================================
let pkgUser = { tier: 'free', used: 20, limit: 30, expiresAt: null, proOpen: false }

function pkgThaiDate(d) {
  return `${d.getDate()} ${THAI_MONTHS_SHORT[d.getMonth()]} ${d.getFullYear() + 543}`
}

function renderPkgPage() {
  const u = pkgUser
  const body = document.getElementById('pkg-status-body')
  const tierEl = document.getElementById('pkg-tier')
  const alertEl = document.getElementById('pkg-alert')
  const cta = document.getElementById('pkg-cta')
  if (!body) return
  const isPro = u.tier === 'pro'
  tierEl.textContent = isPro ? 'PRO' : 'FREE'
  tierEl.classList.toggle('pro', isPro)
  const now = new Date()
  const reset = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  let alert = null
  if (isPro) {
    const exp = u.expiresAt ? new Date(u.expiresAt) : null
    const daysLeft = exp ? Math.ceil((exp - now) / 86400000) : null
    body.innerHTML = `<div class="pkg-big">ไม่จำกัด<small> ครั้ง</small></div>
      <div class="pkg-meta"><span>บันทึกเข้าแชตได้ไม่จำกัด</span>${exp ? `<span>ใช้งานถึง ${pkgThaiDate(exp)}</span>` : ''}</div>`
    if (daysLeft != null && daysLeft <= 30 && daysLeft >= 0) alert = ['warn', `<b>Pro จะหมดอายุในอีก ${daysLeft} วัน</b> ต่ออายุเพื่อใช้งานต่อได้ไม่สะดุด`]
  } else {
    const remaining = Math.max(u.limit - u.used, 0)
    const pct = u.limit ? Math.min(u.used / u.limit * 100, 100) : 0
    body.innerHTML = `<div class="pkg-big${remaining === 0 ? ' empty' : ''}">${remaining}<small> / ${u.limit} เครดิต</small></div>
      <div class="pkg-track" role="progressbar" aria-label="เครดิตที่ใช้ไป" aria-valuemin="0" aria-valuemax="${u.limit}" aria-valuenow="${u.used}"><div class="pkg-fill${remaining === 0 ? ' empty' : ''}" style="width:${pct}%"></div></div>
      <div class="pkg-meta"><span>ใช้ไป ${u.used} จาก ${u.limit}</span><span>รีเซ็ต ${pkgThaiDate(reset)}</span></div>
      <p class="pkg-note">นับ <b>1 เครดิต</b> เมื่อกด "บันทึกข้อมูล" ส่งผลเข้าแชต LINE · คำนวณและดูผลบนหน้าจอ<b>ไม่ใช้เครดิต</b></p>`
    if (remaining === 0) alert = ['danger', `<b>เครดิตเดือนนี้หมดแล้ว</b> คำนวณดูผลได้ตามปกติ แต่จะบันทึกเข้าแชตได้อีกครั้งวันที่ ${pkgThaiDate(reset)}`]
    else if (remaining <= 5) alert = ['info', `<b>เหลืออีก ${remaining} เครดิต</b> เครดิตจะรีเซ็ตวันที่ ${pkgThaiDate(reset)}`]
  }
  if (alert) {
    alertEl.hidden = false
    alertEl.className = 'pkg-alert' + (alert[0] === 'danger' ? ' danger' : alert[0] === 'info' ? ' info' : '')
    alertEl.innerHTML = `<span class="pkg-alert-icon" aria-hidden="true"><span>!</span></span><span>${alert[1]}</span>`
  } else alertEl.hidden = true
  // คอลัมน์ "ของคุณ"
  document.getElementById('pkg-col-free').classList.toggle('current', !isPro)
  document.getElementById('pkg-col-pro').classList.toggle('current', isPro)
  document.querySelectorAll('.pkg-table tbody tr').forEach(tr => {
    tr.children[1].classList.toggle('current', !isPro)
    tr.children[2].classList.toggle('current', isPro)
  })
  // ปุ่ม
  if (isPro) {
    const exp = u.expiresAt ? new Date(u.expiresAt) : null
    const daysLeft = exp ? Math.ceil((exp - now) / 86400000) : null
    cta.innerHTML = (daysLeft != null && daysLeft <= 30)
      ? `<button type="button" class="pkg-btn" onclick="startProPayment()">ต่ออายุ Pro 99 บาท</button>`
      : `<p class="pkg-cta-note">ขอบคุณที่ใช้ Pro · ใช้งานได้ถึง ${exp ? pkgThaiDate(exp) : '-'}</p>`
  } else if (u.proOpen) {
    cta.innerHTML = `<button type="button" class="pkg-btn" onclick="startProPayment()">สมัคร Pro 99 บาท/ปี</button>`
  } else {
    cta.innerHTML = `<button type="button" class="pkg-btn soon" disabled aria-describedby="pkg-soon-note">เปิดให้สมัครเร็วๆ นี้</button>
      <p class="pkg-cta-note" id="pkg-soon-note">ระหว่างนี้ใช้แพ็กเกจ Free ได้ 30 เครดิตทุกเดือน</p>`
  }
}

// TODO: ต่อกับหน้า PromptPay QR + SlipOK เมื่อพร้อมเปิด Pro
function startProPayment() {}

function setPkgUser(next) { pkgUser = Object.assign({}, pkgUser, next); renderPkgPage() }
renderPkgPage()

