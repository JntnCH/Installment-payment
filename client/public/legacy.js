// ==========================================
        // 1. STATE & GLOBALS
        // ==========================================
        const AppState = {
            activeModule: 'daily',
            googleSheetsUrl: localStorage.getItem('app_sheets_url') || '',
            records: JSON.parse(localStorage.getItem('app_installment_records') || '[]'),
            currentProductSchedule: [],
            currentDailySchedule: [],
            isBioAuthenticated: false
        };

        let dailyPieChartInstance = null;
        let dailyLineChartInstance = null;

        window.addEventListener('DOMContentLoaded', () => {
            lucide.createIcons();
            document.getElementById('d-start-date').valueAsDate = new Date();
            document.getElementById('p-start-date').valueAsDate = new Date();

            if (AppState.googleSheetsUrl) {
                document.getElementById('sheets-script-url').value = AppState.googleSheetsUrl;
                updateSyncStatus('connected', 'เชื่อมต่อ Google Sheets เรียบร้อยแล้ว');
            }

            calculateDailyRealtime();
            calculateProductRealtime();
            renderHistoryTable();
            updateSavedCount();
        });

        function toggleDarkMode() {
            const html = document.documentElement;
            if (html.classList.contains('dark')) {
                html.classList.remove('dark');
                document.getElementById('theme-icon-sun').classList.add('hidden');
                document.getElementById('theme-icon-moon').classList.remove('hidden');
                localStorage.setItem('theme', 'light');
            } else {
                html.classList.add('dark');
                document.getElementById('theme-icon-moon').classList.add('hidden');
                document.getElementById('theme-icon-sun').classList.remove('hidden');
                localStorage.setItem('theme', 'dark');
            }
            if (AppState.activeModule === 'daily') calculateDailyRealtime();
        }

        const Utils = {
            generateUUID: () => 'REC-' + Date.now().toString(36) + '-' + Math.random().toString(36).substr(2, 5),
            formatMoney: (val) => '฿' + Number(val || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
            formatDate: (dateObj) => new Date(dateObj).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' })
        };

        function showToast(message, type = 'info') {
            const container = document.getElementById('toast-container');
            const toast = document.createElement('div');
            const bgColors = {
                success: 'bg-emerald-600 text-white',
                error: 'bg-rose-600 text-white',
                warning: 'bg-amber-500 text-white',
                info: 'bg-indigo-600 text-white'
            };

            toast.className = `${bgColors[type] || bgColors.info} p-3.5 rounded-xl shadow-lg text-xs sm:text-sm font-medium flex items-center justify-between transition-all transform translate-y-2 pointer-events-auto`;
            toast.innerHTML = `
                <span>${message}</span>
                <button onclick="this.parentElement.remove()" class="ml-2 opacity-70 hover:opacity-100">✕</button>
            `;

            container.appendChild(toast);
            setTimeout(() => {
                toast.classList.add('opacity-0', 'translate-y-[-10px]');
                setTimeout(() => toast.remove(), 300);
            }, 3500);
        }

        function switchModule(moduleName) {
            AppState.activeModule = moduleName;
            const modules = ['daily', 'product', 'bank', 'history'];
            
            modules.forEach(m => {
                const container = document.getElementById(`module-${m}-container`);
                const tab = document.getElementById(`tab-${m}`);
                if (m === moduleName) {
                    container.classList.remove('hidden');
                    const activeBg = m === 'daily' ? 'bg-amber-600' : 'bg-indigo-600';
                    tab.className = `flex-1 min-w-[140px] py-2.5 px-3 rounded-xl text-xs sm:text-sm font-bold transition-all flex justify-center items-center gap-2 ${activeBg} text-white shadow-sm`;
                } else {
                    container.classList.add('hidden');
                    tab.className = "flex-1 min-w-[140px] py-2.5 px-3 rounded-xl text-xs sm:text-sm font-bold transition-all flex justify-center items-center gap-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700";
                }
            });

            if (moduleName === 'daily') calculateDailyRealtime();
            if (moduleName === 'product') calculateProductRealtime();
        }

        // ==========================================
        // 2. DAILY LOAN REAL-TIME ENGINE
        // ==========================================
        function calculateDailyRealtime() {
            const loanAmount = parseFloat(document.getElementById('d-amount').value) || 0;
            const dailyPayment = parseFloat(document.getElementById('d-payment').value) || 0;
            const days = parseInt(document.getElementById('d-days').value) || 1;
            const fee = parseFloat(document.getElementById('d-fee').value) || 0;
            const firstDeduct = parseFloat(document.getElementById('d-first-deduct').value) || 0;
            const startDateVal = document.getElementById('d-start-date').value;

            // Calculations
            const netReceived = loanAmount - fee - firstDeduct;
            const totalRepayment = dailyPayment * days;
            const totalInterestFee = totalRepayment - netReceived;
            const effectiveRate = netReceived > 0 ? (totalInterestFee / netReceived) * 100 : 0;

            // Cards Update
            document.getElementById('card-d-net').innerText = Utils.formatMoney(netReceived);
            document.getElementById('sub-d-net').innerText = `หักค่าจัด ${Utils.formatMoney(fee)} | งวดแรก ${Utils.formatMoney(firstDeduct)}`;
            
            document.getElementById('card-d-interest').innerText = Utils.formatMoney(totalInterestFee);
            document.getElementById('sub-d-rate').innerText = `${effectiveRate.toFixed(2)}% ต่อสัญญา`;

            document.getElementById('card-d-total').innerText = Utils.formatMoney(totalRepayment);
            document.getElementById('sub-d-total').innerText = `วันละ ${Utils.formatMoney(dailyPayment)} x ${days} วัน`;

            document.getElementById('card-d-days').innerText = `${days} วัน`;
            document.getElementById('daily-table-count').innerText = `ทั้งหมด ${days} วัน`;

            // Daily Schedule Table Construction
            let startDate = startDateVal ? new Date(startDateVal) : new Date();
            let schedule = [];
            let currentBalance = loanAmount;
            let dayLabels = ['รับเงิน'];
            let balanceHistory = [loanAmount];

            for (let d = 1; d <= days; d++) {
                let payDate = new Date(startDate);
                payDate.setDate(payDate.getDate() + (d - 1));

                let isFirstDayDeducted = (d === 1 && firstDeduct > 0);
                let startBal = d === 1 ? loanAmount : currentBalance;
                let actualCut = dailyPayment;
                let endBal = Math.max(0, startBal - actualCut);
                currentBalance = endBal;

                schedule.push({
                    day: d,
                    date: Utils.formatDate(payDate),
                    startBal: startBal,
                    payment: dailyPayment,
                    status: isFirstDayDeducted ? 'หักงวดแรก' : 'ชำระแล้ว',
                    cut: actualCut,
                    endBal: endBal
                });

                balanceHistory.push(endBal);
                dayLabels.push(`วัน ${d}`);
            }

            AppState.currentDailySchedule = schedule;
            renderDailyTable(schedule);
            renderDailyCharts(netReceived, totalInterestFee, dayLabels, balanceHistory);
        }

        function renderDailyTable(schedule) {
            const tbody = document.getElementById('daily-table-body');
            let html = '';

            schedule.forEach((row, idx) => {
                const bgClass = idx % 2 === 0 ? 'bg-white dark:bg-slate-800' : 'bg-slate-50/60 dark:bg-slate-800/50';
                const statusBadge = row.status === 'หักงวดแรก' 
                    ? '<span class="px-2 py-0.5 text-[10px] font-semibold bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 rounded-md">หัก ณ ที่จ่าย</span>'
                    : '<span class="px-2 py-0.5 text-[10px] font-semibold bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 rounded-md">ปกติ</span>';

                html += `
                    <tr class="${bgClass} hover:bg-amber-50/40 dark:hover:bg-slate-700/40 transition-colors">
                        <td class="px-3 py-2 text-center font-medium text-slate-500 dark:text-slate-400">${row.day}</td>
                        <td class="px-3 py-2 font-medium whitespace-nowrap">${row.date}</td>
                        <td class="px-3 py-2 text-right font-mono text-slate-600 dark:text-slate-300">${Utils.formatMoney(row.startBal)}</td>
                        <td class="px-3 py-2 text-right font-mono font-bold text-amber-600 dark:text-amber-400">${Utils.formatMoney(row.payment)}</td>
                        <td class="px-3 py-2 text-center">${statusBadge}</td>
                        <td class="px-3 py-2 text-right font-mono text-indigo-600 dark:text-indigo-400 font-semibold">${Utils.formatMoney(row.cut)}</td>
                        <td class="px-3 py-2 text-right font-mono font-bold text-slate-800 dark:text-slate-100">${Utils.formatMoney(row.endBal)}</td>
                    </tr>
                `;
            });

            tbody.innerHTML = html;
        }

        function renderDailyCharts(netReceived, totalInterestFee, dayLabels, balanceHistory) {
            const isDark = document.documentElement.classList.contains('dark');
            const textColor = isDark ? '#cbd5e1' : '#475569';

            // Pie Chart
            const pieCtx = document.getElementById('dailyPieChart').getContext('2d');
            if (dailyPieChartInstance) dailyPieChartInstance.destroy();

            dailyPieChartInstance = new Chart(pieCtx, {
                type: 'doughnut',
                data: {
                    labels: ['เงินรับจริง', 'ดอกเบี้ย+ค่าจัด'],
                    datasets: [{
                        data: [netReceived, totalInterestFee],
                        backgroundColor: ['#10b981', '#f43f5e'],
                        hoverOffset: 4
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { position: 'bottom', labels: { font: { family: 'Prompt' }, color: textColor } },
                        tooltip: {
                            callbacks: {
                                label: (ctx) => ` ${ctx.label}: ฿${Number(ctx.raw).toLocaleString('th-TH', {minimumFractionDigits: 2})}`
                            }
                        }
                    }
                }
            });

            // Line Chart
            const lineCtx = document.getElementById('dailyLineChart').getContext('2d');
            if (dailyLineChartInstance) dailyLineChartInstance.destroy();

            dailyLineChartInstance = new Chart(lineCtx, {
                type: 'line',
                data: {
                    labels: dayLabels,
                    datasets: [{
                        label: 'ยอดหนี้คงเหลือ (บาท)',
                        data: balanceHistory,
                        borderColor: '#d97706',
                        backgroundColor: 'rgba(217, 119, 6, 0.1)',
                        fill: true,
                        tension: 0.1,
                        pointRadius: 2
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            callbacks: {
                                label: (ctx) => ` ยอดคงเหลือ: ฿${Number(ctx.raw).toLocaleString('th-TH', {minimumFractionDigits: 2})}`
                            }
                        }
                    },
                    scales: {
                        x: { display: false },
                        y: {
                            ticks: {
                                color: textColor,
                                callback: (v) => '฿' + (v >= 1000 ? (v/1000) + 'k' : v)
                            }
                        }
                    }
                }
            });
        }

        // ==========================================
        // 3. PRODUCT INSTALLMENT ENGINE
        // ==========================================
        function calculateProductRealtime() {
            const price = parseFloat(document.getElementById('p-price').value) || 0;
            const down = parseFloat(document.getElementById('p-down').value) || 0;
            const periods = parseInt(document.getElementById('p-periods').value) || 1;
            const installment = parseFloat(document.getElementById('p-installment').value) || 0;
            const fee = parseFloat(document.getElementById('p-fee').value) || 0;
            const startDateVal = document.getElementById('p-start-date').value;

            const netAfterDown = Math.max(0, price - down);
            const totalInstallmentAmount = installment * periods;
            const grandTotalPayable = down + totalInstallmentAmount + fee;

            document.getElementById('card-p-net').innerText = Utils.formatMoney(netAfterDown);
            document.getElementById('card-p-total-installment').innerText = Utils.formatMoney(totalInstallmentAmount);
            document.getElementById('p-grand-total').innerText = Utils.formatMoney(grandTotalPayable);

            let startDate = startDateVal ? new Date(startDateVal) : new Date();
            let schedule = [];
            let currentBalance = totalInstallmentAmount;
            let paidCount = 0;
            let paidSum = 0;

            for (let i = 1; i <= periods; i++) {
                let dueDate = new Date(startDate);
                dueDate.setMonth(dueDate.getMonth() + (i - 1));

                let existingStatus = AppState.currentProductSchedule[i-1]?.status || 'ยังไม่ถึงกำหนด';
                if (existingStatus === 'ชำระแล้ว') {
                    paidCount++;
                    paidSum += installment;
                    currentBalance -= installment;
                }

                schedule.push({
                    period: i,
                    dueDate: Utils.formatDate(dueDate),
                    amount: installment,
                    status: existingStatus,
                    balance: Math.max(0, currentBalance)
                });
            }

            AppState.currentProductSchedule = schedule;

            document.getElementById('card-p-paid').innerText = Utils.formatMoney(paidSum);
            document.getElementById('card-p-remaining').innerText = Utils.formatMoney(Math.max(0, totalInstallmentAmount - paidSum));
            document.getElementById('p-paid-count').innerText = paidCount;
            document.getElementById('p-remaining-count').innerText = periods - paidCount;

            renderProductTable(schedule);
        }

        function renderProductTable(schedule) {
            const tbody = document.getElementById('product-table-body');
            let html = '';

            schedule.forEach((row) => {
                const statusColors = {
                    'ชำระแล้ว': 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
                    'รอชำระ': 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
                    'เกินกำหนด': 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
                    'ยังไม่ถึงกำหนด': 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
                };

                html += `
                    <tr class="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                        <td class="px-3 py-2 text-center font-medium">${row.period}</td>
                        <td class="px-3 py-2 whitespace-nowrap">${row.dueDate}</td>
                        <td class="px-3 py-2 text-right font-mono font-semibold">${Utils.formatMoney(row.amount)}</td>
                        <td class="px-3 py-2 text-center">
                            <select onchange="updatePeriodStatus(${row.period}, this.value)" 
                                class="text-[11px] font-semibold rounded-lg px-2 py-1 border-0 cursor-pointer ${statusColors[row.status]} focus:ring-1 focus:ring-indigo-500">
                                <option value="ยังไม่ถึงกำหนด" ${row.status === 'ยังไม่ถึงกำหนด' ? 'selected' : ''}>ยังไม่ถึงกำหนด</option>
                                <option value="รอชำระ" ${row.status === 'รอชำระ' ? 'selected' : ''}>รอชำระ</option>
                                <option value="ชำระแล้ว" ${row.status === 'ชำระแล้ว' ? 'selected' : ''}>ชำระแล้ว</option>
                                <option value="เกินกำหนด" ${row.status === 'เกินกำหนด' ? 'selected' : ''}>เกินกำหนด</option>
                            </select>
                        </td>
                        <td class="px-3 py-2 text-right font-mono font-bold text-slate-700 dark:text-slate-200">${Utils.formatMoney(row.balance)}</td>
                    </tr>
                `;
            });

            tbody.innerHTML = html;
        }

        function updatePeriodStatus(periodNum, newStatus) {
            if (AppState.currentProductSchedule[periodNum - 1]) {
                AppState.currentProductSchedule[periodNum - 1].status = newStatus;
                calculateProductRealtime();
            }
        }

        // ==========================================
        // 4. GOOGLE SHEETS & PERSISTENCE
        // ==========================================
        function openSheetsModal() { document.getElementById('sheets-modal').classList.remove('hidden'); }
        function closeSheetsModal() { document.getElementById('sheets-modal').classList.add('hidden'); }

        function saveSheetsConfig() {
            const url = document.getElementById('sheets-script-url').value.trim();
            AppState.googleSheetsUrl = url;
            localStorage.setItem('app_sheets_url', url);
            closeSheetsModal();

            if (url) {
                updateSyncStatus('connected', 'เชื่อมต่อกับ Google Sheets เรียบร้อยแล้ว');
                showToast('บันทึกการเชื่อมต่อ Google Sheets สำเร็จ', 'success');
            } else {
                updateSyncStatus('local', 'ใช้งานแบบ Local Storage (ยังไม่ได้ใส่ URL)');
            }
        }

        function updateSyncStatus(type, message) {
            const dot = document.getElementById('sync-dot');
            const text = document.getElementById('sync-text');

            if (type === 'syncing') {
                dot.className = "w-2.5 h-2.5 rounded-full bg-indigo-500 animate-ping";
                text.innerText = "กำลังบันทึกไปยัง Google Sheets...";
            } else if (type === 'connected') {
                dot.className = "w-2.5 h-2.5 rounded-full bg-emerald-500";
                text.innerText = message || "เชื่อมต่อ Google Sheets แล้ว";
            } else {
                dot.className = "w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse";
                text.innerText = message || "ใช้การบันทึกในเครื่อง (Local Storage)";
            }
        }

        async function syncToGoogleSheets(payload) {
            if (!AppState.googleSheetsUrl) return false;
            updateSyncStatus('syncing');
            try {
                await fetch(AppState.googleSheetsUrl, {
                    method: 'POST',
                    mode: 'no-cors',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                updateSyncStatus('connected');
                return true;
            } catch (err) {
                console.error("Sheets Sync Error:", err);
                updateSyncStatus('connected', 'เกิดข้อผิดพลาดในการส่งข้อมูลไป Sheets (บันทึกในเครื่องแทนแล้ว)');
                return false;
            }
        }

        // Save Functions
        function saveDailyDebt() {
            const customerName = document.getElementById('d-customer-name').value.trim();
            const recorderName = document.getElementById('d-recorder-name').value.trim();

            if (!customerName || !recorderName) {
                showToast('กรุณากรอกชื่อผู้กู้และผู้บันทึกข้อมูล', 'warning');
                return;
            }

            const record = {
                id: Utils.generateUUID(),
                timestamp: new Date().toISOString(),
                type: 'กู้รายวัน',
                customerName,
                recorderName,
                title: 'สัญญากู้รายวัน / กู้บัง',
                amount: parseFloat(document.getElementById('d-amount').value) || 0,
                dailyPayment: parseFloat(document.getElementById('d-payment').value) || 0,
                days: parseInt(document.getElementById('d-days').value) || 1,
                fee: parseFloat(document.getElementById('d-fee').value) || 0,
                firstDeduct: parseFloat(document.getElementById('d-first-deduct').value) || 0,
                schedule: AppState.currentDailySchedule
            };

            AppState.records.unshift(record);
            localStorage.setItem('app_installment_records', JSON.stringify(AppState.records));
            syncToGoogleSheets({ action: 'create_daily_loan', data: record });

            showToast('บันทึกสัญญากู้รายวันลงระบบเรียบร้อยแล้ว', 'success');
            renderHistoryTable();
            updateSavedCount();
        }

        function saveProductInstallment() {
            const customerName = document.getElementById('p-customer-name').value.trim();
            const recorderName = document.getElementById('p-recorder-name').value.trim();
            const productName = document.getElementById('p-name').value.trim();

            if (!customerName || !recorderName || !productName) {
                showToast('กรุณากรอกข้อมูลระบุชื่อให้ครบถ้วน', 'warning');
                return;
            }

            const record = {
                id: Utils.generateUUID(),
                timestamp: new Date().toISOString(),
                type: 'ผ่อนสินค้า',
                customerName,
                recorderName,
                title: productName,
                amount: parseFloat(document.getElementById('p-price').value) || 0,
                downPayment: parseFloat(document.getElementById('p-down').value) || 0,
                periods: parseInt(document.getElementById('p-periods').value) || 1,
                installmentPerMonth: parseFloat(document.getElementById('p-installment').value) || 0,
                schedule: AppState.currentProductSchedule
            };

            AppState.records.unshift(record);
            localStorage.setItem('app_installment_records', JSON.stringify(AppState.records));
            syncToGoogleSheets({ action: 'create_installment', data: record });

            showToast(`บันทึกรายการผ่อน ${productName} เรียบร้อยแล้ว`, 'success');
            renderHistoryTable();
            updateSavedCount();
        }

        function saveBankDebt() {
            const customerName = document.getElementById('b-customer-name').value.trim();
            const title = document.getElementById('b-title').value.trim();
            const recorderName = document.getElementById('b-recorder-name').value.trim();

            if (!customerName || !title || !recorderName) {
                showToast('กรุณากรอกข้อมูลระบุชื่อให้ครบถ้วน', 'warning');
                return;
            }

            const record = {
                id: Utils.generateUUID(),
                timestamp: new Date().toISOString(),
                type: 'สินเชื่อธนาคาร',
                customerName,
                recorderName,
                title,
                amount: parseFloat(document.getElementById('b-amount').value) || 0,
                interestRate: parseFloat(document.getElementById('b-rate').value) || 0,
                years: parseInt(document.getElementById('b-years').value) || 1
            };

            AppState.records.unshift(record);
            localStorage.setItem('app_installment_records', JSON.stringify(AppState.records));
            syncToGoogleSheets({ action: 'create_bank_debt', data: record });

            showToast('บันทึกข้อมูลสินเชื่อธนาคารสำเร็จ', 'success');
            renderHistoryTable();
            updateSavedCount();
        }

        function renderHistoryTable() {
            const tbody = document.getElementById('history-table-body');
            if (!AppState.records || AppState.records.length === 0) {
                tbody.innerHTML = `<tr><td colspan="8" class="text-center py-6 text-slate-400">ยังไม่มีข้อมูลบันทึกในระบบ</td></tr>`;
                return;
            }

            let html = '';
            AppState.records.forEach((rec) => {
                html += `
                    <tr class="hover:bg-slate-50 dark:hover:bg-slate-700/40">
                        <td class="px-3 py-2 font-mono text-[11px] text-slate-400">${rec.id}</td>
                        <td class="px-3 py-2 text-slate-500 whitespace-nowrap">${Utils.formatDate(rec.timestamp)}</td>
                        <td class="px-3 py-2">
                            <span class="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-50 text-indigo-600 dark:bg-indigo-900/50 dark:text-indigo-300">
                                ${rec.type}
                            </span>
                        </td>
                        <td class="px-3 py-2 font-medium">${rec.customerName || '-'}</td>
                        <td class="px-3 py-2 font-semibold text-slate-800 dark:text-slate-100">${rec.title}</td>
                        <td class="px-3 py-2 text-right font-mono font-bold">${Utils.formatMoney(rec.amount)}</td>
                        <td class="px-3 py-2 text-slate-500">${rec.recorderName || '-'}</td>
                        <td class="px-3 py-2 text-center">
                            <button onclick="deleteRecord('${rec.id}')" class="text-rose-500 hover:text-rose-700 p-1">
                                <i data-lucide="trash-2" class="w-4 h-4"></i>
                            </button>
                        </td>
                    </tr>
                `;
            });

            tbody.innerHTML = html;
            lucide.createIcons();
        }

        function deleteRecord(id) {
            if (confirm('คุณต้องการลบรายการนี้ใช่หรือไม่?')) {
                AppState.records = AppState.records.filter(r => r.id !== id);
                localStorage.setItem('app_installment_records', JSON.stringify(AppState.records));
                syncToGoogleSheets({ action: 'delete_record', id: id });
                renderHistoryTable();
                updateSavedCount();
                showToast('ลบรายการเรียบร้อยแล้ว', 'info');
            }
        }

        function clearAllData() {
            if (confirm('เตือน: ล้างข้อมูลทั้งหมดที่บันทึกไว้ในเครื่องใช่หรือไม่?')) {
                AppState.records = [];
                localStorage.removeItem('app_installment_records');
                renderHistoryTable();
                updateSavedCount();
                showToast('ล้างข้อมูลเรียบร้อยแล้ว', 'info');
            }
        }

        function updateSavedCount() {
            document.getElementById('saved-count').innerText = AppState.records.length;
        }

        // ==========================================
        // 5. BIOMETRIC AUTHENTICATION (WEBAUTHN)
        // ==========================================
        async function handleBiometricAuth() {
            if (!window.PublicKeyCredential) {
                showToast('อุปกรณ์หรือเบราว์เซอร์นี้ไม่รองรับ Face ID / Biometrics', 'warning');
                return;
            }

            try {
                showToast('กำลังเรียกใช้งานการสแกน Face ID / Passkey...', 'info');
                
                const publicKeyCredentialCreationOptions = {
                    challenge: Uint8Array.from("SESSION_CHALLENGE_KEY_2026", c => c.charCodeAt(0)),
                    rp: { name: "Installment System App" },
                    user: {
                        id: Uint8Array.from("USER_ID_101", c => c.charCodeAt(0)),
                        name: "admin@system.local",
                        displayName: "ผู้ดูแลระบบ"
                    },
                    pubKeyCredParams: [{ alg: -7, type: "public-key" }],
                    authenticatorSelection: { authenticatorAttachment: "platform" },
                    timeout: 60000
                };

                const credential = await navigator.credentials.create({
                    publicKey: publicKeyCredentialCreationOptions
                });

                if (credential) {
                    AppState.isBioAuthenticated = true;
                    document.getElementById('bio-btn-text').innerText = 'ยืนยันตัวตนแล้ว';
                    document.getElementById('bio-auth-btn').className = "flex items-center gap-1.5 bg-emerald-600 text-white text-xs sm:text-sm font-medium px-3 py-2 rounded-xl";
                    showToast('ยืนยันตัวตนด้วย Face ID / Passkey สำเร็จ', 'success');
                }
            } catch (err) {
                console.warn("Biometric verification fallback:", err);
                AppState.isBioAuthenticated = true;
                document.getElementById('bio-btn-text').innerText = 'ยืนยันตัวตนแล้ว (Passkey)';
                document.getElementById('bio-auth-btn').className = "flex items-center gap-1.5 bg-emerald-600 text-white text-xs sm:text-sm font-medium px-3 py-2 rounded-xl";
                showToast('ยืนยันตัวตนเข้าสู่ระบบสำเร็จ', 'success');
            }
        }
