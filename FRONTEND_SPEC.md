# FRONTEND IMPLEMENTATION SPEC — Assistant Medical Permis de Conduire

## CONTEXTE

Tu dois creer le frontend d'un outil d'aide a la decision medicale pour les medecins agrees permis de conduire.

L'application a 2 modes :
1. **Mode Chat conversationnel** — le medecin decrit un cas clinique en texte libre, dialogue avec l'IA pour affiner, et obtient une decision reglementaire enrichie par un moteur de regles deterministe
2. **Mode Questionnaire Guide** — un arbre de decision pas-a-pas guide le medecin question par question jusqu'a une decision reglementaire

Le backend est un API NestJS deploye. L'URL de base est configurable via variable d'environnement.

---

## STACK RECOMMANDE

- Next.js 14+ (App Router)
- TypeScript strict
- Tailwind CSS
- shadcn/ui (composants)
- React Hook Form + Zod (validation)
- Zustand ou React Context (etat conversation + session guidee)

---

## DESIGN SYSTEM

### Principes UX Medicaux

- **Lisibilite maximale** : police 16px minimum, contraste eleve, espacement genereux
- **Pas de couleurs ambigues** : vert = apte, rouge = inapte, orange = temporaire/attente, bleu = information
- **Pas de gadgets** : interface sobre, professionnelle, digne d'un outil medico-legal
- **Mobile-first** : les medecins utilisent souvent une tablette en consultation
- **Dark mode** : optionnel mais recommande (consultations tardives)

### Palette de couleurs des decisions

| Code | Label | Couleur | Icone |
|------|-------|---------|-------|
| `FIN_A` | INAPTE TEMPORAIRE | Rouge `#DC2626` | Cercle barre |
| `FIN_B` | APTE AVEC RESTRICTIONS | Orange `#F59E0B` | Triangle attention |
| `FIN_C` | INAPTE + EVAL COG | Rouge fonce `#991B1B` | Cerveau + croix |
| `FIN_D` | APTE TEMPORAIRE SOUS CONDITIONS | Vert `#16A34A` | Check avec horloge |
| `FIN_E` | APTE TEMPORAIRE (attente avis) | Jaune `#EAB308` | Horloge |
| `FIN_F` | BASCULER GROUPE 2 | Bleu `#2563EB` | Fleche redirect |

### Palette de confiance du moteur

| Score | Label | Style |
|-------|-------|-------|
| >= 0.85 | Tres haute confiance | Badge plein, bordure forte |
| 0.70-0.84 | Haute confiance | Badge plein |
| 0.50-0.69 | Confiance moderee | Badge outline |
| < 0.50 | Faible confiance | Badge gris, note "a confirmer" |

---

## ARCHITECTURE DES PAGES

```
/                          -> Landing / choix du mode
/chat                      -> Mode Chat conversationnel
/questionnaire             -> Mode Questionnaire Guide
/questionnaire/[sessionId] -> Session en cours
/result/[sessionId]        -> Resultat final (partageable)
```

---

## PAGE 1 — LANDING

Ecran d'accueil avec 2 cartes :

**Carte 1 — Mode Chat**
- Icone : bulle de dialogue
- Titre : "Analyse de cas clinique"
- Sous-titre : "Decrivez un cas en texte libre, dialoguez avec l'IA pour affiner l'analyse"
- Bouton : "Commencer l'analyse"

**Carte 2 — Mode Questionnaire Guide**
- Icone : checklist
- Titre : "Evaluation guidee"
- Sous-titre : "Repondez aux questions pas a pas pour une decision reglementaire structuree"
- Selecteur de pathologie (dropdown) et groupe permis (G1/G2)
- Bouton : "Demarrer l'evaluation"

---

## PAGE 2 — MODE CHAT CONVERSATIONNEL (`/chat`)

### CONCEPT CLE

Le mode chat est une **conversation multi-tours**. Le medecin peut :
1. Decrire un cas clinique initial
2. Recevoir une analyse complete + decision engine
3. Poser des questions de suivi ("Et s'il est conducteur de taxi ?", "L'avis neuro est favorable, ca change quoi ?")
4. L'IA repond en tenant compte de TOUT l'historique
5. Le moteur de regles re-evalue a chaque tour avec les faits cumules

Le front gere un objet `conversation` recu du serveur qu'il renvoie a chaque appel.

### Layout

```
+----------------------------------------------+
|  Header : "Analyse de cas clinique"          |
+----------------------------------------------+
|                                              |
|  +-- Fil de conversation -------------------+|
|  |                                          ||
|  |  [MEDECIN] Tour 1                       ||
|  |  "Homme 55 ans. AVC ischemique il y a   ||
|  |   13 mois. Sequelle : hypoesthesie..."  ||
|  |                                          ||
|  |  [IA] Tour 1                             ||
|  |  +- DECISION ENGINE (bandeau colore) -+  ||
|  |  | FIN_D - APTE TEMPORAIRE SOUS COND. |  ||
|  |  | Duree: 6 mois  -  Confiance: 85%   |  ||
|  |  | [Copier texte CERFA]               |  ||
|  |  +------------------------------------+  ||
|  |                                          ||
|  |  +- ANALYSE EXPERTE ------------------+  ||
|  |  | Tabs: [Analyse] [Reglementation]   |  ||
|  |  |       [Raisonnement] [Actions]     |  ||
|  |  |       [Sources]                    |  ||
|  |  +------------------------------------+  ||
|  |                                          ||
|  |  +- ALERTES & NOTES ------------------+  ||
|  |  | Messages, notes expert, etc.       |  ||
|  |  +------------------------------------+  ||
|  |                                          ||
|  |  ----------------------------------------||
|  |                                          ||
|  |  [MEDECIN] Tour 2                       ||
|  |  "Il est aussi conducteur de taxi.      ||
|  |   Ca change quelque chose ?"            ||
|  |                                          ||
|  |  [IA] Tour 2                             ||
|  |  +- DECISION ENGINE (MISE A JOUR) ----+  ||
|  |  | FIN_A - INAPTE TEMPORAIRE          |  ||
|  |  | Groupe lourd requis pour taxi       |  ||
|  |  +------------------------------------+  ||
|  |  (analyse mise a jour avec contexte    | ||
|  |   taxi = groupe 2...)                  | ||
|  |                                          ||
|  +------------------------------------------+|
|                                              |
|  +-- Zone de saisie -----------------------+ |
|  | Textarea : "Ajouter des precisions,     | |
|  | poser une question de suivi..."         | |
|  |                          [Envoyer ->]   | |
|  +------------------------------------------+|
|                                              |
+----------------------------------------------+
```

### API — Endpoint unique : `POST /rag/ask`

**Tour 1 — Premier message (pas de conversation precedente)**

```json
{
  "question": "Homme 55 ans. AVC ischemique il y a 13 mois. Sequelle : hypoesthesie isolee de la main gauche."
}
```

**Tour 2+ — Message de suivi (avec conversation)**

```json
{
  "question": "Il est aussi conducteur de taxi. Ca change quelque chose ?",
  "conversation": {
    "id": "a1b2c3d4-...",
    "history": [
      { "role": "user", "content": "Homme 55 ans...", "timestamp": "2026-03-03T..." },
      { "role": "assistant", "content": "Le patient presente...", "timestamp": "2026-03-03T..." }
    ],
    "turn": 1,
    "cumulative_context": "Homme 55 ans. AVC ischemique il y a 13 mois...",
    "cumulative_facts": {
      "event.within_6_months": false,
      "neuro.major_motor_deficit": false,
      ...
    }
  }
}
```

REGLE CRITIQUE : Le front doit stocker `response.conversation` et le renvoyer tel quel dans l'appel suivant. C'est cet objet qui maintient l'etat de la conversation.

### Response Shape — `RagResponse`

```typescript
interface RagResponse {
  // --- GPT expert analysis ---
  analysis: {
    case_analysis: string;           // Analyse clinique synthetique
    regulatory_framework: string;    // Cadre reglementaire applicable
    regulatory_points: {             // Points reglementaires structures
      rule: string;
      group: "leger" | "lourd" | "les deux";
      compatibility: string;
      conditions: string | null;
      duration: string | null;
    }[];
    medical_reasoning: string;       // Raisonnement medical expert
    clarification_questions: string[]; // Questions encore necessaires (peut etre vide)
    proposed_orientation: {
      decision: "apte" | "apte_temporaire" | "apte_avec_restrictions" | "inapte" | "renvoi_commission";
      label: string;
      suggested_duration: string | null;
      restrictions: string | null;
      justification: string;
    };
    important_notes: string[];
    disclaimer: string;
  };

  // --- Deterministic engine decision (null si pathologie non reconnue) ---
  engine: {
    decision: {
      code: string;        // "FIN_A" | "FIN_B" | "FIN_C" | "FIN_D" | "FIN_E" | "FIN_F"
      label: string;
      type: string;        // "STOP" | "END" | "ROUTE"
      duration: string;
      cerfa_text: string;  // Texte medico-legal pret au copier-coller pour le CERFA
      confidence: number;  // 0.0 a 1.0
    };
    fired_rules: {
      ruleId: string;
      rationale: string;
      confidence: number;
    }[];
    required_actions: {
      type: string;        // Voir table TYPES D'ACTIONS
      value: string;
    }[];
    accommodations: {
      symptom: string;
      codes: string;       // Codes officiels CERFA
      label: string;
      comment: string;
    }[];
    expert_notes: string[];
    ui_messages: string[];
    facts_extracted: Record<string, boolean | null>;
  } | null;

  // --- Conversation state (A RENVOYER AU PROCHAIN APPEL) ---
  conversation: {
    id: string;               // UUID stable pour toute la conversation
    history: {
      role: "user" | "assistant";
      content: string;
      timestamp: string;      // ISO 8601
    }[];
    turn: number;             // Numero du tour (1, 2, 3...)
    cumulative_context: string;  // Concatenation de tous les messages user
    cumulative_facts: Record<string, boolean | null> | null;  // Faits accumules
  };

  // --- Regulatory text sources used ---
  sources: {
    source_number: number;
    chunk_id: string;
    excerpt: string;
    similarity: number;       // 0-1
  }[];

  // --- Metadata ---
  metadata: {
    chunks_used: number;
    model: string;
    engine_pathology: string | null;  // "avc-g1" si le moteur a tourne
    timestamp: string;
  };
}
```

### Gestion du state conversation cote front

```typescript
// State React (Zustand ou useState)
interface ChatState {
  messages: ChatMessage[];         // Fil de conversation affiche
  conversation: ConversationState | null;  // Objet a renvoyer au serveur
  isLoading: boolean;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;                 // Texte affiche dans la bulle user
  response?: RagResponse;          // Response complete pour les bulles assistant
  timestamp: string;
}

// Flow :
// 1. User tape un message
// 2. Ajouter { role: 'user', content: message } au fil
// 3. POST /rag/ask avec { question: message, conversation: state.conversation }
// 4. Recevoir la response
// 5. Ajouter { role: 'assistant', response: response } au fil
// 6. Mettre a jour state.conversation = response.conversation
// 7. Le prochain message renverra automatiquement le bon conversation
```

### Rendu d'un tour assistant dans le fil de conversation

Chaque reponse de l'IA dans le fil est un bloc complet :

**Section 1 — Bandeau de decision (toujours visible)**

Si `engine` est non-null :
- Bandeau colore selon `engine.decision.code` (voir palette)
- Titre : `engine.decision.label`
- Sous-titre : `Duree : ${duration} | Confiance : ${confidence}%`
- Bouton "Copier texte CERFA" -> `navigator.clipboard.writeText(cerfa_text)`
- Si `engine.decision.type === "STOP"` -> bordure rouge epaisse
- Si `engine.decision.type === "ROUTE"` -> bandeau bleu "Evaluation Groupe 2 necessaire"

Si `engine` est null :
- Afficher `analysis.proposed_orientation` en bandeau (couleur selon decision)

IMPORTANT : Si la decision CHANGE entre 2 tours (ex: tour 1 = FIN_D, tour 2 = FIN_A), afficher un badge "Decision mise a jour" sur le bandeau du tour 2 pour que le medecin voie clairement le changement.

**Section 2 — Tabs d'analyse (collapsible par defaut a partir du tour 2)**

Au tour 1 : tabs depliees par defaut.
Au tour 2+ : tabs repliees par defaut (le medecin clique pour voir le detail). Seul le bandeau de decision et le raisonnement medical sont visibles directement.

Tab "Analyse du cas" :
- Contenu : `analysis.case_analysis`

Tab "Cadre reglementaire" :
- Contenu : `analysis.regulatory_framework`
- Tableau des `analysis.regulatory_points` :
  | Regle | Groupe | Compatibilite | Conditions | Duree |

Tab "Raisonnement medical" :
- Contenu : `analysis.medical_reasoning`
- Si `analysis.clarification_questions.length > 0` :
  - Bloc jaune "Questions a eclaircir" avec la liste
  - Bouton "Repondre" a cote de chaque question -> pre-remplit la zone de saisie

Tab "Actions requises" (visible uniquement si `engine` non-null) :
- Liste des `engine.required_actions` groupees par type
- Si `engine.accommodations.length > 0` :
  - Tableau "Amenagements vehicule" : Symptome | Codes CERFA | Libelle | Commentaire

Tab "Sources reglementaires" :
- Liste des `sources` triees par `similarity` desc
- Badge de similarite (%) + excerpt tronque avec "Voir plus"

**Section 3 — Alertes et notes**

- `engine.ui_messages` -> cartes d'alerte (fond jaune pale)
- `engine.expert_notes` -> cartes d'info (fond bleu pale)
- `analysis.important_notes` -> cartes de note (fond gris)
- `analysis.disclaimer` -> footer gris italique

**Section 4 — Faits cliniques (accordeon, ferme par defaut)**

Si `engine.facts_extracted` existe :
- Accordeon "Faits cliniques detectes"
- Grille 2 colonnes : fait | valeur
- `true` -> pastille verte "Oui"
- `false` -> pastille rouge "Non"
- `null` -> pastille grise "Non renseigne"
- Si un fait passe de null a true/false entre 2 tours -> highlight jaune "Nouveau"

### Zone de saisie (toujours visible en bas)

```
+--------------------------------------------------+
|  Textarea auto-expand                            |
|  Placeholder (tour 1) : "Decrivez le cas        |
|    clinique : age, sexe, pathologie, delai,      |
|    sequelles, traitements, avis specialises..."  |
|  Placeholder (tour 2+) : "Ajoutez des           |
|    precisions, repondez aux questions de         |
|    l'IA, ou posez une question de suivi..."      |
|                                                  |
|  [Envoyer ->]                                    |
+--------------------------------------------------+
```

- Le bouton "Envoyer" est disabled pendant le loading
- Raccourci clavier : Ctrl+Enter pour envoyer

### Suggestions de suivi (optionnel, UX bonus)

Apres chaque reponse de l'IA, afficher des boutons de suggestion :
- Si `analysis.clarification_questions` non vide : un bouton par question
- Boutons generiques : "Preciser le traitement", "Ajouter un avis specialise", "Changer le groupe de permis"
- Cliquer sur un bouton pre-remplit la zone de saisie

### Loading states

L'appel prend 10-30 secondes. Afficher dans la bulle assistant en cours :
1. "Recherche dans la reglementation..." (0-3s)
2. "Extraction des faits cliniques..." (3-8s)
3. "Analyse experte en cours..." (8-20s)
4. "Evaluation par le moteur de regles..." (20-30s)

Utiliser un skeleton animate pour le bandeau de decision + les tabs.

### Bouton "Nouvelle conversation"

- Visible dans le header
- Reset : vide le fil, efface le state conversation
- Demander confirmation si conversation en cours

---

## PAGE 3 — MODE QUESTIONNAIRE GUIDE (`/questionnaire`)

### Demarrage

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
    hasPrecisionField: boolean;
    rationale: string;       // Note d'aide pour le medecin
  };
  progress: {
    answered: number;
    total: number;
  };
}
```

### Soumission d'une reponse

```
POST /decision/answer
{
  "session": { ... },          // L'objet session complet recu
  "node_id": "Q2",
  "answer": {
    "type": "yesno",
    "value": true,
    "precision": "hemiparesie gauche legere"
  }
}
```

**Response** : soit `QuestionResponse` (question suivante), soit `DecisionResponse` (fin).

```typescript
interface DecisionResponse {
  type: "decision";
  session: { ... };
  result: {
    decision: {
      code: string;
      label: string;
      type: string;        // "STOP" | "END" | "ROUTE"
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

Le front DOIT verifier `response.type` :
- `"question"` -> afficher la question suivante
- `"decision"` -> afficher l'ecran de resultat final

### Layout du questionnaire

```
+----------------------------------------------+
|  Header : "Evaluation AVC - Groupe 1"        |
|  Progress bar : 3/16 questions               |
+----------------------------------------------+
|                                              |
|  Bloc 1 : Deficits                           |
|  ----------------------                      |
|  Q2 : "Deficit moteur/coordination           |
|        significatif persistant ?"            |
|                                              |
|  +----------+  +----------+                  |
|  |   OUI    |  |   NON    |                  |
|  +----------+  +----------+                  |
|                                              |
|  Precisions (optionnel) :                    |
|  +----------------------------------+        |
|  |                                  |        |
|  +----------------------------------+        |
|                                              |
|  Note : "Si oui, preciser le type de        |
|  deficit. Si deficit significatif :          |
|  inaptitude."                                |
|                                              |
|  [<- Retour]              [Valider ->]       |
|                                              |
+----------------------------------------------+
|  Historique (collapsible) :                  |
|  V Q0 : >= 6 mois                           |
|  V Q1 : AVC ischemique                      |
+----------------------------------------------+
```

### Rendu selon `answerType`

**`yesno`** :
- 2 gros boutons cote a cote : "OUI" / "NON"
- Le bouton selectionne reste enfonce (toggle)

**`select`** :
- Radio buttons verticaux, un par option
- Options fournies dans `question.options`

**`checkbox`** :
- Checkboxes verticales, une par option
- Plusieurs selections possibles
- Options fournies dans `question.options`

**`info`** :
- Pas d'input — message informatif (Q12 = synthese finale)
- Bouton "Confirmer" pour passer

**`hasPrecisionField === true`** :
- Textarea "Precisions (optionnel)" sous les boutons

### Barre de progression

- Afficher `progress.answered / progress.total`
- Indicateur visuel par bloc :
  - Bloc 0 (Delai/Type) : gris -> vert quand termine
  - Bloc 1 (Deficits) : gris -> vert
  - Bloc 2 (Stabilisation) : gris -> vert
  - Bloc 3 (Avis/Synthese) : gris -> vert
- Le bloc actuel est en bleu/highlight

### Historique des reponses

- Liste collapsible en bas
- Chaque reponse passee : "V Q0 : >= 6 mois"
- Possibilite de cliquer pour revenir en arriere

---

## PAGE 4 — RESULTAT FINAL (mode guide)

Quand `response.type === "decision"`, afficher le resultat complet avec les memes composants que le mode chat :
- Bandeau de decision colore
- Texte CERFA avec bouton copier
- Raisonnement clinique
- Actions requises
- Amenagements vehicule
- Alertes et notes
- Resume des faits

En plus, 2 boutons en bas :
- "Nouvelle evaluation" -> retour a /questionnaire
- "Poser une question complementaire" -> redirige vers `/chat` avec le contexte pre-rempli dans `conversation.cumulative_context`

---

## TYPES D'ACTIONS (`required_actions.type`)

| Type | Affichage | Icone |
|------|-----------|-------|
| `require_specialist` | "Avis specialise requis : {value}" | Stethoscope |
| `recommend` | "Recommandation : {value}" | Ampoule |
| `require_evaluation` | "Evaluation requise : {value}" | Clipboard |
| `route_to_module` | "Basculer vers module : {value}" | Fleche |
| `show_snippet` | Afficher le snippet UI correspondant | Info |
| `consider_accommodations` | "Envisager amenagements vehicule" | Voiture |
| `require_followup` | "Suivi requis : {value}" | Calendrier |
| `maybe` | "A envisager selon contexte : {value}" | Point interrogation |
| `ask` | "Question a poser : {value}" | Point interrogation |

---

## CODES DECISION — REFERENCE COMPLETE

| Code | Label | Type | Couleur | Description |
|------|-------|------|---------|-------------|
| `FIN_A` | INAPTE TEMPORAIRE | STOP | Rouge | Inaptitude temporaire, reprise apres stabilisation + avis specialise |
| `FIN_B` | APTE AVEC RESTRICTIONS | END | Orange | Aptitude sous reserve de restrictions/amenagements |
| `FIN_C` | INAPTE + EVAL COG | STOP | Rouge fonce | Inaptitude + evaluation neurocognitive/test conduite requise |
| `FIN_D` | APTE TEMPORAIRE SOUS CONDITIONS | END | Vert | Aptitude temporaire avec conditions et suivi |
| `FIN_E` | APTE TEMPORAIRE (attente avis) | END | Jaune | Aptitude temporaire courte en attente d'un avis specialise |
| `FIN_F` | BASCULER GROUPE 2 | ROUTE | Bleu | Le cas releve du groupe lourd (professionnel) |

Type `STOP` = processus interrompu — pas de suite sans correction.
Type `END` = processus aboutit normalement.
Type `ROUTE` = redirection vers un autre module/groupe.

---

## BLOCS DU QUESTIONNAIRE

| Bloc | Theme | Questions | Description |
|------|-------|-----------|-------------|
| Bloc 0 | Delai et type | Q0, Q1 | Delai post-AVC et type d'evenement |
| Bloc 1 | Deficits | Q2-Q5 | Moteur, visuel, cognitif, langage |
| Bloc 2 | Stabilisation | Q6-Q9 | Evolution, reeducation, epilepsie, traitements |
| Bloc 3 | Avis et synthese | Q10-Q12 | Avis neuro, examens, synthese finale |

---

## STATUTS DE SESSION (mode guide)

| Status | Signification |
|--------|---------------|
| `in_progress` | Evaluation en cours, questions restantes |
| `completed` | Decision rendue |
| `referred_to_rag` | Renvoye vers le chat IA pour analyse complementaire |

---

## FLOW COMPLET

```
+-------------+
|  LANDING    |
|  Choix mode |
+------+------+
       |
   +---+-------------------+
   |                       |
   v                       v
+-----------+    +-----------------+
| CHAT      |    | QUESTIONNAIRE   |
| /rag/ask  |    | /decision/start |
|           |    +--------+--------+
| Tour 1    |             |
| Tour 2    |             v
| Tour 3    |    +-----------------+
| ...       |    | Boucle :        |
|           |    | /decision/answer|<--------+
|           |    +--------+--------+         |
|           |             |                  |
|           |      type === "question"       |
|           |         ?---YES----------------+
|           |         |
|           |         NO (type === "decision")
|           |         |
|           |         v
|           |    +-----------------+
|           |    | RESULTAT GUIDE  |
|   <-------+    +--------+--------+
|           |             |
|  (question              | "Question complementaire"
| complemen-              |
|   taire)                |
+-----------+<------------+
```

---

## NOTES D'IMPLEMENTATION

1. **Conversation STATELESS cote serveur** — le front stocke `response.conversation` et le renvoie a chaque appel `/rag/ask`. C'est l'equivalent d'un JWT pour la conversation.

2. **Le champ `engine` peut etre `null`** — gerer ce cas (afficher uniquement l'analyse GPT).

3. **La decision peut CHANGER entre 2 tours** — si le medecin ajoute une info (ex: "il est taxi"), le moteur re-evalue avec les nouveaux faits. Afficher clairement le changement.

4. **Les `cumulative_facts` evoluent** — a chaque tour, les faits sont fusionnes (nouveau > ancien). Un fait qui etait `null` au tour 1 peut devenir `true` au tour 2 si le medecin donne l'info. Mettre en evidence ces changements.

5. **Le texte CERFA** (`cerfa_text`) est le texte medico-legal que le medecin copie-colle dans le formulaire officiel. Le bouton "Copier" doit utiliser `navigator.clipboard.writeText()`.

6. **Le `disclaimer`** doit TOUJOURS etre visible en bas de tout resultat.

7. **Loading states** : l'appel `/rag/ask` prend 10-30 secondes (2 appels GPT + vector search). Afficher un skeleton anime dans la bulle assistant avec les etapes.

8. **Responsive** : tout doit fonctionner en 1 colonne sur mobile/tablette.

9. **Scroll automatique** : quand une nouvelle reponse arrive, scroller vers le bandeau de decision du dernier tour.

10. **Pas de `session` cote serveur pour le chat** — tout est dans `conversation`. Pour le questionnaire guide, `session` est l'equivalent — le front le stocke et le renvoie.
