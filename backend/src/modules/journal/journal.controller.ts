import type { NextFunction, Request, Response } from 'express';
import { requireUserId } from '../../lib/require-user';
import { sendPaginated } from '../../lib/response';
import * as journalService from './journal.service';
import type { ListJournalQuery } from './journal.schema';

export async function listJournalHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const query = req.query as unknown as ListJournalQuery;
    const { items, total } = await journalService.listJournal(requireUserId(req), query);
    sendPaginated(res, items, { page: query.page, pageSize: query.pageSize, total });
  } catch (err) {
    next(err);
  }
}
