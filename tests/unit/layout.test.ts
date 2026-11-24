import { describe, expect, it } from 'vitest'
import {
  clampRatio,
  clampSplitRatio,
  DEFAULT_SPLIT_RATIO,
  EDITOR_HIDE_WIDTH,
  isEditorCollapsed,
  MIN_EDITOR_WIDTH,
  MIN_PREVIEW_WIDTH,
  snapSplitRatio,
  splitRatioLimits
} from '@shared/layout'

describe('clampRatio', () => {
  it('keeps a valid ratio untouched', () => {
    expect(clampRatio(0.4)).toBe(0.4)
    expect(clampRatio(0.92)).toBe(0.92)
  })

  it('clamps to the 0..1 range', () => {
    expect(clampRatio(-2)).toBe(0)
    expect(clampRatio(3)).toBe(1)
  })

  it('falls back to the default for non-finite input', () => {
    expect(clampRatio(Number.NaN)).toBe(DEFAULT_SPLIT_RATIO)
    expect(clampRatio(Number.POSITIVE_INFINITY)).toBe(DEFAULT_SPLIT_RATIO)
  })
})

describe('splitRatioLimits', () => {
  it('lets the editor collapse so the preview fills the container', () => {
    expect(splitRatioLimits(1600).min).toBe(0)
  })

  it('keeps the preview at its minimum width at the other end', () => {
    expect(splitRatioLimits(1600).max).toBeCloseTo(1 - MIN_PREVIEW_WIDTH / 1600, 10)
  })

  it('allows the whole range when the width is unknown', () => {
    expect(splitRatioLimits(0)).toEqual({ min: 0, max: 1 })
    expect(splitRatioLimits(Number.NaN)).toEqual({ min: 0, max: 1 })
  })
})

describe('clampSplitRatio', () => {
  it('leaves a mid-range ratio alone on a wide container', () => {
    expect(clampSplitRatio(0.5, 1600)).toBe(0.5)
  })

  it('reaches zero so the preview becomes as wide as possible', () => {
    expect(clampSplitRatio(-1, 1600)).toBe(0)
  })

  it('does not shrink the preview below its minimum', () => {
    const ratio = clampSplitRatio(1, 1000)
    expect(1000 * (1 - ratio)).toBeCloseTo(MIN_PREVIEW_WIDTH, 6)
  })

  it('ignores an unknown container width', () => {
    expect(clampSplitRatio(0.98, 0)).toBe(0.98)
    expect(clampSplitRatio(1.4, Number.NaN)).toBe(1)
  })
})

describe('isEditorCollapsed', () => {
  it('collapses only when the editor is narrower than its threshold', () => {
    expect(isEditorCollapsed(0, 1200)).toBe(true)
    expect(isEditorCollapsed(0.02, 1200)).toBe(true)
    expect(isEditorCollapsed(EDITOR_HIDE_WIDTH / 1200, 1200)).toBe(false)
    expect(isEditorCollapsed(0.5, 1200)).toBe(false)
  })

  it('stays expanded while the container width is unknown', () => {
    expect(isEditorCollapsed(0, 0)).toBe(false)
    expect(isEditorCollapsed(0, Number.NaN)).toBe(false)
  })
})

describe('snapSplitRatio', () => {
  it('keeps an editor that meets the readable minimum', () => {
    expect(snapSplitRatio(0.5, 1600)).toBe(0.5)
    expect(snapSplitRatio(MIN_EDITOR_WIDTH / 1600, 1600)).toBeCloseTo(0.2, 10)
  })

  it('collapses a drag that would leave the editor too narrow', () => {
    expect(snapSplitRatio(0.1, 1600)).toBe(0)
    expect(snapSplitRatio(0.19, 1600)).toBe(0)
    expect(snapSplitRatio(0.01, 1600)).toBe(0)
  })

  it('still respects both container edges', () => {
    expect(snapSplitRatio(-1, 1600)).toBe(0)
    expect(snapSplitRatio(2, 1000)).toBeCloseTo(1 - MIN_PREVIEW_WIDTH / 1000, 10)
  })

  it('only clamps when the container width is unknown', () => {
    expect(snapSplitRatio(0.1, 0)).toBe(0.1)
    expect(snapSplitRatio(0.1, Number.NaN)).toBe(0.1)
  })
})
