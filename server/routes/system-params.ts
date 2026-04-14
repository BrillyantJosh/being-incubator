import { Router } from 'express';
import { statements } from '../db';

export const systemParamsRouter = Router();

systemParamsRouter.get('/system-params', (_req, res) => {
  const row = statements.getKind38888.get() as
    | { event_id: string; version: string; relays_json: string; updated_at: number }
    | undefined;
  if (!row) return res.json(null);
  let relays: string[] = [];
  try { relays = JSON.parse(row.relays_json); } catch {}
  res.json({
    event_id: row.event_id,
    version: row.version,
    relays,
    updated_at: row.updated_at,
  });
});
