import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';

type JobHandler = (data: Record<string, unknown>) => Promise<void>;

interface QueuedJob {
  name: string;
  data: Record<string, unknown>;
  attempts: number;
}

@Injectable()
export class QueueService implements OnModuleDestroy {
  private readonly logger = new Logger(QueueService.name);
  private readonly handlers = new Map<string, JobHandler>();
  private readonly queue: QueuedJob[] = [];
  private processing = false;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.timer = setInterval(() => void this.processNext(), 500);
  }

  registerHandler(name: string, handler: JobHandler): void {
    this.handlers.set(name, handler);
  }

  async enqueue(name: string, data: Record<string, unknown> = {}): Promise<void> {
    this.queue.push({ name, data, attempts: 0 });
  }

  getStats(): { pending: number; handlers: string[] } {
    return {
      pending: this.queue.length,
      handlers: [...this.handlers.keys()],
    };
  }

  private async processNext(): Promise<void> {
    if (this.processing || this.queue.length === 0) return;
    this.processing = true;
    const job = this.queue.shift();
    if (!job) {
      this.processing = false;
      return;
    }

    const handler = this.handlers.get(job.name);
    if (!handler) {
      this.logger.warn(`No handler for job: ${job.name}`);
      this.processing = false;
      return;
    }

    try {
      await handler(job.data);
    } catch (err) {
      job.attempts += 1;
      if (job.attempts < 3) {
        this.queue.push(job);
        this.logger.warn(`Job ${job.name} failed, retry ${job.attempts}/3`);
      } else {
        this.logger.error(`Job ${job.name} failed permanently`, err);
      }
    } finally {
      this.processing = false;
    }
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }
}
