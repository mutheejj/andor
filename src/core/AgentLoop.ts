import * as vscode from 'vscode';
import { AgentStep } from '../types/core';
import { ContextAssembler } from '../context/ContextAssembler';
import { DiagnosticsProvider } from '../context/DiagnosticsProvider';
import { MemoryManager } from '../memory/MemoryManager';

export interface AgentLoopCallbacks {
  onStepStart: (step: AgentStep) => void;
  onStepComplete: (step: AgentStep) => void;
  onStepFailed: (step: AgentStep) => void;
  onTaskComplete: (success: boolean) => void;
}

export class AgentLoop {
  private contextAssembler: ContextAssembler;
  private diagnosticsProvider: DiagnosticsProvider;
  private memoryManager: MemoryManager;
  private callbacks: AgentLoopCallbacks;
  private currentSteps: AgentStep[] = [];
  private isRunning: boolean = false;
  private shouldAbort: boolean = false;

  constructor(
    contextAssembler: ContextAssembler,
    diagnosticsProvider: DiagnosticsProvider,
    memoryManager: MemoryManager,
    callbacks: AgentLoopCallbacks
  ) {
    this.contextAssembler = contextAssembler;
    this.diagnosticsProvider = diagnosticsProvider;
    this.memoryManager = memoryManager;
    this.callbacks = callbacks;
  }

  async executeTask(userMessage: string, streamChat: (prompt: string) => Promise<string>): Promise<boolean> {
    if (this.isRunning) {
      throw new Error('Agent loop already running');
    }

    this.isRunning = true;
    this.shouldAbort = false;
    this.currentSteps = [];

    try {
      const planStep = this.createStep('plan', 'Planning approach to task');
      this.addStep(planStep);
      this.callbacks.onStepStart(planStep);

      const plan = await this.executePlanPhase(userMessage, streamChat);
      
      if (!plan) {
        planStep.status = 'failed';
        planStep.error = 'Failed to generate plan';
        this.callbacks.onStepFailed(planStep);
        return false;
      }

      planStep.result = plan;
      planStep.status = 'done';
      this.callbacks.onStepComplete(planStep);

      const actionSteps = this.parseActionSteps(plan);
      
      for (const actionStep of actionSteps) {
        if (this.shouldAbort) {
          break;
        }

        this.addStep(actionStep);
        this.callbacks.onStepStart(actionStep);

        const success = await this.executeActionStep(actionStep, streamChat);

        if (!success) {
          actionStep.status = 'failed';
          this.callbacks.onStepFailed(actionStep);

          const retryStep = this.createStep('verify', `Retrying failed step: ${actionStep.description}`);
          this.addStep(retryStep);
          this.callbacks.onStepStart(retryStep);

          const retrySuccess = await this.executeActionStep(actionStep, streamChat);
          
          if (retrySuccess) {
            retryStep.status = 'done';
            retryStep.result = 'Retry successful';
            this.callbacks.onStepComplete(retryStep);
          } else {
            retryStep.status = 'failed';
            retryStep.error = 'Retry failed';
            this.callbacks.onStepFailed(retryStep);
            this.callbacks.onTaskComplete(false);
            return false;
          }
        } else {
          actionStep.status = 'done';
          this.callbacks.onStepComplete(actionStep);
        }
      }

      const reportStep = this.createStep('report', 'Generating task summary');
      this.addStep(reportStep);
      this.callbacks.onStepStart(reportStep);

      const summary = await this.executeReportPhase(streamChat);
      reportStep.result = summary;
      reportStep.status = 'done';
      this.callbacks.onStepComplete(reportStep);

      await this.memoryManager.addTaskToHistory({
        id: Date.now().toString(),
        description: userMessage,
        filesChanged: Array.from(this.memoryManager.getFileChanges().keys()),
        timestamp: Date.now(),
        success: true
      });

      this.callbacks.onTaskComplete(true);
      return true;

    } catch (error) {
      console.error('Agent loop error:', error);
      this.callbacks.onTaskComplete(false);
      return false;
    } finally {
      this.isRunning = false;
    }
  }

  private async executePlanPhase(userMessage: string, streamChat: (prompt: string) => Promise<string>): Promise<string> {
    const context = await this.contextAssembler.assembleContext(
      userMessage,
      this.diagnosticsProvider.getAllDiagnostics()
    );

    const projectMemory = this.memoryManager.formatProjectMemoryForContext();
    const diagnosticsContext = this.diagnosticsProvider.formatDiagnosticsForContext();

    const planPrompt = `You are an expert software engineer. Create a detailed step-by-step plan to accomplish this task.

# Task
${userMessage}

# Project Context
${projectMemory}

# Repository Map
${context.repoMap}

# Current Diagnostics
${diagnosticsContext}

# Relevant Files
${context.includedFiles.map(f => `- ${f.path} (${f.reason})`).join('\n')}

Create a clear, actionable plan with specific steps. Each step should be one of:
- READ: Read and analyze a file
- WRITE: Create or modify a file
- RUN: Execute a command
- VERIFY: Check if changes work correctly

Format your response as a numbered list of steps.`;

    const response = await streamChat(planPrompt);
    return response;
  }

  private parseActionSteps(plan: string): AgentStep[] {
    const steps: AgentStep[] = [];
    const lines = plan.split('\n');
    
    for (const line of lines) {
      const match = line.match(/^\d+\.\s*(READ|WRITE|RUN|VERIFY):\s*(.+)/i);
      if (match) {
        const type = match[1].toLowerCase() as AgentStep['type'];
        const description = match[2].trim();
        steps.push(this.createStep(type, description));
      }
    }

    return steps;
  }

  private async executeActionStep(step: AgentStep, streamChat: (prompt: string) => Promise<string>): Promise<boolean> {
    step.status = 'running';

    try {
      const context = await this.contextAssembler.assembleContext(
        step.description,
        this.diagnosticsProvider.getAllDiagnostics()
      );

      const actionPrompt = `Execute this step: ${step.description}

# Context
${context.includedFiles.map(f => `## ${f.path}\n${f.content}`).join('\n\n')}

# Current Diagnostics
${this.diagnosticsProvider.formatDiagnosticsForContext()}

Provide the specific action to take.`;

      const response = await streamChat(actionPrompt);
      step.result = response;

      if (step.type === 'write') {
        const errorsBefore = this.diagnosticsProvider.getErrorCount();
        
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        const errorsAfter = this.diagnosticsProvider.getErrorCount();
        
        if (errorsAfter > errorsBefore) {
          step.error = `New errors introduced: ${errorsAfter - errorsBefore}`;
          return false;
        }
      }

      return true;
    } catch (error) {
      step.error = error instanceof Error ? error.message : String(error);
      return false;
    }
  }

  private async executeReportPhase(streamChat: (prompt: string) => Promise<string>): Promise<string> {
    const fileChanges = Array.from(this.memoryManager.getFileChanges().entries());
    const commandsRun = this.memoryManager.getCommandsRun();

    const reportPrompt = `Summarize what was accomplished in this task.

# Steps Completed
${this.currentSteps.map((s, i) => `${i + 1}. ${s.type.toUpperCase()}: ${s.description} - ${s.status}`).join('\n')}

# Files Changed
${fileChanges.map(([file]) => `- ${file}`).join('\n')}

# Commands Run
${commandsRun.map(cmd => `- ${cmd}`).join('\n')}

Provide a concise summary of what was accomplished.`;

    const summary = await streamChat(reportPrompt);
    return summary;
  }

  private createStep(type: AgentStep['type'], description: string): AgentStep {
    return {
      id: Date.now().toString() + Math.random(),
      type,
      status: 'pending',
      description,
      timestamp: Date.now()
    };
  }

  private addStep(step: AgentStep): void {
    this.currentSteps.push(step);
    this.memoryManager.getSessionMemory().currentTask = this.currentSteps;
  }

  getCurrentSteps(): AgentStep[] {
    return this.currentSteps;
  }

  abort(): void {
    this.shouldAbort = true;
  }

  isTaskRunning(): boolean {
    return this.isRunning;
  }
}
