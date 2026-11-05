import type { Currency, Tour, ToursData } from './types'
import { daysWord, esc } from './cards'
import { findTour, formatMoney, getCurrency, loadTours } from './tours'

// якщо в турі немає фото
const SLIDES = [
  'linear-gradient(135deg, #5980AB 0%, #243A45 100%)',
  'linear-gradient(180deg, #8AAFD5 0%, #BDD8F0 100%)',
  'linear-gradient(135deg, #2D83AC 0%, #123546 100%)',
  'linear-gradient(135deg, #375E99 0%, #121F33 100%)',
  'linear-gradient(160deg, #BDD8F0 0%, #5980AB 100%)'
]

function byId<T extends HTMLElement>(id: string): T {
  return document.getElementById(id) as T
}

export async function initDetails(): Promise<void> {
  const page = document.getElementById('tourPage')
  if (!page) return // ми не на сторінці деталей

  let data: ToursData
  try {
    data = await loadTours()
  } catch (error) {
    console.error(error)
    showMessage(page, 'Не вдалося завантажити дані туру. Спробуйте оновити сторінку.')
    return
  }

  const id = Number(new URLSearchParams(location.search).get('id'))
  const tour = findTour(data, id)
  if (!tour) {
    showMessage(page, 'Такого туру не знайдено.')
    return
  }

  const currency: Currency = getCurrency()
  document.title = `WAYLO | ${tour.title}`

  fillInfo(tour)
  initGallery(tour)
  initProgram(tour)
  initIncluded(tour, currency, data)
  initBooking(tour, currency, data)
}

function showMessage(page: HTMLElement, text: string): void {
  page.innerHTML = `
    <div class="details-container">
      <a class="details-back-link" href="/tours.html"><span>← Назад до всіх турів</span></a>
      <h1 class="details-info__title">${esc(text)}</h1>
    </div>`
}

// назва, мета, рейтинг, опис
function fillInfo(tour: Tour): void {
  const details = tour.details
  byId('detTitle').textContent = tour.title

  const parts = [esc(tour.place), `${tour.days} ${daysWord(tour.days)}`]
  if (details) parts.push(`група до ${details.groupMax} осіб`)
  byId('detMeta').innerHTML = parts
    .map(p => `<span>${p}</span>`)
    .join('<span class="details-info__divider">|</span>')

  const rating = document.querySelector<HTMLElement>('.details-info__rating')
  if (details && rating) {
    byId('detScore').textContent = String(details.rating)
    byId('detReviews').textContent = `(${details.reviews} відгуків)`
  } else if (rating) {
    rating.hidden = true
  }

  byId('detDescription').textContent = details
    ? details.description
    : `${tour.title}: ${tour.days} ${daysWord(tour.days)} незабутніх вражень. Детальна програма цього туру готується.`
}

// галерея зі стрілками
function initGallery(tour: Tour): void {
  const images = tour.images ?? []
  const photos = images.length > 0 ? images.length : (tour.details?.gallery ?? 3)
  const main = byId('galleryMain')
  const side = byId('gallerySide')
  const dots = byId('galleryDots')
  let current = 0

  // фото з tours.json, якщо його немає = колірний градієнт
  function paint(el: HTMLElement, index: number): void {
    const src = images[index]
    el.style.background = src
      ? `center / cover no-repeat url("${src}"), ${SLIDES[index % SLIDES.length]}`
      : SLIDES[index % SLIDES.length]
  }

  const sideIndex = Math.min(1, photos - 1)
  paint(side, sideIndex)

  const order = Array.from({ length: photos }, (_, i) => i)
    .filter(i => photos < 2 || i !== sideIndex)
  const total = order.length

  dots.innerHTML = order.map((_, i) =>
    `<span class="details-gallery__dot" data-index="${i}"></span>`
  ).join('')

  function show(index: number): void {
    current = (index + total) % total
    paint(main, order[current])
    dots.querySelectorAll('.details-gallery__dot').forEach((dot, i) => {
      dot.classList.toggle('details-gallery__dot--active', i === current)
    })
  }

  byId('galleryPrev').addEventListener('click', () => show(current - 1))
  byId('galleryNext').addEventListener('click', () => show(current + 1))
  dots.addEventListener('click', event => {
    const dot = (event.target as HTMLElement).closest<HTMLElement>('.details-gallery__dot')
    if (dot) show(Number(dot.dataset.index))
  })

  show(0)
}

// програма по днях, вкладки
function initProgram(tour: Tour): void {
  const tabs = byId('programTabs')
  const card = byId('programCard')
  const program = tour.details?.program ?? []

  if (program.length === 0) {
    tabs.hidden = true
    card.innerHTML = `
      <div class="details-program__day-content">
        <h3 class="details-program__day-title">Програма уточнюється</h3>
        <ul class="details-program__list">
          <li>Детальна програма цього туру з'явиться найближчим часом.</li>
        </ul>
      </div>`
    return
  }

  tabs.innerHTML = program.map((_, i) =>
    `<button class="details-program__tab" type="button" data-day="${i}">День ${i + 1}</button>`
  ).join('')

  function show(index: number): void {
    const day = program[index]
    card.innerHTML = `
      <div class="details-program__day-content">
        <h3 class="details-program__day-title">${esc(day.title)}</h3>
        <ul class="details-program__list">
          ${day.items.map(item => `<li>${esc(item)}</li>`).join('')}
        </ul>
      </div>`
    tabs.querySelectorAll('.details-program__tab').forEach((tab, i) => {
      tab.classList.toggle('details-program__tab--active', i === index)
    })
  }

  tabs.addEventListener('click', event => {
    const tab = (event.target as HTMLElement).closest<HTMLElement>('.details-program__tab')
    if (tab) show(Number(tab.dataset.day))
  })

  show(0)
}

// включено у вартість, додаткові активності, модальне вікно
function initIncluded(tour: Tour, currency: Currency, data: ToursData): void {
  const included = tour.details?.included ?? []
  byId('includedTags').innerHTML = included.length > 0
    ? included.map(item => `<span class="details-tag">${esc(item)}</span>`).join('')
    : '<span class="details-tag">Уточнюйте у менеджера</span>'

  const activities = tour.details?.activities ?? []
  const openBtn = byId<HTMLButtonElement>('openActivities')
  const modal = byId('activitiesModal')

  if (activities.length === 0) {
    openBtn.hidden = true
    return
  }

  byId('activitiesList').innerHTML = activities.map(a => `
    <li>
      <span>${esc(a.name)}</span>
      <strong>+ ${formatMoney(a.price, currency, data)}</strong>
    </li>`).join('')

  const open = (): void => { modal.style.display = 'flex' }
  const close = (): void => { modal.style.display = 'none' }

  openBtn.addEventListener('click', open)
  byId('modalOverlay').addEventListener('click', close)
  byId('modalClose').addEventListener('click', close)
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') close()
  })
}

// -дати і ціни, вибір дати, кнопки бронювання та оплати
function initBooking(tour: Tour, currency: Currency, data: ToursData): void {
  const dates = tour.details?.dates ?? []
  const options = byId('dateOptions')
  const price = byId('cardPrice')
  const oldPrice = byId('cardOldPrice')
  const sticky = byId('stickyPrice')
  const reserve = byId<HTMLAnchorElement>('btnReserve')
  const pay = byId<HTMLAnchorElement>('btnPay')

  // перша дата, де ще є місця
  let selected = dates.findIndex(d => d.seats > 0)

  if (dates.length === 0) {
    options.innerHTML = `
      <div class="details-date-option details-date-option--disabled">
        <span class="details-date-option__text">Дати уточнюйте</span>
      </div>`
  } else {
    options.innerHTML = dates.map((d, i) => `
      <label class="details-date-option${i === selected ? ' details-date-option--selected' : ''}${d.seats === 0 ? ' details-date-option--disabled' : ''}" data-index="${i}">
        <input type="radio" name="tour_date"${i === selected ? ' checked' : ''}${d.seats === 0 ? ' disabled' : ''}>
        <span class="details-date-option__text">${esc(d.label)}</span>
        ${d.discount ? `<span class="details-date-option__badge">-${d.discount}%</span>` : ''}
        <span class="details-date-option__seats">${d.seats === 0 ? 'Місць немає' : `місць: ${d.seats}`}</span>
      </label>`).join('')
  }

  function update(): void {
    const date = dates[selected]
    const value = date ? date.price : tour.price
    const text = formatMoney(value, currency, data)

    price.textContent = text
    sticky.textContent = text

    if (date?.oldPrice) {
      oldPrice.textContent = formatMoney(date.oldPrice, currency, data)
      oldPrice.hidden = false
    } else {
      oldPrice.hidden = true
    }

    const base = `/booking.html?tour=${tour.id}`
    const dateParam = date ? `&date=${encodeURIComponent(date.label)}` : ''
    reserve.href = `${base}${dateParam}&type=reserve`
    pay.href = `${base}${dateParam}&type=pay`
  }

  options.addEventListener('change', event => {
    const label = (event.target as HTMLElement).closest<HTMLElement>('.details-date-option')
    if (!label || label.classList.contains('details-date-option--disabled')) return
    selected = Number(label.dataset.index)
    options.querySelectorAll('.details-date-option').forEach(el => {
      el.classList.toggle('details-date-option--selected', el === label)
    })
    update()
  })

  update()
}