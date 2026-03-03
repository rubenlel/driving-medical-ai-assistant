export interface ConfigEntry {
  value: string | number;
  type: string;
  notes: string;
}

export interface PathologyConfig {
  DELAI_MIN_POST_AVC_MOIS: ConfigEntry;
  DUREE_APTE_TEMP: ConfigEntry;
  DUREE_INAPTE_TEMP: ConfigEntry;
  GROUPE_PERMIS: ConfigEntry;
  RECO_MIN_REEVAL_WEEKS: ConfigEntry;
  PRINCIPE_STABILISATION: ConfigEntry;
  NOTE_RESPONSABILITE_MA: ConfigEntry;
  NOTE_PAS_DEFINITIF: ConfigEntry;
  [key: string]: ConfigEntry;
}
