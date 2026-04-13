import { io, Socket } from "socket.io-client";
import {
  DefendClientOptions,
  DefendConnectionError,
  DefendEventMap,
  DefendEventName,
  HTTP_ERROR_CODES,
  HttpErrorCode,
  Logger,
  WS_CLOSE_CODES,
  WsCloseCode,
} from "./types";

const RMS_URL = "wss://rms.lsports.cloud";
const RMS_PATH = "/rms-socket/socket.io";

// Access token is valid for 30 minutes; refresh 2 minutes before expiry.
const TOKEN_REFRESH_BUFFER_MS = 2 * 60 * 1000;
const TOKEN_TTL_MS = 30 * 60 * 1000;

type EventListener<T> = (data: T) => void;

export class DefendClient {
  private socket: Socket | null = null;
  private accessToken: string;
  private readonly refreshToken: string;
  private tokenRefreshTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly options: Required<
    Omit<DefendClientOptions, "tokens" | "onTokenRefresh">
  > &
    Pick<DefendClientOptions, "onTokenRefresh">;
  private readonly log: Logger;
  private readonly listeners = new Map<
    DefendEventName,
    Set<EventListener<DefendEventMap[DefendEventName]>>
  >();

  constructor(private readonly config: DefendClientOptions) {
    this.accessToken = config.tokens.accessToken;
    this.refreshToken = config.tokens.refreshToken;
    this.log = config.logger ?? console;
    this.options = {
      customerId: config.customerId,
      maxReconnectionAttempts: config.maxReconnectionAttempts ?? 10,
      reconnectionDelay: config.reconnectionDelay ?? 1000,
      onTokenRefresh: config.onTokenRefresh,
      logger: this.log,
    };
  }

  // ─── Public API ────────────────────────────────────────────────────────────

  /** Establish the WebSocket connection and join the customer room. */
  connect(): void {
    if (this.socket?.connected) {
      this.log.warn("[DefendClient] Already connected");
      return;
    }
    this.createSocket();
    this.scheduleTokenRefresh();
  }

  /** Gracefully close the connection and cancel pending timers. */
  disconnect(): void {
    this.clearTokenRefreshTimer();
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.log.info("[DefendClient] Disconnected");
  }

  /** Register a listener for a Defend event. */
  on<E extends DefendEventName>(
    event: E,
    listener: EventListener<DefendEventMap[E]>
  ): this {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners
      .get(event)!
      .add(listener as EventListener<DefendEventMap[DefendEventName]>);
    if (this.socket) {
      this.socket.on(event, listener as (data: unknown) => void);
    }
    return this;
  }

  /** Remove a previously registered listener. */
  off<E extends DefendEventName>(
    event: E,
    listener: EventListener<DefendEventMap[E]>
  ): this {
    this.listeners
      .get(event)
      ?.delete(listener as EventListener<DefendEventMap[DefendEventName]>);
    this.socket?.off(event, listener as (data: unknown) => void);
    return this;
  }

  /** Whether the socket is currently connected. */
  get isConnected(): boolean {
    return this.socket?.connected ?? false;
  }

  // ─── Socket lifecycle ─────────────────────────────────────────────────────

  private createSocket(): void {
    this.socket = io(RMS_URL, {
      path: RMS_PATH,
      transports: ["websocket", "polling"],
      extraHeaders: {
        Authorization: `Bearer ${this.accessToken}`,
        customerid: String(this.options.customerId),
      },
      reconnection: true,
      reconnectionAttempts: this.options.maxReconnectionAttempts,
      reconnectionDelay: this.options.reconnectionDelay,
      reconnectionDelayMax: this.options.reconnectionDelay,
    });

    this.socket.on("connect", () => {
      this.log.info("[DefendClient] Connected");
      this.joinRoom();
      this.reattachListeners();
    });

    this.socket.on("disconnect", (reason: string) => {
      this.log.info(`[DefendClient] Disconnected: ${reason}`);
    });

    this.socket.on("reconnect", (attempt: number) => {
      this.log.info(`[DefendClient] Reconnected after ${attempt} attempt(s)`);
    });

    this.socket.on("reconnect_error", (err: Error) => {
      this.log.warn(`[DefendClient] Reconnection error: ${err.message}`);
    });

    this.socket.on("reconnect_failed", () => {
      this.log.error(
        `[DefendClient] Reconnection failed after ${this.options.maxReconnectionAttempts} attempts`
      );
    });

    this.socket.on("connect_error", (err: Error & { data?: { statusCode?: number } }) => {
      const statusCode = err.data?.statusCode;
      if (statusCode !== undefined && statusCode in HTTP_ERROR_CODES) {
        const description =
          HTTP_ERROR_CODES[statusCode as HttpErrorCode];
        this.log.error(
          `[DefendClient] Connection error ${statusCode}: ${description}`
        );
        this.handleHttpError(statusCode);
      } else {
        this.log.error(`[DefendClient] Connection error: ${err.message}`);
      }
    });

    // Handle WebSocket-level close codes after upgrade
    const rawSocket = (this.socket.io as unknown as { engine?: { transport?: { ws?: WebSocket } } }).engine?.transport?.ws;
    if (rawSocket) {
      rawSocket.addEventListener("close", (event: CloseEvent) => {
        const code = event.code as WsCloseCode;
        const description = WS_CLOSE_CODES[code] ?? `Unknown close code ${code}`;
        this.log.warn(`[DefendClient] WS closed [${code}]: ${description}`);
        if (code === 4401 || code === 4403) {
          this.log.error(
            "[DefendClient] Auth error on WS – will attempt token refresh and reconnect"
          );
          void this.refreshTokenAndReconnect();
        }
      });
    }
  }

  /** Send the join event required to receive room broadcasts. */
  private joinRoom(): void {
    if (!this.socket) return;
    this.socket.emit("join", (response: unknown) => {
      this.log.info("[DefendClient] Joined room:", response);
    });
  }

  /** Re-attach stored listeners after a reconnection creates a new socket. */
  private reattachListeners(): void {
    for (const [event, fns] of this.listeners) {
      for (const fn of fns) {
        this.socket?.on(event, fn as (data: unknown) => void);
      }
    }
  }

  // ─── Error Handling ───────────────────────────────────────────────────────

  private handleHttpError(statusCode: number): void {
    switch (statusCode) {
      case 400:
        throw new DefendConnectionError(
          400,
          "customerid must be numeric – check DefendClientOptions.customerId"
        );
      case 401:
        throw new DefendConnectionError(
          401,
          "customerid header missing – verify SDK configuration"
        );
      case 402:
        throw new DefendConnectionError(
          402,
          "Subscription inactive or expired – contact LSports support"
        );
      case 403:
        throw new DefendConnectionError(
          403,
          "Customer ID not found – verify your customerId value"
        );
      case 429:
        this.log.warn(
          "[DefendClient] Rate limited (429) – backing off before retry"
        );
        break;
      case 500:
        this.log.warn(
          "[DefendClient] Server error (500) – reconnection will retry with backoff"
        );
        break;
      default:
        this.log.error(`[DefendClient] Unhandled HTTP error ${statusCode}`);
    }
  }

  // ─── Token Refresh ────────────────────────────────────────────────────────

  private scheduleTokenRefresh(): void {
    this.clearTokenRefreshTimer();
    const refreshIn = TOKEN_TTL_MS - TOKEN_REFRESH_BUFFER_MS;
    this.tokenRefreshTimer = setTimeout(() => {
      void this.refreshTokenAndReconnect();
    }, refreshIn);
  }

  private async refreshTokenAndReconnect(): Promise<void> {
    this.log.info("[DefendClient] Refreshing access token…");
    try {
      const newAccessToken = await this.options.onTokenRefresh(
        this.refreshToken
      );
      this.accessToken = newAccessToken;
      this.log.info("[DefendClient] Token refreshed – reconnecting");

      // Disconnect and recreate socket with new credentials
      this.socket?.disconnect();
      this.createSocket();
      this.scheduleTokenRefresh();
    } catch (err) {
      this.log.error("[DefendClient] Token refresh failed:", err);
    }
  }

  private clearTokenRefreshTimer(): void {
    if (this.tokenRefreshTimer !== null) {
      clearTimeout(this.tokenRefreshTimer);
      this.tokenRefreshTimer = null;
    }
  }
}
