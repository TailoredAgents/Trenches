type Task = () => void | Promise<void>;

const MAX_QUEUE_SIZE = 10000; // Prevent unbounded growth
const WARN_QUEUE_SIZE = 5000; // Log warning when queue is getting large

export function createWriteQueue(label = 'db'): { push: (t: Task) => void; size: () => number } {
  const queue: Task[] = [];
  let running = false;
  let warnedAboutSize = false;

  async function run(): Promise<void> {
    if (running) return;
    running = true;
    try {
      while (queue.length > 0) {
        const task = queue.shift();
        if (!task) break;
        try {
          await task();
        } catch {
          // swallow; best-effort
        }
      }
    } finally {
      running = false;
    }
  }

  return {
    push: (t) => {
      // Drop oldest tasks if queue is at max capacity (prevent OOM)
      if (queue.length >= MAX_QUEUE_SIZE) {
        queue.shift(); // Remove oldest task
        if (!warnedAboutSize) {
          console.error(`[${label}] Write queue at max capacity (${MAX_QUEUE_SIZE}), dropping oldest tasks`);
          warnedAboutSize = true;
        }
      } else if (queue.length >= WARN_QUEUE_SIZE && !warnedAboutSize) {
        console.warn(`[${label}] Write queue is large (${queue.length}), consider reducing write load`);
        warnedAboutSize = true;
      } else if (queue.length < WARN_QUEUE_SIZE / 2) {
        warnedAboutSize = false; // Reset warning flag when queue recovers
      }
      
      queue.push(t);
      void run();
    },
    size: () => queue.length
  };
}

