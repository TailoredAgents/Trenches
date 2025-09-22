import path from 'path';
import { SocialPost } from '@trenches/shared';
import { createLogger } from '@trenches/logger';
import { storeSocialPost } from '@trenches/persistence';
import { SourceDependencies, SocialSource, SourceStatus } from '../types';

const logger = createLogger('social:telegram');

export type TelegramConfig = {
  enabled: boolean;
  channels: string[];
  downloadDir: string;
  pollIntervalSec: number;
};

export function createTelegramSource(
  config: TelegramConfig,
  deps: SourceDependencies,
  options: { apiId?: string; apiHash?: string; botToken?: string }
): SocialSource {
  return new TelegramSource(config, deps, options);
}

type TdlClient = any; // lazy import to avoid type dependency during build

type TdlUpdate = {
  ['@type']: string;
  message?: {
    id: number;
    chat_id: number;
    date?: number;
    sender_id?: { ['@type']: string; user_id?: number };
    content?: {
      ['@type']: string;
      text?: { text?: string };
      caption?: { text?: string };
    };
  };
};

class TelegramSource implements SocialSource {
  readonly name = 'telegram';
  private statusState: SourceStatus = { state: 'idle', detail: 'not started' };
  private client?: TdlClient;
  private stopped = false;
  private allowedChats = new Map<number, string>();
  private seen = new Set<number>();

  constructor(
    private readonly cfg: TelegramConfig,
    private readonly deps: SourceDependencies,
    private readonly options: { apiId?: string; apiHash?: string; botToken?: string }
  ) {}

  status(): SourceStatus {
    return this.statusState;
  }

  async start(): Promise<void> {
    if (!this.cfg.enabled) {
      this.updateStatus({ state: 'idle', detail: 'disabled via config' });
      return;
    }
    if (!this.options.apiId || !this.options.apiHash || !this.options.botToken) {
      this.updateStatus({ state: 'idle', detail: 'missing telegram credentials' });
      return;
    }
    if (this.cfg.channels.length === 0) {
      this.updateStatus({ state: 'idle', detail: 'no telegram channels configured' });
      return;
    }
    try {
      const tdlModule = (await import('tdl')) as any;
      const Client = tdlModule.Client ?? tdlModule.default?.Client ?? tdlModule;
      const tdlibModule = (await import('tdl-tdlib-addon')) as any;
      const TDLib = tdlibModule.TDLib ?? tdlibModule.default?.TDLib ?? tdlibModule;
      const databaseDirectory = path.resolve(this.cfg.downloadDir);
      const client: any = new Client(new TDLib(), {
        apiId: Number(this.options.apiId),
        apiHash: this.options.apiHash,
        databaseDirectory,
        filesDirectory: databaseDirectory,
        useFileDatabase: false,
        useChatInfoDatabase: false,
        useMessageDatabase: false,
        useSecretChats: false
      });
      await client.connectAndLogin(() => ({ type: 'bot', token: this.options.botToken }));
      this.client = client;
      await this.ensureChannels(client);
      client.on('update', (update: TdlUpdate) => this.handleUpdate(update));
      this.updateStatus({ state: 'running', detail: 'listening for messages' });
    } catch (err) {
      const error = err as Error;
      logger.error({ err: error }, 'failed to start telegram source');
      this.updateStatus({ state: 'error', detail: error.message });
    }
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.client) {
      try {
        await this.client.close();
      } catch (err) {
        logger.error({ err }, 'failed to close telegram client');
      }
      this.client = undefined;
    }
    this.updateStatus({ state: 'idle', detail: 'stopped' });
  }

  private async ensureChannels(client: TdlClient): Promise<void> {
    for (const raw of this.cfg.channels) {
      const username = normalizeChannel(raw);
      if (!username) continue;
      try {
        const chat = await client.invoke({
          '@type': 'searchPublicChat',
          username
        });
        if (!chat || typeof chat.id !== 'number') {
          logger.warn({ username }, 'telegram chat lookup failed');
          continue;
        }
        await client.invoke({
          '@type': 'joinChat',
          chat_id: chat.id
        });
        this.allowedChats.set(chat.id, username);
        logger.info({ username, chatId: chat.id }, 'subscribed to telegram channel');
      } catch (err) {
        logger.error({ err, username }, 'failed to join telegram channel');
      }
    }
  }

  private handleUpdate(update: TdlUpdate): void {
    if (this.stopped) return;
    if (update['@type'] !== 'updateNewMessage') return;
    const message = update.message;
    if (!message || !this.allowedChats.has(message.chat_id)) {
      return;
    }
    if (this.seen.has(message.id)) {
      return;
    }
    this.seen.add(message.id);
    const text = extractMessageText(message);
    if (!text) return;
    const channel = this.allowedChats.get(message.chat_id) ?? 'telegram';
    const timestamp = message.date ? new Date(message.date * 1000).toISOString() : new Date().toISOString();
    const post: SocialPost = {
      id: `${message.chat_id}:${message.id}`,
      platform: 'telegram',
      authorId: String(message.sender_id?.user_id ?? message.chat_id),
      authorHandle: channel,
      text,
      lang: undefined,
      link: `https://t.me/${channel}/${message.id}`,
      topics: extractHashtags(text),
      tags: extractHashtags(text),
      publishedAt: timestamp,
      capturedAt: new Date().toISOString(),
      engagement: {},
      source: `telegram:${channel}`,
      raw: message as Record<string, unknown>
    };
    try {
      storeSocialPost(post);
    } catch (err) {
      logger.error({ err }, 'failed to persist telegram message');
    }
    this.deps.emitter.emit('post', post);
  }

  private updateStatus(status: Partial<SourceStatus>): void {
    this.statusState = { ...this.statusState, ...status };
    this.deps.onStatus(this.name, this.statusState);
  }
}

function normalizeChannel(input: string): string | undefined {
  const trimmed = input.trim();
  if (trimmed.length === 0) return undefined;
  if (trimmed.startsWith('https://t.me/')) {
    return trimmed.replace('https://t.me/', '').replace(/^@/, '').split('/')[0];
  }
  return trimmed.replace(/^@/, '');
}

function extractMessageText(message: TdlUpdate['message']): string | undefined {
  if (!message?.content) return undefined;
  if (message.content['@type'] === 'messageText') {
    return message.content.text?.text ?? undefined;
  }
  if (message.content['@type'] === 'messagePhoto' || message.content['@type'] === 'messageVideo') {
    return message.content.caption?.text ?? undefined;
  }
  return undefined;
}

function extractHashtags(text: string): string[] {
  const matches = text.match(/#(\w{3,})/g);
  if (!matches) return [];
  return matches.map((tag) => tag.slice(1).toLowerCase());
}
