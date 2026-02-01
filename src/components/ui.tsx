'use client';

import { cn } from '@/lib/utils';
import { ReactNode, ButtonHTMLAttributes, InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';

// Card
interface CardProps {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
}

export function Card({ children, className, onClick }: CardProps) {
  return (
    <div 
      className={cn('rounded-xl border border-slate-200 bg-white shadow-sm', onClick && 'cursor-pointer', className)}
      onClick={onClick}
    >
      {children}
    </div>
  );
}

export function CardHeader({ children, className }: CardProps) {
  return (
    <div className={cn('flex items-center justify-between border-b border-slate-100 px-4 py-3', className)}>
      {children}
    </div>
  );
}

export function CardTitle({ children, className }: CardProps) {
  return (
    <h3 className={cn('flex items-center gap-2 text-sm font-semibold text-slate-900', className)}>
      {children}
    </h3>
  );
}

export function CardBody({ children, className }: CardProps) {
  return <div className={cn('p-4', className)}>{children}</div>;
}

// KPI Card
interface KPICardProps {
  label: string;
  value: string | number;
  icon: ReactNode;
  trend?: { value: number; positive: boolean };
  color?: 'blue' | 'green' | 'orange' | 'pink' | 'purple' | 'teal' | 'indigo';
}

export function KPICard({ label, value, icon, trend, color = 'blue' }: KPICardProps) {
  const colors = {
    blue: 'bg-gradient-to-br from-blue-50 to-indigo-50 text-blue-600 border-blue-100',
    green: 'bg-gradient-to-br from-emerald-50 to-teal-50 text-emerald-600 border-emerald-100',
    orange: 'bg-gradient-to-br from-amber-50 to-orange-50 text-amber-600 border-amber-100',
    pink: 'bg-gradient-to-br from-rose-50 to-pink-50 text-rose-500 border-rose-100',
    purple: 'bg-gradient-to-br from-violet-50 to-purple-50 text-violet-600 border-violet-100',
    teal: 'bg-gradient-to-br from-teal-50 to-cyan-50 text-teal-600 border-teal-100',
    indigo: 'bg-gradient-to-br from-indigo-50 to-blue-50 text-indigo-600 border-indigo-100',
  };

  const iconBg = {
    blue: 'bg-blue-100/80 text-blue-600',
    green: 'bg-emerald-100/80 text-emerald-600',
    orange: 'bg-amber-100/80 text-amber-600',
    pink: 'bg-rose-100/80 text-rose-500',
    purple: 'bg-violet-100/80 text-violet-600',
    teal: 'bg-teal-100/80 text-teal-600',
    indigo: 'bg-indigo-100/80 text-indigo-600',
  };

  return (
    <Card className={cn('p-5 border', colors[color])}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</p>
          <p className="mt-2 text-2xl font-bold text-slate-800">{value}</p>
          {trend && (
            <p className={cn('mt-1 text-xs font-medium', trend.positive ? 'text-emerald-600' : 'text-rose-500')}>
              {trend.positive ? '↑' : '↓'} {Math.abs(trend.value)}%
            </p>
          )}
        </div>
        <div className={cn('flex h-11 w-11 items-center justify-center rounded-xl shadow-sm', iconBg[color])}>
          {icon}
        </div>
      </div>
    </Card>
  );
}

// Badge
interface BadgeProps {
  children: ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'primary' | 'secondary';
  className?: string;
}

export function Badge({ children, variant = 'default', className }: BadgeProps) {
  const variants = {
    default: 'bg-slate-100 text-slate-600',
    success: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
    warning: 'bg-amber-50 text-amber-700 border border-amber-200',
    danger: 'bg-rose-50 text-rose-700 border border-rose-200',
    info: 'bg-sky-50 text-sky-700 border border-sky-200',
    primary: 'bg-indigo-50 text-indigo-700 border border-indigo-200',
    secondary: 'bg-gray-50 text-gray-700 border border-gray-200',
  };

  return (
    <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium', variants[variant], className)}>
      {children}
    </span>
  );
}

// Button
interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'success' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  children: ReactNode;
}

export function Button({ variant = 'primary', size = 'md', children, className, ...props }: ButtonProps) {
  const variants = {
    primary: 'bg-blue-600 text-white hover:bg-blue-700 border-blue-600',
    secondary: 'bg-white text-slate-700 hover:bg-slate-50 border-slate-200',
    success: 'bg-green-600 text-white hover:bg-green-700 border-green-600',
    danger: 'bg-red-600 text-white hover:bg-red-700 border-red-600',
    ghost: 'bg-transparent text-slate-600 hover:bg-slate-100 border-transparent',
  };

  const sizes = {
    sm: 'px-2.5 py-1.5 text-xs',
    md: 'px-4 py-2 text-sm',
    lg: 'px-6 py-3 text-base',
  };

  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-lg border font-medium transition-colors disabled:opacity-50',
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

// Input
interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export function Input({ label, error, className, ...props }: InputProps) {
  return (
    <div className="space-y-1">
      {label && <label className="text-xs font-medium text-slate-600">{label}</label>}
      <input
        className={cn(
          'w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition-colors focus:border-blue-500',
          error && 'border-red-500',
          className
        )}
        {...props}
      />
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}

// Select
interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  options: { value: string; label: string }[];
}

export function Select({ label, error, options, className, ...props }: SelectProps) {
  return (
    <div className="space-y-1">
      {label && <label className="text-xs font-medium text-slate-600">{label}</label>}
      <select
        className={cn(
          'w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition-colors focus:border-blue-500',
          error && 'border-red-500',
          className
        )}
        {...props}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}

// Textarea
interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

export function Textarea({ label, error, className, ...props }: TextareaProps) {
  return (
    <div className="space-y-1">
      {label && <label className="text-xs font-medium text-slate-600">{label}</label>}
      <textarea
        className={cn(
          'w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition-colors focus:border-blue-500',
          error && 'border-red-500',
          className
        )}
        {...props}
      />
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}

// Modal
interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}

export function Modal({ isOpen, onClose, title, children, footer }: ModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            ✕
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto p-4">{children}</div>
        {footer && (
          <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-4 py-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

// Progress Bar
interface ProgressBarProps {
  value: number;
  max?: number;
  color?: 'blue' | 'green' | 'orange' | 'red' | 'teal' | 'indigo' | 'purple';
  showLabel?: boolean;
  className?: string;
}

export function ProgressBar({ value, max = 100, color = 'blue', showLabel = true, className }: ProgressBarProps) {
  const percentage = Math.min(Math.round((value / max) * 100), 100);
  const colors = {
    blue: 'bg-gradient-to-r from-blue-400 to-indigo-500',
    green: 'bg-gradient-to-r from-emerald-400 to-teal-500',
    orange: 'bg-gradient-to-r from-amber-400 to-orange-500',
    red: 'bg-gradient-to-r from-rose-400 to-red-500',
    teal: 'bg-gradient-to-r from-teal-400 to-cyan-500',
    indigo: 'bg-gradient-to-r from-indigo-400 to-violet-500',
    purple: 'bg-gradient-to-r from-violet-400 to-purple-500',
  };

  return (
    <div className={cn('space-y-1', className)}>
      <div className="h-2.5 w-full rounded-full bg-slate-100/80 overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all duration-500', colors[color])}
          style={{ width: `${percentage}%` }}
        />
      </div>
      {showLabel && (
        <div className="flex justify-between text-xs text-slate-500">
          <span>{value.toLocaleString('tr-TR')}</span>
          <span className="font-medium">{percentage}%</span>
        </div>
      )}
    </div>
  );
}

// Table
interface TableProps {
  children: ReactNode;
  className?: string;
}

export function Table({ children, className }: TableProps) {
  return (
    <div className="overflow-x-auto">
      <table className={cn('w-full text-sm', className)}>{children}</table>
    </div>
  );
}

export function TableHead({ children, className }: TableProps) {
  return <thead className={cn('border-b border-slate-200 bg-slate-50', className)}>{children}</thead>;
}

export function TableBody({ children, className }: TableProps) {
  return <tbody className={cn('divide-y divide-slate-100', className)}>{children}</tbody>;
}

export function TableRow({ children, className }: TableProps) {
  return <tr className={cn('hover:bg-slate-50', className)}>{children}</tr>;
}

interface TableCellProps extends TableProps {
  header?: boolean;
}

export function TableCell({ children, className, header = false }: TableCellProps) {
  const Component = header ? 'th' : 'td';
  return (
    <Component
      className={cn(
        'px-4 py-3',
        header ? 'text-left text-xs font-semibold uppercase text-slate-600' : 'text-slate-700',
        className
      )}
    >
      {children}
    </Component>
  );
}

// Loading Spinner
export function Spinner({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const sizes = {
    sm: 'h-4 w-4',
    md: 'h-6 w-6',
    lg: 'h-8 w-8',
  };

  return (
    <div className={cn('animate-spin rounded-full border-2 border-slate-200 border-t-blue-600', sizes[size])} />
  );
}

// Empty State
interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      {icon && <div className="mb-4 text-4xl text-slate-300">{icon}</div>}
      <h3 className="text-lg font-medium text-slate-900">{title}</h3>
      {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
