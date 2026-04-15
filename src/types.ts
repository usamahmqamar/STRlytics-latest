/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Apartment {
  apartment_id: string;
  name: string;
  nickname: string;
  building: string;
  address: string;
  specification: 'Studio' | '1BR' | '2BR' | '3BR' | '4BR' | 'Penthouse' | 'Villa';
  measurement_sqft: number;
  start_operation_date: string;
  annual_rent_aed: number;
  monthly_rent_aed: number;
  num_cheques: number;
  rent_cheques: RentCheque[];
  utilities_monthly_defaults: {
    dewa_electricity_aed: number;
    internet_aed: number;
    dewa_electricity_native?: number;
    internet_native?: number;
  };
  setup_costs: SetupCost[];
  currency: string;
  platform_settings?: PropertyPlatformSetting[];
}

export interface RentCheque {
  cheque_id: string;
  cheque_number?: string;
  due_date: string;
  amount_aed: number;
  amount_native?: number;
  status: 'due' | 'paid' | 'postponed' | 'bounced';
}

export interface SetupCost {
  item_id: string;
  date: string;
  category: 'Furnishing' | 'Licensing' | 'Ejari' | 'Repairs' | 'Transport' | 'AC' | 'Insurance' | 'Miscellaneous' | 'Deposit';
  description: string;
  amount_aed: number;
  is_refundable: boolean;
  payment_method: string;
  vendor: string;
}

export interface PropertyPlatformSetting {
  platform_id: string;
  commission_percent: number;
  payment_charge_percent: number;
}

export interface Reservation {
  reservation_code: string;
  apartment_id: string;
  platform_id: string;
  channel: string;
  guest_name: string;
  check_in: string;
  check_in_time?: string;
  check_out: string;
  check_out_time?: string;
  num_guests: number;
  nights: number;
  total_booking_revenue_aed: number;
  net_payout_aed: number;
  payout_date?: string;
  cleaning_cost_aed: number;
  status: 'confirmed' | 'cancelled';
  cancellation_policy: 'non-refundable' | 'refundable' | '14-day-flexible' | '7-day-flexible';
  booking_date: string;
  non_refundable_date?: string;
  rating?: number;
  notes?: string;
  damages_incurred?: string;
  other_booking_costs?: {
    description: string;
    amount_aed: number;
    date?: string;
  }[];
}

export interface Platform {
  platform_id: string;
  name: string;
  commission_percent: number;
  payment_charge_percent?: number;
  vat_percent: number;
  other_charges_percent: number;
  payout_timing: 'before_checkin' | 'after_checkin' | 'after_checkout' | 'next_specific_day';
  payout_day_of_week?: number; // 0-6 for Sunday-Saturday
  payout_days_offset: number;
  processing_days: number;
}

export interface Vendor {
  vendor_id: string;
  name: string;
  service_type: string;
  phone?: string;
  email?: string;
  status: 'active' | 'inactive';
}

export interface ServiceRecord {
  record_id: string;
  date: string;
  apartment_id: string;
  service_type: string;
  vendor_id: string;
  description: string;
  quantity: number;
  unit_cost: number;
  total_cost: number;
  status: 'unbilled' | 'billed' | 'paid';
  invoice_id?: string;
}

export interface Invoice {
  invoice_id: string;
  vendor_id: string;
  record_ids: string[];
  total_amount: number;
  date: string;
  status: 'pending' | 'paid' | 'partial';
}

export interface Payment {
  payment_id: string;
  date: string;
  vendor_id: string;
  amount_paid: number;
  type: 'advance' | 'invoice_payment' | 'partial_payment';
  invoice_id?: string;
  notes?: string;
}

export interface DailyExpense {
  expense_id: string;
  apartment_id: string; // "PORTFOLIO" for shared
  date: string;
  category: string;
  amount_aed: number;
  notes?: string;
}

export interface MonthlyBill {
  bill_id: string;
  apartment_id: string;
  month: string; // YYYY-MM
  bill_type: 'electricity' | 'internet' | 'water' | 'gas' | 'other';
  amount_aed: number;
  status: 'pending' | 'paid';
  paid_date?: string;
}

export interface BankReconciliation {
  reconciliation_id: string;
  date: string;
  actual_balance: number;
  notes?: string;
}

export interface Asset {
  asset_id: string;
  apartment_id: string;
  name: string;
  category: string;
  purchase_date: string;
  warranty_expiry?: string;
  condition: 'new' | 'good' | 'fair' | 'poor';
  last_serviced_date?: string;
  next_service_due?: string;
  cost_aed: number;
  notes?: string;
}

export interface Document {
  doc_id: string;
  apartment_id: string;
  title: string;
  type: string;
  expiry_date?: string;
  file_url?: string;
  status: 'active' | 'expired' | 'pending_renewal';
}

export interface MaintenanceTask {
  task_id: string;
  apartment_id: string;
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  created_at: string;
  due_date?: string;
  vendor_id?: string;
  cost_estimate?: number;
  actual_cost?: number;
}

export interface CommunicationTemplate {
  template_id: string;
  name: string;
  subject: string;
  content: string;
  category: 'check_in' | 'check_out' | 'house_rules' | 'wifi' | 'other';
}

export interface UserData {
  apartments: Apartment[];
  reservations: Reservation[];
  monthlyBills: MonthlyBill[];
  dailyExpenses: DailyExpense[];
  platforms: Platform[];
  vendors: Vendor[];
  serviceRecords: ServiceRecord[];
  invoices: Invoice[];
  payments: Payment[];
  bankReconciliations: BankReconciliation[];
  assets: Asset[];
  documents: Document[];
  maintenanceTasks?: MaintenanceTask[];
  communicationTemplates?: CommunicationTemplate[];
  customDocumentTypes: string[];
  companyProfile: {
    name: string;
    logo_url?: string;
    email?: string;
    phone?: string;
    location?: string;
    website?: string;
    tax_id?: string;
    description?: string;
  };
  subscription: {
    plan: string;
    monthly_payment_aed: number;
    next_charge_date: string;
    card_details: {
      last4: string;
      brand: string;
      expiry: string;
    };
    status: string;
  };
  paymentHistory: {
    payment_id: string;
    date: string;
    amount_aed: number;
    plan: string;
    status: string;
  }[];
  dashboardWidgets: {
    id: string;
    title: string;
    category: string;
    visible: boolean;
    colSpan: number;
  }[];
  displaySettings?: {
    fontSize: 'sm' | 'md' | 'lg' | 'xl';
    theme: 'light' | 'dark';
  };
}
