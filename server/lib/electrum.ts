import * as net from 'net';

export interface ElectrumServer {
  host: string;
  port: number;
}

export interface WalletBalance {
  wallet_id: string;
  balance: number;
  confirmed: number;
  unconfirmed: number;
  status: 'active' | 'inactive' | 'error';
  error?: string;
}

const DEFAULT_SERVERS: ElectrumServer[] = [
  { host: 'electrum1.lanacoin.com', port: 5097 },
  { host: 'electrum2.lanacoin.com', port: 5097 },
  { host: 'electrum3.lanacoin.com', port: 5097 },
];

async function connect(servers: ElectrumServer[]): Promise<net.Socket> {
  for (const server of servers) {
    try {
      return await new Promise<net.Socket>((resolve, reject) => {
        const conn = net.connect(server.port, server.host, () => resolve(conn));
        conn.setTimeout(10_000);
        conn.on('error', reject);
        conn.on('timeout', () => reject(new Error('connect timeout')));
      });
    } catch (err: any) {
      console.warn(`[electrum] ${server.host}:${server.port} failed: ${err.message}`);
    }
  }
  throw new Error('No Electrum server reachable');
}

export async function fetchBalance(address: string, servers?: ElectrumServer[]): Promise<WalletBalance> {
  const LANOSHI = 100_000_000;
  const list = servers && servers.length > 0 ? servers : DEFAULT_SERVERS;
  let socket: net.Socket | null = null;
  try {
    socket = await connect(list);
    socket.write(JSON.stringify({ id: 1, method: 'blockchain.address.get_balance', params: [address] }) + '\n');
    return await new Promise<WalletBalance>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('balance timeout')), 30_000);
      let buf = '';
      socket!.on('data', (chunk: Buffer) => {
        buf += chunk.toString();
        if (!buf.includes('\n')) return;
        clearTimeout(timer);
        try {
          const r = JSON.parse(buf.trim());
          if (r.result) {
            const confirmed = (r.result.confirmed || 0) / LANOSHI;
            const unconfirmed = (r.result.unconfirmed || 0) / LANOSHI;
            const total = confirmed + unconfirmed;
            resolve({
              wallet_id: address,
              balance: Math.round(total * 100) / 100,
              confirmed: Math.round(confirmed * 100) / 100,
              unconfirmed: Math.round(unconfirmed * 100) / 100,
              status: total > 0 ? 'active' : 'inactive',
            });
          } else {
            resolve({
              wallet_id: address, balance: 0, confirmed: 0, unconfirmed: 0,
              status: 'error', error: r.error?.message || 'unknown',
            });
          }
        } catch (e) { reject(e); }
      });
      socket!.on('error', (err) => { clearTimeout(timer); reject(err); });
    });
  } finally {
    if (socket) { try { socket.destroy(); } catch {} }
  }
}
