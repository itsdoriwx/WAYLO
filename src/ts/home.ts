import type { Currency, ToursData } from './types'
import { getCurrency, loadTours } from './tours'
import { cardHtml } from './cards'

// головна сторінка
export async function initHome(): Promise<void> {
  const grid = document.getElementById('homeGrid')
  if (!grid) return // ми не на головній

  let data: ToursData
  try {
    data = await loadTours()
  } catch (error) {
    console.error(error)
    return
  }

  const currency: Currency = getCurrency()
  const seeAll = grid.querySelector('.tours__all')
  const featured = data.tours.filter(tour => tour.featured)

  // картки вставляємо перед карткою "Дивитись усі тури"
  const html = featured.map((tour, i) => cardHtml(tour, i, currency, data)).join('')
  seeAll?.insertAdjacentHTML('beforebegin', html)

  const chips = document.querySelectorAll<HTMLButtonElement>('.chip')
  const cards = grid.querySelectorAll<HTMLElement>('.tour-card')

  chips.forEach(chip => {
    chip.addEventListener('click', () => {
      chips.forEach(c => c.classList.remove('chip--active'))
      chip.classList.add('chip--active')
      const filter = chip.dataset.filter
      cards.forEach(card => {
        card.hidden = !(filter === 'all' || card.dataset.category === filter)
      })
    })
  })
}