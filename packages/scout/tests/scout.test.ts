import { describe, it, expect } from 'vitest';
import { MemoryScout, SqliteScout, type ScoutPort } from '../src/index.js';
const candidate={schemaVersion:1 as const,id:'c1',name:'Candidato fictício',mlbbId:'123456',server:'12',roles:['Mid' as const],rank:'Mítico',stage:'Teste',status:'observando' as const,evaluation:{comunicacao:8},updatedAt:1};
describe.each(['memory','sqlite'])('%s scout', mode=> {
  it('valida dados, preserva notas, impede duplicatas e não exp?e refer?ncias mut?veis',()=> {
    const store:ScoutPort=mode==='memory'?new MemoryScout():new SqliteScout(':memory:');
    try { store.save(candidate); const rows=store.list();rows[0]!.name='alterado';expect(store.list()[0]!.name).toBe(candidate.name);
      const note={schemaVersion:1 as const,id:'n1',candidateId:'c1',text:'Avaliação da liderança',author:'ADM',at:2};
      expect(store.appendNote(note)).toBe(true);expect(store.appendNote(note)).toBe(false);
      store.save({...candidate,status:'aprovado'});expect(store.notes('c1')).toEqual([note]);
      expect(()=>store.save({...candidate,evaluation:{teste:11}})).toThrow();expect(()=>store.appendNote({...note,id:'n2',candidateId:'missing'})).toThrow();
    } finally {if(store instanceof SqliteScout) store.close();}
  });
});
