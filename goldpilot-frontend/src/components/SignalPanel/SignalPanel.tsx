import { formatMoney } from '@/utils/format';
import type { Signal, DailyStats } from '@/types';
import { motion } from 'framer-motion';

interface SignalPanelProps {
  signals: Signal[];
  stats: DailyStats;
}

/**
 * 信号面板组件 - 显示今日信号统计和历史
 */
export function SignalPanel({ signals, stats }: SignalPanelProps) {
  const { signalCount, winRate, netProfit } = stats;

  return (
    <div className="bg-white rounded-xl shadow-soft p-4 border border-gray-100">
      {/* 标题栏 */}
      <div className="flex items-center justify-between gap-2 mb-3 pb-3 border-b border-gray-100">
        <strong className="text-sm text-ink">今日信号表现</strong>
      </div>

      {/* 统计数据 */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        {/* 信号数 */}
        <div className="flex flex-col items-center justify-center p-3 bg-gradient-to-br from-soft-blue to-white rounded-lg border border-gray-100">
          <span className="text-2xl font-bold tabular-nums text-ink">{signalCount}</span>
          <span className="text-xs text-muted">信号数</span>
        </div>

        {/* 胜率 */}
        <div className="flex flex-col items-center justify-center p-3 bg-gradient-to-br from-soft-indigo to-white rounded-lg border border-gray-100">
          <span className="text-2xl font-bold tabular-nums text-ink">{winRate.toFixed(0)}%</span>
          <span className="text-xs text-muted">胜率</span>
        </div>

        {/* 盈利 */}
        <div className="flex flex-col items-center justify-center p-3 bg-gradient-to-br from-soft-purple to-white rounded-lg border border-gray-100">
          <span className={`text-2xl font-bold tabular-nums ${
            netProfit >= 0 ? 'text-green-500' : 'text-red-500'
          }`}>
            {netProfit >= 0 ? '+' : ''}{formatMoney(netProfit)}
          </span>
          <span className="text-xs text-muted">盈利</span>
        </div>
      </div>

      {/* 信号记录 */}
      <div className="border-t border-gray-100 pt-3">
        <div className="text-xs text-muted mb-2">今日信号记录:</div>
        <div className="space-y-2 max-h-[200px] overflow-y-auto pr-1">
          {signals.length === 0 ? (
            <div className="text-sm text-muted text-center py-4">暂无信号记录</div>
          ) : (
            signals.map((signal, index) => (
              <motion.div
                key={signal.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.05, duration: 0.3 }}
                whileHover={{ x: 2, backgroundColor: 'rgba(248, 250, 252, 1)' }}
                className="grid grid-cols-[48px_1fr] gap-2 p-2.5 bg-gray-50 rounded-lg border border-gray-100 text-sm leading-relaxed cursor-pointer transition-colors hover:border-blue-200"
              >
                <div className="text-blue-600 font-bold tabular-nums">
                  {new Date(signal.timestamp).toLocaleTimeString('zh-CN', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </div>
                <div>
                  <span className={signal.direction === 'long' ? 'text-green-500' : 'text-red-500'}>
                    {signal.direction === 'long' ? '做多' : '做空'}
                  </span>
                  {' → '}
                  <span className={
                    signal.status === 'profit' ? 'text-green-500' :
                    signal.status === 'loss' ? 'text-red-500' :
                    'text-blue-500'
                  }>
                    {signal.status === 'profit' ? '止盈' :
                     signal.status === 'loss' ? '亏损' : '持仓中'}
                  </span>
                  {signal.profit !== undefined && (
                    <span className={`ml-1 font-medium ${signal.profit >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                      ({signal.profit >= 0 ? '+' : ''}{formatMoney(signal.profit)})
                    </span>
                  )}
                  {signal.status === 'profit' && <span className="ml-1">🟢</span>}
                  {signal.status === 'loss' && <span className="ml-1">🔴</span>}
                </div>
              </motion.div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
