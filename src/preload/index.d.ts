import type { WebYouApi } from '../shared/api'

declare global {
  interface Window {
    webyou: WebYouApi
  }
}

export {}
