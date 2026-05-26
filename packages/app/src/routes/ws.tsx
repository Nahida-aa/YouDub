import { createFileRoute } from '@tanstack/solid-router';
import { createSignal, onCleanup, onMount, For } from 'solid-js';
import { Card, CardHeader, CardTitle, CardContent } from '@repo/ui-solid/base/card';
import { Button } from '@repo/ui-solid/base/button';
import { Badge } from '@repo/ui-solid/base/badge';
import { socket } from '#/lib/ws.ts';

export const Route = createFileRoute('/ws')({
  component: WsTestPage,
});

function WsTestPage() {
  const [messages, setMessages] = createSignal<string[]>([]);
  const [status, setStatus] = createSignal<'connected' | 'disconnected' | 'connecting'>('disconnected');
  const [tasks, setTasks] = createSignal<any[]>([]);
  
  onMount(() => {
    setStatus('connecting');
    
    socket.connect();

    socket.on('connect', () => {
      setStatus('connected');
      addMessage('Connected to WebSocket server');
    });

    socket.on('disconnect', () => {
      setStatus('disconnected');
      addMessage('Disconnected from server');
    });

    // 监听任务列表更新
    socket.on('listTask', (data) => {
      console.log('Received tasks list:', data);
      setTasks(data.tasks || []);
      addMessage(`Received task list update (${data.tasks?.length || 0} tasks)`);
    });

    // 监听特定任务的更新 (示例主题)
    socket.on('tasks:detail:test_id', (data) => {
      addMessage(`Detail update: ${JSON.stringify(data)}`);
    });

    onCleanup(() => {
      socket.disconnect();
    });
  });

  const addMessage = (msg: string) => {
    setMessages(prev => [msg, ...prev].slice(0, 50));
  };

  const subscribeToList = () => {
    addMessage('Subscribing to tasks:list...');
    socket.emit('subscribe', { topic: 'tasks:list' });
  };

  const unsubscribeFromList = () => {
    addMessage('Unsubscribing from tasks:list...');
    socket.emit('unsubscribe', { topic: 'tasks:list' });
  };

  return (
    <div class="p-8 space-y-6">
      <div class="flex items-center justify-between">
        <h1 class="text-2xl font-bold">WebSocket Socket.io Test</h1>
        <Badge class={status() === 'connected' ? 'bg-green-500' : 'bg-red-500'}>
          {status()}
        </Badge>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Controls</CardTitle>
          </CardHeader>
          <CardContent class="space-x-4">
            <Button onClick={subscribeToList} disabled={status() !== 'connected'}>
              Subscribe to List
            </Button>
            <Button onClick={unsubscribeFromList} variant="outline" disabled={status() !== 'connected'}>
              Unsubscribe
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Live Tasks ({tasks().length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div class="space-y-2">
              <For each={tasks()}>
                {(task) => (
                  <div class="p-2 border rounded flex justify-between items-center">
                    <span class="font-medium">{task.title || 'Untitled'}</span>
                    <Badge variant="outline">{task.status}</Badge>
                  </div>
                )}
              </For>
              {tasks().length === 0 && <p class="text-muted-foreground italic">No tasks active</p>}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Logs</CardTitle>
        </CardHeader>
        <CardContent>
          <div class="bg-black text-green-400 p-4 rounded h-64 overflow-y-auto font-mono text-sm">
            <For each={messages()}>
              {(msg) => <div>{`> ${msg}`}</div>}
            </For>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
