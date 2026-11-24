// Generated from src/server/ownerReports.ts by npm run build:server. Do not edit.

// src/constants.ts
var DEFAULT_USER_DATA = {
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
      annual_rent: 144e3,
      monthly_rent: 12e3,
      num_cheques: 4,
      rent_cheques: [
        { cheque_id: "chq-1", due_date: "2026-01-01", amount: 36e3, status: "paid" },
        { cheque_id: "chq-2", due_date: "2026-04-01", amount: 36e3, status: "due" }
      ],
      utilities_monthly_defaults: {
        electricity: 800,
        internet: 400
      },
      currency: "AED",
      setup_costs: [
        {
          item_id: "s-1",
          date: "2025-12-15",
          category: "Furnishing",
          description: "Living room set",
          amount: 15e3,
          is_refundable: false,
          payment_method: "bank",
          vendor: "IKEA"
        }
      ],
      tenancy_end_date: "2026-12-31",
      status: "active",
      tenancy_history: [
        {
          tenancy_id: "HIST-BC605-2025",
          start_date: "2025-01-01",
          end_date: "2025-12-31",
          status: "expired",
          annual_rent: 135e3,
          monthly_rent: 11250,
          num_cheques: 4,
          total_revenue: 184500,
          total_expenses: 147250,
          net_payout: 178900,
          net_profit: 31650,
          occupancy_rate: 82,
          num_reservations: 46
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
      total_booking_revenue: 5e3,
      net_payout: 4850,
      cleaning_cost: 250,
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
      total_booking_revenue: 4500,
      net_payout: 3825,
      cleaning_cost: 250,
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
      payout_day_of_week: 4,
      // Thursday
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
    monthly_payment: 499,
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
    { id: "financial-health", title: "Financial Health & P&L", category: "financial", visible: true, colSpan: 12 },
    { id: "task-reminders", title: "Urgent Tasks", category: "urgent_reminders", visible: true, colSpan: 12 },
    { id: "reminders", title: "Action Reminders", category: "urgent_reminders", visible: true, colSpan: 6 },
    { id: "risk-assessment", title: "Risk Assessment", category: "urgent_reminders", visible: true, colSpan: 6 },
    { id: "kpi-stats", title: "Key Performance Indicators", category: "financial", visible: true, colSpan: 12 },
    { id: "cancellation-policy", title: "Cancellation Policy Exposure", category: "financial", visible: true, colSpan: 8 },
    { id: "revenue-trend", title: "Revenue & Profit Trend", category: "financial", visible: true, colSpan: 6 },
    { id: "expense-breakdown", title: "Expense Breakdown", category: "financial", visible: true, colSpan: 6 },
    { id: "cheque-management", title: "Cheque Management & Coverage", category: "operations", visible: true, colSpan: 12 },
    { id: "apartment-performance", title: "Apartment Performance", category: "portfolio", visible: true, colSpan: 8 },
    { id: "kpi-summary", title: "Monthly KPI Summary", category: "portfolio", visible: true, colSpan: 12 },
    { id: "strategic-goals", title: "Strategic Goals", category: "portfolio", visible: true, colSpan: 4 },
    { id: "occupancy-rate", title: "Occupancy Rate Trend", category: "analytics", visible: true, colSpan: 6 },
    { id: "revenue-channel", title: "Revenue by Channel", category: "analytics", visible: true, colSpan: 6 },
    { id: "revenue-forecast", title: "Revenue Forecast (3-Month)", category: "analytics", visible: true, colSpan: 8 },
    { id: "market-benchmark", title: "Market Benchmarking", category: "analytics", visible: true, colSpan: 4 },
    { id: "lead-time", title: "Booking Lead Time", category: "analytics", visible: true, colSpan: 4 },
    { id: "adr-by-property", title: "ADR by Property", category: "analytics", visible: true, colSpan: 12 },
    { id: "opportunity-score", title: "Opportunity Score", category: "analytics", visible: true, colSpan: 4 }
  ],
  displaySettings: {
    fontSize: "md",
    theme: "light"
  }
};

// src/lib/workspaceRows.ts
var TABLES = [
  {
    table: "reservations",
    collection: "reservations",
    idField: "reservation_code",
    staffCanWrite: true,
    cols: [
      "currency",
      "apartment_id",
      "platform_id",
      "channel",
      "guest_name",
      "check_in",
      "check_in_time",
      "check_out",
      "check_out_time",
      "num_guests",
      "nights",
      "total_booking_revenue",
      "net_payout",
      "payout_date",
      "cleaning_cost",
      "status",
      "cancellation_policy",
      "booking_date",
      "non_refundable_date",
      "rating",
      "notes",
      "damages_incurred",
      "other_booking_costs",
      "source_document_id"
    ],
    dates: ["check_in", "check_out", "payout_date", "booking_date", "non_refundable_date"],
    ints: ["num_guests", "nights"]
  },
  {
    table: "platforms",
    collection: "platforms",
    idField: "platform_id",
    staffCanWrite: false,
    cols: [
      "name",
      "commission_percent",
      "payment_charge_percent",
      "vat_percent",
      "other_charges_percent",
      "payout_timing",
      "payout_day_of_week",
      "payout_days_offset",
      "processing_days"
    ],
    ints: ["payout_day_of_week", "payout_days_offset", "processing_days"]
  },
  {
    table: "vendors",
    collection: "vendors",
    idField: "vendor_id",
    staffCanWrite: false,
    cols: ["name", "service_type", "phone", "email", "status"]
  },
  {
    table: "service_records",
    collection: "serviceRecords",
    idField: "record_id",
    staffCanWrite: true,
    cols: ["currency", "date", "apartment_id", "service_type", "vendor_id", "description", "quantity", "unit_cost", "total_cost", "status", "invoice_id"],
    dates: ["date"]
  },
  {
    table: "vendor_invoices",
    collection: "invoices",
    idField: "invoice_id",
    staffCanWrite: false,
    cols: ["currency", "vendor_id", "record_ids", "total_amount", "date", "status"],
    dates: ["date"]
  },
  {
    table: "vendor_payments",
    collection: "payments",
    idField: "payment_id",
    staffCanWrite: false,
    cols: ["currency", "date", "vendor_id", "amount_paid", "type", "invoice_id", "notes"],
    dates: ["date"]
  },
  {
    table: "daily_expenses",
    collection: "dailyExpenses",
    idField: "expense_id",
    staffCanWrite: true,
    cols: ["currency", "apartment_id", "date", "category", "amount", "notes"],
    dates: ["date"]
  },
  {
    table: "monthly_bills",
    collection: "monthlyBills",
    idField: "bill_id",
    staffCanWrite: true,
    cols: ["currency", "apartment_id", "month", "bill_type", "amount", "status", "paid_date"],
    dates: ["paid_date"]
  },
  {
    table: "bank_reconciliations",
    collection: "bankReconciliations",
    idField: "reconciliation_id",
    staffCanWrite: false,
    cols: ["date", "actual_balance", "notes"],
    dates: ["date"]
  },
  {
    table: "assets",
    collection: "assets",
    idField: "asset_id",
    staffCanWrite: true,
    cols: [
      "currency",
      "apartment_id",
      "name",
      "category",
      "purchase_date",
      "warranty_expiry",
      "condition",
      "last_serviced_date",
      "next_service_due",
      "cost",
      "notes"
    ],
    dates: ["purchase_date", "warranty_expiry", "last_serviced_date", "next_service_due"]
  },
  {
    table: "documents",
    collection: "documents",
    idField: "doc_id",
    staffCanWrite: true,
    cols: ["apartment_id", "title", "type", "expiry_date", "file_url", "status"],
    dates: ["expiry_date"]
  },
  {
    table: "maintenance_tasks",
    collection: "maintenanceTasks",
    idField: "task_id",
    staffCanWrite: true,
    cols: [
      "apartment_id",
      "title",
      "description",
      "priority",
      "status",
      "created_at",
      "due_date",
      "vendor_id",
      "cost_estimate",
      "actual_cost"
    ],
    dates: ["due_date"]
  },
  {
    table: "communication_templates",
    collection: "communicationTemplates",
    idField: "template_id",
    staffCanWrite: true,
    cols: ["name", "subject", "content", "category"]
  }
];
var PROPERTY_COLS = [
  "name",
  "nickname",
  "building",
  "address",
  "specification",
  "measurement_sqft",
  "start_operation_date",
  "annual_rent",
  "monthly_rent",
  "num_cheques",
  "currency",
  "status",
  "tenancy_end_date",
  "utilities_monthly_defaults",
  "platform_settings",
  "tenancy_history",
  "country",
  "region",
  "city",
  "timezone"
];
var CHEQUE_COLS = ["cheque_number", "due_date", "amount", "currency", "status"];
var SETUP_COLS = ["date", "category", "description", "amount", "currency", "is_refundable", "payment_method", "vendor"];
function unpick(row, cols) {
  const item = {};
  for (const c of cols) if (row[c] !== null && row[c] !== void 0) item[c] = row[c];
  return item;
}
function assembleUserData(rows) {
  const byProp = (list, cols, idName) => {
    const m = /* @__PURE__ */ new Map();
    for (const r of list) {
      const items = m.get(r.property_id) || [];
      items.push({ [idName]: r.id, ...unpick(r, cols) });
      m.set(r.property_id, items);
    }
    return m;
  };
  const chequesBy = byProp(rows.property_rent_cheques, CHEQUE_COLS, "cheque_id");
  const setupBy = byProp(rows.property_setup_costs, SETUP_COLS, "item_id");
  const data = {
    ...DEFAULT_USER_DATA,
    apartments: rows.properties.map((p) => ({
      apartment_id: p.id,
      ...unpick(p, PROPERTY_COLS),
      utilities_monthly_defaults: p.utilities_monthly_defaults || { electricity: 0, internet: 0 },
      rent_cheques: chequesBy.get(p.id) || [],
      setup_costs: setupBy.get(p.id) || []
    }))
  };
  for (const def of TABLES) {
    data[def.collection] = (rows.tables[def.table] || []).map((r) => ({ [def.idField]: r.id, ...unpick(r, def.cols) }));
  }
  return data;
}

// src/lib/money.ts
var USD_PEGS = { USD: 1, AED: 3.6725, SAR: 3.75, QAR: 3.64, OMR: 0.3845, BHD: 0.376 };
function buildRates(rows) {
  const out = /* @__PURE__ */ new Map();
  for (const r of rows) {
    const list = out.get(r.currency) ?? [];
    list.push({ date: r.rate_date, perUsd: Number(r.per_usd) });
    out.set(r.currency, list);
  }
  for (const list of out.values()) list.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
  return out;
}
function perUsd(rates, currency, date) {
  if (currency === "USD") return { rate: 1, date: null };
  const list = rates.get(currency);
  if (list?.length) {
    let lo = 0, hi = list.length - 1, found = -1;
    while (lo <= hi) {
      const mid = lo + hi >> 1;
      if (list[mid].date <= date) {
        found = mid;
        lo = mid + 1;
      } else hi = mid - 1;
    }
    const row = list.at(found >= 0 ? found : 0);
    return { rate: row.perUsd, date: row.date };
  }
  if (USD_PEGS[currency]) return { rate: USD_PEGS[currency], date: null };
  return null;
}
function convert(amount, from, to, date, rates) {
  if (!Number.isFinite(amount)) return amount;
  if (from === to || !from || !to) return amount;
  const a = perUsd(rates, from, date);
  const b = perUsd(rates, to, date);
  if (!a || !b) return null;
  return amount / a.rate * b.rate;
}
var today = () => (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
function convertUserData(data, to, rates, fallback) {
  const missing = /* @__PURE__ */ new Set();
  const aptCurrency = new Map(data.apartments.map((a) => [a.apartment_id, a.currency || fallback]));
  const curOf = (row) => row.currency || row.apartment_id && aptCurrency.get(row.apartment_id) || fallback;
  const cv = (amount, from, date) => {
    if (amount === void 0 || amount === null || from === to) return amount;
    const v = convert(Number(amount), from, to, (date || today()).slice(0, 10), rates);
    if (v === null) {
      missing.add(from);
      return amount;
    }
    return Math.round(v * 100) / 100;
  };
  const apartments = data.apartments.map((a) => {
    const c = a.currency || fallback;
    return {
      ...a,
      currency: to,
      annual_rent: cv(a.annual_rent, c, a.start_operation_date),
      monthly_rent: cv(a.monthly_rent, c, a.start_operation_date),
      utilities_monthly_defaults: a.utilities_monthly_defaults && {
        ...a.utilities_monthly_defaults,
        electricity: cv(a.utilities_monthly_defaults.electricity, c, null),
        internet: cv(a.utilities_monthly_defaults.internet, c, null)
      },
      rent_cheques: (a.rent_cheques || []).map((x) => ({ ...x, currency: to, amount: cv(x.amount, x.currency || c, x.due_date) })),
      setup_costs: (a.setup_costs || []).map((x) => ({ ...x, currency: to, amount: cv(x.amount, x.currency || c, x.date) })),
      tenancy_history: a.tenancy_history?.map((t) => ({
        ...t,
        annual_rent: cv(t.annual_rent, c, t.start_date),
        monthly_rent: cv(t.monthly_rent, c, t.start_date),
        total_revenue: cv(t.total_revenue, c, t.end_date),
        total_expenses: cv(t.total_expenses, c, t.end_date),
        net_payout: cv(t.net_payout, c, t.end_date),
        net_profit: cv(t.net_profit, c, t.end_date)
      }))
    };
  });
  const out = {
    ...data,
    apartments,
    reservations: data.reservations.map((r) => {
      const c = curOf(r);
      return {
        ...r,
        currency: to,
        total_booking_revenue: cv(r.total_booking_revenue, c, r.check_in),
        net_payout: cv(r.net_payout, c, r.check_in),
        cleaning_cost: cv(r.cleaning_cost, c, r.check_out || r.check_in),
        other_booking_costs: r.other_booking_costs?.map((o) => ({ ...o, amount: cv(o.amount, c, o.date || r.check_in) }))
      };
    }),
    dailyExpenses: data.dailyExpenses.map((e) => ({ ...e, currency: to, amount: cv(e.amount, curOf(e), e.date) })),
    monthlyBills: data.monthlyBills.map((b) => ({ ...b, currency: to, amount: cv(b.amount, curOf(b), b.paid_date || `${b.month}-01`) })),
    serviceRecords: data.serviceRecords.map((s) => {
      const c = curOf(s);
      return { ...s, currency: to, unit_cost: cv(s.unit_cost, c, s.date), total_cost: cv(s.total_cost, c, s.date) };
    }),
    invoices: data.invoices.map((i) => ({ ...i, currency: to, total_amount: cv(i.total_amount, i.currency || fallback, i.date) })),
    payments: data.payments.map((p) => ({ ...p, currency: to, amount_paid: cv(p.amount_paid, p.currency || fallback, p.date) })),
    assets: data.assets.map((a) => ({ ...a, currency: to, cost: cv(a.cost, curOf(a), a.purchase_date) })),
    maintenanceTasks: data.maintenanceTasks?.map((t) => {
      const c = curOf(t);
      return { ...t, cost_estimate: cv(t.cost_estimate, c, t.due_date || t.created_at), actual_cost: cv(t.actual_cost, c, t.due_date || t.created_at) };
    })
  };
  return { data: out, missing };
}

// src/lib/pl.ts
import { addDays, addYears, differenceInCalendarDays, format, getDaysInMonth, parseISO } from "date-fns";
var dayStr = (d) => format(d, "yyyy-MM-dd");
var nightsOf = (r) => Math.max(1, differenceInCalendarDays(parseISO(r.check_out), parseISO(r.check_in)));
function tenanciesOf(apt) {
  const history = (apt.tenancy_history || []).filter((h) => h.start_date).map((h) => ({ start: h.start_date, end: h.end_date || null, annualRent: Number(h.annual_rent) || 0 }));
  const finished = apt.status === "terminated" || apt.status === "expired";
  const currentRent = Number(apt.annual_rent) || (apt.rent_cheques || []).reduce((t, c) => t + (Number(c.amount) || 0), 0) || (Number(apt.monthly_rent) || 0) * 12;
  const list = [...history];
  if (!finished && apt.start_operation_date && !history.some((h) => h.start === apt.start_operation_date)) {
    list.push({ start: apt.start_operation_date, end: apt.tenancy_end_date || null, annualRent: currentRent });
  }
  if (!list.length) {
    list.push({ start: "0000-01-01", end: null, annualRent: currentRent });
  }
  return list.sort((a, b) => a.start.localeCompare(b.start));
}
function rentForDay(tenancies, date, holdover) {
  for (let i = tenancies.length - 1; i >= 0; i--) {
    const t = tenancies[i];
    if (date < t.start) continue;
    const isLast = i === tenancies.length - 1;
    if (t.end && date > t.end && !(isLast && holdover)) continue;
    if (t.start === "0000-01-01") return t.annualRent / 365;
    const start = parseISO(t.start);
    const years = Math.max(0, Math.floor(differenceInCalendarDays(parseISO(date), start) / 366));
    let anniv = addYears(start, years);
    while (dayStr(addYears(anniv, 1)) <= date) anniv = addYears(anniv, 1);
    const yearLength = differenceInCalendarDays(addYears(anniv, 1), anniv);
    return t.annualRent / yearLength;
  }
  return null;
}
function calculateDailyPL(data, startDate, endDate, apartmentId) {
  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime()) || startDate > endDate) return [];
  const from = dayStr(startDate);
  const to = dayStr(endDate);
  const apartments = apartmentId ? data.apartments.filter((a) => a.apartment_id === apartmentId) : data.apartments;
  const byNight = /* @__PURE__ */ new Map();
  const cost = /* @__PURE__ */ new Map();
  for (const r of data.reservations) {
    if (!r.check_in || !r.check_out) continue;
    const nights = nightsOf(r);
    const perNight = (Number(r.net_payout) || 0) / nights;
    for (let i = 0; i < nights; i++) {
      const d = dayStr(addDays(parseISO(r.check_in), i));
      if (d < from || d > to) continue;
      const key = `${r.apartment_id}|${d}`;
      const slot = byNight.get(key) ?? { retained: 0, lost: 0 };
      if (r.status !== "cancelled") {
        if (!slot.booked) slot.booked = r;
      } else if (r.cancellation_policy === "non-refundable") slot.retained += perNight;
      else slot.lost += perNight;
      byNight.set(key, slot);
    }
    if (r.status !== "cancelled") {
      for (const c of r.other_booking_costs || []) {
        const d = (c.date || r.check_out).slice(0, 10);
        if (d < from || d > to) continue;
        const key = `${r.apartment_id}|${d}`;
        cost.set(key, (cost.get(key) ?? 0) + (Number(c.amount) || 0));
      }
    }
  }
  const expenses = /* @__PURE__ */ new Map();
  for (const e of data.dailyExpenses) {
    const d = (e.date || "").slice(0, 10);
    if (d < from || d > to) continue;
    const key = `${e.apartment_id}|${d}`;
    expenses.set(key, (expenses.get(key) ?? 0) + (Number(e.amount) || 0));
  }
  const bills = /* @__PURE__ */ new Map();
  const otherBills = /* @__PURE__ */ new Map();
  for (const b of data.monthlyBills) {
    if (b.bill_type === "electricity" || b.bill_type === "internet") {
      bills.set(`${b.apartment_id}|${b.month}|${b.bill_type}`, Number(b.amount) || 0);
    } else {
      const k = `${b.apartment_id}|${b.month}`;
      otherBills.set(k, (otherBills.get(k) ?? 0) + (Number(b.amount) || 0));
    }
  }
  const services = /* @__PURE__ */ new Map();
  for (const sr of data.serviceRecords || []) {
    const d = (sr.date || "").slice(0, 10);
    if (d < from || d > to) continue;
    const key = `${sr.apartment_id}|${d}`;
    services.set(key, (services.get(key) ?? 0) + (Number(sr.total_cost) || 0));
  }
  const totalUnits = data.apartments.length;
  const rows = [];
  for (let t = parseISO(from); dayStr(t) <= to; t = addDays(t, 1)) {
    const date = dayStr(t);
    const month = date.slice(0, 7);
    const daysInMonth = getDaysInMonth(t);
    const shared = totalUnits ? (expenses.get(`PORTFOLIO|${date}`) ?? 0) / totalUnits : 0;
    for (const apt of apartments) {
      const key = `${apt.apartment_id}|${date}`;
      const holdover = apt.status !== "terminated" && apt.status !== "expired";
      const rent = rentForDay(tenanciesOf(apt), date, holdover);
      const operating = rent !== null;
      const night = byNight.get(key);
      const booked = night?.booked;
      const elecBill = bills.get(`${apt.apartment_id}|${month}|electricity`);
      const netBill = bills.get(`${apt.apartment_id}|${month}|internet`);
      const elecMonthly = elecBill ?? (operating ? Number(apt.utilities_monthly_defaults?.electricity) || 0 : 0);
      const netMonthly = netBill ?? (operating ? Number(apt.utilities_monthly_defaults?.internet) || 0 : 0);
      const revenue = booked ? (Number(booked.net_payout) || 0) / nightsOf(booked) : 0;
      const retained = night?.retained ?? 0;
      const cleaning = booked ? (Number(booked.cleaning_cost) || 0) / nightsOf(booked) : 0;
      const other = cost.get(key) ?? 0;
      const unitOnly = expenses.get(key) ?? 0;
      const direct = unitOnly + shared;
      const otherBillsDaily = (otherBills.get(`${apt.apartment_id}|${month}`) ?? 0) / daysInMonth;
      const service = services.get(key) ?? 0;
      const dailyRent = rent ?? 0;
      const total = dailyRent + elecMonthly / daysInMonth + netMonthly / daysInMonth + otherBillsDaily + cleaning + other + direct + service;
      rows.push({
        date,
        apartment: apt.name,
        apartment_id: apt.apartment_id,
        operating,
        occupied: booked ? "yes" : "no",
        occupied_nights_count: booked ? 1 : 0,
        daily_revenue: revenue + retained,
        retained_revenue: retained,
        lost_revenue: night?.lost ?? 0,
        daily_rent: dailyRent,
        daily_electricity: elecMonthly / daysInMonth,
        daily_internet: netMonthly / daysInMonth,
        daily_other_bills: otherBillsDaily,
        cleaning_allocated: cleaning,
        other_costs_allocated: other,
        real_time_expenses: direct,
        unit_expenses: unitOnly,
        shared_expenses: shared,
        service_costs: service,
        total_daily_cost: total,
        daily_profit: revenue + retained - total
      });
    }
  }
  return rows;
}

// src/lib/ownerStatement.ts
function sharesOn(shares, propertyId, date) {
  let start = "";
  for (const s of shares) {
    if (s.property_id === propertyId && s.effective_from <= date && s.effective_from > start) start = s.effective_from;
  }
  const out = /* @__PURE__ */ new Map();
  if (!start) return out;
  for (const s of shares) if (s.property_id === propertyId && s.effective_from === start) out.set(s.entity_id, Number(s.share));
  return out;
}
var MAX_STATEMENT_ITEMS = 100;
var r2 = (n) => Math.round(n * 100) / 100;
function buildStatement(input) {
  const { data, rates, baseCurrency, shares, entityId, reportingCurrency, start, end } = input;
  const missing = /* @__PURE__ */ new Set();
  const lines = [];
  const owned = new Set(shares.filter((s) => s.entity_id === entityId).map((s) => s.property_id));
  for (const apt of data.apartments) {
    if (!owned.has(apt.apartment_id)) continue;
    const currency = apt.currency || baseCurrency;
    const view = convertUserData(data, currency, rates, baseCurrency).data;
    const rows = calculateDailyPL(view, /* @__PURE__ */ new Date(`${start}T00:00:00`), /* @__PURE__ */ new Date(`${end}T00:00:00`), apt.apartment_id);
    let revenue = 0, costs = 0, profit = 0, nights = 0, ownerProfit = 0, ownerReporting = 0, touched = false;
    const b = { rent: 0, utilities: 0, cleaning: 0, bookingCosts: 0, unitExpenses: 0, sharedExpenses: 0, vendorWork: 0 };
    for (const row of rows) {
      const pct2 = sharesOn(shares, apt.apartment_id, row.date).get(entityId) ?? 0;
      revenue += row.daily_revenue;
      costs += row.total_daily_cost;
      b.rent += row.daily_rent;
      b.utilities += row.daily_electricity + row.daily_internet + row.daily_other_bills;
      b.cleaning += row.cleaning_allocated;
      b.bookingCosts += row.other_costs_allocated;
      b.unitExpenses += row.unit_expenses;
      b.sharedExpenses += row.shared_expenses;
      b.vendorWork += row.service_costs;
      profit += row.daily_profit;
      nights += row.occupied_nights_count;
      if (!pct2) continue;
      touched = true;
      const part = row.daily_profit * pct2 / 100;
      ownerProfit += part;
      const conv = convert(part, currency, reportingCurrency, row.date, rates);
      if (conv === null) missing.add(currency);
      else ownerReporting += conv;
    }
    if (!touched) continue;
    const inPeriod = (d) => !!d && d.slice(0, 10) >= start && d.slice(0, 10) <= end;
    const vendorName = (id) => view.vendors?.find((v) => v.vendor_id === id)?.name ?? "";
    const items = [
      ...view.dailyExpenses.filter((e) => e.apartment_id === apt.apartment_id && inPeriod(e.date)).map((e) => ({
        date: e.date.slice(0, 10),
        type: "expense",
        category: e.category || "Expense",
        description: (e.notes || "").slice(0, 200),
        amount: r2(Number(e.amount) || 0)
      })),
      ...(view.serviceRecords || []).filter((x) => x.apartment_id === apt.apartment_id && inPeriod(x.date)).map((x) => ({
        date: x.date.slice(0, 10),
        type: "vendor_work",
        category: x.service_type || "Vendor work",
        description: [vendorName(x.vendor_id), x.description].filter(Boolean).join(": ").slice(0, 200),
        amount: r2(Number(x.total_cost) || 0)
      }))
    ].sort((a, c) => a.date.localeCompare(c.date));
    lines.push({
      propertyId: apt.apartment_id,
      propertyName: apt.name || apt.apartment_id,
      currency,
      revenue: r2(revenue),
      costs: r2(costs),
      profit: r2(profit),
      nightsBooked: nights,
      shareStart: sharesOn(shares, apt.apartment_id, start).get(entityId) ?? 0,
      shareEnd: sharesOn(shares, apt.apartment_id, end).get(entityId) ?? 0,
      ownerProfit: r2(ownerProfit),
      ownerProfitReporting: r2(ownerReporting),
      costBreakdown: {
        rent: r2(b.rent),
        utilities: r2(b.utilities),
        cleaning: r2(b.cleaning),
        bookingCosts: r2(b.bookingCosts),
        unitExpenses: r2(b.unitExpenses),
        sharedExpenses: r2(b.sharedExpenses),
        vendorWork: r2(b.vendorWork)
      },
      items: items.slice(0, MAX_STATEMENT_ITEMS),
      ...items.length > MAX_STATEMENT_ITEMS ? { itemsMore: {
        count: items.length - MAX_STATEMENT_ITEMS,
        amount: r2(items.slice(MAX_STATEMENT_ITEMS).reduce((t, it) => t + it.amount, 0))
      } } : {}
    });
  }
  lines.sort((a, b) => a.propertyName.localeCompare(b.propertyName));
  return {
    entityId,
    start,
    end,
    reportingCurrency,
    lines,
    totalReporting: r2(lines.reduce((t, l) => t + l.ownerProfitReporting, 0)),
    missingRates: [...missing]
  };
}

// src/lib/statementPdf.ts
var safe = (s) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^\x20-\x7E]/g, "?");
var money = (v, currency) => {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency, currencyDisplay: "code", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v).replace(/ /g, " ");
  } catch {
    return `${currency} ${v.toFixed(2)}`;
  }
};
var day = (iso2) => (/* @__PURE__ */ new Date(`${iso2}T00:00:00`)).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
var pct = (a, b) => a === b ? `${a}%` : `${a}% to ${b}%`;
var MAX_ITEMS = 40;
function costParts(l) {
  const b = l.costBreakdown;
  if (!b) return [];
  const parts = [
    ["Rent", b.rent],
    ["Utilities and bills", b.utilities],
    ["Cleaning", b.cleaning],
    ["Other booking costs", b.bookingCosts],
    ["Expenses for this property", b.unitExpenses],
    ["Share of shared expenses", b.sharedExpenses],
    ["Vendor work", b.vendorWork]
  ];
  return parts.filter(([, v]) => Math.abs(v) >= 5e-3);
}
async function statementPdf(s, meta) {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const doc = await PDFDocument.create();
  doc.setTitle(safe(`Owner statement - ${meta.ownerName} - ${s.start} to ${s.end}`));
  doc.setProducer("Staylytics");
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.09, 0.09, 0.11), quiet = rgb(0.42, 0.42, 0.46), rule = rgb(0.85, 0.85, 0.87);
  let page = doc.addPage([595.28, 841.89]);
  const left = 48, right = 547;
  let y = 790;
  const text = (t, x, size = 10, f = font, color = ink) => page.drawText(safe(t), { x, y, size, font: f, color });
  const textRight = (t, xRight, size = 10, f = font, color = ink) => {
    const w = f.widthOfTextAtSize(safe(t), size);
    page.drawText(safe(t), { x: xRight - w, y, size, font: f, color });
  };
  const line = () => page.drawLine({ start: { x: left, y: y + 6 }, end: { x: right, y: y + 6 }, thickness: 0.6, color: rule });
  const newPageIfNeeded = (need) => {
    if (y - need < 60) {
      page = doc.addPage([595.28, 841.89]);
      y = 790;
    }
  };
  text("Owner statement", left, 20, bold);
  y -= 26;
  text(meta.ownerName, left, 12, bold);
  y -= 16;
  text(`${day(s.start)} to ${day(s.end)}`, left, 10, font, quiet);
  y -= 14;
  text(`Prepared by ${meta.workspaceName} on ${day((/* @__PURE__ */ new Date()).toISOString().slice(0, 10))}`, left, 9, font, quiet);
  y -= 34;
  text("Your share of profit", left, 10, font, quiet);
  y -= 22;
  text(money(s.totalReporting, s.reportingCurrency), left, 22, bold);
  y -= 36;
  const cols = { name: left, rev: 300, cost: 370, profit: 440, share: 482, mine: right };
  text("Property", cols.name, 9, bold, quiet);
  textRight("Revenue", cols.rev, 9, bold, quiet);
  textRight("Costs", cols.cost, 9, bold, quiet);
  textRight("Profit", cols.profit, 9, bold, quiet);
  textRight("Share", cols.share, 9, bold, quiet);
  textRight("Your part", cols.mine, 9, bold, quiet);
  y -= 8;
  line();
  y -= 14;
  for (const l of s.lines) {
    newPageIfNeeded(48);
    text(l.propertyName.slice(0, 40), cols.name, 10, bold);
    textRight(money(l.revenue, l.currency), cols.rev, 9);
    textRight(money(l.costs, l.currency), cols.cost, 9);
    textRight(money(l.profit, l.currency), cols.profit, 9);
    textRight(pct(l.shareStart, l.shareEnd), cols.share, 9);
    textRight(money(l.ownerProfit, l.currency), cols.mine, 9, bold);
    y -= 13;
    text(`${l.nightsBooked} nights booked`, cols.name, 8, font, quiet);
    if (l.currency !== s.reportingCurrency) textRight(`= ${money(l.ownerProfitReporting, s.reportingCurrency)}`, cols.mine, 8, font, quiet);
    y -= 12;
    const parts = costParts(l);
    if (parts.length) {
      for (const [label, v] of parts) {
        newPageIfNeeded(12);
        text(label, cols.name + 10, 8, font, quiet);
        textRight(money(v, l.currency), cols.cost, 8, font, quiet);
        y -= 11;
      }
    }
    const items = l.items ?? [];
    if (items.length) {
      newPageIfNeeded(24);
      y -= 2;
      text("Expenses and work on this property", cols.name + 10, 8, bold, quiet);
      y -= 11;
      const shown = items.slice(0, MAX_ITEMS);
      for (const it of shown) {
        newPageIfNeeded(12);
        const what = [it.category, it.description].filter(Boolean).join(" - ");
        text(day(it.date), cols.name + 10, 8, font, quiet);
        text(what.slice(0, 62), cols.name + 72, 8, font, ink);
        textRight(money(it.amount, l.currency), cols.cost, 8, font, ink);
        y -= 11;
      }
      const moreCount = items.length - shown.length + (l.itemsMore?.count ?? 0);
      if (moreCount > 0) {
        const rest = items.slice(MAX_ITEMS).reduce((t, it) => t + it.amount, 0) + (l.itemsMore?.amount ?? 0);
        text(`and ${moreCount} more`, cols.name + 72, 8, font, quiet);
        textRight(money(rest, l.currency), cols.cost, 8, font, quiet);
        y -= 11;
      }
    }
    y -= 2;
    line();
    y -= 14;
  }
  if (!s.lines.length) {
    text("No property income or costs in this period.", left, 10, font, quiet);
    y -= 20;
  }
  newPageIfNeeded(110);
  y -= 10;
  text("Total, your share", left, 11, bold);
  textRight(money(s.totalReporting, s.reportingCurrency), right, 11, bold);
  y -= 30;
  const notes = [
    "Each property is worked out in its own currency. Your part follows the shares in force on each day.",
    "Cost lines and listed expenses are for the whole property, before your share is applied.",
    s.lines.some((l) => l.currency !== s.reportingCurrency) ? `Amounts in other currencies are converted to ${s.reportingCurrency} at the daily reference rate for each day.` : "",
    s.missingRates.length ? `No exchange rate was available for ${s.missingRates.join(", ")} on some days; those days are left out of the ${s.reportingCurrency} total.` : "",
    "This statement summarises the records kept in Staylytics. It is not tax advice."
  ].filter(Boolean);
  for (const n of notes) {
    newPageIfNeeded(14);
    text(n, left, 8, font, quiet);
    y -= 12;
  }
  return doc.save();
}

// src/server/ownerReports.ts
var pad = (n) => String(n).padStart(2, "0");
var iso = (y, m, d) => {
  const dt = new Date(Date.UTC(y, m, d));
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
};
function localToday(timezone, now) {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: timezone || "UTC", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}
function duePeriods(frequency, today2) {
  const y = Number(today2.slice(0, 4)), m = Number(today2.slice(5, 7)) - 1, d = Number(today2.slice(8, 10));
  const out = [];
  if (d > 1) out.push({ kind: "month_to_date", start: iso(y, m, 1), end: iso(y, m, d - 1) });
  if (frequency === "monthly" || frequency === "monthly_and_yearly") out.push({ kind: "monthly", start: iso(y, m - 1, 1), end: iso(y, m, 0) });
  if (frequency === "quarterly") {
    const q = Math.floor(m / 3);
    out.push({ kind: "quarterly", start: iso(y, (q - 1) * 3, 1), end: iso(y, q * 3, 0) });
  }
  if (frequency === "monthly_and_yearly") out.push({ kind: "yearly", start: iso(y - 1, 0, 1), end: iso(y - 1, 11, 31) });
  return out;
}
function planWorkspace(ws, rates, now) {
  const today2 = localToday(ws.timezone, now);
  const data = assembleUserData({
    properties: ws.properties,
    property_rent_cheques: [],
    property_setup_costs: [],
    tables: {
      reservations: ws.reservations,
      daily_expenses: ws.daily_expenses,
      monthly_bills: ws.monthly_bills,
      service_records: ws.service_records ?? [],
      vendors: ws.vendors ?? []
    }
  });
  const done = new Set(ws.statements.map((s) => `${s.entity_id}|${s.kind}|${String(s.period_start).slice(0, 10)}`));
  const shares = ws.shares.map((s) => ({ ...s, effective_from: String(s.effective_from).slice(0, 10), share: Number(s.share) }));
  const owners = new Set(shares.map((s) => s.entity_id));
  const out = [];
  for (const e of ws.entities) {
    if (!owners.has(e.id)) continue;
    for (const p of duePeriods(e.report_frequency, today2)) {
      if (p.kind !== "month_to_date" && done.has(`${e.id}|${p.kind}|${p.start}`)) continue;
      const statement = buildStatement({
        data,
        rates,
        baseCurrency: ws.base_currency,
        shares,
        entityId: e.id,
        reportingCurrency: e.reporting_currency,
        start: p.start,
        end: p.end
      });
      if (!statement.lines.length) continue;
      out.push({
        org_id: ws.org_id,
        entity_id: e.id,
        kind: p.kind,
        period_start: p.start,
        period_end: p.end,
        currency: statement.reportingCurrency,
        total: statement.totalReporting,
        statement
      });
    }
  }
  return out;
}
function planAll(payload, now) {
  const rates = buildRates(payload.rates);
  return payload.workspaces.flatMap((ws) => planWorkspace(ws, rates, now));
}
var esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
var money2 = (v, currency) => {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency, currencyDisplay: "code", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v).replace(/ /g, " ");
  } catch {
    return `${currency} ${v.toFixed(2)}`;
  }
};
var monthName = (isoDate) => (/* @__PURE__ */ new Date(`${isoDate}T00:00:00Z`)).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
function periodLabel(kind, start) {
  if (kind === "yearly") return start.slice(0, 4);
  if (kind === "quarterly") return `Q${Math.floor((Number(start.slice(5, 7)) - 1) / 3) + 1} ${start.slice(0, 4)}`;
  return monthName(start);
}
function buildOwnerEmail(input) {
  const period = periodLabel(input.kind, input.periodStart);
  const total = money2(input.total, input.currency);
  const portal = `${input.appUrl.replace(/\/$/, "")}/owner`;
  const subject = `Your owner statement for ${period} from ${input.workspaceName}`.slice(0, 200);
  const text = [
    `Dear ${input.ownerName},`,
    "",
    `Your owner statement for ${period} from ${input.workspaceName} is attached.`,
    `Your share of profit: ${total}.`,
    "",
    `If you have an owner login, you can see this and the month so far at ${portal}.`,
    "",
    `If you would rather not receive these emails, reply to ${input.workspaceName} and ask them to stop.`
  ].join("\n");
  const html = `<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;color:#18181b;line-height:1.5">
<p>Dear ${esc(input.ownerName)},</p>
<p>Your owner statement for <strong>${esc(period)}</strong> from ${esc(input.workspaceName)} is attached.</p>
<p style="font-size:13px;color:#52525b;margin-bottom:2px">Your share of profit</p>
<p style="font-size:22px;font-weight:bold;margin-top:0">${esc(total)}</p>
<p>If you have an owner login, you can see this and the month so far at <a href="${esc(portal)}">${esc(portal)}</a>.</p>
<p style="font-size:12px;color:#71717a">If you would rather not receive these emails, reply to ${esc(input.workspaceName)} and ask them to stop.</p>
</body></html>`;
  const filename = `owner-statement-${period.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.pdf`;
  return { subject, text, html, filename };
}
export {
  buildOwnerEmail,
  duePeriods,
  localToday,
  periodLabel,
  planAll,
  planWorkspace,
  statementPdf
};
