import type { WebYouApi } from '@shared/api'

export function hasApi(): boolean {
  return typeof window !== 'undefined' && Boolean(window.webyou)
}

export function getApi(): WebYouApi {
  if (!hasApi()) throw new Error('WebYou preload API is unavailable')
  return window.webyou
}
