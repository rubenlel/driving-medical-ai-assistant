import { Injectable, Logger } from '@nestjs/common';
import { FactStore } from './interfaces/fact.interface';
import { NodeAnswer } from './interfaces/session.interface';

/**
 * Maps answers from the decision tree questionnaire to machine-readable boolean facts.
 *
 * The mapping is deterministic and based on the MACHINE_FACTS sourceNode definitions
 * from the Excel specification.
 */
@Injectable()
export class FactExtractorService {
  private readonly logger = new Logger(FactExtractorService.name);

  extractFacts(answer: NodeAnswer, currentFacts: FactStore): FactStore {
    const updated = { ...currentFacts };

    switch (answer.nodeId) {
      case 'Q0':
        this.handleQ0(answer, updated);
        break;
      case 'Q1':
        this.handleQ1(answer, updated);
        break;
      case 'Q2':
        updated['neuro.major_motor_deficit'] = answer.value === true;
        break;
      case 'Q2a':
        this.handleQ2a(answer, updated);
        break;
      case 'Q3':
        if (answer.value === false) {
          this.clearVisionFacts(updated);
        }
        break;
      case 'Q3a':
        this.handleQ3a(answer, updated);
        break;
      case 'Q4':
        if (answer.value === false) {
          this.clearCognitionFacts(updated);
        }
        break;
      case 'Q4a':
        this.handleQ4a(answer, updated);
        break;
      case 'Q5':
        updated['language.major_impairment'] = answer.value === true;
        break;
      case 'Q6':
        updated['clinical.not_stable_or_worsening'] = answer.value === true;
        break;
      case 'Q7':
        updated['rehab.in_progress_for_deficit'] = answer.value === true;
        break;
      case 'Q8':
        updated['seizure.post_stroke'] = answer.value === true;
        break;
      case 'Q9':
        updated['treatment.affects_vigilance'] = answer.value === true;
        break;
      case 'Q10':
        updated['specialist.neuro_recent_favorable'] = answer.value === true;
        break;
      case 'Q11':
        // Q11: "examens montrent aggravation?" — YES means not stable
        if (answer.value === true) {
          updated['clinical.not_stable_or_worsening'] = true;
        }
        break;
      case 'Q12':
        updated['no_stop_criteria'] = true;
        break;
      default:
        this.logger.debug(`No fact mapping for node ${answer.nodeId}`);
    }

    return updated;
  }

  private handleQ0(answer: NodeAnswer, facts: FactStore): void {
    const val = answer.value as string;
    if (val === '< 6 mois') {
      facts['event.within_6_months'] = true;
    } else if (val === '≥ 6 mois') {
      facts['event.within_6_months'] = false;
    } else {
      facts['event.within_6_months'] = null;
    }
  }

  private handleQ1(answer: NodeAnswer, facts: FactStore): void {
    const val = answer.value as string;
    if (val === 'AVC sur FOP' || val === 'FOP') {
      facts['etiology.fop'] = true;
    }
  }

  private handleQ2a(answer: NodeAnswer, facts: FactStore): void {
    // Q2a is checkbox — value is string[]
    facts['neuro.major_motor_deficit'] = true;
  }

  private handleQ3a(answer: NodeAnswer, facts: FactStore): void {
    const selected = Array.isArray(answer.value) ? answer.value : [];

    facts['vision.hemianopsia_persistent'] =
      selected.includes('Hémianopsie persistante');
    facts['vision.quadranopsia'] =
      selected.includes('Quadranopsie');
    facts['vision.diplopia_persistent'] =
      selected.includes('Diplopie persistante');
    facts['vision.oculomotor_instability'] =
      selected.includes('Troubles oculomoteurs/nystagmus') ||
      selected.includes('saccades pathologiques');
    facts['vision.transient_or_recovered'] =
      selected.includes('Trouble transitoire/récupéré');
  }

  private handleQ4a(answer: NodeAnswer, facts: FactStore): void {
    const selected = Array.isArray(answer.value) ? answer.value : [];

    facts['cognition.neglect_spatial'] =
      selected.includes('Négligence spatiale');
    facts['cognition.attention_impairment'] =
      selected.includes('Trouble attentionnel/distractibilité');
    facts['cognition.cognitive_slowing'] =
      selected.includes('Ralentissement cognitif');
    facts['cognition.executive_judgement_impairment'] =
      selected.includes('Trouble exécutif/jugement');
  }

  private clearVisionFacts(facts: FactStore): void {
    facts['vision.hemianopsia_persistent'] = false;
    facts['vision.quadranopsia'] = false;
    facts['vision.diplopia_persistent'] = false;
    facts['vision.oculomotor_instability'] = false;
    facts['vision.transient_or_recovered'] = false;
  }

  private clearCognitionFacts(facts: FactStore): void {
    facts['cognition.neglect_spatial'] = false;
    facts['cognition.attention_impairment'] = false;
    facts['cognition.cognitive_slowing'] = false;
    facts['cognition.executive_judgement_impairment'] = false;
  }

  /**
   * Builds an initial empty fact store with all known fact keys set to null.
   */
  buildEmptyFactStore(factKeys: string[]): FactStore {
    const store: FactStore = {};
    for (const key of factKeys) {
      store[key] = null;
    }
    return store;
  }
}
