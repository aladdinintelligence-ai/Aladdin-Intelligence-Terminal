// App-wide FIFO concurrency gate for provider transports. Serializes upstream
// queries so controllers stay under the provider's per-session limit. Two
// priority classes share the pool: "user" work may occupy every slot, while
// "background" work (scheduler feed jobs, telemetry) is capped at
// backgroundConcurrent so at least one slot stays reserved for user-triggered
// requests. This keeps cold, user-initiated lookups responsive even while the
// background refresh cadence saturates its share.

export function createGate({ maxConcurrent, backgroundConcurrent, transport }) {
  const max = Math.max(maxConcurrent || 5, 1);
  const maxBg = Math.max(0, Math.min(backgroundConcurrent == null ? max - 1 : backgroundConcurrent, max));

  let active = 0;
  let activeBg = 0;
  const queue = [];

  function canRun(task) {
    if (active >= max) return false;
    if (task.priority === 'background' && activeBg >= maxBg) return false;
    return true;
  }

  function run(task) {
    active++;
    if (task.priority === 'background') activeBg++;
    Promise.resolve(transport(task.query, task.label, task.opts)).then(task.resolve, task.reject).finally(() => {
      active--;
      if (task.priority === 'background') activeBg--;
      pump();
    });
  }

  // Scan for the first runnable task (user tasks pass blocked background ones).
  function pump() {
    let i = 0;
    while (i < queue.length) {
      if (canRun(queue[i])) {
        const task = queue.splice(i, 1)[0];
        run(task);
      } else {
        i++;
      }
    }
  }

  function gated(query, label = '', opts = {}) {
    const priority = opts && opts.priority === 'background' ? 'background' : 'user';
    return new Promise((resolve, reject) => {
      queue.push({ query, label, opts, priority, resolve, reject });
      pump();
    });
  }

  function state() {
    return {
      active,
      activeBackground: activeBg,
      queued: queue.length,
      maxConcurrent: max,
      backgroundConcurrent: maxBg,
    };
  }

  return { gated, state };
}