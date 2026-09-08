/** Supplemental presentation only; never changes the original structured result. */
export function factorLinks(value: Record<string, unknown>): string {
  const object = (v: unknown): Record<string, unknown> =>
    v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  const link = (v: unknown): string | undefined => {
    if (typeof v !== 'string' || /[\s<>\x00-\x1f\x7f]/.test(v)) return;
    try {
      const url = new URL(v);
      if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.hash)
        return;
      if (
        [...url.searchParams.keys()].some((k) =>
          /token|key|secret|password|authorization|signature/i.test(k),
        )
      )
        return;
      return v;
    } catch {
      return;
    }
  };
  const rows = Array.isArray(value.items) ? value.items : value.data ? [value.data] : [];
  const lines: string[] = [];
  rows.forEach((row, i) => {
    const factor = object(row);
    const url = link(factor.detailUrl);
    if (!url) return;
    const name =
      typeof factor.name === 'string'
        ? factor.name
        : object(factor.name).zh || object(factor.name).en;
    const title = (typeof name === 'string' ? name : `因子 ${i + 1}`)
      .replace(/[\x00-\x1f\x7f-\x9f]/g, '')
      .replace(/[\\`*_{}\[\]()<>!|]/g, '\\$&');
    lines.push(`- [${title} — 在 Carbon Agent 查看该因子](<${url}>)`);
  });
  const guidance = object(value.guidance || object(value.data).guidance);
  const action = link(guidance.actionUrl);
  if (guidance.code === 'ECOINVENT_VALUE_RESTRICTED' && action) {
    lines.push(
      `- [在 Carbon Agent 查看来源和适用范围](<${action}>)（当前接口数值受限，不承诺登录或注册后解锁。）`,
    );
  }
  return lines.length
    ? `因子详情链接（回答中保留所展示因子的对应链接）：\n${lines.join('\n')}`
    : '';
}
