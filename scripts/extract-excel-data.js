/**
 * Extracts all sheets from the AVC decision-tree Excel workbook
 * and writes them as typed JSON config files.
 *
 * Usage:  node scripts/extract-excel-data.js
 */

const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const EXCEL_PATH = path.resolve(
  __dirname,
  '../Arbre_AVC_G1_Tableau_IA_AUTO_DECISION_AMENAGEMENTS_v3_MACHINE_RULES.xlsx',
);
const OUTPUT_DIR = path.resolve(__dirname, '../src/decision-engine/data/avc-g1');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function writeJson(filename, data) {
  const filepath = path.join(OUTPUT_DIR, filename);
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2), 'utf-8');
  console.log(`  done ${filename}`);
}

function sheetToRows(wb, name) {
  const ws = wb.Sheets[name];
  if (!ws) throw new Error(`Sheet "${name}" not found`);
  return XLSX.utils.sheet_to_json(ws, { defval: null });
}

function tryParseJson(val) {
  if (typeof val !== 'string') return val;
  const trimmed = val.trim();
  if ((trimmed.startsWith('[') && trimmed.endsWith(']')) ||
      (trimmed.startsWith('{') && trimmed.endsWith('}'))) {
    try { return JSON.parse(trimmed); } catch { return val; }
  }
  return val;
}

function extractConfig(wb) {
  const rows = sheetToRows(wb, 'CONFIG');
  const config = {};
  for (const r of rows) {
    config[r['Key']] = {
      value: r['Value'],
      type: r['Type'],
      notes: r['Allowed Values / Notes'],
    };
  }
  writeJson('config.json', config);
}

function extractDecisionTree(wb) {
  const rows = sheetToRows(wb, 'DECISION_TREE');
  const nodes = rows.map((r) => ({
    nodeId: r['NodeID'],
    block: r['Block'],
    question: r['Question (UI)'],
    answerType: r['Answer Type'],
    options: r['Options (if select/checkbox)']
      ? String(r['Options (if select/checkbox)']).split(';').map(s => s.trim())
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

function extractRules(wb) {
  const rows = sheetToRows(wb, 'RULES');
  const rules = rows.map((r) => ({
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

function extractDecisions(wb) {
  const rows = sheetToRows(wb, 'DECISIONS');
  const decisions = rows.map((r) => ({
    code: r['Decision Code'],
    label: r['Label'],
    type: r['Type'],
    defaultDuration: r['Default Duration'],
    uiTemplate: r['UI Output (template)'],
    medicoLegalText: r['Copy/Paste text (medico-legal)'],
  }));
  writeJson('decisions.json', decisions);
}

function extractMachineRules(wb) {
  const rows = sheetToRows(wb, 'MACHINE_RULES');
  const rules = rows.map((r) => ({
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
      ? String(r['Snippet Keys']).split(';').map(s => s.trim())
      : [],
    confidence: r['Confidence'] ?? 0.5,
  }));
  writeJson('machine-rules.json', rules);
}

function extractMachineFacts(wb) {
  const rows = sheetToRows(wb, 'MACHINE_FACTS');
  const facts = rows.map((r) => ({
    key: r['Fact key'],
    type: r['Type'],
    description: r['Description'],
    sourceNode: r['Source (node/field)'],
    allowedValues: r['Allowed values / notes'],
  }));
  writeJson('machine-facts.json', facts);
}

function extractAccommodations(wb) {
  const rows = sheetToRows(wb, 'ACCOMMODATIONS_REFERENCE');
  const items = rows.map((r) => ({
    symptom: r['Symptôme / besoin'],
    codes: r['Codes possibles'],
    label: r['Libellé (résumé)'],
    comment: r['Commentaires'],
  }));
  writeJson('accommodations.json', items);
}

function extractExpertRules(wb) {
  const rows = sheetToRows(wb, 'EXPERT_WHATSAPP_RULES');
  const rules = rows.map((r) => ({
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

function extractUiSnippets(wb) {
  const rows = sheetToRows(wb, 'UI_SNIPPETS');
  const snippets = {};
  for (const r of rows) {
    const key = r['Key'];
    // The header uses a curly apostrophe (U+2019) — match by finding the text column
    const textKey = Object.keys(r).find(k => k.startsWith('Texte UI'));
    const text = textKey ? r[textKey] : null;
    if (key && text) snippets[key] = text;
  }
  writeJson('ui-snippets.json', snippets);
}

function main() {
  console.log(`Reading ${EXCEL_PATH}`);
  const wb = XLSX.readFile(EXCEL_PATH);
  console.log(`Sheets: ${wb.SheetNames.join(', ')}`);

  ensureDir(OUTPUT_DIR);
  console.log(`Output -> ${OUTPUT_DIR}\n`);

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
