import { TreeNode } from './tree.interface';
import { FiredRule } from './rule.interface';
import { Accommodation } from './decision.interface';
import { EvaluationSession } from './session.interface';

export interface QuestionResponse {
  type: 'question';
  session: EvaluationSession;
  question: TreeNode;
  progress: {
    answered: number;
    total: number;
  };
}

export interface FinalDecision {
  decision: {
    code: string;
    label: string;
    type: string;
    duration: string;
    cerfa_text: string;
  };
  clinical_reasoning: string;
  fired_rules: {
    ruleId: string;
    rationale: string;
    confidence: number;
  }[];
  required_actions: {
    type: string;
    value: string;
  }[];
  accommodations: Accommodation[];
  expert_notes: string[];
  ui_messages: string[];
  missing_data: string[];
  facts_summary: Record<string, boolean | null>;
}

export interface DecisionResponse {
  type: 'decision';
  session: EvaluationSession;
  result: FinalDecision;
}

export type EngineResponse = QuestionResponse | DecisionResponse;
