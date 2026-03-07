import * as fs from 'fs';
import * as path from 'path';

export interface CloudContext {
  provider: 'vercel' | 'netlify' | 'railway' | 'render' | 'aws' | 'gcp' | 'azure' | 'fly' | 'docker' | 'none';
  hasCI: boolean;
  hasDotenv: boolean;
  hasDocker: boolean;
  deployCommand?: string;
  envVars: string[];
}

const CLOUD_INDICATORS: Array<{
  file: string;
  provider: CloudContext['provider'];
  deployCommand?: string;
}> = [
  { file: 'vercel.json', provider: 'vercel', deployCommand: 'vercel deploy' },
  { file: '.vercel/project.json', provider: 'vercel', deployCommand: 'vercel deploy' },
  { file: 'netlify.toml', provider: 'netlify', deployCommand: 'netlify deploy' },
  { file: 'railway.toml', provider: 'railway', deployCommand: 'railway up' },
  { file: 'render.yaml', provider: 'render' },
  { file: 'fly.toml', provider: 'fly', deployCommand: 'fly deploy' },
  { file: 'serverless.yml', provider: 'aws', deployCommand: 'serverless deploy' },
  { file: 'serverless.yaml', provider: 'aws', deployCommand: 'serverless deploy' },
  { file: 'sam.yaml', provider: 'aws', deployCommand: 'sam deploy' },
  { file: 'template.yaml', provider: 'aws' },
  { file: 'app.yaml', provider: 'gcp', deployCommand: 'gcloud app deploy' },
  { file: 'azure-pipelines.yml', provider: 'azure' },
];

const CI_FILES = [
  '.github/workflows',
  '.gitlab-ci.yml',
  '.circleci/config.yml',
  'Jenkinsfile',
  '.travis.yml',
  'bitbucket-pipelines.yml',
];

export class CloudDetector {
  /**
   * Detect cloud deployment context from project files.
   * Only reads file names (never values), env var NAMES only.
   */
  static detect(workspaceRoot: string): CloudContext {
    const result: CloudContext = {
      provider: 'none',
      hasCI: false,
      hasDotenv: false,
      hasDocker: false,
      envVars: [],
    };

    if (!workspaceRoot) return result;

    // Detect cloud provider
    for (const indicator of CLOUD_INDICATORS) {
      const fullPath = path.join(workspaceRoot, indicator.file);
      if (fs.existsSync(fullPath)) {
        result.provider = indicator.provider;
        if (indicator.deployCommand) {
          result.deployCommand = indicator.deployCommand;
        }
        break;
      }
    }

    // Detect CI
    for (const ciFile of CI_FILES) {
      const fullPath = path.join(workspaceRoot, ciFile);
      if (fs.existsSync(fullPath)) {
        result.hasCI = true;
        break;
      }
    }

    // Detect Docker
    result.hasDocker = fs.existsSync(path.join(workspaceRoot, 'Dockerfile')) ||
                       fs.existsSync(path.join(workspaceRoot, 'docker-compose.yml')) ||
                       fs.existsSync(path.join(workspaceRoot, 'docker-compose.yaml'));

    if (result.provider === 'none' && result.hasDocker) {
      result.provider = 'docker';
    }

    // Detect .env files and extract variable NAMES only (never values)
    const envFiles = ['.env', '.env.local', '.env.development', '.env.production', '.env.example'];
    for (const envFile of envFiles) {
      const fullPath = path.join(workspaceRoot, envFile);
      if (fs.existsSync(fullPath)) {
        result.hasDotenv = true;
        try {
          const content = fs.readFileSync(fullPath, 'utf-8');
          const varNames = content
            .split('\n')
            .filter(line => line.trim() && !line.startsWith('#'))
            .map(line => line.split('=')[0]?.trim())
            .filter(Boolean);
          for (const name of varNames) {
            if (name && !result.envVars.includes(name)) {
              result.envVars.push(name);
            }
          }
        } catch {
          // Can't read file
        }
      }
    }

    return result;
  }

  /** Format cloud context for AI system prompt */
  static formatForPrompt(ctx: CloudContext): string {
    if (ctx.provider === 'none' && !ctx.hasCI && !ctx.hasDotenv && !ctx.hasDocker) {
      return '';
    }

    const lines: string[] = ['## CLOUD CONTEXT'];

    if (ctx.provider !== 'none') {
      lines.push(`Deployment: ${ctx.provider.toUpperCase()}`);
      if (ctx.deployCommand) {
        lines.push(`Deploy command: \`${ctx.deployCommand}\``);
      }
    }

    if (ctx.hasDocker) lines.push('Docker: present');
    if (ctx.hasCI) lines.push('CI/CD: configured');

    if (ctx.hasDotenv && ctx.envVars.length > 0) {
      lines.push(`Environment variables (names only): ${ctx.envVars.join(', ')}`);
      lines.push('⚠ Never hardcode env var values. Use process.env or equivalent.');
    }

    lines.push('');
    lines.push('Cloud rules:');
    lines.push('- Never hardcode secrets or API keys');
    lines.push('- Use environment variables for configuration');
    lines.push('- Consider deployment constraints (cold starts, memory limits)');
    lines.push('- Use platform-appropriate build commands');

    return lines.join('\n');
  }
}
