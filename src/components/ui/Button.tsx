import type { ButtonHTMLAttributes } from 'react'

export function Button({ variant = 'default', className = '', type = 'button', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'default' | 'primary' | 'quiet' | 'danger' }) {
  return <button type={type} className={`button ${variant === 'default' ? '' : variant} ${className}`} {...props}/>
}
