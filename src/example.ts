/**
 * Example: connecting to the LSports Defend RMS WebSocket.
 *
 * Replace the placeholder values with real credentials obtained from
 * the ARENA360 authentication system before running.
 */

import { DefendClient } from "./client";
import type { ReserveBetAcceptEvent, ReserveBetRejectEvent } from "./types";

// ------------------------------------------------------------------
// Stub token-refresh function – replace with your actual auth call.
// ------------------------------------------------------------------
async function refreshAccessToken(refreshToken: string): Promise<string> {
  // Call your ARENA360 token-refresh endpoint here.
  // e.g. POST https://api.lsports.eu/auth/refresh  { refreshToken }
  console.log("Refreshing token using refreshToken:", refreshToken);
  throw new Error("Implement refreshAccessToken with your ARENA360 auth call");
}

// ------------------------------------------------------------------
// Create and configure the client.
// ------------------------------------------------------------------
const client = new DefendClient({
  customerId: Number(process.env.LSPORTS_CUSTOMER_ID ?? "0"),
  tokens: {
    accessToken: process.env.LSPORTS_ACCESS_TOKEN ?? "",
    refreshToken: process.env.LSPORTS_REFRESH_TOKEN ?? "",
  },
  onTokenRefresh: refreshAccessToken,
  maxReconnectionAttempts: 10,
  reconnectionDelay: 1000,
});

// ------------------------------------------------------------------
// Register event handlers.
// ------------------------------------------------------------------
client.on("RESERVE_BET_ACCEPT", (event: ReserveBetAcceptEvent) => {
  console.log("[ACCEPT] Bet slip approved:", event.betSlipId, event);
});

client.on("RESERVE_BET_REJECT", (event: ReserveBetRejectEvent) => {
  console.log("[REJECT] Bet slip rejected:", event.betSlipId, "reason:", event.reason);
});

// ------------------------------------------------------------------
// Connect.
// ------------------------------------------------------------------
client.connect();

// Graceful shutdown on SIGINT / SIGTERM.
function shutdown(signal: string): void {
  console.log(`\nReceived ${signal} – disconnecting…`);
  client.disconnect();
  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
