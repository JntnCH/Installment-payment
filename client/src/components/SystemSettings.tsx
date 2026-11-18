import React, { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Plus, RefreshCw, Trash2, Save, Bot, Tags, FolderTree } from "lucide-react";

type Section = "intents" | "entities" | "categories";

export default function SystemSettings() {
  const [section, setSection] = useState<Section>("intents");
  const [newName, setNewName] = useState("");
  const [newValue, setNewValue] = useState("");
  const [newSynonyms, setNewSynonyms] = useState("");
  const [selectedIntent, setSelectedIntent] = useState<any>(null);
  const [phrasesText, setPhrasesText] = useState("");
  const [messagesText, setMessagesText] = useState("");
  const [webhookEnabled, setWebhookEnabled] = useState(true);
  const [entityTypeName, setEntityTypeName] = useState("");
  const [categoryType, setCategoryType] = useState<"income" | "expense">("expense");

  const utils = trpc.useUtils();
  const configQuery = trpc.systemSettings.configured.useQuery();
  const statusQuery = trpc.systemSettings.dialogflowStatus.useQuery(undefined, { enabled: !!configQuery.data?.configured });
  const intentsQuery = trpc.systemSettings.intents.useQuery(undefined, { enabled: !!configQuery.data?.configured && section === "intents" });
  const entitiesQuery = trpc.systemSettings.entityTypes.useQuery(undefined, { enabled: !!configQuery.data?.configured && section === "entities" });
  const categoriesQuery = trpc.systemSettings.categories.useQuery(undefined, { enabled: !!configQuery.data?.configured && section === "categories" });

  const createIntent = trpc.systemSettings.createIntent.useMutation({
    onSuccess: async () => { toast.success("สร้าง Intent สำเร็จ"); setNewName(""); setNewSynonyms(""); await utils.systemSettings.intents.invalidate(); },
    onError: e => toast.error(e.message),
  });
  const updateIntent = trpc.systemSettings.updateIntent.useMutation({
    onSuccess: async () => { toast.success("บันทึก Intent แล้ว"); await utils.systemSettings.intents.invalidate(); },
    onError: e => toast.error(e.message),
  });
  const deleteIntent = trpc.systemSettings.deleteIntent.useMutation({
    onSuccess: async () => { toast.success("ลบ Intent แล้ว"); setSelectedIntent(null); await utils.systemSettings.intents.invalidate(); },
    onError: e => toast.error(e.message),
  });
  const saveEntry = trpc.systemSettings.saveEntityEntry.useMutation({
    onSuccess: async () => { toast.success("บันทึก Entity แล้ว"); setNewValue(""); setNewSynonyms(""); await utils.systemSettings.entityTypes.invalidate(); await utils.systemSettings.entityType.invalidate(); },
    onError: e => toast.error(e.message),
  });
  const deleteEntry = trpc.systemSettings.deleteEntityEntry.useMutation({
    onSuccess: async () => { toast.success("ลบ Entity แล้ว"); await utils.systemSettings.entityTypes.invalidate(); await utils.systemSettings.entityType.invalidate(); },
    onError: e => toast.error(e.message),
  });
  const saveCategory = trpc.systemSettings.saveCategory.useMutation({
    onSuccess: async () => { toast.success("บันทึกหมวดหมู่แล้ว"); setNewValue(""); setNewSynonyms(""); await utils.systemSettings.categories.invalidate(); },
    onError: e => toast.error(e.message),
  });
  const deleteCategory = trpc.systemSettings.deleteCategory.useMutation({
    onSuccess: async () => { toast.success("ลบหมวดหมู่แล้ว"); await utils.systemSettings.categories.invalidate(); },
    onError: e => toast.error(e.message),
  });

  const intents = (intentsQuery.data as any)?.intents ?? [];
  const entityTypes = (entitiesQuery.data as any)?.entityTypes ?? [];
  const categoryData = (categoriesQuery.data as any)?.data ?? {};
  const categories = useMemo(() => categoryData.categories?.[categoryType] ?? [], [categoryData, categoryType]);

  const openIntent = (intent: any) => {
    setSelectedIntent(intent);
    setPhrasesText((intent.trainingPhrases ?? []).join("\n"));
    setMessagesText((intent.messages ?? []).join("\n"));
    setWebhookEnabled(!!intent.isWebhookEnabled);
  };

  const refresh = () => {
    if (section === "intents") void utils.systemSettings.intents.invalidate();
    if (section === "entities") void utils.systemSettings.entityTypes.invalidate();
    if (section === "categories") void utils.systemSettings.categories.invalidate();
    void utils.systemSettings.dialogflowStatus.invalidate();
  };

  const tabs = [
    { id: "intents" as const, label: "Intents", icon: Bot },
    { id: "entities" as const, label: "Entities", icon: Tags },
    { id: "categories" as const, label: "Categories", icon: FolderTree },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">System Settings</h1>
          <p className="mt-1 text-sm text-slate-500">จัดการ Dialogflow Agent และหมวดหมู่จาก Backend หลัก</p>
        </div>
        <button onClick={refresh} className="inline-flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm hover:bg-slate-50">
          <RefreshCw className="h-4 w-4" /> รีเฟรช
        </button>
      </div>

      <div className="rounded-xl border bg-white p-4">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className={configQuery.data?.configured ? "text-emerald-700" : "text-amber-700"}>
            {configQuery.data?.configured ? "ตั้งค่า Backend แล้ว" : "ยังไม่ได้ตั้งค่า Backend"}
          </span>
          {statusQuery.data && <span className="text-slate-500">• Dialogflow: {(statusQuery.data as any).connected ? "Connected" : "Disconnected"} • Project: {(statusQuery.data as any).projectId || "-"}</span>}
          {configQuery.isLoading && <span className="text-slate-400">กำลังตรวจสอบ...</span>}
        </div>
        {!configQuery.data?.configured && !configQuery.isLoading && (
          <p className="mt-2 text-sm text-amber-700">กำหนด INCOME_EXPENSES_API_URL และ INCOME_EXPENSES_ADMIN_API_KEY ใน Server Environment ก่อนใช้งาน</p>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {tabs.map(tab => {
          const Icon = tab.icon;
          return <button key={tab.id} onClick={() => { setSection(tab.id); setSelectedIntent(null); }} className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium ${section === tab.id ? "bg-blue-600 text-white" : "border bg-white text-slate-600"}`}>
            <Icon className="h-4 w-4" />{tab.label}
          </button>;
        })}
      </div>

      {section === "intents" && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(320px,1fr)]">
          <section className="rounded-xl border bg-white p-4">
            <h2 className="font-semibold">Dialogflow Intents</h2>
            <div className="mt-3 flex gap-2">
              <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="ชื่อ Intent ใหม่" className="min-w-0 flex-1 rounded-lg border px-3 py-2 text-sm" />
              <button disabled={!newName.trim() || createIntent.isPending} onClick={() => createIntent.mutate({ displayName: newName.trim(), trainingPhrases: [], messages: [], webhookEnabled: true })} className="rounded-lg bg-blue-600 px-3 py-2 text-sm text-white disabled:opacity-50"><Plus className="h-4 w-4" /></button>
            </div>
            <div className="mt-3 divide-y">
              {intents.map((intent: any) => <div key={intent.name} className="flex items-center justify-between gap-2 py-3">
                <button onClick={() => openIntent(intent)} className="min-w-0 flex-1 text-left">
                  <div className="truncate text-sm font-medium">{intent.displayName}</div>
                  <div className="text-xs text-slate-500">{intent.trainingPhrasesCount ?? 0} training phrases</div>
                </button>
                <button title="ลบ Intent" onClick={() => { if (window.confirm(`ยืนยันลบ Intent ${intent.displayName}?`)) deleteIntent.mutate({ name: intent.name }); }} className="rounded-md p-2 text-rose-600 hover:bg-rose-50"><Trash2 className="h-4 w-4" /></button>
              </div>)}
              {!intentsQuery.isLoading && intents.length === 0 && <p className="py-5 text-sm text-slate-500">ไม่พบ Intent หรือยังเชื่อมต่อไม่ได้</p>}
            </div>
          </section>
          <section className="rounded-xl border bg-white p-4">
            <h2 className="font-semibold">รายละเอียด Intent</h2>
            {selectedIntent ? <>
              <p className="mt-1 text-sm text-slate-500">{selectedIntent.displayName}</p>
              <label className="mt-4 block text-xs font-medium text-slate-600">Training Phrases (หนึ่งบรรทัดต่อหนึ่งประโยค)</label>
              <textarea value={phrasesText} onChange={e => setPhrasesText(e.target.value)} rows={6} className="mt-1 w-full rounded-lg border p-3 text-sm" />
              <label className="mt-3 block text-xs font-medium text-slate-600">ข้อความตอบกลับ (หนึ่งบรรทัดต่อหนึ่งข้อความ)</label>
              <textarea value={messagesText} onChange={e => setMessagesText(e.target.value)} rows={4} className="mt-1 w-full rounded-lg border p-3 text-sm" />
              <label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={webhookEnabled} onChange={e => setWebhookEnabled(e.target.checked)} /> เปิดใช้งาน Webhook</label>
              <button onClick={() => updateIntent.mutate({ name: selectedIntent.name, updates: { trainingPhrases: phrasesText.split("\n").map(v => v.trim()).filter(Boolean), messages: messagesText.split("\n").map(v => v.trim()).filter(Boolean), webhookEnabled } })} disabled={updateIntent.isPending} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-50"><Save className="h-4 w-4" /> บันทึกกลับ Dialogflow</button>
            </> : <p className="mt-3 text-sm text-slate-500">เลือก Intent จากรายการเพื่อแก้ไข Training Phrases และ Response</p>}
          </section>
        </div>
      )}

      {section === "entities" && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(320px,1fr)]">
          <section className="rounded-xl border bg-white p-4">
            <h2 className="font-semibold">Entity Types</h2>
            <div className="mt-3 divide-y">
              {entityTypes.map((entity: any) => <button key={entity.name} onClick={() => setEntityTypeName(entity.name)} className={`block w-full py-3 text-left text-sm ${entityTypeName === entity.name ? "font-semibold text-blue-700" : "text-slate-700"}`}>
                {entity.displayName} <span className="text-xs text-slate-400">({entity.entities?.length ?? 0})</span>
              </button>)}
              {!entitiesQuery.isLoading && entityTypes.length === 0 && <p className="py-5 text-sm text-slate-500">ไม่พบ Entity Type</p>}
            </div>
          </section>
          <section className="rounded-xl border bg-white p-4">
            <h2 className="font-semibold">Entity Entries</h2>
            <p className="mt-1 break-all text-xs text-slate-500">{entityTypeName || "เลือก Entity Type"}</p>
            <div className="mt-3 space-y-2">
              <input value={newValue} onChange={e => setNewValue(e.target.value)} placeholder="ค่า Entity" className="w-full rounded-lg border px-3 py-2 text-sm" />
              <input value={newSynonyms} onChange={e => setNewSynonyms(e.target.value)} placeholder="คำพ้อง คั่นด้วยเครื่องหมายจุลภาค" className="w-full rounded-lg border px-3 py-2 text-sm" />
              <button disabled={!entityTypeName || !newValue.trim() || saveEntry.isPending} onClick={() => saveEntry.mutate({ entityType: entityTypeName, value: newValue.trim(), synonyms: newSynonyms.split(",").map(v => v.trim()).filter(Boolean) })} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm text-white disabled:opacity-50"><Plus className="h-4 w-4" /> เพิ่ม / อัปเดต Entry</button>
            </div>
            <EntityEntries entityTypeName={entityTypeName} onDelete={(value) => deleteEntry.mutate({ entityType: entityTypeName, value })} />
          </section>
        </div>
      )}

      {section === "categories" && (
        <section className="rounded-xl border bg-white p-4">
          <h2 className="font-semibold">Income / Expense Categories</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            <button onClick={() => setCategoryType("expense")} className={`rounded-lg px-3 py-2 text-sm ${categoryType === "expense" ? "bg-blue-600 text-white" : "border"}`}>รายจ่าย</button>
            <button onClick={() => setCategoryType("income")} className={`rounded-lg px-3 py-2 text-sm ${categoryType === "income" ? "bg-blue-600 text-white" : "border"}`}>รายรับ</button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <input value={newValue} onChange={e => setNewValue(e.target.value)} placeholder="ชื่อหมวดหมู่" className="min-w-0 flex-1 rounded-lg border px-3 py-2 text-sm" />
            <input value={newSynonyms} onChange={e => setNewSynonyms(e.target.value)} placeholder="คำพ้อง คั่นด้วย ," className="min-w-0 flex-1 rounded-lg border px-3 py-2 text-sm" />
            <button disabled={!newValue.trim() || saveCategory.isPending} onClick={() => saveCategory.mutate({ type: categoryType, name: newValue.trim(), synonyms: newSynonyms.split(",").map(v => v.trim()).filter(Boolean) })} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm text-white disabled:opacity-50"><Plus className="h-4 w-4" /> เพิ่ม</button>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {categories.map((category: any) => <span key={category.id ?? category.name} className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm">{category.name}<button onClick={() => { if (window.confirm(`ยืนยันลบหมวดหมู่ ${category.name}?`)) deleteCategory.mutate({ type: categoryType, name: category.name }); }} className="text-rose-600"><Trash2 className="h-3.5 w-3.5" /></button></span>)}
          </div>
        </section>
      )}
    </div>
  );
}

function EntityEntries({ entityTypeName, onDelete }: { entityTypeName: string; onDelete: (value: string) => void }) {
  const query = trpc.systemSettings.entityType.useQuery({ name: entityTypeName }, { enabled: !!entityTypeName });
  const entries = (query.data as any)?.entityType?.entities ?? [];
  if (!entityTypeName) return <p className="mt-4 text-sm text-slate-500">เลือก Entity Type เพื่อดูรายการ</p>;
  return <div className="mt-4 divide-y">
    {entries.map((entry: any) => <div key={entry.value} className="flex items-center justify-between gap-3 py-2">
      <div className="min-w-0"><div className="text-sm font-medium">{entry.value}</div><div className="truncate text-xs text-slate-500">{(entry.synonyms ?? []).join(", ")}</div></div>
      <button onClick={() => { if (window.confirm(`ยืนยันลบ ${entry.value}?`)) onDelete(entry.value); }} className="rounded-md p-2 text-rose-600 hover:bg-rose-50"><Trash2 className="h-4 w-4" /></button>
    </div>)}
  </div>;
}
