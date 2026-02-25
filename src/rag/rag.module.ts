import { Module } from '@nestjs/common';
import { RagController } from './rag.controller';
import { RagService } from './rag.service';
import { EmbeddingService } from './embedding.service';
import { VectorSearchService } from './vector-search.service';
import { PromptBuilderService } from './prompt-builder.service';

@Module({
  controllers: [RagController],
  providers: [
    RagService,
    EmbeddingService,
    VectorSearchService,
    PromptBuilderService,
  ],
})
export class RagModule {}
