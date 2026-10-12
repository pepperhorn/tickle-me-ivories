import { useEffect } from 'react'
import type { ThemeSettings } from 'ivories/core'

/** The canvas has alpha, but the page behind it does not. Without this the host
    page paints its own ground and an OBS browser source composites only black. */
export function useTransparentPage(theme: ThemeSettings): void {
  useEffect(() => {
    const transparent = theme.name === 'transparent' && theme.stageBgOverride === null
    document.documentElement.classList.toggle('ivories-transparent', transparent)
    return () => document.documentElement.classList.remove('ivories-transparent')
  }, [theme.name, theme.stageBgOverride])
}
