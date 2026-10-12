/**
 * Spec §16: reachable at /debug, deliberately unlinked from the normal UI.
 * The rig itself is the dependency-free tools/strike-lab.html, served as
 * public/strike-lab.html (preflight F26: no public/debug/ dir, to avoid a
 * static host resolving /debug to that directory) and framed here so the
 * route stays inside the app shell. `npm test` keeps the served copy in
 * sync with tools/strike-lab.html (see src/debug/rigSync.test.ts).
 */
export function DebugRoute() {
  return (
    <div className="debug-route flex h-full flex-col bg-[var(--ground)]">
      <div className="debug-bar flex items-center gap-3 border-b border-[var(--line)] px-4 py-2">
        <span className="debug-title text-xs font-semibold uppercase tracking-wide text-[var(--ink-dim)]">
          Strike lab — visual constant tuning rig
        </span>
        <a className="debug-back text-xs text-[var(--accent)]" href="/">Back to the app</a>
      </div>
      <iframe
        title="Strike lab"
        src="/strike-lab.html"
        className="debug-frame min-h-0 flex-1 border-0"
      />
    </div>
  )
}
