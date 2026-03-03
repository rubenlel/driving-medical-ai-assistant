import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { EmbeddingService } from './embedding.service';
import { VectorSearchService } from './vector-search.service';
import { PromptBuilderService } from './prompt-builder.service';
import { EngineService } from '../decision-engine/engine.service';
import { DataLoaderService } from '../decision-engine/data-loader.service';
import {
  GptAnalysis,
  RagResponse,
  RegulationChunk,
  SourceReference,
} from './interfaces/rag-response.interface';
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
    return raw
      .replace(/\n/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  private buildSources(chunks: RegulationChunk[]): SourceReference[] {
    return chunks.map((chunk, index) => {
      const cleaned = this.cleanExcerpt(chunk.content);
      return {
        source_number: index + 1,
        chunk_id: String(chunk.id),
        excerpt:
          cleaned.length > 400
            ? cleaned.substring(0, 400) + '…'
            : cleaned,
        similarity: Math.round(chunk.similarity * 10000) / 10000,
      };
    });
  }

  /**
   * Uses GPT to extract boolean clinical facts from a free-text case description.
   * Returns a FactStore compatible with the decision engine.
   */
  private async extractFactsFromText(question: string): Promise<FactStore> {
    const factDefs = this.dataLoaderService.getMachineFacts('avc-g1');
    const factList = factDefs
      .map((f) => `"${f.key}": // ${f.description}`)
      .join('\n');

    try {
      const completion = await this.openai.chat.completions.create({
        model: this.chatModel,
        messages: [
          {
            role: 'system',
            content: `Tu es un système d'extraction de faits cliniques. À partir d'un cas clinique, tu extrais des faits booléens.

Réponds UNIQUEMENT avec un JSON valide. Pour chaque fait :
- true si le cas clinique indique clairement que c'est le cas
- false si le cas clinique indique clairement que ce n'est PAS le cas
- null si le cas clinique ne mentionne pas cet élément ou s'il y a ambiguïté

Voici les faits à extraire :
${factList}`,
          },
          {
            role: 'user',
            content: question,
          },
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
        `Extracted ${Object.values(facts).filter((v) => v !== null).length}/${factDefs.length} facts from text`,
      );
      return facts;
    } catch (error) {
      this.logger.warn('Fact extraction failed, continuing without engine', error);
      return {};
    }
  }

  private buildEngineBlock(
    engineResult: FinalDecision,
    facts: FactStore,
  ): RagResponse['engine'] {
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

  async ask(question: string, engineContext?: EngineContext): Promise<RagResponse> {
    this.logger.log(`Processing question: "${question.substring(0, 80)}..."`);

    // 1. RAG pipeline: embedding → vector search
    const embedding = await this.embeddingService.generateEmbedding(question);
    this.logger.debug('Embedding generated');

    const chunks = await this.vectorSearchService.searchRegulations(embedding, 8);
    this.logger.debug(`Retrieved ${chunks.length} regulation chunks`);

    // 2. Extract facts from text and run engine (in parallel with GPT call)
    const factsPromise = this.extractFactsFromText(question);

    // 3. Build GPT prompt (with optional engine context from guided mode)
    const systemPrompt = this.promptBuilderService.buildSystemPrompt();
    const userPrompt = this.promptBuilderService.buildUserPrompt(question, chunks, engineContext);

    // 4. Call GPT + wait for facts extraction
    const [gptResult, extractedFacts] = await Promise.all([
      this.callGpt(systemPrompt, userPrompt),
      factsPromise,
    ]);

    // 5. Run decision engine with extracted facts
    let engineBlock: RagResponse['engine'] = null;
    const hasRelevantFacts = Object.values(extractedFacts).some((v) => v !== null);

    if (hasRelevantFacts) {
      try {
        const engineResult = this.engineService.evaluateFullCase(
          'avc-g1',
          'G1',
          extractedFacts,
        );
        engineBlock = this.buildEngineBlock(engineResult, extractedFacts);
        this.logger.debug(
          `Engine decision: ${engineResult.decision.code} (${engineResult.decision.label})`,
        );
      } catch (error) {
        this.logger.warn('Engine evaluation failed, returning RAG-only response', error);
      }
    }

    const sources = this.buildSources(chunks);

    return {
      analysis: gptResult,
      engine: engineBlock,
      sources,
      metadata: {
        chunks_used: chunks.length,
        model: this.chatModel,
        engine_pathology: engineBlock ? 'avc-g1' : null,
        timestamp: new Date().toISOString(),
      },
    };
  }

  private async callGpt(
    systemPrompt: string,
    userPrompt: string,
  ): Promise<GptAnalysis> {
    try {
      const completion = await this.openai.chat.completions.create({
        model: this.chatModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.15,
        max_tokens: 4096,
        response_format: { type: 'json_object' },
      });

      const rawContent = completion.choices[0]?.message?.content;
      if (!rawContent) {
        throw new HttpException(
          'Empty response from OpenAI',
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }

      return JSON.parse(rawContent) as GptAnalysis;
    } catch (error) {
      if (error instanceof HttpException) throw error;

      this.logger.error('OpenAI chat completion failed', error);
      throw new HttpException(
        'Failed to generate answer from OpenAI',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
