import { goldHistoryService } from '../services/goldHistory';

function formatTime(value?: string): string {
  if (!value) return '-';
  return value.slice(0, 19).replace('T', ' ');
}

function formatPct(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

async function main(): Promise<void> {
  const summaries = await goldHistoryService.getCacheSummaries();

  if (!summaries.length) {
    console.log('暂无历史行情仓库记录。');
    return;
  }

  console.log('GoldPilot 历史行情健康检查');
  console.log('规则：分钟/小时级别剔除周六、周日21:00 UTC前的非交易时段K线；日线不做周末过滤。');
  console.log('');

  for (const summary of summaries) {
    const session = summary.session;
    console.log(`${summary.symbol.toUpperCase()} ${summary.period} | ${summary.provider}`);
    console.log(`  原始数量: ${summary.candleCount.toLocaleString()}`);
    console.log(`  原始范围: ${formatTime(summary.startTime)} -> ${formatTime(summary.endTime)}`);

    if (session) {
      console.log(`  可交易数量: ${session.tradableCount.toLocaleString()}`);
      console.log(`  剔除非交易: ${session.removedNonTradingCount.toLocaleString()} (${formatPct(session.nonTradingRatio)})`);
      console.log(`  剔除周末: ${session.removedWeekendCount.toLocaleString()}`);
      console.log(`  清洗后异常缺口: ${session.gapCount.toLocaleString()} / 最大 ${Math.round(session.largestGapSeconds / 3600)} 小时`);
      if (session.warnings.length) {
        console.log(`  提示: ${session.warnings.join('；')}`);
      }
    }

    console.log('');
  }
}

main().catch((error) => {
  console.error('历史行情健康检查失败:', error);
  process.exitCode = 1;
});
