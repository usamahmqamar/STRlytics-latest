/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { 
  differenceInDays, 
  parseISO, 
  format, 
  startOfMonth, 
  endOfMonth, 
  isWithinInterval, 
  subDays, 
  addMonths, 
  isSameMonth,
  getDaysInMonth,
  addDays,
  getDay,
  isAfter
} from 'date-fns';
import { UserData, Reservation, DailyExpense, MonthlyBill, Apartment, Platform } from '../types';

// Currency conversion (Mock rates - in production fetch from API)
export const EXCHANGE_RATES: Record<string, number> = {
  AED: 1,
  USD: 0.27,
  EUR: 0.25,
  GBP: 0.21,
  SAR: 1.02,
  QAR: 0.99,
  OMR: 0.10,
  KWD: 0.08,
  BHD: 0.10,
  INR: 22.50
};

export function convertCurrency(amount: number, from: string, to: string): number {
  if (from === to) return amount;
  const amountInAED = amount / (EXCHANGE_RATES[from] || 1);
  return amountInAED * (EXCHANGE_RATES[to] || 1);
}

export function getExchangeRate(from: string, to: string): number {
  if (from === to) return 1;
  return (EXCHANGE_RATES[to] || 1) / (EXCHANGE_RATES[from] || 1);
}

export function calculateDailyPL(data: UserData, startDate: Date, endDate: Date, apartmentId?: string) {
  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime()) || startDate > endDate) return [];

  const days: Date[] = [];
  let current = new Date(startDate);
  while (current <= endDate) {
    days.push(new Date(current));
    current.setDate(current.getDate() + 1);
  }

  const results = [];
  for (const day of days) {
    const dateStr = format(day, 'yyyy-MM-dd');
    const monthStr = format(day, 'yyyy-MM');
    const targetApartments = apartmentId ? data.apartments.filter(a => a.apartment_id === apartmentId) : data.apartments;

    for (const apt of targetApartments) {
      // Revenue
      const activeBooking = data.reservations.find(r => 
        r.apartment_id === apt.apartment_id && 
        r.status !== 'cancelled' && 
        isWithinInterval(day, { start: parseISO(r.check_in), end: subDays(parseISO(r.check_out), 1) })
      );

      const cancelledRevenue = data.reservations
        .filter(r => r.apartment_id === apt.apartment_id && r.status === 'cancelled' && isWithinInterval(day, { start: parseISO(r.check_in), end: subDays(parseISO(r.check_out), 1) }))
        .reduce((sum, r) => sum + (r.net_payout_aed / r.nights), 0);

      const isOccupied = !!activeBooking;
      const dailyRevenue = activeBooking ? (activeBooking.net_payout_aed / activeBooking.nights) : 0;
      
      const daysInMonth = getDaysInMonth(day);
      
      // Rent
      let monthlyRent = apt.monthly_rent_aed;
      if (apt.rent_cheques && apt.rent_cheques.length > 0) {
        monthlyRent = apt.rent_cheques.reduce((sum, chq) => sum + chq.amount_aed, 0) / 12;
      }
      const dailyRent = monthlyRent / daysInMonth;

      // Utilities
      const elecBill = data.monthlyBills.find(b => b.apartment_id === apt.apartment_id && b.month === monthStr && b.bill_type === 'electricity');
      const interBill = data.monthlyBills.find(b => b.apartment_id === apt.apartment_id && b.month === monthStr && b.bill_type === 'internet');
      
      const monthlyElec = elecBill ? elecBill.amount_aed : apt.utilities_monthly_defaults.dewa_electricity_aed;
      const monthlyInter = interBill ? interBill.amount_aed : apt.utilities_monthly_defaults.internet_aed;
      
      const dailyElec = monthlyElec / daysInMonth;
      const dailyInter = monthlyInter / daysInMonth;

      // Cleaning (allocated per night of stay)
      const cleaningAllocated = activeBooking ? (activeBooking.cleaning_cost_aed / activeBooking.nights) : 0;

      // Other costs from reservation
      let otherCosts = 0;
      data.reservations.filter(r => r.apartment_id === apt.apartment_id && r.status !== 'cancelled').forEach(r => {
        r.other_booking_costs?.forEach(cost => {
          const costDate = cost.date ? parseISO(cost.date) : parseISO(r.check_out);
          if (format(day, 'yyyy-MM-dd') === format(costDate, 'yyyy-MM-dd')) {
            otherCosts += cost.amount_aed;
          }
        });
      });

      // Real-time expenses
      const directExpenses = data.dailyExpenses
        .filter(e => e.apartment_id === apt.apartment_id && format(parseISO(e.date), 'yyyy-MM-dd') === dateStr)
        .reduce((sum, e) => sum + e.amount_aed, 0);

      const portfolioSharedExpense = data.apartments.length > 0 
        ? data.dailyExpenses.filter(e => e.apartment_id === 'PORTFOLIO' && format(parseISO(e.date), 'yyyy-MM-dd') === dateStr).reduce((sum, e) => sum + e.amount_aed, 0) / data.apartments.length
        : 0;

      const totalDailyCost = dailyRent + dailyElec + dailyInter + cleaningAllocated + otherCosts + directExpenses + portfolioSharedExpense;
      const dailyProfit = dailyRevenue - totalDailyCost;

      results.push({
        date: dateStr,
        apartment: apt.name,
        apartment_id: apt.apartment_id,
        occupied: isOccupied ? 'yes' : 'no',
        occupied_nights_count: isOccupied ? 1 : 0,
        daily_revenue_aed: dailyRevenue,
        lost_revenue_aed: cancelledRevenue,
        daily_rent_aed: dailyRent,
        daily_electricity_aed: dailyElec,
        daily_internet_aed: dailyInter,
        cleaning_allocated_aed: cleaningAllocated,
        other_costs_allocated_aed: otherCosts,
        real_time_expenses_aed: directExpenses + portfolioSharedExpense,
        total_daily_cost_aed: totalDailyCost,
        daily_profit_aed: dailyProfit
      });
    }
  }
  return results;
}

export function getMonthlyKPIs(data: UserData, monthStr: string) {
  const start = startOfMonth(parseISO(`${monthStr}-01`));
  const end = endOfMonth(start);
  const dailyData = calculateDailyPL(data, start, end);
  
  const apartments = data.apartments;
  const stats = [];

  for (const apt of apartments) {
    const aptDaily = dailyData.filter(d => d.apartment_id === apt.apartment_id);
    const availableNights = aptDaily.length;
    const occupiedNights = aptDaily.reduce((sum, d) => sum + d.occupied_nights_count, 0);
    const revenue = aptDaily.reduce((sum, d) => sum + d.daily_revenue_aed, 0);
    const lostRevenue = aptDaily.reduce((sum, d) => sum + d.lost_revenue_aed, 0);
    const totalCost = aptDaily.reduce((sum, d) => sum + d.total_daily_cost_aed, 0);
    const netProfit = revenue - totalCost;

    stats.push({
      month: monthStr,
      entity: apt.name,
      available_nights: availableNights,
      occupied_nights: occupiedNights,
      occupancy_rate: availableNights > 0 ? occupiedNights / availableNights : 0,
      revenue_aed: revenue,
      lost_revenue_aed: lostRevenue,
      ADR_aed: occupiedNights > 0 ? revenue / occupiedNights : 0,
      RevPAR_aed: availableNights > 0 ? revenue / availableNights : 0,
      total_cost_aed: totalCost,
      net_profit_aed: netProfit,
      profit_margin: revenue > 0 ? netProfit / revenue : 0
    });
  }

  // Portfolio level
  const totalAvailable = stats.reduce((sum, s) => sum + s.available_nights, 0);
  const totalOccupied = stats.reduce((sum, s) => sum + s.occupied_nights, 0);
  const totalRevenue = stats.reduce((sum, s) => sum + s.revenue_aed, 0);
  const totalLost = stats.reduce((sum, s) => sum + s.lost_revenue_aed, 0);
  const totalCost = stats.reduce((sum, s) => sum + s.total_cost_aed, 0);
  const totalNetProfit = totalRevenue - totalCost;

  stats.push({
    month: monthStr,
    entity: 'PORTFOLIO',
    available_nights: totalAvailable,
    occupied_nights: totalOccupied,
    occupancy_rate: totalAvailable > 0 ? totalOccupied / totalAvailable : 0,
    revenue_aed: totalRevenue,
    lost_revenue_aed: totalLost,
    ADR_aed: totalOccupied > 0 ? totalRevenue / totalOccupied : 0,
    RevPAR_aed: totalAvailable > 0 ? totalRevenue / totalAvailable : 0,
    total_cost_aed: totalCost,
    net_profit_aed: totalNetProfit,
    profit_margin: totalRevenue > 0 ? totalNetProfit / totalRevenue : 0
  });

  return stats;
}

export function getCashflowTimeline(data: UserData, options?: { apartmentId?: string, startDate?: string, endDate?: string }) {
  const timeline: any[] = [];

  // Inflows: Reservation Payouts
  data.reservations.forEach(res => {
    if (res.status === 'cancelled') return;
    if (options?.apartmentId && options.apartmentId !== 'ALL' && res.apartment_id !== options.apartmentId) return;
    
    // Payout date logic
    let payoutDate = res.payout_date;
    if (!payoutDate) {
      const platform = data.platforms.find(p => p.platform_id === res.platform_id) || 
                       data.platforms.find(p => p.name === res.channel);
      
      if (platform) {
        const checkIn = parseISO(res.check_in);
        const checkOut = parseISO(res.check_out);
        let baseDate: Date;

        switch (platform.payout_timing) {
          case 'before_checkin':
            baseDate = subDays(checkIn, platform.payout_days_offset);
            break;
          case 'after_checkin':
            baseDate = addDays(checkIn, platform.payout_days_offset);
            break;
          case 'after_checkout':
            baseDate = addDays(checkOut, platform.payout_days_offset);
            break;
          case 'next_specific_day':
            // Find the next specific day of week after checkout (e.g. next Thursday)
            const dayOfWeek = platform.payout_day_of_week ?? 4; // Default to Thursday
            const startSearchDate = addDays(checkOut, platform.payout_days_offset);
            const currentDay = getDay(startSearchDate);
            let daysToAdd = (dayOfWeek - currentDay + 7) % 7;
            // If it's already the day, we usually want the NEXT one if offset is 0? 
            // Most platforms mean "the following Thursday"
            if (daysToAdd === 0) daysToAdd = 7; 
            baseDate = addDays(startSearchDate, daysToAdd);
            break;
          default:
            baseDate = checkOut;
        }

        // Add processing days
        const finalDate = addDays(baseDate, platform.processing_days);
        payoutDate = format(finalDate, 'yyyy-MM-dd');
      } else {
        // Fallback to checkout date if no platform found
        payoutDate = res.check_out;
      }
    }

    if (options?.startDate && payoutDate < options.startDate) return;
    if (options?.endDate && payoutDate > options.endDate) return;

    const apt = data.apartments.find(a => a.apartment_id === res.apartment_id);
    timeline.push({
      date: payoutDate,
      type: 'IN',
      category: 'Reservation Payout',
      description: `${res.channel} - ${res.guest_name || 'Guest'}`,
      amount: res.net_payout_aed,
      apartmentName: apt?.name || 'Unknown',
      apartment_id: res.apartment_id
    });
  });

  // Outflows: Daily Expenses
  data.dailyExpenses.forEach(exp => {
    if (options?.apartmentId && options.apartmentId !== 'ALL' && exp.apartment_id !== options.apartmentId) return;
    if (options?.startDate && exp.date < options.startDate) return;
    if (options?.endDate && exp.date > options.endDate) return;

    const apt = data.apartments.find(a => a.apartment_id === exp.apartment_id);
    timeline.push({
      date: exp.date,
      type: 'OUT',
      category: 'Expense',
      description: `${exp.category}: ${exp.notes || ''}`,
      amount: -exp.amount_aed,
      apartmentName: exp.apartment_id === 'PORTFOLIO' ? 'Portfolio' : (apt?.name || 'Unknown'),
      apartment_id: exp.apartment_id
    });
  });

  // Outflows: Monthly Bills
  data.monthlyBills.forEach(bill => {
    if (options?.apartmentId && options.apartmentId !== 'ALL' && bill.apartment_id !== options.apartmentId) return;
    const date = bill.paid_date || format(endOfMonth(parseISO(`${bill.month}-01`)), 'yyyy-MM-dd');
    
    if (options?.startDate && date < options.startDate) return;
    if (options?.endDate && date > options.endDate) return;

    const apt = data.apartments.find(a => a.apartment_id === bill.apartment_id);
    timeline.push({
      date: date,
      type: 'OUT',
      category: 'Bill',
      description: `${bill.bill_type} for ${bill.month}`,
      amount: -bill.amount_aed,
      apartmentName: apt?.name || 'Unknown',
      apartment_id: bill.apartment_id
    });
  });

  // Outflows: Rent Cheques & Setup Costs
  data.apartments.forEach(apt => {
    if (options?.apartmentId && options.apartmentId !== 'ALL' && apt.apartment_id !== options.apartmentId) return;

    apt.rent_cheques.forEach(chq => {
      if (options?.startDate && chq.due_date < options.startDate) return;
      if (options?.endDate && chq.due_date > options.endDate) return;

      timeline.push({
        date: chq.due_date,
        type: 'OUT',
        category: 'Rent Cheque',
        description: `Cheque for ${apt.name}`,
        amount: -chq.amount_aed,
        apartmentName: apt.name,
        apartment_id: apt.apartment_id
      });
    });

    apt.setup_costs.forEach(cost => {
      if (options?.startDate && cost.date < options.startDate) return;
      if (options?.endDate && cost.date > options.endDate) return;

      timeline.push({
        date: cost.date,
        type: 'OUT',
        category: 'Setup Cost',
        description: `${cost.category}: ${cost.description}`,
        amount: -cost.amount_aed,
        apartmentName: apt.name,
        apartment_id: apt.apartment_id
      });
    });
  });

  // Outflows: Vendor Payments
  data.payments.forEach(pay => {
    if (options?.startDate && pay.date < options.startDate) return;
    if (options?.endDate && pay.date > options.endDate) return;

    const vendor = data.vendors.find(v => v.vendor_id === pay.vendor_id);
    timeline.push({
      date: pay.date,
      type: 'OUT',
      category: 'Vendor Payment',
      description: `${pay.type.replace('_', ' ')} to ${vendor?.name || 'Unknown'}`,
      amount: -pay.amount_paid,
      apartmentName: 'Portfolio',
      apartment_id: 'PORTFOLIO'
    });
  });

  const sorted = timeline.sort((a, b) => a.date.localeCompare(b.date));
  let balance = 0;
  return sorted.map(item => {
    balance += item.amount;
    return { ...item, cumulativeBalance: balance };
  });
}

export function getRevenueForecast(data: UserData, months: number = 3) {
  const today = new Date();
  const forecast = [];
  
  for (let i = 0; i < months; i++) {
    const targetMonth = addMonths(startOfMonth(today), i);
    const monthStr = format(targetMonth, 'yyyy-MM');
    
    // Confirmed revenue from existing bookings
    const confirmedRevenue = data.reservations
      .filter(r => r.status === 'confirmed' && isSameMonth(parseISO(r.check_in), targetMonth))
      .reduce((sum, r) => sum + r.net_payout_aed, 0);
      
    // Projected revenue based on historical occupancy (mock logic)
    const historicalAvg = 15000; // Mock average
    const projectedRevenue = confirmedRevenue + (historicalAvg * (1 - (confirmedRevenue / (historicalAvg || 1))));
    
    forecast.push({
      month: monthStr,
      confirmed: confirmedRevenue,
      projected: projectedRevenue,
      label: format(targetMonth, 'MMM yyyy')
    });
  }
  
  return forecast;
}

export function getMarketBenchmarks(location: string = "Dubai Marina") {
  // Mock benchmarks for Dubai areas
  const benchmarks: Record<string, any> = {
    "Dubai Marina": { occupancy: 0.82, adr: 850, revpar: 697 },
    "Downtown Dubai": { occupancy: 0.78, adr: 1200, revpar: 936 },
    "Palm Jumeirah": { occupancy: 0.75, adr: 1800, revpar: 1350 },
    "JBR": { occupancy: 0.85, adr: 950, revpar: 807 }
  };
  
  return benchmarks[location] || benchmarks["Dubai Marina"];
}

export function getRiskAssessment(data: UserData) {
  const today = new Date();
  const next30Days = addDays(today, 30);
  
  // 1. Cancellation Exposure (Confirmed bookings that are still in refundable window)
  const refundableRevenue = data.reservations
    .filter(r => r.status === 'confirmed' && r.cancellation_policy !== 'non-refundable')
    .reduce((sum, r) => sum + r.net_payout_aed, 0);
    
  // 2. Upcoming Liabilities (Rent cheques and unpaid invoices)
  const upcomingCheques = data.apartments.flatMap(a => a.rent_cheques)
    .filter(c => c.status === 'due' && isWithinInterval(parseISO(c.due_date), { start: today, end: next30Days }))
    .reduce((sum, c) => sum + c.amount_aed, 0);
    
  const unpaidInvoices = data.invoices
    .filter(i => i.status === 'pending')
    .reduce((sum, i) => sum + i.total_amount, 0);
    
  return {
    refundableRevenue,
    upcomingLiabilities: upcomingCheques + unpaidInvoices,
    riskScore: (refundableRevenue > 0 || upcomingCheques > 0) ? 'medium' : 'low'
  };
}

export function getCancellationExposure(data: UserData) {
  const today = new Date();
  
  let refundableCount = 0;
  let refundableAmount = 0;
  let nonRefundableCount = 0;
  let nonRefundableAmount = 0;

  data.reservations.forEach(res => {
    if (res.status === 'cancelled') return;

    const checkIn = parseISO(res.check_in);
    let isRefundable = false;

    if (res.cancellation_policy === 'refundable') {
      isRefundable = true;
    } else if (res.cancellation_policy === '14-day-flexible') {
      const deadline = subDays(checkIn, 14);
      isRefundable = !isAfter(today, deadline);
    } else if (res.cancellation_policy === '7-day-flexible') {
      const deadline = subDays(checkIn, 7);
      isRefundable = !isAfter(today, deadline);
    }

    if (isRefundable) {
      refundableCount++;
      refundableAmount += res.net_payout_aed;
    } else {
      nonRefundableCount++;
      nonRefundableAmount += res.net_payout_aed;
    }
  });

  return {
    refundable: { count: refundableCount, amount: refundableAmount },
    nonRefundable: { count: nonRefundableCount, amount: nonRefundableAmount }
  };
}

export function getUpcomingTasks(data: UserData) {
  const today = new Date();
  const tasks = [];

  // Cheques due
  data.apartments.forEach(apt => {
    apt.rent_cheques.forEach(chq => {
      const dueDate = parseISO(chq.due_date);
      const daysDiff = differenceInDays(dueDate, today);
      if (chq.status === 'due' && daysDiff <= 30) {
        tasks.push({
          id: chq.cheque_id,
          type: 'cheque',
          title: `Cheque Due: ${apt.name}`,
          description: `AED ${chq.amount_aed.toLocaleString()} due in ${daysDiff} days`,
          date: chq.due_date,
          urgent: daysDiff <= 0
        });
      }
    });
  });

  // Unbilled services
  const unbilledCount = data.serviceRecords.filter(r => r.status === 'unbilled').length;
  if (unbilledCount > 0) {
    tasks.push({
      id: 'unbilled-services',
      type: 'service',
      title: 'Unbilled Services',
      description: `You have ${unbilledCount} maintenance records pending billing`,
      date: format(today, 'yyyy-MM-dd'),
      urgent: false
    });
  }

  return tasks;
}

export function getActionReminders(data: UserData) {
  const today = new Date();
  const reminders = [];

  // Vendor Payments (Unpaid Invoices)
  data.invoices.filter(inv => inv.status === 'pending').forEach(inv => {
    const vendor = data.vendors.find(v => v.vendor_id === inv.vendor_id);
    reminders.push({
      id: inv.invoice_id,
      type: 'payment',
      title: `Vendor Payment: ${vendor?.name || 'Unknown'}`,
      description: `Invoice #${inv.invoice_id} for services`,
      date: inv.date,
      amount: inv.total_amount,
      status: isAfter(today, parseISO(inv.date)) ? 'overdue' : 'soon'
    });
  });

  // Subscription Renewal
  const subRenewalDate = parseISO(data.subscription.next_charge_date);
  if (differenceInDays(subRenewalDate, today) <= 14) {
    reminders.push({
      id: 'sub-renewal',
      type: 'subscription',
      title: 'Subscription Renewal',
      description: `Plan: ${data.subscription.plan.toUpperCase()}`,
      date: data.subscription.next_charge_date,
      amount: data.subscription.monthly_payment_aed,
      status: 'soon'
    });
  }

  // Rent Cheques (Overdue)
  data.apartments.forEach(apt => {
    apt.rent_cheques.forEach(chq => {
      const dueDate = parseISO(chq.due_date);
      if (chq.status === 'due' && isAfter(today, dueDate)) {
        reminders.push({
          id: chq.cheque_id,
          type: 'rent',
          title: `Rent Cheque Due: ${apt.nickname || apt.name}`,
          description: `Cheque #${chq.cheque_number || 'N/A'} for ${apt.name}`,
          date: chq.due_date,
          amount: chq.amount_aed,
          status: 'overdue'
        });
      }
    });
  });

  return reminders.sort((a, b) => a.date.localeCompare(b.date));
}

export function getStrategicGoals(data: UserData) {
  // Mock logic for strategic goals
  return [
    { id: 'expansion', title: 'Portfolio Expansion', current: data.apartments.length, target: 5, unit: 'Units' },
    { id: 'revenue', title: 'Revenue Target', current: 75, target: 100, unit: '%' },
    { id: 'satisfaction', title: 'Guest Satisfaction', current: 4.8, target: 5.0, unit: '/5.0' }
  ];
}

export function getOpportunityScore(data: UserData) {
  // Mock logic for opportunity score
  return {
    score: 82,
    label: 'Optimization Potential',
    insight: 'Your portfolio is performing at 82% of its peak potential. Focus on weekend ADR.'
  };
}

export function getOccupancyTrend(data: UserData, months: number = 6) {
  const today = new Date();
  const trend = [];
  
  for (let i = months - 1; i >= 0; i--) {
    const targetMonth = subDays(startOfMonth(today), i * 30); // Simplified month logic
    const monthStr = format(targetMonth, 'MMM');
    const kpis = getMonthlyKPIs(data, format(targetMonth, 'yyyy-MM'));
    const portfolioKPI = kpis.find(k => k.entity === 'PORTFOLIO');
    
    trend.push({
      month: monthStr,
      rate: portfolioKPI ? Math.round(portfolioKPI.occupancy_rate * 100) : 0
    });
  }
  
  return trend;
}

export function getRevenueByChannel(data: UserData) {
  const channels: Record<string, number> = {};
  data.reservations.forEach(res => {
    if (res.status === 'cancelled') return;
    channels[res.channel] = (channels[res.channel] || 0) + res.net_payout_aed;
  });
  
  return Object.entries(channels).map(([name, value]) => ({ name, value }));
}

export function getBookingLeadTime(data: UserData) {
  const leadTimes = {
    '0-7 days': 0,
    '8-14 days': 0,
    '31-60 days': 0,
    '60+ days': 0
  };
  
  let totalDays = 0;
  let count = 0;

  data.reservations.forEach(res => {
    if (res.status === 'cancelled') return;
    const bookingDate = parseISO(res.booking_date);
    const checkIn = parseISO(res.check_in);
    const days = differenceInDays(checkIn, bookingDate);
    
    totalDays += days;
    count++;

    if (days <= 7) leadTimes['0-7 days']++;
    else if (days <= 14) leadTimes['8-14 days']++;
    else if (days <= 60) leadTimes['31-60 days']++;
    else leadTimes['60+ days']++;
  });
  
  return {
    data: Object.entries(leadTimes).map(([name, value]) => ({ name, value })),
    avg: count > 0 ? Math.round(totalDays / count) : 0
  };
}

export function getADRTrendByProperty(data: UserData, months: number = 6) {
  const today = new Date();
  const properties = data.apartments.map(a => a.name);
  const trend = [];
  
  for (let i = months - 1; i >= 0; i--) {
    const targetMonth = subDays(startOfMonth(today), i * 30);
    const monthStr = format(targetMonth, 'MMM');
    const kpis = getMonthlyKPIs(data, format(targetMonth, 'yyyy-MM'));
    
    const dataPoint: any = { month: monthStr };
    properties.forEach(prop => {
      const aptKPI = kpis.find(k => k.entity === prop);
      dataPoint[prop] = aptKPI ? Math.round(aptKPI.ADR_aed) : 0;
    });
    trend.push(dataPoint);
  }
  
  return trend;
}

export function getQuarterlyPerformance(data: UserData, apartmentId: string, quarterIndex: number = 0) {
  const apt = data.apartments.find(a => a.apartment_id === apartmentId);
  if (!apt || !apt.rent_cheques || apt.rent_cheques.length === 0) return null;

  const sortedCheques = [...apt.rent_cheques].sort((a, b) => a.due_date.localeCompare(b.due_date));
  const cheque = sortedCheques[quarterIndex % sortedCheques.length];
  const startDate = parseISO(cheque.due_date);
  
  // Calculate end date based on number of cheques (assuming 12 months total)
  const monthsPerQuarter = 12 / apt.num_cheques;
  const endDate = subDays(addMonths(startDate, monthsPerQuarter), 1);

  const dailyData = calculateDailyPL(data, startDate, endDate, apartmentId);
  
  // Group by month
  const months: Record<string, any[]> = {};
  dailyData.forEach(d => {
    const monthKey = format(parseISO(d.date), 'MMM-yy');
    if (!months[monthKey]) months[monthKey] = [];
    months[monthKey].push(d);
  });

  const monthlyBreakdown = Object.entries(months).map(([month, days]) => {
    const revenue = days.reduce((sum, d) => sum + d.daily_revenue_aed, 0);
    const costs = days.reduce((sum, d) => sum + d.total_daily_cost_aed, 0);
    const occupiedNights = days.reduce((sum, d) => sum + d.occupied_nights_count, 0);
    const availableNights = days.length;
    
    return {
      month,
      revenue,
      costs,
      expRatio: revenue > 0 ? (costs / revenue) * 100 : 0,
      occupancy: availableNights > 0 ? (occupiedNights / availableNights) * 100 : 0,
      occupiedNights,
      availableNights,
      adr: occupiedNights > 0 ? revenue / occupiedNights : 0,
      revpar: availableNights > 0 ? revenue / availableNights : 0,
      isHighSeason: ['Nov', 'Dec', 'Jan', 'Feb', 'Mar'].some(m => month.includes(m))
    };
  });

  const totalRevenue = monthlyBreakdown.reduce((sum, m) => sum + m.revenue, 0);
  const totalCosts = monthlyBreakdown.reduce((sum, m) => sum + m.costs, 0);
  const totalTarget = cheque.amount_aed + (apt.utilities_monthly_defaults.dewa_electricity_aed + apt.utilities_monthly_defaults.internet_aed) * monthsPerQuarter;
  
  const netSurplus = totalRevenue - totalCosts;
  const profitMargin = totalRevenue > 0 ? (netSurplus / totalRevenue) * 100 : 0;
  
  // Forecasting
  const avgADR = monthlyBreakdown.reduce((sum, m) => sum + m.adr, 0) / (monthlyBreakdown.filter(m => m.adr > 0).length || 1) || 850;
  const breakEvenDaily = totalCosts / dailyData.length;
  const breakEvenOcc = avgADR > 0 ? (breakEvenDaily / avgADR) * 100 : 0;

  const today = new Date();
  const nextCheque = sortedCheques.find(c => parseISO(c.due_date) >= today) || sortedCheques[0];
  const daysUntilNext = differenceInDays(parseISO(nextCheque.due_date), today);

  return {
    period: `${format(startDate, 'MMM dd, yy')} - ${format(endDate, 'MMM dd, yy')}`,
    startDate: format(startDate, 'yyyy-MM-dd'),
    endDate: format(endDate, 'yyyy-MM-dd'),
    dueDate: cheque.due_date,
    chequeNumber: (quarterIndex % sortedCheques.length) + 1,
    totalCheques: sortedCheques.length,
    daysLeft: differenceInDays(parseISO(cheque.due_date), today),
    daysUntilNext,
    nextChequeDate: nextCheque.due_date,
    monthlyBreakdown,
    financialHealth: {
      totalTarget,
      collected: totalRevenue,
      remaining: Math.max(0, totalTarget - totalRevenue),
      targetCoverage: (totalRevenue / totalTarget) * 100,
      rentCoverage: (totalRevenue / cheque.amount_aed) * 100,
      opexCoverage: (totalRevenue / (totalCosts - (cheque.amount_aed / dailyData.length * dailyData.length))) * 100 // Simplified
    },
    stats: {
      profitMargin,
      breakEvenOcc,
      netSurplus
    },
    benchmarks: {
      revparVsPortfolio: 12, // Mock
      occVsPortfolio: -5 // Mock
    }
  };
}
