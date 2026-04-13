// ─── Event Payloads ──────────────────────────────────────────────────────────

export interface ReserveBetAcceptEvent {
  betSlipId: string;
  customerId: number;
  acceptedAt: string;
  [key: string]: unknown;
}

export interface ReserveBetRejectEvent {
  betSlipId: string;
  customerId: number;
  rejectedAt: string;
  reason?: string;
  [key: string]: unknown;
}

export type DefendEventMap = {
  RESERVE_BET_ACCEPT: ReserveBetAcceptEvent;
  RESERVE_BET_REJECT: ReserveBetRejectEvent;
};

export type DefendEventName = keyof DefendEventMap;

// ─── Authentication ───────────────────────────────────────────────────────────

export interface DefendTokens {
  /** Bearer access token. Expires after 30 minutes. */
  accessToken: string;
  /** Refresh token. Valid for 7 days. */
  refreshToken: string;
}

/**
 * Called when the current access token is about to expire (or has expired).
 * Must resolve with a fresh access token string.
 */
export type TokenRefreshFn = (refreshToken: string) => Promise<string>;

// ─── Client Options ───────────────────────────────────────────────────────────

export interface DefendClientOptions {
  /** Your LSports numeric Customer ID. */
  customerId: number;

  /** Initial authentication tokens. */
  tokens: DefendTokens;

  /**
   * Called when the access token needs refreshing.
   * Return the new access token; the client will reconnect with it.
   */
  onTokenRefresh: TokenRefreshFn;

  /**
   * Maximum number of reconnection attempts.
   * @default 10
   */
  maxReconnectionAttempts?: number;

  /**
   * Delay between reconnection attempts in milliseconds.
   * @default 1000
   */
  reconnectionDelay?: number;

  /**
   * Optional logger. Defaults to console.
   */
  logger?: Logger;
}

export interface Logger {
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}

// ─── Error Types ─────────────────────────────────────────────────────────────

/**
 * HTTP-level connection errors returned during the Socket.IO handshake.
 */
export const HTTP_ERROR_CODES = {
  400: "Bad Request – customerid header contains non-numeric characters",
  401: "Unauthorized – customerid header missing from connection request",
  402: "Payment Required – subscription is inactive or expired",
  403: "Forbidden – Customer ID does not exist in the system",
  429: "Too Many Requests – rate limit exceeded, wait before retrying",
  500: "Internal Server Error – retry with exponential backoff",
} as const;

export type HttpErrorCode = keyof typeof HTTP_ERROR_CODES;

/**
 * WebSocket close codes used after the connection has been upgraded.
 */
export const WS_CLOSE_CODES = {
  1000: "Normal closure",
  1001: "Maintenance – server going down or browser navigation",
  4401: "Authentication failure post-upgrade",
  4403: "Authorization revoked",
} as const;

export type WsCloseCode = keyof typeof WS_CLOSE_CODES;

export class DefendConnectionError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string
  ) {
    super(message);
    this.name = "DefendConnectionError";
  }
}
