import { afterEach, describe, expect, it } from "vitest";
import { createLedgerParty, getPartyLedger, listLedgerParties } from "./ledger";

const createdOwners = new Set<number>();

afterEach(() => {
  // The in-memory ledger is process-local and owner IDs below are unique to this test.
  createdOwners.clear();
});

describe("ledger tenant isolation", () => {
  it.skipIf(Boolean(process.env.DATABASE_URL))(
    "keeps each user's parties and party ledger private",
    async () => {
      const ownerA = 810001;
      const ownerB = 810002;
      createdOwners.add(ownerA);
      createdOwners.add(ownerB);

      const partyA = await createLedgerParty(ownerA, {
        displayName: "Tenant A private party",
        role: "debtor",
        phone: "",
        note: "",
      });

      const partyB = await createLedgerParty(ownerB, {
        displayName: "Tenant B private party",
        role: "creditor",
        phone: "",
        note: "",
      });

      const [partiesA, partiesB] = await Promise.all([
        listLedgerParties(ownerA),
        listLedgerParties(ownerB),
      ]);

      expect(partiesA.map(party => party.partyId)).toContain(partyA?.partyId);
      expect(partiesA.map(party => party.partyId)).not.toContain(partyB?.partyId);
      expect(partiesB.map(party => party.partyId)).toContain(partyB?.partyId);
      expect(partiesB.map(party => party.partyId)).not.toContain(partyA?.partyId);
      await expect(getPartyLedger(ownerB, partyA!.partyId)).resolves.toBeNull();
      await expect(getPartyLedger(ownerA, partyB!.partyId)).resolves.toBeNull();
    },
  );
});
