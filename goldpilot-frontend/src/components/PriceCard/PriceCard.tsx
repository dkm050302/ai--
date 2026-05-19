import { formatNumber } from '@/utils/format';

interface PriceCardProps {
  priceData: {
    price: number;
    change: number;
    changePct: number;
    high: number;
    low: number;
    timestamp?: Date;
  };
}

export function PriceCard({ priceData }: PriceCardProps) {
  const { price, change, changePct, high, low, timestamp } = priceData;
  const colorClass = change >= 0 ? 'green' : 'red';
  const updatedAt = timestamp
    ? new Date(timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
    : '--:--';

  return (
    <>
      <div className="quote">
        <span className="sub">现货黄金 XAU/USD</span>
        <div className={`value ${colorClass}`}>{formatNumber(price)}</div>
      </div>

      <div className="quote">
        <span className="sub">涨跌额</span>
        <div className={`value ${colorClass}`}>
          {change >= 0 ? '+' : ''}{formatNumber(change)}
        </div>
      </div>

      <div className="quote">
        <span className="sub">涨跌幅</span>
        <div className={`value ${colorClass}`}>
          {changePct >= 0 ? '+' : ''}{formatNumber(changePct)}%
        </div>
      </div>

      <div className="quote">
        <span className="sub">最高</span>
        <div className="value">{formatNumber(high)}</div>
      </div>

      <div className="quote">
        <span className="sub">最低 / 更新</span>
        <div className="value">{formatNumber(low)} <span className="sub">{updatedAt}</span></div>
      </div>
    </>
  );
}
