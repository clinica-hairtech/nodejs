#!/usr/bin/env node
const waha = require("../integrations/waha");

async function main() {
  const name = process.env.WAHA_SESSION || "ana";

  console.log(`[waha] base=${waha.BASE_URL} session=${name} engine=${waha.ENGINE}`);

  let current = await waha.getSession(name);
  if (current) {
    console.log(`[waha] existing session status=${current.status || current.state}`);
    const status = current.status || current.state;
    if (status === "WORKING" || status === "AUTHENTICATED") {
      console.log("[waha] session already authenticated, nothing to do");
      return;
    }
  } else {
    console.log("[waha] no session found, creating");
  }

  await waha.startSession(name);
  console.log("[waha] start requested, waiting for QR or auth...");

  const ready = await waha.waitForStatus(["SCAN_QR_CODE", "WORKING", "AUTHENTICATED"], {
    name,
    timeoutMs: 60000,
    intervalMs: 2000,
  });

  if (!ready) {
    console.error("[waha] timed out waiting for session status");
    process.exit(2);
  }

  const status = ready.status || ready.state;
  console.log(`[waha] status=${status}`);

  if (status === "SCAN_QR_CODE") {
    const qr = await waha.getQr(name, "raw");
    if (qr && qr.value) {
      console.log("[waha] scan this QR with the linked-devices flow:");
      console.log(qr.value);
    } else {
      console.log("[waha] QR not available yet, fetch /api/" + name + "/auth/qr");
    }
  }
}

main().catch((err) => {
  console.error("[waha] error:", err.message);
  process.exit(1);
});
