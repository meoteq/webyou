declare module 'htmlhint' {
  export interface HtmlHintMessage {
    type: 'error' | 'warning' | 'info'
    message: string
    raw?: string
    evidence?: string
    line: number
    col: number
    rule?: { id: string; description?: string; link?: string }
  }

  export const HTMLHint: {
    verify(html: string, ruleset?: Record<string, unknown>): HtmlHintMessage[]
    defaultRuleset?: Record<string, unknown>
  }
}
