'use client';

import { Card } from '@/components/ui';
import { useAuth } from '@/lib/auth-context';
import { formatMoney } from '@/lib/utils';
import { 
  Target, Award, TrendingUp, DollarSign, 
  AlertTriangle, CheckCircle, Clock, Calendar,
  Building2, Phone, FileText, ArrowUpRight
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase';
import Link from 'next/link';

interface UserStats {
  salesTarget: number;
  actualSales: number;
  salesRatio: number;
  collectionTarget: number;
  actualCollection: number;
  collectionRatio: number;
  earnedCommission: number;
  pendingTasks: number;
  myCustomers: number;
  myOpportunities: number;
  hardStop: boolean;
}

export default function UserDashboard() {
  const { profile, user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<UserStats | null>(null);
  const [recentActivities, setRecentActivities] = useState<any[]>([]);
  const [myTasks, setMyTasks] = useState<any[]>([]);
  
  const supabase = createClient();

  useEffect(() => {
    if (user?.id) {
      fetchUserData();
    }
  }, [user?.id]);

  const fetchUserData = async () => {
    setLoading(true);
    try {
      // Kullanıcının sales_team kaydını bul
      const { data: salesTeamData } = await supabase
        .from('sales_team')
        .select('id')
        .eq('user_id', user?.id)
        .single();

      const repId = salesTeamData?.id;

      if (repId) {
        // Bu ayın prim sonuçları
        const currentMonth = new Date().getMonth() + 1;
        const currentYear = new Date().getFullYear();
        
        const { data: commissionData } = await supabase
          .from('commission_results')
          .select('*')
          .eq('rep_id', repId)
          .eq('period_month', currentMonth)
          .eq('period_year', currentYear)
          .single();

        // Müşterilerim
        const { count: customerCount } = await supabase
          .from('customers')
          .select('*', { count: 'exact', head: true })
          .eq('assigned_to', repId);

        // Fırsatlarım
        const { count: oppCount } = await supabase
          .from('opportunities')
          .select('*', { count: 'exact', head: true })
          .eq('assigned_to', repId)
          .neq('stage', 'Kaybedildi');

        // Bekleyen görevlerim
        const { data: tasksData, count: taskCount } = await supabase
          .from('crm_tasks')
          .select('*', { count: 'exact' })
          .eq('assigned_to', repId)
          .eq('status', 'pending')
          .order('due_date', { ascending: true })
          .limit(5);

        // Son aktivitelerim
        const { data: activitiesData } = await supabase
          .from('crm_activities')
          .select('*, customer:customer_id(name)')
          .eq('user_id', repId)
          .order('activity_date', { ascending: false })
          .limit(5);

        setStats({
          salesTarget: commissionData?.sales_target || 0,
          actualSales: commissionData?.actual_sales || 0,
          salesRatio: commissionData?.sales_attainment_ratio || 0,
          collectionTarget: commissionData?.invoiced_amount || 0,
          actualCollection: commissionData?.collected_amount || 0,
          collectionRatio: commissionData?.collection_ratio || 0,
          earnedCommission: commissionData?.earned_commission || 0,
          pendingTasks: taskCount || 0,
          myCustomers: customerCount || 0,
          myOpportunities: oppCount || 0,
          hardStop: commissionData?.hard_stop || false,
        });

        setMyTasks(tasksData || []);
        setRecentActivities(activitiesData || []);
      }
    } catch (err) {
      console.error('User data fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Hoşgeldin Mesajı */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-700 rounded-xl p-6 text-white">
        <h2 className="text-2xl font-bold">Hoş Geldin, {profile?.name}! 👋</h2>
        <p className="text-blue-100 mt-1">İşte bu ayki performans özetin</p>
      </div>

      {/* HARD STOP Uyarısı */}
      {stats?.hardStop && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-4">
          <div className="h-12 w-12 rounded-full bg-red-100 flex items-center justify-center">
            <AlertTriangle className="h-6 w-6 text-red-600" />
          </div>
          <div>
            <h3 className="font-bold text-red-800">⚠️ HARD STOP Uygulandı!</h3>
            <p className="text-red-600 text-sm">
              Tahsilat oranınız %70'in altında. Bu ay prim alamıyorsunuz. 
              Tahsilatlarınızı artırarak bu durumu düzeltebilirsiniz.
            </p>
          </div>
        </div>
      )}

      {/* Ana Metrikler */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-500">Satış Hedefim</p>
              <p className="text-2xl font-bold text-slate-900">₺{formatMoney(stats?.actualSales || 0)}</p>
              <p className="text-xs text-slate-400">/ ₺{formatMoney(stats?.salesTarget || 0)}</p>
            </div>
            <div className={`h-12 w-12 rounded-full flex items-center justify-center ${
              (stats?.salesRatio || 0) >= 1 ? 'bg-green-100' : 'bg-amber-100'
            }`}>
              <Target className={`h-6 w-6 ${
                (stats?.salesRatio || 0) >= 1 ? 'text-green-600' : 'text-amber-600'
              }`} />
            </div>
          </div>
          <div className="mt-3">
            <div className="h-2 rounded-full bg-slate-100">
              <div 
                className={`h-2 rounded-full ${(stats?.salesRatio || 0) >= 1 ? 'bg-green-500' : 'bg-amber-500'}`}
                style={{ width: `${Math.min((stats?.salesRatio || 0) * 100, 100)}%` }}
              />
            </div>
            <p className="text-xs text-slate-500 mt-1">%{((stats?.salesRatio || 0) * 100).toFixed(0)} başarı</p>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-500">Tahsilatım</p>
              <p className="text-2xl font-bold text-slate-900">₺{formatMoney(stats?.actualCollection || 0)}</p>
              <p className="text-xs text-slate-400">/ ₺{formatMoney(stats?.collectionTarget || 0)}</p>
            </div>
            <div className={`h-12 w-12 rounded-full flex items-center justify-center ${
              (stats?.collectionRatio || 0) >= 0.7 ? 'bg-green-100' : 'bg-red-100'
            }`}>
              <DollarSign className={`h-6 w-6 ${
                (stats?.collectionRatio || 0) >= 0.7 ? 'text-green-600' : 'text-red-600'
              }`} />
            </div>
          </div>
          <div className="mt-3">
            <div className="h-2 rounded-full bg-slate-100">
              <div 
                className={`h-2 rounded-full ${(stats?.collectionRatio || 0) >= 0.7 ? 'bg-green-500' : 'bg-red-500'}`}
                style={{ width: `${Math.min((stats?.collectionRatio || 0) * 100, 100)}%` }}
              />
            </div>
            <p className="text-xs text-slate-500 mt-1">%{((stats?.collectionRatio || 0) * 100).toFixed(0)} tahsilat</p>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-500">Kazanılan Prim</p>
              <p className={`text-2xl font-bold ${stats?.hardStop ? 'text-red-600' : 'text-green-600'}`}>
                ₺{formatMoney(stats?.earnedCommission || 0)}
              </p>
              {stats?.hardStop && <p className="text-xs text-red-500">HARD STOP</p>}
            </div>
            <div className={`h-12 w-12 rounded-full flex items-center justify-center ${
              stats?.hardStop ? 'bg-red-100' : 'bg-green-100'
            }`}>
              <Award className={`h-6 w-6 ${stats?.hardStop ? 'text-red-600' : 'text-green-600'}`} />
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-500">Bekleyen Görevler</p>
              <p className="text-2xl font-bold text-slate-900">{stats?.pendingTasks || 0}</p>
            </div>
            <div className="h-12 w-12 rounded-full bg-blue-100 flex items-center justify-center">
              <Clock className="h-6 w-6 text-blue-600" />
            </div>
          </div>
        </Card>
      </div>

      {/* İkinci Satır */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card className="p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-slate-900">Müşterilerim</h3>
            <Link href="/customers" className="text-blue-600 text-sm hover:underline flex items-center gap-1">
              Tümünü Gör <ArrowUpRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="flex items-center gap-4">
            <div className="h-16 w-16 rounded-full bg-indigo-100 flex items-center justify-center">
              <Building2 className="h-8 w-8 text-indigo-600" />
            </div>
            <div>
              <p className="text-3xl font-bold text-slate-900">{stats?.myCustomers || 0}</p>
              <p className="text-sm text-slate-500">Aktif Müşteri</p>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-slate-900">Fırsatlarım</h3>
            <Link href="/opportunities" className="text-blue-600 text-sm hover:underline flex items-center gap-1">
              Tümünü Gör <ArrowUpRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="flex items-center gap-4">
            <div className="h-16 w-16 rounded-full bg-amber-100 flex items-center justify-center">
              <Target className="h-8 w-8 text-amber-600" />
            </div>
            <div>
              <p className="text-3xl font-bold text-slate-900">{stats?.myOpportunities || 0}</p>
              <p className="text-sm text-slate-500">Açık Fırsat</p>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-slate-900">Bu Ayki Performansım</h3>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Satış Başarısı</span>
              <span className={`font-medium ${(stats?.salesRatio || 0) >= 1 ? 'text-green-600' : 'text-amber-600'}`}>
                %{((stats?.salesRatio || 0) * 100).toFixed(0)}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Tahsilat Oranı</span>
              <span className={`font-medium ${(stats?.collectionRatio || 0) >= 0.7 ? 'text-green-600' : 'text-red-600'}`}>
                %{((stats?.collectionRatio || 0) * 100).toFixed(0)}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Durum</span>
              <span className={`font-medium ${stats?.hardStop ? 'text-red-600' : 'text-green-600'}`}>
                {stats?.hardStop ? '🔴 HARD STOP' : '🟢 Aktif'}
              </span>
            </div>
          </div>
        </Card>
      </div>

      {/* Görevler ve Aktiviteler */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Bekleyen Görevler */}
        <Card className="p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-slate-900">📋 Bekleyen Görevlerim</h3>
            <Link href="/crm" className="text-blue-600 text-sm hover:underline">Tümü</Link>
          </div>
          {myTasks.length > 0 ? (
            <div className="space-y-3">
              {myTasks.map((task) => (
                <div key={task.id} className="flex items-center gap-3 p-3 rounded-lg bg-slate-50">
                  <Clock className="h-5 w-5 text-amber-500" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-slate-900">{task.title}</p>
                    <p className="text-xs text-slate-500">
                      {task.due_date ? new Date(task.due_date).toLocaleDateString('tr-TR') : '-'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-500 text-center py-8">Bekleyen görev yok 🎉</p>
          )}
        </Card>

        {/* Son Aktiviteler */}
        <Card className="p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-slate-900">📞 Son Aktivitelerim</h3>
            <Link href="/crm" className="text-blue-600 text-sm hover:underline">Tümü</Link>
          </div>
          {recentActivities.length > 0 ? (
            <div className="space-y-3">
              {recentActivities.map((activity) => (
                <div key={activity.id} className="flex items-center gap-3 p-3 rounded-lg bg-slate-50">
                  <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center">
                    {activity.type === 'Telefon' ? <Phone className="h-4 w-4 text-blue-600" /> :
                     activity.type === 'Toplantı' ? <Calendar className="h-4 w-4 text-green-600" /> :
                     <FileText className="h-4 w-4 text-purple-600" />}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-slate-900">{activity.customer?.name || '-'}</p>
                    <p className="text-xs text-slate-500">{activity.type} - {activity.subject}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-500 text-center py-8">Henüz aktivite yok</p>
          )}
        </Card>
      </div>
    </div>
  );
}
