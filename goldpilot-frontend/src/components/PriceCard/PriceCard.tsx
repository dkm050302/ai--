import { formatNumber } from '@/utils/format';

interface PriceCardProps {
  priceData: {
    price: number;
    change: number;
    changePct: number;
    high: number;
    low: number;
  } | null;
  marketClosed?: boolean;
  snapshotText?: string;
}

/**
 * 价格卡片组件 - 完全按照index.html设计
 */
export function PriceCard({ priceData, marketClosed = false, snapshotText }: PriceCardProps) {
  const price = priceData?.price;
  const change = priceData?.change;
  const changePct = priceData?.changePct;
  const high = priceData?.high;
  const low = priceData?.low;

  const getColorClass = (value?: number) => {
    if (marketClosed || value === undefined) return '';
    return value >= 0 ? 'green' : 'red';
  };

  const formatOptionalNumber = (value?: number) => {
    return typeof value === 'number' && Number.isFinite(value) ? formatNumber(value) : '--';
  };

  if (marketClosed && !priceData) {
    return (
      <div className="quote quote-closed-summary">
        <div>
          <span className="sub">现货黄金 XAU/USD</span>
          <div className="value amber">周末休市</div>
        </div>
        <div className="quote-closed-copy">
          暂无本地行情缓存，已暂停实时报价和K线请求。开盘后自动恢复交易看板。
        </div>
      </div>
    );
  }

  return (
    <>
      {/* 现货黄金价格 */}
      <div className="quote">
        <span className="sub">
          现货黄金 XAU/USD{marketClosed ? ' · 休市' : ''}
        </span>
        <div className={`value ${getColorClass(change)}`}>{formatOptionalNumber(price)}</div>
        {marketClosed && snapshotText && <small className="quote-note">{snapshotText}</small>}
      </div>

      {/* 涨跌额 */}
      <div className="quote">
        <span className="sub">涨跌额</span>
        <div className={`value ${getColorClass(change)}`}>
          {typeof change === 'number' ? `${change >= 0 ? '+' : ''}${formatNumber(change)}` : '--'}
        </div>
      </div>

      {/* 涨跌幅 */}
      <div className="quote">
        <span className="sub">涨跌幅</span>
        <div className={`value ${getColorClass(change)}`}>
          {typeof changePct === 'number' ? `${changePct >= 0 ? '+' : ''}${formatNumber(changePct)}%` : '--'}
        </div>
      </div>

      {/* 最高价 */}
      <div className="quote">
        <span className="sub">最高</span>
        <div className="value">{formatOptionalNumber(high)}</div>
      </div>

      {/* 最低价 */}
      <div className="quote">
        <span className="sub">最低</span>
        <div className="value">{formatOptionalNumber(low)}</div>
      </div>
    </>
  );
}
