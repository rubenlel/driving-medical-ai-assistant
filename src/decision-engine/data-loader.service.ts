import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { PathologyConfig } from './interfaces/config.interface';
import { TreeNode } from './interfaces/tree.interface';
import { FactDefinition } from './interfaces/fact.interface';
import { MachineRule, CheckboxRule } from './interfaces/rule.interface';
import { Decision, Accommodation, ExpertRule } from './interfaces/decision.interface';

interface PathologyData {
  config: PathologyConfig;
  tree: TreeNode[];
  treeIndex: Map<string, TreeNode>;
  rules: CheckboxRule[];
  decisions: Decision[];
  decisionIndex: Map<string, Decision>;
  machineRules: MachineRule[];
  machineFacts: FactDefinition[];
  factIndex: Map<string, FactDefinition>;
  accommodations: Accommodation[];
  expertRules: ExpertRule[];
  uiSnippets: Record<string, string>;
}

@Injectable()
export class DataLoaderService implements OnModuleInit {
  private readonly logger = new Logger(DataLoaderService.name);
  private readonly store = new Map<string, PathologyData>();

  onModuleInit(): void {
    this.loadPathology('avc-g1');
  }

  private loadPathology(id: string): void {
    const dir = path.join(__dirname, 'data', id);

    if (!fs.existsSync(dir)) {
      throw new Error(`Pathology data directory not found: ${dir}`);
    }

    const load = <T>(file: string): T => {
      const raw = fs.readFileSync(path.join(dir, file), 'utf-8');
      return JSON.parse(raw) as T;
    };

    const tree = load<TreeNode[]>('decision-tree.json');
    const decisions = load<Decision[]>('decisions.json');
    const machineFacts = load<FactDefinition[]>('machine-facts.json');
    const machineRules = load<MachineRule[]>('machine-rules.json');

    const treeIndex = new Map<string, TreeNode>();
    for (const node of tree) treeIndex.set(node.nodeId, node);

    const decisionIndex = new Map<string, Decision>();
    for (const d of decisions) decisionIndex.set(d.code, d);

    const factIndex = new Map<string, FactDefinition>();
    for (const f of machineFacts) factIndex.set(f.key, f);

    const data: PathologyData = {
      config: load<PathologyConfig>('config.json'),
      tree,
      treeIndex,
      rules: load<CheckboxRule[]>('rules.json'),
      decisions,
      decisionIndex,
      machineRules: machineRules.sort((a, b) => a.priority - b.priority),
      machineFacts,
      factIndex,
      accommodations: load<Accommodation[]>('accommodations.json'),
      expertRules: load<ExpertRule[]>('expert-rules.json'),
      uiSnippets: load<Record<string, string>>('ui-snippets.json'),
    };

    this.validate(id, data);
    this.store.set(id, data);
    this.logger.log(
      `Loaded pathology "${id}": ${tree.length} nodes, ${machineRules.length} rules, ${machineFacts.length} facts`,
    );
  }

  private validate(id: string, data: PathologyData): void {
    for (const node of data.tree) {
      if (node.ifYes && !data.treeIndex.has(node.ifYes) && !node.ifYes.startsWith('FIN_')) {
        this.logger.warn(`[${id}] Node ${node.nodeId} references unknown ifYes: ${node.ifYes}`);
      }
      if (node.ifNo && !data.treeIndex.has(node.ifNo) && !node.ifNo.startsWith('FIN_')) {
        this.logger.warn(`[${id}] Node ${node.nodeId} references unknown ifNo: ${node.ifNo}`);
      }
    }

    for (const rule of data.machineRules) {
      const allConditions = [
        ...rule.andConditions,
        ...rule.orConditions,
        ...rule.notConditions,
      ];
      for (const cond of allConditions) {
        if (!data.factIndex.has(cond.fact)) {
          this.logger.warn(
            `[${id}] Rule ${rule.ruleId} references unknown fact: ${cond.fact}`,
          );
        }
      }
    }
  }

  getPathologyIds(): string[] {
    return Array.from(this.store.keys());
  }

  getConfig(pathology: string): PathologyConfig {
    return this.getData(pathology).config;
  }

  getTree(pathology: string): TreeNode[] {
    return this.getData(pathology).tree;
  }

  getTreeNode(pathology: string, nodeId: string): TreeNode | undefined {
    return this.getData(pathology).treeIndex.get(nodeId);
  }

  getCheckboxRules(pathology: string): CheckboxRule[] {
    return this.getData(pathology).rules;
  }

  getDecisions(pathology: string): Decision[] {
    return this.getData(pathology).decisions;
  }

  getDecision(pathology: string, code: string): Decision | undefined {
    return this.getData(pathology).decisionIndex.get(code);
  }

  getMachineRules(pathology: string): MachineRule[] {
    return this.getData(pathology).machineRules;
  }

  getMachineFacts(pathology: string): FactDefinition[] {
    return this.getData(pathology).machineFacts;
  }

  getAccommodations(pathology: string): Accommodation[] {
    return this.getData(pathology).accommodations;
  }

  getExpertRules(pathology: string): ExpertRule[] {
    return this.getData(pathology).expertRules;
  }

  getUiSnippets(pathology: string): Record<string, string> {
    return this.getData(pathology).uiSnippets;
  }

  private getData(pathology: string): PathologyData {
    const data = this.store.get(pathology);
    if (!data) throw new Error(`Unknown pathology: "${pathology}"`);
    return data;
  }
}
