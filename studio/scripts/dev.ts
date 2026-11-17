const bun = process.execPath;
const apiPort = process.env.FORMA_API_PORT ?? '3001';
const children = [
  Bun.spawn([bun, '--watch', 'server/index.ts'], {
    cwd: new URL('..', import.meta.url).pathname,
    env: { ...process.env, PORT: apiPort },
    stdout: 'inherit',
    stderr: 'inherit',
  }),
  Bun.spawn(
    [
      bun,
      '--bun',
      'node_modules/vite/bin/vite.js',
      '--host',
      '127.0.0.1',
      ...process.argv.slice(2),
    ],
    { cwd: new URL('..', import.meta.url).pathname, stdout: 'inherit', stderr: 'inherit' },
  ),
];
let stopping = false;
function stop() {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill();
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
const code = await Promise.race(children.map((child) => child.exited));
stop();
await Promise.all(children.map((child) => child.exited));
process.exit(code);
