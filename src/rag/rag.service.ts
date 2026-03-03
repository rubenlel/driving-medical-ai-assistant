import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import OpenAI from 'openai';
import { EmbeddingService } from './embedding.service';
import { VectorSearchService } from './vector-search.service';
import { PromptBuilderService } from './prompt-builder.service';
import { EngineService } from '../decision-engine/engine.service';
import { DataLoaderService } from '../decision-engine/data-loader.service';
import {
  GptAnalysis,
  RagResponse,
  EngineBlock,
  RegulationChunk,
  SourceReference,
} from './interfaces/rag-response.interface';
import { ConversationState, ConversationMessage } from './interfaces/conversation.interface';
import { EngineContext } from './prompt-builder.service';
import { FactStore } from '../decision-engine/interfaces/fact.interface';
import { FinalDecision } from '../decision-engine/interfaces/engine-response.interface';

@Injectable()
export class RagService {
  private readonly openai: OpenAI;
  private readonly chatModel: string;
  private readonly logger = new Logger(RagService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly embeddingService: EmbeddingService,
    private readonly vectorSearchService: VectorSearchService,
    private readonly promptBuilderService: PromptBuilderService,
    private readonly engineService: EngineService,
    private readonly dataLoaderService: DataLoaderService,
  ) {
    this.openai = new OpenAI({
      apiKey: this.configService.getOrThrow<string>('openai.apiKey'),
    });
    this.chatModel = this.configService.getOrThrow<string>('openai.chatModel');
  }

  private cleanExcerpt(raw: string): string {
    return raw.replace(/\n/g, ' ').replace(/\s{2,}/g, ' ').trim();
  }

  private buildSources(chunks: RegulationChunk[]): SourceReference[] {
    return chunks.map((chunk, index) => {
      const cleaned = this.cleanExcerpt(chunk.content);
      return {
        source_number: index + 1,
        chunk_id: String(chunk.id),
        excerpt: cleaned.length > 400 ? cleaned.substring(0, 400) + '…' : cleaned,
        similarity: Math.round(chunk.similarity * 10000) / 10000,
      };
    });
  }

  // ─── FACT EXTRACTION ─────────────────────────────────────────────

  private async extractFactsFromText(fullContext: string): Promise<FactStore> {
    const factDefs = this.dataLoaderService.getMachineFacts('avc-g1');
    const factList = factDefs.map((f) => `"${f.key}": // ${f.description}`).join('\n');

    try {
      const completion = await this.openai.chat.completions.create({
        model: this.chatModel,
        messages: [
          {
            role: 'system',
            content: `Tu es un système d'extraction de faits cliniques. À partir d'un cas clinique (possiblement décrit en plusieurs messages), tu extrais des faits booléens.

Réponds UNIQUEMENT avec un JSON valide. Pour chaque fait :
- true si le contexte indique clairement que c'est le cas
- false si le contexte indique clairement que ce n'est PAS le cas
- null si le contexte ne mentionne pas cet élément ou s'il y a ambiguïté

Voici les faits à extraire :
${factList}`,
          },
          { role: 'user', content: fullContext },
        ],
        temperature: 0,
        response_format: { type: 'json_object' },
      });

      const raw = completion.choices[0]?.message?.content;
      if (!raw) return {};

      const parsed = JSON.parse(raw);
      const facts: FactStore = {};
      for (const def of factDefs) {
        const val = parsed[def.key];
        facts[def.key] = val === true ? true : val === false ? false : null;
      }

      this.logger.debug(
        `Extracted ${Object.values(facts).filter((v) => v !== null).length}/${factDefs.length} facts`,
      );
      return facts;
    } catch (error) {
      this.logger.warn('Fact extraction failed', error);
      return {};
    }
  }

  // ─── ENGINE ──────────────────────────────────────────────────────

  private buildEngineBlock(engineResult: FinalDecision, facts: FactStore): EngineBlock {
    const topRule = engineResult.fired_rules[0];
    return {
      decision: {
        code: engineResult.decision.code,
        label: engineResult.decision.label,
        type: engineResult.decision.type,
        duration: engineResult.decision.duration,
        cerfa_text: engineResult.decision.cerfa_text,
        confidence: topRule?.confidence ?? 0,
      },
      fired_rules: engineResult.fired_rules,
      required_actions: engineResult.required_actions,
      accommodations: engineResult.accommodations,
      expert_notes: engineResult.expert_notes,
      ui_messages: engineResult.ui_messages,
      facts_extracted: facts,
    };
  }

  private runEngine(facts: FactStore): EngineBlock | null {
    const hasRelevant = Object.values(facts).some((v) => v !== null);
    if (!hasRelevant) return null;

    try {
      const result = this.engineService.evaluateFullCase('avc-g1', 'G1', facts);
      this.logger.debug(`Engine decision: ${result.decision.code} (${result.decision.label})`);
      return this.buildEngineBlock(result, facts);
    } catch (error) {
      this.logger.warn('Engine evaluation failed', error);
      return null;
    }
  }

  // ─── GPT CALL (with conversation history) ────────────────────────

  private async callGptWithHistory(
    systemPrompt: string,
    regulationContext: string,
    history: ConversationMessage[],
    currentQuestion: string,
    engineContext?: EngineContext,
  ): Promise<GptAnalysis> {
    const messages: OpenAI.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
    ];

    // Inject regulation context as the first user/assistant exchange
    if (history.length === 0) {
      // First turn: regulation context + question together
      const userPrompt = this.promptBuilderService.buildUserPrompt(
        currentQuestion,
        [],
        engineContext,
      );
      const fullPrompt = regulationContext
        ? `${regulationContext}\n\n${userPrompt}`
        : userPrompt;
      messages.push({ role: 'user', content: fullPrompt });
    } else {
      // Follow-up: inject regulation as context, then replay history
      messages.push({
        role: 'user',
        content: regulationContext
          ? `${regulationContext}\n\nCas clinique initial du médecin :\n${history[0].content}`
          : history[0].content,
      });

      // Replay previous exchanges (skip first user message, already injected)
      for (let i = 1; i < history.length; i++) {
        const msg = history[i];
        messages.push({
          role: msg.role === 'user' ? 'user' : 'assistant',
          content: msg.content,
        });
      }

      // Current follow-up question
      messages.push({ role: 'user', content: currentQuestion });
    }

    try {
      const completion = await this.openai.chat.completions.create({
        model: this.chatModel,
        messages,
        temperature: 0.15,
        max_tokens: 4096,
        response_format: { type: 'json_object' },
      });

      const rawContent = completion.choices[0]?.message?.content;
      if (!rawContent) {
        throw new HttpException('Empty response from OpenAI', HttpStatus.INTERNAL_SERVER_ERROR);
      }

      return JSON.parse(rawContent) as GptAnalysis;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.error('OpenAI chat completion failed', error);
      throw new HttpException('Failed to generate answer from OpenAI', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  // ─── MAIN ASK METHOD ─────────────────────────────────────────────

  async ask(
    question: string,
    existingConversation?: ConversationState,
    engineContext?: EngineContext,
  ): Promise<RagResponse> {
    const isFollowUp = !!existingConversation && existingConversation.turn > 0;
    this.logger.log(
      `[Turn ${(existingConversation?.turn ?? 0) + 1}] "${question.substring(0, 80)}..."`,
    );

    // Build cumulative clinical context (all user messages concatenated)
    const previousContext = existingConversation?.cumulative_context ?? '';
    const cumulativeContext = previousContext
      ? `${previousContext}\n\nSuite — message du médecin :\n${question}`
      : question;

    // 1. Vector search on the current question (each turn may reference different regulation areas)
    const embedding = await this.embeddingService.generateEmbedding(
      isFollowUp ? cumulativeContext.slice(-2000) : question,
    );
    const chunks = await this.vectorSearchService.searchRegulations(embedding, 8);
    this.logger.debug(`Retrieved ${chunks.length} regulation chunks`);

    // 2. Build regulation context string
    const regulationContext = chunks.length > 0
      ? `Contexte réglementaire extrait de l'Arrêté du 28 mars 2022 :\n===\n${chunks
          .map((c, i) => `[Source ${i + 1}] (similarité: ${(c.similarity * 100).toFixed(1)}%)\n${c.content}`)
          .join('\n\n---\n\n')}\n===`
      : '';

    // 3. Extract facts from the FULL cumulative context (catches new info from follow-ups)
    const factsPromise = this.extractFactsFromText(cumulativeContext);

    // 4. GPT call with conversation history
    const history = existingConversation?.history ?? [];
    const systemPrompt = this.promptBuilderService.buildSystemPrompt();

    const [gptResult, extractedFacts] = await Promise.all([
      this.callGptWithHistory(systemPrompt, regulationContext, history, question, engineContext),
      factsPromise,
    ]);

    // 5. Merge facts: keep previous facts, override with new extractions where non-null
    const previousFacts = existingConversation?.cumulative_facts ?? {};
    const mergedFacts: FactStore = { ...previousFacts };
    for (const [key, val] of Object.entries(extractedFacts)) {
      if (val !== null) mergedFacts[key] = val;
    }

    // 6. Run engine with merged facts
    const engineBlock = this.runEngine(mergedFacts);

    // 7. Build updated conversation state
    const now = new Date().toISOString();
    const assistantSummary = gptResult.case_analysis || gptResult.medical_reasoning || '';

    const updatedHistory: ConversationMessage[] = [
      ...history,
      { role: 'user', content: question, timestamp: now },
      { role: 'assistant', content: assistantSummary, timestamp: now },
    ];

    const conversation: ConversationState = {
      id: existingConversation?.id ?? randomUUID(),
      history: updatedHistory,
      turn: (existingConversation?.turn ?? 0) + 1,
      cumulative_context: cumulativeContext,
      cumulative_facts: mergedFacts,
    };

    return {
      analysis: gptResult,
      engine: engineBlock,
      sources: this.buildSources(chunks),
      conversation,
      metadata: {
        chunks_used: chunks.length,
        model: this.chatModel,
        engine_pathology: engineBlock ? 'avc-g1' : null,
        timestamp: now,
      },
    };
  }
}
