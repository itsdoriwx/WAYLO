import './scss/main.scss'

const chips = document.querySelectorAll<HTMLButtonElement>('.chip')
const cards = document.querySelectorAll<HTMLElement>('.tour-card')

if (chips.length > 0 && cards.length > 0) {
  chips.forEach(chip => {
    chip.addEventListener('click', () => {
      chips.forEach(c => c.classList.remove('chip--active'))
      chip.classList.add('chip--active')
      const f = chip.dataset.filter
      cards.forEach(card => {
        card.hidden = !(f === 'all' || card.dataset.category === f)
      })
    })
  })
}