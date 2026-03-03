import { Body, Controller, Get, Post } from '@nestjs/common';
import { EngineService } from './engine.service';
import { StartEvaluationDto } from './dto/start-evaluation.dto';
import { SubmitAnswerDto } from './dto/submit-answer.dto';
import { EvaluateCaseDto } from './dto/evaluate-case.dto';
import { EvaluationSession, NodeAnswer } from './interfaces/session.interface';
import { EngineResponse, FinalDecision } from './interfaces/engine-response.interface';
import { DataLoaderService } from './data-loader.service';

@Controller('decision')
export class DecisionEngineController {
  constructor(
    private readonly engineService: EngineService,
    private readonly dataLoader: DataLoaderService,
  ) {}

  @Get('pathologies')
  getAvailablePathologies(): { pathologies: string[] } {
    return { pathologies: this.dataLoader.getPathologyIds() };
  }

  @Post('start')
  start(@Body() dto: StartEvaluationDto): EngineResponse {
    return this.engineService.startEvaluation(dto.pathology, dto.group);
  }

  @Post('answer')
  answer(@Body() dto: SubmitAnswerDto): EngineResponse {
    const session = dto.session as unknown as EvaluationSession;
    const nodeAnswer: NodeAnswer = {
      nodeId: dto.node_id,
      answerType: dto.answer.type,
      value: dto.answer.value,
      precision: dto.answer.precision,
      answeredAt: new Date().toISOString(),
    };

    return this.engineService.submitAnswer(session, dto.node_id, nodeAnswer);
  }

  @Post('evaluate')
  evaluate(@Body() dto: EvaluateCaseDto): FinalDecision {
    return this.engineService.evaluateFullCase(
      dto.pathology,
      dto.group,
      dto.facts,
    );
  }
}
