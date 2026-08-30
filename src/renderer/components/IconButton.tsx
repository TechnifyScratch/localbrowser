import type { ButtonHTMLAttributes } from 'react';
import { Icon, type IconName } from './Icon';

export function IconButton({ label, icon, className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; icon: IconName }) {
  return <button className={`icon-button ${className}`.trim()} type="button" aria-label={label} title={label} {...props}><Icon name={icon} /></button>;
}
