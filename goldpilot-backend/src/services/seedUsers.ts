import bcrypt from 'bcryptjs';
import { UserModel } from '../models/User';
import { logger } from '../utils/logger';

const SEED_ACCOUNTS = [
  { accountId: 'admin', password: '1248', role: 'admin' as const },
  { accountId: '01', password: '123', role: 'tester' as const },
  { accountId: '02', password: '123', role: 'tester' as const },
  { accountId: '03', password: '123', role: 'tester' as const },
];

const SYSTEM_SERVER = 'system';

export async function seedAccounts(): Promise<void> {
  try {
    for (const account of SEED_ACCOUNTS) {
      const existing = await UserModel.findByAccountId(account.accountId, SYSTEM_SERVER);
      if (!existing) {
        const hashed = await bcrypt.hash(account.password, 10);
        await UserModel.create({
          accountId: account.accountId,
          password: hashed,
          server: SYSTEM_SERVER,
          role: account.role,
          accountInfo: { balance: 0, equity: 0, margin: 0, freeMargin: 0, positions: [], dailyPnl: 0 },
        });
        logger.info(`Seeded account: ${account.accountId} (${account.role})`);
      }
    }
  } catch (error) {
    logger.error('Failed to seed accounts:', error);
  }
}
