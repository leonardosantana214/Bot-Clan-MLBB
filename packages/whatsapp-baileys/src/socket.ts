/** Deliberately independent of Baileys: fake sockets need no network or auth files. */
export interface WireMessage {
  key: { id?: string | null; remoteJid?: string | null; participant?: string | null; fromMe?: boolean | null };
  message?: { conversation?: string | null; extendedTextMessage?: { text?: string | null } | null; ephemeralMessage?: { message?: WireMessage['message'] | null } | null } | null;
}
export interface SocketEvents {
  connection: { connection?: string; qr?: string; statusCode?: number; botJid?: string; botName?: string };
  messages: { type: string; messages: readonly WireMessage[] };
  participants: { id: string; action: string; participants: readonly string[] };
}
export interface AdapterSocket {
  on<K extends keyof SocketEvents>(event: K, handler: (value: SocketEvents[K]) => void): () => void;
  sendMessage(groupId: string, text: string): Promise<void>;
  requestPairingCode(phone: string): Promise<string>;
  logout?(): Promise<void>;
  listGroups?(): Promise<{ id: string; name: string }[]>;
  close(): Promise<void>;
}
export interface SocketFactory { create(sessionDir: string): Promise<AdapterSocket>; clearSession?(sessionDir: string): Promise<void> }
