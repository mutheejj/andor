export interface ParsedTerminalOutput {
  exitCode: number;
  stdout: string;
  stderr: string;
  errors: ParsedError[];
  warnings: ParsedWarning[];
  isSuccess: boolean;
  suggestedFix?: string;
}

export interface ParsedError {
  type: 'typescript' | 'eslint' | 'runtime' | 'build' | 'test' | 'npm' | 'unknown';
  file?: string;
  line?: number;
  column?: number;
  message: string;
  code?: string;
  fixable: boolean;
}

export interface ParsedWarning {
  type: string;
  file?: string;
  line?: number;
  message: string;
}

// TypeScript: src/file.ts(10,5): error TS2304: Cannot find name 'x'
const TS_ERROR_RE = /([^\s(]+)\((\d+),(\d+)\):\s*error\s+(TS\d+):\s*(.+)/g;
// Also: src/file.ts:10:5 - error TS2304: ...
const TS_ERROR_ALT_RE = /([^\s:]+):(\d+):(\d+)\s*-\s*error\s+(TS\d+):\s*(.+)/g;

// ESLint: /path/file.ts:10:5: error no-unused-vars ...
const ESLINT_RE = /([^\s:]+):(\d+):(\d+):\s*(error|warning)\s+(.+?)(?:\s{2,}|\n|$)/g;

// Jest: ● Test Suite › test name
const JEST_FAIL_RE = /●\s+(.+?)(?:\n\s+expect\(.*\)\.(.+)\n\s+Expected:\s*(.+)\n\s+Received:\s*(.+))?/g;

// npm ERR!
const NPM_ERR_RE = /npm ERR!\s*(.+)/g;

// Runtime error with stack trace
const RUNTIME_ERR_RE = /(?:Error|TypeError|ReferenceError|SyntaxError|RangeError):\s*(.+)\n\s+at\s+(?:\S+\s+\()?([^:]+):(\d+):(\d+)/g;

// Build errors (webpack/vite/esbuild)
const BUILD_ERR_RE = /(?:ERROR|error)\s+(?:in\s+)?([^\s:]+?)(?::(\d+):(\d+))?\s*[\n:]\s*(.+)/g;

export class TerminalParser {
  /**
   * Parse terminal output into structured errors and warnings.
   */
  static parse(output: string, exitCode: number = 0): ParsedTerminalOutput {
    const errors: ParsedError[] = [];
    const warnings: ParsedWarning[] = [];

    // Split stdout/stderr heuristically
    const stderr = output.includes('ERR!') || output.includes('error')
      ? output : '';
    const stdout = output;

    // Parse TypeScript errors
    TerminalParser.matchAll(TS_ERROR_RE, output, (m) => {
      errors.push({
        type: 'typescript',
        file: m[1],
        line: parseInt(m[2]),
        column: parseInt(m[3]),
        code: m[4],
        message: m[5].trim(),
        fixable: TerminalParser.isTSFixable(m[4]),
      });
    });

    TerminalParser.matchAll(TS_ERROR_ALT_RE, output, (m) => {
      // Avoid duplicates
      const alreadyFound = errors.some(e =>
        e.file === m[1] && e.line === parseInt(m[2]) && e.code === m[4]
      );
      if (!alreadyFound) {
        errors.push({
          type: 'typescript',
          file: m[1],
          line: parseInt(m[2]),
          column: parseInt(m[3]),
          code: m[4],
          message: m[5].trim(),
          fixable: TerminalParser.isTSFixable(m[4]),
        });
      }
    });

    // Parse ESLint errors
    TerminalParser.matchAll(ESLINT_RE, output, (m) => {
      const severity = m[4];
      if (severity === 'error') {
        errors.push({
          type: 'eslint',
          file: m[1],
          line: parseInt(m[2]),
          column: parseInt(m[3]),
          message: m[5].trim(),
          fixable: true, // ESLint errors are often auto-fixable
        });
      } else {
        warnings.push({
          type: 'eslint',
          file: m[1],
          line: parseInt(m[2]),
          message: m[5].trim(),
        });
      }
    });

    // Parse Jest failures
    TerminalParser.matchAll(JEST_FAIL_RE, output, (m) => {
      errors.push({
        type: 'test',
        message: m[1].trim() + (m[2] ? ` — expected ${m[3]}, received ${m[4]}` : ''),
        fixable: false,
      });
    });

    // Parse npm errors
    TerminalParser.matchAll(NPM_ERR_RE, output, (m) => {
      const msg = m[1].trim();
      if (msg && !msg.startsWith('A complete log')) {
        errors.push({
          type: 'npm',
          message: msg,
          fixable: msg.includes('ENOENT') || msg.includes('missing') || msg.includes('not found'),
        });
      }
    });

    // Parse runtime errors with stack traces
    TerminalParser.matchAll(RUNTIME_ERR_RE, output, (m) => {
      errors.push({
        type: 'runtime',
        message: m[1].trim(),
        file: m[2],
        line: parseInt(m[3]),
        column: parseInt(m[4]),
        fixable: false,
      });
    });

    // Parse build errors if nothing else matched
    if (errors.length === 0) {
      TerminalParser.matchAll(BUILD_ERR_RE, output, (m) => {
        errors.push({
          type: 'build',
          file: m[1] !== 'in' ? m[1] : undefined,
          line: m[2] ? parseInt(m[2]) : undefined,
          column: m[3] ? parseInt(m[3]) : undefined,
          message: m[4].trim(),
          fixable: false,
        });
      });
    }

    const isSuccess = exitCode === 0 && errors.length === 0;

    return {
      exitCode,
      stdout,
      stderr,
      errors,
      warnings,
      isSuccess,
      suggestedFix: errors.length > 0
        ? TerminalParser.suggestFix(errors)
        : undefined,
    };
  }

  /** Group errors by file for efficient fixing */
  static groupByFile(errors: ParsedError[]): Map<string, ParsedError[]> {
    const groups = new Map<string, ParsedError[]>();
    for (const err of errors) {
      const key = err.file ?? '<unknown>';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(err);
    }
    return groups;
  }

  /** Format errors for AI context (include in prompt for debugger agent) */
  static formatForAI(parsed: ParsedTerminalOutput): string {
    if (parsed.isSuccess) return 'Command succeeded with no errors.';

    const lines: string[] = [];
    lines.push(`Exit code: ${parsed.exitCode}`);
    lines.push(`Errors: ${parsed.errors.length}, Warnings: ${parsed.warnings.length}`);

    if (parsed.errors.length > 0) {
      lines.push('\nErrors:');
      const grouped = TerminalParser.groupByFile(parsed.errors);
      for (const [file, errs] of grouped) {
        lines.push(`\n  ${file}:`);
        for (const err of errs) {
          const loc = err.line ? `:${err.line}:${err.column ?? 0}` : '';
          const code = err.code ? ` [${err.code}]` : '';
          lines.push(`    ${err.type}${code}${loc} — ${err.message}`);
        }
      }
    }

    if (parsed.suggestedFix) {
      lines.push(`\nSuggested approach: ${parsed.suggestedFix}`);
    }

    return lines.join('\n');
  }

  private static matchAll(
    regex: RegExp,
    text: string,
    handler: (match: RegExpExecArray) => void,
  ): void {
    // Reset regex state
    regex.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      handler(match);
    }
  }

  private static isTSFixable(code: string): boolean {
    // Common auto-fixable TypeScript errors
    const fixable = new Set([
      'TS2304', // Cannot find name — often missing import
      'TS2305', // Module has no exported member — wrong import
      'TS2307', // Cannot find module — missing dependency
      'TS2345', // Argument type mismatch — fixable type
      'TS2322', // Type not assignable — fixable
      'TS6133', // Declared but never used
      'TS2339', // Property does not exist — missing interface field
    ]);
    return fixable.has(code);
  }

  private static suggestFix(errors: ParsedError[]): string {
    const types = new Set(errors.map(e => e.type));

    if (types.has('typescript')) {
      const codes = errors.filter(e => e.code).map(e => e.code);
      if (codes.includes('TS2307')) return 'Install missing dependencies or fix import paths';
      if (codes.includes('TS2304')) return 'Add missing imports or declare missing types';
      return 'Fix TypeScript type errors in the listed files';
    }

    if (types.has('npm')) {
      return 'Run npm install or fix package.json dependencies';
    }

    if (types.has('test')) {
      return 'Update test expectations or fix the code under test';
    }

    if (types.has('eslint')) {
      return 'Fix linting errors — consider running eslint --fix';
    }

    return 'Read the error messages above and fix the root cause';
  }
}
