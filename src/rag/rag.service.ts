import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { EmbeddingService } from './embedding.service';
import { VectorSearchService } from './vector-search.service';
import { PromptBuilderService } from './prompt-builder.service';
import {
  RagAnswer,
  RagResponse,
  RegulationChunk,
  SourceReference,
} from './interfaces/rag-response.interface';

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

  async ask(question: string): Promise<RagResponse> {
    this.logger.log(`Processing question: "${question.substring(0, 80)}..."`);

    const embedding = await this.embeddingService.generateEmbedding(question);
    this.logger.debug('Embedding generated');

    const chunks = await this.vectorSearchService.searchRegulations(embedding, 8);
    this.logger.debug(`Retrieved ${chunks.length} regulation chunks`);

    if (chunks.length === 0) {
      return {
        answer: {
          case_analysis: '',
          regulatory_framework: '',
          regulatory_points: [],
          medical_reasoning: '',
          clarification_questions: [],
          proposed_orientation: {
            decision: 'renvoi_commission',
            label: 'Données réglementaires insuffisantes',
            suggested_duration: null,
            restrictions: null,
            justification:
              'La recherche dans la base réglementaire n\'a retourné aucun résultat pertinent.',
          },
          important_notes: [],
          disclaimer:
            'Cet avis est généré par une IA. Il ne se substitue pas au jugement clinique du médecin agréé.',
        },
        sources: [],
        metadata: {
          chunks_used: 0,
          model: this.chatModel,
          timestamp: new Date().toISOString(),
        },
      };
    }

    const systemPrompt = this.promptBuilderService.buildSystemPrompt();
    const userPrompt = this.promptBuilderService.buildUserPrompt(question, chunks);

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

      const answer: RagAnswer = JSON.parse(rawContent);
      const sources = this.buildSources(chunks);

      return {
        answer,
        sources,
        metadata: {
          chunks_used: chunks.length,
          model: this.chatModel,
          timestamp: new Date().toISOString(),
        },
      };
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
