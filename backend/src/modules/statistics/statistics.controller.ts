import type { NextFunction, Request, Response } from 'express';
import { requireUserId } from '../../lib/require-user';
import { sendOk } from '../../lib/response';
import * as statisticsService from './statistics.service';

export async function getBasicStatisticsHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    sendOk(res, await statisticsService.getBasicStatistics(requireUserId(req)));
  } catch (err) {
    next(err);
  }
}
