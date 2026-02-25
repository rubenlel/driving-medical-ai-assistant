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

export interface RagAnswer {
  case_analysis: string;
  regulatory_framework: string;
  regulatory_points: RegulatoryPoint[];
  medical_reasoning: string;
  clarification_questions: string[];
  proposed_orientation: ProposedOrientation;
  important_notes: string[];
  disclaimer: string;
}

export interface SourceReference {
  source_number: number;
  chunk_id: string;
  excerpt: string;
  similarity: number;
}

export interface RagResponse {
  answer: RagAnswer;
  sources: SourceReference[];
  metadata: {
    chunks_used: number;
    model: string;
    timestamp: string;
  };
}

export interface RegulationChunk {
  id: string;
  content: string;
  metadata: Record<string, unknown>;
  similarity: number;
}
