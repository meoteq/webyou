import { describe, expect, it } from 'vitest'
import { windowColors } from '../../src/shared/theme'

describe('windowColors', () => {
  it('matches the light surface tokens', () => {
    expect(windowColors(false)).toEqual({ background: '#f7f9ff', foreground: '#151c24' })
  })

  it('matches the dark surface tokens', () => {
    expect(windowColors(true)).toEqual({ background: '#0d141b', foreground: '#dce3ee' })
  })
})
