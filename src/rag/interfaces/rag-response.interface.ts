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

/** GPT analysis output (from prompt) */
export interface GptAnalysis {
  case_analysis: string;
  regulatory_framework: string;
  regulatory_points: RegulatoryPoint[];
  medical_reasoning: string;
  clarification_questions: string[];
  proposed_orientation: ProposedOrientation;
  important_notes: string[];
  disclaimer: string;
}

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

export interface RagResponse {
  /** GPT expert analysis */
  analysis: GptAnalysis;

  /** Deterministic engine decision (from rules) */
  engine: {
    decision: EngineDecision;
    fired_rules: EngineRuleFired[];
    required_actions: { type: string; value: string }[];
    accommodations: Accommodation[];
    expert_notes: string[];
    ui_messages: string[];
    facts_extracted: Record<string, boolean | null>;
  } | null;

  /** Regulatory text sources used */
  sources: SourceReference[];

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
