'use client';

import Header from '@/components/Header';
import { Card, CardHeader, CardTitle, CardBody, Button, Badge, Modal, Input, Select, Textarea } from '@/components/ui';
import { formatDate } from '@/lib/utils';
import { Calendar as CalendarIcon, Plus, Edit2, Trash2, RefreshCw, ChevronLeft, ChevronRight, MapPin, Clock, User, Building2, Phone, Video } from 'lucide-react';
import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase';

interface Event {
  id: string;
  title: string;
  description: string;
  event_type: string;
  start_date: string;
  end_date: string;
  all_day: boolean;
  location: string;
  customer_id?: string;
  customer?: { name: string };
  sales_person_id?: string;
  sales_person?: { name: string };
  status: string;
  color: string;
  created_at: string;
}

interface Customer {
  id: string;
  name: string;
}

interface SalesPerson {
  id: string;
  name: string;
}

const eventTypes = [
  { value: 'visit', label: 'Müşteri Ziyareti', icon: MapPin, color: 'bg-blue-500' },
  { value: 'meeting', label: 'Toplantı', icon: User, color: 'bg-violet-500' },
  { value: 'call', label: 'Telefon Görüşmesi', icon: Phone, color: 'bg-emerald-500' },
  { value: 'video', label: 'Video Konferans', icon: Video, color: 'bg-amber-500' },
  { value: 'demo', label: 'Demo/Sunum', icon: Building2, color: 'bg-rose-500' },
  { value: 'other', label: 'Diğer', icon: CalendarIcon, color: 'bg-slate-500' },
];

const statusConfig: Record<string, { label: string; variant: 'default' | 'info' | 'warning' | 'success' | 'danger' }> = {
  scheduled: { label: 'Planlandı', variant: 'info' },
  completed: { label: 'Tamamlandı', variant: 'success' },
  cancelled: { label: 'İptal', variant: 'danger' },
  postponed: { label: 'Ertelendi', variant: 'warning' },
};

export default function CalendarPage() {
  const [events, setEvents] = useState<Event[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [salesTeam, setSalesTeam] = useState<SalesPerson[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<Event | null>(null);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    event_type: 'visit',
    start_date: '',
    start_time: '09:00',
    end_date: '',
    end_time: '10:00',
    all_day: false,
    location: '',
    customer_id: '',
    sales_person_id: '',
    status: 'scheduled',
  });

  const supabase = createClient();

  const fetchData = async () => {
    setLoading(true);
    try {
      const [eventsRes, customersRes, teamRes] = await Promise.all([
        supabase.from('calendar_events').select('*, customer:customers(name), sales_person:sales_team(name)').order('start_date'),
        supabase.from('customers').select('id, name').order('name'),
        supabase.from('sales_team').select('id, name').eq('status', 'active').order('name'),
      ]);
      
      setEvents(eventsRes.data || []);
      setCustomers(customersRes.data || []);
      setSalesTeam(teamRes.data || []);
    } catch (err: any) {
      console.error('Veri çekme hatası:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  // Takvim hesaplamaları
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startDay = firstDay.getDay() || 7; // Pazartesi = 1
  const daysInMonth = lastDay.getDate();
  
  const monthNames = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
  const dayNames = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));
  const goToToday = () => setCurrentDate(new Date());

  const getEventsForDate = (date: Date) => {
    const dateStr = date.toISOString().split('T')[0];
    return events.filter(e => e.start_date?.startsWith(dateStr));
  };

  const openModal = (date?: Date, event?: Event) => {
    if (event) {
      setEditingEvent(event);
      const startDate = new Date(event.start_date);
      const endDate = event.end_date ? new Date(event.end_date) : startDate;
      setFormData({
        title: event.title,
        description: event.description || '',
        event_type: event.event_type || 'visit',
        start_date: startDate.toISOString().split('T')[0],
        start_time: startDate.toTimeString().slice(0, 5),
        end_date: endDate.toISOString().split('T')[0],
        end_time: endDate.toTimeString().slice(0, 5),
        all_day: event.all_day || false,
        location: event.location || '',
        customer_id: event.customer_id || '',
        sales_person_id: event.sales_person_id || '',
        status: event.status || 'scheduled',
      });
    } else {
      setEditingEvent(null);
      const dateStr = date ? date.toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
      setFormData({
        title: '',
        description: '',
        event_type: 'visit',
        start_date: dateStr,
        start_time: '09:00',
        end_date: dateStr,
        end_time: '10:00',
        all_day: false,
        location: '',
        customer_id: '',
        sales_person_id: '',
        status: 'scheduled',
      });
    }
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!formData.title || !formData.start_date) {
      alert('Başlık ve tarih zorunludur');
      return;
    }

    try {
      const startDateTime = formData.all_day 
        ? `${formData.start_date}T00:00:00` 
        : `${formData.start_date}T${formData.start_time}:00`;
      const endDateTime = formData.all_day 
        ? `${formData.end_date || formData.start_date}T23:59:59` 
        : `${formData.end_date || formData.start_date}T${formData.end_time}:00`;

      const eventData = {
        title: formData.title,
        description: formData.description,
        event_type: formData.event_type,
        start_date: startDateTime,
        end_date: endDateTime,
        all_day: formData.all_day,
        location: formData.location,
        customer_id: formData.customer_id || null,
        sales_person_id: formData.sales_person_id || null,
        status: formData.status,
        color: eventTypes.find(t => t.value === formData.event_type)?.color || 'bg-slate-500',
      };

      if (editingEvent) {
        await supabase.from('calendar_events').update(eventData).eq('id', editingEvent.id);
      } else {
        await supabase.from('calendar_events').insert([eventData]);
      }

      setModalOpen(false);
      fetchData();
    } catch (err: any) {
      alert('Hata: ' + err.message);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Bu etkinliği silmek istediğinize emin misiniz?')) return;
    try {
      await supabase.from('calendar_events').delete().eq('id', id);
      fetchData();
    } catch (err: any) {
      alert('Hata: ' + err.message);
    }
  };

  const updateStatus = async (id: string, status: string) => {
    try {
      await supabase.from('calendar_events').update({ status }).eq('id', id);
      fetchData();
    } catch (err: any) {
      alert('Hata: ' + err.message);
    }
  };

  // Bu ay ve bu haftanın etkinlikleri
  const thisMonthEvents = events.filter(e => {
    const eventDate = new Date(e.start_date);
    return eventDate.getMonth() === month && eventDate.getFullYear() === year;
  });

  const todayEvents = getEventsForDate(new Date());
  const upcomingEvents = events.filter(e => new Date(e.start_date) >= new Date()).slice(0, 5);

  if (loading) {
    return (
      <div>
        <Header title="Takvim & Ziyaret Planlama" />
        <div className="flex h-96 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-indigo-600" />
        </div>
      </div>
    );
  }

  // Takvim grid'i oluştur
  const calendarDays = [];
  // Önceki ayın günleri
  for (let i = startDay - 1; i > 0; i--) {
    const prevDate = new Date(year, month, 1 - i);
    calendarDays.push({ date: prevDate, isCurrentMonth: false });
  }
  // Bu ayın günleri
  for (let i = 1; i <= daysInMonth; i++) {
    calendarDays.push({ date: new Date(year, month, i), isCurrentMonth: true });
  }
  // Sonraki ayın günleri (6 satır tamamla)
  const remaining = 42 - calendarDays.length;
  for (let i = 1; i <= remaining; i++) {
    calendarDays.push({ date: new Date(year, month + 1, i), isCurrentMonth: false });
  }

  return (
    <div>
      <Header title="Takvim & Ziyaret Planlama" />
      
      <div className="p-6">
        <div className="grid gap-6 lg:grid-cols-4">
          {/* Sol Panel - Takvim */}
          <div className="lg:col-span-3">
            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <div className="flex items-center gap-4">
                  <Button variant="ghost" size="sm" onClick={prevMonth}>
                    <ChevronLeft className="h-5 w-5" />
                  </Button>
                  <h2 className="text-lg font-semibold min-w-[180px] text-center">
                    {monthNames[month]} {year}
                  </h2>
                  <Button variant="ghost" size="sm" onClick={nextMonth}>
                    <ChevronRight className="h-5 w-5" />
                  </Button>
                </div>
                <div className="flex gap-2">
                  <Button variant="secondary" size="sm" onClick={goToToday}>Bugün</Button>
                  <Button variant="secondary" size="sm" onClick={fetchData}>
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                  <Button size="sm" onClick={() => openModal()}>
                    <Plus className="h-4 w-4" /> Etkinlik
                  </Button>
                </div>
              </CardHeader>
              <CardBody className="p-2">
                {/* Gün başlıkları */}
                <div className="grid grid-cols-7 gap-1 mb-1">
                  {dayNames.map(day => (
                    <div key={day} className="text-center text-xs font-medium text-slate-500 py-2">
                      {day}
                    </div>
                  ))}
                </div>
                
                {/* Takvim grid */}
                <div className="grid grid-cols-7 gap-1">
                  {calendarDays.map(({ date, isCurrentMonth }, index) => {
                    const dayEvents = getEventsForDate(date);
                    const isToday = date.toDateString() === new Date().toDateString();
                    
                    return (
                      <div
                        key={index}
                        onClick={() => openModal(date)}
                        className={`min-h-[100px] p-1 rounded-lg cursor-pointer transition-colors ${
                          isCurrentMonth ? 'bg-white hover:bg-slate-50' : 'bg-slate-50/50'
                        } ${isToday ? 'ring-2 ring-indigo-500' : 'border border-slate-100'}`}
                      >
                        <div className={`text-sm font-medium mb-1 ${
                          isToday ? 'text-indigo-600' : isCurrentMonth ? 'text-slate-900' : 'text-slate-400'
                        }`}>
                          {date.getDate()}
                        </div>
                        <div className="space-y-0.5">
                          {dayEvents.slice(0, 3).map(event => {
                            const eventType = eventTypes.find(t => t.value === event.event_type);
                            return (
                              <div
                                key={event.id}
                                onClick={(e) => { e.stopPropagation(); openModal(undefined, event); }}
                                className={`text-xs px-1 py-0.5 rounded truncate text-white ${eventType?.color || 'bg-slate-500'}`}
                              >
                                {event.title}
                              </div>
                            );
                          })}
                          {dayEvents.length > 3 && (
                            <div className="text-xs text-slate-500 px-1">
                              +{dayEvents.length - 3} daha
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardBody>
            </Card>
          </div>

          {/* Sağ Panel - Özet */}
          <div className="space-y-6">
            {/* İstatistikler */}
            <Card className="p-4 bg-gradient-to-br from-indigo-50 to-blue-50 border-indigo-100">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-100 rounded-lg">
                  <CalendarIcon className="h-5 w-5 text-indigo-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-slate-800">{thisMonthEvents.length}</p>
                  <p className="text-xs text-slate-500">Bu Ay Etkinlik</p>
                </div>
              </div>
            </Card>

            {/* Bugünün Etkinlikleri */}
            <Card>
              <CardHeader>
                <CardTitle>
                  <Clock className="h-4 w-4" /> Bugün
                </CardTitle>
              </CardHeader>
              <CardBody className="space-y-2">
                {todayEvents.length > 0 ? (
                  todayEvents.map(event => {
                    const eventType = eventTypes.find(t => t.value === event.event_type);
                    const Icon = eventType?.icon || CalendarIcon;
                    return (
                      <div key={event.id} className="flex items-start gap-2 p-2 rounded-lg hover:bg-slate-50">
                        <div className={`p-1.5 rounded ${eventType?.color} text-white`}>
                          <Icon className="h-3 w-3" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{event.title}</p>
                          <p className="text-xs text-slate-500">
                            {new Date(event.start_date).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                        <Badge variant={statusConfig[event.status]?.variant} className="text-xs">
                          {statusConfig[event.status]?.label}
                        </Badge>
                      </div>
                    );
                  })
                ) : (
                  <p className="text-sm text-slate-500 text-center py-4">Bugün etkinlik yok</p>
                )}
              </CardBody>
            </Card>

            {/* Yaklaşan Etkinlikler */}
            <Card>
              <CardHeader>
                <CardTitle>
                  <CalendarIcon className="h-4 w-4" /> Yaklaşan
                </CardTitle>
              </CardHeader>
              <CardBody className="space-y-2">
                {upcomingEvents.length > 0 ? (
                  upcomingEvents.map(event => {
                    const eventType = eventTypes.find(t => t.value === event.event_type);
                    return (
                      <div
                        key={event.id}
                        onClick={() => openModal(undefined, event)}
                        className="flex items-center gap-2 p-2 rounded-lg hover:bg-slate-50 cursor-pointer"
                      >
                        <div className={`w-2 h-2 rounded-full ${eventType?.color}`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{event.title}</p>
                          <p className="text-xs text-slate-500">
                            {formatDate(event.start_date)}
                          </p>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <p className="text-sm text-slate-500 text-center py-4">Yaklaşan etkinlik yok</p>
                )}
              </CardBody>
            </Card>

            {/* Etkinlik Tipleri */}
            <Card>
              <CardHeader>
                <CardTitle>Etkinlik Türleri</CardTitle>
              </CardHeader>
              <CardBody className="space-y-2">
                {eventTypes.map(type => {
                  const Icon = type.icon;
                  const count = events.filter(e => e.event_type === type.value).length;
                  return (
                    <div key={type.value} className="flex items-center gap-2">
                      <div className={`p-1.5 rounded ${type.color} text-white`}>
                        <Icon className="h-3 w-3" />
                      </div>
                      <span className="text-sm flex-1">{type.label}</span>
                      <span className="text-sm text-slate-500">{count}</span>
                    </div>
                  );
                })}
              </CardBody>
            </Card>
          </div>
        </div>
      </div>

      {/* Etkinlik Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingEvent ? 'Etkinlik Düzenle' : 'Yeni Etkinlik'}
        footer={
          <>
            {editingEvent && (
              <Button variant="danger" onClick={() => { handleDelete(editingEvent.id); setModalOpen(false); }}>
                Sil
              </Button>
            )}
            <Button variant="secondary" onClick={() => setModalOpen(false)}>İptal</Button>
            <Button onClick={handleSave}>Kaydet</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label="Etkinlik Başlığı *"
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            placeholder="Örn: Müşteri Ziyareti - ABC Ltd."
          />

          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Etkinlik Türü"
              value={formData.event_type}
              onChange={(e) => setFormData({ ...formData, event_type: e.target.value })}
              options={eventTypes.map(t => ({ value: t.value, label: t.label }))}
            />
            <Select
              label="Durum"
              value={formData.status}
              onChange={(e) => setFormData({ ...formData, status: e.target.value })}
              options={Object.entries(statusConfig).map(([k, v]) => ({ value: k, label: v.label }))}
            />
          </div>

          <div className="flex items-center gap-2 mb-2">
            <input
              type="checkbox"
              id="allDay"
              checked={formData.all_day}
              onChange={(e) => setFormData({ ...formData, all_day: e.target.checked })}
              className="rounded border-slate-300"
            />
            <label htmlFor="allDay" className="text-sm text-slate-600">Tüm gün</label>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Input
                label="Başlangıç Tarihi *"
                type="date"
                value={formData.start_date}
                onChange={(e) => setFormData({ ...formData, start_date: e.target.value, end_date: e.target.value })}
              />
            </div>
            {!formData.all_day && (
              <div>
                <Input
                  label="Başlangıç Saati"
                  type="time"
                  value={formData.start_time}
                  onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
                />
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Input
                label="Bitiş Tarihi"
                type="date"
                value={formData.end_date}
                onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
              />
            </div>
            {!formData.all_day && (
              <div>
                <Input
                  label="Bitiş Saati"
                  type="time"
                  value={formData.end_time}
                  onChange={(e) => setFormData({ ...formData, end_time: e.target.value })}
                />
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Müşteri"
              value={formData.customer_id}
              onChange={(e) => setFormData({ ...formData, customer_id: e.target.value })}
              options={[
                { value: '', label: 'Seçiniz' },
                ...customers.map(c => ({ value: c.id, label: c.name }))
              ]}
            />
            <Select
              label="Satış Uzmanı"
              value={formData.sales_person_id}
              onChange={(e) => setFormData({ ...formData, sales_person_id: e.target.value })}
              options={[
                { value: '', label: 'Seçiniz' },
                ...salesTeam.map(s => ({ value: s.id, label: s.name }))
              ]}
            />
          </div>

          <Input
            label="Konum"
            value={formData.location}
            onChange={(e) => setFormData({ ...formData, location: e.target.value })}
            placeholder="Adres veya online link"
          />

          <Textarea
            label="Açıklama"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            rows={3}
          />
        </div>
      </Modal>
    </div>
  );
}
