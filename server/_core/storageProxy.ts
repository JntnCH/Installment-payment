import axios from "axios";
import type { Express } from "express";
import { and, eq, isNull } from "drizzle-orm";
import { ledgerTransactions, monthlyBills } from "../../drizzle/schema";
import { getDb } from "../db";
import { getGoogleDriveAccessToken } from "../googleSheets";
import { ENV } from "./env";
import { sdk } from "./sdk";

export function registerStorageProxy(app: Express) {
  app.get("/manus-storage/*", async (req, res) => {
    const key = (req.params as Record<string, string>)[0];
    if (!key) {
      res.status(400).send("Missing storage key");
      return;
    }

    // New receipt files are private Google Drive files; stream only to their owner.
    if (/^[a-zA-Z0-9_-]{10,}$/.test(key)) {
      try {
        const user = await sdk.authenticateRequest(req);
        const db = await getDb();
        if (!db) throw new Error("Database is not available");
        const billRows = await db.select({ id: monthlyBills.id }).from(monthlyBills).where(and(
          eq(monthlyBills.ownerId, user.id),
          eq(monthlyBills.receiptKey, key),
          isNull(monthlyBills.deletedAt),
        )).limit(1);
        const ledgerRows = await db.select({ id: ledgerTransactions.id }).from(ledgerTransactions).where(and(
          eq(ledgerTransactions.ownerId, user.id),
          eq(ledgerTransactions.receiptKey, key),
        )).limit(1);
        if (!billRows[0] && !ledgerRows[0]) {
          res.status(404).send("Receipt not found");
          return;
        }

        const token = await getGoogleDriveAccessToken(user.id);
        const file = await axios.get(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(key)}?alt=media`, {
          headers: { Authorization: `Bearer ${token}` },
          responseType: "stream",
          timeout: 30000,
        });
        const contentType = file.headers["content-type"];
        res.setHeader("Content-Type", typeof contentType === "string" ? contentType : "application/octet-stream");
        res.setHeader("Content-Disposition", "inline");
        res.setHeader("Cache-Control", "private, no-store");
        res.setHeader("X-Content-Type-Options", "nosniff");
        file.data.on("error", (error: Error) => {
          console.error("[Google Drive receipt] stream failed:", error);
          if (!res.headersSent) res.status(502);
          res.end();
        });
        file.data.pipe(res);
      } catch (error) {
        console.error("[Google Drive receipt] access failed:", error);
        if (!res.headersSent) res.status(401).send("ไม่สามารถเปิดหลักฐานได้ กรุณาเข้าสู่ระบบใหม่");
      }
      return;
    }

    // Keep compatibility with older Forge-backed files.
    if (!ENV.forgeApiUrl || !ENV.forgeApiKey) {
      res.status(404).send("Legacy receipt storage is not configured");
      return;
    }
    try {
      const forgeUrl = new URL("v1/storage/presign/get", ENV.forgeApiUrl.replace(/\/+$/, "") + "/");
      forgeUrl.searchParams.set("path", key);
      const forgeResp = await fetch(forgeUrl, {
        headers: { Authorization: `Bearer ${ENV.forgeApiKey}` },
      });
      if (!forgeResp.ok) {
        const body = await forgeResp.text().catch(() => "");
        console.error(`[StorageProxy] forge error: ${forgeResp.status} ${body}`);
        res.status(502).send("Storage backend error");
        return;
      }
      const { url } = (await forgeResp.json()) as { url: string };
      if (!url) {
        res.status(502).send("Empty signed URL from backend");
        return;
      }
      res.set("Cache-Control", "no-store");
      res.redirect(307, url);
    } catch (error) {
      console.error("[StorageProxy] failed:", error);
      res.status(502).send("Storage proxy error");
    }
  });
}
