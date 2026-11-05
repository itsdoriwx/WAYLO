import './scss/main.scss'
import { initAuth } from './ts/auth'
import { initBooking } from './ts/booking'
import { initCatalog } from './ts/catalog'
import { initDetails } from './ts/details'
import { initHome } from './ts/home'

initAuth()      // шапка, футер, вхід, профіль
initHome()      
initCatalog()   
initDetails()   
initBooking()   


