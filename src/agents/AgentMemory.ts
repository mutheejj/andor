import {
  SharedMemoryData, AgentResult, Finding, Issue, Note, Decision,
} from './types';

/**
 * Shared memory space for multi-agent coordination.
 * Orchestrator writes task context, sub-agents write results.
 * Thread-safe via single-threaded JS event loop.
 */
export class AgentMemory {
  private data: SharedMemoryData;

  constructor() {
    this.data = {
      taskContext: '',
      codebaseMap: '',
      sharedFindings: [],
      completedWork: {},
      discoveredIssues: [],
      filesModified: [],
      notes: [],
      decisions: [],
    };
  }

  // --- Orchestrator writes ---

  setTaskContext(context: string): void {
    this.data.taskContext = context;
  }

  setCodebaseMap(map: string): void {
    this.data.codebaseMap = map;
  }

  // --- Sub-agent writes ---

  addResult(agentId: string, result: AgentResult): void {
    this.data.completedWork[agentId] = result;
    if (result.filesModified.length > 0) {
      for (const f of result.filesModified) {
        if (!this.data.filesModified.includes(f)) {
          this.data.filesModified.push(f);
        }
      }
    }
  }

  addFinding(finding: Finding): void {
    this.data.sharedFindings.push(finding);
  }

  addIssue(issue: Issue): void {
    this.data.discoveredIssues.push(issue);
  }

  addNote(note: Note): void {
    this.data.notes.push(note);
  }

  addDecision(decision: Decision): void {
    this.data.decisions.push(decision);
  }

  // --- Reads (any agent) ---

  getTaskContext(): string {
    return this.data.taskContext;
  }

  getCodebaseMap(): string {
    return this.data.codebaseMap;
  }

  getCompletedWork(): Record<string, AgentResult> {
    return { ...this.data.completedWork };
  }

  getFindings(): Finding[] {
    return [...this.data.sharedFindings];
  }

  getIssues(): Issue[] {
    return [...this.data.discoveredIssues];
  }

  getNotes(): Note[] {
    return [...this.data.notes];
  }

  getDecisions(): Decision[] {
    return [...this.data.decisions];
  }

  getModifiedFiles(): string[] {
    return [...this.data.filesModified];
  }

  /** Get a summary of all work done so far — used by orchestrator to synthesize */
  getSummary(): string {
    const lines: string[] = [];
    lines.push(`Task: ${this.data.taskContext.substring(0, 200)}`);
    lines.push(`Files modified: ${this.data.filesModified.length}`);

    const completed = Object.entries(this.data.completedWork);
    if (completed.length > 0) {
      lines.push(`\nCompleted work (${completed.length} agents):`);
      for (const [agentId, result] of completed) {
        lines.push(`  ${agentId}: ${result.status} — ${result.output.substring(0, 150)}`);
      }
    }

    if (this.data.discoveredIssues.length > 0) {
      lines.push(`\nIssues found: ${this.data.discoveredIssues.length}`);
      for (const issue of this.data.discoveredIssues.slice(0, 5)) {
        lines.push(`  [${issue.severity}] ${issue.message}`);
      }
    }

    if (this.data.decisions.length > 0) {
      lines.push(`\nDecisions:`);
      for (const dec of this.data.decisions.slice(-5)) {
        lines.push(`  ${dec.description} — reason: ${dec.reason}`);
      }
    }

    return lines.join('\n');
  }

  /** Reset for a new task */
  reset(): void {
    this.data = {
      taskContext: '',
      codebaseMap: '',
      sharedFindings: [],
      completedWork: {},
      discoveredIssues: [],
      filesModified: [],
      notes: [],
      decisions: [],
    };
  }
}
