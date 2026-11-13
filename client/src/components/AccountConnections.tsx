import { trpc } from "@/lib/trpc";

export default function AccountConnections() {
  const identities = trpc.auth.identities.useQuery();

  const startLink = (provider: "google" | "line") => {
    window.location.assign(`/api/auth/${provider}?intent=link`);
  };

  if (identities.isLoading) {
    return <section className="mb-5 rounded-xl border bg-white p-4 text-sm text-stone-500">กำลังตรวจสอบบัญชีที่เชื่อมต่อ...</section>;
  }

  if (identities.isError) {
    return <section className="mb-5 rounded-xl border border-red-200 bg-white p-4 text-sm text-red-600">ไม่สามารถตรวจสอบบัญชีที่เชื่อมต่อได้</section>;
  }

  const connected = identities.data ?? [];

  return (
    <section className="mb-5 rounded-xl border bg-white p-4">
      <h2 className="text-base font-semibold text-stone-900">บัญชีที่เชื่อมต่อ</h2>
      <p className="mt-1 text-sm text-stone-500">เชื่อม Google หรือ LINE เพิ่มเข้ากับบัญชีปัจจุบัน โดยข้อมูลสัญญาและรายการผ่อนชำระจะยังอยู่ในบัญชีเดิม</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {(["google", "line"] as const).map(provider => {
          const identity = connected.find(item => item.provider === provider);
          const label = provider === "google" ? "Google" : "LINE";
          return (
            <div key={provider} className="flex items-center justify-between gap-3 rounded-lg border p-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-stone-900">{label}</p>
                <p className="truncate text-xs text-stone-500">
                  {identity ? identity.email || identity.displayName || "เชื่อมต่อแล้ว" : "ยังไม่ได้เชื่อมต่อ"}
                </p>
              </div>
              {identity ? (
                <span className="shrink-0 rounded-full bg-green-50 px-3 py-1 text-xs font-medium text-green-700">เชื่อมแล้ว</span>
              ) : (
                <button
                  type="button"
                  onClick={() => startLink(provider)}
                  className={provider === "line"
                    ? "shrink-0 rounded-lg bg-[#06C755] px-3 py-2 text-xs font-medium text-white"
                    : "shrink-0 rounded-lg bg-stone-900 px-3 py-2 text-xs font-medium text-white"}
                >
                  เชื่อม {label}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
