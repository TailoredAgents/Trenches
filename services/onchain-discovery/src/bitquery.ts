import { createLogger } from '@trenches/logger';
import { DiscoveryEventBus } from './eventBus';
import { RaydiumWatcher } from './raydium';

const logger = createLogger('onchain:bitquery');

export class BitqueryManager {
  private readonly watcher: RaydiumWatcher;

  constructor(bus: DiscoveryEventBus) {
    this.watcher = new RaydiumWatcher(bus);
  }

  async start(): Promise<void> {
    try {
      await this.watcher.start();
    } catch (err) {
      logger.error({ err }, 'failed to start bitquery watcher');
    }
  }

  async stop(): Promise<void> {
    await this.watcher.stop();
  }
}
