// The account corner (spec §2 AuthProvider; runbook §3.3). Shown only when an
// installed plugin supplies auth. Device management appears when the
// provider implements it (Task 1's optional AuthProvider members).
import { useEffect, useRef, useState } from 'react'
import type { AuthProvider, PlatformDevice } from 'ivories/core'
import { isPlatformError } from 'ivories/core'
import { useAuthState } from './useAuthState'
import { SignInDialog } from './SignInDialog'

const TRIGGER = 'rounded-full border border-[var(--line)] bg-[var(--panel)] px-3 py-1 text-xs text-[var(--ink)] shadow'
const ITEM = 'rounded border border-[var(--line)] px-2 py-1 text-left text-[11px] text-[var(--ink-dim)]'
const message = (e: unknown, fallback: string) => (isPlatformError(e) ? e.message : fallback)
const deviceName = (d: PlatformDevice) => d.label ?? d.userAgent?.slice(0, 60) ?? 'Unknown device'

export function AccountMenu(props: { auth: AuthProvider | null }) {
  const { auth } = props
  const state = useAuthState(auth)
  const [dialog, setDialog] = useState(false)
  const [open, setOpen] = useState(false)
  const [devices, setDevices] = useState<PlatformDevice[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Focus goes back to the account trigger when the sign-in dialog closes.
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const wasOpen = useRef(false)
  useEffect(() => {
    if (wasOpen.current && !dialog) triggerRef.current?.focus()
    wasOpen.current = dialog
  }, [dialog, state?.status])
  if (!auth || !state) return null

  const run = async (fn: () => Promise<void>, fallback: string) => {
    setError(null)
    try { await fn() } catch (e) { setError(message(e, fallback)) }
  }
  const close = () => { setOpen(false); setDevices(null) }
  // Bound: a class-based provider's optional methods may rely on `this`.
  const listDevices = auth.devices?.bind(auth)
  const revokeDevice = auth.revokeDevice?.bind(auth)
  const signOutEverywhere = auth.signOutEverywhere?.bind(auth)

  return (
    <div className="account-menu absolute right-3 top-3 z-30 flex flex-col items-end gap-2">
      {state.status === 'unknown' && (
        <button type="button" disabled aria-label="Checking your account" className={`account-menu-trigger account-menu-trigger--unknown ${TRIGGER} opacity-60`}>
          …
        </button>
      )}
      {state.status === 'signed-out' && (
        <button ref={triggerRef} type="button" className={`account-menu-trigger account-menu-trigger--signed-out ${TRIGGER}`} onClick={() => setDialog(true)}>
          Sign in
        </button>
      )}
      {state.status === 'signed-in' && (
        <>
          <button
            ref={triggerRef}
            type="button"
            aria-expanded={open}
            className={`account-menu-trigger account-menu-trigger--signed-in ${TRIGGER}`}
            onClick={() => { setOpen((v) => !v); setError(null) }}
          >
            @{state.user.handle}
          </button>
          {open && (
            <div className="account-menu-panel flex w-80 flex-col gap-2 rounded-lg border border-[var(--line)] bg-[var(--panel)] p-3 text-xs shadow-2xl">
              <p className="account-menu-identity text-[var(--ink-dim)]">
                Signed in as <span className="account-menu-handle font-semibold text-[var(--ink)]">@{state.user.handle}</span>
                {state.user.displayName ? ` (${state.user.displayName})` : ''}
              </p>
              {listDevices && devices === null && (
                <button type="button" className={`btn-show-devices ${ITEM}`} onClick={() => void run(async () => setDevices(await listDevices()), 'Could not list your devices.')}>
                  Devices
                </button>
              )}
              {devices !== null && (
                <ul className="account-devices flex flex-col gap-1">
                  {devices.map((d) => (
                    <li key={d.id} className="account-device flex items-center justify-between gap-2">
                      <span className="account-device-name min-w-0 truncate text-[var(--ink)]" title={d.userAgent ?? ''}>
                        {deviceName(d)}
                        {d.current && <span className="account-device-current ml-1 text-[var(--accent)]">(this device)</span>}
                      </span>
                      {revokeDevice && (
                        <button
                          type="button"
                          aria-label={`Sign out ${deviceName(d)}`}
                          className={`btn-revoke-device ${ITEM} shrink-0 whitespace-nowrap`}
                          onClick={() => void run(async () => {
                            await revokeDevice(d.id)
                            if (d.current) close()
                            else if (listDevices) setDevices(await listDevices())
                          }, 'Could not sign that device out.')}
                        >
                          Sign out
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              <button type="button" className={`btn-sign-out ${ITEM}`} onClick={() => void run(async () => { await auth.signOut(); close() }, 'Could not sign out.')}>
                Sign out
              </button>
              {signOutEverywhere && (
                <button type="button" className={`btn-sign-out-everywhere ${ITEM}`} onClick={() => void run(async () => { await signOutEverywhere(); close() }, 'Could not sign out everywhere.')}>
                  Sign out everywhere
                </button>
              )}
              {error && <p role="alert" className="account-error text-[#ff6b6b]">{error}</p>}
            </div>
          )}
        </>
      )}
      {dialog && state.status !== 'signed-in' && (
        <SignInDialog
          auth={auth}
          {...(state.status === 'signed-out' && state.pendingEmail ? { initialEmail: state.pendingEmail } : {})}
          onClose={() => setDialog(false)}
        />
      )}
    </div>
  )
}
