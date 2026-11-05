import type { Currency, Filters, Tour, ToursData } from './types'

const MONTHS = [
  'Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень',
  'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень'
]

const SIGNS: Record<Currency, string> = { UAH: 'грн', USD: '$', EUR: '€' }
const CURRENCY_KEY = 'waylo_currency'

let cache: ToursData | null = null

// завантажує tours.json
export async function loadTours(): Promise<ToursData> {
  if (cache) return cache
  const response = await fetch('/data/tours.json')
  if (!response.ok) {
    throw new Error(`Не вдалося завантажити тури (код ${response.status})`)
  }
  cache = (await response.json()) as ToursData
  return cache
}

export function findTour(data: ToursData, id: number): Tour | undefined {
  return data.tours.find(tour => tour.id === id)
}

export function monthName(month: number): string {
  return MONTHS[month - 1] ?? ''
}

// обрана валюта запам'ятовується між сторінками
export function getCurrency(): Currency {
  try {
    const saved = localStorage.getItem(CURRENCY_KEY)
    if (saved === 'UAH' || saved === 'USD' || saved === 'EUR') return saved
  } catch { /* localStorage недоступний */ }
  return 'UAH'
}

export function setCurrency(currency: Currency): void {
  try {
    localStorage.setItem(CURRENCY_KEY, currency)
  } catch { /* localStorage недоступний */ }
}

// сума в обраній валюті
export function formatMoney(priceUah: number, currency: Currency, data: ToursData): string {
  const value = Math.round(priceUah / data.rates[currency])
  return `${value.toLocaleString('uk-UA')} ${SIGNS[currency]}`
}

// ціна в обраній валюті з префіксом "від"
export function formatPrice(priceUah: number, currency: Currency, data: ToursData): string {
  return `від ${formatMoney(priceUah, currency, data)}`
}

// тури за фільтром: текстовий пошук + ціна + дні + місяць
export function filterTours(data: ToursData, f: Filters): Tour[] {
  const rate = data.rates[f.currency]
  const query = f.query.trim().toLowerCase()

  return data.tours.filter(tour => {
    if (query) {
      const text = `${tour.title} ${tour.place} ${tour.country}`.toLowerCase()
      if (!text.includes(query)) return false
    }
    // ціна в обраній валюті
    if (f.priceFrom !== null && tour.price < f.priceFrom * rate) return false
    if (f.priceTo !== null && tour.price > f.priceTo * rate) return false
    if (f.days !== null && tour.days !== f.days) return false
    if (f.month !== null && !tour.months.includes(f.month)) return false
    return true
  })
}