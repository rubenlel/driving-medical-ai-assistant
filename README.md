# Driving Medical AI Assistant

Backend RAG (Retrieval-Augmented Generation) pour l'aide à la décision médicale en matière d'aptitude à la conduite, basé sur l'Arrêté du 28 mars 2022.

## Architecture

```
src/
  app.module.ts              # Module racine
  main.ts                    # Point d'entrée
  config/
    env.config.ts            # Chargement des variables d'environnement
  rag/
    rag.module.ts            # Module RAG
    rag.controller.ts        # POST /rag/ask
    rag.service.ts           # Orchestration du pipeline RAG
    embedding.service.ts     # Génération d'embeddings (OpenAI)
    vector-search.service.ts # Recherche vectorielle (Supabase pgvector)
    prompt-builder.service.ts# Construction des prompts
    dto/
      ask-question.dto.ts    # Validation de la requête
    interfaces/
      rag-response.interface.ts # Types de réponse
  supabase/
    supabase.module.ts       # Module Supabase (global)
    supabase.service.ts      # Client Supabase
```

## Prérequis

- Node.js >= 18
- Compte OpenAI avec clé API
- Projet Supabase avec l'extension `pgvector` activée

## Installation

```bash
npm install
```

## Configuration

Copier le fichier d'exemple et renseigner les valeurs :

```bash
cp .env.example .env
```

Variables requises :

| Variable | Description |
|---|---|
| `OPENAI_API_KEY` | Clé API OpenAI |
| `SUPABASE_URL` | URL du projet Supabase |
| `SUPABASE_ANON_KEY` | Clé anonyme Supabase |
| `PORT` | Port du serveur (défaut: 3000) |

## Mise en place de la base de données

1. Exécuter le script SQL dans l'éditeur SQL de Supabase :

```bash
# Copier le contenu de supabase/migration.sql dans l'éditeur SQL de Supabase
```

2. Ingérer le texte réglementaire :

```bash
# Placer le texte de l'arrêté dans scripts/regulation-text.txt
npx ts-node scripts/ingest-regulation.ts
```

## Lancement

```bash
# Développement (watch mode)
npm run start:dev

# Production
npm run build
npm run start:prod
```

## Utilisation de l'API

### POST /rag/ask

Poser une question sur la réglementation médicale du permis de conduire.

**Requête :**

```json
{
  "question": "Un patient épileptique peut-il conduire un véhicule léger ?"
}
```

**Réponse :**

```json
{
  "answer": {
    "summary": "Un patient épileptique peut conduire sous conditions...",
    "regulatory_points": [
      "Incompatibilité temporaire pendant la phase active",
      "Compatibilité après 12 mois sans crise..."
    ],
    "analysis": "Selon l'arrêté du 28 mars 2022, l'épilepsie...",
    "disclaimer": "Cet avis est généré par une IA..."
  },
  "metadata": {
    "chunks_used": 5,
    "model": "gpt-4o-mini",
    "timestamp": "2026-02-25T18:00:00.000Z"
  }
}
```

## Pipeline RAG

```
Question utilisateur
       │
       ▼
  Embedding (text-embedding-3-small)
       │
       ▼
  Recherche vectorielle (pgvector / Supabase RPC)
       │
       ▼
  Construction du prompt (contexte réglementaire + question)
       │
       ▼
  Chat Completion (gpt-4o-mini, temperature=0.1)
       │
       ▼
  Réponse structurée JSON
```

## Licence

Privé — usage interne uniquement.
# driving-medical-ai-assistant
