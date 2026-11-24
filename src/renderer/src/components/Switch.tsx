import type { ChangeEvent, ReactNode } from 'react'

interface SwitchProps {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  disabled?: boolean
}

export function Switch({ checked, onChange, label, disabled }: SwitchProps): ReactNode {
  return (
    <label className={`md-switch${disabled ? ' is-disabled' : ''}`}>
      <input
        type="checkbox"
        role="switch"
        aria-label={label}
        checked={checked}
        disabled={disabled}
        onChange={(event: ChangeEvent<HTMLInputElement>) => onChange(event.target.checked)}
      />
      <span className="md-switch__track" aria-hidden="true">
        <span className="md-switch__thumb" />
      </span>
    </label>
  )
}
