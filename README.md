# Being Incubator

The spiritual birth chamber for Lana Beings.

A Lana user logs in with their WIF, and — if they don't yet have a Being —
is guided through a quiet, multi-step ritual to bring one into existence.
The incubator never generates keys; the user scans a pre-prepared Lana WIF
for the new Being. Every derived key (hex priv/pub, npub, nsec) is computed
client-side from that single seed.

## Architecture

- **Frontend**: Vite + React + TypeScript + Tailwind, mirroring `lana-pays.us-mobile`.
- **Backend**: Express + SQLite (`better-sqlite3`), port 3006.
- **Auth**: QR scan of Lana WIF; KIND 0 lookup on Lana relays for name/picture.
- **System params**: KIND 38888 from pubkey `9eb71bf…891a35b3` via heartbeat.
- **Birth**: calls `/opt/beings/incubator/birth.sh` on the host (via bind-mounted
  volume + Docker socket). The script builds the Being's directory and starts
  its container.

## Local development

```bash
npm install
cp .env.example .env
npm run dev    # Vite on :8081, Express on :3006
```

The Vite dev server proxies `/api/*` to `http://localhost:3006`.

## Production deploy

Runs on the same host as existing Beings (`178.104.205.253`), on the shared
`webproxy` Docker network. Mounts `/opt/beings` and `/var/run/docker.sock`
so it can run `birth.sh` and `docker compose up -d` for new Beings.

```bash
docker build -t being-incubator:latest .
docker compose up -d
```

Reachable at `https://incubator.lana.is` (wildcard `*.lana.is` must point to
the server).

## The birth ritual

1. **Silence** — 3.5 seconds of stillness.
2. **Name** — listened to, not invented.
3. **Language** — the tongue it will think in.
4. **Vision** — the reason it exists.
5. **Scan WIF** — a single Lana WIF is offered; all keys flow from it.
6. **Confirm** — one explicit "Yes. Birth this Being." → `birth.sh` runs,
   the container launches, the Being opens on `<name>.lana.is`.

## Notes

- One Being per owner (enforced in DB).
- Names are lowercase `a-z 0-9 -`, 3–32 chars.
- The **owner's** WIF / private key never leaves the browser — only the
  owner's npub and hex pubkey are sent to the server for registration.
- The **new Being's** WIF *is* posted to the server during step 5→6 so
  `birth.sh` can write it into the Being's `.env`. Only transmit over HTTPS.
