/**
 * Core Financial & Loan Calculation Engine
 * Supports Informal Loans (เงินกู้นอกระบบ, ดอกรายวัน, ดอกลอย),
 * Flat Rate Installments (ผ่อนสินค้าคงที่), and
 * Amortization Loans (ลดต้นลดดอก).
 */

export type LoanType = "daily_informal" | "floating_interest" | "flat_installment" | "effective_amortization";

export interface GeneratedScheduleItem {
  installmentNo: number;
  dueDate: string;
  amount: number;
  principalPart: number;
  interestPart: number;
  remainingBalance?: number;
  note: string;
}

export function formatMoney(val: number | string | null | undefined): string {
  const num = Number(val ?? 0);
  return new Intl.NumberFormat("th-TH", {
    style: "currency",
    currency: "THB",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(num) ? num : 0);
}

export function formatPercent(val: number | string | null | undefined): string {
  const num = Number(val ?? 0);
  return `${(Number.isFinite(num) ? num : 0).toFixed(2)}%`;
}

/** Add N days to date string (YYYY-MM-DD), skipping Sundays if requested */
export function addDays(startDateStr: string, daysToAdd: number, skipSundays = false): string {
  const [year, month, day] = startDateStr.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  
  if (!skipSundays) {
    date.setDate(date.getDate() + daysToAdd);
  } else {
    let added = 0;
    while (added < daysToAdd) {
      date.setDate(date.getDate() + 1);
      if (date.getDay() !== 0) { // 0 = Sunday
        added++;
      }
    }
  }
  
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Add N months to date string (YYYY-MM-DD) */
export function addMonths(startDateStr: string, monthsToAdd: number): string {
  const [year, month, day] = startDateStr.split("-").map(Number);
  const date = new Date(year, month - 1 + monthsToAdd, day);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Add N weeks to date string */
export function addWeeks(startDateStr: string, weeksToAdd: number): string {
  return addDays(startDateStr, weeksToAdd * 7, false);
}

// 1. DAILY INFORMAL LOAN CALCULATION (เงินกู้รายวันนอกระบบ)
export interface DailyLoanParams {
  principal: number;
  ratePercent: number; // e.g. 20% for the cycle
  days: number; // e.g. 24 or 30 days
  feeAmount: number; // Document/setup fee
  firstDeductAmount: number; // Collect first installment immediately on disbursement
  startDate: string;
  skipSundays?: boolean;
}

export function calculateDailyLoan(params: DailyLoanParams) {
  const { principal, ratePercent, days, feeAmount, firstDeductAmount, startDate, skipSundays } = params;
  const safeDays = Math.max(1, days);
  const interest = (principal * ratePercent) / 100;
  const totalRepayment = principal + interest;
  const dailyInstallment = Math.ceil(totalRepayment / safeDays);
  const netDisbursed = Math.max(0, principal - feeAmount - firstDeductAmount);
  const totalProfit = interest + feeAmount;
  
  // Annualized Rate approximation
  const durationInYears = safeDays / 365;
  const effectiveAPR = durationInYears > 0 ? (totalProfit / Math.max(1, netDisbursed)) / durationInYears * 100 : 0;

  const schedules: GeneratedScheduleItem[] = [];
  let currentPrincipalPart = principal / safeDays;
  let currentInterestPart = interest / safeDays;

  for (let i = 1; i <= safeDays; i++) {
    const dueDate = addDays(startDate, i - 1, skipSundays);
    schedules.push({
      installmentNo: i,
      dueDate,
      amount: dailyInstallment,
      principalPart: currentPrincipalPart,
      interestPart: currentInterestPart,
      note: i === 1 && firstDeductAmount > 0 ? `งวดที่ 1 (หักล่วงหน้า ${formatMoney(firstDeductAmount)})` : `งวดที่ ${i}`,
    });
  }

  const endDate = schedules.length > 0 ? schedules[schedules.length - 1].dueDate : startDate;

  return {
    principal,
    interest,
    feeAmount,
    firstDeductAmount,
    totalRepayment,
    dailyInstallment,
    netDisbursed,
    totalProfit,
    effectiveAPR,
    endDate,
    schedules,
  };
}

// 2. FLOATING / INTEREST-ONLY LOAN (ดอกลอย / ส่งเฉพาะดอกเบี้ย)
export interface FloatingLoanParams {
  principal: number;
  interestRatePerCycle: number; // e.g. 10% per month or 5% per 15 days
  cycleType: "daily" | "weekly" | "biweekly" | "monthly";
  cycleCount: number; // Projected cycles
  feeAmount: number;
  startDate: string;
}

export function calculateFloatingLoan(params: FloatingLoanParams) {
  const { principal, interestRatePerCycle, cycleType, cycleCount, feeAmount, startDate } = params;
  const safeCount = Math.max(1, cycleCount);
  const interestPerPeriod = (principal * interestRatePerCycle) / 100;
  const projectedInterestTotal = interestPerPeriod * safeCount;
  const totalRepayment = principal + projectedInterestTotal;
  const netDisbursed = Math.max(0, principal - feeAmount);

  const schedules: GeneratedScheduleItem[] = [];
  for (let i = 1; i <= safeCount; i++) {
    let dueDate = startDate;
    if (cycleType === "daily") dueDate = addDays(startDate, i);
    else if (cycleType === "weekly") dueDate = addWeeks(startDate, i);
    else if (cycleType === "biweekly") dueDate = addDays(startDate, i * 15);
    else dueDate = addMonths(startDate, i);

    schedules.push({
      installmentNo: i,
      dueDate,
      amount: interestPerPeriod,
      principalPart: 0,
      interestPart: interestPerPeriod,
      note: `ดอกเบี้ยงวดที่ ${i} (${interestRatePerCycle}% ต่อรอบ)`,
    });
  }

  return {
    principal,
    interestPerPeriod,
    projectedInterestTotal,
    totalRepayment,
    netDisbursed,
    schedules,
  };
}

// 3. FLAT RATE INSTALLMENT (ผ่อนสินค้า / ดอกเบี้ยคงที่)
export interface FlatInstallmentParams {
  price: number;
  downPayment: number;
  ratePercent: number; // Total or annual rate
  installmentCount: number;
  startDate: string;
  frequency?: "monthly" | "weekly" | "biweekly";
}

export function calculateFlatInstallment(params: FlatInstallmentParams) {
  const { price, downPayment, ratePercent, installmentCount, startDate, frequency = "monthly" } = params;
  const principal = Math.max(0, price - downPayment);
  const safeCount = Math.max(1, installmentCount);
  const interest = (principal * ratePercent) / 100;
  const totalRepayment = principal + interest;
  const perInstallment = totalRepayment / safeCount;

  const schedules: GeneratedScheduleItem[] = [];
  for (let i = 1; i <= safeCount; i++) {
    let dueDate = startDate;
    if (frequency === "monthly") dueDate = addMonths(startDate, i - 1);
    else if (frequency === "weekly") dueDate = addWeeks(startDate, i - 1);
    else dueDate = addDays(startDate, (i - 1) * 15);

    schedules.push({
      installmentNo: i,
      dueDate,
      amount: perInstallment,
      principalPart: principal / safeCount,
      interestPart: interest / safeCount,
      note: `งวดที่ ${i} จาก ${safeCount} งวด`,
    });
  }

  return {
    price,
    downPayment,
    principal,
    interest,
    totalRepayment,
    perInstallment,
    schedules,
  };
}

// 4. AMORTIZATION LOAN (ลดต้นลดดอก / สินเชื่อในระบบ)
export interface AmortizationParams {
  principal: number;
  annualRate: number; // e.g. 7.5% per annum
  months: number;
  startDate: string;
}

export function calculateAmortization(params: AmortizationParams) {
  const { principal, annualRate, months, startDate } = params;
  const safeMonths = Math.max(1, months);
  const monthlyRate = annualRate / 100 / 12;

  let monthlyPayment = 0;
  if (monthlyRate === 0) {
    monthlyPayment = principal / safeMonths;
  } else {
    monthlyPayment = (principal * monthlyRate * Math.pow(1 + monthlyRate, safeMonths)) / (Math.pow(1 + monthlyRate, safeMonths) - 1);
  }

  const schedules: GeneratedScheduleItem[] = [];
  let remaining = principal;
  let totalInterest = 0;

  for (let i = 1; i <= safeMonths; i++) {
    const interestPart = remaining * monthlyRate;
    const principalPart = monthlyPayment - interestPart;
    remaining = Math.max(0, remaining - principalPart);
    totalInterest += interestPart;

    schedules.push({
      installmentNo: i,
      dueDate: addMonths(startDate, i - 1),
      amount: monthlyPayment,
      principalPart,
      interestPart,
      remainingBalance: remaining,
      note: `งวดที่ ${i} (ต้น ${formatMoney(principalPart)} ดอก ${formatMoney(interestPart)})`,
    });
  }

  return {
    principal,
    monthlyPayment,
    totalPayment: monthlyPayment * safeMonths,
    totalInterest,
    schedules,
  };
}

// 5. LATE PENALTY / OVERDUE CALCULATION (คำนวณเบี้ยปรับล่าช้า)
export function calculateLateFee(amount: number, dueDateStr: string, dailyPenaltyPercent: number = 0.5, fixedDailyFee: number = 50) {
  if (!dueDateStr) return { daysOverdue: 0, penaltyAmount: 0, totalDue: amount };
  const dueMs = Date.parse(`${dueDateStr}T00:00:00+07:00`);
  const todayMs = Date.parse(`${new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" })}T00:00:00+07:00`);
  const diffDays = Math.max(0, Math.round((todayMs - dueMs) / 86_400_000));

  const percentagePenalty = (amount * (dailyPenaltyPercent / 100)) * diffDays;
  const fixedPenalty = fixedDailyFee * diffDays;
  const totalPenalty = percentagePenalty + fixedPenalty;

  return {
    daysOverdue: diffDays,
    percentagePenalty,
    fixedPenalty,
    totalPenalty,
    totalDue: amount + totalPenalty,
  };
}
