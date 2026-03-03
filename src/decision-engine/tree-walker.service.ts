import { Injectable, Logger } from '@nestjs/common';
import { DataLoaderService } from './data-loader.service';
import { TreeNode } from './interfaces/tree.interface';
import { NodeAnswer } from './interfaces/session.interface';

export interface TreeWalkResult {
  /** The next node to present, or null if the tree is exhausted / a terminal decision is reached */
  nextNode: TreeNode | null;
  /** Non-null when a STOP or FIN_ decision was reached */
  decisionCode: string | null;
}

@Injectable()
export class TreeWalkerService {
  private readonly logger = new Logger(TreeWalkerService.name);

  constructor(private readonly dataLoader: DataLoaderService) {}

  getFirstNode(pathology: string): TreeNode {
    const tree = this.dataLoader.getTree(pathology);
    return tree[0];
  }

  walk(pathology: string, currentNodeId: string, answer: NodeAnswer): TreeWalkResult {
    const node = this.dataLoader.getTreeNode(pathology, currentNodeId);
    if (!node) {
      this.logger.error(`Node not found: ${currentNodeId}`);
      return { nextNode: null, decisionCode: null };
    }

    // Determine the next node ID based on the answer
    const nextNodeId = this.resolveNextNodeId(node, answer);

    if (!nextNodeId) {
      this.logger.debug(`No next node from ${currentNodeId} — tree exhausted`);
      return { nextNode: null, decisionCode: null };
    }

    // If the result is a FIN_ code, it's a terminal decision
    if (nextNodeId.startsWith('FIN_') || nextNodeId.startsWith('CASE')) {
      return { nextNode: null, decisionCode: nextNodeId };
    }

    const nextNode = this.dataLoader.getTreeNode(pathology, nextNodeId);
    if (!nextNode) {
      this.logger.error(`Referenced node not found: ${nextNodeId}`);
      return { nextNode: null, decisionCode: null };
    }

    return { nextNode, decisionCode: null };
  }

  /**
   * Checks if a node is a STOP node that should immediately produce a decision
   * based on the answer (before walking to the next node).
   */
  checkImmediateStop(node: TreeNode, answer: NodeAnswer): string | null {
    if (!node.isStop) return null;

    // Q0 is special: "< 6 mois" = STOP FIN_A, ">= 6 mois" = continue
    if (node.nodeId === 'Q0') {
      const val = answer.value as string;
      if (val === '< 6 mois' || val === 'Inconnue') {
        return node.stopDecisionCode || 'FIN_A';
      }
      return null;
    }

    // For yesno STOP nodes: YES triggers the stop
    if (node.answerType === 'yesno' && answer.value === true && node.stopDecisionCode) {
      return node.stopDecisionCode;
    }

    // For info nodes (Q12): always stop with its code
    if (node.answerType === 'info' && node.stopDecisionCode) {
      return node.stopDecisionCode;
    }

    return null;
  }

  private resolveNextNodeId(node: TreeNode, answer: NodeAnswer): string | null {
    switch (node.answerType) {
      case 'yesno':
        return answer.value === true ? node.ifYes : node.ifNo;

      case 'select':
        return this.resolveSelect(node, answer);

      case 'checkbox':
        // Checkboxes always flow to ifNo (= continue) — the rules engine handles the logic
        return node.ifNo;

      case 'info':
        // Info nodes are terminal or flow to next
        return node.ifNo || null;

      default:
        return node.ifNo;
    }
  }

  private resolveSelect(node: TreeNode, answer: NodeAnswer): string | null {
    const val = answer.value as string;

    // Q0 special routing
    if (node.nodeId === 'Q0') {
      if (val === '≥ 6 mois') return node.ifNo;
      // "< 6 mois" and "Inconnue" are handled by checkImmediateStop
      return node.ifNo;
    }

    // Q1: all options continue to the same next node
    if (node.ifYes) return node.ifYes;
    return node.ifNo;
  }
}
