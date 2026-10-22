import type { NextFunction, Request, Response } from 'express';
import { requireUserId } from '../../lib/require-user';
import { sendOk } from '../../lib/response';
import * as statisticsService from './statistics.service';
import type { StatisticsQuery, TrendsQuery } from './statistics.schema';

export async function getStatisticsHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const query = req.query as unknown as StatisticsQuery;
    sendOk(res, await statisticsService.getStatistics(requireUserId(req), query.tz));
  } catch (err) {
    next(err);
  }
}

export async function getTrendsHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const query = req.query as unknown as TrendsQuery;
    sendOk(res, await statisticsService.getTrends(requireUserId(req), query.range, query.tz));
  } catch (err) {
    next(err);
  }
}
