import * as vscode from 'vscode';
import * as path from 'path';
import * as crypto from 'crypto';
import {
  ParsedFile,
  FunctionSymbol,
  ClassSymbol,
  ImportSymbol,
  ExportSymbol,
  TypeSymbol,
  PropertySymbol
} from '../types/core';

export class CodeParser {
  private parseCache: Map<string, ParsedFile> = new Map();

  async parseFile(filePath: string): Promise<ParsedFile | null> {
    try {
      const uri = vscode.Uri.file(filePath);
      const document = await vscode.workspace.openTextDocument(uri);
      const content = document.getText();
      const hash = this.computeHash(content);

      const cached = this.parseCache.get(filePath);
      if (cached && cached.hash === hash) {
        return cached;
      }

      const language = document.languageId;
      const parsed = await this.parseWithVSCodeSymbols(document, filePath, hash);

      if (parsed) {
        this.parseCache.set(filePath, parsed);
        return parsed;
      }

      const fallbackParsed = this.parseWithRegex(content, filePath, language, hash);
      this.parseCache.set(filePath, fallbackParsed);
      return fallbackParsed;
    } catch (error) {
      console.error(`Error parsing file ${filePath}:`, error);
      return null;
    }
  }

  private async parseWithVSCodeSymbols(
    document: vscode.TextDocument,
    filePath: string,
    hash: string
  ): Promise<ParsedFile | null> {
    try {
      const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
        'vscode.executeDocumentSymbolProvider',
        document.uri
      );

      if (!symbols || symbols.length === 0) {
        return null;
      }

      const functions: FunctionSymbol[] = [];
      const classes: ClassSymbol[] = [];
      const types: TypeSymbol[] = [];
      const imports: ImportSymbol[] = [];
      const exports: ExportSymbol[] = [];

      for (const symbol of symbols) {
        this.processSymbol(symbol, document, functions, classes, types);
      }

      const content = document.getText();
      const regexImports = this.extractImports(content, document.languageId);
      imports.push(...regexImports);

      const regexExports = this.extractExports(content, document.languageId);
      exports.push(...regexExports);

      const todos = this.extractTodos(content);

      return {
        path: filePath,
        language: document.languageId,
        functions,
        classes,
        imports,
        exports,
        types,
        todos,
        lastParsed: Date.now(),
        hash
      };
    } catch (error) {
      console.error('VS Code symbols parsing failed:', error);
      return null;
    }
  }

  private processSymbol(
    symbol: vscode.DocumentSymbol,
    document: vscode.TextDocument,
    functions: FunctionSymbol[],
    classes: ClassSymbol[],
    types: TypeSymbol[]
  ): void {
    const startLine = symbol.range.start.line + 1;
    const endLine = symbol.range.end.line + 1;

    switch (symbol.kind) {
      case vscode.SymbolKind.Function:
      case vscode.SymbolKind.Method:
        functions.push({
          name: symbol.name,
          signature: this.extractSignature(document, symbol),
          startLine,
          endLine,
          params: this.extractParams(symbol.name),
          returnType: symbol.detail
        });
        break;

      case vscode.SymbolKind.Class:
        const methods: FunctionSymbol[] = [];
        const properties: PropertySymbol[] = [];

        for (const child of symbol.children) {
          if (child.kind === vscode.SymbolKind.Method) {
            methods.push({
              name: child.name,
              signature: this.extractSignature(document, child),
              startLine: child.range.start.line + 1,
              endLine: child.range.end.line + 1,
              params: this.extractParams(child.name),
              returnType: child.detail
            });
          } else if (child.kind === vscode.SymbolKind.Property || child.kind === vscode.SymbolKind.Field) {
            properties.push({
              name: child.name,
              type: child.detail,
              line: child.range.start.line + 1
            });
          }
        }

        classes.push({
          name: symbol.name,
          startLine,
          endLine,
          methods,
          properties
        });
        break;

      case vscode.SymbolKind.Interface:
        types.push({
          name: symbol.name,
          kind: 'interface',
          line: startLine
        });
        break;

      case vscode.SymbolKind.TypeParameter:
      case vscode.SymbolKind.Enum:
        types.push({
          name: symbol.name,
          kind: symbol.kind === vscode.SymbolKind.Enum ? 'enum' : 'type',
          line: startLine
        });
        break;
    }

    for (const child of symbol.children) {
      this.processSymbol(child, document, functions, classes, types);
    }
  }

  private extractSignature(document: vscode.TextDocument, symbol: vscode.DocumentSymbol): string {
    const line = document.lineAt(symbol.range.start.line);
    return line.text.trim();
  }

  private extractParams(signature: string): string[] {
    const match = signature.match(/\(([^)]*)\)/);
    if (!match) return [];
    return match[1].split(',').map(p => p.trim()).filter(p => p.length > 0);
  }

  private parseWithRegex(content: string, filePath: string, language: string, hash: string): ParsedFile {
    const functions: FunctionSymbol[] = [];
    const classes: ClassSymbol[] = [];
    const imports: ImportSymbol[] = [];
    const exports: ExportSymbol[] = [];
    const types: TypeSymbol[] = [];

    const lines = content.split('\n');

    if (language === 'typescript' || language === 'javascript') {
      this.parseTypeScriptRegex(lines, functions, classes, types);
    } else if (language === 'python') {
      this.parsePythonRegex(lines, functions, classes);
    }

    imports.push(...this.extractImports(content, language));
    exports.push(...this.extractExports(content, language));
    const todos = this.extractTodos(content);

    return {
      path: filePath,
      language,
      functions,
      classes,
      imports,
      exports,
      types,
      todos,
      lastParsed: Date.now(),
      hash
    };
  }

  private parseTypeScriptRegex(
    lines: string[],
    functions: FunctionSymbol[],
    classes: ClassSymbol[],
    types: TypeSymbol[]
  ): void {
    const functionRegex = /(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\)/;
    const arrowFunctionRegex = /(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s*)?\(([^)]*)\)\s*=>/;
    const classRegex = /(?:export\s+)?class\s+(\w+)/;
    const interfaceRegex = /(?:export\s+)?interface\s+(\w+)/;
    const typeRegex = /(?:export\s+)?type\s+(\w+)/;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      const lineNum = i + 1;

      let match = functionRegex.exec(line) || arrowFunctionRegex.exec(line);
      if (match) {
        functions.push({
          name: match[1],
          signature: line,
          startLine: lineNum,
          endLine: lineNum,
          params: match[2].split(',').map(p => p.trim()).filter(p => p.length > 0)
        });
      }

      match = classRegex.exec(line);
      if (match) {
        classes.push({
          name: match[1],
          startLine: lineNum,
          endLine: lineNum,
          methods: [],
          properties: []
        });
      }

      match = interfaceRegex.exec(line);
      if (match) {
        types.push({
          name: match[1],
          kind: 'interface',
          line: lineNum
        });
      }

      match = typeRegex.exec(line);
      if (match) {
        types.push({
          name: match[1],
          kind: 'type',
          line: lineNum
        });
      }
    }
  }

  private parsePythonRegex(lines: string[], functions: FunctionSymbol[], classes: ClassSymbol[]): void {
    const functionRegex = /def\s+(\w+)\s*\(([^)]*)\)/;
    const classRegex = /class\s+(\w+)/;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      const lineNum = i + 1;

      let match = functionRegex.exec(line);
      if (match) {
        functions.push({
          name: match[1],
          signature: line,
          startLine: lineNum,
          endLine: lineNum,
          params: match[2].split(',').map(p => p.trim()).filter(p => p.length > 0)
        });
      }

      match = classRegex.exec(line);
      if (match) {
        classes.push({
          name: match[1],
          startLine: lineNum,
          endLine: lineNum,
          methods: [],
          properties: []
        });
      }
    }
  }

  private extractImports(content: string, language: string): ImportSymbol[] {
    const imports: ImportSymbol[] = [];
    const lines = content.split('\n');

    if (language === 'typescript' || language === 'javascript') {
      const importRegex = /import\s+(?:{([^}]+)}|(\w+))\s+from\s+['"]([^'"]+)['"]/;
      const requireRegex = /(?:const|let|var)\s+(?:{([^}]+)}|(\w+))\s*=\s*require\(['"]([^'"]+)['"]\)/;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        let match = importRegex.exec(line) || requireRegex.exec(line);
        if (match) {
          const imported = match[1] ? match[1].split(',').map(s => s.trim()) : [match[2]];
          imports.push({
            imported,
            from: match[3],
            line: i + 1
          });
        }
      }
    } else if (language === 'python') {
      const importRegex = /from\s+(\S+)\s+import\s+(.+)|import\s+(.+)/;
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        const match = importRegex.exec(line);
        if (match) {
          if (match[1]) {
            imports.push({
              imported: match[2].split(',').map(s => s.trim()),
              from: match[1],
              line: i + 1
            });
          } else if (match[3]) {
            imports.push({
              imported: match[3].split(',').map(s => s.trim()),
              from: '',
              line: i + 1
            });
          }
        }
      }
    }

    return imports;
  }

  private extractExports(content: string, language: string): ExportSymbol[] {
    const exports: ExportSymbol[] = [];
    const lines = content.split('\n');

    if (language === 'typescript' || language === 'javascript') {
      const exportRegex = /export\s+(?:(default)\s+)?(?:(function|class|const|type|interface)\s+)?(\w+)/;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        const match = exportRegex.exec(line);
        if (match) {
          exports.push({
            name: match[3],
            type: (match[1] ? 'default' : match[2] || 'const') as any,
            line: i + 1
          });
        }
      }
    }

    return exports;
  }

  private extractTodos(content: string): string[] {
    const todos: string[] = [];
    const todoRegex = /\/\/\s*(TODO|FIXME|NOTE|HACK|XXX):?\s*(.+)/gi;
    let match;

    while ((match = todoRegex.exec(content)) !== null) {
      todos.push(`${match[1]}: ${match[2].trim()}`);
    }

    return todos;
  }

  private computeHash(content: string): string {
    return crypto.createHash('md5').update(content).digest('hex');
  }

  clearCache(): void {
    this.parseCache.clear();
  }

  getCachedFile(filePath: string): ParsedFile | undefined {
    return this.parseCache.get(filePath);
  }
}
