'use client';

import Header from '@/components/Header';
import { Card, Badge, Button } from '@/components/ui';
import { formatMoney } from '@/lib/utils';
import {
  Building2, Phone, Mail, MapPin, Calendar, TrendingUp, TrendingDown,
  DollarSign, Wallet, AlertTriangle, CheckCircle, Clock, User,
  FileText, Target, Activity, Star, Shield, ArrowRight, Eye
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase';
import {
  LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer
} from 'recharts';

// ============ TYPES ============
interface Customer {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  segment: string;
  status: string;
  region: string;
  contact_person: string;
  created_at: string;
}

interface CustomerMetrics {
  totalSales: number;
  totalCollected: number;
  pendingAmount: number;
  overdueAmount: number;
  collectionRate: number;
  avgPaymentDays: number;
  opportunityCount: number;
  pipelineValue: number;
  healthScore: number;
}

interface Transaction {
  id: string;
  type: 'sale' | 'collection' | 'opportunity';
  description: string;
  amount: number;
  date: string;
  status: string;
}

// ============ HEALTH SCORE COMPONENT ============
function CustomerHealthScore({ score }: { score: number }) {
  const getColor = (s: number) => {
    if (s >= 80) return { bg: 'bg-green-100', text: 'text-green-700', label: 'Mükemmel' };
    if (s >= 60) return { bg: 'bg-blue-100', text: 'text-blue-700', label: 'İyi' };
    if (s >= 40) return { bg: 'bg-amber-100', text: 'text-amber-700', label: 'Dikkat' };
    if (s >= 20) return { bg: 'bg-orange-100', text: 'text-orange-700', label: 'Riskli' };
    return { bg: 'bg-red-100', text: 'text-red-700', label: 'Kritik' };
  };

  const colors = getColor(score);

  return (
    <div className={`p-4 rounded-xl ${colors.bg} text-center`}>
      <Shield className={`h-8 w-8 mx-auto mb-2 ${colors.text}`} />
      <p className={`text-3xl font-bold ${colors.text}`}>{score}</p>
      <p className={`text-sm ${colors.text}`}>{colors.label}</p>
      <p className="text-xs text-slate-500 mt-1">Müşteri Sağlık Skoru</p>
    </div>
  );
}

// ============ MAIN COMPONENT ============
export default function Customer360Page() {
  const [loading, setLoading] = useState(true);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [metrics, setMetrics] = useState<CustomerMetrics | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [trendData, setTrendData] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  
  const supabase = createClient();

  useEffect(() => {
    fetchCustomers();
  }, []);

  const fetchCustomers = async () => {
    const { data } = await supabase
      .from('customers')
      .select('*')
      .order('name');
    
    setCustomers(data || []);
    setLoading(false);
  };

  const selectCustomer = async (customer: Customer) => {
    setSelectedCustomer(customer);
    setLoading(true);

    try {
      // Fetch all related data for this customer
      const [collectionsRes, opportunitiesRes, ordersRes] = await Promise.all([
        supabase.from('collections').select('*').eq('customer_id', customer.id),
        supabase.from('opportunities').select('*').eq('customer_id', customer.id),
        supabase.from('orders').select('*').eq('customer_id', customer.id)
      ]);

      const collections = collectionsRes.data || [];
      const opportunities = opportunitiesRes.data || [];
      const orders = ordersRes.data || [];

      // Calculate metrics
      const totalSales = orders.reduce((sum, o) => sum + (o.total_amount || 0), 0);
      const totalCollected = collections.filter(c => c.status === 'Ödendi').reduce((sum, c) => sum + (c.amount || 0), 0);
      const pendingAmount = collections.filter(c => c.status === 'Bekliyor').reduce((sum, c) => sum + (c.amount || 0), 0);
      const overdueAmount = collections.filter(c => c.status === 'Gecikmiş').reduce((sum, c) => sum + (c.amount || 0), 0);
      const totalReceivable = collections.reduce((sum, c) => sum + (c.amount || 0), 0);
      const collectionRate = totalReceivable > 0 ? (totalCollected / totalReceivable) * 100 : 100;
      
      // Calculate avg payment days
      const paidCollections = collections.filter(c => c.payment_date && c.due_date);
      const avgPaymentDays = paidCollections.length > 0
        ? paidCollections.reduce((sum, c) => {
            const due = new Date(c.due_date);
            const paid = new Date(c.payment_date);
            return sum + Math.floor((paid.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
          }, 0) / paidCollections.length
        : 0;

      const opportunityCount = opportunities.length;
      const pipelineValue = opportunities
        .filter(o => o.stage !== 'Kaybedildi' && o.stage !== 'Kazanıldı')
        .reduce((sum, o) => sum + (o.value || 0), 0);

      // Calculate health score
      let healthScore = 100;
      if (collectionRate < 70) healthScore -= 30;
      else if (collectionRate < 85) healthScore -= 15;
      if (overdueAmount > 0) healthScore -= 20;
      if (avgPaymentDays > 30) healthScore -= 15;
      else if (avgPaymentDays > 15) healthScore -= 5;
      healthScore = Math.max(0, healthScore);

      setMetrics({
        totalSales,
        totalCollected,
        pendingAmount,
        overdueAmount,
        collectionRate,
        avgPaymentDays: Math.round(avgPaymentDays),
        opportunityCount,
        pipelineValue,
        healthScore
      });

      // Build transaction history
      const txns: Transaction[] = [
        ...orders.map(o => ({
          id: o.id,
          type: 'sale' as const,
          description: `Sipariş #${o.order_no || o.id.slice(0, 8)}`,
          amount: o.total_amount || 0,
          date: o.created_at,
          status: o.status
        })),
        ...collections.map(c => ({
          id: c.id,
          type: 'collection' as const,
          description: `Fatura ${c.invoice_no || '-'}`,
          amount: c.amount || 0,
          date: c.due_date,
          status: c.status
        })),
        ...opportunities.map(o => ({
          id: o.id,
          type: 'opportunity' as const,
          description: o.title || 'Fırsat',
          amount: o.value || 0,
          date: o.created_at,
          status: o.stage
        }))
      ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      setTransactions(txns.slice(0, 10));

      // Generate trend data (last 6 months)
      const trend = [];
      for (let i = 5; i >= 0; i--) {
        const date = new Date();
        date.setMonth(date.getMonth() - i);
        const month = date.getMonth();
        const year = date.getFullYear();
        const monthName = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'][month];

        const monthSales = orders.filter(o => {
          const d = new Date(o.created_at);
          return d.getMonth() === month && d.getFullYear() === year;
        }).reduce((sum, o) => sum + (o.total_amount || 0), 0);

        const monthCollections = collections.filter(c => {
          if (!c.payment_date) return false;
          const d = new Date(c.payment_date);
          return d.getMonth() === month && d.getFullYear() === year;
        }).reduce((sum, c) => sum + (c.amount || 0), 0);

        trend.push({ name: monthName, sales: monthSales, collection: monthCollections });
      }
      setTrendData(trend);

    } catch (error) {
      console.error('Error fetching customer data:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredCustomers = customers.filter(c =>
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Aktif': return 'success';
      case 'Pasif': return 'secondary';
      case 'Riskli': return 'danger';
      default: return 'info';
    }
  };

  const getSegmentColor = (segment: string) => {
    switch (segment) {
      case 'Enterprise': return 'bg-purple-100 text-purple-700';
      case 'Mid-Market': return 'bg-blue-100 text-blue-700';
      case 'SMB': return 'bg-green-100 text-green-700';
      default: return 'bg-slate-100 text-slate-700';
    }
  };

  return (
    <div>
      <Header title="Müşteri 360°" subtitle="Tek Ekranda Tüm Müşteri Bilgileri" />
      
      <div className="p-6">
        <div className="grid gap-6 lg:grid-cols-12">
          {/* Customer List */}
          <div className="lg:col-span-4">
            <Card className="p-4">
              <div className="mb-4">
                <input
                  type="text"
                  placeholder="Müşteri ara..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full h-10 px-4 rounded-lg border border-slate-200 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </div>
              
              <div className="space-y-2 max-h-[calc(100vh-250px)] overflow-y-auto">
                {filteredCustomers.map(customer => (
                  <button
                    key={customer.id}
                    onClick={() => selectCustomer(customer)}
                    className={`w-full text-left p-3 rounded-lg border transition-colors ${
                      selectedCustomer?.id === customer.id
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-slate-900">{customer.name}</p>
                        <p className="text-xs text-slate-500">{customer.region}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded text-xs ${getSegmentColor(customer.segment)}`}>
                          {customer.segment}
                        </span>
                        <Badge variant={getStatusColor(customer.status) as any} className="text-xs">
                          {customer.status}
                        </Badge>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </Card>
          </div>

          {/* Customer Details */}
          <div className="lg:col-span-8">
            {!selectedCustomer ? (
              <Card className="p-12 text-center">
                <Building2 className="h-16 w-16 mx-auto text-slate-300 mb-4" />
                <p className="text-slate-500">Detayları görmek için bir müşteri seçin</p>
              </Card>
            ) : loading ? (
              <Card className="p-12 text-center">
                <div className="h-10 w-10 mx-auto animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
              </Card>
            ) : (
              <div className="space-y-6">
                {/* Customer Header */}
                <Card className="p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-4">
                      <div className="h-16 w-16 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-2xl font-bold">
                        {selectedCustomer.name.charAt(0)}
                      </div>
                      <div>
                        <h2 className="text-xl font-bold text-slate-900">{selectedCustomer.name}</h2>
                        <div className="flex items-center gap-3 mt-1">
                          <span className={`px-2 py-0.5 rounded text-xs ${getSegmentColor(selectedCustomer.segment)}`}>
                            {selectedCustomer.segment}
                          </span>
                          <Badge variant={getStatusColor(selectedCustomer.status) as any}>
                            {selectedCustomer.status}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-4 mt-2 text-sm text-slate-500">
                          {selectedCustomer.email && (
                            <span className="flex items-center gap-1">
                              <Mail className="h-4 w-4" /> {selectedCustomer.email}
                            </span>
                          )}
                          {selectedCustomer.phone && (
                            <span className="flex items-center gap-1">
                              <Phone className="h-4 w-4" /> {selectedCustomer.phone}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    {metrics && <CustomerHealthScore score={metrics.healthScore} />}
                  </div>
                </Card>

                {/* Metrics Grid */}
                {metrics && (
                  <div className="grid gap-4 md:grid-cols-4">
                    <Card className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center">
                          <DollarSign className="h-5 w-5 text-blue-600" />
                        </div>
                        <div>
                          <p className="text-xs text-slate-500">Toplam Satış</p>
                          <p className="text-lg font-bold text-slate-900">₺{formatMoney(metrics.totalSales)}</p>
                        </div>
                      </div>
                    </Card>

                    <Card className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-lg bg-green-100 flex items-center justify-center">
                          <CheckCircle className="h-5 w-5 text-green-600" />
                        </div>
                        <div>
                          <p className="text-xs text-slate-500">Tahsil Edilen</p>
                          <p className="text-lg font-bold text-green-600">₺{formatMoney(metrics.totalCollected)}</p>
                        </div>
                      </div>
                    </Card>

                    <Card className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-lg bg-amber-100 flex items-center justify-center">
                          <Clock className="h-5 w-5 text-amber-600" />
                        </div>
                        <div>
                          <p className="text-xs text-slate-500">Bekleyen</p>
                          <p className="text-lg font-bold text-amber-600">₺{formatMoney(metrics.pendingAmount)}</p>
                        </div>
                      </div>
                    </Card>

                    <Card className="p-4">
                      <div className="flex items-center gap-3">
                        <div className={`h-10 w-10 rounded-lg ${metrics.overdueAmount > 0 ? 'bg-red-100' : 'bg-slate-100'} flex items-center justify-center`}>
                          <AlertTriangle className={`h-5 w-5 ${metrics.overdueAmount > 0 ? 'text-red-600' : 'text-slate-400'}`} />
                        </div>
                        <div>
                          <p className="text-xs text-slate-500">Vadesi Geçmiş</p>
                          <p className={`text-lg font-bold ${metrics.overdueAmount > 0 ? 'text-red-600' : 'text-slate-400'}`}>
                            ₺{formatMoney(metrics.overdueAmount)}
                          </p>
                        </div>
                      </div>
                    </Card>
                  </div>
                )}

                {/* Additional Metrics */}
                {metrics && (
                  <div className="grid gap-4 md:grid-cols-3">
                    <Card className="p-4 text-center">
                      <p className="text-3xl font-bold text-blue-600">%{metrics.collectionRate.toFixed(0)}</p>
                      <p className="text-sm text-slate-500">Tahsilat Oranı</p>
                    </Card>
                    <Card className="p-4 text-center">
                      <p className="text-3xl font-bold text-purple-600">{metrics.avgPaymentDays}</p>
                      <p className="text-sm text-slate-500">Ort. Ödeme Süresi (gün)</p>
                    </Card>
                    <Card className="p-4 text-center">
                      <p className="text-3xl font-bold text-indigo-600">₺{formatMoney(metrics.pipelineValue)}</p>
                      <p className="text-sm text-slate-500">Pipeline ({metrics.opportunityCount} fırsat)</p>
                    </Card>
                  </div>
                )}

                {/* Trend Chart */}
                <Card className="p-6">
                  <h3 className="font-semibold text-slate-900 mb-4">Satış & Tahsilat Trendi</h3>
                  <div className="h-48">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={trendData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                        <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `₺${(v / 1000).toFixed(0)}K`} />
                        <Tooltip formatter={(value: number) => `₺${formatMoney(value)}`} />
                        <Area type="monotone" dataKey="sales" name="Satış" stroke="#3b82f6" fill="#3b82f633" />
                        <Area type="monotone" dataKey="collection" name="Tahsilat" stroke="#10b981" fill="#10b98133" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </Card>

                {/* Recent Transactions */}
                <Card className="p-6">
                  <h3 className="font-semibold text-slate-900 mb-4">Son İşlemler</h3>
                  <div className="space-y-3">
                    {transactions.map(tx => (
                      <div key={tx.id} className="flex items-center justify-between p-3 rounded-lg bg-slate-50">
                        <div className="flex items-center gap-3">
                          <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${
                            tx.type === 'sale' ? 'bg-blue-100' :
                            tx.type === 'collection' ? 'bg-green-100' : 'bg-purple-100'
                          }`}>
                            {tx.type === 'sale' ? <FileText className="h-4 w-4 text-blue-600" /> :
                             tx.type === 'collection' ? <Wallet className="h-4 w-4 text-green-600" /> :
                             <Target className="h-4 w-4 text-purple-600" />}
                          </div>
                          <div>
                            <p className="text-sm font-medium text-slate-900">{tx.description}</p>
                            <p className="text-xs text-slate-500">{new Date(tx.date).toLocaleDateString('tr-TR')}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-slate-900">₺{formatMoney(tx.amount)}</p>
                          <p className="text-xs text-slate-500">{tx.status}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
