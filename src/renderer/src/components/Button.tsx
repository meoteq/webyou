import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Icon, type IconName } from './Icon'

type ButtonVariant = 'filled' | 'tonal' | 'outlined' | 'text' | 'elevated'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  icon?: IconName
  trailingIcon?: IconName
  children: ReactNode
}

export function Button({
  variant = 'filled',
  icon,
  trailingIcon,
  children,
  className,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={`md-button md-button--${variant}${className ? ` ${className}` : ''}`}
      {...rest}
    >
      {icon ? <Icon name={icon} size={18} /> : null}
      <span className="md-button__label">{children}</span>
      {trailingIcon ? <Icon name={trailingIcon} size={18} /> : null}
    </button>
  )
}

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: IconName
  label: string
  selected?: boolean
  variant?: 'standard' | 'filled' | 'tonal'
  dense?: boolean
  tooltipSide?: 'top' | 'bottom' | 'left' | 'right'
}

export function IconButton({
  icon,
  label,
  selected = false,
  variant = 'standard',
  dense = false,
  tooltipSide = 'bottom',
  className,
  type = 'button',
  ...rest
}: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      aria-pressed={rest['aria-pressed'] ?? (selected || undefined)}
      data-tooltip={label}
      data-tooltip-side={tooltipSide}
      className={`md-icon-button md-icon-button--${variant}${dense ? ' md-icon-button--dense' : ''}${
        selected ? ' is-selected' : ''
      }${className ? ` ${className}` : ''}`}
      {...rest}
    >
      <Icon name={icon} size={dense ? 18 : 22} />
    </button>
  )
}

interface ChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  selected?: boolean
  icon?: IconName
  children: ReactNode
}

export function FilterChip({ selected = false, icon, children, className, ...rest }: ChipProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={`md-chip${selected ? ' is-selected' : ''}${className ? ` ${className}` : ''}`}
      {...rest}
    >
      {selected ? <Icon name="check" size={16} /> : icon ? <Icon name={icon} size={16} /> : null}
      <span>{children}</span>
    </button>
  )
}
