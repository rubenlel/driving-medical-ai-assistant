import { FactStore } from './fact.interface';
import { FiredRule } from './rule.interface';

export type SessionStatus = 'in_progress' | 'completed' | 'referred_to_rag';

export interface NodeAnswer {
  nodeId: string;
  answerType: 'select' | 'yesno' | 'checkbox' | 'info';
  value: boolean | string | string[];
  precision?: string;
  answeredAt: string;
}

export interface EvaluationSession {
  id: string;
  pathology: string;
  groupPermis: 'G1' | 'G2';
  currentNodeId: string;
  facts: FactStore;
  answers: NodeAnswer[];
  firedRules: FiredRule[];
  status: SessionStatus;
  createdAt: string;
}
