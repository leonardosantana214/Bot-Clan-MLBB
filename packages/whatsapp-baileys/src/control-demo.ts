import { SqliteScout } from '@aerobot/scout';
import { StarMember, SqliteStarRepository } from '@aerobot/star-member';
import { SqliteCommunityStore } from '@aerobot/community';
import { ControlRuntime } from './control-runtime.js';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { FakeWhatsAppAdapter } from '@aerobot/core';
import { SqliteStorage } from '@aerobot/storage-sqlite';
import { hashPassword } from '@aerobot/control-protocol';
import { startControlServer } from './control-host.js';

if (!process.stdout.isTTY) throw new Error('A demonstração exige terminal local interativo para exibir a senha.');
const folder = await mkdtemp(join(tmpdir(), 'aerobot-control-demo-'));
const storage = new SqliteStorage(join(folder, 'demo.sqlite'));
class DemoAdapter extends FakeWhatsAppAdapter {
  readonly sessionDir = folder;
  private started = 0;
  private ended = false;
  get connectionState() { return this.started && Date.now() - this.started >= 15_000 ? 'open' : 'disconnected'; }
  get connectionSnapshot(): import('@aerobot/control-protocol').WhatsAppConnection {
    if (this.ended) return { state: 'sessao_encerrada', demonstration: true };
    if (!this.started) return { state: 'desconectado', demonstration: true };
    if (this.connectionState === 'open') return { state: 'conectado', botName: 'Bot DEMONSTRAÇÃO', demonstration: true };
    return { state: 'aguardando_qr', qr: `DEMONSTRAÇÃO NÃO ESCANEÁVEL ${Math.floor(Date.now() / 5000)}`, expiresAt: (Math.floor(Date.now() / 5000) + 1) * 5000, demonstration: true };
  }
  async startPairing() { this.started = Date.now(); this.ended = false; }
  async logoutSession() { this.started = 0; this.ended = true; }
  async listWhatsAppGroups() { return this.connectionState === 'open' ? [{ id: 'demo-chat@g.us', name: 'CHAT DEMONSTRAÇÃO', memberCount: 5 }, { id: 'demo-adm@g.us', name: 'ADM DEMONSTRAÇÃO', memberCount: 2 }] : []; }
  readonly pendingQueueCount = 0;
  readonly processedPerMinute = 0;
  readonly lastConnectedAt = new Date().toISOString();
  responsesPaused = false;
  setPaused(value: boolean) { this.responsesPaused = value; }
  override async sendMessage(group: string, text: string) { if (this.responsesPaused) throw new Error('Respostas pausadas.'); await super.sendMessage(group, text); }
}
let control: Awaited<ReturnType<typeof startControlServer>>;
let stopping = false;
async function shutdown() {
  if (stopping) return; stopping = true;
  try { await control?.server.close(); } finally { storage.close(); await rm(folder, { recursive: true, force: true }); }
}
try {
  for (let i = 1; i <= 5; i++) {
    const id = `demo-${i}`;
    await storage.members.register({ id, name: `Membro fictício ${i}`, status: 'active', registeredAt: Date.now(), identities: [] });
    await storage.ledger.append({ id, memberId: id, amount: i * 150, occurredAt: Date.now(), source: 'manual', sourceId: id, actorId: 'demo', reason: 'XP sintético de demonstração' });
  }
  const runtime=new ControlRuntime(folder);
  runtime.set('activeRoles',{adminGroupId:'demo-adm@g.us'});
  runtime.set('modules:demo-chat@g.us',{welcome:true,xpSystem:true,mlbbCommands:true,antiSpam:true,scrimAlerts:false});
  await (await import('node:fs/promises')).writeFile(join(folder,'group-roles.json'),JSON.stringify({chatGroupId:'demo-chat@g.us',adminGroupId:'demo-adm@g.us'}));
  for(let day=0;day<30;day++) {
    const at=Date.now()-day*86400000;
    runtime.count({id:`synthetic-${day}`,groupId:'demo-chat@g.us',senderId:'synthetic',text:'',fromMe:false},at);
    if(day) await storage.ledger.append({id:`demo-history-${day}`,memberId:`demo-${day%5+1}`,amount:10+day,occurredAt:at,source:'manual',sourceId:`synthetic-${day}`,actorId:'demo',reason:'Demonstração sintética'});
  }
  runtime.command('ping','demo-chat@g.us',Date.now(),'success'); runtime.close();
  const dbPath=join(folder,'demo.sqlite');
  const scout=new SqliteScout(dbPath);scout.save({schemaVersion:1,id:'scout-demo',name:'Candidato DEMONSTRAÇÃO',mlbbId:'123456789',server:'1234',roles:['Mid'],rank:'Mítico (fictício)',stage:'Avaliação',status:'observando',evaluation:{comunicacao:8,mecanica:7},updatedAt:Date.now()});scout.appendNote({schemaVersion:1,id:'note-demo',candidateId:'scout-demo',text:'Avaliação sintética fornecida pela liderança fictícia.',author:'ADM DEMONSTRAÇÃO',at:Date.now()});scout.close();
  const community=new SqliteCommunityStore(dbPath);await community.appendWarning({id:'warning-demo',memberId:'demo-1',reason:'Advertência sintética de demonstração',authorId:'demo',authorName:'ADM fictício',at:Date.now()});community.close();
  const starStore=new SqliteStarRepository(dbPath);const star=new StarMember({repository:starStore,members:storage.members,clock:{now:Date.now}});for(const [category,points] of [['atividade',30],['rising',25]] as const) await star.score({memberId:'demo-1',category,points,reason:'Demonstração sintética'},'ADM DEMONSTRAÇÃO');starStore.close();
  const password = randomBytes(18).toString('base64url');
  control = await startControlServer(storage, new DemoAdapter(), { ...process.env, AEROBOT_CONTROL_DEMO:'1', AEROBOT_CONTROL_PORT: process.env.AEROBOT_CONTROL_PORT ?? '8787', AEROBOT_ADMIN_PASSWORD_HASH: await hashPassword(password) });
  process.stdout.write(`DEMONSTRAÇÃO: dados sintéticos, sem WhatsApp.\nHost: ${control!.url}\nSenha desta execução (somente terminal local): ${password}\n`);
  process.once('SIGINT', () => { void shutdown(); });
  process.once('SIGTERM', () => { void shutdown(); });
} catch (error) { await shutdown(); throw error; }
