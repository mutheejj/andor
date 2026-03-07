export interface FunctionSymbol {
  name: string;
  signature: string;
  startLine: number;
  endLine: number;
  params: string[];
  returnType?: string;
}

export interface ClassSymbol {
  name: string;
  startLine: number;
  endLine: number;
  methods: FunctionSymbol[];
  properties: PropertySymbol[];
  extends?: string;
  implements?: string[];
}

export interface PropertySymbol {
  name: string;
  type?: string;
  line: number;
}

export interface ImportSymbol {
  imported: string[];
  from: string;
  line: number;
}

export interface ExportSymbol {
  name: string;
  type: 'function' | 'class' | 'const' | 'type' | 'interface' | 'default';
  line: number;
}

export interface TypeSymbol {
  name: string;
  kind: 'interface' | 'type' | 'enum';
  line: number;
}

export interface ParsedFile {
  path: string;
  language: string;
  functions: FunctionSymbol[];
  classes: ClassSymbol[];
  imports: ImportSymbol[];
  exports: ExportSymbol[];
  types: TypeSymbol[];
  todos: string[];
  lastParsed: number;
  hash: string;
}

export interface SymbolLocation {
  file: string;
  line: number;
  type: 'function' | 'class' | 'method' | 'property' | 'type';
}

export interface TechStack {
  languages: string[];
  frameworks: string[];
  buildTools: string[];
  packageManager?: string;
  runtime?: string;
}

export interface IndexStats {
  totalFiles: number;
  parsedFiles: number;
  totalSymbols: number;
  lastFullIndex: number;
  indexDuration: number;
}

export interface CodebaseIndex {
  repoMap: string;
  files: Map<string, ParsedFile>;
  symbols: Map<string, SymbolLocation[]>;
  techStack: TechStack;
  lastFullIndex: number;
  stats: IndexStats;
}

export interface IncludedFile {
  path: string;
  content: string;
  reason: string;
  relevanceScore: number;
  tokens: number;
  truncated: boolean;
}

export interface DiagnosticContext {
  file: string;
  line: number;
  severity: 'error' | 'warning' | 'info';
  message: string;
  source?: string;
}

export interface RecentChange {
  file: string;
  timestamp: number;
  changeType: 'create' | 'modify' | 'delete';
}

export interface AssembledContext {
  repoMap: string;
  includedFiles: IncludedFile[];
  diagnostics: DiagnosticContext[];
  recentChanges: RecentChange[];
  totalTokens: number;
  droppedFiles: string[];
}

export interface AgentStep {
  id: string;
  type: 'plan' | 'read' | 'write' | 'run' | 'verify' | 'report';
  status: 'pending' | 'running' | 'done' | 'failed';
  description: string;
  result?: string;
  timestamp: number;
  error?: string;
}

export interface LearnedFact {
  fact: string;
  confidence: number;
  timestamp: number;
}

export interface UserPreference {
  key: string;
  value: string;
  timestamp: number;
}

export interface TaskSummary {
  id: string;
  description: string;
  filesChanged: string[];
  timestamp: number;
  success: boolean;
}

export interface ProjectMemory {
  projectId: string;
  techStack: TechStack;
  learnedFacts: LearnedFact[];
  userPreferences: UserPreference[];
  taskHistory: TaskSummary[];
  lastUpdated: number;
}

export interface SessionMemory {
  conversationHistory: any[];
  fileChanges: Map<string, string>;
  commandsRun: string[];
  currentTask?: AgentStep[];
}

export interface WorkspaceSnapshot {
  id: string;
  timestamp: number;
  description: string;
  diff: string;
}
