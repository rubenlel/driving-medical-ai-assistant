import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DataLoaderService } from './data-loader.service';
import { FactExtractorService } from './fact-extractor.service';
import { TreeWalkerService } from './tree-walker.service';
import { RulesEvaluatorService } from './rules-evaluator.service';
import { DecisionResolverService } from './decision-resolver.service';
import { FactStore } from './interfaces/fact.interface';
import { EvaluationSession, NodeAnswer } from './interfaces/session.interface';
import {
  EngineResponse,
  QuestionResponse,
  DecisionResponse,
  FinalDecision,
} from './interfaces/engine-response.interface';

@Injectable()
export class EngineService {
  private readonly logger = new Logger(EngineService.name);

  constructor(
    private readonly dataLoader: DataLoaderService,
    private readonly factExtractor: FactExtractorService,
    private readonly treeWalker: TreeWalkerService,
    private readonly rulesEvaluator: RulesEvaluatorService,
    private readonly decisionResolver: DecisionResolverService,
  ) {}

  startEvaluation(pathology: string, group: 'G1' | 'G2'): QuestionResponse {
    // Validate pathology exists
    if (!this.dataLoader.getPathologyIds().includes(pathology)) {
      throw new HttpException(
        `Unknown pathology: "${pathology}"`,
        HttpStatus.BAD_REQUEST,
      );
    }

    const factDefs = this.dataLoader.getMachineFacts(pathology);
    const factKeys = factDefs.map((f) => f.key);
    const emptyFacts = this.factExtractor.buildEmptyFactStore(factKeys);
    const firstNode = this.treeWalker.getFirstNode(pathology);
    const totalNodes = this.dataLoader.getTree(pathology).length;

    const session: EvaluationSession = {
      id: randomUUID(),
      pathology,
      groupPermis: group,
      currentNodeId: firstNode.nodeId,
      facts: emptyFacts,
      answers: [],
      firedRules: [],
      status: 'in_progress',
      createdAt: new Date().toISOString(),
    };

    this.logger.log(
      `Started evaluation ${session.id} — pathology: ${pathology}, group: ${group}`,
    );

    return {
      type: 'question',
      session,
      question: firstNode,
      progress: { answered: 0, total: totalNodes },
    };
  }

  submitAnswer(
    session: EvaluationSession,
    nodeId: string,
    answer: NodeAnswer,
  ): EngineResponse {
    const { pathology, groupPermis } = session;

    // 1. Update facts from answer
    const updatedFacts = this.factExtractor.extractFacts(answer, session.facts);
    const updatedAnswers = [...session.answers, answer];

    // 2. Check if the current node triggers an immediate STOP
    const currentNode = this.dataLoader.getTreeNode(pathology, nodeId);
    if (currentNode) {
      const immediateStop = this.treeWalker.checkImmediateStop(
        currentNode,
        answer,
      );
      if (immediateStop) {
        this.logger.debug(
          `Immediate STOP at ${nodeId} → ${immediateStop}`,
        );
        return this.buildDecisionResponse(
          session,
          updatedFacts,
          updatedAnswers,
          immediateStop,
        );
      }
    }

    // 3. Evaluate machine rules against current facts
    const evalResult = this.rulesEvaluator.evaluate(
      pathology,
      updatedFacts,
      groupPermis,
    );

    // If a high-confidence STOP rule fires, end the evaluation
    if (evalResult.topStopRule && evalResult.topStopRule.confidence >= 0.85) {
      this.logger.debug(
        `STOP rule ${evalResult.topStopRule.ruleId} fired (confidence: ${evalResult.topStopRule.confidence})`,
      );
      return this.buildDecisionResponse(
        session,
        updatedFacts,
        updatedAnswers,
        evalResult.topStopRule.decisionCode,
        evalResult.firedRules.map((r) => ({
          ruleId: r.ruleId,
          decisionCode: r.decisionCode,
          decisionLabel: r.decisionLabel,
          confidence: r.confidence,
          actions: r.actions,
          rationale: r.rationale,
          snippetKeys: r.snippetKeys,
        })),
        evalResult.missingFacts,
      );
    }

    // 4. Walk the tree to the next node
    const walkResult = this.treeWalker.walk(pathology, nodeId, answer);

    // Tree produced a terminal decision code
    if (walkResult.decisionCode) {
      return this.buildDecisionResponse(
        session,
        updatedFacts,
        updatedAnswers,
        walkResult.decisionCode,
        evalResult.firedRules.map((r) => ({
          ruleId: r.ruleId,
          decisionCode: r.decisionCode,
          decisionLabel: r.decisionLabel,
          confidence: r.confidence,
          actions: r.actions,
          rationale: r.rationale,
          snippetKeys: r.snippetKeys,
        })),
        evalResult.missingFacts,
      );
    }

    // Next question exists
    if (walkResult.nextNode) {
      const totalNodes = this.dataLoader.getTree(pathology).length;
      const updatedSession: EvaluationSession = {
        ...session,
        facts: updatedFacts,
        answers: updatedAnswers,
        currentNodeId: walkResult.nextNode.nodeId,
        firedRules: evalResult.firedRules.map((r) => ({
          ruleId: r.ruleId,
          decisionCode: r.decisionCode,
          decisionLabel: r.decisionLabel,
          confidence: r.confidence,
          actions: r.actions,
          rationale: r.rationale,
          snippetKeys: r.snippetKeys,
        })),
      };

      return {
        type: 'question',
        session: updatedSession,
        question: walkResult.nextNode,
        progress: { answered: updatedAnswers.length, total: totalNodes },
      };
    }

    // Tree exhausted — apply fallback rule (MR99)
    this.logger.debug('Tree exhausted — applying fallback decision');
    updatedFacts['no_stop_criteria'] = true;
    return this.buildDecisionResponse(
      session,
      updatedFacts,
      updatedAnswers,
      'FIN_D',
      evalResult.firedRules.map((r) => ({
        ruleId: r.ruleId,
        decisionCode: r.decisionCode,
        decisionLabel: r.decisionLabel,
        confidence: r.confidence,
        actions: r.actions,
        rationale: r.rationale,
        snippetKeys: r.snippetKeys,
      })),
      evalResult.missingFacts,
    );
  }

  /**
   * Batch evaluation — takes a complete fact store, runs all rules, returns decision.
   * Used for RAG integration or programmatic evaluation.
   */
  evaluateFullCase(
    pathology: string,
    group: 'G1' | 'G2',
    facts: FactStore,
  ): FinalDecision {
    const evalResult = this.rulesEvaluator.evaluate(pathology, facts, group);

    let decisionCode = 'FIN_D'; // default fallback

    if (evalResult.topStopRule) {
      decisionCode = evalResult.topStopRule.decisionCode;
    } else if (evalResult.firedRules.length > 0) {
      decisionCode = evalResult.firedRules[0].decisionCode;
    }

    return this.decisionResolver.resolve(
      pathology,
      decisionCode,
      evalResult.firedRules,
      facts,
      evalResult.missingFacts,
    );
  }

  private buildDecisionResponse(
    session: EvaluationSession,
    facts: FactStore,
    answers: NodeAnswer[],
    decisionCode: string,
    firedRules = session.firedRules,
    missingFacts: string[] = [],
  ): DecisionResponse {
    const result = this.decisionResolver.resolve(
      session.pathology,
      decisionCode,
      firedRules,
      facts,
      missingFacts,
    );

    const completedSession: EvaluationSession = {
      ...session,
      facts,
      answers,
      firedRules,
      currentNodeId: '',
      status: 'completed',
    };

    return {
      type: 'decision',
      session: completedSession,
      result,
    };
  }
}
