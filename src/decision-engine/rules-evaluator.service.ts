import { Injectable, Logger } from '@nestjs/common';
import { DataLoaderService } from './data-loader.service';
import { FactStore } from './interfaces/fact.interface';
import { MachineRule, RuleCondition, FiredRule } from './interfaces/rule.interface';

export interface EvaluationResult {
  firedRules: FiredRule[];
  /** Facts needed by rules that could not be fully evaluated */
  missingFacts: string[];
  /** Highest-confidence STOP rule, if any */
  topStopRule: FiredRule | null;
}

@Injectable()
export class RulesEvaluatorService {
  private readonly logger = new Logger(RulesEvaluatorService.name);

  constructor(private readonly dataLoader: DataLoaderService) {}

  evaluate(
    pathology: string,
    facts: FactStore,
    group: 'G1' | 'G2',
  ): EvaluationResult {
    const rules = this.dataLoader.getMachineRules(pathology);
    const firedRules: FiredRule[] = [];
    const missingFacts = new Set<string>();

    for (const rule of rules) {
      if (!this.isGroupApplicable(rule, group)) continue;

      const { matches, missing } = this.evaluateRule(rule, facts);

      for (const m of missing) missingFacts.add(m);

      if (matches) {
        const fired: FiredRule = {
          ruleId: rule.ruleId,
          decisionCode: rule.decisionCode,
          decisionLabel: rule.decisionLabel,
          confidence: rule.confidence,
          actions: rule.actions,
          rationale: rule.rationale,
          snippetKeys: rule.snippetKeys,
        };
        firedRules.push(fired);
        this.logger.debug(
          `Rule ${rule.ruleId} fired → ${rule.decisionCode} (confidence: ${rule.confidence})`,
        );
      }
    }

    // Sort fired rules by confidence DESC
    firedRules.sort((a, b) => b.confidence - a.confidence);

    // Find the top STOP rule (FIN_A, FIN_C are STOP-type decisions)
    const stopCodes = new Set(['FIN_A', 'FIN_C']);
    const topStopRule = firedRules.find((r) => stopCodes.has(r.decisionCode)) || null;

    return {
      firedRules,
      missingFacts: Array.from(missingFacts),
      topStopRule,
    };
  }

  private isGroupApplicable(rule: MachineRule, group: 'G1' | 'G2'): boolean {
    return rule.applicableGroup === 'ALL' || rule.applicableGroup === group;
  }

  private evaluateRule(
    rule: MachineRule,
    facts: FactStore,
  ): { matches: boolean; missing: string[] } {
    const missing: string[] = [];

    // AND conditions: ALL must be true (if array is non-empty)
    if (rule.andConditions.length > 0) {
      for (const cond of rule.andConditions) {
        const factVal = facts[cond.fact];
        if (factVal === null || factVal === undefined) {
          missing.push(cond.fact);
          return { matches: false, missing };
        }
        if (!this.evaluateCondition(cond, factVal)) {
          return { matches: false, missing };
        }
      }
    }

    // OR conditions: AT LEAST ONE must be true (if array is non-empty)
    if (rule.orConditions.length > 0) {
      let anyMatch = false;
      for (const cond of rule.orConditions) {
        const factVal = facts[cond.fact];
        if (factVal === null || factVal === undefined) {
          missing.push(cond.fact);
          continue;
        }
        if (this.evaluateCondition(cond, factVal)) {
          anyMatch = true;
          break;
        }
      }
      if (!anyMatch) {
        return { matches: false, missing };
      }
    }

    // NOT conditions: NONE must be true (if array is non-empty)
    if (rule.notConditions.length > 0) {
      for (const cond of rule.notConditions) {
        const factVal = facts[cond.fact];
        if (factVal === null || factVal === undefined) continue;
        if (this.evaluateCondition(cond, factVal)) {
          return { matches: false, missing };
        }
      }
    }

    // If we reach here and all condition arrays were empty, only fire
    // if this is the fallback rule (MR99 — no_stop_criteria)
    if (
      rule.andConditions.length === 0 &&
      rule.orConditions.length === 0 &&
      rule.notConditions.length === 0
    ) {
      const fallbackCond = rule.andConditions.find(
        (c) => c.fact === 'no_stop_criteria',
      );
      if (!fallbackCond) return { matches: false, missing };
    }

    return { matches: true, missing };
  }

  private evaluateCondition(
    cond: RuleCondition,
    factValue: boolean | number | string,
  ): boolean {
    switch (cond.op) {
      case '==':
        return factValue === cond.value;
      case '!=':
        return factValue !== cond.value;
      case '>':
        return factValue > cond.value;
      case '<':
        return factValue < cond.value;
      default:
        return false;
    }
  }
}
