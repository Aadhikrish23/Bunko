import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { getBasicStatisticsHandler } from './statistics.controller';

export const statisticsRouter = Router();

statisticsRouter.get('/', authMiddleware, getBasicStatisticsHandler);
