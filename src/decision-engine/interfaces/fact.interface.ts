export interface FactDefinition {
  key: string;
  type: 'bool';
  description: string;
  sourceNode: string;
  allowedValues: string;
}

export type FactValue = boolean | null;

export type FactStore = Record<string, FactValue>;
