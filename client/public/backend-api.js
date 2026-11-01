/*
 * Frontend API client for Installment-payment.
 * Calls Income-and-expenses-by-manus backend-admin API.
 * Never put Google API keys or private keys in this file.
 */
(function attachInstallmentBackend(global) {
  const DEFAULT_TIMEOUT_MS = 15000;
  const DEFAULT_BACKEND_URL =
    "https://income-and-expenses-by-manus-production.up.railway.app";

  function getBackendUrl() {
    if (global.INSTALLMENT_BACKEND_URL) {
      return String(global.INSTALLMENT_BACKEND_URL).replace(/\/$/, "");
    }
    // Optional Vite-injected value when built as module-adjacent config
    if (typeof global.__INSTALLMENT_BACKEND_URL__ === "string") {
      return global.__INSTALLMENT_BACKEND_URL__.replace(/\/$/, "");
    }
    return DEFAULT_BACKEND_URL;
  }

  function getAdminToken(options) {
    const config = options || {};
    if (config.accessToken) return config.accessToken;
    if (global.INSTALLMENT_ADMIN_API_KEY) return global.INSTALLMENT_ADMIN_API_KEY;
    return "";
  }

  async function postTransaction(transaction, options) {
    const config = options || {};
    const backendUrl = (config.baseUrl || getBackendUrl()).replace(/\/$/, "");

    if (!backendUrl) {
      throw new Error("ยังไม่ได้ตั้งค่า URL ของ backend");
    }

    const token = getAdminToken(config);
    const headers = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      config.timeoutMs || DEFAULT_TIMEOUT_MS,
    );

    try {
      const response = await fetch(`${backendUrl}/api/transactions`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          type: transaction.type,
          customerName: transaction.customerName,
          recorderName: transaction.recorderName,
          amount: Number(transaction.amount),
          paymentAmount: Number(transaction.paymentAmount || 0),
          interest: Number(transaction.interest || 0),
          fee: Number(transaction.fee || 0),
          account: transaction.account || "",
          channel: transaction.channel || "หน้าเว็บ",
          transactionDate:
            transaction.transactionDate || new Date().toISOString(),
          note: transaction.note || "",
        }),
        signal: controller.signal,
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          result.message || `บันทึกข้อมูลไม่สำเร็จ (${response.status})`,
        );
      }

      return result;
    } catch (error) {
      if (error && error.name === "AbortError") {
        throw new Error("การเชื่อมต่อ backend ใช้เวลานานเกินไป");
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async function getBackendHealth(options) {
    const config = options || {};
    const backendUrl = (config.baseUrl || getBackendUrl()).replace(/\/$/, "");
    const response = await fetch(`${backendUrl}/health`, {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      throw new Error(`Backend health check failed (${response.status})`);
    }
    return response.json();
  }

  global.InstallmentBackend = Object.freeze({
    postTransaction,
    getBackendHealth,
    getBackendUrl,
  });
})(window);
