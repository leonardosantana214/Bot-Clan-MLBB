import { expect, it } from 'vitest';
import { csv, csvDataRows } from '../src/index.js';
it('preserva linhas CSV com campos multilinha e sinais numéricos',()=> {
  const content=csv([['name','xp'],['=synthetic\nsecond line',-5],['"quoted",name',10]]);
  expect(csvDataRows(content)).toBe(2);expect(content).toContain("'=synthetic");expect(content).toContain(',-5');expect(content).not.toContain("'-5");
});
