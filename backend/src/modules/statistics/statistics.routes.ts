import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { getStatisticsHandler, getTrendsHandler } from './statistics.controller';
import { statisticsQuerySchema, trendsQuerySchema } from './statistics.schema';

export const statisticsRouter = Router();

statisticsRouter.get('/', authMiddleware, validate(statisticsQuerySchema, 'query'), getStatisticsHandler);

statisticsRouter.get('/trends', authMiddleware, validate(trendsQuerySchema, 'query'), getTrendsHandler);
