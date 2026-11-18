import axios, { type Method } from "axios";

const baseUrl = () => (process.env.INCOME_EXPENSES_API_URL || process.env.BACKEND_ADMIN_URL)?.replace(/\/+$/, "");
const adminKey = () => process.env.INCOME_EXPENSES_ADMIN_API_KEY || process.env.BACKEND_ADMIN_API_KEY;

export function incomeExpensesAdminConfigured() {
  return Boolean(baseUrl() && adminKey());
}

export async function incomeExpensesAdminRequest<T = unknown>(
  method: Method,
  path: string,
  data?: unknown,
): Promise<T> {
  const url = baseUrl();
  const key = adminKey();
  if (!url || !key) {
    throw new Error("ยังไม่ได้ตั้งค่า INCOME_EXPENSES_API_URL หรือ INCOME_EXPENSES_ADMIN_API_KEY ฝั่ง Server");
  }

  try {
    const response = await axios.request<T>({
      method,
      url: `${url}/api/categories${path.startsWith("/") ? path : `/${path}`}`,
      data,
      timeout: 20_000,
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
    });
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const message =
        (error.response?.data as { error?: string; message?: string } | undefined)?.error ||
        (error.response?.data as { message?: string } | undefined)?.message ||
        error.message;
      throw new Error(`Income & Expenses API: ${message}`);
    }
    throw error;
  }
}
