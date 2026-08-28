import type { ButtonHTMLAttributes } from 'react';
import { Icon, type IconName } from './Icon';

export function IconButton({ label, icon, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; icon: IconName }) {
  return <button className="icon-button" type="button" aria-label={label} title={label} {...props}><Icon name={icon} /></button>;
}
