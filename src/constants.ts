/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { UserData } from './types';

export const DEFAULT_USER_DATA: UserData = {
  apartments: [
    {
      apartment_id: "apt-1",
      name: "Bay Central 605",
      nickname: "BC605",
      building: "Bay Central",
      address: "Dubai Marina",
      specification: "1BR",
      measurement_sqft: 850,
      start_operation_date: "2026-01-01",
      annual_rent_aed: 144000,
      monthly_rent_aed: 12000,
      num_cheques: 4,
      rent_cheques: [
        { cheque_id: "chq-1", due_date: "2026-01-01", amount_aed: 36000, status: "paid" },
        { cheque_id: "chq-2", due_date: "2026-04-01", amount_aed: 36000, status: "due" }
      ],
      utilities_monthly_defaults: {
        dewa_electricity_aed: 800,
        internet_aed: 400
      },
      currency: "AED",
      setup_costs: [
        {
          item_id: "s-1",
          date: "2025-12-15",
          category: "Furnishing",
          description: "Living room set",
          amount_aed: 15000,
          is_refundable: false,
          payment_method: "bank",
          vendor: "IKEA"
        }
      ]
    }
  ],
  reservations: [
    {
      reservation_code: "SDFFDS",
      apartment_id: "apt-1",
      platform_id: "airbnb",
      channel: "Airbnb",
      guest_name: "SDFFDS Reservation",
      check_in: "2026-04-12",
      check_out: "2026-04-16",
      num_guests: 2,
      nights: 4,
      total_booking_revenue_aed: 5000,
      net_payout_aed: 4850,
      cleaning_cost_aed: 250,
      status: "confirmed",
      cancellation_policy: "non-refundable",
      booking_date: "2026-03-20"
    },
    {
      reservation_code: "RES-102",
      apartment_id: "apt-1",
      platform_id: "booking",
      channel: "Booking.com",
      guest_name: "Sarah Jones",
      check_in: "2026-04-18",
      check_out: "2026-04-22",
      num_guests: 3,
      nights: 4,
      total_booking_revenue_aed: 4500,
      net_payout_aed: 3825,
      cleaning_cost_aed: 250,
      status: "confirmed",
      cancellation_policy: "7-day-flexible",
      booking_date: "2026-04-01"
    }
  ],
  monthlyBills: [],
  dailyExpenses: [],
  platforms: [
    {
      platform_id: "airbnb",
      name: "Airbnb",
      commission_percent: 3,
      vat_percent: 5,
      other_charges_percent: 0,
      payout_timing: "after_checkin",
      payout_days_offset: 1,
      processing_days: 0
    },
    {
      platform_id: "booking",
      name: "Booking.com",
      commission_percent: 15,
      vat_percent: 5,
      other_charges_percent: 0,
      payout_timing: "next_specific_day",
      payout_day_of_week: 4, // Thursday
      payout_days_offset: 0,
      processing_days: 0
    },
    {
      platform_id: "stripe",
      name: "Direct - Stripe",
      commission_percent: 0,
      payment_charge_percent: 2.9,
      vat_percent: 0,
      other_charges_percent: 0,
      payout_timing: "after_checkout",
      payout_days_offset: 2,
      processing_days: 0
    },
    {
      platform_id: "paypal",
      name: "Direct - PayPal",
      commission_percent: 0,
      payment_charge_percent: 3.4,
      vat_percent: 0,
      other_charges_percent: 0,
      payout_timing: "after_checkout",
      payout_days_offset: 1,
      processing_days: 0
    }
  ],
  vendors: [
    {
      vendor_id: "v-1",
      name: "Clean & Shine",
      service_type: "cleaning",
      status: "active"
    }
  ],
  serviceRecords: [
    {
      record_id: "sr-1",
      date: "2026-03-28",
      apartment_id: "apt-1",
      service_type: "Deep Cleaning",
      vendor_id: "v-1",
      description: "Post-stay deep cleaning",
      quantity: 1,
      unit_cost: 350,
      total_cost: 350,
      status: "unbilled"
    }
  ],
  invoices: [],
  payments: [],
  bankReconciliations: [],
  assets: [],
  documents: [],
  customDocumentTypes: [],
  companyProfile: {
    name: "Luxe Stays Dubai",
    email: "contact@luxestays.ae",
    description: "Premium short-term rental management in Dubai's most iconic locations."
  },
  subscription: {
    plan: "pro",
    monthly_payment_aed: 499,
    next_charge_date: "2026-03-29",
    card_details: {
      last4: "4242",
      brand: "Visa",
      expiry: "12/28"
    },
    status: "active"
  },
  paymentHistory: [],
  dashboardWidgets: [
    { id: 'financial-health', title: 'Financial Health & P&L', category: 'financial', visible: true, colSpan: 12 },
    { id: 'task-reminders', title: 'Urgent Tasks', category: 'urgent_reminders', visible: true, colSpan: 12 },
    { id: 'reminders', title: 'Action Reminders', category: 'urgent_reminders', visible: true, colSpan: 6 },
    { id: 'risk-assessment', title: 'Risk Assessment', category: 'urgent_reminders', visible: true, colSpan: 6 },
    { id: 'kpi-stats', title: 'Key Performance Indicators', category: 'financial', visible: true, colSpan: 12 },
    { id: 'cancellation-policy', title: 'Cancellation Policy Exposure', category: 'financial', visible: true, colSpan: 8 },
    { id: 'revenue-trend', title: 'Revenue & Profit Trend', category: 'financial', visible: true, colSpan: 6 },
    { id: 'expense-breakdown', title: 'Expense Breakdown', category: 'financial', visible: true, colSpan: 6 },
    { id: 'cheque-management', title: 'Cheque Management & Coverage', category: 'operations', visible: true, colSpan: 12 },
    { id: 'apartment-performance', title: 'Apartment Performance', category: 'portfolio', visible: true, colSpan: 8 },
    { id: 'kpi-summary', title: 'Monthly KPI Summary', category: 'portfolio', visible: true, colSpan: 12 },
    { id: 'strategic-goals', title: 'Strategic Goals', category: 'portfolio', visible: true, colSpan: 4 },
    { id: 'occupancy-rate', title: 'Occupancy Rate Trend', category: 'analytics', visible: true, colSpan: 6 },
    { id: 'revenue-channel', title: 'Revenue by Channel', category: 'analytics', visible: true, colSpan: 6 },
    { id: 'revenue-forecast', title: 'Revenue Forecast (3-Month)', category: 'analytics', visible: true, colSpan: 8 },
    { id: 'market-benchmark', title: 'Market Benchmarking', category: 'analytics', visible: true, colSpan: 4 },
    { id: 'lead-time', title: 'Booking Lead Time', category: 'analytics', visible: true, colSpan: 4 },
    { id: 'adr-by-property', title: 'ADR by Property', category: 'analytics', visible: true, colSpan: 12 },
    { id: 'opportunity-score', title: 'Opportunity Score', category: 'analytics', visible: true, colSpan: 4 }
  ],
  displaySettings: {
    fontSize: 'md',
    theme: 'light'
  }
};

export const Z_INDEX = {
  grid: -100,
  barBackground: -50,
  area: 100,
  cursorRectangle: 200,
  bar: 300,
  line: 400,
  axis: 500,
  scatter: 600,
  activeBar: 1000,
  cursorLine: 1100,
  activeDot: 1200,
  label: 2000
};
