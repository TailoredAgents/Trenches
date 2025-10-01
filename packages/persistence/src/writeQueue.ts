type Task = () => void | Promise<void>;

export function createWriteQueue(label = 'db'): { push: (t: Task) => void; size: () => number } {
  const queue: Task[] = [];
  let running = false;

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
      queue.push(t);
      void run();
    },
    size: () => queue.length
  };
}

