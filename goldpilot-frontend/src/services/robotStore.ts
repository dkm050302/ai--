export type RobotStatus = 'running' | 'stopped';

export interface TradingRobot {
  id: string;
  name: string;
  strategy: string;
  symbol: string;
  market: string;
  risk: string;
  tags: string[];
  status: RobotStatus;
  equity: number;
  pnl: number;
  winRate: number;
  description: string;
  createdAt: string;
  sourceStrategyId?: string;
  sourceStrategyName?: string;
  sourceSelectionLabel?: string;
  sourcePnlPct?: number;
  sourceMaxDrawdown?: number;
  sourceTrades?: number;
  sourceCopiedAt?: string;
  operationMode?: 'simulation' | 'ai_steward';
}

export const ROBOTS_STORAGE_KEY = 'goldpilot:trading-robots:v1';

export function readStoredRobots(): TradingRobot[] {
  if (typeof window === 'undefined') return [];

  try {
    const raw = window.localStorage.getItem(ROBOTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function writeStoredRobots(robots: TradingRobot[]): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(ROBOTS_STORAGE_KEY, JSON.stringify(robots));
}

export function prependStoredRobot(robot: TradingRobot): TradingRobot[] {
  const nextRobots = [robot, ...readStoredRobots()];
  writeStoredRobots(nextRobots);
  return nextRobots;
}
