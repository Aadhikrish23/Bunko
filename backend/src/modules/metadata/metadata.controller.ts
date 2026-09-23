import type { NextFunction, Request, Response } from 'express';
import { sendOk } from '../../lib/response';
import * as metadataService from './metadata.service';
import type { SearchMetadataQuery } from './metadata.schema';

export async function searchMetadataHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { q, lang } = req.query as unknown as SearchMetadataQuery;
    const candidates = await metadataService.searchBookMetadata(q, lang);
    sendOk(res, candidates);
  } catch (err) {
    next(err);
  }
}
