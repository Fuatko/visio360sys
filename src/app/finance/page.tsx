'use client';

import Header from '@/components/Header';
import { Card, Badge, Button } from '@/components/ui';
import { formatMoney } from '@/lib/utils';
import {
  Wallet, Clock, AlertTriangle, CheckCircle, Download, Filter,
  TrendingUp, TrendingDown, Calendar, Users, Building2, FileText,
  DollarSign, CreditCard, ArrowUpRight, ArrowDownRight, Eye
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase';
import {
  BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, 
  Tooltip, Legend, ResponsiveContainer
} from 'recharts';

// ============ TYPES ============
interface AgingBucket {
  label: string;
  range: string;
  amount: number;
  count: number;
  color: string;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
}

interface PrimPayment {
  id: string;
  sales_person_name: string;
  period: string;
  gross_amount: number;
  net_amount: number;
  collection_rate: number;
  hard_stop: boolean;
  status: 'pending' | 'approved' | 'paid';
}

interface CollectionItem {
  id: string;
  customer_name: string;
  invoice_no: string;
  amount: number;
  due_date: string;
  days_overdue: number;
  sales_person: string;
  status: string;
}

// ============ MAIN COMPONENT ============
export default function FinanceDashboard() {
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'aging' | 'collections' | 'prims'>('aging');
  const [agingData, setAgingData] = useState<AgingBucket[]>([]);
  const [collections, setCollections] = useState<CollectionItem[]>([]);
  const [primPayments, setPrimPayments] = useState<PrimPayment[]>([]);
  const [totals, setTotals] = useState({
    totalReceivable: 0,
    collected: 0,
    overdue: 0,
    primTotal: 0,
    primPending: 0
  });
  const [filterStatus, setFilterStatus] = useState('all');
  
  const supabase = createClient();

  useEffect(() => {
    fetchAllData();
  }, []);

  const fetchAllData = async () => {
    setLoading(true);
    try {
      const [collectionsRes, commissionsRes, teamRes, customersRes] = await Promise.all([
        supabase.from('collections').select('*, customer:customer_id(name), sales_team:sales_person_id(name)'),
        supabase.from('commission_results').select('*, sales_team:sales_person_id(name)'),
        supabase.from('sales_team').select('*'),
        supabase.from('customers').select('*')
      ]);

      const collectionsData = collectionsRes.data || [];
      const commissionsData = commissionsRes.data || [];
      const teamData = teamRes.data || [];
      const customersData = customersRes.data || [];

      // Calculate Aging Buckets
      const now = new Date();
      const buckets: Record<string, { amount: number; count: number }> = {
        current: { amount: 0, count: 0 },
        days30: { amount: 0, count: 0 },
        days60: { amount: 0, count: 0 },
        days90: { amount: 0, count: 0 },
        days120: { amount: 0, count: 0 }
      };

      const collectionItems: CollectionItem[] = [];
      let totalReceivable = 0;
      let collected = 0;
      let overdue = 0;

      collectionsData.forEach(c => {
        const amount = c.amount || 0;
        totalReceivable += amount;

        if (c.status === 'Ödendi') {
          collected += amount;
          return;
        }

        const dueDate = new Date(c.due_date);
        const daysDiff = Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));

        if (daysDiff > 0) overdue += amount;

        // Categorize into buckets
        if (daysDiff <= 0) {
          buckets.current.amount += amount;
          buckets.current.count++;
        } else if (daysDiff <= 30) {
          buckets.days30.amount += amount;
          buckets.days30.count++;
        } else if (daysDiff <= 60) {
          buckets.days60.amount += amount;
          buckets.days60.count++;
        } else if (daysDiff <= 90) {
          buckets.days90.amount += amount;
          buckets.days90.count++;
        } else {
          buckets.days120.amount += amount;
          buckets.days120.count++;
        }

        // Add to collection items
        collectionItems.push({
          id: c.id,
          customer_name: c.customer?.name || '-',
          invoice_no: c.invoice_no || '-',
          amount: amount,
          due_date: c.due_date,
          days_overdue: Math.max(0, daysDiff),
          sales_person: c.sales_team?.name || '-',
          status: c.status
        });
      });

      setAgingData([
        { label: 'Vadesi Gelmemiş', range: 'Güncel', amount: buckets.current.amount, count: buckets.current.count, color: '#10b981', riskLevel: 'low' },
        { label: '1-30 Gün', range: 'Gecikmiş', amount: buckets.days30.amount, count: buckets.days30.count, color: '#f59e0b', riskLevel: 'medium' },
        { label: '31-60 Gün', range: 'Gecikmiş', amount: buckets.days60.amount, count: buckets.days60.count, color: '#f97316', riskLevel: 'medium' },
        { label: '61-90 Gün', range: 'Riskli', amount: buckets.days90.amount, count: buckets.days90.count, color: '#ef4444', riskLevel: 'high' },
        { label: '90+ Gün', range: 'Kritik', amount: buckets.days120.amount, count: buckets.days120.count, color: '#dc2626', riskLevel: 'critical' }
      ]);

      setCollections(collectionItems.sort((a, b) => b.days_overdue - a.days_overdue));

      // Process Commission/Prim Data
      const primItems: PrimPayment[] = commissionsData.map(c => ({
        id: c.id,
        sales_person_name: c.sales_team?.name || '-',
        period: c.period || '-',
        gross_amount: c.calculated_commission || 0,
        net_amount: c.final_commission || 0,
        collection_rate: c.collection_rate || 0,
        hard_stop: c.hard_stop || false,
        status: c.status || 'pending'
      }));

      setPrimPayments(primItems);

      const primTotal = primItems.reduce((sum, p) => sum + p.net_amount, 0);
      const primPending = primItems.filter(p => p.status === 'pending').reduce((sum, p) => sum + p.net_amount, 0);

      setTotals({
        totalReceivable,
        collected,
        overdue,
        primTotal,
        primPending
      });

    } catch (error) {
      console.error('Data fetch error:', error);
    } finally {
      setLoading(false);
    }
  };

  const exportToExcel = () => {
    alert('Excel export özelliği yakında eklenecek');
  };

  const getRiskBadge = (level: string) => {
    const badges: Record<string, { color: string; text: string }> = {
      low: { color: 'success', text: 'Düşük Risk' },
      medium: { color: 'warning', text: 'Orta Risk' },
      high: { color: 'danger', text: 'Yüksek Risk' },
      critical: { color: 'danger', text: 'Kritik!' }
    };
    return badges[level] || badges.low;
  };

  if (loading) {
    return (
      <div>
        <Header title="Finans Paneli" subtitle="Tahsilat, Aging & Prim Yönetimi" />
        <div className="flex h-96 items-center justify-center">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
        </div>
      </div>
    );
  }

  const collectionRate = totals.totalReceivable > 0 
    ? ((totals.collected / totals.totalReceivable) * 100).toFixed(1) 
    : '0';

  return (
    <div>
      <Header title="Finans Paneli" subtitle="Tahsilat, Aging & Prim Yönetimi" />
      
      <div className="p-6 space-y-6">
        {/* Summary Cards */}
        <div className="grid gap-4 md:grid-cols-5">
          <Card className="p-4 bg-gradient-to-br from-blue-500 to-blue-600 text-white">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-blue-100 text-xs">Toplam Alacak</p>
                <p className="text-xl font-bold">₺{formatMoney(totals.totalReceivable)}</p>
              </div>
              <DollarSign className="h-8 w-8 text-blue-200" />
            </div>
          </Card>

          <Card className="p-4 bg-gradient-to-br from-green-500 to-green-600 text-white">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-green-100 text-xs">Tahsil Edilen</p>
                <p className="text-xl font-bold">₺{formatMoney(totals.collected)}</p>
              </div>
              <CheckCircle className="h-8 w-8 text-green-200" />
            </div>
          </Card>

          <Card className="p-4 bg-gradient-to-br from-red-500 to-red-600 text-white">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-red-100 text-xs">Vadesi Geçmiş</p>
                <p className="text-xl font-bold">₺{formatMoney(totals.overdue)}</p>
              </div>
              <AlertTriangle className="h-8 w-8 text-red-200" />
            </div>
          </Card>

          <Card className="p-4 bg-gradient-to-br from-purple-500 to-purple-600 text-white">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-purple-100 text-xs">Tahsilat Oranı</p>
                <p className="text-xl font-bold">%{collectionRate}</p>
              </div>
              <TrendingUp className="h-8 w-8 text-purple-200" />
            </div>
          </Card>

          <Card className="p-4 bg-gradient-to-br from-amber-500 to-amber-600 text-white">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-amber-100 text-xs">Bekleyen Prim</p>
                <p className="text-xl font-bold">₺{formatMoney(totals.primPending)}</p>
              </div>
              <Wallet className="h-8 w-8 text-amber-200" />
            </div>
          </Card>
        </div>

        {/* Tab Navigation */}
        <div className="flex gap-2 border-b border-slate-200">
          {[
            { key: 'aging', label: 'Alacak Yaşlandırma', icon: Clock },
            { key: 'collections', label: 'Tahsilat Listesi', icon: FileText },
            { key: 'prims', label: 'Prim Ödemeleri', icon: Wallet }
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as any)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.key
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {activeTab === 'aging' && (
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Aging Chart */}
            <Card className="p-6">
              <h3 className="font-semibold text-slate-900 mb-4">Yaşlandırma Grafiği</h3>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={agingData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis type="number" tickFormatter={(v) => `₺${(v / 1000).toFixed(0)}K`} />
                    <YAxis type="category" dataKey="label" width={100} />
                    <Tooltip formatter={(value: number) => `₺${formatMoney(value)}`} />
                    <Bar dataKey="amount" radius={[0, 4, 4, 0]}>
                      {agingData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>

            {/* Aging Details */}
            <Card className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-slate-900">Detaylı Yaşlandırma</h3>
                <Button variant="secondary" size="sm" onClick={exportToExcel}>
                  <Download className="h-4 w-4 mr-1" /> Excel
                </Button>
              </div>
              <div className="space-y-3">
                {agingData.map((bucket, index) => (
                  <div key={index} className="flex items-center justify-between p-3 rounded-lg bg-slate-50 hover:bg-slate-100">
                    <div className="flex items-center gap-3">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: bucket.color }} />
                      <div>
                        <p className="font-medium text-slate-900">{bucket.label}</p>
                        <p className="text-xs text-slate-500">{bucket.count} adet fatura</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-slate-900">₺{formatMoney(bucket.amount)}</p>
                      <Badge variant={getRiskBadge(bucket.riskLevel).color as any}>
                        {getRiskBadge(bucket.riskLevel).text}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        )}

        {activeTab === 'collections' && (
          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-slate-900">Tahsilat Listesi</h3>
              <div className="flex gap-2">
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="h-9 px-3 rounded-lg border border-slate-200 text-sm"
                >
                  <option value="all">Tüm Durumlar</option>
                  <option value="overdue">Vadesi Geçmiş</option>
                  <option value="pending">Bekleyen</option>
                </select>
                <Button variant="secondary" size="sm" onClick={exportToExcel}>
                  <Download className="h-4 w-4 mr-1" /> Excel
                </Button>
              </div>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-slate-50">
                    <th className="px-4 py-3 text-left font-medium">Müşteri</th>
                    <th className="px-4 py-3 text-left font-medium">Fatura No</th>
                    <th className="px-4 py-3 text-right font-medium">Tutar</th>
                    <th className="px-4 py-3 text-left font-medium">Vade</th>
                    <th className="px-4 py-3 text-center font-medium">Gecikme</th>
                    <th className="px-4 py-3 text-left font-medium">Sorumlu</th>
                    <th className="px-4 py-3 text-center font-medium">Durum</th>
                  </tr>
                </thead>
                <tbody>
                  {collections
                    .filter(c => {
                      if (filterStatus === 'overdue') return c.days_overdue > 0;
                      if (filterStatus === 'pending') return c.status === 'Bekliyor';
                      return true;
                    })
                    .slice(0, 20)
                    .map(c => (
                      <tr key={c.id} className="border-b hover:bg-slate-50">
                        <td className="px-4 py-3 font-medium">{c.customer_name}</td>
                        <td className="px-4 py-3 text-slate-500">{c.invoice_no}</td>
                        <td className="px-4 py-3 text-right font-bold text-blue-600">₺{formatMoney(c.amount)}</td>
                        <td className="px-4 py-3">{new Date(c.due_date).toLocaleDateString('tr-TR')}</td>
                        <td className="px-4 py-3 text-center">
                          {c.days_overdue > 0 ? (
                            <span className={`px-2 py-1 rounded text-xs font-medium ${
                              c.days_overdue > 90 ? 'bg-red-100 text-red-700' :
                              c.days_overdue > 30 ? 'bg-orange-100 text-orange-700' :
                              'bg-amber-100 text-amber-700'
                            }`}>
                              {c.days_overdue} gün
                            </span>
                          ) : (
                            <span className="text-green-600">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-500">{c.sales_person}</td>
                        <td className="px-4 py-3 text-center">
                          <Badge variant={
                            c.status === 'Ödendi' ? 'success' :
                            c.status === 'Gecikmiş' ? 'danger' : 'warning'
                          }>
                            {c.status}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {activeTab === 'prims' && (
          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-slate-900">Prim Ödeme Listesi</h3>
              <Button variant="secondary" size="sm" onClick={exportToExcel}>
                <Download className="h-4 w-4 mr-1" /> Excel
              </Button>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-slate-50">
                    <th className="px-4 py-3 text-left font-medium">Satış Temsilcisi</th>
                    <th className="px-4 py-3 text-left font-medium">Dönem</th>
                    <th className="px-4 py-3 text-right font-medium">Brüt Prim</th>
                    <th className="px-4 py-3 text-right font-medium">Net Prim</th>
                    <th className="px-4 py-3 text-center font-medium">Tahsilat %</th>
                    <th className="px-4 py-3 text-center font-medium">HARD STOP</th>
                    <th className="px-4 py-3 text-center font-medium">Durum</th>
                  </tr>
                </thead>
                <tbody>
                  {primPayments.map(p => (
                    <tr key={p.id} className={`border-b hover:bg-slate-50 ${p.hard_stop ? 'bg-red-50' : ''}`}>
                      <td className="px-4 py-3 font-medium">{p.sales_person_name}</td>
                      <td className="px-4 py-3 text-slate-500">{p.period}</td>
                      <td className="px-4 py-3 text-right">₺{formatMoney(p.gross_amount)}</td>
                      <td className="px-4 py-3 text-right font-bold text-green-600">
                        ₺{formatMoney(p.net_amount)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${
                          p.collection_rate >= 70 ? 'bg-green-100 text-green-700' :
                          p.collection_rate >= 50 ? 'bg-amber-100 text-amber-700' :
                          'bg-red-100 text-red-700'
                        }`}>
                          %{p.collection_rate.toFixed(0)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {p.hard_stop ? (
                          <Badge variant="danger">HARD STOP</Badge>
                        ) : (
                          <CheckCircle className="h-5 w-5 text-green-500 mx-auto" />
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Badge variant={
                          p.status === 'paid' ? 'success' :
                          p.status === 'approved' ? 'info' : 'warning'
                        }>
                          {p.status === 'paid' ? 'Ödendi' : p.status === 'approved' ? 'Onaylı' : 'Beklemede'}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
