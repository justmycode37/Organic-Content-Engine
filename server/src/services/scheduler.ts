import type { Logger } from '../logger.ts';
import type { AutonomyService } from './autonomy.ts';
import type { PublisherService, PublishRunResult } from './publisher.ts';

export interface SchedulerStatus {
  enabled: boolean;
  running: boolean;
  tickSeconds: number;
  lastTickAt: string | null;
  lastError: string | null;
}

/**
 * Timer around `tick()`. Publishing is awaited so ticks cannot overlap; the autonomy
 * cycle runs on the side so a slow LLM call never delays a due post.
 */
export class Scheduler {
  private readonly publisher: PublisherService;
  private readonly autonomy: AutonomyService;
  private readonly logger: Logger;
  private readonly now: () => Date;
  private readonly tickMs: number;
  private readonly enabled: boolean;
  private timer: NodeJS.Timeout | null = null;
  private ticking: Promise<void> | null = null;
  private cycle: Promise<unknown> | null = null;
  private lastTickAt: string | null = null;
  private lastError: string | null = null;

  constructor(deps: {
    publisher: PublisherService;
    autonomy: AutonomyService;
    logger: Logger;
    now: () => Date;
    tickSeconds: number;
    enabled: boolean;
  }) {
    this.publisher = deps.publisher;
    this.autonomy = deps.autonomy;
    this.logger = deps.logger;
    this.now = deps.now;
    this.tickMs = deps.tickSeconds * 1000;
    this.enabled = deps.enabled;
  }

  start(): void {
    if (!this.enabled || this.timer) return;
    this.timer = setInterval(() => void this.tick(), this.tickMs);
    this.timer.unref();
    void this.tick();
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    await Promise.allSettled([this.ticking, this.cycle]);
  }

  /** Never rejects. Safe to call directly from tests. */
  tick(): Promise<void> {
    this.ticking ??= this.runTick().finally(() => {
      this.ticking = null;
    });
    return this.ticking;
  }

  /** Resolves when any side-running autonomy cycle has finished. */
  async settled(): Promise<void> {
    await Promise.allSettled([this.ticking, this.cycle]);
  }

  publishDue(): Promise<PublishRunResult> {
    return this.publisher.publishDue();
  }

  status(): SchedulerStatus {
    return {
      enabled: this.enabled,
      running: this.timer !== null,
      tickSeconds: this.tickMs / 1000,
      lastTickAt: this.lastTickAt,
      lastError: this.lastError,
    };
  }

  private async runTick(): Promise<void> {
    this.lastTickAt = this.now().toISOString();
    try {
      await this.publisher.publishDue();
      this.lastError = null;
    } catch (error) {
      this.fail('publish job failed', error);
    }
    try {
      if (!this.autonomy.isRunning && this.autonomy.isDue()) {
        this.cycle = this.autonomy
          .runCycle()
          .catch((error) => this.fail('autonomy cycle failed', error))
          .finally(() => {
            this.cycle = null;
          });
      }
    } catch (error) {
      this.fail('autonomy check failed', error);
    }
  }

  private fail(message: string, error: unknown): void {
    this.lastError = error instanceof Error ? error.message : String(error);
    this.logger.error(message, { error: this.lastError });
  }
}
