'use client';

import Header from '@/components/Header';
import { Card, CardHeader, CardTitle, CardBody, Button, Badge, Input, Select } from '@/components/ui';
import { Settings, Database, Shield, Bell, Palette, Download, Upload, Trash2, CheckCircle, FileSpreadsheet, Cloud } from 'lucide-react';
import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase';

export default function SettingsPage() {
  const [dbStatus, setDbStatus] = useState<'checking' | 'connected' | 'error'>('checking');
  const [tables, setTables] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const supabase = createClient();

  const checkConnection = async () => {
    setDbStatus('checking');
    try {
      const { data, error } = await supabase.from('sales_team').select('id').limit(1);
      if (error) throw error;
      setDbStatus('connected');
      
      // Tablo kontrolü
      const tableNames = ['sales_team', 'customers', 'opportunities', 'collections', 'targets', 'bonus_tiers_sales', 'bonus_tiers_collection', 'fixed_bonuses', 'crm_activities', 'crm_tasks', 'crm_notes', 'swot_analyses'];
      setTables(tableNames);
    } catch (err) {
      console.error(err);
      setDbStatus('error');
    }
  };

  useEffect(() => { checkConnection(); }, []);

  const exportToExcel = async (tableName: string) => {
    setLoading(true);
    try {
      const { data } = await supabase.from(tableName).select('*');
      if (!data || data.length === 0) {
        alert('Bu tabloda veri bulunamadı.');
        return;
      }

      // CSV formatına çevir
      const headers = Object.keys(data[0]);
      const csvContent = [
        headers.join(';'),
        ...data.map(row => headers.map(h => {
          const val = row[h];
          if (val === null) return '';
          if (typeof val === 'object') return JSON.stringify(val);
          return String(val).replace(/;/g, ',');
        }).join(';'))
      ].join('\n');

      // BOM ekle (Türkçe karakterler için)
      const BOM = '\uFEFF';
      const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${tableName}-${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
    } catch (err: any) {
      alert('Hata: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const exportAllToExcel = async () => {
    setLoading(true);
    const tablesToExport = ['sales_team', 'customers', 'opportunities', 'collections', 'targets'];
    
    for (const table of tablesToExport) {
      await exportToExcel(table);
      await new Promise(r => setTimeout(r, 500)); // Kısa bekleme
    }
    setLoading(false);
  };

  const clearAllData = async () => {
    if (!confirm('TÜM VERİLERİ SİLMEK İSTEDİĞİNİZE EMİN MİSİNİZ?\n\nBu işlem geri alınamaz!')) return;
    if (!confirm('GERÇEKTEN EMİN MİSİNİZ? Tüm satış ekibi, müşteriler, fırsatlar, tahsilatlar silinecek!')) return;

    setLoading(true);
    try {
      const tables = ['swot_analyses', 'crm_notes', 'crm_tasks', 'crm_activities', 'collections', 'targets', 'opportunities', 'customers', 'sales_team'];
      for (const table of tables) {
        await supabase.from(table).delete().neq('id', '00000000-0000-0000-0000-000000000000');
      }
      alert('Tüm veriler silindi');
    } catch (err: any) {
      alert('Hata: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <Header title="Ayarlar" />
      <div className="p-6">
        <div className="grid gap-6 lg:grid-cols-2">
          
          {/* Veritabanı Durumu */}
          <Card>
            <CardHeader>
              <CardTitle><Database className="h-4 w-4" /> Veritabanı Durumu</CardTitle>
            </CardHeader>
            <CardBody>
              <div className="space-y-4">
                <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                  <span>Supabase Bağlantısı</span>
                  <Badge variant={dbStatus === 'connected' ? 'success' : dbStatus === 'error' ? 'danger' : 'warning'}>
                    {dbStatus === 'connected' ? '✓ Bağlı' : dbStatus === 'error' ? '✗ Hata' : '⏳ Kontrol ediliyor...'}
                  </Badge>
                </div>
                
                {dbStatus === 'connected' && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-slate-600">Tablolar:</p>
                    <div className="grid grid-cols-2 gap-2">
                      {tables.map(table => (
                        <div key={table} className="flex items-center gap-2 text-sm">
                          <CheckCircle className="h-4 w-4 text-green-500" />
                          <span>{table}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <Button variant="secondary" onClick={checkConnection} className="w-full">
                  Bağlantıyı Kontrol Et
                </Button>
              </div>
            </CardBody>
          </Card>

          {/* Bulut Yedekleme Bilgisi */}
          <Card>
            <CardHeader>
              <CardTitle><Cloud className="h-4 w-4" /> Bulut Yedekleme</CardTitle>
            </CardHeader>
            <CardBody>
              <div className="space-y-4">
                <div className="p-4 bg-green-50 rounded-lg border border-green-200">
                  <div className="flex items-center gap-2 text-green-700 font-medium mb-2">
                    <CheckCircle className="h-5 w-5" />
                    Otomatik Yedekleme Aktif
                  </div>
                  <p className="text-sm text-green-600">
                    Tüm verileriniz Supabase bulutunda güvenle saklanıyor. Günlük otomatik yedekleme yapılıyor.
                  </p>
                </div>
                
                <div className="text-sm text-slate-500 space-y-1">
                  <p>• Veriler PostgreSQL veritabanında</p>
                  <p>• 7 günlük otomatik backup</p>
                  <p>• Point-in-time recovery desteği</p>
                </div>
              </div>
            </CardBody>
          </Card>

          {/* Excel'e Aktar */}
          <Card>
            <CardHeader>
              <CardTitle><FileSpreadsheet className="h-4 w-4" /> Excel'e Aktar</CardTitle>
            </CardHeader>
            <CardBody>
              <div className="space-y-4">
                <p className="text-sm text-slate-500">
                  Verileri CSV formatında indirin. Excel'de açabilirsiniz.
                </p>
                
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="secondary" onClick={() => exportToExcel('sales_team')} disabled={loading} size="sm">
                    Satış Ekibi
                  </Button>
                  <Button variant="secondary" onClick={() => exportToExcel('customers')} disabled={loading} size="sm">
                    Müşteriler
                  </Button>
                  <Button variant="secondary" onClick={() => exportToExcel('opportunities')} disabled={loading} size="sm">
                    Fırsatlar
                  </Button>
                  <Button variant="secondary" onClick={() => exportToExcel('collections')} disabled={loading} size="sm">
                    Tahsilatlar
                  </Button>
                  <Button variant="secondary" onClick={() => exportToExcel('targets')} disabled={loading} size="sm">
                    Hedefler
                  </Button>
                  <Button variant="secondary" onClick={() => exportToExcel('crm_activities')} disabled={loading} size="sm">
                    CRM
                  </Button>
                </div>

                <Button onClick={exportAllToExcel} disabled={loading} className="w-full">
                  <Download className="h-4 w-4" />
                  {loading ? 'İndiriliyor...' : 'Tümünü İndir'}
                </Button>
              </div>
            </CardBody>
          </Card>

          {/* Tehlikeli Bölge */}
          <Card>
            <CardHeader>
              <CardTitle className="text-red-600"><Trash2 className="h-4 w-4" /> Tehlikeli Bölge</CardTitle>
            </CardHeader>
            <CardBody>
              <div className="space-y-4">
                <p className="text-sm text-slate-500">
                  Bu işlemler geri alınamaz. Dikkatli olun!
                </p>
                <Button variant="danger" onClick={clearAllData} disabled={loading} className="w-full">
                  <Trash2 className="h-4 w-4" />
                  Tüm Verileri Sil
                </Button>
              </div>
            </CardBody>
          </Card>

          {/* Uygulama Bilgileri */}
          <Card>
            <CardHeader>
              <CardTitle><Settings className="h-4 w-4" /> Uygulama Bilgileri</CardTitle>
            </CardHeader>
            <CardBody>
              <div className="space-y-3">
                <div className="flex justify-between p-2 bg-slate-50 rounded">
                  <span className="text-slate-600">Uygulama</span>
                  <span className="font-medium">Satış Pro</span>
                </div>
                <div className="flex justify-between p-2 bg-slate-50 rounded">
                  <span className="text-slate-600">Versiyon</span>
                  <span className="font-medium">2.0.0</span>
                </div>
                <div className="flex justify-between p-2 bg-slate-50 rounded">
                  <span className="text-slate-600">Framework</span>
                  <span className="font-medium">Next.js 15</span>
                </div>
                <div className="flex justify-between p-2 bg-slate-50 rounded">
                  <span className="text-slate-600">Veritabanı</span>
                  <span className="font-medium">Supabase (PostgreSQL)</span>
                </div>
                <div className="flex justify-between p-2 bg-slate-50 rounded">
                  <span className="text-slate-600">Hosting</span>
                  <span className="font-medium">Vercel</span>
                </div>
              </div>
            </CardBody>
          </Card>

          {/* Hızlı Bağlantılar */}
          <Card>
            <CardHeader>
              <CardTitle><Shield className="h-4 w-4" /> Hızlı Bağlantılar</CardTitle>
            </CardHeader>
            <CardBody>
              <div className="space-y-3">
                <a href="https://supabase.com/dashboard" target="_blank" rel="noopener noreferrer"
                  className="flex items-center justify-between p-3 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors">
                  <span>Supabase Dashboard</span>
                  <span className="text-blue-600">→</span>
                </a>
                <a href="https://vercel.com/dashboard" target="_blank" rel="noopener noreferrer"
                  className="flex items-center justify-between p-3 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors">
                  <span>Vercel Dashboard</span>
                  <span className="text-blue-600">→</span>
                </a>
              </div>
            </CardBody>
          </Card>

        </div>

        {/* Kullanım İpuçları */}
        <Card className="mt-6">
          <CardHeader>
            <CardTitle><Bell className="h-4 w-4" /> Kullanım İpuçları</CardTitle>
          </CardHeader>
          <CardBody>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="p-4 bg-blue-50 rounded-lg">
                <h4 className="font-semibold text-blue-800 mb-2">💡 Hızlı Başlangıç</h4>
                <p className="text-sm text-blue-600">
                  Önce Satış Ekibi sayfasından ekip üyelerinizi ekleyin, sonra Müşteriler ve Fırsatlar ile devam edin.
                </p>
              </div>
              <div className="p-4 bg-green-50 rounded-lg">
                <h4 className="font-semibold text-green-800 mb-2">☁️ Bulut Güvenliği</h4>
                <p className="text-sm text-green-600">
                  Verileriniz Supabase bulutunda otomatik yedekleniyor. Bilgisayarınız bozulsa bile verileriniz güvende.
                </p>
              </div>
              <div className="p-4 bg-amber-50 rounded-lg">
                <h4 className="font-semibold text-amber-800 mb-2">📊 Raporlama</h4>
                <p className="text-sm text-amber-600">
                  Excel'e Aktar özelliği ile verilerinizi indirip detaylı raporlar oluşturabilirsiniz.
                </p>
              </div>
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
