/**
 * Extracts all sheets from the AVC decision-tree Excel workbook
 * and writes them as typed JSON config files.
 *
 * Usage:
 *   npx ts-node scripts/extract-excel-data.ts
 */

import * as XLSX from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';

const EXCEL_PATH = path.resolve(
  __dirname,
  '../Arbre_AVC_G1_Tableau_IA_AUTO_DECISION_AMENAGEMENTS_v3_MACHINE_RULES.xlsx',
);
const OUTPUT_DIR = path.resolve(__dirname, '../src/decision-engine/data/avc-g1');

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function writeJson(filename: string, data: unknown) {
  const filepath = path.join(OUTPUT_DIR, filename);
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2), 'utf-8');
  console.log(`  ✓ ${filename}`);
}

function sheetToRows(wb: XLSX.WorkBook, name: string): Record<string, unknown>[] {
  const ws = wb.Sheets[name];
  if (!ws) throw new Error(`Sheet "${name}" not found`);
  return XLSX.utils.sheet_to_json(ws, { defval: null });
}

function tryParseJson(val: unknown): unknown {
  if (typeof val !== 'string') return val;
  const trimmed = val.trim();
  if ((trimmed.startsWith('[') && trimmed.endsWith(']')) ||
      (trimmed.startsWith('{') && trimmed.endsWith('}'))) {
    try { return JSON.parse(trimmed); } catch { return val; }
  }
  return val;
}

// ─── CONFIG ────────────────────────────────────────────────────────
function extractConfig(wb: XLSX.WorkBook) {
  const rows = sheetToRows(wb, 'CONFIG');
  const config: Record<string, unknown> = {};
  for (const row of rows) {
    const r = row as Record<string, unknown>;
    const key = r['Key'] as string;
    config[key] = {
      value: r['Value'],
      type: r['Type'],
      notes: r['Allowed Values / Notes'],
    };
  }
  writeJson('config.json', config);
}

// ─── DECISION_TREE ─────────────────────────────────────────────────
function extractDecisionTree(wb: XLSX.WorkBook) {
  const rows = sheetToRows(wb, 'DECISION_TREE');
  const nodes = rows.map((r: any) => ({
    nodeId: r['NodeID'],
    block: r['Block'],
    question: r['Question (UI)'],
    answerType: r['Answer Type'],
    options: r['Options (if select/checkbox)']
      ? String(r['Options (if select/checkbox)']).split(';').map((s: string) => s.trim())
      : null,
    ifYes: r['If YES -> Next'] || null,
    ifNo: r['If NO -> Next'] || null,
    isStop: r['STOP? (Y/N)'] === 'Y',
    stopDecisionCode: r['Stop Decision Code'] || null,
    hasPrecisionField: r['Precision Field? (Y/N)'] === 'Y',
    rationale: r['Decision Rationale / Notes'] || '',
  }));
  writeJson('decision-tree.json', nodes);
}

// ─── RULES ─────────────────────────────────────────────────────────
function extractRules(wb: XLSX.WorkBook) {
  const rows = sheetToRows(wb, 'RULES');
  const rules = rows.map((r: any) => ({
    ruleId: r['RuleID'],
    appliesTo: r['Applies To'],
    trigger: r['Trigger (answer/checkbox)'],
    decisionCode: r['Decision Code'],
    decisionLabel: r['Decision Label'],
    defaultDuration: r['Default Duration'],
    reEvaluationConditions: r['Re-evaluation Conditions'],
    notes: r['Notes / Justification'],
  }));
  writeJson('rules.json', rules);
}

// ─── DECISIONS ─────────────────────────────────────────────────────
function extractDecisions(wb: XLSX.WorkBook) {
  const rows = sheetToRows(wb, 'DECISIONS');
  const decisions = rows.map((r: any) => ({
    code: r['Decision Code'],
    label: r['Label'],
    type: r['Type'],
    defaultDuration: r['Default Duration'],
    uiTemplate: r['UI Output (template)'],
    medicoLegalText: r['Copy/Paste text (medico-legal)'],
  }));
  writeJson('decisions.json', decisions);
}

// ─── MACHINE_RULES ─────────────────────────────────────────────────
function extractMachineRules(wb: XLSX.WorkBook) {
  const rows = sheetToRows(wb, 'MACHINE_RULES');
  const rules = rows.map((r: any) => ({
    ruleId: r['RuleID'],
    priority: r['Priority'],
    applicableGroup: r['Group'],
    andConditions: tryParseJson(r['AND Conditions (JSON)']) || [],
    orConditions: tryParseJson(r['OR Conditions (JSON)']) || [],
    notConditions: tryParseJson(r['NOT Conditions (JSON)']) || [],
    decisionCode: r['Decision Code'],
    decisionLabel: r['Decision Label'],
    defaultDuration: r['Default Duration'],
    actions: tryParseJson(r['Actions (JSON)']) || [],
    missingData: tryParseJson(r['Missing Data (JSON)']) || [],
    rationale: r['Rationale'],
    snippetKeys: r['Snippet Keys']
      ? String(r['Snippet Keys']).split(';').map((s: string) => s.trim())
      : [],
    confidence: r['Confidence'] ?? 0.5,
  }));
  writeJson('machine-rules.json', rules);
}

// ─── MACHINE_FACTS ─────────────────────────────────────────────────
function extractMachineFacts(wb: XLSX.WorkBook) {
  const rows = sheetToRows(wb, 'MACHINE_FACTS');
  const facts = rows.map((r: any) => ({
    key: r['Fact key'],
    type: r['Type'],
    description: r['Description'],
    sourceNode: r['Source (node/field)'],
    allowedValues: r['Allowed values / notes'],
  }));
  writeJson('machine-facts.json', facts);
}

// ─── ACCOMMODATIONS_REFERENCE ──────────────────────────────────────
function extractAccommodations(wb: XLSX.WorkBook) {
  const rows = sheetToRows(wb, 'ACCOMMODATIONS_REFERENCE');
  const items = rows.map((r: any) => ({
    symptom: r['Symptôme / besoin'],
    codes: r['Codes possibles'],
    label: r['Libellé (résumé)'],
    comment: r['Commentaires'],
  }));
  writeJson('accommodations.json', items);
}

// ─── EXPERT_WHATSAPP_RULES ────────────────────────────────────────
function extractExpertRules(wb: XLSX.WorkBook) {
  const rows = sheetToRows(wb, 'EXPERT_WHATSAPP_RULES');
  const rules = rows.map((r: any) => ({
    ruleId: r['RuleID'],
    theme: r['Thème'],
    trigger: r['Déclencheur (données)'],
    context: r['Contexte'],
    recommendation: r['Recommandation (FIN_*)'],
    suggestedDuration: r['Durée suggérée'],
    clinicalJustification: r['Justification (clinique)'],
    regulatoryReference: r['Référence réglementaire'],
    uiNote: r['Note médico-légale / UI'],
  }));
  writeJson('expert-rules.json', rules);
}

// ─── UI_SNIPPETS ──────────────────────────────────────────────────
function extractUiSnippets(wb: XLSX.WorkBook) {
  const rows = sheetToRows(wb, 'UI_SNIPPETS');
  const snippets: Record<string, string> = {};
  for (const r of rows) {
    const row = r as Record<string, unknown>;
    snippets[row['Key'] as string] = row['Texte UI (à afficher dans l\'assistant)'] as string;
  }
  writeJson('ui-snippets.json', snippets);
}

// ─── MAIN ──────────────────────────────────────────────────────────
function main() {
  console.log(`Reading ${EXCEL_PATH}`);
  const wb = XLSX.readFile(EXCEL_PATH);
  console.log(`Sheets found: ${wb.SheetNames.join(', ')}`);

  ensureDir(OUTPUT_DIR);
  console.log(`Output → ${OUTPUT_DIR}\n`);

  extractConfig(wb);
  extractDecisionTree(wb);
  extractRules(wb);
  extractDecisions(wb);
  extractMachineRules(wb);
  extractMachineFacts(wb);
  extractAccommodations(wb);
  extractExpertRules(wb);
  extractUiSnippets(wb);

  console.log('\nExtraction complete.');
}

main();
