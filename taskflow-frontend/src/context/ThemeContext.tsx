import { createContext, useContext, useEffect, useRef, useState } from 'react'

type Theme = 'dark' | 'light'
export type ThemePreference = 'dark' | 'light' | 'system'

interface ThemeContextValue {
  theme: Theme                 // resolved theme actually applied to <html>
  preference: ThemePreference  // user's choice (may be 'system')
  setPreference: (p: ThemePreference) => void
  toggle: () => void           // quick light<->dark switch (leaves system mode)
}

const systemPrefersDark = () =>
  window.matchMedia('(prefers-color-scheme: dark)').matches

function resolve(pref: ThemePreference): Theme {
  if (pref === 'system') return systemPrefersDark() ? 'dark' : 'light'
  return pref
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'dark',
  preference: 'dark',
  setPreference: () => {},
  toggle: () => {},
})

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [preference, setPreference] = useState<ThemePreference>(
    () => (localStorage.getItem('theme') as ThemePreference) ?? 'dark'
  )
  const [theme, setTheme] = useState<Theme>(() =>
    resolve((localStorage.getItem('theme') as ThemePreference) ?? 'dark')
  )

  // Persist preference and recompute the resolved theme whenever it changes.
  useEffect(() => {
    localStorage.setItem('theme', preference)
    setTheme(resolve(preference))
  }, [preference])

  // While in system mode, follow live OS theme changes.
  useEffect(() => {
    if (preference !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => setTheme(mq.matches ? 'dark' : 'light')
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [preference])

  // Apply resolved theme to <html> for Tailwind's class-based dark mode.
  // On switches (not first mount), enable a brief color transition. The
  // transition class must land a frame BEFORE the color change, or CSS won't
  // animate it (the transition property would change in the same frame).
  const firstApply = useRef(true)
  useEffect(() => {
    const root = document.documentElement
    if (firstApply.current) {
      firstApply.current = false
      root.classList.toggle('dark', theme === 'dark')
      return
    }
    root.classList.add('theme-transition')
    const raf = requestAnimationFrame(() => {
      root.classList.toggle('dark', theme === 'dark')
    })
    const done = setTimeout(() => root.classList.remove('theme-transition'), 250)
    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(done)
    }
  }, [theme])

  const toggle = () => setPreference(resolve(preference) === 'dark' ? 'light' : 'dark')

  return (
    <ThemeContext.Provider value={{ theme, preference, setPreference, toggle }}>
      {children}
    </ThemeContext.Provider>
  )
}

export const useTheme = () => useContext(ThemeContext)
