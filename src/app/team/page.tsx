'use client';

import Header from '@/components/Header';
import { Card, CardBody, Button, Badge, Modal, Input, Select, EmptyState } from '@/components/ui';
import { formatDate } from '@/lib/utils';
import { Users, Plus, Edit2, Trash2, Mail, Phone, MapPin, Calendar, RefreshCw, Camera, User } from 'lucide-react';
import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase';

interface TeamMember {
  id: string;
  name: string;
  email: string;
  phone: string;
  title: string;
  region: string;
  avatar: string;
  photo_url: string;
  start_date: string;
  status: string;
}

// Pastel renk paleti - her kişiye farklı renk
const cardColors = [
  'from-slate-500/90 to-slate-600/90',
  'from-indigo-400/90 to-indigo-500/90',
  'from-teal-400/90 to-teal-500/90',
  'from-violet-400/90 to-violet-500/90',
  'from-emerald-400/90 to-emerald-500/90',
  'from-sky-400/90 to-sky-500/90',
  'from-amber-400/90 to-amber-500/90',
  'from-rose-400/90 to-rose-500/90',
];

export default function TeamPage() {
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingPerson, setEditingPerson] = useState<TeamMember | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    title: '',
    region: '',
    avatar: '',
    photo_url: '',
    start_date: new Date().toISOString().split('T')[0],
    status: 'active',
  });

  const supabase = createClient();

  const fetchTeam = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const { data, error } = await supabase
        .from('sales_team')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      setTeam(data || []);
    } catch (err: any) {
      console.error('Veri çekme hatası:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTeam();
  }, []);

  const openModal = (person?: TeamMember) => {
    if (person) {
      setEditingPerson(person);
      setFormData({
        name: person.name,
        email: person.email,
        phone: person.phone || '',
        title: person.title || '',
        region: person.region || '',
        avatar: person.avatar || '',
        photo_url: person.photo_url || '',
        start_date: person.start_date || new Date().toISOString().split('T')[0],
        status: person.status || 'active',
      });
    } else {
      setEditingPerson(null);
      setFormData({
        name: '',
        email: '',
        phone: '',
        title: '',
        region: '',
        avatar: '',
        photo_url: '',
        start_date: new Date().toISOString().split('T')[0],
        status: 'active',
      });
    }
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!formData.name || !formData.email) {
      alert('Ad ve E-posta zorunludur');
      return;
    }

    setSaving(true);
    try {
      if (editingPerson) {
        const { error } = await supabase
          .from('sales_team')
          .update(formData)
          .eq('id', editingPerson.id);
        
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('sales_team')
          .insert([formData]);
        
        if (error) throw error;
      }
      
      setModalOpen(false);
      fetchTeam();
    } catch (err: any) {
      console.error('Kaydetme hatası:', err);
      alert('Hata: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Bu kişiyi silmek istediğinize emin misiniz?')) return;
    
    try {
      const { error } = await supabase
        .from('sales_team')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
      fetchTeam();
    } catch (err: any) {
      console.error('Silme hatası:', err);
      alert('Hata: ' + err.message);
    }
  };

  // İsimden baş harfleri al
  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  // Kişiye renk ata (index'e göre)
  const getCardColor = (index: number) => {
    return cardColors[index % cardColors.length];
  };

  if (loading) {
    return (
      <div>
        <Header title="Satış Ekibi" />
        <div className="flex h-96 items-center justify-center">
          <div className="text-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-indigo-600 mx-auto" />
            <p className="mt-2 text-sm text-slate-500">Yükleniyor...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <Header title="Satış Ekibi" />
      
      <div className="p-6">
        {/* Header Actions */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <p className="text-sm text-slate-500">Toplam {team.length} satış uzmanı</p>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={fetchTeam}>
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button onClick={() => openModal()}>
              <Plus className="h-4 w-4" />
              Yeni Ekle
            </Button>
          </div>
        </div>

        {error && (
          <Card className="mb-6 border-red-200 bg-red-50">
            <CardBody>
              <p className="text-red-600">{error}</p>
            </CardBody>
          </Card>
        )}

        {/* Team Grid */}
        {team.length > 0 ? (
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {team.map((person, index) => (
              <Card key={person.id} className="overflow-hidden hover:shadow-lg transition-shadow duration-300">
                {/* Header - Pastel Gradient */}
                <div className={`bg-gradient-to-br ${getCardColor(index)} px-4 py-5`}>
                  <div className="flex items-center gap-4">
                    {/* Fotoğraf veya Baş Harfler */}
                    <div className="relative">
                      {person.photo_url ? (
                        <img 
                          src={person.photo_url} 
                          alt={person.name}
                          className="w-16 h-16 rounded-full object-cover border-3 border-white/30 shadow-lg"
                        />
                      ) : (
                        <div className="w-16 h-16 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center border-2 border-white/30 shadow-lg">
                          <span className="text-xl font-bold text-white">{getInitials(person.name)}</span>
                        </div>
                      )}
                      {/* Durum Göstergesi */}
                      <div className={`absolute -bottom-1 -right-1 w-5 h-5 rounded-full border-2 border-white ${person.status === 'active' ? 'bg-emerald-400' : 'bg-slate-400'}`} />
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-white text-lg truncate">{person.name}</h3>
                      <p className="text-sm text-white/80 truncate">{person.title || 'Satış Uzmanı'}</p>
                      {person.region && (
                        <p className="text-xs text-white/60 flex items-center gap-1 mt-1">
                          <MapPin className="h-3 w-3" />
                          {person.region}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
                
                {/* Body */}
                <CardBody className="space-y-3 bg-gradient-to-b from-slate-50/50 to-white">
                  <div className="flex items-center gap-2 text-sm text-slate-600">
                    <Mail className="h-4 w-4 text-slate-400" />
                    <span className="truncate">{person.email}</span>
                  </div>
                  {person.phone && (
                    <div className="flex items-center gap-2 text-sm text-slate-600">
                      <Phone className="h-4 w-4 text-slate-400" />
                      {person.phone}
                    </div>
                  )}
                  {person.start_date && (
                    <div className="flex items-center gap-2 text-sm text-slate-500">
                      <Calendar className="h-4 w-4 text-slate-400" />
                      <span className="text-xs">Başlangıç: {formatDate(person.start_date)}</span>
                    </div>
                  )}
                  
                  <div className="flex gap-2 border-t border-slate-100 pt-3 mt-3">
                    <Button variant="secondary" size="sm" className="flex-1" onClick={() => openModal(person)}>
                      <Edit2 className="h-3 w-3" />
                      Düzenle
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleDelete(person.id)} className="text-rose-500 hover:bg-rose-50">
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </CardBody>
              </Card>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={<Users className="h-16 w-16" />}
            title="Henüz ekip üyesi yok"
            description="Satış ekibinize yeni üyeler ekleyin"
            action={
              <Button onClick={() => openModal()}>
                <Plus className="h-4 w-4" />
                İlk Üyeyi Ekle
              </Button>
            }
          />
        )}
      </div>

      {/* Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingPerson ? 'Kişi Düzenle' : 'Yeni Kişi Ekle'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>İptal</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Kaydediliyor...' : (editingPerson ? 'Güncelle' : 'Ekle')}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {/* Fotoğraf Önizleme ve URL */}
          <div>
            <label className="text-xs font-medium text-slate-600 mb-2 block">Profil Fotoğrafı</label>
            <div className="flex items-center gap-4">
              {/* Önizleme */}
              <div className="relative">
                {formData.photo_url ? (
                  <img 
                    src={formData.photo_url} 
                    alt="Önizleme"
                    className="w-20 h-20 rounded-full object-cover border-2 border-slate-200"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                ) : (
                  <div className="w-20 h-20 rounded-full bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center border-2 border-slate-200">
                    {formData.name ? (
                      <span className="text-2xl font-bold text-slate-400">{getInitials(formData.name)}</span>
                    ) : (
                      <User className="h-8 w-8 text-slate-400" />
                    )}
                  </div>
                )}
                <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-indigo-500 flex items-center justify-center shadow-md">
                  <Camera className="h-4 w-4 text-white" />
                </div>
              </div>
              
              {/* URL Input */}
              <div className="flex-1">
                <Input
                  placeholder="https://example.com/photo.jpg"
                  value={formData.photo_url}
                  onChange={(e) => setFormData({ ...formData, photo_url: e.target.value })}
                />
                <p className="text-xs text-slate-400 mt-1">Fotoğraf URL'si girin veya boş bırakın</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Ad Soyad *"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Ahmet Yılmaz"
            />
            <Input
              label="E-posta *"
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              placeholder="ahmet@firma.com"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Telefon"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              placeholder="0532 111 2233"
            />
            <Input
              label="Unvan"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="Satış Uzmanı"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Bölge"
              value={formData.region}
              onChange={(e) => setFormData({ ...formData, region: e.target.value })}
              options={[
                { value: '', label: 'Seçiniz' },
                { value: 'İstanbul Anadolu', label: 'İstanbul Anadolu' },
                { value: 'İstanbul Avrupa', label: 'İstanbul Avrupa' },
                { value: 'Ankara', label: 'Ankara' },
                { value: 'İzmir', label: 'İzmir' },
                { value: 'Bursa', label: 'Bursa' },
                { value: 'Antalya', label: 'Antalya' },
                { value: 'Adana', label: 'Adana' },
                { value: 'Konya', label: 'Konya' },
              ]}
            />
            <Input
              label="Başlangıç Tarihi"
              type="date"
              value={formData.start_date}
              onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
            />
          </div>

          <Select
            label="Durum"
            value={formData.status}
            onChange={(e) => setFormData({ ...formData, status: e.target.value })}
            options={[
              { value: 'active', label: 'Aktif' },
              { value: 'inactive', label: 'Pasif' },
            ]}
          />
        </div>
      </Modal>
    </div>
  );
}
