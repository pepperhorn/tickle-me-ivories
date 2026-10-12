import { Component, useContext } from 'react'
import type { ReactNode } from 'react'
import { IvoriesError } from '../core/errors'
import { IvoriesContext } from './context'
import type { IvoriesErrorCode } from '../core/errors'

interface BoundaryProps {
  code: IvoriesErrorCode
  onError?: (e: IvoriesError) => void
  className?: string
  children?: ReactNode
}

/** A failing view never tears down its siblings (spec §8). */
export class IvoriesBoundary extends Component<BoundaryProps, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError(): { failed: boolean } { return { failed: true } }

  componentDidCatch(cause: unknown): void {
    this.props.onError?.(new IvoriesError(this.props.code, 'This view stopped working.', cause))
  }

  render(): ReactNode {
    if (this.state.failed) {
      return (
        <div className={`ivories ivories-message ivories-boundary ${this.props.className ?? ''}`} role="alert">
          This view stopped working.
        </div>
      )
    }
    return this.props.children
  }
}

export function Guarded(props: { code?: IvoriesErrorCode; className?: string; children?: ReactNode }) {
  const ctx = useContext(IvoriesContext)
  return (
    <IvoriesBoundary code={props.code ?? 'render-failed'} onError={ctx?.reportError} className={props.className}>
      {props.children}
    </IvoriesBoundary>
  )
}
