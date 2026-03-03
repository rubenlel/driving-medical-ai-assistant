export type DecisionType = 'STOP' | 'END' | 'ROUTE';

export interface Decision {
  code: string;
  label: string;
  type: DecisionType;
  defaultDuration: string;
  uiTemplate: string;
  medicoLegalText: string;
}

export interface Accommodation {
  symptom: string;
  codes: string;
  label: string;
  comment: string;
}

export interface ExpertRule {
  ruleId: string;
  theme: string;
  trigger: string;
  context: string;
  recommendation: string;
  suggestedDuration: string;
  clinicalJustification: string;
  regulatoryReference: string;
  uiNote: string;
}
