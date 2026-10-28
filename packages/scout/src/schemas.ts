import { z } from 'zod';
export const CandidateSchema = z.object({
  schemaVersion: z.literal(1), id: z.string().min(1).max(128), name: z.string().trim().min(1).max(120),
  mlbbId: z.string().regex(/^\d{1,20}$/), server: z.string().regex(/^\d{1,10}$/),
  roles: z.array(z.enum(['EXP', 'Gold', 'Mid', 'Jungle', 'Roam'])).min(1).max(5),
  rank: z.string().max(80), stage: z.string().max(80),
  status: z.enum(['observando', 'convidado', 'aprovado', 'recusado']),
  evaluation: z.record(z.string().min(1).max(60), z.number().min(0).max(10)), updatedAt: z.number().int().nonnegative()
}).strict();
export const ScoutNoteSchema = z.object({ schemaVersion: z.literal(1), id: z.string().min(1).max(128), candidateId: z.string().min(1).max(128), text: z.string().trim().min(1).max(2000), author: z.string().min(1).max(128), at: z.number().int().nonnegative() }).strict();
export type Candidate = z.infer<typeof CandidateSchema>;
export type ScoutNote = z.infer<typeof ScoutNoteSchema>;
