import { startStdio } from './stdio.js';
import { runCli } from './runner.js';
import { asError, exitCode } from 'ccdb-client/errors';
import { startHttp } from './http.js';
import { helpText } from './help.js';
const args = process.argv.slice(2);
const command = args[0] || 'stdio';
try {
  if (
    ['--help', '-h'].includes(command) ||
    (['stdio', 'serve'].includes(command) &&
      args.length === 2 &&
      ['--help', '-h'].includes(args[1]))
  ) {
    process.stdout.write(helpText(args));
  } else if (command === 'stdio') {
    if (args.length > 1) throw new Error('stdio 使用 CCDB_* 环境变量配置，不接受额外命令参数');
    startStdio();
  } else if (command === 'serve') {
    if (args.length !== 1) throw new Error('serve 使用 CCDB_MCP_* 环境变量配置');
    await startHttp();
  } else if (['login', 'status', 'logout'].includes(command))
    process.exitCode = await runCli(['auth', ...args]);
  else if (['doctor', '--version'].includes(command)) process.exitCode = await runCli(args);
  else throw new Error('未知命令，请运行 ccdb-mcp --help');
} catch (error) {
  const e = asError(error);
  process.stderr.write(JSON.stringify({ error: e.toJSON() }) + '\n');
  process.exitCode = exitCode(e);
}
