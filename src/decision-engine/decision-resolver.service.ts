import { Injectable, Logger } from '@nestjs/common';
import { DataLoaderService } from './data-loader.service';
import { FactStore } from './interfaces/fact.interface';
import { FiredRule } from './interfaces/rule.interface';
import { Accommodation } from './interfaces/decision.interface';
import { FinalDecision } from './interfaces/engine-response.interface';

@Injectable()
export class DecisionResolverService {
  private readonly logger = new Logger(DecisionResolverService.name);

  constructor(private readonly dataLoader: DataLoaderService) {}

  resolve(
    pathology: string,
    decisionCode: string,
    firedRules: FiredRule[],
    facts: FactStore,
    missingFacts: string[],
  ): FinalDecision {
    const config = this.dataLoader.getConfig(pathology);
    const decision = this.dataLoader.getDecision(pathology, decisionCode);

    if (!decision) {
      this.logger.error(`Unknown decision code: ${decisionCode}`);
      return this.buildFallbackDecision(decisionCode, facts);
    }

    // Resolve duration from config references
    const duration = this.resolveDuration(decision.defaultDuration, config);

    // Build CERFA text with variable interpolation
    const cerfaText = this.interpolateTemplate(decision.medicoLegalText, {
      DUREE: duration,
    });

    // Match applicable accommodations based on active deficits
    const accommodations = this.matchAccommodations(pathology, facts);

    // Collect expert notes relevant to current context
    const expertNotes = this.matchExpertNotes(pathology, facts, decisionCode);

    // Collect UI snippets from fired rules
    const uiMessages = this.collectUiSnippets(pathology, firedRules);

    // Build clinical reasoning from the top fired rules
    const reasoning = this.buildClinicalReasoning(firedRules, decision.label);

    // Collect required actions from all fired rules
    const requiredActions = firedRules.flatMap((r) =>
      r.actions.map((a) => ({ type: a.type, value: String(a.value) })),
    );

    // Deduplicate actions by type+value
    const uniqueActions = this.deduplicateActions(requiredActions);

    return {
      decision: {
        code: decision.code,
        label: decision.label,
        type: decision.type,
        duration,
        cerfa_text: cerfaText,
      },
      clinical_reasoning: reasoning,
      fired_rules: firedRules.map((r) => ({
        ruleId: r.ruleId,
        rationale: r.rationale,
        confidence: r.confidence,
      })),
      required_actions: uniqueActions,
      accommodations,
      expert_notes: expertNotes,
      ui_messages: uiMessages,
      missing_data: missingFacts,
      facts_summary: facts,
    };
  }

  private resolveDuration(
    durationRef: string,
    config: Record<string, { value: string | number }>,
  ): string {
    if (!durationRef) return '';
    const configEntry = config[durationRef];
    if (configEntry) return String(configEntry.value);
    return durationRef;
  }

  private interpolateTemplate(
    template: string,
    vars: Record<string, string>,
  ): string {
    if (!template) return '';
    let result = template;
    for (const [key, value] of Object.entries(vars)) {
      result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
    }
    return result;
  }

  private matchAccommodations(
    pathology: string,
    facts: FactStore,
  ): Accommodation[] {
    const all = this.dataLoader.getAccommodations(pathology);
    const matched: Accommodation[] = [];

    if (
      facts['vision.hemianopsia_persistent'] ||
      facts['vision.quadranopsia'] ||
      facts['vision.transient_or_recovered']
    ) {
      const visual = all.filter(
        (a) =>
          a.symptom.toLowerCase().includes('visuel') ||
          a.symptom.toLowerCase().includes('champ'),
      );
      matched.push(...visual);
    }

    if (
      facts['vision.diplopia_persistent']
    ) {
      const diplopia = all.filter((a) =>
        a.symptom.toLowerCase().includes('diplopie') ||
        a.codes.includes('01.05'),
      );
      matched.push(...diplopia);
    }

    if (facts['neuro.major_motor_deficit']) {
      const motor = all.filter(
        (a) =>
          a.symptom.toLowerCase().includes('faiblesse') ||
          a.symptom.toLowerCase().includes('membre') ||
          a.symptom.toLowerCase().includes('volant') ||
          a.symptom.toLowerCase().includes('instabilité'),
      );
      matched.push(...motor);
    }

    // Deduplicate by codes
    const seen = new Set<string>();
    return matched.filter((a) => {
      if (seen.has(a.codes)) return false;
      seen.add(a.codes);
      return true;
    });
  }

  private matchExpertNotes(
    pathology: string,
    facts: FactStore,
    decisionCode: string,
  ): string[] {
    const expertRules = this.dataLoader.getExpertRules(pathology);
    const notes: string[] = [];

    for (const rule of expertRules) {
      // Match by recommendation code
      if (rule.recommendation === decisionCode) {
        notes.push(`[${rule.theme}] ${rule.clinicalJustification}`);
        continue;
      }

      // W1: non-stabilized state
      if (
        rule.ruleId === 'W1' &&
        facts['clinical.not_stable_or_worsening']
      ) {
        notes.push(`[${rule.theme}] ${rule.clinicalJustification}`);
      }

      // W5: specialist responsibility reminder
      if (
        rule.ruleId === 'W5' &&
        facts['specialist.neuro_recent_favorable']
      ) {
        notes.push(`[${rule.theme}] ${rule.clinicalJustification}`);
      }

      // W7: FOP in young patient
      if (rule.ruleId === 'W7' && facts['etiology.fop']) {
        notes.push(`[${rule.theme}] ${rule.clinicalJustification}`);
      }
    }

    return [...new Set(notes)];
  }

  private collectUiSnippets(
    pathology: string,
    firedRules: FiredRule[],
  ): string[] {
    const snippets = this.dataLoader.getUiSnippets(pathology);
    const messages: string[] = [];
    const seen = new Set<string>();

    for (const rule of firedRules) {
      for (const key of rule.snippetKeys) {
        if (seen.has(key)) continue;
        seen.add(key);
        const text = snippets[key];
        if (text) messages.push(text);
      }
    }

    return messages;
  }

  private buildClinicalReasoning(
    firedRules: FiredRule[],
    decisionLabel: string,
  ): string {
    if (firedRules.length === 0) {
      return `Aucun critère d'arrêt déclenché. Décision par défaut : ${decisionLabel}.`;
    }

    const topRule = firedRules[0];
    const others = firedRules.slice(1, 4);

    let reasoning = `Décision principale basée sur la règle ${topRule.ruleId} (confiance: ${(topRule.confidence * 100).toFixed(0)}%) : ${topRule.rationale}`;

    if (others.length > 0) {
      reasoning += '\n\nRègles complémentaires évaluées :\n';
      reasoning += others
        .map(
          (r) =>
            `- ${r.ruleId} (${(r.confidence * 100).toFixed(0)}%) : ${r.rationale}`,
        )
        .join('\n');
    }

    return reasoning;
  }

  private deduplicateActions(
    actions: { type: string; value: string }[],
  ): { type: string; value: string }[] {
    const seen = new Set<string>();
    return actions.filter((a) => {
      const key = `${a.type}:${a.value}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  private buildFallbackDecision(
    code: string,
    facts: FactStore,
  ): FinalDecision {
    return {
      decision: {
        code,
        label: 'DÉCISION NON RÉSOLUE',
        type: 'STOP',
        duration: '',
        cerfa_text: '',
      },
      clinical_reasoning: `Le code décision "${code}" n'a pas été trouvé dans la configuration.`,
      fired_rules: [],
      required_actions: [],
      accommodations: [],
      expert_notes: [],
      ui_messages: [],
      missing_data: [],
      facts_summary: facts,
    };
  }
}
