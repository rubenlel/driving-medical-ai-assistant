export interface RuleCondition {
  fact: string;
  op: '==' | '!=' | '>' | '<';
  value: boolean | number | string;
}

export type ActionType =
  | 'require_specialist'
  | 'recommend'
  | 'require_evaluation'
  | 'route_to_module'
  | 'show_snippet'
  | 'consider_accommodations'
  | 'ask'
  | 'require_followup'
  | 'maybe';

export interface RuleAction {
  type: ActionType;
  value: string | boolean;
}

export interface MissingDataEntry {
  type: string;
  value: string;
}

export interface MachineRule {
  ruleId: string;
  priority: number;
  applicableGroup: 'G1' | 'G2' | 'ALL';
  andConditions: RuleCondition[];
  orConditions: RuleCondition[];
  notConditions: RuleCondition[];
  decisionCode: string;
  decisionLabel: string;
  defaultDuration: string;
  actions: RuleAction[];
  missingData: MissingDataEntry[];
  rationale: string;
  snippetKeys: string[];
  confidence: number;
}

export interface CheckboxRule {
  ruleId: string;
  appliesTo: string;
  trigger: string;
  decisionCode: string;
  decisionLabel: string;
  defaultDuration: string;
  reEvaluationConditions: string;
  notes: string;
}

export interface FiredRule {
  ruleId: string;
  decisionCode: string;
  decisionLabel: string;
  confidence: number;
  actions: RuleAction[];
  rationale: string;
  snippetKeys: string[];
}
