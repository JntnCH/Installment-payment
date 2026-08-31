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

// 1. DAILY INFORMAL LOAN CALCULATION (เงินกู้รายวันนอกระบบ / หักค่าใช้จ่าย / คิดเงินที่ได้รับจริง)
export interface DailyLoanParams {
  principal: number; // ยอดเงินต้นตามสัญญา (เช่น 4,000)
  ratePercent?: number; // อัตราดอกเบี้ยรวม (%)
  dailyInstallment?: number; // หรือระบุยอดจ่ายต่อวัน/ต่องวด (เช่น 200)
  days: number; // ระยะเวลา (เช่น 25 วัน)
  feeAmount: number; // หักค่าทำสัญญา/ค่าเอกสาร (เช่น 250)
  firstDeductAmount: number; // หักค่างวดแรก (เช่น 200)
  actualReceivedAmount?: number; // จำนวนเงินที่ได้รับจริง (เช่น 3,550)
  startDate: string;
  skipSundays?: boolean;
}

export function calculateDailyLoan(params: DailyLoanParams) {
  const { principal, days, feeAmount, firstDeductAmount, actualReceivedAmount, startDate, skipSundays } = params;
  const safeDays = Math.max(1, days);
  const safePrincipal = Math.max(0, principal);

  let dailyInstallment = params.dailyInstallment ? Math.max(0, params.dailyInstallment) : 0;
  let totalRepayment = 0;
  let interest = 0;
  let ratePercent = params.ratePercent !== undefined ? params.ratePercent : 0;

  // If daily installment was provided (or calculated from total e.g. 200/day * 25 days = 5,000)
  // Auto calculate interest if not specified! (5,000 - 4,000 = 1,000 interest -> 25%)
  if (dailyInstallment > 0) {
    totalRepayment = dailyInstallment * safeDays;
    interest = Math.max(0, totalRepayment - safePrincipal);
    ratePercent = safePrincipal > 0 ? (interest / safePrincipal) * 100 : 0;
  } else if (params.ratePercent !== undefined && params.ratePercent > 0) {
    // If ratePercent was provided
    interest = (safePrincipal * ratePercent) / 100;
    totalRepayment = safePrincipal + interest;
    dailyInstallment = safeDays > 0 ? Math.ceil(totalRepayment / safeDays) : totalRepayment;
  } else {
    // Default zero interest if neither given
    interest = 0;
    totalRepayment = safePrincipal;
    dailyInstallment = safeDays > 0 ? Math.ceil(safePrincipal / safeDays) : safePrincipal;
    ratePercent = 0;
  }

  // Net Disbursed: if actualReceivedAmount is specified, use it directly, else calculate principal - fee - firstDeduct
  let netDisbursed = 0;
  if (actualReceivedAmount !== undefined && actualReceivedAmount > 0) {
    netDisbursed = actualReceivedAmount;
  } else {
    netDisbursed = Math.max(0, safePrincipal - feeAmount - firstDeductAmount);
  }

  const totalDeductions = Math.max(0, safePrincipal - netDisbursed);
  const totalCost = interest + feeAmount;
  const netReceivedInterestRate = netDisbursed > 0 ? ((totalRepayment - netDisbursed) / netDisbursed) * 100 : 0;
  const dailyRate = safeDays > 0 ? ratePercent / safeDays : 0;

  // Annualized Rate approximation
  const durationInYears = safeDays / 365;
  const effectiveAPR = durationInYears > 0 ? (totalCost / Math.max(1, netDisbursed)) / durationInYears * 100 : 0;

  const schedules: GeneratedScheduleItem[] = [];
  const currentPrincipalPart = safeDays > 0 ? safePrincipal / safeDays : safePrincipal;
  const currentInterestPart = safeDays > 0 ? interest / safeDays : interest;

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
    principal: safePrincipal,
    interest,
    ratePercent,
    dailyRate,
    feeAmount,
    firstDeductAmount,
    actualReceived: netDisbursed,
    totalDeductions,
    totalRepayment,
    dailyInstallment,
    netDisbursed,
    totalCost,
    netReceivedInterestRate,
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

// 3. FLAT RATE INSTALLMENT (ผ่อนสินค้า / ดอกเบี้ยคงที่ / คำนวณราคาสินค้าหรือดอกเบี้ยอัตโนมัติ)
export interface FlatInstallmentParams {
  price?: number; // ราคาสินค้าเต็ม (เช่น 24,900)
  downPayment?: number; // เงินดาวน์ (เช่น 8,500)
  otherFees?: number; // ค่าใช้จ่ายอื่นๆ (เช่น ค่าธรรมเนียม, ประกัน, ค่าเปิดบิล)
  ratePercent?: number; // ดอกเบี้ยทั้งสัญญา (%)
  installmentCount: number; // จำนวนงวด (เช่น 12)
  installmentAmount?: number; // ค่างวดต่อรอบ (เช่น 1,500 บาท/งวด)
  frequency?: "monthly" | "biweekly" | "weekly"; // 1 เดือน, 15 วัน, 7 วัน
  startDate: string;
  calcMode?: "by_price_rate" | "by_installment"; // โหมดคำนวณ: รู้ราคา+ดอกเบี้ย หรือ รู้ค่างวด
}

export function calculateFlatInstallment(params: FlatInstallmentParams) {
  const {
    price = 0,
    downPayment = 0,
    otherFees = 0,
    ratePercent = 0,
    installmentCount,
    installmentAmount = 0,
    frequency = "monthly",
    startDate,
    calcMode = "by_price_rate",
  } = params;

  const safeCount = Math.max(1, installmentCount);
  const safeDown = Math.max(0, downPayment);
  const safeFees = Math.max(0, otherFees);

  let calculatedPrice = Math.max(0, price);
  let calculatedInterest = 0;
  let calculatedRatePercent = Math.max(0, ratePercent);
  let totalRepayment = 0;
  let perInstallment = 0;
  let principal = 0;

  if (calcMode === "by_installment" || (installmentAmount > 0 && calculatedPrice === 0)) {
    // Mode A: User knows installment amount (e.g. 1,500 / month * 12 months)
    perInstallment = installmentAmount;
    totalRepayment = perInstallment * safeCount;

    if (calculatedPrice > 0) {
      // User gave price AND installment -> auto calculate interest & ratePercent
      principal = Math.max(0, calculatedPrice - safeDown + safeFees);
      calculatedInterest = Math.max(0, totalRepayment - principal);
      calculatedRatePercent = principal > 0 ? (calculatedInterest / principal) * 100 : 0;
    } else {
      // User did NOT know price -> auto calculate price based on totalRepayment
      if (ratePercent > 0) {
        principal = totalRepayment / (1 + ratePercent / 100);
        calculatedInterest = totalRepayment - principal;
        calculatedPrice = Math.max(0, principal + safeDown - safeFees);
        calculatedRatePercent = ratePercent;
      } else {
        // 0% interest default
        principal = totalRepayment;
        calculatedInterest = 0;
        calculatedPrice = Math.max(0, totalRepayment + safeDown - safeFees);
        calculatedRatePercent = 0;
      }
    }
  } else {
    // Mode B: User knows price (or price was given)
    principal = Math.max(0, calculatedPrice - safeDown + safeFees);
    calculatedInterest = (principal * calculatedRatePercent) / 100;
    totalRepayment = principal + calculatedInterest;
    perInstallment = safeCount > 0 ? totalRepayment / safeCount : totalRepayment;
  }

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
      interestPart: calculatedInterest / safeCount,
      note: `งวดที่ ${i}/${safeCount} (${frequency === "weekly" ? "7 วัน" : frequency === "biweekly" ? "15 วัน" : "1 เดือน"})`,
    });
  }

  const cycleLabel =
    frequency === "weekly" ? "ทุก 7 วัน" : frequency === "biweekly" ? "ทุก 15 วัน" : "รายเดือน (1 เดือน)";

  return {
    price: calculatedPrice,
    downPayment: safeDown,
    otherFees: safeFees,
    principal,
    interest: calculatedInterest,
    ratePercent: calculatedRatePercent,
    totalRepayment,
    perInstallment,
    frequency,
    cycleLabel,
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
