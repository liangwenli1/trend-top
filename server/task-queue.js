import crypto from 'node:crypto';
import { many, query } from './db.js';
import { withTaskLease } from './operations.js';

const tasks = ['collect', 'digest', 'backfill', 'history'];
export async function enqueueTask(task, requestedBy) {
  if (!tasks.includes(task)) throw Object.assign(new Error('Unknown task'), { status: 400 });
  const result = await query(`INSERT INTO task_requests (id,task,requested_by,status)
    VALUES ($1,$2,$3,'queued') ON CONFLICT (task) WHERE status IN ('queued','running')
    DO UPDATE SET task=EXCLUDED.task RETURNING id,task,status,created_at`, [crypto.randomUUID(), task, requestedBy]);
  return result.rows[0];
}
export async function runQueuedTask(task, run) {
  if (!tasks.includes(task)) throw new Error('Unknown task');
  return withTaskLease('queue:' + task, async (assertLease, workerOwner) => {
    // Holding this task's worker lease proves any previous worker has stopped owning it.
    await query(`UPDATE task_requests SET status=CASE WHEN attempts<3 THEN 'queued' ELSE 'failed' END,
      last_error='Worker interrupted; recovered after lease expiry',available_at=NOW(),worker_owner=NULL
      WHERE task=$1 AND status='running'`, [task]);
    const result = await query(`UPDATE task_requests SET status='running',attempts=attempts+1,started_at=NOW(),worker_owner=$2
      WHERE id=(SELECT id FROM task_requests WHERE task=$1 AND status='queued' AND available_at<=NOW()
        ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED) RETURNING *`, [task,workerOwner]);
    const request = result.rows[0];
    if (!request) return { empty: true };
    try {
      await assertLease();
      const value = await run(task);
      await assertLease();
      if (value?.skipped) {
        await query(`UPDATE task_requests SET status='queued',attempts=attempts-1,
          available_at=NOW()+INTERVAL '60 seconds' WHERE id=$1 AND worker_owner=$2 AND status='running'`, [request.id,workerOwner]);
        return value;
      }
      await query("UPDATE task_requests SET status='ok',finished_at=NOW(),last_error=NULL WHERE id=$1 AND worker_owner=$2 AND status='running'", [request.id,workerOwner]);
      return value;
    } catch (error) {
      await query(`UPDATE task_requests SET status=CASE WHEN attempts<3 THEN 'queued' ELSE 'failed' END,
        available_at=NOW()+INTERVAL '5 minutes',last_error=$2,finished_at=NOW() WHERE id=$1 AND worker_owner=$3 AND status='running'`,
      [request.id, String(error.message).slice(0, 500),workerOwner]);
      throw error;
    }
  });
}
export const queuedTasks = () => many('SELECT id,task,status,attempts,created_at,started_at,finished_at,available_at,last_error FROM task_requests ORDER BY created_at DESC LIMIT 50');
