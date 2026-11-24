/**
 * Split-view geometry for the workspace: the editor column and the preview
 * share one horizontal container.
 *
 * `splitRatio` is the editor's share of that container (0..1); whatever is
 * left belongs to the preview. A small ratio therefore means a wide preview,
 * and the editor may be collapsed to zero so the preview can take everything.
 */

export const DEFAULT_SPLIT_RATIO = 0.52

/** The preview never becomes narrower than this. */
export const MIN_PREVIEW_WIDTH = 220

/**
 * The editor is either wide enough to read or collapsed to zero. Anything in
 * between would clip the tab strip and the gutter, so the splitter snaps.
 */
export const MIN_EDITOR_WIDTH = 320

/** Below this editor width the column is collapsed instead of squeezed. */
export const EDITOR_HIDE_WIDTH = MIN_EDITOR_WIDTH

export interface SplitRatioLimits {
  /** Smallest editor share — the widest preview. */
  min: number
  /** Largest editor share — the narrowest preview. */
  max: number
}

/** Clamps a ratio into 0..1 without knowing the container width. */
export function clampRatio(ratio: number): number {
  if (!Number.isFinite(ratio)) return DEFAULT_SPLIT_RATIO
  return Math.min(1, Math.max(0, ratio))
}

/**
 * Pixel-aware bounds for the editor share.
 *
 * The lower bound is zero: the editor can be collapsed completely so the
 * preview reaches the full width. The upper bound keeps the preview usable.
 */
export function splitRatioLimits(containerWidth: number): SplitRatioLimits {
  if (!Number.isFinite(containerWidth) || containerWidth <= 0) {
    return { min: 0, max: 1 }
  }
  return { min: 0, max: Math.max(0, 1 - MIN_PREVIEW_WIDTH / containerWidth) }
}

/** Clamps a ratio so the preview keeps its minimum width. */
export function clampSplitRatio(ratio: number, containerWidth: number): number {
  const limits = splitRatioLimits(containerWidth)
  return Math.min(limits.max, Math.max(limits.min, clampRatio(ratio)))
}

/**
 * Snaps a ratio to a readable editor width: a drag that would leave the editor
 * narrower than `MIN_EDITOR_WIDTH` collapses it to zero instead. Without the
 * snap the column would sit at an unusable 100–319 px, clipping its children.
 */
export function snapSplitRatio(ratio: number, containerWidth: number): number {
  const clamped = clampSplitRatio(ratio, containerWidth)
  if (!Number.isFinite(containerWidth) || containerWidth <= 0) return clamped
  if (clamped > 0 && clamped * containerWidth < MIN_EDITOR_WIDTH) return 0
  return clamped
}

/**
 * True when the editor would be too narrow to read, in which case the column
 * collapses and the preview gets the whole container.
 */
export function isEditorCollapsed(ratio: number, containerWidth: number): boolean {
  if (!Number.isFinite(containerWidth) || containerWidth <= 0) return false
  return clampRatio(ratio) * containerWidth < MIN_EDITOR_WIDTH
}
