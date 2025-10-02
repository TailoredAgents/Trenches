export type SSEMessageEvent = {
  data: string;
  lastEventId?: string;
  type?: string;
};

export type SSESource = {
  close(): void;
  onopen: ((ev: unknown) => void) | null;
  onerror: ((err: unknown) => void) | null;
  onmessage: ((event: SSEMessageEvent) => void) | null;
};

export type SSEConnectionInit = {
  headers?: Record<string, string>;
  withCredentials?: boolean;
};

export type SSEFactory = (url: string, init?: SSEConnectionInit) => SSESource;

export type LastEventIdStore = {
  get(): Promise<string | undefined> | string | undefined;
  set(value: string | undefined): Promise<void> | void;
};

export type SSEClientOptions = {
  onEvent: (event: SSEMessageEvent) => void | Promise<void>;
  onError?: (err: unknown, attempt: number) => void;
  onOpen?: () => void;
  headers?: Record<string, string>;
  lastEventIdStore?: LastEventIdStore;
  minBackoffMs?: number;
  maxBackoffMs?: number;
  eventSourceFactory?: SSEFactory;
};

type MaybePromise<T> = T | Promise<T>;

function createMemoryStore(): LastEventIdStore {
  let current: string | undefined;
  return {
    get(): string | undefined {
      return current;
    },
    set(value: string | undefined): void {
      current = value ?? undefined;
    }
  };
}

export function createInMemoryLastEventIdStore(): LastEventIdStore {
  return createMemoryStore();
}

function defaultFactory(url: string, init?: SSEConnectionInit): SSESource {
  const globalAny = globalThis as Record<string, unknown>;
  const ctor = globalAny.EventSource as (new (u: string, cfg?: SSEConnectionInit) => SSESource) | undefined;
  if (!ctor) {
    throw new Error('No global EventSource implementation available. Provide eventSourceFactory in options.');
  }
  return new ctor(url, init);
}

export function createSSEClient(url: string, options: SSEClientOptions): { dispose: () => void } {
  const {
    onEvent,
    onError,
    onOpen,
    headers = {},
    lastEventIdStore = createMemoryStore(),
    minBackoffMs = 1_000,
    maxBackoffMs = 30_000,
    eventSourceFactory
  } = options;

  let disposed = false;
  let currentSource: SSESource | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let backoff = minBackoffMs;
  let attempts = 0;

  const factory = eventSourceFactory ?? defaultFactory;

  const scheduleReconnect = () => {
    if (disposed) {
      return;
    }
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
    }
    const jitter = Math.floor(Math.random() * 500);
    const delay = backoff + jitter;
    backoff = Math.min(backoff * 2, maxBackoffMs);
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      void connect();
    }, delay);
  };

  const connect = async () => {
    if (disposed) {
      return;
    }
    let lastEventId: string | undefined;
    try {
      const maybeId = await Promise.resolve(lastEventIdStore.get());
      lastEventId = maybeId ?? undefined;
    } catch {
      lastEventId = undefined;
    }

    const initHeaders = { ...headers };
    if (lastEventId) {
      initHeaders['Last-Event-ID'] = lastEventId;
    }

    let source: SSESource;
    try {
      source = factory(url, { headers: initHeaders });
    } catch (err) {
      if (onError) onError(err, attempts);
      scheduleReconnect();
      return;
    }

    currentSource = source;
    attempts += 1;

    source.onopen = () => {
      attempts = 0;
      backoff = minBackoffMs;
      if (onOpen) {
        try {
          onOpen();
        } catch (err) {
          if (onError) onError(err, attempts);
        }
      }
    };

    source.onmessage = (event) => {
      if (!event) {
        return;
      }
      const eventId = event.lastEventId ?? undefined;
      if (eventId) {
        try {
          void Promise.resolve(lastEventIdStore.set(eventId));
        } catch {
          // ignore store errors
        }
      }
      try {
        const result: MaybePromise<void> = onEvent(event);
        if (result && typeof (result as Promise<void>).then === 'function') {
          (result as Promise<void>).catch((err) => {
            if (onError) onError(err, attempts);
          });
        }
      } catch (err) {
        if (onError) onError(err, attempts);
      }
    };

    source.onerror = (err) => {
      if (onError) onError(err, attempts);
      source.onopen = null;
      source.onmessage = null;
      source.onerror = null;
      source.close();
      scheduleReconnect();
    };
  };

  const dispose = () => {
    disposed = true;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (currentSource) {
      currentSource.onopen = null;
      currentSource.onmessage = null;
      currentSource.onerror = null;
      try {
        currentSource.close();
      } catch {
        // ignore
      }
      currentSource = null;
    }
  };

  void connect();

  return { dispose };
}
