import type { ButtonHTMLAttributes, ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

type Variant = 'primary' | 'secondary' | 'neutral' | 'nav';

interface CuteButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon?: LucideIcon;
  label?: ReactNode;
  active?: boolean;
  variant?: Variant;
}

export function CuteButton({
  icon: Icon,
  label,
  active = false,
  variant = 'primary',
  className = '',
  ...props
}: CuteButtonProps) {
  const baseStyle =
    'inline-flex items-center gap-2 rounded-lg border-[2px] px-4 py-2 text-sm font-bold transition-all duration-200 hover:-translate-y-0.5 active:translate-y-1 active:shadow-none disabled:pointer-events-none disabled:opacity-50';

  const variants: Record<Variant, string> = {
    primary:
      'border-pink-300 bg-pink-100 text-pink-700 shadow-macaron-button-pink hover:bg-pink-200',
    secondary:
      'border-blue-300 bg-blue-100 text-blue-700 shadow-macaron-button-blue hover:bg-blue-200',
    neutral:
      'border-slate-300 bg-white text-slate-600 shadow-macaron-button-slate hover:bg-slate-50',
    nav: active
      ? 'w-full justify-center border-blue-300 bg-blue-50 text-blue-700 shadow-macaron-button-blue'
      : 'w-full justify-center border-slate-200 bg-white text-slate-500 shadow-macaron-button-slate hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700 hover:shadow-macaron-button-slate',
  };

  return (
    <button className={`${baseStyle} ${variants[variant]} ${className}`} {...props}>
      {Icon ? <Icon size={18} className={active ? 'animate-pulse' : undefined} /> : null}
      {label ? <span>{label}</span> : null}
    </button>
  );
}
