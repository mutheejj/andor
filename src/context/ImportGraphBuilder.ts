import * as path from 'path';
import * as fs from 'fs';
import { WorkspaceIndexer } from '../indexer/WorkspaceIndexer';

export interface FileNode {
  path: string;
  relativePath: string;
  language: string;
  lastIndexed: number;
}

export interface ImportGraph {
  nodes: Map<string, FileNode>;
  edges: Map<string, Set<string>>;        // file → files it imports
  reverseEdges: Map<string, Set<string>>; // file → files that import it
  lastBuilt: number;
}

const EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];

export class ImportGraphBuilder {
  private graph: ImportGraph;
  private workspaceRoot: string;

  constructor(private indexer: WorkspaceIndexer) {
    this.workspaceRoot = indexer.getWorkspaceRoot();
    this.graph = {
      nodes: new Map(),
      edges: new Map(),
      reverseEdges: new Map(),
      lastBuilt: 0,
    };
  }

  getGraph(): ImportGraph {
    return this.graph;
  }

  /** Build the full import graph from the workspace index */
  build(): void {
    const index = this.indexer.getIndex();
    this.graph.nodes.clear();
    this.graph.edges.clear();
    this.graph.reverseEdges.clear();

    // Populate nodes
    for (const [filePath, fileInfo] of index.files) {
      this.graph.nodes.set(filePath, {
        path: filePath,
        relativePath: fileInfo.relativePath,
        language: fileInfo.language,
        lastIndexed: Date.now(),
      });
    }

    // Build edges from imports
    for (const [filePath, imports] of index.imports) {
      const targets = new Set<string>();

      for (const imp of imports) {
        const resolved = this.resolveImport(imp.source, filePath);
        if (resolved && this.graph.nodes.has(resolved)) {
          targets.add(resolved);

          // Reverse edge
          if (!this.graph.reverseEdges.has(resolved)) {
            this.graph.reverseEdges.set(resolved, new Set());
          }
          this.graph.reverseEdges.get(resolved)!.add(filePath);
        }
      }

      if (targets.size > 0) {
        this.graph.edges.set(filePath, targets);
      }
    }

    this.graph.lastBuilt = Date.now();
  }

  /** Rebuild only the subgraph affected by a file change */
  rebuildForFile(filePath: string): void {
    // Remove old edges from this file
    const oldTargets = this.graph.edges.get(filePath);
    if (oldTargets) {
      for (const target of oldTargets) {
        this.graph.reverseEdges.get(target)?.delete(filePath);
      }
    }
    this.graph.edges.delete(filePath);

    // Re-parse imports for this file
    const index = this.indexer.getIndex();
    const imports = index.imports.get(filePath);
    if (!imports) return;

    const newTargets = new Set<string>();
    for (const imp of imports) {
      const resolved = this.resolveImport(imp.source, filePath);
      if (resolved && this.graph.nodes.has(resolved)) {
        newTargets.add(resolved);
        if (!this.graph.reverseEdges.has(resolved)) {
          this.graph.reverseEdges.set(resolved, new Set());
        }
        this.graph.reverseEdges.get(resolved)!.add(filePath);
      }
    }

    if (newTargets.size > 0) {
      this.graph.edges.set(filePath, newTargets);
    }
  }

  /** Get direct imports of a file */
  getImportsOf(filePath: string): string[] {
    return Array.from(this.graph.edges.get(filePath) ?? []);
  }

  /** Get files that import a given file */
  getImportersOf(filePath: string): string[] {
    return Array.from(this.graph.reverseEdges.get(filePath) ?? []);
  }

  /** Get transitive imports (2nd degree) */
  getTransitiveImports(filePath: string, maxDepth: number = 2): Set<string> {
    const visited = new Set<string>();
    const queue: Array<{ file: string; depth: number }> = [{ file: filePath, depth: 0 }];

    while (queue.length > 0) {
      const { file, depth } = queue.shift()!;
      if (visited.has(file) || depth > maxDepth) continue;
      visited.add(file);

      const imports = this.graph.edges.get(file);
      if (imports) {
        for (const imp of imports) {
          if (!visited.has(imp)) {
            queue.push({ file: imp, depth: depth + 1 });
          }
        }
      }
    }

    visited.delete(filePath); // Don't include self
    return visited;
  }

  private resolveImport(importSource: string, fromFile: string): string | null {
    // Only resolve relative imports
    if (!importSource.startsWith('.')) return null;

    const dir = path.dirname(fromFile);

    // Try direct file with extensions
    for (const ext of EXTENSIONS) {
      const candidate = path.resolve(dir, importSource + ext);
      if (fs.existsSync(candidate)) return candidate;
    }

    // Try index files
    for (const ext of EXTENSIONS) {
      const candidate = path.resolve(dir, importSource, 'index' + ext);
      if (fs.existsSync(candidate)) return candidate;
    }

    // Try exact path (e.g. .json, .css)
    const exact = path.resolve(dir, importSource);
    if (fs.existsSync(exact)) return exact;

    return null;
  }
}
