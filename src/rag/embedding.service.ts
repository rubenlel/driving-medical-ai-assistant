import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

@Injectable()
export class EmbeddingService {
  private readonly openai: OpenAI;
  private readonly model: string;
  private readonly logger = new Logger(EmbeddingService.name);

  constructor(private readonly configService: ConfigService) {
    this.openai = new OpenAI({
      apiKey: this.configService.getOrThrow<string>('openai.apiKey'),
    });
    this.model = this.configService.getOrThrow<string>('openai.embeddingModel');
  }

  async generateEmbedding(text: string): Promise<number[]> {
    try {
      const response = await this.openai.embeddings.create({
        model: this.model,
        input: text.replace(/\n/g, ' ').trim(),
      });

      return response.data[0].embedding;
    } catch (error) {
      this.logger.error('Failed to generate embedding', error);
      throw new HttpException(
        'Failed to generate embedding from OpenAI',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
