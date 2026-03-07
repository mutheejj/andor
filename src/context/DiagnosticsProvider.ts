import * as vscode from 'vscode';
import { DiagnosticContext } from '../types/core';

export class DiagnosticsProvider {
  private diagnostics: Map<string, DiagnosticContext[]> = new Map();
  private onDiagnosticsChangeCallback?: (newErrors: DiagnosticContext[]) => void;
  private previousErrorCount: number = 0;

  constructor() {
    this.setupDiagnosticsListener();
    this.collectInitialDiagnostics();
  }

  private setupDiagnosticsListener(): void {
    vscode.languages.onDidChangeDiagnostics(event => {
      this.handleDiagnosticsChange(event);
    });
  }

  private collectInitialDiagnostics(): void {
    const allDiagnostics = vscode.languages.getDiagnostics();
    
    for (const [uri, diagnostics] of allDiagnostics) {
      this.processDiagnostics(uri, diagnostics);
    }
  }

  private handleDiagnosticsChange(event: vscode.DiagnosticChangeEvent): void {
    const previousErrors = this.getAllErrors();
    const previousErrorFiles = new Set(previousErrors.map(e => e.file));

    for (const uri of event.uris) {
      const diagnostics = vscode.languages.getDiagnostics(uri);
      this.processDiagnostics(uri, diagnostics);
    }

    const currentErrors = this.getAllErrors();
    const newErrors = currentErrors.filter(error => {
      const wasInPreviousFiles = previousErrorFiles.has(error.file);
      if (!wasInPreviousFiles) return true;

      const previousFileErrors = previousErrors.filter(e => e.file === error.file);
      return !previousFileErrors.some(prev => 
        prev.line === error.line && 
        prev.message === error.message
      );
    });

    if (newErrors.length > 0 && this.onDiagnosticsChangeCallback) {
      this.onDiagnosticsChangeCallback(newErrors);
    }

    this.previousErrorCount = currentErrors.length;
  }

  private processDiagnostics(uri: vscode.Uri, diagnostics: readonly vscode.Diagnostic[]): void {
    const filePath = uri.fsPath;
    const contexts: DiagnosticContext[] = [];

    for (const diagnostic of diagnostics) {
      if (diagnostic.severity === vscode.DiagnosticSeverity.Error ||
          diagnostic.severity === vscode.DiagnosticSeverity.Warning) {
        contexts.push({
          file: filePath,
          line: diagnostic.range.start.line + 1,
          severity: diagnostic.severity === vscode.DiagnosticSeverity.Error ? 'error' : 'warning',
          message: diagnostic.message,
          source: diagnostic.source
        });
      }
    }

    if (contexts.length > 0) {
      this.diagnostics.set(filePath, contexts);
    } else {
      this.diagnostics.delete(filePath);
    }
  }

  getAllDiagnostics(): DiagnosticContext[] {
    const all: DiagnosticContext[] = [];
    for (const contexts of this.diagnostics.values()) {
      all.push(...contexts);
    }
    return all;
  }

  getAllErrors(): DiagnosticContext[] {
    return this.getAllDiagnostics().filter(d => d.severity === 'error');
  }

  getAllWarnings(): DiagnosticContext[] {
    return this.getAllDiagnostics().filter(d => d.severity === 'warning');
  }

  getDiagnosticsForFile(filePath: string): DiagnosticContext[] {
    return this.diagnostics.get(filePath) || [];
  }

  getErrorsForFile(filePath: string): DiagnosticContext[] {
    return this.getDiagnosticsForFile(filePath).filter(d => d.severity === 'error');
  }

  hasErrors(): boolean {
    return this.getAllErrors().length > 0;
  }

  getErrorCount(): number {
    return this.getAllErrors().length;
  }

  getWarningCount(): number {
    return this.getAllWarnings().length;
  }

  setOnDiagnosticsChangeCallback(callback: (newErrors: DiagnosticContext[]) => void): void {
    this.onDiagnosticsChangeCallback = callback;
  }

  getFilesWithErrors(): string[] {
    const files = new Set<string>();
    for (const error of this.getAllErrors()) {
      files.add(error.file);
    }
    return Array.from(files);
  }

  getFilesWithWarnings(): string[] {
    const files = new Set<string>();
    for (const warning of this.getAllWarnings()) {
      files.add(warning.file);
    }
    return Array.from(files);
  }

  formatDiagnosticsForContext(): string {
    const errors = this.getAllErrors();
    const warnings = this.getAllWarnings();

    if (errors.length === 0 && warnings.length === 0) {
      return 'No diagnostics';
    }

    const lines: string[] = [];

    if (errors.length > 0) {
      lines.push(`## Errors (${errors.length})`);
      for (const error of errors.slice(0, 20)) {
        lines.push(`- ${error.file}:${error.line} - ${error.message}`);
      }
      if (errors.length > 20) {
        lines.push(`... and ${errors.length - 20} more errors`);
      }
    }

    if (warnings.length > 0) {
      lines.push(`\n## Warnings (${warnings.length})`);
      for (const warning of warnings.slice(0, 10)) {
        lines.push(`- ${warning.file}:${warning.line} - ${warning.message}`);
      }
      if (warnings.length > 10) {
        lines.push(`... and ${warnings.length - 10} more warnings`);
      }
    }

    return lines.join('\n');
  }

  clear(): void {
    this.diagnostics.clear();
    this.previousErrorCount = 0;
  }
}
