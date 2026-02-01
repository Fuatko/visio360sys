export interface SalesPerson {
  id: string;
  name: string;
  email: string;
  phone?: string;
  title?: string;
  region?: string;
  avatar: string;
  start_date?: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface Customer {
  id: string;
  name: string;
  contact_person?: string;
  email?: string;
  phone?: string;
  address?: string;
  sector?: string;
  size?: string;
  status: string;
  assigned_to?: string;
  total_sales: number;
  notes?: string;
  created_at: string;
  updated_at: string;
  // Joined
  sales_person?: SalesPerson;
}

export interface Opportunity {
  id: string;
  title: string;
  customer_id?: string;
  assigned_to?: string;
  value: number;
  probability: number;
  stage: string;
  expected_close?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
  // Joined
  customer?: Customer;
  sales_person?: SalesPerson;
}

export interface Collection {
  id: string;
  customer_id?: string;
  sales_person_id?: string;
  amount: number;
  date: string;
  method: string;
  invoice_no?: string;
  notes?: string;
  created_at: string;
  // Joined
  customer?: Customer;
  sales_person?: SalesPerson;
}

export interface Target {
  id: string;
  sales_person_id: string;
  period: string;
  sales_target: number;
  collection_target: number;
  unit_target: number;
  new_customer_target: number;
  achieved_sales: number;
  achieved_collection: number;
  achieved_units: number;
  achieved_new_customers: number;
  created_at: string;
  updated_at: string;
  // Joined
  sales_person?: SalesPerson;
}

export interface BonusTier {
  id: string;
  min_rate: number;
  max_rate: number;
  bonus_rate: number;
  description?: string;
  created_at: string;
}

export interface FixedBonus {
  id: string;
  key: string;
  value: number;
  description?: string;
  updated_at: string;
}

export interface CRMActivity {
  id: string;
  customer_id?: string;
  user_id?: string;
  type: 'call' | 'email' | 'meeting' | 'note';
  title: string;
  description?: string;
  date: string;
  created_at: string;
  // Joined
  customer?: Customer;
  sales_person?: SalesPerson;
}

export interface CRMTask {
  id: string;
  customer_id?: string;
  user_id?: string;
  title: string;
  description?: string;
  due_date?: string;
  priority: 'low' | 'medium' | 'high';
  status: 'pending' | 'done';
  created_at: string;
  updated_at: string;
  // Joined
  customer?: Customer;
  sales_person?: SalesPerson;
}

export interface CRMNote {
  id: string;
  customer_id?: string;
  user_id?: string;
  content: string;
  date: string;
  created_at: string;
  // Joined
  customer?: Customer;
  sales_person?: SalesPerson;
}

export interface SWOTAnalysis {
  id: string;
  sales_person_id: string;
  date: string;
  overall_score: number;
  strengths: string[];
  weaknesses: string[];
  opportunities: string[];
  threats: string[];
  created_at: string;
  updated_at: string;
  // Joined
  sales_person?: SalesPerson;
}

export interface BonusCalculation {
  total: number;
  salesBonus: number;
  collectionBonus: number;
  fixedBonus: number;
  details: {
    salesRate: number;
    salesTier: number;
    collectionRate: number;
    collectionTier: number;
    newCustomers: number;
  };
}

// Dashboard Stats
export interface DashboardStats {
  totalSales: number;
  totalCollection: number;
  pipelineValue: number;
  totalBonus: number;
  customerCount: number;
  opportunityCount: number;
  pendingTasks: number;
  teamCount: number;
}
