import { downloadCsv } from '../services/download';
import React, { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import Svg, { Rect, Line } from 'react-native-svg';
import { AeroInput } from '../components/AeroInput';
import { Button, Card, ConfirmModal } from '../components';
import { colors, spacing, typography } from '../theme';
import type { ControllerApi } from '../services/api';
import type { LeadershipAction, LeadershipQuery, LeadershipResult } from '@aerobot/control-protocol/browser';

const sections = ['members','analytics','star','moderation','backup','scout','settings'] as const;
const labels = {members:'Membros',analytics:'Analytics',star:'Star Member',moderation:'Advertências',backup:'Backup',scout:'Scout',settings:'Política de XP'};
const object = (v: unknown): Record<string,unknown> => typeof v === 'object' && v !== null && !Array.isArray(v) ? v as Record<string,unknown> : {};
const array = (v: unknown): Record<string,unknown>[] => Array.isArray(v) ? v.map(object) : [];
const textStyle = {color:colors.textPrimary,fontFamily:typography.families.ui,fontSize:14};
const fieldLabels: Record<string,string>={weights:'Limites por categoria',threshold:'Pontuação mínima',excludePreviousWinner:'Excluir vencedor anterior',enabled:'Habilitado',award:'XP por mensagem',minIntervalMs:'Intervalo mínimo',dailyCap:'Limite diário',persona:'Persona',mlbbId:'ID MLBB (mascarado)',server:'Servidor (mascarado)',snapshotVersion:'Versão do fechamento',algorithm:'Algoritmo de verificação',actor:'Responsável',approval:'Aprovação',id:'Identificador',memberId:'Membro',name:'Nome',status:'Status',registeredAt:'Cadastro',level:'Nível',xp:'XP',periodXp:'XP no período',history:'Histórico de XP',amount:'Quantidade',at:'Data',source:'Origem',period:'Competência',eligible:'Elegível',standing:'Pontuação',points:'Categorias',total:'Total',totalXp:'XP total',memberCount:'Membros',series:'XP por dia',activity:'Atividade',top:'Destaques',warnings:'Advertências',flags:'Flags para revisão',reason:'Justificativa',author:'Autor',controlBackup:'Backup da configuração',scope:'Escopo',lastBackup:'Último backup',stale:'Backup ausente ou com mais de 24 horas',fileName:'Arquivo',rowCount:'Linhas',previewCsv:'Prévia CSV',createdAt:'Criado em',sizeBytes:'Tamanho em bytes',encrypted:'Criptografado',roles:'Lanes',rank:'Rank',stage:'Etapa',evaluation:'Avaliação',notes:'Histórico de notas',text:'Nota',updatedAt:'Atualizado em',verified:'Verificado pelo Host',seed:'Seed',commitment:'Compromisso SHA-256',winner:'Vencedor',candidates:'Participantes',raffles:'Sorteios',config:'Regras',standings:'Pontuação por membro',restartRequired:'Reinício necessário',day:'Dia',messages:'Mensagens recebidas',saved:'Salvo',closed:'Fechado',drawn:'Sorteado',approved:'Aprovado',schemaVersion:'Versão'};
function Data({value,depth=0,names={}}:{value:unknown;depth?:number;names?:Record<string,string>}): React.JSX.Element {
  if(depth>6) return <Text style={textStyle}>…</Text>;
  if(Array.isArray(value)) return <View style={{gap:spacing.sm}}>{value.length ? value.map((v,i)=><View key={i} style={{borderBottomWidth:1,borderColor:colors.border,paddingVertical:spacing.sm}}><Data value={v} depth={depth+1} names={names}/></View>):<Text style={textStyle}>Sem registros.</Text>}</View>;
  if(value && typeof value==='object') return <View style={{gap:spacing.xs}}>{Object.entries(object(value)).filter(([key])=>key!=='schemaVersion' && key!=='memberId').map(([key,v])=><View key={key}><Text style={{...textStyle,color:colors.textSecondary}}>{fieldLabels[key] ?? key}</Text><Data value={key==='minIntervalMs' ? `${Number(v)/1000} s` : key==='actor' ? 'ADM (ver auditoria)' : v} depth={depth+1} names={names}/></View>)}</View>;
  return <Text selectable style={textStyle}>{value===null ? 'Indisponível' : typeof value==='boolean' ? value ? 'Sim':'Não' : typeof value==='number' && value>100000000000 ? new Date(value).toLocaleString('pt-BR') : names[String(value)] ?? ({active:'Ativo',inactive:'Inativo',observando:'Observando',convidado:'Convidado',aprovado:'Aprovado',recusado:'Recusado'} as Record<string,string>)[String(value)] ?? String(value ?? '')}</Text>;
}
function Chart({rows}:{rows:Record<string,unknown>[]}): React.JSX.Element {
  const minimum=Math.min(0,...rows.map(r=>Number(r.xp)));const maximum=Math.max(0,...rows.map(r=>Number(r.xp)));const span=Math.max(1,maximum-minimum);
  const y=(value:number)=>110-100*(value-minimum)/span;const zero=y(0);
  return <View accessibilityLabel="XP por dia (valores na tabela abaixo)"><Svg width="100%" height={120} viewBox="0 0 320 120"><Line x1={0} y1={zero} x2={320} y2={zero} stroke={colors.border}/>{rows.map((r,i)=><Rect key={i} x={i*320/Math.max(rows.length,1)+2} y={Math.min(zero,y(Number(r.xp)))} width={Math.max(1,320/Math.max(rows.length,1)-4)} height={Math.abs(y(Number(r.xp))-zero)} fill={Number(r.xp)<0?colors.dangerText:colors.gold}/>)}</Svg><Text style={textStyle}>{rows[0]?.day as string} — {rows.at(-1)?.day as string}</Text></View>;
}
export function LeadershipScreen({api}:{api:ControllerApi}): React.JSX.Element {
  const [section,setSection]=useState<typeof sections[number]>('members');
  const [filtersOpen,setFiltersOpen]=useState(false);
  const [result,setResult]=useState<LeadershipResult|null>(null); const [error,setError]=useState(''); const [busy,setBusy]=useState(false);
  const [search,setSearch]=useState(''); const [status,setStatus]=useState(''); const [level,setLevel]=useState(''); const [group,setGroup]=useState('');
  const [days,setDays]=useState(7); const [start,setStart]=useState(''); const [end,setEnd]=useState('');
  const [member,setMember]=useState(''); const [roster,setRoster]=useState<Record<string,unknown>[]>([]); const [reason,setReason]=useState(''); const [points,setPoints]=useState('5'); const [category,setCategory]=useState('atividade');
  const [period,setPeriod]=useState(new Date().toISOString().slice(0,7)); const [pending,setPending]=useState<LeadershipAction|null>(null);
  const [xpEnabled,setXpEnabled]=useState(false); const [xpAward,setXpAward]=useState('10'); const [xpCooldown,setXpCooldown]=useState('60'); const [xpCap,setXpCap]=useState('100');
  const [candidateId,setCandidateId]=useState(''); const [name,setName]=useState(''); const [mlbb,setMlbb]=useState(''); const [server,setServer]=useState(''); const [role,setRole]=useState(''); const [rank,setRank]=useState(''); const [stage,setStage]=useState(''); const [evaluation,setEvaluation]=useState(''); const [minEvaluation,setMinEvaluation]=useState(''); const [criterion,setCriterion]=useState('comunicacao');const [criterionScore,setCriterionScore]=useState('5');
  function bounds() { const now=Date.now(); return {start:start ? Date.parse(start+'T00:00:00-03:00') : now-days*86400000,end:end ? Date.parse(end+'T00:00:00-03:00') : now+1}; }
  async function load() {
    setBusy(true);setError('');
    try { if(!api.leadershipQuery) throw new Error('Use o Host control-demo com o modo real para estas operações.');
      const b=bounds(); const q: LeadershipQuery={schemaVersion:1,section,...b,...(search?{search}:{}),...(status?{status}:{}),...(member?{memberId:member}:{}),...(level?{level:Number(level)}:{}),...(group?{groupId:group}:{}),...(section==='scout' && role?{role}:{}),...(minEvaluation?{minEvaluation:Number(minEvaluation)}:{}),period};
      const response=await api.leadershipQuery(q); setResult(response); if(section==='settings') {const xp=object(response.rows[0]?.xp);setXpEnabled(xp.enabled===true);setXpAward(String(xp.award??10));setXpCooldown(String(Number(xp.minIntervalMs??60000)/1000));setXpCap(String(xp.dailyCap??100));}
    } catch(e) { setError(e instanceof Error ? e.message:'Falha ao consultar.');setResult(null); } finally {setBusy(false);}
  }
  useEffect(()=>{void load();},[section]);
  useEffect(()=>{void api.leadershipQuery?.({schemaVersion:1,section:'members'}).then(r=>setRoster(r.rows)).catch(()=>undefined);},[api]);
  async function execute(action:LeadershipAction) { setBusy(true);setError(''); try {if(!api.leadershipAction) throw new Error('Use o Host control-demo no modo real.');setResult(await api.leadershipAction(action));setFiltersOpen(false);if(action.action!=='powerbiExport') await load();} catch(e) {setError(e instanceof Error?e.message:'Falha ao executar.');} finally{setBusy(false);} }
  async function download(fileName: string) {
    setBusy(true);setError('');
    try {
      await downloadCsv(api,fileName);
    } catch(e) {setError(e instanceof Error?e.message:'Falha ao baixar arquivo.');} finally {setBusy(false);}
  }
  const input=(label:string,value:string,onChangeText:(v:string)=>void)=><View style={{gap:4}}><Text style={{...textStyle,color:colors.textSecondary}}>{label}</Text><AeroInput accessibilityLabel={label} value={value} onChangeText={onChangeText}/></View>;
  const action=(label:string,a:LeadershipAction,confirm=false)=><Button label={label} disabled={busy} onPress={()=>confirm?setPending(a):void execute(a)}/>;
  const summary=object(result?.rows[0]);
  function review(a:LeadershipAction):string {
    const memberName='memberId' in a ? String(roster.find(m=>m.memberId===a.memberId)?.name ?? a.memberId):'';
    switch(a.action) {
      case 'warn': return `Advertir ${memberName}. Justificativa: ${a.reason}. Este registro é permanente.`;
      case 'starScore': return `${memberName}: ${a.points} pontos em ${a.category}. Justificativa: ${a.reason}. O lançamento fica no histórico.`;
      case 'starClose': return `Fechar ${a.period}. A pontuação será congelada; alterações posteriores exigem revisão administrativa.`;
      case 'starDraw': return `Sortear ${a.period}. A seed será gerada no Host e o sorteio registrado para aprovação.`;
      case 'starApprove': return `Aprovar publicação do sorteio de ${a.period}. Motivo: ${a.reason}.`;
      case 'scoutSave': return `Salvar ${a.candidate.name}, status ${a.candidate.status}, lanes ${a.candidate.roles.join(', ')}. O cadastro atual deste ID será substituído; notas anteriores permanecem.`;
      case 'scoutNote': return `Anexar nota permanente ao candidato ${a.candidateId}: ${a.reason}`;
      case 'backupCreate': return 'Criar cópias verificadas dos dados e da configuração do Host. Os backups anteriores serão preservados.';
      default: return 'Confirme os dados informados. A decisão será auditada.';
    }
  }
  return <ScrollView contentContainerStyle={{gap:spacing.md,paddingBottom:spacing.xl}} keyboardShouldPersistTaps="handled">
    <Text style={{...textStyle,fontFamily:typography.families.display,fontSize:28}}>Liderança</Text>
    <View style={{flexDirection:'row',flexWrap:'wrap',gap:spacing.xs}}>{sections.map(s=><Button key={s} label={labels[s]} variant={section===s?'primary':'outline'} onPress={()=>{setStatus('');setMember('');setSearch('');setGroup('');setLevel('');setRole('');setFiltersOpen(false);setSection(s);}}/>)}</View>
    <Button label={filtersOpen ? 'Recolher filtros e ações' : 'Filtros e ações'} variant="outline" onPress={()=>setFiltersOpen(!filtersOpen)}/>
    {filtersOpen ? <View style={{gap:spacing.md}}><Card title={labels[section]}>
      {input('Buscar por nome',search,setSearch)}
      {input('Status (vazio = todos)',status,setStatus)}
      {section==='analytics' || section==='members' ? <>{input('Nível (vazio = todos)',level,setLevel)}{input('Grupo (ID; vazio = todos)',group,setGroup)}<View style={{flexDirection:'row',flexWrap:'wrap',gap:4}}>{[1,7,30].map(d=><Button key={d} label={d===1?'Hoje':`${d} dias`} variant="outline" onPress={()=>{setDays(d);setStart(d===1?new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo'}).format(Date.now()):'');setEnd('');}}/>) }<Button label="Mês" variant="outline" onPress={()=>{setStart(period+'-01');setEnd('');}}/></View>{input('Início personalizado AAAA-MM-DD',start,setStart)}{input('Fim exclusivo AAAA-MM-DD',end,setEnd)}</>:null}
      {section==='star'?input('Competência AAAA-MM',period,setPeriod):null}
      {section==='scout'?<>{input('Filtrar lane (vazio = todas)',role,setRole)}{input('Avaliação mínima 0–10',minEvaluation,setMinEvaluation)}</>:null}
      <Button label={busy?'Consultando…':'Consultar'} disabled={busy} onPress={()=>void load()}/>
    </Card>
    {section!=='scout' && section!=='backup' && section!=='settings'?<Card title="Selecionar membro"><Button label="Todos" variant="outline" onPress={()=>setMember('')}/>{roster.filter(r=>!search || String(r.name).toLowerCase().includes(search.toLowerCase())).map(r=><Button key={String(r.memberId)} label={`${member===r.memberId?'Selecionado · ':''}${r.name}`} variant="outline" onPress={()=>setMember(String(r.memberId))}/>)}</Card>:null}
    {section==='settings'?<Card title="Política de XP"><Text style={textStyle}>A política salva será aplicada após reiniciar o Host. Cada grupo também precisa ter o módulo XP ligado.</Text><Button label={xpEnabled?'XP habilitado':'XP desabilitado'} variant="outline" onPress={()=>setXpEnabled(!xpEnabled)}/>{input('XP por mensagem',xpAward,setXpAward)}{input('Intervalo mínimo (segundos)',xpCooldown,setXpCooldown)}{input('Limite diário',xpCap,setXpCap)}{action('Salvar política',{action:'settingsSave',xp:{schemaVersion:1,enabled:xpEnabled,award:Number(xpAward),minIntervalMs:Number(xpCooldown)*1000,dailyCap:Number(xpCap)}})}</Card>:null}
    {section==='moderation'?<Card title="Registrar advertência">{input('Justificativa',reason,setReason)}{action('Advertir',{action:'warn',memberId:member,reason,confirm:true},true)}</Card>:null}
    {section==='star'?<Card title="Decisões administrativas">{input('Categoria: atividade, partidas, rising, comunidade, fairplay',category,setCategory)}{input('Pontos',points,setPoints)}{input('Justificativa',reason,setReason)}{action('Pontuar',{action:'starScore',confirm:true,memberId:member,category:category as 'atividade',points:Number(points),reason},true)}{action('Fechar mês',{action:'starClose',period,confirm:true},true)}{action('Sortear (seed gerada pelo Host)',{action:'starDraw',period,confirm:true},true)}{action('Aprovar publicação',{action:'starApprove',period,reason,confirm:true},true)}</Card>:null}
    {section==='backup'?<Card title="Proteção de dados"><Text style={textStyle}>Confira o Último backup e o aviso de idade. A criação não substitui um teste de restauração.</Text>{action('Criar backup',{action:'backupCreate',confirm:true},true)}</Card>:null}
    {section==='scout'?<Card title="Cadastro fornecido pela liderança"><Text style={textStyle}>Nenhuma estatística pessoal é coletada automaticamente. IDs são mascarados na consulta.</Text>{input('ID interno (vazio = novo)',candidateId,setCandidateId)}{input('Nome',name,setName)}{input('MLBB ID informado',mlbb,setMlbb)}{input('Servidor informado',server,setServer)}{input('Lane: EXP, Gold, Mid, Jungle, Roam',role,setRole)}{input('Rank',rank,setRank)}{input('Etapa',stage,setStage)}{input('Critério de avaliação',criterion,setCriterion)}{input('Nota 0 a 10',criterionScore,setCriterionScore)}<Button label="Adicionar critério" variant="outline" onPress={()=>{const score=Number(criterionScore);if(!criterion.trim() || !Number.isFinite(score) || score<0 || score>10) {setError('Informe um critério e nota entre 0 e 10.');return;}setEvaluation(JSON.stringify({...JSON.parse(evaluation||'{}'),[criterion.trim()]:score}));}}/><Text style={textStyle}>{Object.entries(object(JSON.parse(evaluation||'{}'))).map(([key,value])=>`${key}: ${value}`).join(' · ')}</Text><Button label="Salvar candidato" disabled={busy} onPress={()=>{try {const scores=JSON.parse(evaluation||'{}') as Record<string,number>;setPending({action:'scoutSave',confirm:true,candidate:{schemaVersion:1,id:candidateId||`scout-${Date.now()}`,name,mlbbId:mlbb,server,roles:[(role||'Mid') as 'Mid'],rank,stage,status:(status||'observando') as 'observando',evaluation:scores,updatedAt:Date.now()}});}catch{setError('Não foi possível validar os critérios.');}}}/>{input('Nota para o ID interno acima',reason,setReason)}{action('Anexar nota',{action:'scoutNote',confirm:true,candidateId,reason},true)}</Card>:null}
    {section==='analytics'?<Card title="Power BI / Excel">{action('Gerar pasta de CSV no Host',{action:'powerbiExport',start:start||new Date(Date.now()-days*86400000).toISOString().slice(0,10),endExclusive:end||new Date(Date.now()+86400000).toISOString().slice(0,10)})}<Text style={textStyle}>A prévia é limitada; os arquivos completos ficam na pasta de exportação configurada no Host.</Text></Card>:null}
    </View> : null}
    {error?<Text accessibilityRole="alert" style={{...textStyle,color:colors.textSecondary}}>{error}</Text>:null}
    {result?<Card title="Resultado">{section==='analytics' && array(summary.series).length?<Chart rows={array(summary.series)}/>:null}{result.unavailable.map((s,i)=><Text key={i} style={{...textStyle,color:colors.textSecondary}}>{s}</Text>)}{result.rows.filter(r=>typeof r.fileName==='string' && typeof r.previewCsv==='string').map(r=><Button key={String(r.fileName)} label={`Baixar ${r.fileName}`} disabled={busy} variant="outline" onPress={()=>void download(String(r.fileName))}/>)}<Data value={result.rows} names={Object.fromEntries(roster.map(m=>[String(m.memberId),String(m.name)]))}/></Card>:null}
    <ConfirmModal visible={pending!==null} title="Confirmar operação" description={pending ? review(pending) : ''} confirmLabel="Confirmar" onCancel={()=>setPending(null)} onConfirm={()=>{const a=pending;setPending(null);if(a) void execute(a);}}/>
  </ScrollView>;
}
