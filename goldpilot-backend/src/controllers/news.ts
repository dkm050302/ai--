import type { Request, Response } from 'express';
import { newsService } from '../services/newsService';
import { logger } from '../utils';

export async function getGoldNews(_req: Request, res: Response): Promise<void> {
  try {
    const data = await newsService.fetchGoldNews();
    res.json({ success: true, data });
  } catch (error: any) {
    logger.error('Error fetching gold news:', error.message);
    res.status(500).json({ success: false, error: { code: 'NEWS_GOLD_ERROR', message: error.message } });
  }
}

export async function getEconNews(_req: Request, res: Response): Promise<void> {
  try {
    const data = await newsService.fetchEconNews();
    res.json({ success: true, data });
  } catch (error: any) {
    logger.error('Error fetching econ news:', error.message);
    res.status(500).json({ success: false, error: { code: 'NEWS_ECON_ERROR', message: error.message } });
  }
}

export async function getFedNews(_req: Request, res: Response): Promise<void> {
  try {
    const data = await newsService.fetchFedNews();
    res.json({ success: true, data });
  } catch (error: any) {
    logger.error('Error fetching fed news:', error.message);
    res.status(500).json({ success: false, error: { code: 'NEWS_FED_ERROR', message: error.message } });
  }
}
