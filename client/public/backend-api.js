/*
 * Frontend API client for Installment-payment.
 * This file must contain only the backend URL, never Google API keys or private keys.
 */
(function attachInstallmentBackend(global) {
  const DEFAULT_TIMEOUT_MS = 15000;

  function getBackendUrl() {
    // For production, replace this with the deployed backend URL.
    // Example: https://income-and-expenses-by-manus.example.com
    return global.INSTALLMENT_BACKEND_URL || "";
  }

  async function postTransaction(transaction, options) {
    const config = options || {};
    const backendUrl = (config.baseUrl || getBackendUrl()).replace(/\/$/, "");

    if (!backendUrl) {
      throw new Error("ยังไม่ได้ตั้งค่า URL ของ backend");
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      config.timeoutMs || DEFAULT_TIMEOUT_MS,
    );

    try {
      const response = await fetch(`${backendUrl}/api/transactions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          ...(config.accessToken
            ? { Authorization: `Bearer ${config.accessToken}` }
            : {}),
        },
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
          transactionDate: transaction.transactionDate || new Date().toISOString(),
          note: transaction.note || "",
        }),
        signal: controller.signal,
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(result.message || `บันทึกข้อมูลไม่สำเร็จ (${response.status})`);
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

  global.InstallmentBackend = Object.freeze({ postTransaction });
})(window);
