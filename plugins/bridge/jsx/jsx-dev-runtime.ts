import type { ReactElement } from 'react'
import { Fragment, jsxDEV as base } from 'react/jsx-dev-runtime'
import { withTag, type Source } from './tag.ts'

export { Fragment }

type JsxDev = (
  type: unknown,
  props: object,
  key: unknown,
  isStatic: boolean,
  source?: Source,
  self?: unknown,
) => ReactElement

export const jsxDEV: JsxDev = (type, props, key, isStatic, source, self) =>
  (base as unknown as JsxDev)(type, withTag(type, props, source), key, isStatic, source, self)
