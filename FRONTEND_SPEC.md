# FRONTEND IMPLEMENTATION SPEC — Assistant Médical Permis de Conduire

## CONTEXTE

Tu dois créer le frontend d'un outil d'aide à la décision médicale pour les médecins agréés permis de conduire.

L'application a 2 modes :
1. **Mode Chat** — le médecin décrit un cas clinique en texte libre, l'IA analyse et le moteur de règles évalue automatiquement
2. **Mode Questionnaire Guidé** — un arbre de décision pas-à-pas guide le médecin question par question jusqu'à une décision réglementaire

Le backend est un API NestJS déployé. L'URL de base est configurable via variable d'environnement.

---

## STACK RECOMMANDÉ

- Next.js 14+ (App Router)
- TypeScript strict
- Tailwind CSS
- shadcn/ui (composants)
- React Hook Form + Zod (validation)
- Zustand ou React Context (état session guidé)

---

## DESIGN SYSTEM

### Principes UX Médicaux

- **Lisibilité maximale** : police 16px minimum, contraste élevé, espacement généreux
- **Pas de couleurs ambiguës** : vert = apte, rouge = inapte, orange = temporaire/attente, bleu = information
- **Pas de gadgets** : interface sobre, professionnelle, digne d'un outil médico-légal
- **Mobile-first** : les médecins utilisent souvent une tablette en consultation
- **Dark mode** : optionnel mais recommandé (consultations tardives)

### Palette de couleurs des décisions

| Code | Label | Couleur | Icône |
|------|-------|---------|-------|
| `FIN_A` | INAPTE TEMPORAIRE | Rouge `#DC2626` | Cercle barré |
| `FIN_B` | APTE AVEC RESTRICTIONS | Orange `#F59E0B` | Triangle attention |
| `FIN_C` | INAPTE + ÉVAL COG | Rouge foncé `#991B1B` | Cerveau + croix |
| `FIN_D` | APTE TEMPORAIRE SOUS CONDITIONS | Vert `#16A34A` | Check avec horloge |
| `FIN_E` | APTE TEMPORAIRE (attente avis) | Jaune `#EAB308` | Horloge |
| `FIN_F` | BASCULER GROUPE 2 | Bleu `#2563EB` | Flèche redirect |

### Palette de confiance du moteur

| Score | Label | Style |
|-------|-------|-------|
| >= 0.85 | Très haute confiance | Badge plein, bordure forte |
| 0.70–0.84 | Haute confiance | Badge plein |
| 0.50–0.69 | Confiance modérée | Badge outline |
| < 0.50 | Faible confiance | Badge gris, note "à confirmer" |

---

## ARCHITECTURE DES PAGES

```
/                          → Landing / choix du mode
/chat                      → Mode Chat (texte libre)
/questionnaire             → Mode Questionnaire Guidé
/questionnaire/[sessionId] → Session en cours
/result/[sessionId]        → Résultat final (partageable)
```

---

## PAGE 1 — LANDING

Écran d'accueil avec 2 cartes :

**Carte 1 — Mode Chat**
- Icône : bulle de dialogue
- Titre : "Analyse de cas clinique"
- Sous-titre : "Décrivez un cas en texte libre, l'IA analyse et propose une orientation"
- Bouton : "Commencer l'analyse"

**Carte 2 — Mode Questionnaire Guidé**
- Icône : checklist
- Titre : "Évaluation guidée"
- Sous-titre : "Répondez aux questions pas à pas pour une décision réglementaire structurée"
- Sélecteur de pathologie (dropdown) et groupe permis (G1/G2)
- Bouton : "Démarrer l'évaluation"

---

## PAGE 2 — MODE CHAT (`/chat`)

### Layout

```
┌──────────────────────────────────────────────┐
│  Header : "Analyse de cas clinique"          │
├──────────────────────────────────────────────┤
│                                              │
│  Textarea (6 lignes min, auto-expand)        │
│  Placeholder : "Décrivez le cas clinique :   │
│  âge, sexe, pathologie, délai, séquelles,    │
│  traitements, avis spécialisés..."           │
│                                              │
│  [Analyser]  (bouton primaire)               │
│                                              │
├──────────────────────────────────────────────┤
│                                              │
│  === RÉSULTAT (quand disponible) ===         │
│                                              │
│  ┌─ DÉCISION ENGINE (bandeau coloré) ──────┐ │
│  │  FIN_D — APTE TEMPORAIRE SOUS COND.     │ │
│  │  Durée : 6 mois  •  Confiance : 85%     │ │
│  │  [Copier texte CERFA]                    │ │
│  └──────────────────────────────────────────┘ │
│                                              │
│  ┌─ ANALYSE EXPERTE IA ────────────────────┐ │
│  │  Tabs :                                  │ │
│  │  [Analyse] [Réglementation] [Raisonnement]│
│  │  [Actions] [Sources]                     │ │
│  └──────────────────────────────────────────┘ │
│                                              │
│  ┌─ ALERTES & NOTES ──────────────────────┐  │
│  │  ⚠️ Messages UI snippets               │  │
│  │  💡 Notes expert                        │  │
│  └──────────────────────────────────────────┘ │
│                                              │
└──────────────────────────────────────────────┘
```

### API Call

```
POST /rag/ask
Content-Type: application/json

{
  "question": "Homme 55 ans. AVC ischémique il y a 13 mois..."
}
```

### Response Shape — `RagResponse`

```typescript
interface RagResponse {
  // GPT expert analysis
  analysis: {
    case_analysis: string;           // Analyse clinique synthétique
    regulatory_framework: string;    // Cadre réglementaire applicable
    regulatory_points: {             // Points réglementaires structurés
      rule: string;
      group: "léger" | "lourd" | "les deux";
      compatibility: string;         // "Compatibilité temporaire", "Incompatibilité", etc.
      conditions: string | null;
      duration: string | null;
    }[];
    medical_reasoning: string;       // Raisonnement médical expert
    clarification_questions: string[]; // Questions encore nécessaires (peut être vide)
    proposed_orientation: {          // Suggestion GPT
      decision: "apte" | "apte_temporaire" | "apte_avec_restrictions" | "inapte" | "renvoi_commission";
      label: string;
      suggested_duration: string | null;
      restrictions: string | null;
      justification: string;
    };
    important_notes: string[];
    disclaimer: string;
  };

  // Deterministic engine decision (null si pas de pathologie reconnue)
  engine: {
    decision: {
      code: string;        // "FIN_A" | "FIN_B" | "FIN_C" | "FIN_D" | "FIN_E" | "FIN_F"
      label: string;       // "INAPTE TEMPORAIRE", "APTE TEMPORAIRE SOUS CONDITIONS", etc.
      type: string;        // "STOP" | "END" | "ROUTE"
      duration: string;    // "6 mois", "1 an", etc.
      cerfa_text: string;  // Texte médico-légal prêt au copier-coller pour le CERFA
      confidence: number;  // 0.0 à 1.0
    };
    fired_rules: {
      ruleId: string;      // "MR1", "MR5", etc.
      rationale: string;   // Explication de la règle
      confidence: number;
    }[];
    required_actions: {
      type: string;        // "require_specialist", "recommend", "require_evaluation", etc.
      value: string;       // "neurologue", "ophtalmologue", "bilan_neuropsychologique", etc.
    }[];
    accommodations: {      // Aménagements véhicule si applicable
      symptom: string;
      codes: string;       // Codes officiels CERFA
      label: string;
      comment: string;
    }[];
    expert_notes: string[];   // Notes cliniques expertes
    ui_messages: string[];    // Messages d'alerte UI (snippets)
    facts_extracted: Record<string, boolean | null>;  // Faits cliniques extraits automatiquement
  } | null;

  sources: {
    source_number: number;
    chunk_id: string;
    excerpt: string;       // Extrait du texte réglementaire
    similarity: number;    // Score de similarité (0-1)
  }[];

  metadata: {
    chunks_used: number;
    model: string;
    engine_pathology: string | null;  // "avc-g1" si le moteur a tourné
    timestamp: string;
  };
}
```

### Rendu du résultat Chat

**Section 1 — Bandeau de décision (toujours visible en haut)**

Si `engine` est non-null :
- Afficher un bandeau coloré avec la couleur du `engine.decision.code`
- Titre : `engine.decision.label`
- Sous-titre : `Durée : ${engine.decision.duration} • Confiance : ${Math.round(engine.decision.confidence * 100)}%`
- Bouton "Copier texte CERFA" → copie `engine.decision.cerfa_text` dans le presse-papier
- Si `engine.decision.type === "STOP"` → bordure rouge épaisse
- Si `engine.decision.type === "ROUTE"` → bandeau bleu avec message "Évaluation Groupe 2 nécessaire"

Si `engine` est null :
- Afficher uniquement `analysis.proposed_orientation` en bandeau (couleur selon `decision`)

**Section 2 — Tabs d'analyse**

Tab "Analyse du cas" :
- Contenu : `analysis.case_analysis`

Tab "Cadre réglementaire" :
- Contenu : `analysis.regulatory_framework`
- Tableau des `analysis.regulatory_points` :
  | Règle | Groupe | Compatibilité | Conditions | Durée |

Tab "Raisonnement médical" :
- Contenu : `analysis.medical_reasoning`
- Si `analysis.clarification_questions.length > 0` :
  - Bloc jaune "Questions à éclaircir" avec la liste

Tab "Actions requises" (visible uniquement si `engine` non-null) :
- Liste des `engine.required_actions` groupées par type :
  - `require_specialist` → "Avis spécialisé requis : [value]"
  - `recommend` → "Recommandation : [value]"
  - `require_evaluation` → "Évaluation requise : [value]"
  - `route_to_module` → "Basculer vers module : [value]"
- Si `engine.accommodations.length > 0` :
  - Tableau "Aménagements véhicule" : Symptôme | Codes CERFA | Libellé | Commentaire

Tab "Sources réglementaires" :
- Liste des `sources` triées par `similarity` desc
- Pour chaque source : badge de similarité (%) + excerpt tronqué avec "Voir plus"

**Section 3 — Alertes et notes**

- `engine.ui_messages` → cartes d'alerte (icône ⚠️, fond jaune pâle)
- `engine.expert_notes` → cartes d'info (icône 💡, fond bleu pâle)
- `analysis.important_notes` → cartes de note (icône 📌, fond gris)
- `analysis.disclaimer` → footer gris italique

**Section 4 — Faits extraits (collapsible, pour debug/validation)**

Si `engine.facts_extracted` existe :
- Accordéon "Faits cliniques détectés"
- Grille 2 colonnes : fait | valeur
- `true` → pastille verte "Oui"
- `false` → pastille rouge "Non"
- `null` → pastille grise "Non renseigné"

---

## PAGE 3 — MODE QUESTIONNAIRE GUIDÉ (`/questionnaire`)

### Démarrage

```
POST /decision/start
{ "pathology": "avc-g1", "group": "G1" }
```

**Response** : `QuestionResponse`

```typescript
interface QuestionResponse {
  type: "question";
  session: {
    id: string;
    pathology: string;
    groupPermis: "G1" | "G2";
    currentNodeId: string;
    facts: Record<string, boolean | null>;
    answers: {
      nodeId: string;
      answerType: "select" | "yesno" | "checkbox" | "info";
      value: boolean | string | string[];
      precision?: string;
      answeredAt: string;
    }[];
    firedRules: any[];
    status: "in_progress" | "completed" | "referred_to_rag";
    createdAt: string;
  };
  question: {
    nodeId: string;          // "Q0", "Q1", "Q2", ...
    block: string;           // "Bloc 0", "Bloc 1", "Bloc 2", "Bloc 3"
    question: string;        // Texte de la question
    answerType: "select" | "yesno" | "checkbox" | "info";
    options: string[] | null;
    hasPrecisionField: boolean;   // Si true, afficher un champ texte "Précisions"
    rationale: string;            // Note d'aide pour le médecin
  };
  progress: {
    answered: number;
    total: number;
  };
}
```

### Soumission d'une réponse

```
POST /decision/answer
{
  "session": { ... },          // L'objet session complet reçu
  "node_id": "Q2",
  "answer": {
    "type": "yesno",           // Doit correspondre au answerType de la question
    "value": true,             // boolean pour yesno, string pour select, string[] pour checkbox
    "precision": "hémiparésie gauche légère"   // Optionnel, si hasPrecisionField
  }
}
```

**Response** : soit `QuestionResponse` (question suivante), soit `DecisionResponse` (fin) :

```typescript
interface DecisionResponse {
  type: "decision";
  session: { ... };            // Session complétée
  result: {
    decision: {
      code: string;            // "FIN_A" à "FIN_F"
      label: string;
      type: string;            // "STOP" | "END" | "ROUTE"
      duration: string;
      cerfa_text: string;
    };
    clinical_reasoning: string;
    fired_rules: { ruleId: string; rationale: string; confidence: number }[];
    required_actions: { type: string; value: string }[];
    accommodations: { symptom: string; codes: string; label: string; comment: string }[];
    expert_notes: string[];
    ui_messages: string[];
    missing_data: string[];
    facts_summary: Record<string, boolean | null>;
  };
}
```

### Discriminant `type`

Le front DOIT vérifier `response.type` :
- `"question"` → afficher la question suivante
- `"decision"` → afficher l'écran de résultat final

### Layout du questionnaire

```
┌──────────────────────────────────────────────┐
│  Header : "Évaluation AVC — Groupe 1"       │
│  Progress bar : 3/16 questions               │
├──────────────────────────────────────────────┤
│                                              │
│  Bloc 1 : Déficits                           │
│  ─────────────────────                       │
│  Q2 : "Déficit moteur/coordination           │
│        significatif persistant ?"             │
│                                              │
│  ┌──────────┐  ┌──────────┐                  │
│  │   OUI    │  │   NON    │                  │
│  └──────────┘  └──────────┘                  │
│                                              │
│  Précisions (optionnel) :                    │
│  ┌──────────────────────────────────┐        │
│  │                                  │        │
│  └──────────────────────────────────┘        │
│                                              │
│  💡 Note : "Si oui, préciser le type         │
│     de déficit. Si déficit significatif :     │
│     inaptitude."                             │
│                                              │
│  [← Retour]              [Valider →]         │
│                                              │
├──────────────────────────────────────────────┤
│  Historique (collapsible) :                  │
│  ✓ Q0 : ≥ 6 mois                            │
│  ✓ Q1 : AVC ischémique                      │
└──────────────────────────────────────────────┘
```

### Rendu selon `answerType`

**`yesno`** :
- 2 gros boutons côte à côte : "OUI" (vert) / "NON" (rouge)
- Le bouton sélectionné reste enfoncé

**`select`** :
- Radio buttons verticaux, un par option
- Options fournies dans `question.options`

**`checkbox`** :
- Checkboxes verticales, une par option
- Le médecin peut cocher plusieurs items
- Options fournies dans `question.options`

**`info`** :
- Pas d'input — juste un message informatif (Q12 = synthèse finale)
- Bouton "Confirmer" pour passer

**`hasPrecisionField === true`** :
- Ajouter un textarea "Précisions (optionnel)" sous les boutons

### Barre de progression

- Afficher `progress.answered / progress.total`
- Indicateur visuel par bloc :
  - Bloc 0 (Délai/Type) : gris → vert quand terminé
  - Bloc 1 (Déficits) : gris → vert
  - Bloc 2 (Stabilisation) : gris → vert
  - Bloc 3 (Avis/Synthèse) : gris → vert
- Le bloc actuel est en bleu/highlight

### Historique des réponses

- Liste collapsible en bas
- Chaque réponse passée : "✓ Q0 : ≥ 6 mois"
- Possibilité de cliquer pour revenir en arrière (recharger la session sans cette réponse)

---

## PAGE 4 — RÉSULTAT FINAL (pour le mode guidé)

Quand `response.type === "decision"`, afficher :

```
┌──────────────────────────────────────────────┐
│  ╔══════════════════════════════════════════╗ │
│  ║  DÉCISION : APTE TEMPORAIRE             ║ │
│  ║  SOUS CONDITIONS                        ║ │
│  ║                                         ║ │
│  ║  Durée : 6 mois                         ║ │
│  ║  Confiance : 85%                        ║ │
│  ╚══════════════════════════════════════════╝ │
│                                              │
│  ┌─ Texte CERFA ───────────────────────────┐ │
│  │  "Aptitude temporaire accordée sous     │ │
│  │  conditions (stabilité, absence..."     │ │
│  │                      [📋 Copier]        │ │
│  └──────────────────────────────────────────┘ │
│                                              │
│  ┌─ Raisonnement clinique ─────────────────┐ │
│  │  "Décision basée sur la règle MR11..."  │ │
│  └──────────────────────────────────────────┘ │
│                                              │
│  ┌─ Actions requises ─────────────────────┐  │
│  │  □ Avis spécialisé : neurologue        │  │
│  │  □ Recommandation : recontrôle 6 mois  │  │
│  └──────────────────────────────────────────┘ │
│                                              │
│  ┌─ Aménagements véhicule ────────────────┐  │
│  │  Code 78 : Boîte automatique           │  │
│  │  Code 40.11 : Assistance volant        │  │
│  └──────────────────────────────────────────┘ │
│                                              │
│  ┌─ Alertes ──────────────────────────────┐  │
│  │  ⚠️ La signature engage la resp. du MA │  │
│  │  📌 Pas de délai officiel, stabili...  │  │
│  └──────────────────────────────────────────┘ │
│                                              │
│  ┌─ Résumé des faits ────────────────────┐   │
│  │  ✓ Délai > 6 mois                     │   │
│  │  ✗ Déficit moteur                      │   │
│  │  ✗ Trouble visuel                      │   │
│  │  ✗ Trouble cognitif                    │   │
│  │  — Avis neuro : non renseigné          │   │
│  └──────────────────────────────────────────┘ │
│                                              │
│  [📝 Nouvelle évaluation]                    │
│  [💬 Poser une question complémentaire]      │
│                                              │
└──────────────────────────────────────────────┘
```

Le bouton "Poser une question complémentaire" redirige vers `/chat` avec le contexte pré-rempli.

---

## TYPES D'ACTIONS (`required_actions.type`)

| Type | Affichage | Icône |
|------|-----------|-------|
| `require_specialist` | "Avis spécialisé requis : {value}" | 🩺 |
| `recommend` | "Recommandation : {value}" | 💡 |
| `require_evaluation` | "Évaluation requise : {value}" | 📋 |
| `route_to_module` | "Basculer vers module : {value}" | ↗️ |
| `show_snippet` | Afficher le snippet UI correspondant | ℹ️ |
| `consider_accommodations` | "Envisager aménagements véhicule" | 🚗 |
| `require_followup` | "Suivi requis : {value}" | 📅 |
| `maybe` | "À envisager selon contexte : {value}" | ❓ |
| `ask` | "Question à poser : {value}" | ❓ |

---

## CODES DÉCISION — RÉFÉRENCE COMPLÈTE

| Code | Label | Type | Couleur | Description |
|------|-------|------|---------|-------------|
| `FIN_A` | INAPTE TEMPORAIRE | STOP | Rouge | Inaptitude temporaire, reprise après stabilisation + avis spécialisé |
| `FIN_B` | APTE AVEC RESTRICTIONS | END | Orange | Aptitude sous réserve de restrictions/aménagements |
| `FIN_C` | INAPTE + ÉVAL COG | STOP | Rouge foncé | Inaptitude + évaluation neurocognitive/test conduite requise |
| `FIN_D` | APTE TEMPORAIRE SOUS CONDITIONS | END | Vert | Aptitude temporaire avec conditions et suivi |
| `FIN_E` | APTE TEMPORAIRE (attente avis) | END | Jaune | Aptitude temporaire courte en attente d'un avis spécialisé |
| `FIN_F` | BASCULER GROUPE 2 | ROUTE | Bleu | Le cas relève du groupe lourd (professionnel) |

Type `STOP` = le processus est interrompu à cette question — pas de suite possible sans correction.
Type `END` = le processus aboutit normalement à cette décision.
Type `ROUTE` = redirection vers un autre module/groupe.

---

## BLOCS DU QUESTIONNAIRE

| Bloc | Thème | Questions | Description |
|------|-------|-----------|-------------|
| Bloc 0 | Délai et type | Q0, Q1 | Délai post-AVC et type d'événement |
| Bloc 1 | Déficits | Q2–Q5 | Moteur, visuel, cognitif, langage |
| Bloc 2 | Stabilisation | Q6–Q9 | Évolution, rééducation, épilepsie, traitements |
| Bloc 3 | Avis et synthèse | Q10–Q12 | Avis neuro, examens, synthèse finale |

---

## STATUTS DE SESSION

| Status | Signification |
|--------|---------------|
| `in_progress` | Évaluation en cours, questions restantes |
| `completed` | Décision rendue |
| `referred_to_rag` | Renvoyé vers le chat IA pour analyse complémentaire |

---

## FLOW COMPLET — DIAGRAMME

```
┌─────────────┐
│  LANDING    │
│  Choix mode │
└─────┬───────┘
      │
  ┌───┴──────────────────┐
  │                      │
  ▼                      ▼
┌─────────┐    ┌───────────────┐
│  CHAT   │    │ QUESTIONNAIRE │
│         │    │ /decision/    │
│ POST    │    │ start         │
│ /rag/   │    └───────┬───────┘
│ ask     │            │
│         │            ▼
│         │    ┌───────────────┐
│         │    │ Boucle :      │
│         │    │ POST /decision│◄─────────┐
│         │    │ /answer       │          │
│         │    └───────┬───────┘          │
│         │            │                  │
│         │     type === "question"       │
│         │        ?───YES────────────────┘
│         │        │
│         │        NO (type === "decision")
│         │        │
│         │        ▼
│         │    ┌───────────────┐
│         │    │ RÉSULTAT      │
│  ┌──────┘    │ GUIDÉ         │
│  │           └───────┬───────┘
│  ▼                   │
│ ┌────────────────┐   │ "Question complémentaire"
│ │ RÉSULTAT CHAT  │   │
│ │ (analyse +     │◄──┘
│ │  engine)       │
│ └────────────────┘
```

---

## NOTES D'IMPLÉMENTATION

1. **Le champ `session` est STATELESS côté serveur** — le front doit renvoyer l'objet `session` complet à chaque appel `/decision/answer`. Stocker en state React.

2. **Le champ `engine` dans la réponse `/rag/ask` peut être `null`** — si le moteur ne reconnaît pas la pathologie. Le front doit gérer ce cas (afficher uniquement l'analyse GPT).

3. **Les `facts_extracted` / `facts_summary`** sont identiques en structure — un `Record<string, boolean | null>`. Afficher en grille avec pastilles colorées.

4. **Le texte CERFA** (`cerfa_text`) est le texte médico-légal que le médecin copie-colle dans le formulaire officiel. Le bouton "Copier" doit utiliser `navigator.clipboard.writeText()`.

5. **Les `sources`** sont les extraits de l'arrêté du 28 mars 2022 utilisés par l'IA. Afficher la similarité en pourcentage.

6. **Le `disclaimer`** doit TOUJOURS être visible en bas de tout résultat.

7. **Loading states** : l'appel `/rag/ask` prend 10-30 secondes (2 appels GPT + vector search). Afficher un skeleton avec les étapes :
   - "Recherche dans la réglementation..."
   - "Extraction des faits cliniques..."
   - "Analyse experte en cours..."
   - "Évaluation par le moteur de règles..."

8. **Responsive** : le questionnaire doit fonctionner en 1 colonne sur mobile/tablette.
