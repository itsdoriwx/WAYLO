import type { User } from './types'

// простий "вхід": користувач зберігається в браузері (localStorage)
const USER_KEY = 'waylo_user'

export function getUser(): User | null {
  try {
    const raw = localStorage.getItem(USER_KEY)
    if (!raw) return null
    const user = JSON.parse(raw) as Partial<User>
    if (!user || !user.email) return null
    return {
      email: user.email,
      nick: user.nick || user.email.split('@')[0],
      name: user.name ?? ''
    }
  } catch {
    return null
  }
}

// ім'я та нік не залежать від пошти
const PROFILES_KEY = 'waylo_profiles'
type Profile = { nick: string; name: string }

function loadProfiles(): Record<string, Profile> {
  try {
    return JSON.parse(localStorage.getItem(PROFILES_KEY) ?? '{}') as Record<string, Profile>
  } catch {
    return {}
  }
}

function saveUser(email: string): void {
  const saved = loadProfiles()[email.toLowerCase()]
  const user: User = {
    email,
    nick: saved?.nick || email.split('@')[0],
    name: saved?.name ?? ''
  }
  localStorage.setItem(USER_KEY, JSON.stringify(user))
}

// зберігає нове ім'я та нік поточного користувача
export function updateProfile(name: string, nick: string): User | null {
  const user = getUser()
  if (!user) return null
  const next: User = { ...user, name, nick }
  try {
    localStorage.setItem(USER_KEY, JSON.stringify(next))
    const profiles = loadProfiles()
    profiles[user.email.toLowerCase()] = { nick, name }
    localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles))
  } catch { /* localStorage недоступний */ }
  return next
}

// куди повернути користувача після входу
export function getNextUrl(): string {
  const next = new URLSearchParams(location.search).get('next')
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/profile.html'
}

export function logout(): void {
  try {
    localStorage.removeItem(USER_KEY)
  } catch { /* localStorage недоступний */ }
}

function capitalize(text: string): string {
  return text ? text[0].toUpperCase() + text.slice(1) : text
}

export function initAuth(): void {
  const user = getUser()

  // шапка: "увійти" або кнопка профілю
  const loginBtn = document.getElementById('authLogin')
  const profileBtn = document.getElementById('authProfile')
  const profileName = document.getElementById('authName')
  if (loginBtn && profileBtn) {
    loginBtn.hidden = user !== null
    profileBtn.hidden = user === null
    if (user && profileName) profileName.textContent = user.nick
  }

  // футер: "Враження" веде в акаунт або на вхід
  const bonus = document.getElementById('footerBonus') as HTMLAnchorElement | null
  if (bonus) bonus.href = user ? '/profile.html' : '/login.html'

  // стор входу: якщо користувач вже увійшов, перекидаємо на профіль
  const form = document.getElementById('loginForm') as HTMLFormElement | null
  if (form) {
    if (user) {
      location.replace(getNextUrl())
      return
    }
    const email = document.getElementById('email') as HTMLInputElement
    const password = document.getElementById('password') as HTMLInputElement
    const error = document.getElementById('loginError') as HTMLElement

    form.addEventListener('submit', event => {
      event.preventDefault()
      const emailValue = email.value.trim()
      if (!/^\S+@\S+\.\S+$/.test(emailValue)) {
        error.textContent = 'Введіть коректну електронну пошту'
        error.hidden = false
        return
      }
      if (password.value.length < 4) {
        error.textContent = 'Пароль має містити щонайменше 4 символи'
        error.hidden = false
        return
      }
      saveUser(emailValue)
      location.href = getNextUrl()
    })
  }

  // сторінка профілю: тільки для тих, хто увійшов
  const profileTitle = document.getElementById('profileName')
  if (profileTitle) {
    if (!user) {
      location.replace('/login.html')
      return
    }
    const meta = document.getElementById('profileMeta')
    const authName = document.getElementById('authName')

    const showUser = (u: User): void => {
      profileTitle.textContent = u.name || capitalize(u.nick)
      if (meta) meta.textContent = `@${u.nick}  |  ${u.email}`
      if (authName) authName.textContent = u.nick
    }
    showUser(user)

    document.getElementById('logoutBtn')?.addEventListener('click', () => logout())

    // редагування імені та нікнейму
    const editBtn = document.getElementById('profileEditBtn') as HTMLButtonElement | null
    const editForm = document.getElementById('profileEditForm') as HTMLFormElement | null
    if (editBtn && editForm) {
      const nameInput = document.getElementById('editName') as HTMLInputElement
      const nickInput = document.getElementById('editNick') as HTMLInputElement
      const error = document.getElementById('profileEditError') as HTMLElement

      const close = (): void => {
        editForm.hidden = true
        editBtn.hidden = false
        error.hidden = true
      }

      editBtn.addEventListener('click', () => {
        const current = getUser() ?? user
        nameInput.value = current.name
        nickInput.value = current.nick
        editForm.hidden = false
        editBtn.hidden = true
        nameInput.focus()
      })

      document.getElementById('profileEditCancel')?.addEventListener('click', close)

      editForm.addEventListener('submit', event => {
        event.preventDefault()
        const name = nameInput.value.trim()
        const nick = nickInput.value.trim()

        if (name.length > 40) {
          error.textContent = "Ім'я не може бути довшим за 40 символів"
          error.hidden = false
          return
        }
        if (!/^[\p{L}\d._-]{2,30}$/u.test(nick)) {
          error.textContent = 'Нікнейм: 2–30 символів, літери, цифри, крапка, дефіс або підкреслення, без пробілів'
          error.hidden = false
          return
        }

        const updated = updateProfile(name, nick)
        if (updated) showUser(updated)
        close()
      })
    }
  }
}

