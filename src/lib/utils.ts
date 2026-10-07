import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatMoney(value: number): string {
  return new Intl.NumberFormat('tr-TR').format(value);
}

export function formatDate(date: string): string {
  return new Date(date).toLocaleDateString('tr-TR');
}

export function formatDateTime(date: string): string {
  return new Date(date).toLocaleString('tr-TR');
}

export function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    'VIP': 'bg-amber-100 text-amber-800',
    'Aktif': 'bg-green-100 text-green-800',
    'Potansiyel': 'bg-blue-100 text-blue-800',
    'Pasif': 'bg-gray-100 text-gray-800',
    'active': 'bg-green-100 text-green-800',
    'inactive': 'bg-gray-100 text-gray-800',
    'pending': 'bg-yellow-100 text-yellow-800',
    'done': 'bg-green-100 text-green-800',
    'high': 'bg-red-100 text-red-800',
    'medium': 'bg-yellow-100 text-yellow-800',
    'low': 'bg-green-100 text-green-800',
  };
  return colors[status] || 'bg-gray-100 text-gray-800';
}

export function getStageColor(stage: string): string {
  const colors: Record<string, string> = {
    'Keşif': 'bg-slate-100 text-slate-800',
    'Teklif': 'bg-blue-100 text-blue-800',
    'Müzakere': 'bg-amber-100 text-amber-800',
    'Kapanış': 'bg-green-100 text-green-800',
    'Kaybedildi': 'bg-red-100 text-red-800',
  };
  return colors[stage] || 'bg-gray-100 text-gray-800';
}

export function getPriorityColor(priority: string): string {
  const colors: Record<string, string> = {
    'high': 'border-l-red-500',
    'medium': 'border-l-yellow-500',
    'low': 'border-l-green-500',
  };
  return colors[priority] || 'border-l-gray-500';
}

export function getActivityIcon(type: string): string {
  const icons: Record<string, string> = {
    'call': '📞',
    'email': '📧',
    'meeting': '🤝',
    'note': '📝',
  };
  return icons[type] || '📋';
}

// Formdan gelen boş metinleri null yapar (boş tarih / kimlik alanları veritabanında hata verir)
export function cleanPayload<T>(payload: T): T {
  const cleanOne = (obj: any) => {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return obj;
    const out: any = {};
    for (const [k, v] of Object.entries(obj)) out[k] = v === '' ? null : v;
    return out;
  };
  return (Array.isArray(payload) ? payload.map(cleanOne) : cleanOne(payload)) as T;
}
