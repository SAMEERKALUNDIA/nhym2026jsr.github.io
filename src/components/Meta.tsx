import { useEffect } from 'react'

function set(selector: string, attr: string, value: string) {
  const el = document.head.querySelector(selector)
  if (el) el.setAttribute(attr, value)
}

// Per-route title and description. The crawler-visible copy is in index.html;
// this keeps the tab and the share card correct as the visitor navigates.
export function Meta({ title, description }: { title: string; description: string }) {
  useEffect(() => {
    document.title = title
    set('meta[name="description"]', 'content', description)
    set('meta[property="og:title"]', 'content', title)
    set('meta[property="og:description"]', 'content', description)
  }, [title, description])
  return null
}
