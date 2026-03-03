export type AnswerType = 'select' | 'yesno' | 'checkbox' | 'info';

export interface TreeNode {
  nodeId: string;
  block: string;
  question: string;
  answerType: AnswerType;
  options: string[] | null;
  ifYes: string | null;
  ifNo: string | null;
  isStop: boolean;
  stopDecisionCode: string | null;
  hasPrecisionField: boolean;
  rationale: string;
}
