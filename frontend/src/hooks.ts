import { useEffect, useLayoutEffect, useRef, useState, type DependencyList, type RefObject } from 'react'

/** Returns `value` once it has stopped changing for `delayMs`. */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(timer)
  }, [value, delayMs])
  return debounced
}

export interface AsyncState<T> {
  data: T | null // last successful result; kept while a new request loads
  error: Error | null
  loading: boolean
}

/**
 * Runs `load` whenever `deps` change, aborting the previous request so a slow
 * response can never overwrite a newer one. Pass `enabled = false` to skip.
 */
export function useAsync<T>(
  load: (signal: AbortSignal) => Promise<T>,
  deps: DependencyList,
  enabled = true,
): AsyncState<T> {
  const [state, setState] = useState<AsyncState<T>>({ data: null, error: null, loading: enabled })

  useEffect(() => {
    if (!enabled) return
    const controller = new AbortController()
    setState((s) => ({ ...s, loading: true, error: null }))
    load(controller.signal)
      .then((data) => setState({ data, error: null, loading: false }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setState((s) => ({ ...s, loading: false, error: error instanceof Error ? error : new Error(String(error)) }))
      })
    return () => controller.abort()
    // `load` is recreated every render; `deps` lists what it actually depends on.
  }, [...deps, enabled])

  return state
}

/** Tracks an element's content width (px) so charts can redraw at the right size. */
export function useElementWidth<T extends HTMLElement>(): [RefObject<T | null>, number] {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    setWidth(Math.floor(el.getBoundingClientRect().width))
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  return [ref, width]
}
