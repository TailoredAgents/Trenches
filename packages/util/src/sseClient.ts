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

export type SSEStreamMessage = { data: string; event?: string };

type SerializeFn<T> = (value: T) => SSEStreamMessage;

const defaultSerialize: SerializeFn<unknown> = (value) => {
  if (typeof value === 'string') {
    return { data: value };
  }
  if (value && typeof value === 'object' && 'data' in (value as Record<string, unknown>)) {
    const message = value as { data: unknown; event?: unknown };
    const data = typeof message.data === 'string' ? message.data : JSON.stringify(message.data);
    const event = message.event !== undefined ? String(message.event) : undefined;
    return event ? { data, event } : { data };
  }
  return { data: JSON.stringify(value) };
};

export type SSEQueue<T> = {
  iterator: AsyncGenerator<SSEStreamMessage>;
  push(value: T): void;
  close(): void;
};

export function sseQueue<T>(serialize: SerializeFn<T> = defaultSerialize as SerializeFn<T>): SSEQueue<T> {
  const queue: SSEStreamMessage[] = [];
  let notify: (() => void) | undefined;
  let closed = false;

  const awaken = () => {
    if (notify) {
      notify();
      notify = undefined;
    }
  };

  const iterator = (async function* (): AsyncGenerator<SSEStreamMessage> {
    try {
      while (true) {
        if (queue.length === 0) {
          if (closed) {
            break;
          }
          await new Promise<void>((resolve) => {
            notify = resolve;
          });
          if (queue.length === 0 && closed) {
            break;
          }
          if (queue.length === 0) {
            continue;
          }
        }
        const next = queue.shift();
        if (!next) {
          if (closed) {
            break;
          }
          continue;
        }
        yield next;
      }
    } finally {
      closed = true;
      queue.length = 0;
    }
  })();

  const push = (value: T) => {
    if (closed) {
      return;
    }
    queue.push(serialize(value));
    awaken();
  };

  const close = () => {
    if (closed) {
      return;
    }
    closed = true;
    awaken();
    if (typeof iterator.return === 'function') {
      void iterator.return(undefined as never);
    }
  };

  return { iterator, push, close };
}

type FastifySSEReply = {
  raw: {
    on(event: 'close' | 'error', handler: () => void): void;
    removeListener?: (event: 'close' | 'error', handler: () => void) => void;
  };
  sse(iterator: AsyncGenerator<SSEStreamMessage>): void;
};

export function sseRoute(
  reply: FastifySSEReply,
  iterator: AsyncGenerator<SSEStreamMessage>,
  close?: () => void
): void {
  let finished = false;
  const raw = reply.raw as typeof reply.raw & { removeListener?: (event: string, handler: () => void) => void };
  const finalize = () => {
    if (finished) {
      return;
    }
    finished = true;
    try {
      raw.removeListener?.('close', finalize);
      raw.removeListener?.('error', finalize);
    } catch {
      // ignore listener removal errors
    }
    if (close) {
      try {
        close();
      } catch {
        // ignore close errors
      }
    }
  };

  raw.on('close', finalize);
  raw.on('error', finalize);
  try {
    reply.sse(iterator);
  } catch (err) {
    finalize();
    throw err;
  }
}

export type SubscribeJsonStreamOptions<T> = Omit<SSEClientOptions, 'onEvent'> & {
  onMessage: (payload: T, event: SSEMessageEvent) => void | Promise<void>;
  parse?: (raw: string) => T;
  ignorePings?: boolean;
  onParseError?: (err: unknown, raw: string, event: SSEMessageEvent) => void;
};

export function subscribeJsonStream<T = unknown>(
  url: string,
  options: SubscribeJsonStreamOptions<T>
): { dispose: () => void } {
  const {
    onMessage,
    parse,
    ignorePings = true,
    onParseError,
    ...clientOptions
  } = options;

  const parser = parse ?? ((raw: string) => JSON.parse(raw) as T);

  return createSSEClient(url, {
    ...clientOptions,
    onEvent: async (event) => {
      if (!event?.data) {
        return;
      }
      const trimmed = event.data.trim();
      if (ignorePings && (trimmed.length === 0 || trimmed === 'ping')) {
        return;
      }
      let payload: T;
      try {
        payload = parser(event.data);
      } catch (err) {
        if (onParseError) {
          onParseError(err, event.data, event);
        } else if (clientOptions.onError) {
          clientOptions.onError(err, 0);
        }
        return;
      }
      try {
        const result = onMessage(payload, event);
        if (result && typeof (result as Promise<void>).then === 'function') {
          await result;
        }
      } catch (err) {
        if (clientOptions.onError) {
          clientOptions.onError(err, 0);
        }
      }
    }
  });
}
