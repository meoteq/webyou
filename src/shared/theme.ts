/**
 * Colors of the native window frame. The title-bar overlay sits on top of the
 * app bar, so these values must match the surface tokens in `tokens.css`.
 */
export interface WindowColors {
  background: string
  foreground: string
}

export function windowColors(dark: boolean): WindowColors {
  return dark
    ? { background: '#0d141b', foreground: '#dce3ee' }
    : { background: '#f7f9ff', foreground: '#151c24' }
}
