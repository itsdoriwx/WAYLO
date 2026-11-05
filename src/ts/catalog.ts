import type { Currency, Filters, ToursData } from './types'
import { filterTours, getCurrency, loadTours, monthName, setCurrency } from './tours'
import { cardHtml } from './cards'

function byId<T extends HTMLElement>(id: string): T {
  return document.getElementById(id) as T
}

interface Parsed {
  value: number | null
  error: string | null
}

function parseField(
  input: HTMLInputElement,
  name: string,
  min: number,
  max: number | null,
  integer: boolean
): Parsed {
  const raw = input.value.trim()
  if (raw === '') {
    return { value: null, error: input.validity.badInput ? `«${name}»: введіть число` : null }
  }
  const n = Number(raw)
  if (!Number.isFinite(n)) return { value: null, error: `«${name}»: введіть число` }
  if (n < min) {
    return {
      value: null,
      error: min === 0
        ? `«${name}» не може бути від'ємною`
        : `«${name}» має бути не менше ${min}`
    }
  }
  if (max !== null && n > max) return { value: null, error: `«${name}» має бути не більше ${max}` }
  if (integer && !Number.isInteger(n)) return { value: null, error: `«${name}» має бути цілим числом` }
  return { value: n, error: null }
}

export async function initCatalog(): Promise<void> {
  const grid = document.getElementById('toursGrid')
  if (!grid) return // ми не на сторінці каталогу

  const form = byId<HTMLFormElement>('toursFilters')
  const query = byId<HTMLInputElement>('filterQuery')
  const priceFrom = byId<HTMLInputElement>('filterPriceFrom')
  const priceTo = byId<HTMLInputElement>('filterPriceTo')
  const currency = byId<HTMLSelectElement>('filterCurrency')
  const days = byId<HTMLInputElement>('filterDays')
  const empty = byId<HTMLElement>('toursEmpty')
  const errorBox = byId<HTMLElement>('filtersError')
  const monthTag = byId<HTMLElement>('monthTag')
  const monthTagText = byId<HTMLElement>('monthTagText')
  const monthTagClear = byId<HTMLButtonElement>('monthTagClear')

  let data: ToursData
  try {
    data = await loadTours()
  } catch (error) {
    console.error(error)
    empty.textContent = 'Не вдалося завантажити тури. Спробуйте оновити сторінку.'
    empty.hidden = false
    return
  }

  currency.value = getCurrency()

  // місяць приходить з головної сторінки
  const monthParam = Number(new URLSearchParams(location.search).get('month'))
  let month: number | null = monthParam >= 1 && monthParam <= 12 ? monthParam : null

  // читає й перевіряє поля
  function readFilters(): Filters | null {
    const from = parseField(priceFrom, 'Вартість від', 0, null, false)
    const to = parseField(priceTo, 'Вартість до', 0, null, false)
    const d = parseField(days, 'Тривалість', 1, 365, true)

    const errors: string[] = []
    const bad = new Set<HTMLInputElement>()

    if (from.error) { errors.push(from.error); bad.add(priceFrom) }
    if (to.error) { errors.push(to.error); bad.add(priceTo) }
    if (d.error) { errors.push(d.error); bad.add(days) }
    if (from.value !== null && to.value !== null && from.value > to.value) {
      errors.push('«Вартість від» не може бути більшою за «Вартість до»')
      bad.add(priceFrom)
      bad.add(priceTo)
    }

    for (const input of [priceFrom, priceTo, days]) {
      const isBad = bad.has(input)
      input.classList.toggle('tours-filters__input--error', isBad)
      input.setAttribute('aria-invalid', String(isBad))
    }
    errorBox.textContent = errors[0] ?? ''
    errorBox.hidden = errors.length === 0

    if (errors.length > 0) return null

    return {
      query: query.value,
      priceFrom: from.value,
      priceTo: to.value,
      currency: currency.value as Currency,
      days: d.value,
      month
    }
  }

  function render(): void {
    const filters = readFilters()
    if (!filters) return // є помилка = нічого не перемальовуємо

    const result = filterTours(data, filters)
    grid!.innerHTML = result
      .map((tour, i) => cardHtml(tour, i, filters.currency, data))
      .join('')
    empty.textContent = 'За вашими параметрами турів не знайдено. Спробуйте змінити фільтри.'
    empty.hidden = result.length > 0

    monthTag.hidden = month === null
    if (month !== null) monthTagText.textContent = `Місяць: ${monthName(month)}`
  }

  form.addEventListener('submit', event => {
    event.preventDefault()
    render()
  })

  // поки користувач друкує = одразу показуємо помилку 
  for (const input of [priceFrom, priceTo, days]) {
    input.addEventListener('input', () => { readFilters() })
  }

  currency.addEventListener('change', () => {
    setCurrency(currency.value as Currency)
    render()
  })

  monthTagClear.addEventListener('click', () => {
    month = null
    history.replaceState(null, '', location.pathname)
    render()
  })

  render()
}