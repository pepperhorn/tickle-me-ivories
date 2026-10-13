// Email one-time-code sign-in (spec §2 AuthProvider). Backend-neutral: it only
// knows the AuthProvider it is given. The code length comes from the provider.
import { useEffect, useRef, useState } from 'react'
import type { AuthProvider } from 'ivories/core'
import { isPlatformError } from 'ivories/core'

const RESEND_COOLDOWN_SEC = 60
const BTN = 'rounded-full px-4 py-1.5 text-sm font-semibold'

const errorText = (e: unknown, fallback: string) => (isPlatformError(e) ? e.message : fallback)

export function SignInDialog(props: { auth: AuthProvider; initialEmail?: string; onClose(): void }) {
  const { auth, onClose } = props
  const n = auth.codeLength
  const blank = () => Array<string>(n).fill('')
  const [step, setStep] = useState<'email' | 'code'>(props.initialEmail ? 'code' : 'email')
  const [email, setEmail] = useState(props.initialEmail ?? '')
  const [digits, setDigits] = useState<string[]>(blank)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sentAt, setSentAt] = useState<number | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const inputs = useRef<(HTMLInputElement | null)[]>([])
  const resendIn = sentAt === null ? 0 : Math.max(0, Math.ceil((sentAt + RESEND_COOLDOWN_SEC * 1000 - now) / 1000))
  const cooling = resendIn > 0

  useEffect(() => {
    if (!cooling) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [cooling])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const sendCode = async () => {
    setBusy(true)
    setError(null)
    try {
      await auth.requestCode(email)
      const t = Date.now()
      setSentAt(t)
      setNow(t)
      setDigits(blank())
      setStep('code')
    } catch (e) {
      setError(errorText(e, 'Could not send a code. Try again.'))
    } finally {
      setBusy(false)
    }
  }

  const verify = async (code: string) => {
    setBusy(true)
    setError(null)
    try {
      await auth.verifyCode(email, code)
      onClose()
    } catch (e) {
      setError(errorText(e, 'Could not sign in. Try again.'))
      setDigits(blank())
      queueMicrotask(() => inputs.current[0]?.focus())
    } finally {
      setBusy(false)
    }
  }

  /** Writes digits from `index`; a pasted or autofilled code spreads forward. */
  const fill = (index: number, raw: string) => {
    const clean = raw.replace(/\D/g, '')
    const next = [...digits]
    if (clean.length === 0) next[index] = ''
    for (let i = 0; i < clean.length && index + i < n; i++) next[index + i] = clean[i]!
    setDigits(next)
    inputs.current[Math.min(index + Math.max(clean.length, 1), n - 1)]?.focus()
    if (next.every((d) => d !== '')) void verify(next.join(''))
  }

  return (
    <div
      className="sign-in-backdrop fixed inset-0 z-40 flex items-center justify-center bg-black/60"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="sign-in-title"
        className="sign-in-dialog flex w-96 max-w-[92vw] flex-col gap-4 rounded-xl border border-[var(--line)] bg-[var(--panel)] p-6 text-[var(--ink)] shadow-2xl"
      >
        <h2 id="sign-in-title" className="sign-in-title text-lg font-semibold">Sign in</h2>
        {step === 'email' ? (
          <form className="sign-in-email-form flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); void sendCode() }}>
            <p className="sign-in-hint text-xs text-[var(--ink-dim)]">We will email you a sign-in code.</p>
            <label className="sign-in-email-label flex flex-col gap-1 text-xs text-[var(--ink-dim)]">
              Email
              <input
                type="email"
                required
                autoFocus
                autoComplete="email"
                className="sign-in-email-input rounded border border-[var(--line)] bg-transparent px-2 py-1.5 text-sm text-[var(--ink)]"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <button type="submit" disabled={busy || !email.trim()} className={`btn-send-code ${BTN} bg-[var(--accent)] text-white disabled:opacity-50`}>
              Send code
            </button>
          </form>
        ) : (
          <div className="sign-in-code-step flex flex-col gap-3">
            <p role="status" aria-live="polite" className="sign-in-code-hint text-xs text-[var(--ink-dim)]">
              Enter the {n}-digit code sent to <span className="sign-in-code-email font-semibold text-[var(--ink)]">{email}</span>.
            </p>
            <div className="otp-digits flex justify-between gap-1" role="group" aria-label="Sign-in code">
              {digits.map((d, i) => (
                <input
                  key={i}
                  ref={(el) => { inputs.current[i] = el }}
                  type="text"
                  aria-label={`Digit ${i + 1} of ${n}`}
                  inputMode="numeric"
                  autoComplete={i === 0 ? 'one-time-code' : 'off'}
                  autoFocus={i === 0}
                  disabled={busy}
                  className="otp-digit h-11 w-9 rounded border border-[var(--line)] bg-transparent text-center text-lg font-semibold text-[var(--ink)]"
                  value={d}
                  onChange={(e) => fill(i, d && e.target.value.length === 2 ? e.target.value.slice(-1) : e.target.value)}
                  onPaste={(e) => { e.preventDefault(); fill(i, e.clipboardData.getData('text')) }}
                  onKeyDown={(e) => { if (e.key === 'Backspace' && !d && i > 0) inputs.current[i - 1]?.focus() }}
                />
              ))}
            </div>
            <div className="sign-in-code-actions flex items-center justify-between text-xs">
              <button type="button" className="btn-change-email text-[var(--ink-dim)] underline" onClick={() => { setStep('email'); setError(null) }}>
                Use a different email
              </button>
              <button
                type="button"
                className="btn-resend-code text-[var(--ink-dim)] underline disabled:no-underline disabled:opacity-60"
                disabled={busy || cooling}
                onClick={() => void sendCode()}
              >
                {cooling ? `Resend in ${resendIn}s` : 'Resend code'}
              </button>
            </div>
          </div>
        )}
        {error && <p role="alert" className="sign-in-error text-xs text-[#ff6b6b]">{error}</p>}
        <button type="button" className={`btn-close-sign-in ${BTN} self-end border border-[var(--line)] text-[var(--ink-dim)]`} onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  )
}
