'use client';

import Header from '@/components/Header';
import { Card, Badge } from '@/components/ui';
import { formatMoney } from '@/lib/utils';
import {
  Trophy, Medal, Star, Crown, TrendingUp, TrendingDown, Target,
  Award, Flame, Zap, Users, Calendar, ChevronUp, ChevronDown
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase';

// ============ TYPES ============
interface LeaderboardEntry {
  rank: number;
  previousRank: number;
  personId: string;
  personName: string;
  department: string;
  region: string;
  photoUrl?: string;
  totalSales: number;
  targetAchievement: number;
  collectionRate: number;
  wonOpportunities: number;
  points: number;
  streak: number;
  badges: string[];
}

// ============ BADGE COMPONENT ============
function AchievementBadge({ type }: { type: string }) {
  const badges: Record<string, { icon: React.ReactNode; color: string; label: string }> = {
    'top_seller': { icon: <Crown className="h-4 w-4" />, color: 'bg-amber-100 text-amber-700', label: 'Satış Lideri' },
    'collector': { icon: <Zap className="h-4 w-4" />, color: 'bg-green-100 text-green-700', label: 'Tahsilat Şampiyonu' },
    'streak_5': { icon: <Flame className="h-4 w-4" />, color: 'bg-orange-100 text-orange-700', label: '5 Ay Seri' },
    'overachiever': { icon: <Star className="h-4 w-4" />, color: 'bg-purple-100 text-purple-700', label: 'Hedef Aşıcı' },
    'closer': { icon: <Target className="h-4 w-4" />, color: 'bg-blue-100 text-blue-700', label: 'Fırsat Kapatıcı' }
  };

  const badge = badges[type];
  if (!badge) return null;

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs ${badge.color}`} title={badge.label}>
      {badge.icon}
    </span>
  );
}

// ============ RANK CHANGE INDICATOR ============
function RankChange({ current, previous }: { current: number; previous: number }) {
  const diff = previous - current;
  
  if (diff === 0) {
    return <span className="text-slate-400">—</span>;
  }
  
  if (diff > 0) {
    return (
      <span className="flex items-center text-green-600 text-xs font-medium">
        <ChevronUp className="h-4 w-4" />
        {diff}
      </span>
    );
  }
  
  return (
    <span className="flex items-center text-red-600 text-xs font-medium">
      <ChevronDown className="h-4 w-4" />
      {Math.abs(diff)}
    </span>
  );
}

// ============ PODIUM COMPONENT ============
function Podium({ top3 }: { top3: LeaderboardEntry[] }) {
  const getRankStyle = (rank: number) => {
    switch (rank) {
      case 1: return 'bg-gradient-to-br from-amber-400 to-amber-600 h-32';
      case 2: return 'bg-gradient-to-br from-slate-300 to-slate-500 h-24';
      case 3: return 'bg-gradient-to-br from-amber-600 to-amber-800 h-20';
      default: return 'bg-slate-200 h-16';
    }
  };

  const getMedalIcon = (rank: number) => {
    switch (rank) {
      case 1: return <Crown className="h-8 w-8 text-amber-400" />;
      case 2: return <Medal className="h-7 w-7 text-slate-300" />;
      case 3: return <Medal className="h-6 w-6 text-amber-600" />;
      default: return null;
    }
  };

  // Reorder for podium display: 2nd, 1st, 3rd
  const podiumOrder = [top3[1], top3[0], top3[2]].filter(Boolean);

  return (
    <div className="flex items-end justify-center gap-4 py-8">
      {podiumOrder.map((entry, idx) => {
        const actualRank = idx === 0 ? 2 : idx === 1 ? 1 : 3;
        return (
          <div key={entry?.personId || idx} className="flex flex-col items-center">
            {entry && (
              <>
                <div className="mb-2">
                  {getMedalIcon(actualRank)}
                </div>
                <div className="h-16 w-16 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-xl font-bold mb-2">
                  {entry.personName.charAt(0)}
                </div>
                <p className="text-sm font-semibold text-slate-900 text-center">{entry.personName}</p>
                <p className="text-xs text-slate-500">{entry.region}</p>
                <p className="text-lg font-bold text-indigo-600 mt-1">{entry.points} puan</p>
              </>
            )}
            <div className={`w-24 rounded-t-lg flex items-center justify-center text-white font-bold text-2xl mt-4 ${getRankStyle(actualRank)}`}>
              {actualRank}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ============ MAIN COMPONENT ============
export default function LeaderboardPage() {
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<'month' | 'quarter' | 'year'>('month');
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [myRank, setMyRank] = useState<LeaderboardEntry | null>(null);

  const supabase = createClient();

  useEffect(() => {
    fetchLeaderboard();
  }, [period]);

  const fetchLeaderboard = async () => {
    setLoading(true);
    try {
      const [teamRes, targetsRes, collectionsRes, opportunitiesRes] = await Promise.all([
        supabase.from('sales_team').select('*').eq('is_active', true),
        supabase.from('targets').select('*'),
        supabase.from('collections').select('*'),
        supabase.from('opportunities').select('*')
      ]);

      const team = teamRes.data || [];
      const targets = targetsRes.data || [];
      const collections = collectionsRes.data || [];
      const opportunities = opportunitiesRes.data || [];

      // Calculate points for each team member
      const entries: LeaderboardEntry[] = team.map((person, index) => {
        const personTargets = targets.filter(t => t.sales_person_id === person.id);
        const personCollections = collections.filter(c => c.sales_person_id === person.id);
        const personOpportunities = opportunities.filter(o => o.assigned_to === person.id);

        const totalSales = personTargets.reduce((sum, t) => sum + (t.actual_sales || 0), 0);
        const targetAmount = personTargets.reduce((sum, t) => sum + (t.target_amount || 0), 0);
        const targetAchievement = targetAmount > 0 ? (totalSales / targetAmount) * 100 : 0;

        const totalReceivable = personCollections.reduce((sum, c) => sum + (c.amount || 0), 0);
        const collected = personCollections.filter(c => c.status === 'Ödendi').reduce((sum, c) => sum + (c.amount || 0), 0);
        const collectionRate = totalReceivable > 0 ? (collected / totalReceivable) * 100 : 100;

        const wonOpportunities = personOpportunities.filter(o => o.stage === 'Kazanıldı').length;

        // Calculate points
        let points = 0;
        points += Math.round(totalSales / 1000); // 1 point per 1000 TL
        points += Math.round(targetAchievement * 2); // 2x target achievement
        points += Math.round(collectionRate); // collection rate as points
        points += wonOpportunities * 50; // 50 points per won opportunity

        // Calculate badges
        const badges: string[] = [];
        if (targetAchievement >= 120) badges.push('overachiever');
        if (collectionRate >= 95) badges.push('collector');
        if (wonOpportunities >= 5) badges.push('closer');

        // Simulate streak (in real app, this would be calculated from historical data)
        const streak = Math.floor(Math.random() * 6);
        if (streak >= 5) badges.push('streak_5');

        return {
          rank: 0,
          previousRank: Math.floor(Math.random() * team.length) + 1, // Simulated
          personId: person.id,
          personName: person.name,
          department: person.department || 'Satış',
          region: person.region || '-',
          photoUrl: person.photo_url,
          totalSales,
          targetAchievement,
          collectionRate,
          wonOpportunities,
          points,
          streak,
          badges
        };
      });

      // Sort by points and assign ranks
      entries.sort((a, b) => b.points - a.points);
      entries.forEach((entry, index) => {
        entry.rank = index + 1;
        if (entry.rank === 1) entry.badges.push('top_seller');
      });

      setLeaderboard(entries);
    } catch (error) {
      console.error('Error fetching leaderboard:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div>
        <Header title="Liderlik Tablosu" subtitle="Satış Yarışması" />
        <div className="flex h-96 items-center justify-center">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-amber-500 border-t-transparent" />
        </div>
      </div>
    );
  }

  const top3 = leaderboard.slice(0, 3);
  const rest = leaderboard.slice(3);

  return (
    <div>
      <Header title="Liderlik Tablosu" subtitle="Satış Şampiyonları" />
      
      <div className="p-6 space-y-6">
        {/* Period Selector */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Trophy className="h-6 w-6 text-amber-500" />
            <h2 className="text-xl font-bold text-slate-900">Satış Yarışması</h2>
          </div>
          <div className="flex gap-2">
            {[
              { key: 'month', label: 'Bu Ay' },
              { key: 'quarter', label: 'Bu Çeyrek' },
              { key: 'year', label: 'Bu Yıl' }
            ].map(p => (
              <button
                key={p.key}
                onClick={() => setPeriod(p.key as any)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  period === p.key
                    ? 'bg-amber-500 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Podium */}
        <Card className="p-6 bg-gradient-to-br from-slate-50 to-slate-100">
          <Podium top3={top3} />
        </Card>

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card className="p-4 text-center">
            <Trophy className="h-8 w-8 mx-auto text-amber-500 mb-2" />
            <p className="text-2xl font-bold text-slate-900">{leaderboard.length}</p>
            <p className="text-sm text-slate-500">Toplam Yarışmacı</p>
          </Card>
          <Card className="p-4 text-center">
            <Target className="h-8 w-8 mx-auto text-blue-500 mb-2" />
            <p className="text-2xl font-bold text-slate-900">
              %{(leaderboard.reduce((sum, e) => sum + e.targetAchievement, 0) / leaderboard.length || 0).toFixed(0)}
            </p>
            <p className="text-sm text-slate-500">Ortalama Hedef</p>
          </Card>
          <Card className="p-4 text-center">
            <Zap className="h-8 w-8 mx-auto text-green-500 mb-2" />
            <p className="text-2xl font-bold text-slate-900">
              %{(leaderboard.reduce((sum, e) => sum + e.collectionRate, 0) / leaderboard.length || 0).toFixed(0)}
            </p>
            <p className="text-sm text-slate-500">Ortalama Tahsilat</p>
          </Card>
          <Card className="p-4 text-center">
            <Award className="h-8 w-8 mx-auto text-purple-500 mb-2" />
            <p className="text-2xl font-bold text-slate-900">
              {leaderboard.reduce((sum, e) => sum + e.badges.length, 0)}
            </p>
            <p className="text-sm text-slate-500">Toplam Rozet</p>
          </Card>
        </div>

        {/* Full Leaderboard */}
        <Card className="p-6">
          <h3 className="font-semibold text-slate-900 mb-4">Tam Sıralama</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-slate-50">
                  <th className="px-4 py-3 text-center font-medium w-16">Sıra</th>
                  <th className="px-4 py-3 text-center font-medium w-16">Değişim</th>
                  <th className="px-4 py-3 text-left font-medium">Temsilci</th>
                  <th className="px-4 py-3 text-left font-medium">Bölge</th>
                  <th className="px-4 py-3 text-right font-medium">Satış</th>
                  <th className="px-4 py-3 text-center font-medium">Hedef %</th>
                  <th className="px-4 py-3 text-center font-medium">Tahsilat %</th>
                  <th className="px-4 py-3 text-center font-medium">Rozetler</th>
                  <th className="px-4 py-3 text-right font-medium">Puan</th>
                </tr>
              </thead>
              <tbody>
                {leaderboard.map((entry) => (
                  <tr key={entry.personId} className={`border-b hover:bg-slate-50 ${entry.rank <= 3 ? 'bg-amber-50' : ''}`}>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex items-center justify-center h-8 w-8 rounded-full font-bold ${
                        entry.rank === 1 ? 'bg-amber-500 text-white' :
                        entry.rank === 2 ? 'bg-slate-400 text-white' :
                        entry.rank === 3 ? 'bg-amber-700 text-white' :
                        'bg-slate-100 text-slate-600'
                      }`}>
                        {entry.rank}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <RankChange current={entry.rank} previous={entry.previousRank} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold">
                          {entry.personName.charAt(0)}
                        </div>
                        <div>
                          <p className="font-medium text-slate-900">{entry.personName}</p>
                          <p className="text-xs text-slate-500">{entry.department}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-500">{entry.region}</td>
                    <td className="px-4 py-3 text-right font-bold text-blue-600">
                      ₺{formatMoney(entry.totalSales)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        entry.targetAchievement >= 100 ? 'bg-green-100 text-green-700' :
                        entry.targetAchievement >= 80 ? 'bg-amber-100 text-amber-700' :
                        'bg-red-100 text-red-700'
                      }`}>
                        %{entry.targetAchievement.toFixed(0)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        entry.collectionRate >= 85 ? 'bg-green-100 text-green-700' :
                        entry.collectionRate >= 70 ? 'bg-amber-100 text-amber-700' :
                        'bg-red-100 text-red-700'
                      }`}>
                        %{entry.collectionRate.toFixed(0)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1 justify-center">
                        {entry.badges.map((badge, idx) => (
                          <AchievementBadge key={idx} type={badge} />
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="font-bold text-indigo-600">{entry.points}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}
