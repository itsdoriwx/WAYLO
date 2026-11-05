import type { Currency, Tour, ToursData } from './types'
import { findTour, formatMoney, getCurrency, loadTours, setCurrency } from './tours'
import { esc } from './cards'
import { getUser } from './auth'

const BALANCE = 596         
const MAX_BONUS_SHARE = 0.5  
const RESERVE_SHARE = 0.3    
const MAX_TRAVELERS = 3
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const TEST_DECLINED_CARD = '4000000000000002' 

interface PdfWindow {
  htmlToImage?: { toPng: (el: HTMLElement, opts: object) => Promise<string> }
  jspdf?: { jsPDF: new (opts: object) => { addImage: (...a: unknown[]) => void; save: (name: string) => void } }
}

type PayState = 'form' | 'processing' | 'success' | 'error'

function byId<T extends HTMLElement>(id: string): T {
  return document.getElementById(id) as T
}

function clamp(value: number, max: number): number {
  if (isNaN(value) || value < 0) return 0
  return Math.min(value, max)
}

function makeCode(): string {
  let code = 'WL-'
  for (let i = 0; i < 6; i++) code += CODE_CHARS.charAt(Math.floor(Math.random() * CODE_CHARS.length))
  return code
}

// схематичний QR із коду квитка
function qrSvg(code: string): string {
  const N = 11
  let seed = 7
  let out = ''

  for (let i = 0; i < code.length; i++) {
    seed = (seed * 31 + code.charCodeAt(i)) % 2147483647
  }
  const rnd = (): number => {
    seed = (seed * 48271) % 2147483647
    return seed / 2147483647
  }
  const inFinder = (x: number, y: number): boolean =>
    (x < 3 && y < 3) || (x >= N - 3 && y < 3) || (x < 3 && y >= N - 3)

  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      if (!inFinder(x, y) && rnd() > 0.5) out += `<rect x="${x}" y="${y}" width="1" height="1"/>`
    }
  }
  const finders: Array<[number, number]> = [[0, 0], [N - 3, 0], [0, N - 3]]
  finders.forEach(([fx, fy]) => {
    out += `<rect x="${fx}" y="${fy}" width="3" height="3"/>` +
           `<rect x="${fx + 1}" y="${fy + 1}" width="1" height="1" fill="#fff"/>`
  })
  return `<svg viewBox="0 0 ${N} ${N}" fill="#0D2038" shape-rendering="crispEdges">${out}</svg>`
}

const STAR = '<path d="M16 0C16 8.83656 8.83656 16 0 16C8.83656 16 16 23.1634 16 32C16 23.1634 23.1634 16 32 16C23.1634 16 16 8.83656 16 0Z" fill="#FFFFFF"/>'

function star(cls: string, size: number, opacity: number): string {
  return `<svg class="booking-ticket__star ${cls}" width="${size}" height="${size}" viewBox="0 0 32 32" opacity="${opacity}">${STAR}</svg>`
}

function ticketHtml(idx: number, code: string, n: number, date: string, title: string, status: string): string {
  const col = (label: string, value: string | number): string =>
    `<div class="booking-ticket__col"><span class="booking-ticket__label">${label}</span><span class="booking-ticket__val">${value}</span></div>`

  return `
    <div class="booking-ticket">
      ${star('booking-ticket__star--1', 22, 0.6)}
      ${star('booking-ticket__star--2', 18, 0.5)}
      ${star('booking-ticket__star--3', 18, 0.6)}
      <div class="booking-ticket__main">
        <p class="booking-ticket__tag">Електронний квиток ${idx}  |  WAYLO</p>
        <h3 class="booking-ticket__title">${esc(title)}</h3>
        <div class="booking-ticket__grid">
          ${col('Дата виїзду', esc(date))}
          ${col('К-сть мандрівників', n)}
          ${col('Статус замовлення', status)}
          ${col('Код квитка', code)}
        </div>
      </div>
      <div class="booking-ticket__qr-side">
        <div class="booking-ticket__qr">${qrSvg(code)}</div>
        <span class="booking-ticket__code">${code}</span>
      </div>
    </div>`
}

// ---- профіль: QR у квитках ----
function initProfileQr(): void {
  document.querySelectorAll<HTMLElement>('.ticket-card__qr-box').forEach(box => {
    const code = box.dataset.code
    if (code) box.innerHTML = qrSvg(code)
  })
}

export async function initBooking(): Promise<void> {
  initProfileQr()

  const payBtn = document.getElementById('payBtn')
  if (!payBtn) return // ми не на сторінці оформлення

  const minus = document.querySelector<HTMLButtonElement>('.booking-counter__btn--minus')!
  const plus = document.querySelector<HTMLButtonElement>('.booking-counter__btn--plus')!
  const count = document.querySelector<HTMLInputElement>('.booking-counter__input')!
  const dots = document.querySelectorAll<HTMLElement>('.booking-dot')
  const range = byId<HTMLInputElement>('bonusRange')
  const bonusInput = byId<HTMLInputElement>('bonusInput')
  const tourName = document.querySelector<HTMLElement>('.booking-summary__tour-name')!
  const currencySelect = byId<HTMLSelectElement>('bookingCurrency')

  // картки мандрівників: стрілки, крапки, заголовок і поля форми
  const prevBtn = document.querySelectorAll<HTMLButtonElement>('.booking-nav-btn')[0]
  const nextBtn = document.querySelectorAll<HTMLButtonElement>('.booking-nav-btn')[1]
  const travelerTitle = document.querySelector<HTMLElement>('.booking-traveler-title')!
  const fields = Array.from(document.querySelectorAll<HTMLInputElement>('.booking-form__input'))
  const travelerError = byId('travelerError')
  const loginModal = byId('loginModal')

  const payFullRadio = byId<HTMLInputElement>('paymentFull')
  const payReserveRadio = byId<HTMLInputElement>('paymentReserve')
  const bonusModal = byId('bonusModal')

  const payModal = byId('payModal')
  const fCard = byId<HTMLInputElement>('cardNumber')
  const fExp = byId<HTMLInputElement>('cardExp')
  const fCvv = byId<HTMLInputElement>('cardCvv')
  const fName = byId<HTMLInputElement>('cardName')

  // тур, дата й тип оплати з адреси
  const params = new URLSearchParams(location.search)
  const tourId = Number(params.get('tour')) || 5
  const dateLabel = params.get('date')

  let tourPrice = 0
  let state = { total: 0, bonus: 0, reserve: 0, n: 1 }
  let payInfo = { amount: 0, reserve: false }

  // Забронювати = обране бронювання, Оплатити = повна оплата
  const applyPayType = (): void => {
    if (params.get('type') === 'reserve') payReserveRadio.checked = true
    else payFullRadio.checked = true
  }
  applyPayType()
  // браузер при оновленні сторінки може відновити старий вибір радіокнопок
  window.addEventListener('pageshow', event => { if (!event.persisted) applyPayType() })

  let data: ToursData
  try {
    data = await loadTours()
  } catch (error) {
    console.error(error)
    tourName.textContent = 'Не вдалося завантажити тур'
    return
  }

  const tour: Tour = findTour(data, tourId) ?? data.tours[0]
  const dates = tour.details?.dates ?? []
  const chosen = dates.find(d => d.label === dateLabel) ?? dates.find(d => d.seats > 0)

  tourPrice = chosen ? chosen.price : tour.price
  tourName.textContent = tour.title + (chosen ? ` | ${chosen.label}` : '')

  // валюта: суми рахуємо в гривнях, а показуємо за курсом з tours.json 
  let currency: Currency = getCurrency()
  currencySelect.value = currency
  const money = (uah: number): string => formatMoney(uah, currency, data)

  function travelers(): number {
    const n = parseInt(count.value, 10)
    if (isNaN(n) || n < 1) return 1
    return Math.min(n, MAX_TRAVELERS)
  }

  // картки мандрівників: у кожного свої дані
  const saved: string[][] = [[], [], []]   
  let active = 0

  function updateTravelerUi(): void {
    const n = travelers()
    travelerTitle.textContent = `Мандрівник ${active + 1}`
    dots.forEach((dot, i) => {
      dot.style.display = i < n ? '' : 'none'
      dot.classList.toggle('booking-dot--active', i === active)
    })
    prevBtn.disabled = n <= 1
    nextBtn.disabled = n <= 1
  }

  function clearFieldErrors(): void {
    fields.forEach(f => f.classList.remove('booking-form__input--invalid'))
    travelerError.textContent = ''
  }

  function showTraveler(index: number): void {
    saved[active] = fields.map(f => f.value)          // запам'ятати поточного
    active = index
    fields.forEach((f, i) => { f.value = saved[active][i] ?? '' })
    clearFieldErrors()
    updateTravelerUi()
  }

  // обов'язкові поля: ім'я, прізвище, телефон, пошта, номер паспорту 
  const REQUIRED_FIELDS = [0, 1, 2, 3, 4]

  function isFieldInvalid(index: number, value: string): boolean {
    const text = value.trim()
    switch (index) {
      case 0:
      case 1: return text.length < 2
      case 2: return text.replace(/\D/g, '').length < 10
      case 3: return !/^\S+@\S+\.\S+$/.test(text)
      case 4: return text.replace(/\s/g, '').length < 6
      default: return false
    }
  }

  // перевіряє всіх мандрівників
  function validateTravelers(): boolean {
    saved[active] = fields.map(f => f.value)
    for (let k = 0; k < travelers(); k++) {
      const bad = REQUIRED_FIELDS.filter(i => isFieldInvalid(i, saved[k][i] ?? ''))
      if (bad.length === 0) continue

      showTraveler(k)
      bad.forEach(i => fields[i].classList.add('booking-form__input--invalid'))
      travelerError.textContent = travelers() > 1
        ? `Заповніть усі обов'язкові поля (*) для мандрівника ${k + 1}`
        : "Заповніть усі обов'язкові поля (*) коректно"
      fields[bad[0]].focus()
      return false
    }
    return true
  }

  // прибираємо червоне виділення, щойно людина починає виправляти поле
  fields.forEach(f => f.addEventListener('input', () => {
    f.classList.remove('booking-form__input--invalid')
    if (!fields.some(x => x.classList.contains('booking-form__input--invalid'))) travelerError.textContent = ''
  }))

  prevBtn.addEventListener('click', () => { const n = travelers(); showTraveler((active - 1 + n) % n) })
  nextBtn.addEventListener('click', () => { const n = travelers(); showTraveler((active + 1) % n) })
  dots.forEach((dot, i) => dot.addEventListener('click', () => { if (i < travelers()) showTraveler(i) }))

  // перерахунок сум і бонусів при зміні кількості мандрівників або бонусу
  function render(fromInput: boolean): void {
    const n = travelers()
    const total = tourPrice * n
    const limit = Math.min(BALANCE, Math.floor(total * MAX_BONUS_SHARE))
    range.max = String(limit)
    bonusInput.max = String(limit)

    const bonus = clamp(parseInt(fromInput ? bonusInput.value : range.value, 10), limit)
    range.value = String(bonus)
    if (!fromInput) bonusInput.value = String(bonus)

    const reserve = Math.round(total * RESERVE_SHARE)
    state = { total, bonus, reserve, n }

    byId('tourCalc').textContent = `Тур * ${n}`
    byId('tourFull').textContent = money(total)
    byId('tourReserve').textContent = money(reserve)
    byId('bonusDiscount').textContent = `-${money(bonus)}`
    byId('totalFull').textContent = money(total - bonus)
    byId('submitFull').textContent = money(total - bonus)
    byId('totalReserve').textContent = money(reserve)
    byId('submitReserve').textContent = money(reserve)
    byId('reserveTotal').textContent = money(total)
    byId('reserveRest').textContent = money(total - reserve)

    minus.disabled = n <= 1
    plus.disabled = n >= MAX_TRAVELERS

    // якщо прибрали мандрівника, на якому стояли, переходимо на останнього
    if (active >= n) showTraveler(n - 1)
    else updateTravelerUi()
  }

  currencySelect.addEventListener('change', () => {
    currency = currencySelect.value as Currency
    setCurrency(currency)
    render(false)
  })

  minus.addEventListener('click', () => { count.value = String(travelers() - 1); render(false) })
  plus.addEventListener('click', () => { count.value = String(travelers() + 1); render(false) })
  count.addEventListener('input', () => render(false))
  count.addEventListener('blur', () => { count.value = String(travelers()); render(false) })
  range.addEventListener('input', () => render(false))
  bonusInput.addEventListener('input', () => render(true))
  bonusInput.addEventListener('blur', () => render(false))

  // без входу в акаунт оплатити й забронювати не можна
  const closeLoginModal = (): void => { loginModal.style.display = 'none' }
  loginModal.querySelectorAll('.booking-modal__overlay, .booking-modal__close')
    .forEach(el => el.addEventListener('click', closeLoginModal))
  byId('loginGo').addEventListener('click', () => {
    // після входу повертаємо людину на цю саму сторінку оформлення
    location.href = `/login.html?next=${encodeURIComponent(location.pathname + location.search)}`
  })

  function requireLogin(): boolean {
    if (getUser()) return true
    loginModal.style.display = 'flex'
    return false
  }
  if (!getUser()) loginModal.style.display = 'flex'  // одразу нагадуємо про вхід, поки форма порожня

  // вікно "бонуси недоступні" при виборі бронювання
  const closeBonusModal = (): void => { bonusModal.style.display = 'none' }
  payReserveRadio.addEventListener('change', () => {
    if (payReserveRadio.checked) bonusModal.style.display = 'flex'
  })
  bonusModal.querySelectorAll('.booking-modal__overlay, .booking-modal__close, .booking-modal__btn')
    .forEach(el => el.addEventListener('click', closeBonusModal))

  // фейкова оплата
  function setState(s: PayState): void {
    payModal.setAttribute('data-state', s)
  }

  function closePay(): void {
    const st = payModal.getAttribute('data-state')
    if (st === 'processing' || st === 'success') return
    payModal.style.display = 'none'
  }

  function clearInvalid(): void {
    payModal.querySelectorAll('.pay-field--invalid').forEach(el => el.classList.remove('pay-field--invalid'))
    byId('payError').textContent = ''
  }

  function markInvalid(el: HTMLElement): void {
    el.parentElement?.classList.add('pay-field--invalid')
  }

  function openPay(): void {
    const isReserve = payReserveRadio.checked
    payInfo = { amount: isReserve ? state.reserve : state.total - state.bonus, reserve: isReserve }
    byId('payAmount').textContent = money(payInfo.amount)
    byId('payConfirm').textContent = `Сплатити ${money(payInfo.amount)}`
    byId('payModeLabel').textContent = isReserve ? 'Бронювання (предоплата 30%)' : 'Повна оплата'
    fCard.value = fExp.value = fCvv.value = fName.value = ''
    clearInvalid()
    setState('form')
    payModal.style.display = 'flex'
  }

  // маски полів
  fCard.addEventListener('input', () => {
    fCard.value = fCard.value.replace(/\D/g, '').slice(0, 16).replace(/(.{4})/g, '$1 ').trim()
  })
  fExp.addEventListener('input', () => {
    const d = fExp.value.replace(/\D/g, '').slice(0, 4)
    fExp.value = d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d
  })
  fCvv.addEventListener('input', () => {
    fCvv.value = fCvv.value.replace(/\D/g, '').slice(0, 3)
  })

  function validate(): boolean {
    clearInvalid()
    let ok = true

    if (fCard.value.replace(/\D/g, '').length !== 16) { markInvalid(fCard); ok = false }

    const m = parseInt(fExp.value.slice(0, 2), 10)
    const y = parseInt(fExp.value.slice(3, 5), 10)
    const now = new Date()
    const expired = isNaN(m) || isNaN(y) || m < 1 || m > 12 ||
      (2000 + y) < now.getFullYear() ||
      ((2000 + y) === now.getFullYear() && m < now.getMonth() + 1)
    if (fExp.value.length !== 5 || expired) { markInvalid(fExp); ok = false }

    if (fCvv.value.length !== 3) { markInvalid(fCvv); ok = false }
    if (fName.value.trim().length < 2) { markInvalid(fName); ok = false }

    if (!ok) byId('payError').textContent = 'Перевірте виділені поля'
    return ok
  }

  function confirmPay(): void {
    if (!validate()) return
    const declined = fCard.value.replace(/\D/g, '') === TEST_DECLINED_CARD
    setState('processing')
    setTimeout(() => {
      if (declined) { setState('error'); return }
      showSuccess()
    }, 1800)
  }

  // екран успішної оплати або бронювання
  function showSuccess(): void {
    const [titlePart, datePart = ''] = tourName.textContent!.split('|')
    const reserve = payInfo.reserve

    byId('successTitle').textContent = reserve ? 'Бронювання підтверджено' : 'Оплата пройшла успішно'
    byId('successSubtitle').textContent = reserve
      ? `Передоплату ${money(payInfo.amount)} сплачено. Залишок ${money(state.total - payInfo.amount)} потрібно доплатити.`
      : `Сплачено ${money(payInfo.amount)}. Квиток надіслано на e-mail та додано в профіль.`

    byId('ticketList').innerHTML = ticketHtml(
      1, makeCode(), state.n, datePart.trim(), titlePart.trim(), reserve ? 'Заброньовано' : 'Сплачено'
    )

    setState('success')
    payModal.querySelector('.booking-modal__content')!.scrollTop = 0
  }

  // завантаження квитка в PDF
  const printBtn = byId<HTMLButtonElement>('printTickets')
  printBtn.addEventListener('click', () => {
    const ticket = document.querySelector<HTMLElement>('.booking-ticket')
    const lib = window as unknown as PdfWindow
    if (!lib.htmlToImage || !lib.jspdf || !ticket) { window.print(); return }

    const code = ticket.querySelector('.booking-ticket__code')!.textContent
    const label = printBtn.textContent
    printBtn.disabled = true
    printBtn.textContent = 'Готуємо PDF…'

    lib.htmlToImage.toPng(ticket, { pixelRatio: 2, cacheBust: true })
      .then(dataUrl => {
        const w = ticket.offsetWidth
        const h = ticket.offsetHeight
        const pad = 24
        const pdf = new lib.jspdf!.jsPDF({
          orientation: w > h ? 'l' : 'p',
          unit: 'px',
          format: [w + pad * 2, h + pad * 2]
        })
        pdf.addImage(dataUrl, 'PNG', pad, pad, w, h)
        pdf.save(`WAYLO-${code}.pdf`)
      })
      .catch(error => { console.error('PDF error:', error); window.print() })
      .then(() => {
        printBtn.disabled = false
        printBtn.textContent = label
      })
  })

  payBtn.addEventListener('click', () => {
    if (!requireLogin()) return
    if (!validateTravelers()) return
    openPay()
  })
  byId('payConfirm').addEventListener('click', confirmPay)
  byId('payRetry').addEventListener('click', () => setState('form'))
  byId('payClose').addEventListener('click', closePay)
  byId('payOverlay').addEventListener('click', closePay)

  render(false)
}
