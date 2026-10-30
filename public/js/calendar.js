// calendar.js — ปฏิทินหลักทรัพย์ หน้าแรก + หน้าเต็ม + ค้นหาขั้นสูง (ต้องโหลดหลัง app.js)
// ============================================================
// ปฏิทินหลักทรัพย์ (XD Calendar) — Phase 5
// ดึงข้อมูลจาก backend GET /api/xd-calendar ซึ่งอ่านจากตาราง public.xd_calendar ใน Supabase
// (ดู routes/xdCalendar.js และ supabase_schema_xd_calendar.sql ที่ส่งไปพร้อมกันสำหรับฝั่ง backend)
// ============================================================

// แปลง 'YYYY-MM-DD' (ปี ค.ศ. จาก DB) เป็นวันที่แบบไทย เช่น { day:'02', month:'ต.ค.', full:'02 ต.ค. 2569' }
function formatXdDate(isoDate) {
  if (!isoDate) return { day: '-', month: '', full: '-' }
  const [y, m, d] = String(isoDate).slice(0, 10).split('-').map(Number)
  const day = String(d).padStart(2, '0')
  const month = THAI_MONTHS_SHORT[m - 1] || ''
  return { day, month, full: `${day} ${month} ${y + 543}` }
}

// จัดรูปแบบตัวเลขแบบไทย เช่น 4.5 -> "4.50"
function fmtXdNum(n, decimals) {
  return Number(n).toLocaleString('th-TH', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

// บรรทัดสรุปในรายการ (ก่อนกดขยาย) — ถ้ามีเงินปันผล (type XD) โชว์ยอด/วันจ่าย ถ้าไม่มี (XM/XR) โชว์แค่ประเภท
function buildXdSummaryLine(item) {
  if (item.dps != null) {
    const dpsDisplay = fmtXdNum(item.dps, Number(item.dps) < 1 ? 3 : 2)
    const payDisplay = item.pay_date ? formatXdDate(item.pay_date).full : '-'
    return `จ่ายเงินปันผล ${dpsDisplay} บ./หุ้น · วันจ่ายปันผล ${payDisplay}`
  }
  if (item.type === 'XM') return 'ขึ้นเครื่องหมายห้ามซื้อขาย (ประชุมผู้ถือหุ้น)'
  if (item.type === 'XR') return 'ขึ้นเครื่องหมายห้ามซื้อขาย (สิทธิจองซื้อหุ้นเพิ่มทุน)'
  return `ขึ้นเครื่องหมาย ${item.type || ''}`
}

// สร้าง markup ของ 1 รายการ (แถวสรุป + แผงรายละเอียดที่กดขยายได้) จากข้อมูล 1 แถวของตาราง xd_calendar
function buildXdItemHtml(item, prefix) {
  const ex = formatXdDate(item.xd_date)
  const record = item.record_date ? formatXdDate(item.record_date) : null
  const pay = item.pay_date ? formatXdDate(item.pay_date) : null
  const bookClose = item.book_close_date ? formatXdDate(item.book_close_date).full : '-'
  const key = (prefix || '') + 'row' + item.id
  const dpsDisplay = item.dps != null ? fmtXdNum(item.dps, Number(item.dps) < 1 ? 3 : 2) + ' บาท' : '-'
  const yieldDisplay = item.yield_pct != null ? Number(item.yield_pct).toFixed(1) + '%' : '-'
  const periodDisplay = (item.period_start && item.period_end)
    ? `${formatXdDate(item.period_start).full} - ${formatXdDate(item.period_end).full}`
    : '-'
  return `
    <div class="xd-item-wrap" data-type="${item.type}" >
      <div class="xd-item" onclick="toggleXdDetail('${key}')">
        <div class="xd-date"><span class="xd-day">${ex.day}</span><span class="xd-month">${ex.month}</span></div>
        <div class="xd-info">
          <div class="xd-name">${item.ticker} <span class="xd-tag t-${item.type}">${item.type}</span></div>
          <div class="xd-detail">${buildXdSummaryLine(item)}</div>
        </div>
        <div class="xd-yield">${yieldDisplay} <span>Yield</span></div>
        <div class="xd-chevron" id="xd-chevron-${key}">›</div>
      </div>
      <div class="xd-detail-panel" id="xd-detail-panel-${key}">
        <div class="xd-detail-grid">
          <div class="xd-detail-field"><div class="xd-detail-label">วันขึ้นเครื่องหมาย</div><div class="xd-detail-value">${ex.full}</div></div>
          <div class="xd-detail-field"><div class="xd-detail-label">วันปิดสมุดทะเบียน</div><div class="xd-detail-value">${bookClose}</div></div>
          <div class="xd-detail-field"><div class="xd-detail-label">วันกำหนดรายชื่อผู้ถือหุ้น</div><div class="xd-detail-value">${record ? record.full : '-'}</div></div>
          <div class="xd-detail-field"><div class="xd-detail-label">วันจ่ายปันผล</div><div class="xd-detail-value">${pay ? pay.full : '-'}</div></div>
          <div class="xd-detail-field"><div class="xd-detail-label">ประเภท</div><div class="xd-detail-value">${item.category || '-'}</div></div>
          <div class="xd-detail-field"><div class="xd-detail-label">เงินปันผล (บาท/หุ้น)</div><div class="xd-detail-value" style="color:#1a5c28;">${dpsDisplay}</div></div>
          <div class="xd-detail-field"><div class="xd-detail-label">รอบผลประกอบการ</div><div class="xd-detail-value" style="font-size:13px;">${periodDisplay}</div></div>
          <div class="xd-detail-field"><div class="xd-detail-label">เงินปันผลจาก</div><div class="xd-detail-value" style="font-size:13px;">${item.dividend_source || '-'}</div></div>
        </div>
      </div>
    </div>`
}

// แบ่งรายการเป็นหน้า หน้าละ 3 รายการ แล้ว render ลงใน #xd-pager + สร้างจุดนำทาง #xd-dots ให้ตรงจำนวนหน้า
function renderXdCalendarPager(items) {
  const pageSize = 3
  const pagerEl = document.getElementById('xd-pager')
  const dotsEl = document.getElementById('xd-dots')
  if (!pagerEl || !dotsEl) return
  const pages = []
  for (let i = 0; i < items.length; i += pageSize) pages.push(items.slice(i, i + pageSize))
  pagerEl.innerHTML = pages.map(pageItems =>
    `<div class="xd-page"><div class="xd-list">${pageItems.map(buildXdItemHtml).join('')}</div></div>`
  ).join('')
  dotsEl.innerHTML = pages.map((_, i) =>
    `<button class="xd-dot${i === 0 ? ' active' : ''}" data-page="${i}" onclick="goXdPage(${i})" aria-label="หน้า ${i + 1}"></button>`
  ).join('')
  dotsEl.style.display = pages.length > 1 ? 'flex' : 'none'
}

// เรียก backend จริง — เมื่อ deploy route /api/xd-calendar (ดู routes/xdCalendar.js) แล้วจะได้ข้อมูลจาก Supabase ทันที
function loadXdCalendarData() {
  return fetch('/api/xd-calendar')
    .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json() })
    .then(res => (res && res.ok && Array.isArray(res.data)) ? res.data : [])
}

function initXdCalendar() {
  const emptyEl = document.getElementById('xd-empty')
  loadXdCalendarData().then(items => {
    if (!items.length) {
      if (emptyEl) { emptyEl.textContent = 'ยังไม่มีรายการในปฏิทินหลักทรัพย์ตอนนี้'; emptyEl.style.display = 'block' }
      renderXdFullList([])
      return
    }
    if (emptyEl) emptyEl.style.display = 'none'
    renderXdCalendarPager(items)
    renderXdFullList(items)
  }).catch(err => {
    console.error('โหลดข้อมูลปฏิทินหลักทรัพย์ไม่สำเร็จ:', err)
    if (emptyEl) { emptyEl.textContent = 'โหลดข้อมูลปฏิทินหลักทรัพย์ไม่สำเร็จ ลองเปิดหน้านี้ใหม่อีกครั้ง'; emptyEl.style.display = 'block' }
    const fullEmpty = document.getElementById('xd-full-empty')
    if (fullEmpty) { fullEmpty.textContent = 'โหลดข้อมูลปฏิทินหลักทรัพย์ไม่สำเร็จ ลองเปิดหน้านี้ใหม่อีกครั้ง'; fullEmpty.style.display = 'block' }
  })
}
initXdCalendar()

// หน้าปฏิทินหลักทรัพย์ (เต็มหน้า) — กรอง/ค้นหา แล้วแสดงหน้าละ 10 รายการ แบ่งหัวข้อตามเดือน
const XD_FULL_PAGE_SIZE = 10
let xdFullItems = []
let xdFullPage = 0

function renderXdFullList(items) {
  xdFullItems = Array.isArray(items) ? items : []
  xdFullPage = 0
  renderXdFullPage()
}

// ค้นหาขั้นสูง — เงื่อนไขที่ใช้อยู่ (xdAdv) และฉบับร่างระหว่างเลือกในแผง (xdAdvDraft)
const XD_YIELD_STEPS = [0, 2, 4, 6]
const newXdAdv = () => ({ types: [], from: '', to: '', minYield: 0 })
let xdAdv = newXdAdv()
let xdAdvDraft = newXdAdv()

function xdMatches(it, f, q) {
  const d = String(it.xd_date || '').slice(0, 10)
  return (!f.types.length || f.types.includes(it.type)) &&
    (!f.from || d >= f.from) &&
    (!f.to || d <= f.to) &&
    (!f.minYield || (it.yield_pct != null && Number(it.yield_pct) >= f.minYield)) &&
    (!q || String(it.ticker || '').toUpperCase().includes(q))
}

function getXdFullFiltered() {
  const input = document.getElementById('xd-search-input')
  const q = (input ? input.value : '').trim().toUpperCase()
  return { q, list: xdFullItems.filter(it => xdMatches(it, xdAdv, q)) }
}

function xdThaiDate(d) { return formatXdDate(d).full }

function countXdAdv(f) {
  return f.types.length + (f.from ? 1 : 0) + (f.to ? 1 : 0) + (f.minYield ? 1 : 0)
}

function renderXdActiveChips() {
  const box = document.getElementById('xd-active-chips')
  const n = countXdAdv(xdAdv)
  const badge = document.getElementById('xd-adv-count')
  const btn = document.getElementById('xd-adv-btn')
  if (badge) { badge.hidden = !n; badge.textContent = n }
  if (btn) btn.classList.toggle('on', n > 0)
  if (!box) return
  const chips = []
  xdAdv.types.forEach(v => chips.push([`ประเภท ${v}`, `types:${v}`]))
  if (xdAdv.from) chips.push([`ตั้งแต่ ${xdThaiDate(xdAdv.from)}`, 'from:'])
  if (xdAdv.to) chips.push([`ถึง ${xdThaiDate(xdAdv.to)}`, 'to:'])
  if (xdAdv.minYield) chips.push([`Yield ≥ ${xdAdv.minYield}%`, 'minYield:'])
  box.hidden = !chips.length
  box.innerHTML = chips.map(([label, key]) =>
    `<button type="button" class="xd-achip" onclick="removeXdAdv('${key}')" aria-label="เอาตัวกรอง ${label} ออก">${label}<b aria-hidden="true">✕</b></button>`
  ).join('') + (chips.length > 1 ? '<button type="button" class="xd-achip clear" onclick="clearXdAdv()">ล้างทั้งหมด</button>' : '')
}

function removeXdAdv(key) {
  const [field, val] = key.split(/:(.*)/s)
  if (Array.isArray(xdAdv[field])) xdAdv[field] = xdAdv[field].filter(x => x !== val)
  else xdAdv[field] = field === 'minYield' ? 0 : ''
  filterXdFull()
}
function clearXdAdv() { xdAdv = newXdAdv(); filterXdFull() }

function renderXdAdvSheet() {
  const chip = (field, val, label, on) =>
    `<button type="button" class="xd-chip${on ? ' on' : ''}" aria-pressed="${on}" onclick="toggleXdAdvDraft('${field}','${val}')">${label}</button>`
  const f = xdAdvDraft
  document.getElementById('xd-adv-types').innerHTML = ['XD', 'XM', 'XR'].map(v => chip('types', v, v, f.types.includes(v))).join('')
  document.getElementById('xd-adv-yield').innerHTML = XD_YIELD_STEPS.map(v =>
    chip('minYield', v, v ? `≥ ${v}%` : 'ไม่กำหนด', f.minYield === v)).join('')
  document.getElementById('xd-adv-from').value = f.from
  document.getElementById('xd-adv-to').value = f.to
  updateXdAdvPreview()
}

function toggleXdAdvDraft(field, val) {
  const f = xdAdvDraft
  if (field === 'minYield') f.minYield = Number(val)
  else f[field] = f[field].includes(val) ? f[field].filter(x => x !== val) : [...f[field], val]
  renderXdAdvSheet()
}

function updateXdAdvPreview() {
  const input = document.getElementById('xd-search-input')
  const q = (input ? input.value : '').trim().toUpperCase()
  const n = xdFullItems.filter(it => xdMatches(it, xdAdvDraft, q)).length
  const btn = document.getElementById('xd-adv-apply')
  if (btn) btn.textContent = `แสดงผล ${n} รายการ`
}

function resetXdAdvDraft() { xdAdvDraft = newXdAdv(); renderXdAdvSheet() }

function openXdAdv() {
  xdAdvDraft = JSON.parse(JSON.stringify(xdAdv))
  renderXdAdvSheet()
  document.getElementById('xd-adv-overlay').hidden = false
  document.getElementById('xd-adv-sheet').hidden = false
  document.body.style.overflow = 'hidden'
}
function closeXdAdv() {
  document.getElementById('xd-adv-overlay').hidden = true
  document.getElementById('xd-adv-sheet').hidden = true
  document.body.style.overflow = ''
  const btn = document.getElementById('xd-adv-btn'); if (btn) btn.focus()
}
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return
  const sh = document.getElementById('xd-adv-sheet')
  if (sh && !sh.hidden) closeXdAdv()
})


// การ์ดความหมาย XD / XM / XR — แตะที่เครื่องหมายเพื่อแสดง/ซ่อนคำอธิบาย
function toggleXdInfo(btn) {
  const open = btn.getAttribute('aria-expanded') !== 'true'
  btn.setAttribute('aria-expanded', open)
  const panel = document.getElementById(btn.getAttribute('aria-controls'))
  if (panel) panel.hidden = !open
}

function applyXdAdv() {
  xdAdv = JSON.parse(JSON.stringify(xdAdvDraft))
  if (xdAdv.from && xdAdv.to && xdAdv.from > xdAdv.to) [xdAdv.from, xdAdv.to] = [xdAdv.to, xdAdv.from]
  closeXdAdv()
  filterXdFull()
}

function renderXdFullPage() {
  const listEl = document.getElementById('xd-full-list')
  const emptyEl = document.getElementById('xd-full-empty')
  const pagerEl = document.getElementById('xd-full-pager')
  if (!listEl) return
  const { q, list } = getXdFullFiltered()
  const clearBtn = document.getElementById('xd-search-clear')
  if (clearBtn) clearBtn.hidden = !q
  const totalPages = Math.max(1, Math.ceil(list.length / XD_FULL_PAGE_SIZE))
  if (xdFullPage > totalPages - 1) xdFullPage = totalPages - 1
  if (!list.length) {
    listEl.innerHTML = ''
    if (pagerEl) pagerEl.hidden = true
    if (emptyEl) {
      emptyEl.textContent = !xdFullItems.length ? 'ยังไม่มีรายการในปฏิทินหลักทรัพย์ตอนนี้'
        : q ? `ไม่พบหุ้น "${q}" ตามเงื่อนไขที่เลือก` : 'ไม่พบรายการตามเงื่อนไขที่เลือก'
      emptyEl.style.display = 'block'
    }
    return
  }
  if (emptyEl) emptyEl.style.display = 'none'
  const pageItems = list.slice(xdFullPage * XD_FULL_PAGE_SIZE, (xdFullPage + 1) * XD_FULL_PAGE_SIZE)
  const groups = []
  pageItems.forEach(item => {
    const [y, m] = String(item.xd_date || '').slice(0, 7).split('-').map(Number)
    const label = (y && m) ? `${THAI_MONTHS_FULL[m - 1]} ${y + 543}` : 'ไม่ระบุวันที่'
    let g = groups.find(x => x.label === label)
    if (!g) { g = { label, items: [] }; groups.push(g) }
    g.items.push(item)
  })
  listEl.innerHTML = groups.map(g =>
    `<div class="xd-month-group"><div class="xd-month-head">${g.label}</div><div class="xd-list">${g.items.map(it => buildXdItemHtml(it, 'full')).join('')}</div></div>`
  ).join('')
  if (pagerEl) {
    pagerEl.hidden = totalPages <= 1
    const from = xdFullPage * XD_FULL_PAGE_SIZE + 1
    const to = from + pageItems.length - 1
    document.getElementById('xd-full-info').textContent = `${from}-${to} จาก ${list.length} รายการ`
    const cur = xdFullPage
    const shown = []
    for (let i = 0; i < totalPages; i++) {
      if (i === 0 || i === totalPages - 1 || Math.abs(i - cur) <= 1) shown.push(i)
      else if (shown[shown.length - 1] !== '…') shown.push('…')
    }
    document.getElementById('xd-full-nums').innerHTML =
      `<button type="button" class="xd-pg-arrow" onclick="goXdFullPage(-1)" aria-label="หน้าก่อนหน้า"${cur === 0 ? ' disabled' : ''}>‹</button>` +
      shown.map(i => i === '…' ? '<span class="xd-pg-gap">…</span>'
        : `<button type="button" class="xd-pg-n${i === cur ? ' on' : ''}" onclick="goXdFullPageTo(${i})" aria-label="หน้า ${i + 1}"${i === cur ? ' aria-current="page"' : ''}>${i + 1}</button>`).join('') +
      `<button type="button" class="xd-pg-arrow" onclick="goXdFullPage(1)" aria-label="หน้าถัดไป"${cur >= totalPages - 1 ? ' disabled' : ''}>›</button>`
  }
}

function filterXdFull() {
  xdFullPage = 0
  renderXdActiveChips()
  renderXdFullPage()
}

function goXdFullPageTo(n) { goXdFullPage(n - xdFullPage) }

function goXdFullPage(delta) {
  const { list } = getXdFullFiltered()
  const totalPages = Math.max(1, Math.ceil(list.length / XD_FULL_PAGE_SIZE))
  const next = Math.min(totalPages - 1, Math.max(0, xdFullPage + delta))
  if (next === xdFullPage) return
  xdFullPage = next
  renderXdFullPage()
  const head = document.querySelector('#page-xd .xd-filter-row')
  if (head) head.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function clearXdSearch() {
  const input = document.getElementById('xd-search-input')
  if (input) { input.value = ''; input.focus() }
  filterXdFull()
}

// ปัดซ้าย = หน้าถัดไป, ปัดขวา = หน้าก่อนหน้า
(function initXdFullSwipe() {
  const el = document.getElementById('xd-full-list')
  if (!el) return
  let sx = 0, sy = 0, tracking = false
  el.addEventListener('touchstart', e => { const t = e.touches[0]; sx = t.clientX; sy = t.clientY; tracking = true }, { passive: true })
  el.addEventListener('touchend', e => {
    if (!tracking) return
    tracking = false
    const t = e.changedTouches[0]
    const dx = t.clientX - sx, dy = t.clientY - sy
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) goXdFullPage(dx < 0 ? 1 : -1)
  }, { passive: true })
})()

// ปฏิทินหลักทรัพย์ — filter tabs (กรองรายการที่ render มาแล้วตาม type)
function filterXdCalendar(type) {
  document.querySelectorAll('#page-home .xd-tab').forEach(t => t.classList.toggle('active', t.dataset.filter === type))
  const items = document.querySelectorAll('#xd-pager .xd-item-wrap')
  let visibleCount = 0
  items.forEach(item => {
    const show = type === 'all' || item.dataset.type === type
    item.style.display = show ? 'block' : 'none'
    if (show) visibleCount++
  })
  const pageEls = document.querySelectorAll('#xd-pager .xd-page')
  pageEls.forEach(page => {
    const hasVisible = !!page.querySelector('.xd-item-wrap:not([style*="display: none"])')
    page.style.display = hasVisible ? '' : 'none'
  })
  const pagerEl = document.getElementById('xd-pager')
  if (pagerEl) pagerEl.scrollLeft = 0
  const emptyEl = document.getElementById('xd-empty')
  if (emptyEl) emptyEl.style.display = visibleCount === 0 ? 'block' : 'none'
  const dotsEl = document.getElementById('xd-dots')
  if (dotsEl) {
    const visiblePageCount = Array.from(pageEls).filter(p => p.style.display !== 'none').length
    dotsEl.style.display = visiblePageCount > 1 ? 'flex' : 'none'
    document.querySelectorAll('#xd-dots .xd-dot').forEach((d, i) => {
      d.style.display = i < pageEls.length && pageEls[i].style.display !== 'none' ? '' : 'none'
      d.classList.toggle('active', i === 0)
    })
  }
}

// จุดบอกตำแหน่งหน้า — กดจุดเพื่อเลื่อนไปหน้านั้น และอัปเดตจุดตามตำแหน่งที่เลื่อนด้วยนิ้ว
function goXdPage(idx) {
  const pager = document.getElementById('xd-pager')
  if (!pager) return
  pager.scrollTo({ left: pager.clientWidth * idx, behavior: 'smooth' })
}
(function initXdDotsScroll() {
  const pager = document.getElementById('xd-pager')
  if (!pager) return
  let ticking = false
  pager.addEventListener('scroll', () => {
    if (ticking) return
    ticking = true
    requestAnimationFrame(() => {
      const idx = Math.round(pager.scrollLeft / (pager.clientWidth || 1))
      document.querySelectorAll('.xd-dot').forEach((d, i) => d.classList.toggle('active', i === idx))
      ticking = false
    })
  }, { passive: true })
})()

// ปฏิทินหลักทรัพย์ — กดรายการเพื่อขยายดูข้อมูลเพิ่มเติมด้านล่างในที่เดิม (ไม่ใช้ popup)
function toggleXdDetail(key) {
  const panel = document.getElementById('xd-detail-panel-' + key)
  const chevron = document.getElementById('xd-chevron-' + key)
  if (!panel) return
  const isOpen = panel.classList.toggle('open')
  if (chevron) chevron.classList.toggle('open', isOpen)
}

