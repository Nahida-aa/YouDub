import type { Socket, TCPSocketListener } from 'bun';
import { MLDaemon } from './client.ts';
import { setActiveConn } from './active.ts';
import { readEnginesConfig } from '../../feat/config/engines.ts';
import { runPipeline } from '../../feat/tasks/pipeline-runner.ts';

export class DaemonServer {
  private port: number;
  private mlDaemon: MLDaemon;
  private server: TCPSocketListener<{ buffer: string }> | null = null;
  private queue: { conn: Socket<unknown>; taskId: string }[] = [];
  private busy = false;

  constructor(port: number, mlDaemon: MLDaemon) {
    this.port = port;
    this.mlDaemon = mlDaemon;
  }

  async start(): Promise<void> {
    this.server = Bun.listen({
      hostname: '127.0.0.1',
      port: this.port,
      socket: {
        open: (conn) => {
          conn.data = { buffer: '' };
        },
        data: (conn, data) => {
          const buf = conn.data.buffer + new TextDecoder().decode(data as any);
          const lines = buf.split('\n');
          conn.data.buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            let cmd: any;
            try { cmd = JSON.parse(trimmed); } catch { continue; }

            if (cmd.action === 'shutdown') {
              conn.end(JSON.stringify({ type: 'shutdown' }) + '\n');
              this.stop();
              return;
            }

            if (cmd.action === 'run_task' && cmd.task_id) {
              this.queue.push({ conn: conn as any, taskId: cmd.task_id });
              this._processQueue();
            }
          }
        },
        close: () => {},
      },
    });

    console.log(`[DaemonServer] listening on 127.0.0.1:${this.port} (pid ${process.pid})`);
  }

  async stop(): Promise<void> {
    try { this.server?.stop(true); } catch {}
    process.exit(0);
  }

  private async _processQueue(): Promise<void> {
    if (this.busy || this.queue.length === 0) return;
    this.busy = true;

    const { conn, taskId } = this.queue.shift()!;
    setActiveConn(conn as any);

    try {
      await runPipeline(taskId, this.mlDaemon);
      try { conn.end(JSON.stringify({ type: 'complete', task_id: taskId }) + '\n'); } catch {}
    } catch (err: any) {
      try { conn.end(JSON.stringify({ type: 'error', task_id: taskId, message: err.message }) + '\n'); } catch {}
    } finally {
      setActiveConn(null);
      this.busy = false;
      this._processQueue();
    }
  }
}
