import elliptic from 'elliptic';
import CryptoJS from 'crypto-js';
import { bech32 } from 'bech32';

const ec = new elliptic.ec('secp256k1');

function hexToBytes(hex: string): Uint8Array {
  return new Uint8Array(hex.match(/.{2}/g)!.map(b => parseInt(b, 16)));
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

async function sha256(hex: string): Promise<string> {
  const buf = hexToBytes(hex);
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
  const hash = await crypto.subtle.digest('SHA-256', ab);
  return bytesToHex(new Uint8Array(hash));
}

async function sha256d(data: Uint8Array): Promise<Uint8Array> {
  const ab = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
  const first = await crypto.subtle.digest('SHA-256', ab);
  const second = await crypto.subtle.digest('SHA-256', first);
  return new Uint8Array(second);
}

function ripemd160(data: string): string {
  return CryptoJS.RIPEMD160(CryptoJS.enc.Hex.parse(data)).toString();
}

function base58Encode(bytes: Uint8Array): string {
  const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let num = BigInt('0x' + bytesToHex(bytes));
  let out = '';
  while (num > 0n) {
    const r = num % 58n;
    num = num / 58n;
    out = alphabet[Number(r)] + out;
  }
  for (const b of bytes) {
    if (b !== 0) break;
    out = '1' + out;
  }
  return out;
}

function base58Decode(encoded: string): Uint8Array {
  const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let num = 0n;
  for (const c of encoded) {
    const i = alphabet.indexOf(c);
    if (i === -1) throw new Error('Invalid Base58 character');
    num = num * 58n + BigInt(i);
  }
  let hex = num.toString(16);
  if (hex.length % 2) hex = '0' + hex;
  let bytes = hexToBytes(hex);
  for (const c of encoded) {
    if (c !== '1') break;
    bytes = new Uint8Array([0, ...bytes]);
  }
  return bytes;
}

function normalizeWif(wif: string): string {
  return wif.replace(/[\s\u200B-\u200D\uFEFF\r\n\t]/g, '').trim();
}

async function wifToPrivateKey(wif: string): Promise<{ privateKeyHex: string; isCompressed: boolean }> {
  const normalized = normalizeWif(wif);
  const decoded = base58Decode(normalized);
  const payload = decoded.slice(0, -4);
  const checksum = decoded.slice(-4);
  const hash = await sha256d(payload);
  const expected = hash.slice(0, 4);
  for (let i = 0; i < 4; i++) {
    if (checksum[i] !== expected[i]) throw new Error('Invalid WIF checksum');
  }
  if (payload[0] !== 0xb0 && payload[0] !== 0x41) {
    throw new Error('Invalid WIF prefix (not a Lana WIF)');
  }
  const isCompressed = payload.length === 34 && payload[33] === 0x01;
  const privateKey = payload.slice(1, 33);
  return { privateKeyHex: bytesToHex(privateKey), isCompressed };
}

export function generateUncompressedPublicKey(privateKeyHex: string): string {
  const pair = ec.keyFromPrivate(privateKeyHex);
  const p = pair.getPublic();
  return '04' + p.getX().toString(16).padStart(64, '0') + p.getY().toString(16).padStart(64, '0');
}

export function generateCompressedPublicKey(privateKeyHex: string): string {
  const pair = ec.keyFromPrivate(privateKeyHex);
  const p = pair.getPublic();
  const prefix = p.getY().isEven() ? '02' : '03';
  return prefix + p.getX().toString(16).padStart(64, '0');
}

export function deriveNostrPublicKey(privateKeyHex: string): string {
  const pair = ec.keyFromPrivate(privateKeyHex);
  return pair.getPublic().getX().toString(16).padStart(64, '0');
}

export async function generateLanaAddress(publicKeyHex: string): Promise<string> {
  const sh = await sha256(publicKeyHex);
  const h160 = ripemd160(sh);
  const versioned = '30' + h160;
  const ck = await sha256(await sha256(versioned));
  return base58Encode(hexToBytes(versioned + ck.substring(0, 8)));
}

export function hexToNpub(hexPubKey: string): string {
  return bech32.encode('npub', bech32.toWords(hexToBytes(hexPubKey)));
}

export function hexToNsec(hexPrivKey: string): string {
  return bech32.encode('nsec', bech32.toWords(hexToBytes(hexPrivKey)));
}

export interface LanaIds {
  walletId: string;
  walletIdCompressed: string;
  walletIdUncompressed: string;
  isCompressed: boolean;
  nostrHexId: string;         // x-only pubkey (NOSTR)
  nostrNpubId: string;        // bech32 npub
  privateKeyHex: string;      // raw 32-byte privkey
  nsec: string;               // bech32 nsec
}

export async function convertWifToIds(wif: string): Promise<LanaIds> {
  const { privateKeyHex, isCompressed } = await wifToPrivateKey(wif);
  const uncompressed = generateUncompressedPublicKey(privateKeyHex);
  const compressed = generateCompressedPublicKey(privateKeyHex);
  const nostrHexId = deriveNostrPublicKey(privateKeyHex);
  const walletIdCompressed = await generateLanaAddress(compressed);
  const walletIdUncompressed = await generateLanaAddress(uncompressed);
  return {
    walletId: isCompressed ? walletIdCompressed : walletIdUncompressed,
    walletIdCompressed,
    walletIdUncompressed,
    isCompressed,
    nostrHexId,
    nostrNpubId: hexToNpub(nostrHexId),
    privateKeyHex,
    nsec: hexToNsec(privateKeyHex),
  };
}
