const common = `本地登录与诊断选项
  --profile <环境>       默认 production，可选 local / test / pre / 自定义
  --json                 机器可读输出；登录进度为 JSON 行
  --timeout <毫秒>       单次请求超时
`;

export function helpText(parts: string[]): string {
  const topic = parts[0] === 'auth' ? parts[1] : parts[0];
  const pages: Record<string, string> = {
    login: `登录本地 MCP

  ccdb-mcp login [选项]

登录选项
  --method <方式>        device（默认）/ pkce / api-key
  --no-browser           不自动打开浏览器，手动访问授权链接

示例
  ccdb-mcp login --profile test

设备码授权由你在浏览器完成。API Key 通过隐藏输入或 stdin 提供。
环境 CCDB_API_KEY 优先于保存的凭证；OAuth 失败不会自动改用 Key。
登录后由宿主启动 stdio；两边保持相同 profile 和系统用户。
`,
    status: `查看本地凭证状态

  ccdb-mcp status [--profile <环境>] [--json]

不输出 Token 或完整 API Key；本地状态不代表远程权限有效。
`,
    logout: `退出本地 MCP 登录

  ccdb-mcp logout [--profile <环境>] [--revoke]

默认只清理本地凭证。
--revoke 撤销整条应用授权，可能影响共用授权的其他工具。
不会删除环境 CCDB_API_KEY，也不会在服务端停用 API Key。
`,
    doctor: `检查服务配置

  ccdb-mcp doctor [--profile <环境>] [--json]

检查发现端点和本地凭证状态，不查询因子，不证明业务权限有效。
`,
  };
  if (pages[topic]) return pages[topic] + '\n' + common;
  if (topic === 'stdio')
    return `本地 stdio 服务

  ccdb-mcp stdio

这是常驻进程，由 MCP 宿主启动和管理，不是安装验收命令。
宿主配置：command = ccdb-mcp，args = ["stdio"]
测试环境：登录使用 --profile test，宿主设置 CCDB_PROFILE=test。
stdio 通过 CCDB_* 环境变量配置，不接受 --profile 等命令参数。
不带命令时默认启动 stdio；服务输出用于 MCP 协议。
`;
  if (topic === 'serve')
    return `内部 Streamable HTTP 服务

  ccdb-mcp serve

仅供已配置 Gateway 签名上下文的内部部署使用，不直接暴露公网。
通过 CCDB_MCP_* 环境变量配置，不接受 --http 或 --port 参数。
协议入口：POST /mcp/ccdb；不提供旧版 /sse。
远程连接器用户填写 Gateway 公开 MCP URL，无需本地登录或启动服务。
部署说明：https://github.com/carbonstop/ccdb-mcp/blob/main/docs/REMOTE_MCP.md
`;
  return `ccdb-mcp — CCDB MCP 服务

用法
  ccdb-mcp <命令> [选项]

本地账号
  login                  登录（默认设备码授权）
  status                 查看本地凭证状态
  logout                 退出登录
  doctor                 检查服务配置

服务入口
  stdio                  本地 MCP，由宿主启动（默认）
  serve                  内部 HTTP 服务，仅用于 Gateway 配套部署

快速开始（测试环境）
  ccdb-mcp login --profile test
  ccdb-mcp status --profile test --json
  然后由宿主启动 stdio，并设置 CCDB_PROFILE=test。

帮助
  -h, --help             查看帮助
  --version              查看版本
  ccdb-mcp login --help  查看登录选项
  ccdb-mcp serve --help  查看部署说明

远程连接器无需安装本包或执行本地登录，请连接 Gateway 公开 MCP URL。
`;
}
