import 'dotenv/config';
import express from 'express';
import path from 'path';
import fs from 'fs';
import { statements } from './db';
import { startHeartbeat } from './heartbeat';
import { startEmbryoWatcher } from './lib/gestation';
import { profileLookupRouter } from './routes/profile-lookup';
import { usersRouter } from './routes/users';
import { beingsRouter } from './routes/beings';
import { birthRouter } from './routes/birth';
import { systemParamsRouter } from './routes/system-params';
import { walletRouter } from './routes/wallet';

const PORT = parseInt(process.env.SERVER_PORT || '3006', 10);
const DIST_DIR = path.resolve('./dist');

const app = express();
app.use(express.json({ limit: '256kb' }));

app.get('/health', (_req, res) => {
  const beings = (statements.countBeings.get() as { n: number }).n;
  res.json({ ok: true, beings, version: '0.1.0' });
});

app.use('/api', profileLookupRouter);
app.use('/api', usersRouter);
app.use('/api', beingsRouter);
app.use('/api', birthRouter);
app.use('/api', systemParamsRouter);
app.use('/api', walletRouter);

// Serve built client in production
if (fs.existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(DIST_DIR, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`◈ Being Incubator server listening on :${PORT}`);
  startHeartbeat();
  startEmbryoWatcher();
});
