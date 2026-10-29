import { join, basename } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { mkdir, readFile, lstat } from 'node:fs/promises';
import { sanitizeText } from '@aerobot/community';
import { displayName, levelProgress, defaultLevelFormula, type LevelFormula } from '@aerobot/core';
import type { SqliteStorage } from '@aerobot/storage-sqlite';
import { StarMember, SqliteStarRepository, verifyRaffle } from '@aerobot/star-member';
import { SqliteCommunityStore } from '@aerobot/community';
import { createBackup, listBackups } from '@aerobot/maintenance';
import { SqliteScout } from '@aerobot/scout';
import { exportLevelUpsCsv, exportLeadershipCsv, csvDataRows, exportCsv, repositorySource, maskIdentity } from '@aerobot/exports';
import { UnsupportedControlOperation, type LeadershipQuery, type LeadershipAction, type LeadershipResult } from '@aerobot/control-protocol';
import { ControlRuntime, localDay } from './control-runtime.js';
export interface LevelEventRow { eventId:string;memberId:string;occurredAt:number;previousLevel:number;newLevel:number }
/** Optional integration port for the separate levels implementation; IDs must be internal member IDs. */
export interface LevelEventsPort { list(start:number,endExclusive:number):Promise<readonly LevelEventRow[]> }
/** Only non-path metadata crosses the protocol boundary. Raw identifiers are omitted. */
export class LeadershipHost {
  private starStore: SqliteStarRepository; private community: SqliteCommunityStore; private scout: SqliteScout; private runtime: ControlRuntime; private star: StarMember;
  constructor(private storage: SqliteStorage, private folder: string, private env: NodeJS.ProcessEnv, private levelEvents?: LevelEventsPort, private formula: LevelFormula = defaultLevelFormula) {
    const db=join(folder,env.AEROBOT_CONTROL_DEMO === '1' ? 'demo.sqlite' : 'bot.sqlite');
    this.starStore=new SqliteStarRepository(db); this.community=new SqliteCommunityStore(db); this.scout=new SqliteScout(db); this.runtime=new ControlRuntime(folder);
    this.star=new StarMember({repository:this.starStore,members:storage.members,clock:{now:Date.now}});
  }
  close() { this.scout.close(); this.community.close(); this.starStore.close(); this.runtime.close(); }
  private result(rows: Record<string,unknown>[], unavailable: string[]=[]): LeadershipResult { return {schemaVersion:1,rows,unavailable}; }
  private key(id: string) { return 'm_'+createHash('sha256').update(id).digest('hex').slice(0,24); }
  private async members(q: LeadershipQuery) {
    const all=await this.storage.members.list!();
    const rows=await Promise.all(all.map(async m=> {
      const ledger=await this.storage.ledger.list(m.id); const xp=ledger.reduce((sum,t)=>sum+t.amount,0);
      const history=ledger.filter(t=>t.occurredAt >= (q.start ?? 0) && t.occurredAt < (q.end ?? Number.MAX_SAFE_INTEGER));
      return {memberId:this.key(m.id),name:displayName(m.name),status:m.status,registeredAt:m.registeredAt,...levelProgress(xp,this.formula),xp,periodXp:history.reduce((sum,t)=>sum+t.amount,0),history:history.map(t=>({id:this.key(t.id),amount:t.amount,at:t.occurredAt,source:t.source})),rawId:m.id};
    }));
    return rows.filter(m=>(!q.search || m.name.toLocaleLowerCase('pt-BR').includes(q.search.toLocaleLowerCase('pt-BR'))) && (!q.memberId || m.memberId===q.memberId) && (!q.status || m.status===q.status) && (q.level===undefined || m.level===q.level));
  }
  private async resolve(id: string) { const member=(await this.storage.members.list!()).find(m=>this.key(m.id)===id); if(!member) throw new Error('Membro não encontrado.'); return member; }
  async query(q: LeadershipQuery): Promise<LeadershipResult> {
    if(q.section==='export') {
      if(!q.fileName) throw new Error('Arquivo obrigatório.');
      const path=join(this.env.AEROBOT_EXPORT_DIR ?? join(this.folder,'exports'),q.fileName);
      const info=await lstat(path);if(!info.isFile() || info.isSymbolicLink()) throw new Error('Arquivo inválido.');
      const content=await readFile(path,'utf8');const offset=q.offset ?? 0;const nextOffset=Math.min(content.length,offset+65536);
      return this.result([{fileName:q.fileName,generation:createHash('sha256').update(content).digest('hex'),chunk:content.slice(offset,nextOffset),nextOffset,complete:nextOffset>=content.length}]);
    }
    if(q.section==='settings') return this.result([{xp:this.runtime.get('xpPolicy',{schemaVersion:1,enabled:false,award:10,minIntervalMs:60000,dailyCap:100}),persona:this.runtime.get('persona',null),restartRequired:true}],['Persona: somente disponível quando configurada pelo módulo responsável.']);
    if(q.section==='scout') return this.result(this.scout.list().filter(c=>(!q.search || c.name.toLowerCase().includes(q.search.toLowerCase())) && (!q.status || c.status===q.status) && (!q.role || c.roles.includes(q.role as typeof c.roles[number])) && (q.minEvaluation===undefined || (Object.values(c.evaluation).reduce((a,b)=>a+b,0)/Math.max(1,Object.keys(c.evaluation).length))>=q.minEvaluation)).map(c=>({...c,mlbbId:maskIdentity(c.mlbbId),server:maskIdentity(c.server),notes:this.scout.notes(c.id)})));
    if(q.section==='backup') {
      const backupDir=this.env.AEROBOT_BACKUP_DIR ?? join(this.folder,'backups');
      const [main]=await listBackups(backupDir);const [control]=await listBackups(join(backupDir,'control'));
      const metadata=(last:typeof main)=>last ? {fileName:last.manifest.file,createdAt:last.manifest.createdAt,sizeBytes:last.manifest.sizeBytes,encrypted:last.manifest.encrypted,sha256:last.manifest.sha256}:null;
      return this.result([{lastBackup:metadata(main),controlBackup:metadata(control),stale:!main || !control || Date.now()-main.manifest.createdAt>24*3600_000 || Date.now()-control.manifest.createdAt>24*3600_000}]);
    }
    const members=await this.members(q);
    if(q.section==='members') return this.result(members.map(m=>({memberId:m.memberId,name:m.name,status:m.status,registeredAt:m.registeredAt,level:m.level,xp:m.xp,periodXp:m.periodXp,history:m.history})));
    if(q.section==='moderation') {
      const warnings=(await Promise.all(members.map(async m=>(await this.community.listWarnings(m.rawId)).filter(w=>w.at >= (q.start ?? 0) && w.at < (q.end ?? Number.MAX_SAFE_INTEGER)).map(w=>({id:w.id,memberId:m.memberId,name:m.name,reason:sanitizeText(w.reason,200),at:w.at,author:'ADM'}))))).flat();
      const flags=(await this.community.listFlags(q.groupId)).filter(f=>!q.memberId || (f.memberId!==null && this.key(f.memberId)===q.memberId)).filter(f=>f.at >= (q.start ?? 0) && f.at < (q.end ?? Number.MAX_SAFE_INTEGER)).map(f=>({id:f.id,kind:f.kind,groupId:f.groupId,memberId:f.memberId ? this.key(f.memberId):null,at:f.at}));
      return this.result([{warnings,flags}]);
    }
    if(q.section==='star') {
      const period=q.period ?? this.star.currentPeriod();
      const standings=await Promise.all(members.map(async m=>({memberId:m.memberId,name:m.name,...await this.star.own(m.rawId,period)})));
      const safeStandings=standings.map(r=>({...r,standing:r.standing ? {...r.standing,memberId:r.memberId}:null}));
      const raffles=this.starStore.read().raffles.filter(r=>r.period===period).map(r=>({...r,actor:this.key(r.actor),approval:r.approval ? {...r.approval,actor:this.key(r.approval.actor)}:null,winner:this.key(r.winner),candidates:r.candidates.map(id=>this.key(id)),excludedPreviousWinner:r.excludedPreviousWinner ? this.key(r.excludedPreviousWinner):null,verified:verifyRaffle(r)}));
      // Verification refers to the persisted transcript; candidate hashes in UI protect identifiers.
      return this.result([{period,config:this.star.config,standings:safeStandings,raffles}]);
    }

    const levelUps=this.levelEvents ? (await this.levelEvents.list(q.start ?? 0,q.end ?? Date.now()+1)).filter(e=>members.some(m=>m.rawId===e.memberId)).map(e=>({...e,memberId:this.key(e.memberId)})) : null;
    const daily=new Map<string,{day:string;xp:number;activity:number}>();
    for(const m of members) for(const tx of m.history) { const day=localDay(tx.at); const row=daily.get(day) ?? {day,xp:0,activity:0}; row.xp+=tx.amount; if(tx.source==='message') row.activity++; daily.set(day,row); }
    const activity=q.groupId ? this.runtime.db.prepare('SELECT day, SUM(count) AS messages FROM control_daily WHERE day>=? AND day<=? AND group_id=? GROUP BY day ORDER BY day').all(localDay(q.start ?? 0),localDay((q.end ?? Date.now()+1)-1),q.groupId) : this.runtime.db.prepare('SELECT day, SUM(count) AS messages FROM control_daily WHERE day>=? AND day<=? GROUP BY day ORDER BY day').all(localDay(q.start ?? 0),localDay((q.end ?? Date.now()+1)-1));
    if(q.groupId) return this.result([{activity,totalXp:null,series:[],top:[]}],['XP não possui dimensão de grupo confiável no ledger atual. Remova o filtro de grupo para XP.']);
    return this.result([{levelUps,totalXp:members.reduce((sum,m)=>sum+m.periodXp,0),memberCount:members.length,series:[...daily.values()].sort((a,b)=>a.day.localeCompare(b.day)),activity,top:members.sort((a,b)=>b.periodXp-a.periodXp).slice(0,10).map(m=>({memberId:m.memberId,name:m.name,xp:m.periodXp}))}],[...(this.levelEvents ? [] : ['Level-ups: integração reservada para level_events; tabela ainda não integrada.']),'Atividade por membro usa entradas de XP, não todas as mensagens. Contagens recebidas são agregadas por grupo/dia; filtros de membro, status e nível não se aplicam a essa contagem.']);
  }
  private mutations = Promise.resolve();
  action(a: LeadershipAction, actor: string): Promise<LeadershipResult> {
    const result = this.mutations.then(()=>this.perform(a,actor));
    this.mutations=result.then(()=>undefined,()=>undefined);
    return result;
  }
  private async perform(a: LeadershipAction, actor: string): Promise<LeadershipResult> {
    switch(a.action) {
      case 'settingsSave': this.runtime.set('xpPolicy',a.xp); return this.result([{saved:true,restartRequired:true}]);
      case 'scoutSave': this.scout.save({...a.candidate,updatedAt:Date.now()}); return this.result([{saved:true}]);
      case 'scoutNote': this.scout.appendNote({schemaVersion:1,id:randomUUID(),candidateId:a.candidateId,text:a.reason,author:actor,at:Date.now()}); return this.result([{saved:true}]);
      case 'warn': { const m=await this.resolve(a.memberId); await this.community.appendWarning({id:randomUUID(),memberId:m.id,reason:sanitizeText(a.reason,200),authorId:actor,authorName:'ADM Controller',at:Date.now()}); return this.result([{saved:true}]); }
      case 'starScore': { const m=await this.resolve(a.memberId); await this.star.score({memberId:m.id,category:a.category,points:a.points,reason:a.reason},actor); return this.result([{saved:true}]); }
      case 'starClose': await this.star.close(actor,a.period); return this.result([{closed:true}]);
      case 'starDraw': await this.star.raffle(actor,a.period); return this.result([{drawn:true}]);
      case 'starApprove': this.star.approve(actor,a.reason,a.period); return this.result([{approved:true}]);
      case 'backupCreate': {
        const backupDir=this.env.AEROBOT_BACKUP_DIR ?? join(this.folder,'backups');
        const options={passphrase:this.env.AEROBOT_BACKUP_PASSPHRASE,rotation:false as const};
        const main=await createBackup({...options,dbPath:join(this.folder,this.env.AEROBOT_CONTROL_DEMO==='1'?'demo.sqlite':'bot.sqlite'),backupDir});
        const control=await createBackup({...options,dbPath:join(this.folder,'control.sqlite'),backupDir:join(backupDir,'control')});
        return this.result([{scope:'Dados',fileName:main.manifest.file,createdAt:main.manifest.createdAt,sizeBytes:main.manifest.sizeBytes,encrypted:main.manifest.encrypted},{scope:'Configuração e métricas',fileName:control.manifest.file,createdAt:control.manifest.createdAt,sizeBytes:control.manifest.sizeBytes,encrypted:control.manifest.encrypted}]);
      }
      case 'powerbiExport': {
        const folder=this.env.AEROBOT_EXPORT_DIR ?? join(this.folder,'exports');
        await mkdir(folder,{recursive:true,mode:0o700});
        const source=repositorySource({list:()=>this.storage.members.list!()},this.storage.ledger,{list:async()=>this.storage.audit.list()});
        const snapshot=await source.snapshot();
        const masked={snapshot:async()=>({...snapshot,members:snapshot.members.map(m=>({...m,id:this.key(m.id),name:displayName(m.name)})),xpTransactions:snapshot.xpTransactions.map(t=>({...t,id:this.key(t.id),memberId:this.key(t.memberId),sourceId:'',actorId:'',reason:''})),auditLog:[]})};
        const paths=await exportCsv(masked,{outputFolder:folder,period:{start:a.start,endExclusive:a.endExclusive}});
        paths.push(...await exportLeadershipCsv(folder,{
          scout:this.scout.list().map(c=>[1,c.id,c.name,c.status,c.roles.join('|'),c.rank,c.stage,JSON.stringify(c.evaluation)]),
          warnings:(await Promise.all(snapshot.members.map(async m=>(await this.community.listWarnings(m.id)).map(w=>[1,w.id,this.key(m.id),w.at])))).flat(),
          starScores:this.starStore.read().entries.map(e=>[1,e.period,this.key(e.memberId),e.category,e.points,e.at])
        }));
        if(this.levelEvents) {const start=Date.parse(a.start+'T00:00:00-03:00');const end=Date.parse(a.endExclusive+'T00:00:00-03:00');paths.push(await exportLevelUpsCsv(folder,(await this.levelEvents.list(start,end)).map(e=>[1,e.eventId,this.key(e.memberId),new Date(e.occurredAt).toISOString(),e.previousLevel,e.newLevel])));}
        return this.result(await Promise.all(paths.map(async path=> {const content=await readFile(path,'utf8'); return {fileName:basename(path),rowCount:csvDataRows(content),previewCsv:content.slice(0,8192)};})),[...(this.levelEvents ? [] : ['level_ups_v1: indisponível até integração de level_events.']),'Exportações pseudonimizadas; nomes e atributos ainda podem identificar pessoas.','Backup do Controller inclui banco principal e control.sqlite em cópias separadas.']);
      }
      default: throw new UnsupportedControlOperation();
    }
  }
}
