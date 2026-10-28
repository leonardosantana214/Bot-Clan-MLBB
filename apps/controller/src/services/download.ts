import type { ControllerApi } from './api';
/** Authenticated bounded transfers; refuses a file changed during the download. */
export async function downloadCsv(api: ControllerApi, fileName: string): Promise<void> {
  if(!api.leadershipQuery || typeof document==='undefined') throw new Error('Download disponível no navegador; use a prévia neste dispositivo.');
  const chunks:string[]=[];let offset=0;let generation:unknown;
  for(;;) {
    const response=await api.leadershipQuery({schemaVersion:1,section:'export',fileName:fileName as 'members_v1.csv',offset});
    const row=response.rows[0];if(!row || typeof row.chunk!=='string' || typeof row.nextOffset!=='number') throw new Error('Resposta de arquivo inválida.');
    if(generation!==undefined && generation!==row.generation) throw new Error('O arquivo foi regenerado; baixe novamente.');generation=row.generation;chunks.push(row.chunk);
    if(row.complete===true) break;if(row.nextOffset<=offset) throw new Error('Falha ao transferir arquivo.');offset=row.nextOffset;
  }
  const url=URL.createObjectURL(new Blob(chunks,{type:'text/csv;charset=utf-8'}));
  const anchor=document.createElement('a');anchor.href=url;anchor.download=fileName;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
