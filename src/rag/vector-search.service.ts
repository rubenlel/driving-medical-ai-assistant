import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { RegulationChunk } from './interfaces/rag-response.interface';

@Injectable()
export class VectorSearchService {
  private readonly logger = new Logger(VectorSearchService.name);

  constructor(private readonly supabaseService: SupabaseService) {}

  async searchRegulations(
    queryEmbedding: number[],
    matchCount = 5,
  ): Promise<RegulationChunk[]> {
    try {
      this.logger.debug(
        `Calling match_regulation with embedding length=${queryEmbedding.length}, match_count=${matchCount}`,
      );

      const { data, error } = await this.supabaseService
        .getClient()
        .rpc('match_regulation', {
          query_embedding: queryEmbedding,
          match_count: matchCount,
        });

      this.logger.debug(`RPC response — data: ${JSON.stringify(data?.length ?? null)}, error: ${JSON.stringify(error)}`);

      if (error) {
        this.logger.error('Supabase RPC error', error);
        throw new HttpException(
          `Vector search failed: ${error.message}`,
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }

      if (!data || data.length === 0) {
        this.logger.warn('No matching regulation chunks found');
        return [];
      }

      this.logger.debug(
        `Top match similarity: ${data[0]?.similarity?.toFixed(4)}`,
      );

      return data as RegulationChunk[];
    } catch (error) {
      if (error instanceof HttpException) throw error;

      this.logger.error('Unexpected vector search error', error);
      throw new HttpException(
        'Vector search failed unexpectedly',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
