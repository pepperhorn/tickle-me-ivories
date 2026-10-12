// jsdom has no canvas: return null (as a browser without 2D would) instead of
// logging "not implemented" on every view mount. Views skip drawing then.
// Guarded: node-environment test files (ssr.test.ts) run this setup too.
if (typeof HTMLCanvasElement !== 'undefined') {
  HTMLCanvasElement.prototype.getContext = (() => null) as typeof HTMLCanvasElement.prototype.getContext
}
