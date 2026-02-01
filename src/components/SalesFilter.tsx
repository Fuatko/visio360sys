'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase';
import { Filter, Users, MapPin, Building2 } from 'lucide-react';

interface SalesPerson {
  id: string;
  name: string;
  region: string;
  department?: string;
}

interface SalesFilterProps {
  onFilterChange: (filters: { region: string; department: string; repId: string }) => void;
  showDepartment?: boolean;
}

export default function SalesFilter({ onFilterChange, showDepartment = true }: SalesFilterProps) {
  const [salesTeam, setSalesTeam] = useState<SalesPerson[]>([]);
  const [departments, setDepartments] = useState<string[]>([]);
  const [regions, setRegions] = useState<string[]>([]);
  const [selectedDepartment, setSelectedDepartment] = useState<string>('');
  const [selectedRegion, setSelectedRegion] = useState<string>('');
  const [selectedPerson, setSelectedPerson] = useState<string>('');
  const supabase = createClient();

  useEffect(() => {
    loadSalesTeam();
  }, []);

  const loadSalesTeam = async () => {
    const { data } = await supabase
      .from('sales_team')
      .select('id, name, region, department')
      .eq('is_active', true)
      .order('name');
    
    if (data) {
      setSalesTeam(data);
      const uniqueDepartments = [...new Set(data.map(p => p.department).filter(Boolean))];
      const uniqueRegions = [...new Set(data.map(p => p.region).filter(Boolean))];
      setDepartments(uniqueDepartments);
      setRegions(uniqueRegions);
    }
  };

  const handleDepartmentChange = (department: string) => {
    setSelectedDepartment(department);
    setSelectedRegion('');
    setSelectedPerson('');
    onFilterChange({ region: '', department, repId: '' });
  };

  const handleRegionChange = (region: string) => {
    setSelectedRegion(region);
    setSelectedPerson('');
    onFilterChange({ region, department: selectedDepartment, repId: '' });
  };

  const handlePersonChange = (repId: string) => {
    setSelectedPerson(repId);
    onFilterChange({ region: selectedRegion, department: selectedDepartment, repId });
  };

  // Departmana göre filtrelenmiş bölgeler
  const filteredRegions = selectedDepartment
    ? [...new Set(salesTeam.filter(p => p.department === selectedDepartment).map(p => p.region).filter(Boolean))]
    : regions;

  // Bölgeye göre filtrelenmiş kişiler
  const filteredPeople = salesTeam.filter(p => {
    const matchDept = !selectedDepartment || p.department === selectedDepartment;
    const matchRegion = !selectedRegion || p.region === selectedRegion;
    return matchDept && matchRegion;
  });

  const clearFilters = () => {
    setSelectedDepartment('');
    setSelectedRegion('');
    setSelectedPerson('');
    onFilterChange({ region: '', department: '', repId: '' });
  };

  const hasFilters = selectedDepartment || selectedRegion || selectedPerson;

  return (
    <div className="flex flex-wrap items-center gap-3 p-4 bg-gradient-to-r from-slate-50 to-white rounded-xl border border-slate-200 shadow-sm mb-6">
      <div className="flex items-center gap-2 text-slate-600">
        <Filter className="h-4 w-4" />
        <span className="text-sm font-semibold">Filtrele:</span>
      </div>

      {/* Birim Filtresi */}
      {showDepartment && departments.length > 0 && (
        <div className="flex flex-col">
          <label className="text-xs text-slate-500 mb-1 ml-1">Birim</label>
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-blue-500" />
            <select
              value={selectedDepartment}
              onChange={(e) => handleDepartmentChange(e.target.value)}
              className="h-9 px-3 pr-8 rounded-lg border border-slate-200 bg-white text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 cursor-pointer min-w-[140px]"
            >
              <option value="">Tüm Birimler</option>
              {departments.map(dept => (
                <option key={dept} value={dept}>{dept}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* Bölge Filtresi */}
      <div className="flex flex-col">
        <label className="text-xs text-slate-500 mb-1 ml-1">Bölge</label>
        <div className="flex items-center gap-2">
          <MapPin className="h-4 w-4 text-green-500" />
          <select
            value={selectedRegion}
            onChange={(e) => handleRegionChange(e.target.value)}
            className="h-9 px-3 pr-8 rounded-lg border border-slate-200 bg-white text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 cursor-pointer min-w-[140px]"
          >
            <option value="">Tüm Bölgeler</option>
            {filteredRegions.map(region => (
              <option key={region} value={region}>{region}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Satış Uzmanı Filtresi */}
      <div className="flex flex-col">
        <label className="text-xs text-slate-500 mb-1 ml-1">Satış Uzmanı</label>
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-purple-500" />
          <select
            value={selectedPerson}
            onChange={(e) => handlePersonChange(e.target.value)}
            className="h-9 px-3 pr-8 rounded-lg border border-slate-200 bg-white text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 cursor-pointer min-w-[160px]"
          >
            <option value="">Tüm Uzmanlar</option>
            {filteredPeople.map(person => (
              <option key={person.id} value={person.id}>{person.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Temizle Butonu */}
      {hasFilters && (
        <div className="flex flex-col">
          <label className="text-xs text-transparent mb-1">.</label>
          <button
            onClick={clearFilters}
            className="h-9 px-4 text-sm text-white bg-red-500 hover:bg-red-600 rounded-lg transition-colors flex items-center gap-1"
          >
            ✕ Temizle
          </button>
        </div>
      )}

      {/* Seçili Filtre Özeti */}
      {hasFilters && (
        <div className="w-full mt-2 pt-2 border-t border-slate-200">
          <p className="text-xs text-slate-500">
            <span className="font-medium">Aktif Filtre:</span>
            {selectedDepartment && <span className="ml-2 px-2 py-0.5 bg-blue-100 text-blue-700 rounded">{selectedDepartment}</span>}
            {selectedRegion && <span className="ml-2 px-2 py-0.5 bg-green-100 text-green-700 rounded">{selectedRegion}</span>}
            {selectedPerson && <span className="ml-2 px-2 py-0.5 bg-purple-100 text-purple-700 rounded">{filteredPeople.find(p => p.id === selectedPerson)?.name}</span>}
          </p>
        </div>
      )}
    </div>
  );
}
