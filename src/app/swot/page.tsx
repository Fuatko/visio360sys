'use client';

import Header from '@/components/Header';
import { Card, CardHeader, CardTitle, CardBody, Button, Badge, Modal, Input, EmptyState, ProgressBar } from '@/components/ui';
import { formatMoney } from '@/lib/utils';
import { 
  Layers, TrendingUp, TrendingDown, AlertTriangle, Target, Users, Building2,
  Brain, Lightbulb, Shield, Zap, ChevronRight, RefreshCw, Save, Plus, Edit2,
  Trash2, Download, Calendar, BarChart3, PieChart, Activity, Award, XCircle,
  CheckCircle2, ArrowUpRight, ArrowDownRight, Minus, Eye, FileText, Sparkles
} from 'lucide-react';
import { useState, useEffect, useMemo } from 'react';
import { createClient } from '@/lib/supabase';
import {
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart as RechartsPie, Pie, Cell, LineChart, Line, Area, AreaChart
} from 'recharts';

// ============ TYPES ============
interface SalesRep {
  id: string;
  name: string;
  department?: string;
  region?: string;
  photo_url?: string;
}

interface PerformanceMetrics {
  sales_target: number;
  actual_sales: number;
  sales_ratio: number;
  invoiced_amount: number;
  collected_amount: number;
  collection_ratio: number;
  opportunity_count: number;
  won_opportunities: number;
  conversion_rate: number;
  customer_count: number;
  new_customers: number;
  lost_customers: number;
  avg_deal_size: number;
  activity_count: number;
  visit_count: number;
}

interface SWOTItem {
  id?: string;
  category: 'strength' | 'weakness' | 'opportunity' | 'threat';
  text: string;
  source: 'auto' | 'manual' | 'ai';
  score?: number;
  metric_key?: string;
  created_at?: string;
}

interface SWOTAnalysis {
  id?: string;
  sales_rep_id: string;
  period_year: number;
  period_month: number;
  metrics_snapshot: PerformanceMetrics;
  strengths: SWOTItem[];
  weaknesses: SWOTItem[];
  opportunities: SWOTItem[];
  threats: SWOTItem[];
  ai_summary?: string;
  ai_recommendations?: string[];
  manager_notes?: string;
  action_items?: { text: string; status: 'pending' | 'in_progress' | 'done'; due_date?: string }[];
  overall_score?: number;
  created_at?: string;
  updated_at?: string;
}

// ============ CONSTANTS ============
const COLORS = {
  strength: { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700', icon: 'text-emerald-600' },
  weakness: { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700', icon: 'text-red-600' },
  opportunity: { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700', icon: 'text-blue-600' },
  threat: { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', icon: 'text-amber-600' },
};

const CHART_COLORS = ['#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899', '#84cc16'];

const METRIC_THRESHOLDS = {
  sales_ratio: { excellent: 1.1, good: 1.0, average: 0.9, poor: 0.7 },
  collection_ratio: { excellent: 1.0, good: 0.95, average: 0.85, poor: 0.7 },
  conversion_rate: { excellent: 0.4, good: 0.3, average: 0.2, poor: 0.1 },
  activity_score: { excellent: 50, good: 35, average: 20, poor: 10 },
};

// ============ AI ANALYSIS HELPERS ============
function analyzeMetrics(metrics: PerformanceMetrics, teamAvg: PerformanceMetrics): {
  strengths: SWOTItem[];
  weaknesses: SWOTItem[];
  opportunities: SWOTItem[];
  threats: SWOTItem[];
} {
  const strengths: SWOTItem[] = [];
  const weaknesses: SWOTItem[] = [];
  const opportunities: SWOTItem[] = [];
  const threats: SWOTItem[] = [];

  // Satış Performansı Analizi
  if (metrics.sales_ratio >= METRIC_THRESHOLDS.sales_ratio.excellent) {
    strengths.push({
      category: 'strength',
      text: `Mükemmel satış performansı: Hedefin %${(metrics.sales_ratio * 100).toFixed(0)}'ı gerçekleştirildi`,
      source: 'auto',
      score: 95,
      metric_key: 'sales_ratio'
    });
  } else if (metrics.sales_ratio >= METRIC_THRESHOLDS.sales_ratio.good) {
    strengths.push({
      category: 'strength',
      text: `Hedefe ulaşıldı: %${(metrics.sales_ratio * 100).toFixed(0)} gerçekleşme`,
      source: 'auto',
      score: 80,
      metric_key: 'sales_ratio'
    });
  } else if (metrics.sales_ratio < METRIC_THRESHOLDS.sales_ratio.poor) {
    weaknesses.push({
      category: 'weakness',
      text: `Düşük satış performansı: Hedefin sadece %${(metrics.sales_ratio * 100).toFixed(0)}'ı`,
      source: 'auto',
      score: 30,
      metric_key: 'sales_ratio'
    });
    threats.push({
      category: 'threat',
      text: 'Satış hedeflerine ulaşılamaması prim kaybına yol açabilir',
      source: 'auto',
      metric_key: 'sales_ratio'
    });
  } else if (metrics.sales_ratio < METRIC_THRESHOLDS.sales_ratio.average) {
    weaknesses.push({
      category: 'weakness',
      text: `Satış hedefinin altında: %${(metrics.sales_ratio * 100).toFixed(0)} gerçekleşme`,
      source: 'auto',
      score: 50,
      metric_key: 'sales_ratio'
    });
  }

  // Tahsilat Analizi
  if (metrics.collection_ratio >= METRIC_THRESHOLDS.collection_ratio.excellent) {
    strengths.push({
      category: 'strength',
      text: `Mükemmel tahsilat: %${(metrics.collection_ratio * 100).toFixed(0)} oranında tahsil edildi`,
      source: 'auto',
      score: 95,
      metric_key: 'collection_ratio'
    });
  } else if (metrics.collection_ratio >= METRIC_THRESHOLDS.collection_ratio.good) {
    strengths.push({
      category: 'strength',
      text: `İyi tahsilat performansı: %${(metrics.collection_ratio * 100).toFixed(0)}`,
      source: 'auto',
      score: 80,
      metric_key: 'collection_ratio'
    });
  } else if (metrics.collection_ratio < METRIC_THRESHOLDS.collection_ratio.poor) {
    weaknesses.push({
      category: 'weakness',
      text: `Kritik tahsilat sorunu: Sadece %${(metrics.collection_ratio * 100).toFixed(0)} tahsil edildi`,
      source: 'auto',
      score: 25,
      metric_key: 'collection_ratio'
    });
    threats.push({
      category: 'threat',
      text: '⚠️ HARD STOP riski: Tahsilat %70 altında kalırsa prim sıfırlanır',
      source: 'auto',
      metric_key: 'collection_ratio'
    });
  } else if (metrics.collection_ratio < METRIC_THRESHOLDS.collection_ratio.average) {
    weaknesses.push({
      category: 'weakness',
      text: `Tahsilat iyileştirme gerekli: %${(metrics.collection_ratio * 100).toFixed(0)}`,
      source: 'auto',
      score: 45,
      metric_key: 'collection_ratio'
    });
  }

  // Fırsat Dönüşüm Analizi
  if (metrics.conversion_rate >= METRIC_THRESHOLDS.conversion_rate.excellent) {
    strengths.push({
      category: 'strength',
      text: `Yüksek dönüşüm oranı: %${(metrics.conversion_rate * 100).toFixed(0)} fırsat kazanıldı`,
      source: 'auto',
      score: 90,
      metric_key: 'conversion_rate'
    });
  } else if (metrics.conversion_rate >= METRIC_THRESHOLDS.conversion_rate.good) {
    strengths.push({
      category: 'strength',
      text: `İyi dönüşüm oranı: %${(metrics.conversion_rate * 100).toFixed(0)}`,
      source: 'auto',
      score: 75,
      metric_key: 'conversion_rate'
    });
  } else if (metrics.conversion_rate < METRIC_THRESHOLDS.conversion_rate.poor) {
    weaknesses.push({
      category: 'weakness',
      text: `Düşük dönüşüm: Fırsatların sadece %${(metrics.conversion_rate * 100).toFixed(0)}'ı kazanıldı`,
      source: 'auto',
      score: 35,
      metric_key: 'conversion_rate'
    });
  }

  // Müşteri Analizi
  if (metrics.new_customers >= 3) {
    strengths.push({
      category: 'strength',
      text: `${metrics.new_customers} yeni müşteri kazanıldı - başarılı genişleme`,
      source: 'auto',
      score: 85,
      metric_key: 'new_customers'
    });
  } else if (metrics.new_customers > 0) {
    strengths.push({
      category: 'strength',
      text: `${metrics.new_customers} yeni müşteri kazanıldı`,
      source: 'auto',
      score: 70,
      metric_key: 'new_customers'
    });
  }

  if (metrics.lost_customers > 2) {
    weaknesses.push({
      category: 'weakness',
      text: `${metrics.lost_customers} müşteri kaybedildi - yüksek churn`,
      source: 'auto',
      score: 30,
      metric_key: 'lost_customers'
    });
    threats.push({
      category: 'threat',
      text: 'Müşteri kaybı devam ederse pazar payı ve gelir azalabilir',
      source: 'auto',
      metric_key: 'lost_customers'
    });
  } else if (metrics.lost_customers > 0) {
    weaknesses.push({
      category: 'weakness',
      text: `${metrics.lost_customers} müşteri kaybedildi`,
      source: 'auto',
      score: 50,
      metric_key: 'lost_customers'
    });
  }

  // Aktivite Analizi
  if (metrics.activity_count >= METRIC_THRESHOLDS.activity_score.excellent) {
    strengths.push({
      category: 'strength',
      text: `Yüksek aktivite seviyesi: ${metrics.activity_count} aktivite gerçekleştirildi`,
      source: 'auto',
      score: 85,
      metric_key: 'activity_count'
    });
  } else if (metrics.activity_count < METRIC_THRESHOLDS.activity_score.poor) {
    weaknesses.push({
      category: 'weakness',
      text: `Düşük aktivite seviyesi: Sadece ${metrics.activity_count} aktivite`,
      source: 'auto',
      score: 40,
      metric_key: 'activity_count'
    });
  }

  // Takım Karşılaştırması
  if (metrics.sales_ratio > teamAvg.sales_ratio * 1.2) {
    strengths.push({
      category: 'strength',
      text: 'Takım ortalamasının %20+ üzerinde satış performansı',
      source: 'auto',
      score: 90,
      metric_key: 'team_comparison'
    });
  } else if (metrics.sales_ratio < teamAvg.sales_ratio * 0.8) {
    weaknesses.push({
      category: 'weakness',
      text: 'Takım ortalamasının %20+ altında performans',
      source: 'auto',
      score: 35,
      metric_key: 'team_comparison'
    });
  }

  // Fırsatlar
  const openOpps = metrics.opportunity_count - metrics.won_opportunities;
  if (openOpps > 5) {
    opportunities.push({
      category: 'opportunity',
      text: `${openOpps} açık fırsat takip bekliyor - potansiyel gelir artışı`,
      source: 'auto',
      metric_key: 'open_opportunities'
    });
  }

  if (metrics.avg_deal_size > 0 && metrics.avg_deal_size < teamAvg.avg_deal_size) {
    opportunities.push({
      category: 'opportunity',
      text: 'Ortalama satış tutarı artırılabilir (cross-sell/up-sell fırsatı)',
      source: 'auto',
      metric_key: 'avg_deal_size'
    });
  }

  if (metrics.visit_count < 15) {
    opportunities.push({
      category: 'opportunity',
      text: 'Müşteri ziyaret sayısı artırılarak dönüşüm iyileştirilebilir',
      source: 'auto',
      metric_key: 'visit_count'
    });
  }

  if (metrics.customer_count > 10) {
    opportunities.push({
      category: 'opportunity',
      text: `${metrics.customer_count} mevcut müşteride derinleşme potansiyeli`,
      source: 'auto',
      metric_key: 'customer_depth'
    });
  }

  // Genel Fırsatlar
  opportunities.push({
    category: 'opportunity',
    text: 'Dijital satış kanallarını kullanarak erişimi genişletme',
    source: 'ai'
  });

  // Genel Tehditler
  threats.push({
    category: 'threat',
    text: 'Piyasa rekabeti ve fiyat baskısı',
    source: 'ai'
  });

  return { strengths, weaknesses, opportunities, threats };
}

function generateAISummary(metrics: PerformanceMetrics, swotItems: { strengths: SWOTItem[]; weaknesses: SWOTItem[] }): string {
  const strengthCount = swotItems.strengths.length;
  const weaknessCount = swotItems.weaknesses.length;
  
  let summary = '';
  
  // Genel değerlendirme
  if (strengthCount > weaknessCount + 1) {
    summary = '🌟 Genel performans değerlendirmesi: MÜKEMMEL. ';
  } else if (strengthCount > weaknessCount) {
    summary = '✅ Genel performans değerlendirmesi: İYİ. ';
  } else if (weaknessCount > strengthCount + 1) {
    summary = '⚠️ Genel performans değerlendirmesi: GELİŞTİRİLMELİ. ';
  } else {
    summary = '📊 Genel performans değerlendirmesi: ORTALAMA. ';
  }

  // Satış yorumu
  if (metrics.sales_ratio >= 1) {
    summary += `Satış hedeflerine ulaşıldı (%${(metrics.sales_ratio * 100).toFixed(0)}). `;
  } else {
    summary += `Satış hedefine %${((1 - metrics.sales_ratio) * 100).toFixed(0)} uzaklıkta. `;
  }

  // Tahsilat yorumu
  if (metrics.collection_ratio < 0.7) {
    summary += `⚠️ KRİTİK: Tahsilat oranı %${(metrics.collection_ratio * 100).toFixed(0)} - HARD STOP eşiğinin altında! Acil aksiyon gerekli. `;
  } else if (metrics.collection_ratio < 0.85) {
    summary += `Tahsilat performansı (%${(metrics.collection_ratio * 100).toFixed(0)}) iyileştirme gerektiriyor. `;
  } else {
    summary += `Tahsilat performansı sağlıklı (%${(metrics.collection_ratio * 100).toFixed(0)}). `;
  }

  // Dönüşüm yorumu
  if (metrics.conversion_rate >= 0.3) {
    summary += 'Fırsat dönüşüm oranı rekabetçi seviyede.';
  } else if (metrics.conversion_rate < 0.15) {
    summary += 'Fırsat dönüşüm oranı düşük - satış süreç analizi önerilir.';
  }

  return summary;
}

function generateRecommendations(metrics: PerformanceMetrics): string[] {
  const recommendations: string[] = [];

  if (metrics.collection_ratio < 0.85) {
    recommendations.push('📞 Vadesi geçmiş alacaklar için müşteri takip planı oluşturun');
    recommendations.push('💳 Alternatif ödeme planları sunarak tahsilatı hızlandırın');
  }

  if (metrics.sales_ratio < 0.9) {
    recommendations.push('🎯 Mevcut fırsatlara odaklanarak hızlı kapanış hedefleyin');
    recommendations.push('📊 Pipeline analizi yaparak önceliklendirme yapın');
  }

  if (metrics.conversion_rate < 0.25) {
    recommendations.push('🔍 Kaybedilen fırsatları analiz ederek sebepleri belirleyin');
    recommendations.push('📚 Satış teknikleri eğitimi planlanabilir');
  }

  if (metrics.visit_count < 15) {
    recommendations.push('🚗 Haftalık ziyaret sayısını artırın (hedef: 20+)');
  }

  if (metrics.new_customers === 0) {
    recommendations.push('🆕 Yeni müşteri kazanımı için prospecting aktivitelerini artırın');
  }

  if (metrics.lost_customers > 0) {
    recommendations.push('🔄 Kaybedilen müşterilerle geri kazanım görüşmesi yapın');
  }

  if (recommendations.length === 0) {
    recommendations.push('✅ Mevcut performansı sürdürün ve takım arkadaşlarınıza mentorluk yapın');
    recommendations.push('🚀 Bir üst seviye hedefler belirleyerek kendinizi zorlayın');
  }

  return recommendations.slice(0, 6);
}

function calculateOverallScore(metrics: PerformanceMetrics): number {
  const weights = {
    sales: 0.30,
    collection: 0.25,
    conversion: 0.20,
    activity: 0.15,
    customers: 0.10
  };
  
  const salesScore = Math.min(metrics.sales_ratio * 100, 120);
  const collectionScore = Math.min(metrics.collection_ratio * 100, 100);
  const conversionScore = Math.min(metrics.conversion_rate * 200, 100);
  const activityScore = Math.min(metrics.activity_count * 2, 100);
  const customerScore = metrics.lost_customers === 0 
    ? 80 + (metrics.new_customers * 5) 
    : Math.max(50 - metrics.lost_customers * 10, 0);
  
  return Math.round(
    salesScore * weights.sales +
    collectionScore * weights.collection +
    conversionScore * weights.conversion +
    activityScore * weights.activity +
    customerScore * weights.customers
  );
}

// ============ MAIN COMPONENT ============
export default function SWOTAnalysisPage() {
  const [loading, setLoading] = useState(true);
  const [salesTeam, setSalesTeam] = useState<SalesRep[]>([]);
  const [selectedRep, setSelectedRep] = useState<string>('');
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  
  const [metrics, setMetrics] = useState<PerformanceMetrics | null>(null);
  const [teamAvgMetrics, setTeamAvgMetrics] = useState<PerformanceMetrics | null>(null);
  const [historicalData, setHistoricalData] = useState<any[]>([]);
  const [swotAnalysis, setSWOTAnalysis] = useState<SWOTAnalysis | null>(null);
  
  const [manualItemModalOpen, setManualItemModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<{ category: SWOTItem['category']; text: string } | null>(null);
  const [managerNotes, setManagerNotes] = useState('');
  const [actionItems, setActionItems] = useState<SWOTAnalysis['action_items']>([]);
  
  const supabase = createClient();

  const MONTHS = [
    { value: 1, label: 'Ocak' }, { value: 2, label: 'Şubat' }, { value: 3, label: 'Mart' },
    { value: 4, label: 'Nisan' }, { value: 5, label: 'Mayıs' }, { value: 6, label: 'Haziran' },
    { value: 7, label: 'Temmuz' }, { value: 8, label: 'Ağustos' }, { value: 9, label: 'Eylül' },
    { value: 10, label: 'Ekim' }, { value: 11, label: 'Kasım' }, { value: 12, label: 'Aralık' },
  ];

  // ============ DATA FETCHING ============
  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: team } = await supabase
        .from('sales_team')
        .select('*')
        .order('name');
      setSalesTeam(team || []);

      if (team && team.length > 0 && !selectedRep) {
        setSelectedRep(team[0].id);
      }
    } catch (err) {
      console.error('Veri çekme hatası:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchMetricsForRep = async (repId: string) => {
    if (!repId) return;

    try {
      // Tüm veriyi çek (şirket ayrımı veritabanında yapılıyor), kişi bazında filtrele
      const [targetsRes, opportunitiesRes, collectionsRes, customersRes, activitiesRes] = await Promise.all([
        supabase.from('targets').select('*'),
        supabase.from('opportunities').select('*'),
        supabase.from('collections').select('*'),
        supabase.from('customers').select('*'),
        supabase.from('crm_activities').select('*'),
      ]);

      const allTargets = targetsRes.data || [];
      const allOpps = opportunitiesRes.data || [];
      const allColls = collectionsRes.data || [];
      const allCustomers = customersRes.data || [];
      const allActivities = activitiesRes.data || [];

      const ownerOf = (r: any) => r.sales_person_id || r.assigned_to || r.sales_rep_id || r.owner_id || null;
      const isPaid = (c: any) => c.status === 'paid' || c.status === 'Ödendi';
      const isWon = (o: any) => ['won', 'Kazanıldı', 'Kapanış'].includes(o.stage);
      const isLost = (o: any) => ['lost', 'Kaybedildi'].includes(o.stage);

      const computeMetrics = (personId: string, year: number, month: number): PerformanceMetrics => {
        const key = `${year}-${String(month).padStart(2, '0')}`;
        const inMonth = (v: any) => String(v || '').startsWith(key);

        const opportunities = allOpps.filter((o: any) => ownerOf(o) === personId);
        const monthOpps = opportunities.filter((o: any) => inMonth(o.created_at));
        const wonOpps = opportunities.filter((o: any) => isWon(o) && inMonth(o.closed_at || o.updated_at || o.created_at));
        const decided = opportunities.filter((o: any) => (isWon(o) || isLost(o)) && inMonth(o.closed_at || o.updated_at || o.created_at));
        const monthCollections = allColls.filter((c: any) => ownerOf(c) === personId && inMonth(c.due_date || c.created_at));
        const customers = allCustomers.filter((c: any) => ownerOf(c) === personId);
        const activities = allActivities.filter((a: any) => ownerOf(a) === personId && inMonth(a.activity_date || a.created_at));
        const visits = activities.filter((a: any) => ['visit', 'meeting', 'Ziyaret', 'Toplantı'].includes(a.type));
        const target = allTargets.filter((t: any) => ownerOf(t) === personId && inMonth(t.period));

        const wonValue = wonOpps.reduce((s: number, o: any) => s + Number(o.value || 0), 0);
        const salesTarget = target.reduce((s: number, t: any) => s + Number(t.sales_target || 0), 0);
        const achieved = target.reduce((s: number, t: any) => s + Number(t.achieved_sales || 0), 0);
        const invoiced = monthCollections.reduce((s: number, c: any) => s + Number(c.amount || 0), 0);
        const collected = monthCollections.filter(isPaid).reduce((s: number, c: any) => s + Number(c.amount || 0), 0);

        const m: PerformanceMetrics = {
          sales_target: salesTarget,
          actual_sales: achieved || wonValue,
          sales_ratio: 0,
          invoiced_amount: invoiced,
          collected_amount: collected,
          collection_ratio: 0,
          opportunity_count: monthOpps.length,
          won_opportunities: wonOpps.length,
          conversion_rate: 0,
          customer_count: customers.length,
          new_customers: customers.filter((c: any) => inMonth(c.created_at)).length,
          lost_customers: 0,
          avg_deal_size: wonOpps.length > 0 ? wonValue / wonOpps.length : 0,
          activity_count: activities.length,
          visit_count: visits.length,
        };
        m.sales_ratio = m.sales_target > 0 ? m.actual_sales / m.sales_target : 0;
        m.collection_ratio = m.invoiced_amount > 0 ? m.collected_amount / m.invoiced_amount : 0;
        m.conversion_rate = decided.length > 0 ? m.won_opportunities / decided.length : 0;
        return m;
      };

      const repMetrics = computeMetrics(repId, selectedYear, selectedMonth);
      setMetrics(repMetrics);

      // Ekip ortalaması - aynı dönem, tüm temsilcilerin gerçek ortalaması
      const teamMetrics = salesTeam.map(r => computeMetrics(r.id, selectedYear, selectedMonth));
      const avg = (f: (m: PerformanceMetrics) => number) =>
        teamMetrics.length > 0 ? teamMetrics.reduce((s, m) => s + f(m), 0) / teamMetrics.length : 0;
      const teamAvg: PerformanceMetrics = {
        ...repMetrics,
        sales_ratio: avg(m => m.sales_ratio),
        collection_ratio: avg(m => m.collection_ratio),
        conversion_rate: avg(m => m.conversion_rate),
        avg_deal_size: avg(m => m.avg_deal_size),
        activity_count: avg(m => m.activity_count),
        visit_count: avg(m => m.visit_count),
      };
      setTeamAvgMetrics(teamAvg);

      // Generate SWOT
      const swotItems = analyzeMetrics(repMetrics, teamAvg);
      const overallScore = calculateOverallScore(repMetrics);
      
      const analysis: SWOTAnalysis = {
        sales_rep_id: repId,
        period_year: selectedYear,
        period_month: selectedMonth,
        metrics_snapshot: repMetrics,
        ...swotItems,
        ai_summary: generateAISummary(repMetrics, swotItems),
        ai_recommendations: generateRecommendations(repMetrics),
        overall_score: overallScore,
        manager_notes: managerNotes,
        action_items: actionItems,
      };

      setSWOTAnalysis(analysis);

      // Geçmiş 6 ay - her ay gerçek veriden hesaplanır
      const historical = [];
      for (let i = 5; i >= 0; i--) {
        let m = selectedMonth - i;
        let y = selectedYear;
        if (m <= 0) { m += 12; y--; }
        const hm = i === 0 ? repMetrics : computeMetrics(repId, y, m);
        historical.push({
          month: MONTHS.find(mon => mon.value === m)?.label.slice(0, 3) || '',
          sales: Math.round(hm.sales_ratio * 100),
          collection: Math.round(hm.collection_ratio * 100),
          conversion: Math.round(hm.conversion_rate * 100),
          score: i === 0 ? overallScore : calculateOverallScore(hm),
        });
      }
      setHistoricalData(historical);

    } catch (err) {
      console.error('Metrik hesaplama hatası:', err);
    }
  };

  useEffect(() => { fetchData(); }, []);
  useEffect(() => { fetchMetricsForRep(selectedRep); }, [selectedRep, selectedYear, selectedMonth]);

  // ============ RADAR CHART DATA ============
  const radarData = useMemo(() => {
    if (!metrics || !teamAvgMetrics) return [];
    return [
      { subject: 'Satış', kisi: Math.round(metrics.sales_ratio * 100), takim: Math.round(teamAvgMetrics.sales_ratio * 100) },
      { subject: 'Tahsilat', kisi: Math.round(metrics.collection_ratio * 100), takim: Math.round(teamAvgMetrics.collection_ratio * 100) },
      { subject: 'Dönüşüm', kisi: Math.round(metrics.conversion_rate * 100), takim: Math.round(teamAvgMetrics.conversion_rate * 100) },
      { subject: 'Aktivite', kisi: Math.min(Math.round(metrics.activity_count * 2), 100), takim: 80 },
      { subject: 'Yeni Müşteri', kisi: Math.min(metrics.new_customers * 25, 100), takim: 50 },
    ];
  }, [metrics, teamAvgMetrics]);

  // Pie chart data
  const pieData = useMemo(() => {
    if (!swotAnalysis) return [];
    return [
      { name: 'Güçlü', value: swotAnalysis.strengths.length, color: '#10b981' },
      { name: 'Zayıf', value: swotAnalysis.weaknesses.length, color: '#ef4444' },
      { name: 'Fırsat', value: swotAnalysis.opportunities.length, color: '#3b82f6' },
      { name: 'Tehdit', value: swotAnalysis.threats.length, color: '#f59e0b' },
    ];
  }, [swotAnalysis]);

  // ============ HANDLERS ============
  const addManualItem = (category: SWOTItem['category']) => {
    setEditingItem({ category, text: '' });
    setManualItemModalOpen(true);
  };

  const saveManualItem = () => {
    if (!editingItem || !editingItem.text.trim() || !swotAnalysis) return;

    const newItem: SWOTItem = {
      id: `manual-${Date.now()}`,
      category: editingItem.category,
      text: editingItem.text,
      source: 'manual',
    };

    const updated = { ...swotAnalysis };
    if (editingItem.category === 'strength') updated.strengths = [...updated.strengths, newItem];
    if (editingItem.category === 'weakness') updated.weaknesses = [...updated.weaknesses, newItem];
    if (editingItem.category === 'opportunity') updated.opportunities = [...updated.opportunities, newItem];
    if (editingItem.category === 'threat') updated.threats = [...updated.threats, newItem];

    setSWOTAnalysis(updated);
    setManualItemModalOpen(false);
    setEditingItem(null);
  };

  const removeItem = (category: SWOTItem['category'], index: number) => {
    if (!swotAnalysis) return;
    const updated = { ...swotAnalysis };
    if (category === 'strength') updated.strengths = updated.strengths.filter((_, i) => i !== index);
    if (category === 'weakness') updated.weaknesses = updated.weaknesses.filter((_, i) => i !== index);
    if (category === 'opportunity') updated.opportunities = updated.opportunities.filter((_, i) => i !== index);
    if (category === 'threat') updated.threats = updated.threats.filter((_, i) => i !== index);
    setSWOTAnalysis(updated);
  };

  const addActionItem = () => {
    setActionItems([...(actionItems || []), { text: '', status: 'pending' }]);
  };

  const updateActionItem = (index: number, field: string, value: any) => {
    const updated = [...(actionItems || [])];
    (updated[index] as any)[field] = value;
    setActionItems(updated);
  };

  const selectedRepData = salesTeam.find(r => r.id === selectedRep);

  if (loading) {
    return (
      <div>
        <Header title="SWOT Analizi" />
        <div className="flex h-96 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-indigo-600" />
        </div>
      </div>
    );
  }

  return (
    <div>
      <Header title="SWOT Analizi" subtitle="Hibrit Performans Değerlendirme - Otomatik + Manuel + AI Destekli" />

      <div className="p-6">
        {/* Filters */}
        <div className="mb-6 flex flex-wrap gap-4 items-center justify-between">
          <div className="flex gap-3 items-center">
            <select
              value={selectedRep}
              onChange={(e) => setSelectedRep(e.target.value)}
              className="px-4 py-2 rounded-lg border border-slate-200 font-medium"
            >
              <option value="">Temsilci Seçin</option>
              {salesTeam.map(rep => (
                <option key={rep.id} value={rep.id}>{rep.name}</option>
              ))}
            </select>

            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(parseInt(e.target.value))}
              className="px-3 py-2 rounded-lg border border-slate-200"
            >
              {[2024, 2025, 2026].map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>

            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
              className="px-3 py-2 rounded-lg border border-slate-200"
            >
              {MONTHS.map(m => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>

            <Button variant="secondary" onClick={() => fetchMetricsForRep(selectedRep)}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex gap-2">
            <Badge variant="primary" className="px-3 py-1.5">
              <Brain className="h-4 w-4 mr-1" /> AI Destekli Analiz
            </Badge>
          </div>
        </div>

        {selectedRep && metrics && swotAnalysis ? (
          <div className="space-y-6">
            {/* Top Stats Row */}
            <div className="grid gap-4 md:grid-cols-5">
              {/* Overall Score */}
              <Card className="bg-gradient-to-br from-indigo-500 to-purple-600 text-white">
                <CardBody className="text-center py-4">
                  <p className="text-indigo-100 text-sm mb-1">Genel Skor</p>
                  <p className="text-4xl font-bold">{swotAnalysis.overall_score}</p>
                  <p className="text-indigo-200 text-xs mt-1">/100</p>
                </CardBody>
              </Card>

              <Card className="bg-gradient-to-br from-emerald-50 to-green-50 border-emerald-100">
                <CardBody className="text-center py-4">
                  <p className="text-slate-500 text-sm mb-1">Satış</p>
                  <p className={`text-3xl font-bold ${metrics.sales_ratio >= 1 ? 'text-emerald-600' : metrics.sales_ratio >= 0.9 ? 'text-amber-600' : 'text-red-600'}`}>
                    %{(metrics.sales_ratio * 100).toFixed(0)}
                  </p>
                  <p className="text-xs text-slate-400">hedef gerçekleşme</p>
                </CardBody>
              </Card>

              <Card className="bg-gradient-to-br from-blue-50 to-cyan-50 border-blue-100">
                <CardBody className="text-center py-4">
                  <p className="text-slate-500 text-sm mb-1">Tahsilat</p>
                  <p className={`text-3xl font-bold ${metrics.collection_ratio >= 0.9 ? 'text-blue-600' : metrics.collection_ratio >= 0.7 ? 'text-amber-600' : 'text-red-600'}`}>
                    %{(metrics.collection_ratio * 100).toFixed(0)}
                  </p>
                  <p className="text-xs text-slate-400">tahsil oranı</p>
                </CardBody>
              </Card>

              <Card className="bg-gradient-to-br from-violet-50 to-purple-50 border-violet-100">
                <CardBody className="text-center py-4">
                  <p className="text-slate-500 text-sm mb-1">Dönüşüm</p>
                  <p className={`text-3xl font-bold ${metrics.conversion_rate >= 0.3 ? 'text-violet-600' : metrics.conversion_rate >= 0.2 ? 'text-amber-600' : 'text-red-600'}`}>
                    %{(metrics.conversion_rate * 100).toFixed(0)}
                  </p>
                  <p className="text-xs text-slate-400">fırsat dönüşümü</p>
                </CardBody>
              </Card>

              <Card className="bg-gradient-to-br from-amber-50 to-orange-50 border-amber-100">
                <CardBody className="text-center py-4">
                  <p className="text-slate-500 text-sm mb-1">Yeni Müşteri</p>
                  <p className="text-3xl font-bold text-amber-600">+{metrics.new_customers}</p>
                  <p className="text-xs text-slate-400">bu dönem</p>
                </CardBody>
              </Card>
            </div>

            {/* AI Summary */}
            <Card className="bg-gradient-to-r from-indigo-50 via-violet-50 to-purple-50 border-indigo-200">
              <CardBody>
                <div className="flex items-start gap-4">
                  <div className="p-3 bg-white rounded-xl shadow-sm">
                    <Sparkles className="h-8 w-8 text-indigo-600" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-bold text-indigo-700 mb-2 flex items-center gap-2">
                      <Brain className="h-5 w-5" />
                      AI Değerlendirme Özeti
                    </h3>
                    <p className="text-slate-700 mb-4">{swotAnalysis.ai_summary}</p>
                    
                    <h4 className="font-semibold text-indigo-600 mb-2 flex items-center gap-2">
                      <Lightbulb className="h-4 w-4" />
                      Önerilen Aksiyonlar
                    </h4>
                    <ul className="grid md:grid-cols-2 gap-2">
                      {swotAnalysis.ai_recommendations?.map((rec, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm bg-white/50 p-2 rounded-lg">
                          <ChevronRight className="h-4 w-4 text-indigo-500 mt-0.5 flex-shrink-0" />
                          <span className="text-slate-600">{rec}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </CardBody>
            </Card>

            {/* Charts Row */}
            <div className="grid gap-6 lg:grid-cols-2">
              {/* Radar Chart */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 text-indigo-600" />
                    Performans Radarı (Kişi vs Takım Ortalaması)
                  </CardTitle>
                </CardHeader>
                <CardBody>
                  <ResponsiveContainer width="100%" height={280}>
                    <RadarChart data={radarData}>
                      <PolarGrid stroke="#e2e8f0" />
                      <PolarAngleAxis dataKey="subject" tick={{ fill: '#64748b', fontSize: 12 }} />
                      <PolarRadiusAxis angle={30} domain={[0, 120]} tick={{ fontSize: 10 }} />
                      <Radar name="Kişi" dataKey="kisi" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.5} />
                      <Radar name="Takım Ort." dataKey="takim" stroke="#94a3b8" fill="#94a3b8" fillOpacity={0.2} strokeDasharray="5 5" />
                      <Legend />
                      <Tooltip />
                    </RadarChart>
                  </ResponsiveContainer>
                </CardBody>
              </Card>

              {/* Trend Chart */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-emerald-600" />
                    6 Aylık Performans Trendi
                  </CardTitle>
                </CardHeader>
                <CardBody>
                  <ResponsiveContainer width="100%" height={280}>
                    <AreaChart data={historicalData}>
                      <defs>
                        <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                        </linearGradient>
                        <linearGradient id="colorCollection" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                      <YAxis domain={[0, 120]} tick={{ fontSize: 12 }} />
                      <Tooltip formatter={(value: number) => `%${value}`} />
                      <Legend />
                      <Area type="monotone" dataKey="sales" name="Satış %" stroke="#10b981" fillOpacity={1} fill="url(#colorSales)" strokeWidth={2} />
                      <Area type="monotone" dataKey="collection" name="Tahsilat %" stroke="#3b82f6" fillOpacity={1} fill="url(#colorCollection)" strokeWidth={2} />
                      <Line type="monotone" dataKey="score" name="Skor" stroke="#8b5cf6" strokeWidth={2} dot={{ fill: '#8b5cf6' }} />
                    </AreaChart>
                  </ResponsiveContainer>
                </CardBody>
              </Card>
            </div>

            {/* SWOT Matrix */}
            <div className="grid gap-4 md:grid-cols-2">
              {/* Strengths */}
              <Card className={`${COLORS.strength.bg} ${COLORS.strength.border} border-2`}>
                <CardHeader className="pb-2">
                  <CardTitle className={`flex items-center justify-between ${COLORS.strength.text}`}>
                    <span className="flex items-center gap-2">
                      <Shield className="h-5 w-5" />
                      💪 Güçlü Yönler ({swotAnalysis.strengths.length})
                    </span>
                    <Button variant="ghost" size="sm" onClick={() => addManualItem('strength')}>
                      <Plus className="h-4 w-4" />
                    </Button>
                  </CardTitle>
                </CardHeader>
                <CardBody className="pt-0">
                  <ul className="space-y-2">
                    {swotAnalysis.strengths.map((item, i) => (
                      <li key={i} className="flex items-start gap-2 p-2 bg-white/60 rounded-lg group">
                        <CheckCircle2 className="h-4 w-4 mt-0.5 flex-shrink-0 text-emerald-600" />
                        <span className="flex-1 text-sm text-slate-700">{item.text}</span>
                        <Badge variant="secondary" className="text-xs flex-shrink-0">
                          {item.source === 'auto' ? '🤖' : item.source === 'ai' ? '✨' : '✏️'}
                        </Badge>
                        {item.source === 'manual' && (
                          <button onClick={() => removeItem('strength', i)} className="opacity-0 group-hover:opacity-100 transition-opacity">
                            <XCircle className="h-4 w-4 text-slate-400 hover:text-red-500" />
                          </button>
                        )}
                      </li>
                    ))}
                    {swotAnalysis.strengths.length === 0 && (
                      <p className="text-sm text-slate-400 text-center py-2">Güçlü yön tespit edilmedi</p>
                    )}
                  </ul>
                </CardBody>
              </Card>

              {/* Weaknesses */}
              <Card className={`${COLORS.weakness.bg} ${COLORS.weakness.border} border-2`}>
                <CardHeader className="pb-2">
                  <CardTitle className={`flex items-center justify-between ${COLORS.weakness.text}`}>
                    <span className="flex items-center gap-2">
                      <AlertTriangle className="h-5 w-5" />
                      ⚠️ Zayıf Yönler ({swotAnalysis.weaknesses.length})
                    </span>
                    <Button variant="ghost" size="sm" onClick={() => addManualItem('weakness')}>
                      <Plus className="h-4 w-4" />
                    </Button>
                  </CardTitle>
                </CardHeader>
                <CardBody className="pt-0">
                  <ul className="space-y-2">
                    {swotAnalysis.weaknesses.map((item, i) => (
                      <li key={i} className="flex items-start gap-2 p-2 bg-white/60 rounded-lg group">
                        <XCircle className="h-4 w-4 mt-0.5 flex-shrink-0 text-red-600" />
                        <span className="flex-1 text-sm text-slate-700">{item.text}</span>
                        <Badge variant="secondary" className="text-xs flex-shrink-0">
                          {item.source === 'auto' ? '🤖' : item.source === 'ai' ? '✨' : '✏️'}
                        </Badge>
                        {item.source === 'manual' && (
                          <button onClick={() => removeItem('weakness', i)} className="opacity-0 group-hover:opacity-100 transition-opacity">
                            <XCircle className="h-4 w-4 text-slate-400 hover:text-red-500" />
                          </button>
                        )}
                      </li>
                    ))}
                    {swotAnalysis.weaknesses.length === 0 && (
                      <p className="text-sm text-slate-400 text-center py-2">Zayıf yön tespit edilmedi</p>
                    )}
                  </ul>
                </CardBody>
              </Card>

              {/* Opportunities */}
              <Card className={`${COLORS.opportunity.bg} ${COLORS.opportunity.border} border-2`}>
                <CardHeader className="pb-2">
                  <CardTitle className={`flex items-center justify-between ${COLORS.opportunity.text}`}>
                    <span className="flex items-center gap-2">
                      <Target className="h-5 w-5" />
                      🎯 Fırsatlar ({swotAnalysis.opportunities.length})
                    </span>
                    <Button variant="ghost" size="sm" onClick={() => addManualItem('opportunity')}>
                      <Plus className="h-4 w-4" />
                    </Button>
                  </CardTitle>
                </CardHeader>
                <CardBody className="pt-0">
                  <ul className="space-y-2">
                    {swotAnalysis.opportunities.map((item, i) => (
                      <li key={i} className="flex items-start gap-2 p-2 bg-white/60 rounded-lg group">
                        <ArrowUpRight className="h-4 w-4 mt-0.5 flex-shrink-0 text-blue-600" />
                        <span className="flex-1 text-sm text-slate-700">{item.text}</span>
                        <Badge variant="secondary" className="text-xs flex-shrink-0">
                          {item.source === 'auto' ? '🤖' : item.source === 'ai' ? '✨' : '✏️'}
                        </Badge>
                        {item.source === 'manual' && (
                          <button onClick={() => removeItem('opportunity', i)} className="opacity-0 group-hover:opacity-100 transition-opacity">
                            <XCircle className="h-4 w-4 text-slate-400 hover:text-red-500" />
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                </CardBody>
              </Card>

              {/* Threats */}
              <Card className={`${COLORS.threat.bg} ${COLORS.threat.border} border-2`}>
                <CardHeader className="pb-2">
                  <CardTitle className={`flex items-center justify-between ${COLORS.threat.text}`}>
                    <span className="flex items-center gap-2">
                      <Zap className="h-5 w-5" />
                      🔥 Tehditler ({swotAnalysis.threats.length})
                    </span>
                    <Button variant="ghost" size="sm" onClick={() => addManualItem('threat')}>
                      <Plus className="h-4 w-4" />
                    </Button>
                  </CardTitle>
                </CardHeader>
                <CardBody className="pt-0">
                  <ul className="space-y-2">
                    {swotAnalysis.threats.map((item, i) => (
                      <li key={i} className="flex items-start gap-2 p-2 bg-white/60 rounded-lg group">
                        <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0 text-amber-600" />
                        <span className="flex-1 text-sm text-slate-700">{item.text}</span>
                        <Badge variant="secondary" className="text-xs flex-shrink-0">
                          {item.source === 'auto' ? '🤖' : item.source === 'ai' ? '✨' : '✏️'}
                        </Badge>
                        {item.source === 'manual' && (
                          <button onClick={() => removeItem('threat', i)} className="opacity-0 group-hover:opacity-100 transition-opacity">
                            <XCircle className="h-4 w-4 text-slate-400 hover:text-red-500" />
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                </CardBody>
              </Card>
            </div>

            {/* Manager Notes & Action Items */}
            <div className="grid gap-6 lg:grid-cols-2">
              {/* Manager Notes */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <FileText className="h-4 w-4 text-slate-600" />
                    Yönetici Notları (Manuel)
                  </CardTitle>
                </CardHeader>
                <CardBody>
                  <textarea
                    value={managerNotes}
                    onChange={(e) => setManagerNotes(e.target.value)}
                    placeholder="Bu dönem için kişisel değerlendirme ve notlarınızı buraya yazın..."
                    className="w-full h-40 px-3 py-2 rounded-lg border border-slate-200 text-sm resize-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </CardBody>
              </Card>

              {/* Action Items */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-violet-600" />
                      Aksiyon Planı
                    </span>
                    <Button variant="ghost" size="sm" onClick={addActionItem}>
                      <Plus className="h-4 w-4" /> Ekle
                    </Button>
                  </CardTitle>
                </CardHeader>
                <CardBody>
                  {(actionItems && actionItems.length > 0) ? (
                    <ul className="space-y-2">
                      {actionItems.map((item, i) => (
                        <li key={i} className="flex items-center gap-2 p-2 bg-slate-50 rounded-lg">
                          <select
                            value={item.status}
                            onChange={(e) => updateActionItem(i, 'status', e.target.value)}
                            className={`px-2 py-1 rounded text-xs font-medium border-0 ${
                              item.status === 'done' ? 'bg-emerald-100 text-emerald-700' :
                              item.status === 'in_progress' ? 'bg-blue-100 text-blue-700' :
                              'bg-slate-200 text-slate-700'
                            }`}
                          >
                            <option value="pending">⏳ Bekliyor</option>
                            <option value="in_progress">🔄 Devam</option>
                            <option value="done">✅ Tamam</option>
                          </select>
                          <Input
                            value={item.text}
                            onChange={(e) => updateActionItem(i, 'text', e.target.value)}
                            placeholder="Aksiyon açıklaması..."
                            className="flex-1"
                          />
                          <button onClick={() => setActionItems(actionItems.filter((_, idx) => idx !== i))}>
                            <Trash2 className="h-4 w-4 text-slate-400 hover:text-red-500" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="text-center py-8 text-slate-400">
                      <CheckCircle2 className="h-10 w-10 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">Henüz aksiyon eklenmemiş</p>
                      <p className="text-xs mt-1">Yukarıdaki "Ekle" butonuna tıklayın</p>
                    </div>
                  )}
                </CardBody>
              </Card>
            </div>

            {/* Detailed Metrics */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-slate-600" />
                  Detaylı Performans Metrikleri
                </CardTitle>
              </CardHeader>
              <CardBody>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                  <div className="p-4 bg-gradient-to-br from-emerald-50 to-green-50 rounded-xl border border-emerald-100">
                    <p className="text-xs text-slate-500 mb-1">Satış Hedefi</p>
                    <p className="text-xl font-bold text-slate-800">₺{formatMoney(metrics.sales_target)}</p>
                    <div className="mt-2">
                      <div className="flex justify-between text-xs mb-1">
                        <span>Gerçekleşen</span>
                        <span className="font-medium">₺{formatMoney(metrics.actual_sales)}</span>
                      </div>
                      <ProgressBar 
                        value={Math.min(metrics.sales_ratio * 100, 100)} 
                        className={metrics.sales_ratio >= 1 ? 'bg-emerald-500' : metrics.sales_ratio >= 0.9 ? 'bg-amber-500' : 'bg-red-500'}
                      />
                    </div>
                  </div>

                  <div className="p-4 bg-gradient-to-br from-blue-50 to-cyan-50 rounded-xl border border-blue-100">
                    <p className="text-xs text-slate-500 mb-1">Tahsilat</p>
                    <p className="text-xl font-bold text-slate-800">₺{formatMoney(metrics.collected_amount)}</p>
                    <div className="mt-2">
                      <div className="flex justify-between text-xs mb-1">
                        <span>Fatura Tutarı</span>
                        <span className="font-medium">₺{formatMoney(metrics.invoiced_amount)}</span>
                      </div>
                      <ProgressBar 
                        value={Math.min(metrics.collection_ratio * 100, 100)} 
                        className={metrics.collection_ratio >= 0.9 ? 'bg-blue-500' : metrics.collection_ratio >= 0.7 ? 'bg-amber-500' : 'bg-red-500'}
                      />
                    </div>
                  </div>

                  <div className="p-4 bg-gradient-to-br from-violet-50 to-purple-50 rounded-xl border border-violet-100">
                    <p className="text-xs text-slate-500 mb-1">Fırsatlar</p>
                    <p className="text-xl font-bold text-slate-800">
                      {metrics.won_opportunities}/{metrics.opportunity_count}
                    </p>
                    <div className="mt-2">
                      <div className="flex justify-between text-xs mb-1">
                        <span>Dönüşüm</span>
                        <span className="font-medium">%{(metrics.conversion_rate * 100).toFixed(0)}</span>
                      </div>
                      <ProgressBar 
                        value={Math.min(metrics.conversion_rate * 200, 100)} 
                        className="bg-violet-500"
                      />
                    </div>
                  </div>

                  <div className="p-4 bg-gradient-to-br from-amber-50 to-orange-50 rounded-xl border border-amber-100">
                    <p className="text-xs text-slate-500 mb-1">Aktivite</p>
                    <p className="text-xl font-bold text-slate-800">{metrics.activity_count}</p>
                    <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                      <div className="bg-white/50 rounded p-1 text-center">
                        <span className="font-medium">{metrics.visit_count}</span>
                        <span className="text-slate-400 ml-1">ziyaret</span>
                      </div>
                      <div className="bg-white/50 rounded p-1 text-center">
                        <span className="font-medium">{metrics.customer_count}</span>
                        <span className="text-slate-400 ml-1">müşteri</span>
                      </div>
                    </div>
                  </div>
                </div>
              </CardBody>
            </Card>

            {/* Save Button */}
            <div className="flex justify-end gap-3">
              <Button variant="secondary">
                <Download className="h-4 w-4" /> PDF Rapor İndir
              </Button>
              <Button>
                <Save className="h-4 w-4" /> Analizi Kaydet
              </Button>
            </div>
          </div>
        ) : (
          <EmptyState
            icon={<Layers className="h-16 w-16" />}
            title="SWOT Analizi"
            description="Hibrit performans analizi oluşturmak için bir satış temsilcisi seçin"
          />
        )}
      </div>

      {/* Manual Item Modal */}
      <Modal
        isOpen={manualItemModalOpen}
        onClose={() => { setManualItemModalOpen(false); setEditingItem(null); }}
        title={`Yeni ${
          editingItem?.category === 'strength' ? '💪 Güçlü Yön' :
          editingItem?.category === 'weakness' ? '⚠️ Zayıf Yön' :
          editingItem?.category === 'opportunity' ? '🎯 Fırsat' : '🔥 Tehdit'
        } Ekle`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setManualItemModalOpen(false)}>İptal</Button>
            <Button onClick={saveManualItem}><Plus className="h-4 w-4" /> Ekle</Button>
          </>
        }
      >
        {editingItem && (
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Açıklama</label>
            <textarea
              value={editingItem.text}
              onChange={(e) => setEditingItem({ ...editingItem, text: e.target.value })}
              placeholder="Kendi gözlem ve değerlendirmenizi yazın..."
              className="w-full h-28 px-3 py-2 rounded-lg border border-slate-200 text-sm resize-none focus:ring-2 focus:ring-indigo-500"
            />
            <p className="text-xs text-slate-400 mt-2">
              Bu öğe "✏️ Manuel" olarak işaretlenecektir
            </p>
          </div>
        )}
      </Modal>
    </div>
  );
}
