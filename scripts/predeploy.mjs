import { spawnSync } from "node:child_process";

const scripts = [
  "scripts/ensure-auth-identities.mjs",
  "scripts/ensure-monthly-bills.mjs",
  "scripts/ensure-contract-down-payment.mjs",
];

for (const script of scripts) {
  console.log(`[Pre-deploy] Running ${script}`);
  const result = spawnSync(process.execPath, [script], { stdio: "inherit", env: process.env });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

console.log("[Pre-deploy] Database checks and migrations completed.");
