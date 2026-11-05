import type { Currency, Tour, ToursData } from './types'
import { formatPrice } from './tours'

// Захист від "<" та лапок у тексті з JSON
export function esc(text: string): string {
  return text.replace(/[&<>"]/g, ch => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch] as string
  ))
}

export function daysWord(n: number): string {
  const last = n % 10
  const lastTwo = n % 100
  if (last === 1 && lastTwo !== 11) return 'день'
  if (last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14)) return 'дні'
  return 'днів'
}

// HTML однієї картки туру
export function cardHtml(tour: Tour, index: number, currency: Currency, data: ToursData): string {
  const cover = tour.images?.[0] ?? `/images/tour-${tour.id}.jpg`
  return `
    <article class="tour-card" data-category="${tour.category}">
      <div class="tour-card__img tour-card__img--${index % 3}" style="--img: url(${cover})"></div>
      <div class="tour-card__body">
        <h3 class="tour-card__title">${esc(tour.title)}</h3>
        <p class="tour-card__meta">${esc(tour.place)} | ${tour.days} ${daysWord(tour.days)}</p>
        <div class="tour-card__row">
          <span class="tour-card__price">${formatPrice(tour.price, currency, data)}</span>
          <a class="tour-card__btn" href="/tour-details.html?id=${tour.id}">Деталі</a>
        </div>
      </div>
    </article>`
}