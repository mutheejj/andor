import * as vscode from 'vscode';
import * as path from 'path';
import { DiagnosticEntry } from '../types';

export class DiagnosticsWatcher {
  private diagnostics: DiagnosticEntry[] = [];
  private onChangeCallbacks: Array<(diagnostics: DiagnosticEntry[]) => void> = [];
  private disposable: vscode.Disposable;
  private workspaceRoot: string;

  constructor() {
    this.workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
    this.disposable = vscode.languages.onDidChangeDiagnostics((e) => {
      this.handleDiagnosticsChange(e.uris);
    });
    this.collectAll();
  }

  onChange(callback: (diagnostics: DiagnosticEntry[]) => void): void {
    this.onChangeCallbacks.push(callback);
  }

  getDiagnostics(): DiagnosticEntry[] {
    return this.diagnostics;
  }

  private handleDiagnosticsChange(uris: readonly vscode.Uri[]): void {
    this.collectAll();
    for (const cb of this.onChangeCallbacks) {
      cb(this.diagnostics);
    }
  }

  private collectAll(): void {
    this.diagnostics = [];
    const allDiagnostics = vscode.languages.getDiagnostics();

    for (const [uri, diags] of allDiagnostics) {
      const filePath = uri.fsPath;
      if (!this.workspaceRoot || !filePath.startsWith(this.workspaceRoot)) {
        continue;
      }

      const relativePath = path.relative(this.workspaceRoot, filePath);
      if (relativePath.includes('node_modules')) {
        continue;
      }

      for (const diag of diags) {
        if (diag.severity > vscode.DiagnosticSeverity.Warning) {
          continue;
        }

        this.diagnostics.push({
          file: relativePath,
          line: diag.range.start.line + 1,
          column: diag.range.start.character + 1,
          message: diag.message,
          severity: this.mapSeverity(diag.severity),
          source: diag.source || 'unknown',
        });
      }
    }
  }

  private mapSeverity(severity: vscode.DiagnosticSeverity): DiagnosticEntry['severity'] {
    switch (severity) {
      case vscode.DiagnosticSeverity.Error: return 'error';
      case vscode.DiagnosticSeverity.Warning: return 'warning';
      case vscode.DiagnosticSeverity.Information: return 'info';
      case vscode.DiagnosticSeverity.Hint: return 'hint';
      default: return 'info';
    }
  }

  dispose(): void {
    this.disposable.dispose();
    this.onChangeCallbacks = [];
  }
}
