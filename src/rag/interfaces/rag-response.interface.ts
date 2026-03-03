export interface RegulatoryPoint {
  rule: string;
  group: 'léger' | 'lourd' | 'les deux';
  compatibility: string;
  conditions: string | null;
  duration: string | null;
}

export interface ProposedOrientation {
  decision: 'apte' | 'apte_temporaire' | 'apte_avec_restrictions' | 'inapte' | 'renvoi_commission';
  label: string;
  suggested_duration: string | null;
  restrictions: string | null;
  justification: string;
}

/** Full structured analysis — returned on Turn 1 */
export interface FullAnalysis {
  type: 'full';
  case_analysis: string;
  regulatory_framework: string;
  regulatory_points: RegulatoryPoint[];
  medical_reasoning: string;
  clarification_questions: string[];
  proposed_orientation: ProposedOrientation;
  important_notes: string[];
  disclaimer: string;
}

/** Conversational follow-up — returned on Turn 2+ */
export interface FollowUpAnalysis {
  type: 'follow_up';
  response: string;
  regulatory_references: string[];
  updated_orientation: ProposedOrientation | null;
  action_items: string[];
  important_notes: string[];
  disclaimer: string;
}

export type GptAnalysis = FullAnalysis | FollowUpAnalysis;

/** Engine deterministic decision */
export interface EngineDecision {
  code: string;
  label: string;
  type: string;
  duration: string;
  cerfa_text: string;
  confidence: number;
}

export interface EngineRuleFired {
  ruleId: string;
  rationale: string;
  confidence: number;
}

export interface Accommodation {
  symptom: string;
  codes: string;
  label: string;
  comment: string;
}

export interface SourceReference {
  source_number: number;
  chunk_id: string;
  excerpt: string;
  similarity: number;
}

export interface EngineBlock {
  decision: EngineDecision;
  fired_rules: EngineRuleFired[];
  required_actions: { type: string; value: string }[];
  accommodations: Accommodation[];
  expert_notes: string[];
  ui_messages: string[];
  facts_extracted: Record<string, boolean | null>;
}

export interface RagResponse {
  /** GPT expert analysis */
  analysis: GptAnalysis;

  /** Deterministic engine decision (from rules) */
  engine: EngineBlock | null;

  /** Regulatory text sources used */
  sources: SourceReference[];

  /** Conversation state — send back on follow-up calls */
  conversation: {
    id: string;
    history: { role: 'user' | 'assistant'; content: string; timestamp: string }[];
    turn: number;
    cumulative_context: string;
    cumulative_facts: Record<string, boolean | null> | null;
  };

  metadata: {
    chunks_used: number;
    model: string;
    engine_pathology: string | null;
    timestamp: string;
  };
}

export interface RegulationChunk {
  id: string;
  content: string;
  metadata: Record<string, unknown>;
  similarity: number;
}
