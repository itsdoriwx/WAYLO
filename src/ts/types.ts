export type Category = 'mountains' | 'sea' | 'excursion' | 'holiday'
export type Currency = 'UAH' | 'USD' | 'EUR'

export interface TourDate {
  label: string      
  month: number      
  price: number       
  oldPrice?: number   
  discount?: number   // знижка у відсотках для значка
  seats: number       // вільних місць (0 = місць немає)
}

export interface Activity { name: string; price: number }
export interface DayPlan { title: string; items: string[] }

// що показуємо на сторінці деталей
export interface TourDetails {
  rating: number
  reviews: number
  groupMax: number
  description: string
  gallery: number           // скільки слайдів у галереї
  program: DayPlan[]
  included: string[]
  activities: Activity[]
  dates: TourDate[]
}

export interface Tour {
  id: number
  title: string
  place: string
  country: string
  days: number
  price: number             // "від ..." у гривнях
  images?: string[]         // фото туру
  category: Category
  months: number[]          // у які місяці є виїзди
  featured?: boolean        // показувати на головній
  details?: TourDetails     // повний опис (є не в усіх турів)
}

export interface ToursData {
  rates: Record<Currency, number>   // скільки гривень коштує 1 одиниця валюти
  tours: Tour[]
}

export interface Filters {
  query: string
  priceFrom: number | null
  priceTo: number | null
  currency: Currency
  days: number | null
  month: number | null
}

// користувач, який увійшов
export interface User {
  email: string
  nick: string    
  name: string  
}