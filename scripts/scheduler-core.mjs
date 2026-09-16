// Collection and delivery have independent slots. Slow collection never holds delivery.
export function createScheduler({ run, latestCollectDay = async () => '', now = () => new Date(), logError = console.error }) {
  const active = new Map();
  let lastCollectAttemptHour = '', completedCollectDay = '', lastDigestHour = '';
  const launch = (task, onSuccess = () => {}) => {
    const pending = Promise.resolve().then(() => run(task)).then(ok => { if (ok) onSuccess(); })
      .catch(error => logError(`[scheduler] ${task} failed`, error.message))
      .finally(() => active.delete(task));
    active.set(task, pending);
  };
  const scheduleDigest = () => {
    const hour = now().toISOString().slice(0, 13);
    if (!active.has('digest') && lastDigestHour !== hour) {
      lastDigestHour = hour;
      launch('digest');
    }
  };
  return {
    async tick() {
      scheduleDigest();
      const before = now();
      if (active.has('collect') || before.getUTCHours() < 2 || lastCollectAttemptHour === before.toISOString().slice(0, 13)) return;
      let latest = '';
      try { latest = await latestCollectDay(); }
      catch (error) { logError('[scheduler] could not read last collection time', error.message); }
      scheduleDigest();
      const current = now(), day = current.toISOString().slice(0, 10), hour = current.toISOString().slice(0, 13);
      if (active.has('collect') || current.getUTCHours() < 2 || lastCollectAttemptHour === hour || latest === day || completedCollectDay === day) return;
      lastCollectAttemptHour = hour;
      launch('collect', () => { completedCollectDay = day; });
    },
    settle: () => Promise.all([...active.values()]),
    status: () => ({ running: [...active.keys()], lastCollectAttemptHour, completedCollectDay, lastDigestHour })
  };
}
