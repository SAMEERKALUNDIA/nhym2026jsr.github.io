export const ATTR = 'data-aif'

const ROOT = '/'

// React's dev runtime gives an absolute filename and the agent works in
// repository-relative paths, so the root is trimmed. The plugin defines it,
// since import.meta.url here is the shim's own path.
declare const __AIF_ROOT__: string

export function relative(fileName: string): string {
  const root = typeof __AIF_ROOT__ === 'string' ? __AIF_ROOT__ : ROOT
  return fileName.startsWith(root) ? fileName.slice(root.length).replace(/^\/+/, '') : fileName
}

export type Source = { fileName?: string; lineNumber?: number; columnNumber?: number }

// Only DOM elements are tagged: a component's own name is not a location, and
// its children carry their own tags.
export function withTag<P extends object>(type: unknown, props: P, source?: Source): P {
  if (typeof type !== 'string' || !source?.fileName) return props
  if (props && ATTR in props) return props
  const at = `${relative(source.fileName)}:${source.lineNumber ?? 0}:${source.columnNumber ?? 0}`
  return { ...props, [ATTR]: at }
}
