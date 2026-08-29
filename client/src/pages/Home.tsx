import React, { useState } from "react";
import { AppShell, NavTabId } from "@/components/design-system";
import DashboardOverview from "@/components/DashboardOverview";
import DialogflowSheetViewer from "@/components/DialogflowSheetViewer";
import CashflowManager from "@/components/CashflowManager";
import IndividualLedger from "@/components/IndividualLedger";
import LoanCalculator from "@/components/LoanCalculator";
import GoogleSheetsSync from "@/components/GoogleSheetsSync";
import { trpc } from "@/lib/trpc";

export default function Home() {
  const [activeTab, setActiveTab] = useState<NavTabId>("overview");
  const [refreshSignal, setRefreshSignal] = useState(0);

  const statsQuery = trpc.ledger.getStats.useQuery();

  const handleContractCreated = (partyId: string, contractId: string) => {
    setRefreshSignal((prev) => prev + 1);
    setActiveTab("lent");
  };

  const overdueCount =
    (statsQuery.data?.overdue?.count ?? 0) + (statsQuery.data?.today?.count ?? 0);

  return (
    <AppShell
      activeTab={activeTab}
      onTabChange={(tab) => setActiveTab(tab)}
      overdueCount={overdueCount}
    >
      {activeTab === "overview" && (
        <DashboardOverview
          onNavigate={(tab) => setActiveTab(tab as NavTabId)}
          onOpenContract={(partyId, contractId) => {
            setActiveTab("lent");
          }}
        />
      )}

      {activeTab === "dialogflow" && <DialogflowSheetViewer />}

      {activeTab === "cashflow" && <CashflowManager />}

      {activeTab === "lent" && (
        <IndividualLedger
          initialRole="debtor"
          refreshSignal={refreshSignal}
        />
      )}

      {activeTab === "borrowed" && (
        <IndividualLedger
          initialRole="creditor"
          refreshSignal={refreshSignal}
        />
      )}

      {activeTab === "calculator" && (
        <LoanCalculator onContractCreated={handleContractCreated} />
      )}

      {activeTab === "sheets" && <GoogleSheetsSync />}
    </AppShell>
  );
}
