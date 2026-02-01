'use client';

import Header from '@/components/Header';
import { Card, CardHeader, CardTitle, CardBody, Button, Badge, EmptyState } from '@/components/ui';
import { formatDate } from '@/lib/utils';
import { Bell, Check, CheckCheck, Trash2, RefreshCw, AlertTriangle, Info, CheckCircle, XCircle, Clock, Filter } from 'lucide-react';
import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase';

interface Notification {
  id: string;
  title: string;
  message: string;
  type: string;
  related_type?: string;
  related_id?: string;
  is_read: boolean;
  is_dismissed: boolean;
  created_at: string;
}

const typeConfig: Record<string, { label: string; icon: any; color: string; variant: 'default' | 'info' | 'warning' | 'success' | 'danger' }> = {
  info: { label: 'Bilgi', icon: Info, color: 'text-blue-500 bg-blue-50', variant: 'info' },
  warning: { label: 'Uyarı', icon: AlertTriangle, color: 'text-amber-500 bg-amber-50', variant: 'warning' },
  success: { label: 'Başarılı', icon: CheckCircle, color: 'text-emerald-500 bg-emerald-50', variant: 'success' },
  error: { label: 'Hata', icon: XCircle, color: 'text-red-500 bg-red-50', variant: 'danger' },
  reminder: { label: 'Hatırlatıcı', icon: Clock, color: 'text-violet-500 bg-violet-50', variant: 'default' },
};

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState('all');
  const [showRead, setShowRead] = useState(true);

  const supabase = createClient();

  const fetchNotifications = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('notifications')
        .select('*')
        .eq('is_dismissed', false)
        .order('created_at', { ascending: false });

      if (!showRead) {
        query = query.eq('is_read', false);
      }

      const { data, error } = await query;
      if (error) throw error;
      setNotifications(data || []);
    } catch (err: any) {
      console.error('Veri çekme hatası:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchNotifications(); }, [showRead]);

  const markAsRead = async (id: string) => {
    try {
      await supabase.from('notifications').update({ is_read: true }).eq('id', id);
      fetchNotifications();
    } catch (err: any) {
      console.error('Hata:', err);
    }
  };

  const markAllAsRead = async () => {
    try {
      await supabase.from('notifications').update({ is_read: true }).eq('is_read', false);
      fetchNotifications();
    } catch (err: any) {
      console.error('Hata:', err);
    }
  };

  const dismissNotification = async (id: string) => {
    try {
      await supabase.from('notifications').update({ is_dismissed: true }).eq('id', id);
      fetchNotifications();
    } catch (err: any) {
      console.error('Hata:', err);
    }
  };

  const clearAll = async () => {
    if (!confirm('Tüm bildirimleri silmek istediğinize emin misiniz?')) return;
    try {
      await supabase.from('notifications').update({ is_dismissed: true }).eq('is_dismissed', false);
      fetchNotifications();
    } catch (err: any) {
      console.error('Hata:', err);
    }
  };

  // Filtreleme
  const filteredNotifications = notifications.filter(n => {
    if (filterType !== 'all' && n.type !== filterType) return false;
    return true;
  });

  // İstatistikler
  const unreadCount = notifications.filter(n => !n.is_read).length;
  const todayCount = notifications.filter(n => {
    const today = new Date().toDateString();
    return new Date(n.created_at).toDateString() === today;
  }).length;

  // Zaman formatı
  const getTimeAgo = (date: string) => {
    const now = new Date();
    const then = new Date(date);
    const diff = Math.floor((now.getTime() - then.getTime()) / 1000);
    
    if (diff < 60) return 'Az önce';
    if (diff < 3600) return `${Math.floor(diff / 60)} dk önce`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} saat önce`;
    if (diff < 604800) return `${Math.floor(diff / 86400)} gün önce`;
    return formatDate(date);
  };

  if (loading) {
    return (
      <div>
        <Header title="Bildirimler" />
        <div className="flex h-96 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-indigo-600" />
        </div>
      </div>
    );
  }

  return (
    <div>
      <Header title="Bildirimler" />
      
      <div className="p-6">
        {/* Özet Kartları */}
        <div className="mb-6 grid gap-4 md:grid-cols-4">
          <Card className="p-4 bg-gradient-to-br from-indigo-50 to-blue-50 border-indigo-100">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-indigo-100 rounded-lg">
                <Bell className="h-5 w-5 text-indigo-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-800">{notifications.length}</p>
                <p className="text-xs text-slate-500">Toplam</p>
              </div>
            </div>
          </Card>
          <Card className="p-4 bg-gradient-to-br from-amber-50 to-orange-50 border-amber-100">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-100 rounded-lg">
                <AlertTriangle className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-800">{unreadCount}</p>
                <p className="text-xs text-slate-500">Okunmamış</p>
              </div>
            </div>
          </Card>
          <Card className="p-4 bg-gradient-to-br from-emerald-50 to-teal-50 border-emerald-100">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-emerald-100 rounded-lg">
                <Clock className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-800">{todayCount}</p>
                <p className="text-xs text-slate-500">Bugün</p>
              </div>
            </div>
          </Card>
          <Card className="p-4 bg-gradient-to-br from-violet-50 to-purple-50 border-violet-100">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-violet-100 rounded-lg">
                <CheckCheck className="h-5 w-5 text-violet-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-800">{notifications.length - unreadCount}</p>
                <p className="text-xs text-slate-500">Okunan</p>
              </div>
            </div>
          </Card>
        </div>

        {/* Toolbar */}
        <div className="mb-6 flex flex-wrap gap-4 items-center justify-between">
          <div className="flex gap-3">
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="px-3 py-2 rounded-lg border border-slate-200 text-sm"
            >
              <option value="all">Tüm Tipler</option>
              {Object.entries(typeConfig).map(([key, { label }]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={showRead}
                onChange={(e) => setShowRead(e.target.checked)}
                className="rounded border-slate-300"
              />
              Okunanları göster
            </label>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={fetchNotifications}>
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button variant="secondary" onClick={markAllAsRead} disabled={unreadCount === 0}>
              <CheckCheck className="h-4 w-4" /> Tümünü Okundu İşaretle
            </Button>
            <Button variant="danger" onClick={clearAll} disabled={notifications.length === 0}>
              <Trash2 className="h-4 w-4" /> Tümünü Temizle
            </Button>
          </div>
        </div>

        {/* Bildirim Listesi */}
        {filteredNotifications.length > 0 ? (
          <div className="space-y-3">
            {filteredNotifications.map((notification) => {
              const config = typeConfig[notification.type] || typeConfig.info;
              const Icon = config.icon;
              
              return (
                <Card 
                  key={notification.id} 
                  className={`transition-all ${!notification.is_read ? 'border-l-4 border-l-indigo-500 bg-indigo-50/30' : ''}`}
                >
                  <CardBody className="flex items-start gap-4">
                    <div className={`p-2 rounded-lg ${config.color}`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <h3 className={`font-medium ${!notification.is_read ? 'text-slate-900' : 'text-slate-600'}`}>
                            {notification.title}
                          </h3>
                          {notification.message && (
                            <p className="text-sm text-slate-500 mt-1">{notification.message}</p>
                          )}
                          <div className="flex items-center gap-3 mt-2">
                            <span className="text-xs text-slate-400">{getTimeAgo(notification.created_at)}</span>
                            <Badge variant={config.variant}>{config.label}</Badge>
                          </div>
                        </div>
                        <div className="flex gap-1">
                          {!notification.is_read && (
                            <Button variant="ghost" size="sm" onClick={() => markAsRead(notification.id)} title="Okundu işaretle">
                              <Check className="h-4 w-4 text-emerald-500" />
                            </Button>
                          )}
                          <Button variant="ghost" size="sm" onClick={() => dismissNotification(notification.id)} title="Kaldır">
                            <Trash2 className="h-4 w-4 text-slate-400" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </CardBody>
                </Card>
              );
            })}
          </div>
        ) : (
          <EmptyState
            icon={<Bell className="h-16 w-16" />}
            title="Bildirim yok"
            description="Henüz bildiriminiz bulunmuyor"
          />
        )}
      </div>
    </div>
  );
}
