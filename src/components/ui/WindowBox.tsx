import type { ReactNode } from 'react';

interface WindowBoxProps {
  children: ReactNode;
  title?: ReactNode;
  colorClass?: string;
  borderColorClass?: string;
  shadowClass?: string;
  className?: string;
  bodyClassName?: string;
}

export function WindowBox({
  children,
  title,
  colorClass = 'bg-blue-50',
  borderColorClass = 'border-blue-200',
  shadowClass = 'shadow-macaron-window',
  className = '',
  bodyClassName = '',
}: WindowBoxProps) {
  return (
    <div
      className={`flex flex-col overflow-hidden rounded-xl border-[2px] bg-white ${borderColorClass} ${shadowClass} ${className}`}
    >
      <div
        className={`flex items-center justify-between border-b-[2px] px-4 py-2 ${borderColorClass} ${colorClass}`}
      >
        <div className="flex space-x-2">
          <div className="h-3 w-3 rounded-full border border-pink-400 bg-pink-300" />
          <div className="h-3 w-3 rounded-full border border-yellow-400 bg-yellow-300" />
          <div className="h-3 w-3 rounded-full border border-green-400 bg-green-300" />
        </div>
        {title ? (
          <span className="text-xs font-bold uppercase tracking-wider text-slate-600">{title}</span>
        ) : (
          <span />
        )}
        <div className="w-12" />
      </div>

      <div className={`relative flex-1 overflow-auto bg-white/50 ${bodyClassName}`}>
        <div
          className="pointer-events-none absolute inset-0 opacity-20"
          style={{
            backgroundImage:
              'linear-gradient(to right, #e2e8f0 1px, transparent 1px), linear-gradient(to bottom, #e2e8f0 1px, transparent 1px)',
            backgroundSize: '1rem 1rem',
          }}
        />
        <div className="relative z-10 h-full">{children}</div>
      </div>
    </div>
  );
}
