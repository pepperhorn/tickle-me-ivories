const DEFAULT_WEIGHTS = [400, 500, 600, 700]

const familyParam = (name: string) => encodeURIComponent(name).replace(/%20/g, '+')

/**
 * The one place a CDN font link is allowed. The UI chrome stays on self-hosted
 * @fontsource/poppins; on-stage text is a runtime user choice, so its family
 * cannot be bundled ahead of time.
 *
 * The link id is keyed on family AND weights (F36), so choosing a new weight of
 * a family already requested actually loads that weight. Google answers a
 * weight the family does not have with an error rather than a fallback, so on
 * `error` the link retries once without the `:wght@` axis (the family default).
 */
export function ensureGoogleFont(family: string, weights: number[] = DEFAULT_WEIGHTS): void {
  const name = family.trim()
  if (!name) return
  const id = `gf-${name.toLowerCase().replace(/\s+/g, '-')}-${weights.join('-')}`
  if (document.getElementById(id)) return

  const link = document.createElement('link')
  link.id = id
  link.rel = 'stylesheet'
  link.dataset.googleFont = name
  const fam = familyParam(name)
  link.href = `https://fonts.googleapis.com/css2?family=${fam}:wght@${weights.join(';')}&display=swap`
  link.addEventListener('error', () => {
    link.href = `https://fonts.googleapis.com/css2?family=${fam}&display=swap`
  }, { once: true })
  document.head.appendChild(link)
}
