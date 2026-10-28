import type { WhatsAppAdapter } from './ports.js';
export type PersonaStyle = 'neutro' | 'conselheiro';
export type MessageKind = 'welcome' | 'levelUp' | 'perfil' | 'xp' | 'rank' | 'ping' | 'usage' | 'unknown' | 'warning' | 'backup' | 'general';
// Proposta / pendente de aprovação. Frames preserve the original payload verbatim.
export const royalPhrases: Readonly<Record<MessageKind, readonly string[]>> = {
  welcome: ['Recebei nossas boas-vindas.', 'A corte vos acolhe.', 'É uma honra receber vossa presença.', 'Que comece uma boa jornada.'],
  levelUp: ['A corte celebra vossa conquista!', 'Eis um novo marco de vossa jornada!', 'Vosso empenho merece aplausos!', 'Que a glória vos acompanhe!'],
  perfil: ['Eis vosso registro.', 'Com vossa licença, vosso perfil.', 'Eis o que consta nos registros.', 'Apresento vossa ficha.'],
  xp: ['Eis vosso progresso.', 'Vosso empenho está registrado.', 'Trago a conta de vossa jornada.', 'Consultemos vossos méritos.'],
  rank: ['Eis a ordem dos méritos.', 'Consultemos o quadro de honra.', 'A corte apresenta a classificação.', 'Eis o que apurei na classificação.'],
  ping: ['Às vossas ordens.', 'Sempre a postos.', 'O conselho está presente.', 'Pronto para servir.'],
  usage: ['Com vossa licença, revisemos o pedido.', 'Peço atenção à orientação.', 'Um pequeno ajuste se faz necessário.', 'Eis como prosseguir.'],
  unknown: ['Não encontrei tal pedido nos registros.', 'Consultemos os comandos disponíveis.', 'Peço que revejais o comando.', 'A lista de comandos poderá ajudar.'],
  warning: ['Peço vossa atenção.', 'A boa convivência pede cuidado.', 'O conselho traz um aviso.', 'Recebei esta orientação.'],
  backup: ['Os registros merecem zelo.', 'Trago notícias dos arquivos.', 'Eis o informe de preservação.', 'O conselho informa sobre os registros.'],
  general: ['Com vossa licença.', 'Eis o que apurei.', 'Vossa Mercê, segue o informe.', 'O conselho vos informa.']
};
export function messageKind(text: string): MessageKind {
  if (text.startsWith('Comando desconhecido.')) return 'unknown';
  if (text.startsWith('Parabéns,')) return 'levelUp';
  if (/boas-vindas|bem-vind/iu.test(text)) return 'welcome';
  if (/argumentos inválidos|use \/ajuda|use \/registrar/iu.test(text)) return 'usage';
  if (/backup/iu.test(text)) return 'backup';
  if (/advertência|aviso|moderação/iu.test(text)) return 'warning';
  if (/^pong/iu.test(text)) return 'ping';
  if (/^XP:/u.test(text)) return 'xp';
  if (/ranking|classificação|^1[.)]/iu.test(text)) return 'rank';
  if (text.includes(' · ')) return 'perfil';
  return 'general';
}
export class Persona {
  private readonly previous = new Map<MessageKind, number>();
  constructor(readonly style: PersonaStyle = 'neutro', private readonly random: () => number = Math.random) {}
  render(text: string, kind: MessageKind = messageKind(text)): string {
    if (this.style === 'neutro') return text;
    const phrases = royalPhrases[kind];
    const sample = this.random();
    let index = Math.floor((Number.isFinite(sample) ? Math.max(0, Math.min(sample, 0.999999)) : 0) * phrases.length);
    if (index === this.previous.get(kind)) index = (index + 1) % phrases.length;
    this.previous.set(kind, index);
    return `${phrases[index]}\n${text}`;
  }
}
/** Central output decorator, also used for external command and community output. */
export function personaAdapter(adapter: WhatsAppAdapter, persona: Persona): WhatsAppAdapter {
  return { sendMessage: (destination, text) => adapter.sendMessage(destination, persona.render(text)) };
}
