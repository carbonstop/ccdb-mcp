import { startStdio } from './stdio.js';
import { runCli } from './runner.js';
import { asError, exitCode } from '../../ccdb-client/src/errors.js';
import { startHttp } from './http.js';
const args = process.argv.slice(2);
const command = args[0] || 'stdio';
try {
  if (command === 'stdio') {
    if (args.length > 1) throw new Error('stdio 使用 CCDB_* 环境变量配置，不接受额外命令参数');
    startStdio();
  } else if (command === 'serve') {
    if (args.length !== 1) throw new Error('serve 使用 CCDB_MCP_* 环境变量配置');
    await startHttp();
  } else if (['login', 'status', 'logout'].includes(command))
    process.exitCode = await runCli(['auth', ...args]);
  else if (['doctor', '--version'].includes(command)) process.exitCode = await runCli(args);
  else if (['--help', '-h'].includes(command))
    process.stdout.write(
      'ccdb-mcp stdio | login | status | logout | doctor | serve\n登录选项与 ccdb-cli auth 相同；每个包可独立安装。\nserve 启动无状态 Streamable HTTP：POST /mcp/ccdb；不提供旧版 /sse 端点。\nserve 仅用于配置了网关签名上下文的内部服务，不是直传用户 Key 的公共代理。\n',
    );
  else throw new Error('未知命令，请运行 ccdb-mcp --help');
} catch (error) {
  const e = asError(error);
  process.stderr.write(JSON.stringify({ error: e.toJSON() }) + '\n');
  process.exitCode = exitCode(e);
}
