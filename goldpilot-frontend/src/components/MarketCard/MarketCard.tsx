import type { PriceData } from '@/types';

interface MarketCardProps {
  priceData: PriceData;
}

export function MarketCard({ priceData }: MarketCardProps) {
  const getColorClass = (value: number) => {
    return value >= 0 ? 'green' : 'red';
  };

  return (
    <article className="market-card">
      {/* 报价条 */}
      <div className="quote-strip">
        <div className="quote">
          <span className="sub">现货黄金 XAU/USD</span>
          <div className={`value ${getColorClass(priceData.change || 0)}`}>
            {priceData.price?.toFixed(2) || '--'}
          </div>
        </div>
        <div className="quote">
          <span className="sub">涨跌额</span>
          <div className={`value ${getColorClass(priceData.change || 0)}`}>
            {priceData.change !== undefined ? (priceData.change >= 0 ? '+' : '') + priceData.change.toFixed(2) : '--'}
          </div>
        </div>
        <div className="quote">
          <span className="sub">涨跌幅</span>
          <div className={`value ${getColorClass(priceData.changePct || 0)}`}>
            {priceData.changePct !== undefined ? (priceData.changePct >= 0 ? '+' : '') + priceData.changePct.toFixed(2) + '%' : '--'}
          </div>
        </div>
        <div className="quote">
          <span className="sub">最高</span>
          <div className="value">{priceData.high?.toFixed(2) || '--'}</div>
        </div>
        <div className="quote">
          <span className="sub">最低</span>
          <div className="value">{priceData.low?.toFixed(2) || '--'}</div>
        </div>
      </div>

      {/* 图表区域 - 简化版本，使用外部链接 */}
      <div className="chart-area">
        <div className="chart-head">
          <div>
            <strong>现货黄金蜡烛图</strong>
            <div className="sub">
              查看实时图表请访问：
              <a
                href="https://cn.tradingview.com/chart/?symbol=OANDA:XAUUSD"
                target="_blank"
                rel="noopener noreferrer"
                className="source-link ml-2"
              >
                TradingView 图表 →
              </a>
            </div>
          </div>
        </div>

        <div className="chart-wrap-placeholder">
          <div className="placeholder-content">
            <div className="placeholder-icon">📈</div>
            <div className="placeholder-text">K线图表</div>
            <div className="placeholder-sub">点击上方链接查看实时图表</div>
          </div>
        </div>
      </div>
    </article>
  );
}
