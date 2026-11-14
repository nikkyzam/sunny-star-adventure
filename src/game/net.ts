/**
 * net.ts — online play through room codes (WebRTC via PeerJS; no accounts, no server of our own).
 *
 * Topology is a star: the kid who makes the room is the host and relays every message to the
 * other kids. Each kid simulates their own world; only positions, stickers, star pickups and
 * level changes travel over the wire. Every incoming message is untrusted and validated by the
 * receiver (boot.ts) — names/outfits/stickers are indices, never free text.
 */

import Peer, { type DataConnection } from "peerjs";

const PREFIX = "sunny-star-kids-v1-";
const WORDS = ["FROG", "BEAR", "DUCK", "STAR", "MOON", "CAKE", "FISH", "LION", "BUNNY", "PANDA", "OTTER", "TIGER"];
const JOIN_TIMEOUT_MS = 12000;
export const MAX_KIDS = 6;

export interface NetMsg {
  t: string;
  id?: string;
  [k: string]: unknown;
}

function makeCode(): string {
  const w = WORDS[Math.floor(Math.random() * WORDS.length)];
  return w + String(10 + Math.floor(Math.random() * 90));
}

export function normalizeCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
}

export class Net {
  onMessage: (m: NetMsg) => void = () => {};
  onPeerJoined: (id: string) => void = () => {};
  onPeerLeft: (id: string) => void = () => {};
  onHostLost: () => void = () => {};

  private conns: DataConnection[] = [];
  private disposed = false;

  private constructor(private peer: Peer, readonly code: string, readonly isHost: boolean) {
    peer.on("disconnected", () => { if (!this.disposed) peer.reconnect(); });
  }

  get id(): string {
    return this.peer.id;
  }

  get kidCount(): number {
    return this.conns.length + 1;
  }

  /** Make a room. Retries a few codes in case one is already taken. */
  static host(): Promise<Net> {
    const attempt = (tries: number): Promise<Net> =>
      new Promise<Net>((resolve, reject) => {
        const code = makeCode();
        const peer = new Peer(PREFIX + code);
        peer.once("open", () => {
          const net = new Net(peer, code, true);
          peer.on("connection", (conn) => net.accept(conn));
          resolve(net);
        });
        peer.once("error", (err: { type?: string }) => {
          peer.destroy();
          if (err.type === "unavailable-id" && tries > 0) attempt(tries - 1).then(resolve, reject);
          else reject(new Error("Couldn't make a room — check the internet connection."));
        });
      });
    return attempt(4);
  }

  /** Join a friend's room by code. Resolves once the host's link is open. */
  static join(rawCode: string): Promise<Net> {
    const code = normalizeCode(rawCode);
    return new Promise<Net>((resolve, reject) => {
      if (code.length < 3) {
        reject(new Error("That code looks too short."));
        return;
      }
      const peer = new Peer();
      let settled = false;
      const fail = (msg: string) => {
        if (settled) return;
        settled = true;
        peer.destroy();
        reject(new Error(msg));
      };
      const timer = window.setTimeout(() => fail("Couldn't find that room. Check the code!"), JOIN_TIMEOUT_MS);
      peer.once("error", (err: { type?: string }) => {
        clearTimeout(timer);
        fail(err.type === "peer-unavailable" ? "Couldn't find that room. Check the code!" : "Couldn't connect — check the internet connection.");
      });
      peer.once("open", () => {
        const conn = peer.connect(PREFIX + code, { reliable: true });
        conn.once("open", () => {
          clearTimeout(timer);
          if (settled) return;
          settled = true;
          const net = new Net(peer, code, false);
          net.wire(conn);
          resolve(net);
        });
      });
    });
  }

  /** Broadcast to everyone (the host relays a guest's messages to the other guests). */
  send(m: NetMsg): void {
    m.id = this.id;
    for (const c of this.conns) if (c.open) c.send(m);
  }

  /** Host only: message one guest directly. */
  sendTo(id: string, m: NetMsg): void {
    m.id = this.id;
    const c = this.conns.find((cc) => cc.peer === id);
    if (c?.open) c.send(m);
  }

  dispose(): void {
    this.disposed = true;
    for (const c of this.conns) c.close();
    this.conns = [];
    this.peer.destroy();
  }

  private accept(conn: DataConnection): void {
    if (this.conns.length >= MAX_KIDS - 1) {
      conn.on("open", () => conn.close());
      return;
    }
    conn.on("open", () => {
      this.wire(conn);
      this.onPeerJoined(conn.peer);
    });
  }

  private wire(conn: DataConnection): void {
    this.conns.push(conn);
    conn.on("data", (raw) => {
      if (!raw || typeof raw !== "object" || typeof (raw as NetMsg).t !== "string") return;
      const m = raw as NetMsg;
      // the sender's identity is the link it arrived on (guests) or what the host relayed
      if (this.isHost) {
        m.id = conn.peer;
        for (const c of this.conns) if (c !== conn && c.open) c.send(m);
      }
      this.onMessage(m);
    });
    conn.on("close", () => {
      this.conns = this.conns.filter((c) => c !== conn);
      if (this.disposed) return;
      if (this.isHost) {
        this.onPeerLeft(conn.peer);
        this.send({ t: "bye", who: conn.peer });
      } else {
        this.onHostLost();
      }
    });
  }
}
