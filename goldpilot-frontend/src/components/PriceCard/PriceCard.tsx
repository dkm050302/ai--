import { formatNumber } from '@/utils/format';

interface PriceCardProps {
  priceData: {
    price: number;
    change: number;
    changePct: number;
    high: number;
    low: number;
  };
}

/**
 * 价格卡片组件 - 完全按照index.html设计
 */
export function PriceCard({ priceData }: PriceCardProps) {
  const { price, change, changePct, high, low } = priceData;

  const getColorClass = (value: number) => {
    return value >= 0 ? 'green' : 'red';
  };

  return (
    <>
      {/* 现货黄金价格 */}
      <div className="quote">
        <span className="sub">现货黄金 XAU/USD</span>
        <div className={`value ${getColorClass(change)}`}>{formatNumber(price)}</div>
      </div>

      {/* 涨跌额 */}
      <div className="quote">
        <span className="sub">涨跌额</span>
        <div className={`value ${getColorClass(change)}`}>
          {change >= 0 ? '+' : ''}{formatNumber(change)}
        </div>
      </div>

      {/* 涨跌幅 */}
      <div className="quote">
        <span className="sub">涨跌幅</span>
        <div className={`value ${getColorClass(change)}`}>
          {changePct >= 0 ? '+' : ''}{formatNumber(changePct)}%
        </div>
      </div>

      {/* 最高价 */}
      <div className="quote">
        <span className="sub">最高</span>
        <div className="value">{formatNumber(high)}</div>
      </div>

      {/* 最低价 */}
      <div className="quote">
        <span className="sub">最低</span>
        <div className="value">{formatNumber(low)}</div>
      </div>
    </>
  );
}
