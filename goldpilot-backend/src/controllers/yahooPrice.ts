import type { Request, Response } from 'express';
import { yahooPriceService } from '../services/yahooPriceService';
import { logger } from '../utils';

export async function getYahooPrice(_req: Request, res: Response): Promise<void> {
  try {
    const data = await yahooPriceService.getPrice();
    res.json({ success: true, data });
  } catch (error: any) {
    logger.error('Error fetching Yahoo price:', error.message);
    res.status(500).json({ success: false, error: { code: 'YAHOO_PRICE_ERROR', message: error.message } });
  }
}
