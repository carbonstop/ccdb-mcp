import { serveStdio, StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { CcdbClient, config, asError } from 'ccdb-client';
import { createServer } from './server.js';
export function startStdio(env: NodeJS.ProcessEnv = process.env) {
  const client = new CcdbClient(config(env));
  const handle = serveStdio((context) => createServer(client, context), {
    transport: new StdioServerTransport(process.stdin, process.stdout, {
      maxBufferSize: 1024 * 1024,
    }),
    onerror: (error) =>
      process.stderr.write(JSON.stringify({ error: asError(error).toJSON() }) + '\n'),
  });
  const close = () => {
    void handle.close();
  };
  process.once('SIGINT', close);
  process.once('SIGTERM', close);
  process.stdin.once('end', close);
  return handle;
}
