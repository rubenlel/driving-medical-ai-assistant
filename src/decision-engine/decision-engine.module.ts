import { Global, Module } from '@nestjs/common';
import { DecisionEngineController } from './decision-engine.controller';
import { EngineService } from './engine.service';
import { DataLoaderService } from './data-loader.service';
import { FactExtractorService } from './fact-extractor.service';
import { TreeWalkerService } from './tree-walker.service';
import { RulesEvaluatorService } from './rules-evaluator.service';
import { DecisionResolverService } from './decision-resolver.service';

@Global()
@Module({
  controllers: [DecisionEngineController],
  providers: [
    EngineService,
    DataLoaderService,
    FactExtractorService,
    TreeWalkerService,
    RulesEvaluatorService,
    DecisionResolverService,
  ],
  exports: [EngineService, DataLoaderService],
})
export class DecisionEngineModule {}
