export type GoldStrategyDirection = '纯多头' | '纯空头' | '单向' | '双向';
export type GoldStrategyMethod = '趋势跟踪' | '均值回归' | '剥头皮' | '马丁' | '网格' | '突破' | '事件驱动' | '波动率' | '套利过滤';
export type GoldStrategyKind = '纯技术' | '事件型' | '重大数据型';
export type GoldStrategySession = '亚盘策略' | '欧盘策略' | '美盘策略' | '全天候';
export type GoldStrategyHorizon = '日内高频' | '日内短线' | '中期波段' | '长期趋势';
export type GoldStrategyStyle = '稳健' | '中风险' | '激进' | '暴利' | '防守';

export interface GoldStrategyDefinition {
  id: string;
  name: string;
  summary: string;
  direction: GoldStrategyDirection;
  method: GoldStrategyMethod;
  kind: GoldStrategyKind;
  session: GoldStrategySession;
  horizon: GoldStrategyHorizon;
  style: GoldStrategyStyle;
  riskScore: number;
  preferredState: '趋势' | '震荡' | '高波动' | '数据窗口' | '低波动';
  tags: string[];
}

export const GOLD_STRATEGY_LIBRARY: GoldStrategyDefinition[] = [
  { id: 'xau-trend-ema-21-89', name: 'EMA21/89 趋势金叉', summary: 'EMA21 与 EMA89 形成方向确认后顺势入场，ATR 做动态止损。', direction: '双向', method: '趋势跟踪', kind: '纯技术', session: '全天候', horizon: '日内短线', style: '稳健', riskScore: 38, preferredState: '趋势', tags: ['EMA', 'ATR止损', '趋势确认'] },
  { id: 'xau-ema-89-233-filter', name: 'EMA89/233 主趋势过滤', summary: '只在 EMA89 与 EMA233 同向排列时开仓，过滤反趋势噪音。', direction: '双向', method: '趋势跟踪', kind: '纯技术', session: '全天候', horizon: '中期波段', style: '稳健', riskScore: 32, preferredState: '趋势', tags: ['主趋势', '过滤器', '低换手'] },
  { id: 'xau-london-breakout', name: '伦敦开盘突破', summary: '欧盘前高低点被有效突破后跟随，适合黄金欧盘放量。', direction: '双向', method: '突破', kind: '纯技术', session: '欧盘策略', horizon: '日内短线', style: '中风险', riskScore: 55, preferredState: '高波动', tags: ['欧盘', '突破', '放量'] },
  { id: 'xau-ny-breakout', name: '纽约盘动量突破', summary: '美盘开盘后观察成交波动，突破亚洲/欧洲区间后顺势。', direction: '双向', method: '突破', kind: '纯技术', session: '美盘策略', horizon: '日内短线', style: '中风险', riskScore: 58, preferredState: '高波动', tags: ['美盘', '动量', '区间突破'] },
  { id: 'xau-asia-range-fade', name: '亚盘窄幅反转', summary: '亚盘低波动时在区间上下沿反向试探，止损贴近区间外。', direction: '双向', method: '均值回归', kind: '纯技术', session: '亚盘策略', horizon: '日内高频', style: '稳健', riskScore: 36, preferredState: '低波动', tags: ['亚盘', '区间', '反转'] },
  { id: 'xau-vwap-reversion', name: 'VWAP 均值回归', summary: '价格偏离日内 VWAP 后等待衰竭信号，回归均线附近止盈。', direction: '双向', method: '均值回归', kind: '纯技术', session: '全天候', horizon: '日内短线', style: '稳健', riskScore: 40, preferredState: '震荡', tags: ['VWAP', '偏离修复', '日内'] },
  { id: 'xau-rsi-extreme-scalp', name: 'RSI 极值剥头皮', summary: 'RSI 进入极端区后等待一根确认 K 线，短持仓快进快出。', direction: '双向', method: '剥头皮', kind: '纯技术', session: '美盘策略', horizon: '日内高频', style: '中风险', riskScore: 62, preferredState: '震荡', tags: ['RSI', '剥头皮', '短持仓'] },
  { id: 'xau-boll-squeeze', name: '布林收口突破', summary: '布林带宽度收缩后跟随第一段有效突破，防止低波动突变。', direction: '双向', method: '突破', kind: '纯技术', session: '全天候', horizon: '日内短线', style: '中风险', riskScore: 52, preferredState: '低波动', tags: ['布林带', '波动扩张', '突破'] },
  { id: 'xau-atr-channel', name: 'ATR 通道跟随', summary: '用 ATR 通道判断强弱边界，通道外延续则顺势跟随。', direction: '双向', method: '波动率', kind: '纯技术', session: '全天候', horizon: '中期波段', style: '稳健', riskScore: 42, preferredState: '趋势', tags: ['ATR', '通道', '趋势持有'] },
  { id: 'xau-keltner-pullback', name: '肯特纳回踩入场', summary: '趋势中等待回踩肯特纳中轨，确认后继续顺势。', direction: '双向', method: '趋势跟踪', kind: '纯技术', session: '欧盘策略', horizon: '日内短线', style: '稳健', riskScore: 39, preferredState: '趋势', tags: ['Keltner', '回踩', '顺势'] },
  { id: 'xau-donchian-55', name: 'Donchian 55 突破', summary: '突破 55 周期高低点后建立波段仓，移动止损保护利润。', direction: '双向', method: '突破', kind: '纯技术', session: '全天候', horizon: '中期波段', style: '中风险', riskScore: 57, preferredState: '趋势', tags: ['Donchian', '波段', '移动止损'] },
  { id: 'xau-adx-trend-only', name: 'ADX 强趋势开关', summary: 'ADX 高于阈值才允许趋势策略运行，避免震荡里频繁止损。', direction: '双向', method: '趋势跟踪', kind: '纯技术', session: '全天候', horizon: '日内短线', style: '防守', riskScore: 28, preferredState: '趋势', tags: ['ADX', '策略开关', '防守'] },
  { id: 'xau-macd-zero-cross', name: 'MACD 零轴切换', summary: 'MACD 在零轴附近完成方向切换时入场，适合节奏转换。', direction: '双向', method: '趋势跟踪', kind: '纯技术', session: '欧盘策略', horizon: '日内短线', style: '中风险', riskScore: 50, preferredState: '趋势', tags: ['MACD', '零轴', '节奏切换'] },
  { id: 'xau-fractal-break', name: '分形高低点突破', summary: '突破最近分形高低点后顺势，止损放在前一分形结构外。', direction: '双向', method: '突破', kind: '纯技术', session: '全天候', horizon: '日内短线', style: '中风险', riskScore: 54, preferredState: '趋势', tags: ['分形', '结构突破', '止损明确'] },
  { id: 'xau-supertrend', name: 'SuperTrend 跟随', summary: '以 SuperTrend 翻转为信号，适合趋势稳定阶段持有。', direction: '双向', method: '趋势跟踪', kind: '纯技术', session: '全天候', horizon: '中期波段', style: '稳健', riskScore: 44, preferredState: '趋势', tags: ['SuperTrend', '跟随', '波段'] },
  { id: 'xau-ichimoku-cloud', name: '一目均衡云层过滤', summary: '价格站上/跌破云层后只做同向，云层内暂停开仓。', direction: '双向', method: '趋势跟踪', kind: '纯技术', session: '全天候', horizon: '长期趋势', style: '稳健', riskScore: 35, preferredState: '趋势', tags: ['一目均衡', '云层', '长周期'] },
  { id: 'xau-news-cpi', name: 'CPI 数据窗口策略', summary: 'CPI 公布前降低仓位，公布后等待第一轮波动消化再跟随。', direction: '双向', method: '事件驱动', kind: '重大数据型', session: '美盘策略', horizon: '日内短线', style: '激进', riskScore: 74, preferredState: '数据窗口', tags: ['CPI', '美盘', '事件过滤'] },
  { id: 'xau-news-nfp', name: '非农波动捕捉', summary: '非农公布后用二次突破确认方向，控制最大滑点和持仓时间。', direction: '双向', method: '事件驱动', kind: '重大数据型', session: '美盘策略', horizon: '日内高频', style: '激进', riskScore: 82, preferredState: '数据窗口', tags: ['非农', '二次突破', '高波动'] },
  { id: 'xau-fomc-risk-switch', name: 'FOMC 风险开关', summary: '议息夜只允许轻仓策略，声明后按美元与黄金方向联动开关。', direction: '双向', method: '事件驱动', kind: '事件型', session: '美盘策略', horizon: '日内短线', style: '防守', riskScore: 30, preferredState: '数据窗口', tags: ['FOMC', '降风险', '事件开关'] },
  { id: 'xau-fed-speech-filter', name: '美联储讲话过滤', summary: '讲话窗口减少均值回归，倾向等待方向确认后开趋势策略。', direction: '双向', method: '事件驱动', kind: '事件型', session: '美盘策略', horizon: '日内短线', style: '防守', riskScore: 34, preferredState: '数据窗口', tags: ['美联储', '讲话', '风控过滤'] },
  { id: 'xau-dollar-yield-confirm', name: '美元美债确认策略', summary: '黄金方向需美元指数与美债收益率至少一个信号确认。', direction: '双向', method: '套利过滤', kind: '事件型', session: '全天候', horizon: '日内短线', style: '稳健', riskScore: 37, preferredState: '趋势', tags: ['DXY过滤', '美债过滤', '确认'] },
  { id: 'xau-safe-haven-spike', name: '避险突发脉冲', summary: '突发新闻造成避险脉冲时小仓跟随，波动衰减即退出。', direction: '纯多头', method: '事件驱动', kind: '事件型', session: '全天候', horizon: '日内高频', style: '激进', riskScore: 78, preferredState: '高波动', tags: ['避险', '快讯', '脉冲'] },
  { id: 'xau-long-only-dip', name: '多头回撤买入', summary: '只在日线多头结构中做回撤买入，跌破结构即暂停。', direction: '纯多头', method: '趋势跟踪', kind: '纯技术', session: '全天候', horizon: '中期波段', style: '稳健', riskScore: 41, preferredState: '趋势', tags: ['纯多', '回撤买入', '日线'] },
  { id: 'xau-short-only-rally', name: '空头反抽做空', summary: '只在主趋势为空时做反抽空单，适合美元强势阶段。', direction: '纯空头', method: '趋势跟踪', kind: '纯技术', session: '欧盘策略', horizon: '日内短线', style: '中风险', riskScore: 56, preferredState: '趋势', tags: ['纯空', '反抽', '美元强势'] },
  { id: 'xau-grid-balanced', name: '黄金平衡网格', summary: '围绕日内中轴布置低密度网格，单层仓位受限。', direction: '双向', method: '网格', kind: '纯技术', session: '亚盘策略', horizon: '日内短线', style: '稳健', riskScore: 43, preferredState: '震荡', tags: ['网格', '低密度', '震荡'] },
  { id: 'xau-grid-volatility', name: '波动自适应网格', summary: '按 ATR 自动调节网格间距，高波动拉宽、低波动收窄。', direction: '双向', method: '网格', kind: '纯技术', session: '全天候', horizon: '日内短线', style: '中风险', riskScore: 60, preferredState: '震荡', tags: ['自适应', 'ATR网格', '仓位上限'] },
  { id: 'xau-martingale-lite', name: '轻量马丁回撤', summary: '仅允许两次递增加仓，触及最大浮亏立即停止补仓。', direction: '单向', method: '马丁', kind: '纯技术', session: '亚盘策略', horizon: '日内短线', style: '激进', riskScore: 76, preferredState: '震荡', tags: ['马丁', '两级加仓', '风控硬限'] },
  { id: 'xau-martingale-news-ban', name: '禁新闻马丁', summary: '重大数据前后自动关闭马丁逻辑，只保留普通止损。', direction: '单向', method: '马丁', kind: '事件型', session: '全天候', horizon: '日内短线', style: '防守', riskScore: 48, preferredState: '震荡', tags: ['马丁过滤', '数据禁开', '防守'] },
  { id: 'xau-scalp-orderflow', name: '盘口节奏剥头皮', summary: '用短周期 K 线实体与影线判断短暂失衡，快速止盈。', direction: '双向', method: '剥头皮', kind: '纯技术', session: '美盘策略', horizon: '日内高频', style: '激进', riskScore: 80, preferredState: '高波动', tags: ['盘口节奏', '快进快出', '美盘'] },
  { id: 'xau-scalp-ema-ribbon', name: 'EMA Ribbon 高频跟随', summary: '多条 EMA 顺序排列时顺势短打，排列混乱立即停手。', direction: '双向', method: '剥头皮', kind: '纯技术', session: '欧盘策略', horizon: '日内高频', style: '中风险', riskScore: 64, preferredState: '趋势', tags: ['EMA Ribbon', '高频', '顺势'] },
  { id: 'xau-gap-open-repair', name: '开盘跳空修复', summary: '周一或节后开盘出现跳空时，按缺口强弱决定回补或延续。', direction: '双向', method: '事件驱动', kind: '事件型', session: '亚盘策略', horizon: '日内短线', style: '中风险', riskScore: 61, preferredState: '高波动', tags: ['跳空', '周一', '缺口'] },
  { id: 'xau-daily-pivot', name: '日内枢轴反应', summary: '围绕前日高低收与 Pivot 点观察突破/反转反应。', direction: '双向', method: '均值回归', kind: '纯技术', session: '全天候', horizon: '日内短线', style: '稳健', riskScore: 39, preferredState: '震荡', tags: ['Pivot', '前高低', '反应位'] },
  { id: 'xau-weekly-level', name: '周线关键位波段', summary: '只在周线关键支撑压力附近寻找波段机会，交易频率低。', direction: '双向', method: '趋势跟踪', kind: '纯技术', session: '全天候', horizon: '长期趋势', style: '稳健', riskScore: 33, preferredState: '趋势', tags: ['周线', '关键位', '低频'] },
  { id: 'xau-break-retest', name: '突破回踩确认', summary: '突破后不追第一段，等待回踩确认结构再入场。', direction: '双向', method: '突破', kind: '纯技术', session: '欧盘策略', horizon: '日内短线', style: '稳健', riskScore: 45, preferredState: '趋势', tags: ['突破回踩', '确认', '低追单'] },
  { id: 'xau-false-break-fade', name: '假突破反打', summary: '关键位假突破后反向进场，适合流动性扫损后的修复。', direction: '双向', method: '均值回归', kind: '纯技术', session: '美盘策略', horizon: '日内高频', style: '中风险', riskScore: 66, preferredState: '震荡', tags: ['假突破', '扫损', '反打'] },
  { id: 'xau-vol-stop-trail', name: '波动追踪止盈', summary: '不单独入场，作为趋势策略的移动止盈和减仓模块。', direction: '双向', method: '波动率', kind: '纯技术', session: '全天候', horizon: '中期波段', style: '防守', riskScore: 25, preferredState: '趋势', tags: ['移动止盈', '减仓', '风控模块'] },
  { id: 'xau-variance-break', name: '方差扩张突破', summary: '短周期方差显著放大时只跟随第一段强方向。', direction: '双向', method: '波动率', kind: '纯技术', session: '美盘策略', horizon: '日内高频', style: '激进', riskScore: 73, preferredState: '高波动', tags: ['方差', '强方向', '高波动'] },
  { id: 'xau-carry-neutral', name: '隔夜风险中性', summary: '临近收盘自动减仓或清仓，避免隔夜跳价与点差扩大。', direction: '双向', method: '套利过滤', kind: '事件型', session: '美盘策略', horizon: '日内短线', style: '防守', riskScore: 24, preferredState: '低波动', tags: ['隔夜', '点差', '清仓'] },
  { id: 'xau-high-low-mean', name: '前高前低均值回归', summary: '在前高前低附近等待衰竭形态，目标回到区间中轴。', direction: '双向', method: '均值回归', kind: '纯技术', session: '全天候', horizon: '日内短线', style: '稳健', riskScore: 43, preferredState: '震荡', tags: ['前高前低', '中轴', '衰竭'] },
  { id: 'xau-aggressive-pyramid', name: '强趋势金字塔', summary: '只在高置信趋势中分批加仓，单策略资金上限严格限制。', direction: '双向', method: '趋势跟踪', kind: '纯技术', session: '美盘策略', horizon: '中期波段', style: '暴利', riskScore: 92, preferredState: '趋势', tags: ['金字塔', '强趋势', '高风险'] },
];

const STYLE_BUDGET: Record<GoldStrategyStyle, number> = {
  稳健: 42,
  中风险: 26,
  激进: 17,
  暴利: 5,
  防守: 10,
};

export function getStrategyCapitalPct(strategy: GoldStrategyDefinition): number {
  const sameStyleCount = GOLD_STRATEGY_LIBRARY.filter((item) => item.style === strategy.style).length || 1;
  return Number((STYLE_BUDGET[strategy.style] / sameStyleCount).toFixed(2));
}

export function getStrategyDecision(strategy: GoldStrategyDefinition): '运行' | '观察' | '暂停' {
  if (strategy.riskScore >= 88) return '观察';
  if (strategy.style === '防守' || strategy.style === '稳健') return '运行';
  if (strategy.preferredState === '数据窗口' || strategy.preferredState === '高波动') return '观察';
  return strategy.riskScore <= 66 ? '运行' : '观察';
}
