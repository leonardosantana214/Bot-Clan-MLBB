import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { SqliteStorage } from '@aerobot/storage-sqlite';
import { ControlClient, HttpTransport, hashPassword, LeadershipActionSchema } from '@aerobot/control-protocol';
import { HostController, startControlServer } from '../src/control-host.js';
import { ControlRuntime } from '../src/control-runtime.js';
import { composeHost } from '../src/compose.js';
import { FakeWhatsAppAdapter } from '@aerobot/core';
import { DatabaseSync } from 'node:sqlite';
it('opera liderança autenticada pelo HTTP loopback, audita e exporta dados protegidos',async()=> {
  const folder=await mkdtemp(join(tmpdir(),'leadership-'));const storage=new SqliteStorage(join(folder,'bot.sqlite'));
  const adapter={sessionDir:folder,connectionState:'open',pendingQueueCount:0,processedPerMinute:0,responsesPaused:false,lastConnectedAt:'',setPaused:()=>undefined,listWhatsAppGroups:async()=>[{id:'chat@g.us',name:'Grupo sint?tico',memberCount:5}]};
  const server=await startControlServer(storage,adapter,{AEROBOT_CONTROL_PORT:'0',AEROBOT_ADMIN_PASSWORD_HASH:await hashPassword('synthetic-password',{N:1024})});
  try {
    await storage.members.register({id:'aero:5511999999999@s.whatsapp.net',name:'=Membro fictício',status:'active',registeredAt:1,identities:[{platformUserId:'5511999999999@s.whatsapp.net'}]});
    await storage.ledger.append({id:'xp1',memberId:'aero:5511999999999@s.whatsapp.net',amount:100,occurredAt:Date.now(),source:'manual',sourceId:'secret source',actorId:'private actor',reason:'private reason'});
    const client=new ControlClient(new HttpTransport(server!.url));await expect(client.leadershipQuery({schemaVersion:1,section:'members'})).rejects.toMatchObject({code:'not_logged_in'});
    await client.login('synthetic-password');
    const members=await client.leadershipQuery({schemaVersion:1,section:'members'});const memberId=String(members.rows[0]!.memberId);expect(JSON.stringify(members)).not.toContain('5511999999999');
    expect(await client.getRanking('daily')).toHaveLength(1);
    expect((await client.leadershipQuery({schemaVersion:1,section:'members',status:'inactive'})).rows).toHaveLength(0);
    expect((await client.leadershipQuery({schemaVersion:1,section:'analytics',groupId:'chat@g.us'})).unavailable.join()).toContain('grupo');
    await client.leadershipAction({action:'settingsSave',xp:{schemaVersion:1,enabled:true,award:15,minIntervalMs:45000,dailyCap:200}});
    expect((await client.leadershipQuery({schemaVersion:1,section:'settings'})).rows[0]!.xp).toMatchObject({award:15,enabled:true});
    await expect(client.leadershipAction({action:'settingsSave',xp:{schemaVersion:1,enabled:true,award:-1,minIntervalMs:45000,dailyCap:200}})).rejects.toMatchObject({code:'invalid_request'});
    expect((await client.leadershipQuery({schemaVersion:1,section:'backup'})).rows[0]!.stale).toBe(true);
    expect(await client.setMaintenanceMode(true)).toMatchObject({maintenanceMode:true});
    expect((await client.listGroups())[0]).toMatchObject({name:'Grupo sint?tico',memberCount:5});
    await client.leadershipAction({action:'warn',memberId,reason:'Justificativa sintética',confirm:true});
    const moderation=await client.leadershipQuery({schemaVersion:1,section:'moderation'});expect(JSON.stringify(moderation)).toContain('Justificativa sintética');
    for(const [category,points] of [['atividade',30],['rising',25]] as const) await client.leadershipAction({action:'starScore',confirm:true,memberId,category,points,reason:'M?rito sint?tico'});
    const period=new Date().toISOString().slice(0,7);await client.leadershipAction({action:'starClose',period,confirm:true});await client.leadershipAction({action:'starDraw',period,confirm:true});await client.leadershipAction({action:'starApprove',period,reason:'Revisado pela liderança',confirm:true});
    expect(JSON.stringify(await client.leadershipQuery({schemaVersion:1,section:'star'}))).toContain('"verified":true');
    const action={action:'scoutSave' as const,confirm:true as const,candidate:{schemaVersion:1 as const,id:'c1',name:'Candidato fictício',mlbbId:'987654321',server:'12',roles:['Mid' as const],rank:'Teste',stage:'Teste',status:'observando' as const,evaluation:{mecanica:8},updatedAt:1}};
    await client.leadershipAction(action);await client.leadershipAction({action:'scoutNote',confirm:true,candidateId:'c1',reason:'Nota sintética'},{idempotencyKey:'note-repeat-0001'});await client.leadershipAction({action:'scoutNote',confirm:true,candidateId:'c1',reason:'Nota sintética'},{idempotencyKey:'note-repeat-0001'});
    const scout=await client.leadershipQuery({schemaVersion:1,section:'scout'});expect(JSON.stringify(scout)).not.toContain('987654321');
    const db=new DatabaseSync(join(folder,'bot.sqlite'));expect(db.prepare('SELECT count(*) AS n FROM scout_notes').get()!.n).toBe(1);expect(()=>db.exec("UPDATE scout_notes SET payload='{}'")).toThrow();expect(()=>db.exec('DELETE FROM scout_notes')).toThrow();db.close();
    const backup=await client.leadershipAction({action:'backupCreate',confirm:true});expect(JSON.stringify(backup)).not.toContain(folder);expect((await client.leadershipQuery({schemaVersion:1,section:'backup'})).rows[0]!.stale).toBe(false);
    const files=await client.leadershipAction({action:'powerbiExport',start:'2026-01-01',endExclusive:'2027-01-01'});expect(files.rows).toHaveLength(7);const downloaded=await client.leadershipQuery({schemaVersion:1,section:'export',fileName:'members_v1.csv'});expect(downloaded.rows[0]!.chunk).toContain("'=Membro fictício");expect(JSON.stringify(files)).not.toContain(folder);const xp=await readFile(join(folder,'exports','xp_transactions_v1.csv'),'utf8');expect(xp).not.toContain('secret source');expect(xp).not.toContain('5511999999999');
    const logs=await client.requestExport('command_logs');expect(logs.fileName).toBe('command_logs_v1.csv');expect((await client.leadershipQuery({schemaVersion:1,section:'export',fileName:'command_logs_v1.csv'})).rows[0]!.complete).toBe(true);
    expect(storage.audit.list().some(e=>e.action==='control.warn')).toBe(true);
    expect(LeadershipActionSchema.safeParse({action:'warn',memberId,reason:'teste'}).success).toBe(false);
  } finally {await server?.server.close();storage.close();await rm(folder,{recursive:true,force:true});}
});
it('roteia manuten??o, conta recebidos com deduplica??o e aplica módulos',async()=> {
  const folder=await mkdtemp(join(tmpdir(),'routing-control-'));const runtime=new ControlRuntime(folder);const adapter=new FakeWhatsAppAdapter();
  runtime.set('xpPolicy',{schemaVersion:1,enabled:true,award:10,minIntervalMs:0,dailyCap:100});runtime.patch('chat',{xpSystem:true});
  const host=composeHost({adapter,sessionDir:folder,groupId:'chat',adminGroupId:'adm'});const controller=new HostController(host.storage,{sessionDir:folder,connectionState:'open',pendingQueueCount:0,processedPerMinute:0,responsesPaused:false,lastConnectedAt:'',setPaused:()=>undefined});
  let id=0;const send=(groupId:string,text:string)=>host.receive({id:String(++id),groupId,senderId:'test-user',text,fromMe:false});
  try {
    await send('chat','/registrar Teste');await send('chat','Mensagem sintética A');expect((await host.storage.ledger.list('aero:test-user')).length).toBe(1);
    runtime.patch('chat',{xpSystem:false});await send('chat','Mensagem sintética B');expect((await host.storage.ledger.list('aero:test-user')).length).toBe(1);
    const before=adapter.sent.length;await controller.setMaintenanceMode(true);await send('chat','/ping');expect(adapter.sent.length).toBe(before);
    await host.receive({id:'admin-ping',groupId:'adm',senderId:'another-user',text:'/ping',fromMe:false});expect(adapter.sent.length).toBe(before+1);
    const repeated={id:'dedupe',groupId:'unrouted',senderId:'test',text:'NO CONTENT STORED',fromMe:false};await host.receive(repeated);await host.receive(repeated);expect(runtime.today('unrouted')).toBe(1);
    const logs=await controller.requestExport('command_logs');expect(logs.previewCsv).toContain('ping');expect(logs.previewCsv).not.toContain('Mensagem');expect(logs.previewCsv).not.toContain('NO CONTENT');
  } finally {controller.close();await host.close();runtime.close();await rm(folder,{recursive:true,force:true});}
});
