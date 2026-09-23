import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { ROOT_DIR } from '../server/workspacePaths';

describe('Docker packaging', () => {
  test('Dockerfile copies agent_config.json into /app', () => {
    const dockerfilePath = path.join(ROOT_DIR, 'Dockerfile');
    const dockerfile = readFileSync(dockerfilePath, 'utf8');

    expect(dockerfile).toMatch(/COPY\s+agent_config\.json\s+\.\/agent_config\.json/);
  });

  test('Dockerfile only copies files tracked in git', () => {
    const dockerfile = readFileSync(path.join(ROOT_DIR, 'Dockerfile'), 'utf8');

    // Root AGENT.md and docs/ are gitignored, so a fresh clone cannot build with them.
    expect(dockerfile).not.toMatch(/COPY\s+AGENT\.md/);
    expect(dockerfile).not.toMatch(/COPY\s+docs\s/);
  });

  test('compose builds the agent locally by default and pulls from GHCR in CI', () => {
    const compose = readFileSync(path.join(ROOT_DIR, 'compose.yml'), 'utf8');
    const workflow = readFileSync(
      path.join(ROOT_DIR, '.github', 'workflows', 'deploy.yml'),
      'utf8',
    );

    expect(compose).toMatch(/image:\s+\$\{IMAGE_NAME:-ghcr\.io\/archie0732\/healthy-diet-ai-agent:main\}/);
    expect(compose).toMatch(/pull_policy:\s+\$\{AGENT_PULL_POLICY:-build\}/);
    expect(compose).toMatch(/\n\s+build:\s+\.\s*\n/);
    expect(workflow).toMatch(/AGENT_PULL_POLICY:\s+always/);
  });

  test('env example documents the deployment image override', () => {
    const envExamplePath = path.join(ROOT_DIR, '.env.example');
    const envExample = readFileSync(envExamplePath, 'utf8');

    expect(envExample).toMatch(
      /IMAGE_NAME=ghcr\.io\/archie0732\/healthy-diet-ai-agent:main/,
    );
  });

  test('deploy workflow targets a Windows self-hosted runner', () => {
    const workflowPath = path.join(ROOT_DIR, '.github', 'workflows', 'deploy.yml');
    const workflow = readFileSync(workflowPath, 'utf8');

    expect(workflow).toMatch(/-\s+self-hosted\s*\n\s*-\s+windows/i);
    expect(workflow).not.toMatch(/-\s+linux/i);
    expect(workflow).toMatch(/shell:\s+pwsh/i);
  });
});
