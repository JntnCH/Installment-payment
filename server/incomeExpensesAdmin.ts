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
      const responseData = error.response?.data as { error?: string; message?: string } | string | undefined;
      const responseText = typeof responseData === "string"
        ? responseData
        : responseData && Object.keys(responseData).length
          ? JSON.stringify(responseData)
          : "";
      const message =
        (typeof responseData === "object" && responseData?.error) ||
        (typeof responseData === "object" && responseData?.message) ||
        responseText ||
        error.message;
      const status = error.response?.status;
      throw new Error(`Income & Expenses API${status ? ` HTTP ${status}` : ""}: ${message}`);
    }
    throw error;
  }
}

export async function incomeExpensesApiRequest<T = unknown>(
  method: Method,
  path: string,
  data?: unknown,
): Promise<T> {
  const url = baseUrl();
  const key = adminKey();
  if (!url || !key) {
    throw new Error("ยังไม่ได้ตั้งค่า INCOME_EXPENSES_API_URL หรือ INCOME_EXPENSES_ADMIN_API_KEY ฝั่ง Server");
  }

  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  try {
    const response = await axios.request<T>({
      method,
      url: `${url}${normalizedPath}`,
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
      const responseData = error.response?.data as { error?: string; message?: string } | string | undefined;
      const responseText = typeof responseData === "string"
        ? responseData
        : responseData && Object.keys(responseData).length
          ? JSON.stringify(responseData)
          : "";
      const message =
        (typeof responseData === "object" && responseData?.error) ||
        (typeof responseData === "object" && responseData?.message) ||
        responseText ||
        error.message;
      const status = error.response?.status;
      throw new Error(`Income & Expenses API${status ? ` HTTP ${status}` : ""}: ${message}`);
    }
    throw error;
  }
}
