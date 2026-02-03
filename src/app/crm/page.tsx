'use client';

import Header from '@/components/Header';
import SalesFilter from '@/components/SalesFilter';
import { Card, CardHeader, CardTitle, CardBody, Button, Badge, Modal, Input, Select, Textarea, EmptyState } from '@/components/ui';
import { Calendar, Plus, Edit2, Trash2, RefreshCw, Phone, Mail, Users, CheckSquare, Clock, Building2 } from 'lucide-react';
import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase';

interface Activity {
  id: string;
  customer_id: string | null;
  sales_person_id: string | null;
  type: string;
  title: string;
  description: string;
  activity_date: string;
  customer?: { name: string } | null;
  sales_team?: { name: string; region: string } | null;
}

interface Task {
  id: string;
  customer_id: string | null;
  sales_person_id: string | null;
  title: string;
  description: string;
  due_date: string;
  priority: string;
  status: string;
  customer?: { name: string } | null;
  sales_team?: { name: string; region: string } | null;
}

interface Customer {
  id: string;
  name: string;
}

interface SalesPerson {
  id: string;
  name: string;
  region: string;
}

export default function CRMPage() {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [salesTeam, setSalesTeam] = useState<SalesPerson[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'activities' | 'tasks'>('activities');
  const [filterRegion, setFilterRegion] = useState('');
  const [filterPerson, setFilterPerson] = useState('');
  
  // Modals
  const [activityModalOpen, setActivityModalOpen] = useState(false);
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [editingActivity, setEditingActivity] = useState<Activity | null>(null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  
  const [activityForm, setActivityForm] = useState({
    customer_id: '', sales_person_id: '', type: 'Telefon', title: '', description: '', activity_date: '',
  });
  const [taskForm, setTaskForm] = useState({
    customer_id: '', sales_person_id: '', title: '', description: '', due_date: '', priority: 'Orta', status: 'Bekliyor',
  });

  const supabase = createClient();

  const fetchData = async () => {
    setLoading(true);
    try {
      const [actRes, taskRes, custRes, teamRes] = await Promise.all([
        supabase.from('crm_activities').select('*').order('activity_date', { ascending: false }),
        supabase.from('crm_tasks').select('*').order('due_date', { ascending: true }),
  useEffect(() => { fetchData(); }, []);

  const handleFilterChange = (filters: { region: string; department: string; repId: string }) => {
    setFilterRegion(filters.region);
    setFilterPerson(filters.repId);
  };

  // Filtreleme
  const filteredActivities = activities.filter(a => {
    const matchPerson = !filterPerson || a.sales_person_id === filterPerson;
    const matchRegion = !filterRegion || (a.sales_team?.region === filterRegion);
    return matchPerson && matchRegion;
  });

  const filteredTasks = tasks.filter(t => {
    const matchPerson = !filterPerson || t.sales_person_id === filterPerson;
    const matchRegion = !filterRegion || (t.sales_team?.region === filterRegion);
    return matchPerson && matchRegion;
  });

  // Activity Modal
  const openActivityModal = (activity?: Activity) => {
    if (activity) {
      setEditingActivity(activity);
      setActivityForm({
        customer_id: activity.customer_id || '', sales_person_id: activity.sales_person_id || '',
        type: activity.type || 'Telefon', title: activity.title || '',
        description: activity.description || '', activity_date: activity.activity_date?.split('T')[0] || '',
      });
    } else {
      setEditingActivity(null);
      setActivityForm({ customer_id: '', sales_person_id: '', type: 'Telefon', title: '', description: '', activity_date: new Date().toISOString().split('T')[0] });
    }
    setActivityModalOpen(true);
  };

  const handleSaveActivity = async () => {
    if (!activityForm.title) { alert('Başlık zorunludur'); return; }
    setSaving(true);
    try {
      const dataToSave = { ...activityForm, customer_id: activityForm.customer_id || null, sales_person_id: activityForm.sales_person_id || null };
      if (editingActivity) {
        await supabase.from('crm_activities').update(dataToSave).eq('id', editingActivity.id);
      } else {
        await supabase.from('crm_activities').insert([dataToSave]);
      }
      setActivityModalOpen(false);
      fetchData();
    } catch (err: any) {
      alert('Hata: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteActivity = async (id: string) => {
    if (!confirm('Silmek istediğinize emin misiniz?')) return;
    await supabase.from('crm_activities').delete().eq('id', id);
    fetchData();
  };

  // Task Modal
  const openTaskModal = (task?: Task) => {
    if (task) {
      setEditingTask(task);
      setTaskForm({
        customer_id: task.customer_id || '', sales_person_id: task.sales_person_id || '',
        title: task.title || '', description: task.description || '',
        due_date: task.due_date || '', priority: task.priority || 'Orta', status: task.status || 'Bekliyor',
      });
    } else {
      setEditingTask(null);
      setTaskForm({ customer_id: '', sales_person_id: '', title: '', description: '', due_date: '', priority: 'Orta', status: 'Bekliyor' });
    }
    setTaskModalOpen(true);
  };

  const handleSaveTask = async () => {
    if (!taskForm.title) { alert('Başlık zorunludur'); return; }
    setSaving(true);
    try {
      const dataToSave = { ...taskForm, customer_id: taskForm.customer_id || null, sales_person_id: taskForm.sales_person_id || null };
      if (editingTask) {
        await supabase.from('crm_tasks').update(dataToSave).eq('id', editingTask.id);
      } else {
        await supabase.from('crm_tasks').insert([dataToSave]);
      }
      setTaskModalOpen(false);
      fetchData();
    } catch (err: any) {
      alert('Hata: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteTask = async (id: string) => {
    if (!confirm('Silmek istediğinize emin misiniz?')) return;
    await supabase.from('crm_tasks').delete().eq('id', id);
    fetchData();
  };

  const getAssignedName = (id: string | null) => {
    if (!id) return '-';
    const person = salesTeam.find(s => s.id === id);
    return person?.name || '-';
  };

  const activityIcons: Record<string, any> = {
    'Telefon': <Phone className="h-4 w-4" />,
    'Email': <Mail className="h-4 w-4" />,
    'Toplantı': <Users className="h-4 w-4" />,
    'Ziyaret': <Building2 className="h-4 w-4" />,
    'Demo': <CheckSquare className="h-4 w-4" />,
  };

  const priorityColors: Record<string, 'danger' | 'warning' | 'info'> = {
    'Yüksek': 'danger',
    'Orta': 'warning',
    'Düşük': 'info',
  };

  if (loading) {
    return <div><Header title="CRM" /><div className="flex h-96 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-blue-600" /></div></div>;
  }

  return (
    <div>
      <Header title="CRM" />
      <div className="p-6">
        {/* Bölge ve Kişi Filtresi */}
        <SalesFilter onFilterChange={handleFilterChange} />

        {/* Stats */}
        <div className="mb-6 grid gap-4 md:grid-cols-4">
          <Card className="p-4"><p className="text-2xl font-bold">{filteredActivities.length}</p><p className="text-xs text-slate-500">Toplam Aktivite</p></Card>
          <Card className="p-4"><p className="text-2xl font-bold text-blue-600">{filteredTasks.length}</p><p className="text-xs text-slate-500">Toplam Görev</p></Card>
          <Card className="p-4"><p className="text-2xl font-bold text-amber-600">{filteredTasks.filter(t => t.status === 'Bekliyor').length}</p><p className="text-xs text-slate-500">Bekleyen Görev</p></Card>
          <Card className="p-4"><p className="text-2xl font-bold text-green-600">{filteredTasks.filter(t => t.status === 'Tamamlandı').length}</p><p className="text-xs text-slate-500">Tamamlanan</p></Card>
        </div>

        {/* Tabs */}
        <div className="mb-6 flex gap-2 border-b">
          <button onClick={() => setActiveTab('activities')} className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${activeTab === 'activities' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500'}`}>
            <Calendar className="h-4 w-4 inline mr-1" /> Aktiviteler ({filteredActivities.length})
          </button>
          <button onClick={() => setActiveTab('tasks')} className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${activeTab === 'tasks' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500'}`}>
            <CheckSquare className="h-4 w-4 inline mr-1" /> Görevler ({filteredTasks.length})
          </button>
        </div>

        {/* Content */}
        {activeTab === 'activities' ? (
          <>
            <div className="mb-4 flex justify-between items-center">
              <h3 className="font-medium">Aktiviteler</h3>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={fetchData}><RefreshCw className="h-4 w-4" /></Button>
                <Button onClick={() => openActivityModal()}><Plus className="h-4 w-4" />Yeni Aktivite</Button>
              </div>
            </div>
            {filteredActivities.length > 0 ? (
              <div className="space-y-3">
                {filteredActivities.map((a) => (
                  <Card key={a.id}>
                    <CardBody className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600">
                          {activityIcons[a.type] || <Calendar className="h-4 w-4" />}
                        </div>
                        <div>
                          <h4 className="font-medium">{a.title}</h4>
                          <div className="flex items-center gap-3 text-xs text-slate-500">
                            <span>{a.type}</span>
                            {a.customer && <span>• {a.customer.name}</span>}
                            <span>• {getAssignedName(a.sales_person_id)}</span>
                            {a.activity_date && <span>• {new Date(a.activity_date).toLocaleDateString('tr-TR')}</span>}
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" onClick={() => openActivityModal(a)}><Edit2 className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="sm" onClick={() => handleDeleteActivity(a.id)}><Trash2 className="h-4 w-4 text-red-500" /></Button>
                      </div>
                    </CardBody>
                  </Card>
                ))}
              </div>
            ) : (
              <EmptyState icon={<Calendar className="h-16 w-16" />} title="Aktivite bulunamadı" description="Seçilen filtrelere uygun aktivite yok" action={<Button onClick={() => openActivityModal()}><Plus className="h-4 w-4" />Ekle</Button>} />
            )}
          </>
        ) : (
          <>
            <div className="mb-4 flex justify-between items-center">
              <h3 className="font-medium">Görevler</h3>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={fetchData}><RefreshCw className="h-4 w-4" /></Button>
                <Button onClick={() => openTaskModal()}><Plus className="h-4 w-4" />Yeni Görev</Button>
              </div>
            </div>
            {filteredTasks.length > 0 ? (
              <div className="space-y-3">
                {filteredTasks.map((t) => (
                  <Card key={t.id}>
                    <CardBody className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${t.status === 'Tamamlandı' ? 'bg-green-100 text-green-600' : 'bg-amber-100 text-amber-600'}`}>
                          <CheckSquare className="h-4 w-4" />
                        </div>
                        <div>
                          <h4 className="font-medium">{t.title}</h4>
                          <div className="flex items-center gap-3 text-xs text-slate-500">
                            <Badge variant={priorityColors[t.priority] || 'info'}>{t.priority}</Badge>
                            {t.customer && <span>• {t.customer.name}</span>}
                            <span>• {getAssignedName(t.sales_person_id)}</span>
                            {t.due_date && <span>• {new Date(t.due_date).toLocaleDateString('tr-TR')}</span>}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={t.status === 'Tamamlandı' ? 'success' : t.status === 'Devam Ediyor' ? 'warning' : 'info'}>{t.status}</Badge>
                        <Button variant="ghost" size="sm" onClick={() => openTaskModal(t)}><Edit2 className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="sm" onClick={() => handleDeleteTask(t.id)}><Trash2 className="h-4 w-4 text-red-500" /></Button>
                      </div>
                    </CardBody>
                  </Card>
                ))}
              </div>
            ) : (
              <EmptyState icon={<CheckSquare className="h-16 w-16" />} title="Görev bulunamadı" description="Seçilen filtrelere uygun görev yok" action={<Button onClick={() => openTaskModal()}><Plus className="h-4 w-4" />Ekle</Button>} />
            )}
          </>
        )}
      </div>

      {/* Activity Modal */}
      <Modal isOpen={activityModalOpen} onClose={() => setActivityModalOpen(false)} title={editingActivity ? 'Aktivite Düzenle' : 'Yeni Aktivite'}
        footer={<><Button variant="secondary" onClick={() => setActivityModalOpen(false)}>İptal</Button><Button onClick={handleSaveActivity} disabled={saving}>{saving ? 'Kaydediliyor...' : 'Kaydet'}</Button></>}>
        <div className="space-y-4">
          <Input label="Başlık *" value={activityForm.title} onChange={(e) => setActivityForm({ ...activityForm, title: e.target.value })} />
          <div className="grid grid-cols-2 gap-4">
            <Select label="Tip" value={activityForm.type} onChange={(e) => setActivityForm({ ...activityForm, type: e.target.value })}
              options={[{ value: 'Telefon', label: 'Telefon' }, { value: 'Email', label: 'Email' }, { value: 'Toplantı', label: 'Toplantı' }, { value: 'Ziyaret', label: 'Ziyaret' }, { value: 'Demo', label: 'Demo' }]} />
            <Input label="Tarih" type="date" value={activityForm.activity_date} onChange={(e) => setActivityForm({ ...activityForm, activity_date: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Select label="Müşteri" value={activityForm.customer_id} onChange={(e) => setActivityForm({ ...activityForm, customer_id: e.target.value })}
              options={[{ value: '', label: 'Seçiniz' }, ...customers.map(c => ({ value: c.id, label: c.name }))]} />
            <Select label="Sorumlu" value={activityForm.sales_person_id} onChange={(e) => setActivityForm({ ...activityForm, sales_person_id: e.target.value })}
              options={[{ value: '', label: 'Seçiniz' }, ...salesTeam.map(s => ({ value: s.id, label: s.name }))]} />
          </div>
          <Textarea label="Açıklama" value={activityForm.description} onChange={(e) => setActivityForm({ ...activityForm, description: e.target.value })} />
        </div>
      </Modal>

      {/* Task Modal */}
      <Modal isOpen={taskModalOpen} onClose={() => setTaskModalOpen(false)} title={editingTask ? 'Görev Düzenle' : 'Yeni Görev'}
        footer={<><Button variant="secondary" onClick={() => setTaskModalOpen(false)}>İptal</Button><Button onClick={handleSaveTask} disabled={saving}>{saving ? 'Kaydediliyor...' : 'Kaydet'}</Button></>}>
        <div className="space-y-4">
          <Input label="Başlık *" value={taskForm.title} onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })} />
          <div className="grid grid-cols-2 gap-4">
            <Select label="Öncelik" value={taskForm.priority} onChange={(e) => setTaskForm({ ...taskForm, priority: e.target.value })}
              options={[{ value: 'Düşük', label: 'Düşük' }, { value: 'Orta', label: 'Orta' }, { value: 'Yüksek', label: 'Yüksek' }]} />
            <Select label="Durum" value={taskForm.status} onChange={(e) => setTaskForm({ ...taskForm, status: e.target.value })}
              options={[{ value: 'Bekliyor', label: 'Bekliyor' }, { value: 'Devam Ediyor', label: 'Devam Ediyor' }, { value: 'Tamamlandı', label: 'Tamamlandı' }]} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Select label="Müşteri" value={taskForm.customer_id} onChange={(e) => setTaskForm({ ...taskForm, customer_id: e.target.value })}
              options={[{ value: '', label: 'Seçiniz' }, ...customers.map(c => ({ value: c.id, label: c.name }))]} />
            <Select label="Sorumlu" value={taskForm.sales_person_id} onChange={(e) => setTaskForm({ ...taskForm, sales_person_id: e.target.value })}
              options={[{ value: '', label: 'Seçiniz' }, ...salesTeam.map(s => ({ value: s.id, label: s.name }))]} />
          </div>
          <Input label="Bitiş Tarihi" type="date" value={taskForm.due_date} onChange={(e) => setTaskForm({ ...taskForm, due_date: e.target.value })} />
          <Textarea label="Açıklama" value={taskForm.description} onChange={(e) => setTaskForm({ ...taskForm, description: e.target.value })} />
        </div>
      </Modal>
    </div>
  );
}
