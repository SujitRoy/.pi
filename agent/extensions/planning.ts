/**
 * Planning Extension: Research-Driven Task Planning with Advanced Features
 * 
 * Features:
 * - 5-phase workflow: Research → Analyze → Plan → Execute → Complete
 * - Validation gates prevent phase skipping
 * - Automatic test generation per task
 * - Git rollback checkpoints before risky changes
 * - Parallel task detection for independent work
 * - Knowledge base that learns from past plans
 * - File-based plans with automatic cleanup
 * - User clarification system
 */

import type { ExtensionAPI, ExtensionCommandContext } from '@earendil-works/pi-coding-agent';
import {
  existsSync, mkdirSync, readFileSync, writeFileSync,
  unlinkSync, readdirSync, statSync, mkdirSync as mkdir
} from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { homedir } from 'node:os';

// ── Types ──────────────────────────────────────────────────────────────────

type PlanPhase = 'research' | 'analyze' | 'plan' | 'execute' | 'complete';

interface PlanTask {
  id: string;
  text: string;
  done: boolean;
  dependencies: string[];
  priority: 'high' | 'medium' | 'low';
  estimatedComplexity: 'simple' | 'moderate' | 'complex';
  relatedFiles: string[];
  testFiles: string[];
  estimatedMinutes: number;
  actualMinutes?: number;
  startedAt?: number;
  completedAt?: number;
  retryCount: number;
  maxRetries: number;
  errorLog: string[];
  parallelGroup?: number;
}

interface CodebaseContext {
  relevantFiles: string[];
  dependencies: string[];
  internalDependencies: string[];
  testFiles: string[];
  potentialRisks: string[];
  gatheredAt: number;
}

interface Clarification {
  id: string;
  question: string;
  answer: string | null;
  context: string;
  askedAt: number;
  answeredAt: number | null;
}

interface Checkpoint {
  taskId: string;
  timestamp: number;
  gitHash: string;
  filesSnapshot: string[];
  description: string;
}

interface KnowledgeEntry {
  pattern: string;
  goal: string;
  solution: string;
  files: string[];
  testFiles: string[];
  pitfalls: string[];
  phaseDurations: Record<string, number>;
  successRate: number;
  timesUsed: number;
  lastUsed: number;
  createdAt: number;
}

interface Plan {
  id: string;
  title: string;
  goal: string;
  phase: PlanPhase;
  researchCompleted: boolean;
  analysisCompleted: boolean;
  analysisRationale: string;
  context: CodebaseContext | null;
  tasks: PlanTask[];
  clarifications: Clarification[];
  checkpoints: Checkpoint[];
  createdAt: number;
  completedAt: number | null;
  totalTurns: number;
}

interface ValidationResult {
  valid: boolean;
  missing: string[];
  warnings: string[];
}

// ── Constants ──────────────────────────────────────────────────────────────

const PLANS_DIR = '.pi-plans';
const KNOWLEDGE_FILE = '.pi-knowledge.json';
const PLAN_STALE_DAYS = 7;
const MAX_PLANS = 5;
const MAX_RETRIES = 3;

// ── File System Helpers ────────────────────────────────────────────────────

function ensureDir(dir: string): string {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

function ensurePlansDir(cwd: string): string {
  return ensureDir(join(cwd, PLANS_DIR));
}

function ensureKnowledgeDir(): string {
  return ensureDir(join(homedir(), '.pi'));
}

// ── Knowledge Base ─────────────────────────────────────────────────────────

function loadKnowledgeBase(): KnowledgeEntry[] {
  const kbPath = join(homedir(), '.pi', KNOWLEDGE_FILE);
  if (existsSync(kbPath)) {
    try {
      return JSON.parse(readFileSync(kbPath, 'utf-8'));
    } catch {
      return [];
    }
  }
  return [];
}

function saveKnowledgeBase(entries: KnowledgeEntry[]): void {
  ensureKnowledgeDir();
  const kbPath = join(homedir(), '.pi', KNOWLEDGE_FILE);
  writeFileSync(kbPath, JSON.stringify(entries, null, 2), 'utf-8');
}

function addToKnowledgeBase(plan: Plan): void {
  if (!plan.context || plan.tasks.length === 0) return;
  
  const kb = loadKnowledgeBase();
  
  // Create a pattern from the goal (extract key terms)
  const keyTerms = plan.goal
    .toLowerCase()
    .split(/\s+/)
    .filter(w => w.length > 4)
    .slice(0, 5);
  const pattern = keyTerms.join('.*');
  
  const entry: KnowledgeEntry = {
    pattern,
    goal: plan.goal,
    solution: plan.tasks.map(t => `[${t.priority}] ${t.text}`).join(' → '),
    files: plan.context.relevantFiles,
    testFiles: plan.context.testFiles,
    pitfalls: plan.context.potentialRisks,
    phaseDurations: {
      research: 0,
      analyze: 0,
      plan: 0,
      execute: plan.tasks.reduce((sum, t) => sum + (t.actualMinutes || t.estimatedMinutes), 0),
    },
    successRate: 1.0,
    timesUsed: 1,
    lastUsed: Date.now(),
    createdAt: Date.now(),
  };
  
  // Merge with existing similar entries
  const existing = kb.findIndex(e => {
    try {
      return new RegExp(e.pattern, 'i').test(plan.goal);
    } catch {
      return false;
    }
  });
  
  if (existing >= 0) {
    const old = kb[existing];
    old.timesUsed++;
    old.lastUsed = Date.now();
    old.successRate = (old.successRate * (old.timesUsed - 1) + 1) / old.timesUsed;
    old.files = [...new Set([...old.files, ...entry.files])];
    old.testFiles = [...new Set([...old.testFiles, ...entry.testFiles])];
    old.pitfalls = [...new Set([...old.pitfalls, ...entry.pitfalls])];
    kb[existing] = old;
  } else {
    kb.push(entry);
  }
  
  // Keep only last 100 entries
  if (kb.length > 100) {
    kb.sort((a, b) => b.lastUsed - a.lastUsed);
    kb.splice(100);
  }
  
  saveKnowledgeBase(kb);
}

function findSimilarPlans(goal: string): KnowledgeEntry[] {
  const kb = loadKnowledgeBase();
  return kb
    .filter(entry => {
      try {
        return new RegExp(entry.pattern, 'i').test(goal);
      } catch {
        return goal.toLowerCase().includes(entry.pattern.toLowerCase());
      }
    })
    .sort((a, b) => (b.successRate * b.timesUsed) - (a.successRate * a.timesUsed))
    .slice(0, 3);
}

// ── Validation Gates ───────────────────────────────────────────────────────

function validateResearchComplete(plan: Plan): ValidationResult {
  const missing: string[] = [];
  const warnings: string[] = [];
  
  if (!plan.context) {
    return { valid: false, missing: ['No research context gathered at all'], warnings: [] };
  }
  
  if (plan.context.relevantFiles.length === 0) {
    missing.push('No relevant files identified - search the codebase first');
  }
  
  if (plan.context.potentialRisks.length === 0) {
    warnings.push('No risks documented - even "low risk" should be stated');
  }
  
  if (plan.context.testFiles.length === 0 && plan.context.relevantFiles.length > 0) {
    warnings.push('No test files found - verify there are truly no related tests');
  }
  
  if (plan.context.internalDependencies.length === 0 && plan.context.relevantFiles.length > 1) {
    warnings.push('No internal dependencies mapped - check imports across identified files');
  }
  
  return { valid: missing.length === 0, missing, warnings };
}

function validateAnalysisComplete(plan: Plan): ValidationResult {
  const missing: string[] = [];
  const warnings: string[] = [];
  
  if (!plan.analysisRationale || plan.analysisRationale.length < 30) {
    missing.push('Analysis rationale too brief - explain WHY changes should be in this order');
  }
  
  if (!plan.analysisRationale?.includes('order') && !plan.analysisRationale?.includes('first')) {
    warnings.push('Rationale should explicitly mention task ordering priorities');
  }
  
  return { valid: missing.length === 0, missing, warnings };
}

function validatePlanTasks(plan: Plan): ValidationResult {
  const missing: string[] = [];
  const warnings: string[] = [];
  
  if (plan.tasks.length === 0) {
    missing.push('No tasks created - break down the goal into concrete steps');
  }
  
  if (plan.tasks.length === 1 && plan.estimatedComplexity === 'complex') {
    warnings.push('Only one task for a complex goal - consider breaking it down further');
  }
  
  // Check dependency completeness
  const taskIds = new Set(plan.tasks.map(t => t.id));
  for (const task of plan.tasks) {
    for (const depId of task.dependencies) {
      if (!taskIds.has(depId)) {
        missing.push(`Task "${task.id}" depends on unknown task "${depId}"`);
      }
    }
  }
  
  // Check for circular dependencies
  for (const task of plan.tasks) {
    const visited = new Set<string>();
    const checkCircular = (currentId: string): boolean => {
      if (visited.has(currentId)) return true; // Cycle detected
      visited.add(currentId);
      const t = plan.tasks.find(t2 => t2.id === currentId);
      if (!t) return false;
      for (const depId of t.dependencies) {
        if (checkCircular(depId)) return true;
      }
      visited.delete(currentId);
      return false;
    };
    
    if (checkCircular(task.id)) {
      missing.push(`Circular dependency detected involving task "${task.id}"`);
      break;
    }
  }
  
  // Check all high priority tasks have no blockers
  const highPriorityBlocked = plan.tasks.filter(t => 
    t.priority === 'high' && t.dependencies.length > 0 &&
    t.dependencies.some(d => plan.tasks.find(t2 => t2.id === d)?.priority !== 'high')
  );
  if (highPriorityBlocked.length > 0) {
    warnings.push('High priority tasks depend on lower priority tasks - review ordering');
  }
  
  return { valid: missing.length === 0, missing, warnings };
}

function validatePhaseTransition(plan: Plan, targetPhase: PlanPhase): ValidationResult {
  switch (targetPhase) {
    case 'analyze':
      return validateResearchComplete(plan);
    case 'plan':
      const analysisResult = validateAnalysisComplete(plan);
      const researchResult = validateResearchComplete(plan);
      return {
        valid: analysisResult.valid && researchResult.valid,
        missing: [...researchResult.missing, ...analysisResult.missing],
        warnings: [...researchResult.warnings, ...analysisResult.warnings],
      };
    case 'execute':
      const planResult = validatePlanTasks(plan);
      const fullAnalysisResult = validateAnalysisComplete(plan);
      const fullResearchResult = validateResearchComplete(plan);
      return {
        valid: planResult.valid && fullAnalysisResult.valid && fullResearchResult.valid,
        missing: [...fullResearchResult.missing, ...fullAnalysisResult.missing, ...planResult.missing],
        warnings: [...fullResearchResult.warnings, ...fullAnalysisResult.warnings, ...planResult.warnings],
      };
    default:
      return { valid: true, missing: [], warnings: [] };
  }
}

// ── Parallel Task Detection ─────────────────────────────────────────────────

function detectFileOverlap(task1: PlanTask, task2: PlanTask): boolean {
  const files1 = new Set(task1.relatedFiles);
  return task2.relatedFiles.some(f => files1.has(f));
}

function findParallelGroups(tasks: PlanTask[]): PlanTask[][] {
  const incomplete = tasks.filter(t => !t.done);
  const ready = incomplete.filter(t => 
    t.dependencies.every(d => tasks.find(t2 => t2.id === d)?.done)
  );
  
  if (ready.length <= 1) return [ready];
  
  // Group by non-overlapping files
  const groups: PlanTask[][] = [];
  const assigned = new Set<string>();
  
  for (const task of ready) {
    if (assigned.has(task.id)) continue;
    
    const group: PlanTask[] = [task];
    assigned.add(task.id);
    const groupFiles = new Set(task.relatedFiles);
    
    // Find all tasks that don't overlap with current group
    for (const other of ready) {
      if (assigned.has(other.id)) continue;
      if (!other.relatedFiles.some(f => groupFiles.has(f))) {
        group.push(other);
        assigned.add(other.id);
        other.relatedFiles.forEach(f => groupFiles.add(f));
      }
    }
    
    groups.push(group);
  }
  
  return groups;
}

// ── Test Generation ─────────────────────────────────────────────────────────

function generateTestTemplate(task: PlanTask, language: string): string {
  const testName = task.text.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase().slice(0, 50);
  
  if (language === 'typescript' || language === 'javascript') {
    return [
      `/**`,
      ` * Test: ${task.text}`,
      ` * Generated by planning extension`,
      ` * Task ID: ${task.id}`,
      ` */`,
      ``,
      `import { describe, it, expect, beforeAll, afterAll } from 'vitest';`,
      ``,
      `describe('${task.text}', () => {`,
      `  beforeAll(() => {`,
      `    // Setup: prepare test environment`,
      `  });`,
      ``,
      `  afterAll(() => {`,
      `    // Cleanup: restore original state`,
      `  });`,
      ``,
      `  it('should satisfy the acceptance criteria', async () => {`,
      `    // Arrange: set up test data`,
      ``,
      `    // Act: perform the operation`,
      ``,
      `    // Assert: verify the result`,
      `    expect(true).toBe(true); // Replace with real assertion`,
      `  });`,
      ``,
      `  it('should handle edge cases', async () => {`,
      `    // Test null/undefined inputs`,
      `    // Test boundary values`,
      `    // Test error conditions`,
      `  });`,
      `});`,
    ].join('\n');
  }
  
  if (language === 'python') {
    return [
      `"""`,
      `Test: ${task.text}`,
      `Generated by planning extension`,
      `Task ID: ${task.id}`,
      `"""`,
      ``,
      `import pytest`,
      ``,
      `class Test${testName.charAt(0).toUpperCase() + testName.slice(1)}:`,
      `    def setup_method(self):`,
      `        # Setup: prepare test environment`,
      `        pass`,
      ``,
      `    def teardown_method(self):`,
      `        # Cleanup: restore original state`,
      `        pass`,
      ``,
      `    def test_acceptance_criteria(self):`,
      `        # Arrange`,
      `        # Act`,
      `        # Assert`,
      `        assert True  # Replace with real assertion`,
      ``,
      `    def test_edge_cases(self):`,
      `        # Test null/undefined inputs`,
      `        # Test boundary values`,
      `        # Test error conditions`,
      `        pass`,
    ].join('\n');
  }
  
  return `# Test: ${task.text}\n# TODO: Implement test cases\n`;
}

function detectLanguage(files: string[]): string {
  const extensions = files.map(f => f.split('.').pop()?.toLowerCase());
  if (extensions.some(e => e === 'ts' || e === 'tsx')) return 'typescript';
  if (extensions.some(e => e === 'js' || e === 'jsx')) return 'javascript';
  if (extensions.some(e => e === 'py')) return 'python';
  if (extensions.some(e => e === 'go')) return 'go';
  if (extensions.some(e => e === 'rs')) return 'rust';
  return 'typescript'; // default
}

// ── Plan File Management ────────────────────────────────────────────────────

function generatePlanFile(goal: string, similarPlans: KnowledgeEntry[]): string {
  const now = new Date().toISOString();
  const shortTitle = goal.slice(0, 70).replace(/\n/g, ' ') + (goal.length > 70 ? '...' : '');
  
  let pastGuidance = '';
  if (similarPlans.length > 0) {
    pastGuidance = [
      '',
      '## Past Similar Plans',
      '',
      ...similarPlans.map((sp, i) => [
        `### Plan ${i + 1} (Success rate: ${Math.round(sp.successRate * 100)}%)`,
        `- **Solution**: ${sp.solution}`,
        `- **Files**: ${sp.files.join(', ')}`,
        `- **Pitfalls**: ${sp.pitfalls.join(', ') || 'None recorded'}`,
        `- **Tests**: ${sp.testFiles.join(', ') || 'No tests recorded'}`,
        '',
      ].join('\n')),
    ].join('\n');
  }
  
  return [
    `# ${shortTitle}`,
    '',
    `> **created**: ${now}`,
    `> **completed**: null`,
    `> **phase**: research`,
    `> **research_completed**: false`,
    `> **analysis_completed**: false`,
    `> **total_turns**: 0`,
    '',
    '## Goal',
    '',
    goal.trim(),
    pastGuidance,
    '',
    '## Research Findings',
    '',
    '<!-- Populate ALL subsections before advancing -->',
    '',
    '### Relevant Files',
    '<!-- Every file that needs to be modified or is related -->',
    '',
    '### Dependencies',
    '<!-- External packages involved -->',
    '',
    '### Internal Dependencies',
    '<!-- Internal modules that import/use the target code -->',
    '',
    '### Test Files',
    '<!-- Related test files that should be updated or created -->',
    '',
    '### Potential Risks',
    '<!-- Breaking changes, edge cases, migration concerns -->',
    '',
    '## Analysis',
    '',
    '<!-- Explain rationale for task ordering -->',
    '',
    '### Change Order Rationale',
    '<!-- Why this specific order? What depends on what? -->',
    '',
    '### Risk Mitigation',
    '<!-- How to handle each identified risk -->',
    '',
    '## Tasks',
    '',
    '<!-- Format each task: -->',
    '<!-- - [ ] [priority] Description | deps: task-1 | files: path/to/file.ts | tests: path/to/test.ts | complexity: moderate | est: 15min -->',
    '',
    '## Checkpoints',
    '',
    '<!-- Git checkpoints created before each risky change -->',
    '',
    '## Clarifications',
    '',
    '<!-- Q&A between agent and user -->',
    '<!-- Format: Q: question \n Context: which task \n A: answer -->',
    '',
    '## Execution Log',
    '',
    '<!-- Progress log with timestamps -->',
    '',
  ].join('\n');
}

function parsePlanFile(filePath: string): Plan | null {
  if (!existsSync(filePath)) return null;
  
  const content = readFileSync(filePath, 'utf-8');
  const id = filePath.split('/').pop()?.replace('.md', '') || '';
  
  const titleMatch = content.match(/^# (.+)$/m);
  const phaseMatch = content.match(/> \*\*phase\*\*: (\w+)/);
  const researchMatch = content.match(/> \*\*research_completed\*\*: (\w+)/);
  const analysisMatch = content.match(/> \*\*analysis_completed\*\*: (\w+)/);
  const completedMatch = content.match(/> \*\*completed\*\*: (.+)/);
  const createdMatch = content.match(/> \*\*created\*\*: (.+)/);
  const turnsMatch = content.match(/> \*\*total_turns\*\*: (\d+)/);
  
  const phase = (phaseMatch?.[1] as PlanPhase) || 'research';
  if (!['research', 'analyze', 'plan', 'execute', 'complete'].includes(phase)) {
    return null;
  }
  
  const context = parseContext(content);
  const tasks = parseTasks(content);
  const clarifications = parseClarifications(content);
  const checkpoints = parseCheckpoints(content);
  
  const analysisSection = extractSection(content, 'Analysis');
  const analysisRationale = analysisSection || '';
  
  return {
    id,
    title: titleMatch?.[1] || 'Untitled Plan',
    goal: extractSection(content, 'Goal') || '',
    phase,
    researchCompleted: researchMatch?.[1] === 'true',
    analysisCompleted: analysisMatch?.[1] === 'true',
    analysisRationale,
    context,
    tasks,
    clarifications,
    checkpoints,
    createdAt: createdMatch?.[1] ? new Date(createdMatch[1]).getTime() : Date.now(),
    completedAt: completedMatch?.[1] === 'null' ? null : (completedMatch?.[1] ? new Date(completedMatch[1]).getTime() : null),
    totalTurns: parseInt(turnsMatch?.[1] || '0', 10),
  };
}

function parseContext(content: string): CodebaseContext | null {
  const section = extractSection(content, 'Research Findings');
  if (!section) return null;
  
  return {
    relevantFiles: extractListItems(section, 'Relevant Files'),
    dependencies: extractListItems(section, 'Dependencies'),
    internalDependencies: extractListItems(section, 'Internal Dependencies'),
    testFiles: extractListItems(section, 'Test Files'),
    potentialRisks: extractListItems(section, 'Potential Risks'),
    gatheredAt: Date.now(),
  };
}

function parseTasks(content: string): PlanTask[] {
  const section = extractSection(content, 'Tasks');
  if (!section) return [];
  
  const tasks: PlanTask[] = [];
  const lines = section.split('\n');
  
  for (const line of lines) {
    const trimmed = line.trim();
    const taskMatch = trimmed.match(/^- \[(.)\] (?:\[(\w+)\]\s*)?(.+)/);
    if (!taskMatch) continue;
    
    const done = taskMatch[1].toLowerCase() === 'x';
    const priority = (taskMatch[2] || 'medium') as PlanTask['priority'];
    const rest = taskMatch[3];
    
    let text = rest;
    let deps: string[] = [];
    let files: string[] = [];
    let testFiles: string[] = [];
    let complexity: PlanTask['estimatedComplexity'] = 'moderate';
    let estimatedMinutes = 15;
    
    const parts = rest.split('|').map(p => p.trim());
    text = parts[0];
    
    for (const part of parts.slice(1)) {
      if (part.startsWith('deps:')) {
        deps = part.replace('deps:', '').split(',').map(d => d.trim()).filter(Boolean);
      } else if (part.startsWith('files:')) {
        files = part.replace('files:', '').split(',').map(f => f.trim()).filter(Boolean);
      } else if (part.startsWith('tests:')) {
        testFiles = part.replace('tests:', '').split(',').map(f => f.trim()).filter(Boolean);
      } else if (part.startsWith('complexity:')) {
        const c = part.replace('complexity:', '').trim();
        if (['simple', 'moderate', 'complex'].includes(c)) {
          complexity = c as PlanTask['estimatedComplexity'];
        }
      } else if (part.startsWith('est:')) {
        const mins = parseInt(part.replace('est:', '').replace('min', '').trim(), 10);
        if (!isNaN(mins)) estimatedMinutes = mins;
      }
    }
    
    tasks.push({
      id: `task-${tasks.length + 1}`,
      text: text.trim(),
      done,
      dependencies: deps,
      priority,
      estimatedComplexity: complexity,
      relatedFiles: files,
      testFiles,
      estimatedMinutes,
      retryCount: 0,
      maxRetries: MAX_RETRIES,
      errorLog: [],
    });
  }
  
  return tasks;
}

function parseClarifications(content: string): Clarification[] {
  const section = extractSection(content, 'Clarifications');
  if (!section) return [];
  
  const clarifications: Clarification[] = [];
  const lines = section.split('\n');
  let current: Partial<Clarification> | null = null;
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('Q:')) {
      if (current?.question) {
        clarifications.push({
          id: `clar-${clarifications.length}`,
          question: current.question || '',
          answer: current.answer || null,
          context: current.context || '',
          askedAt: current.askedAt || Date.now(),
          answeredAt: current.answeredAt || null,
        });
      }
      current = { question: trimmed.replace('Q:', '').trim(), askedAt: Date.now() };
    } else if (trimmed.startsWith('Context:') && current) {
      current.context = trimmed.replace('Context:', '').trim();
    } else if (trimmed.startsWith('A:') && current) {
      current.answer = trimmed.replace('A:', '').replace('<!-- Waiting -->', '').trim();
      current.answeredAt = current.answer ? Date.now() : null;
    }
  }
  
  if (current?.question) {
    clarifications.push({
      id: `clar-${clarifications.length}`,
      question: current.question || '',
      answer: current.answer || null,
      context: current.context || '',
      askedAt: current.askedAt || Date.now(),
      answeredAt: current.answeredAt || null,
    });
  }
  
  return clarifications;
}

function parseCheckpoints(content: string): Checkpoint[] {
  const section = extractSection(content, 'Checkpoints');
  if (!section) return [];
  
  const checkpoints: Checkpoint[] = [];
  const lines = section.split('\n');
  
  for (const line of lines) {
    const match = line.trim().match(/^- \*\*(.+)\*\* \| task: (.+) \| hash: (.+) \| files: (.+)$/);
    if (match) {
      checkpoints.push({
        taskId: match[2].trim(),
        timestamp: new Date(match[1].trim()).getTime(),
        gitHash: match[3].trim(),
        filesSnapshot: match[4].split(',').map(f => f.trim()),
        description: match[1].trim(),
      });
    }
  }
  
  return checkpoints;
}

function extractSection(content: string, sectionName: string): string | null {
  const match = content.match(new RegExp(`## ${sectionName}\n\n([\\s\\S]*?)(?=\n## |$)`));
  return match?.[1]?.trim() || null;
}

function extractListItems(section: string, subSection: string): string[] {
  const match = section.match(new RegExp(`### ${subSection}\n((?:- .+\n?)*)`, 'm'));
  if (!match) return [];
  return match[1]
    .split('\n')
    .filter(line => line.trim().startsWith('- '))
    .map(line => line.replace(/^- /, '').trim())
    .filter(Boolean);
}

function savePlanFile(path: string, plan: Plan): void {
  // We don't fully rewrite the plan file - just update metadata
  // The agent edits the file directly for content changes
  if (!existsSync(path)) return;
  let content = readFileSync(path, 'utf-8');
  
  content = content.replace(/> \*\*phase\*\*: \w+/, `> **phase**: ${plan.phase}`);
  content = content.replace(/> \*\*research_completed\*\*: \w+/, `> **research_completed**: ${plan.researchCompleted}`);
  content = content.replace(/> \*\*analysis_completed\*\*: \w+/, `> **analysis_completed**: ${plan.analysisCompleted}`);
  content = content.replace(/> \*\*total_turns\*\*: \d+/, `> **total_turns**: ${plan.totalTurns}`);
  
  if (plan.completedAt) {
    content = content.replace(/> \*\*completed\*\*: null/, `> **completed**: ${new Date(plan.completedAt).toISOString()}`);
  }
  
  writeFileSync(path, content, 'utf-8');
}

// ── Cleanup ─────────────────────────────────────────────────────────────────

function cleanupPlanFiles(plansDir: string): void {
  if (!existsSync(plansDir)) return;
  
  const allFiles = readdirSync(plansDir).filter(f => f.endsWith('.md'));
  const now = Date.now();
  const staleThreshold = PLAN_STALE_DAYS * 24 * 60 * 60 * 1000;
  
  for (const file of allFiles) {
    const filePath = join(plansDir, file);
    const plan = parsePlanFile(filePath);
    
    if (plan?.completedAt) {
      unlinkSync(filePath);
      continue;
    }
    
    const stats = statSync(filePath);
    if (now - stats.mtimeMs > staleThreshold) {
      unlinkSync(filePath);
    }
  }
  
  const remaining = readdirSync(plansDir)
    .filter(f => f.endsWith('.md'))
    .map(f => ({ name: f, path: join(plansDir, f), mtime: statSync(join(plansDir, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  
  remaining.slice(MAX_PLANS).forEach(f => {
    if (existsSync(f.path)) unlinkSync(f.path);
  });
}

// ── Git Checkpoint ──────────────────────────────────────────────────────────

async function createGitCheckpoint(pi: ExtensionAPI, plan: Plan, planPath: string, taskId: string, signal?: AbortSignal): Promise<string | null> {
  try {
    // Check if git is available
    const gitCheck = await pi.exec('git', ['rev-parse', '--git-dir'], { signal });
    if (gitCheck.code !== 0) return null;
    
    // Get current hash
    const hashResult = await pi.exec('git', ['rev-parse', 'HEAD'], { signal });
    const gitHash = hashResult.stdout.trim();
    
    // Get changed files for this task
    const task = plan.tasks.find(t => t.id === taskId);
    if (!task) return null;
    
    const checkpoint: Checkpoint = {
      taskId,
      timestamp: Date.now(),
      gitHash,
      filesSnapshot: task.relatedFiles,
      description: `Before: ${task.text}`,
    };
    
    plan.checkpoints.push(checkpoint);
    
    // Add checkpoint to plan file
    if (existsSync(planPath)) {
      let content = readFileSync(planPath, 'utf-8');
      const checkpointLine = `- **${new Date(checkpoint.timestamp).toISOString()}** | task: ${checkpoint.taskId} | hash: ${checkpoint.gitHash} | files: ${checkpoint.filesSnapshot.join(', ')}\n`;
      
      if (content.includes('## Checkpoints')) {
        const idx = content.indexOf('## Checkpoints');
        const nextSection = content.indexOf('\n## ', idx + 1);
        if (nextSection === -1) {
          content += `\n${checkpointLine}`;
        } else {
          content = content.slice(0, nextSection) + `\n${checkpointLine}\n` + content.slice(nextSection);
        }
      }
      writeFileSync(planPath, content, 'utf-8');
    }
    
    return gitHash;
  } catch {
    return null;
  }
}

// ── Extension ──────────────────────────────────────────────────────────────

export default async function (pi: ExtensionAPI): Promise<void> {
  
  let currentPlan: Plan | null = null;
  let currentPlanPath: string | null = null;
  let currentCheckpointTask: string | null = null;

  function loadCurrentPlan(ctx: any): void {
    const cwd = ctx.cwd || process.cwd();
    const plansDir = join(cwd, PLANS_DIR);
    
    cleanupPlanFiles(plansDir);
    
    if (!existsSync(plansDir)) {
      currentPlan = null;
      currentPlanPath = null;
      return;
    }
    
    const files = readdirSync(plansDir)
      .filter(f => f.endsWith('.md'))
      .sort()
      .reverse();
    
    for (const file of files) {
      const planPath = join(plansDir, file);
      const plan = parsePlanFile(planPath);
      if (plan && !plan.completedAt) {
        currentPlan = plan;
        currentPlanPath = planPath;
        
        // Detect parallel groups
        if (plan.phase === 'execute') {
          const groups = findParallelGroups(plan.tasks);
          plan.tasks.forEach((t, i) => {
            for (let g = 0; g < groups.length; g++) {
              if (groups[g].includes(t)) {
                t.parallelGroup = g;
                break;
              }
            }
          });
        }
        
        return;
      }
    }
    
    // Clean up completed plans
    files.forEach(f => {
      const fp = join(plansDir, f);
      if (existsSync(fp)) unlinkSync(fp);
    });
    
    currentPlan = null;
    currentPlanPath = null;
  }

  // ── Tool: ask_user ──────────────────────────────────────────────────

  pi.registerTool({
    name: 'ask_user',
    label: 'Ask User',
    description: 'Ask the user for clarification. Pauses execution until answered.',
    promptSnippet: 'Ask clarifying questions',
    promptGuidelines: [
      'Use ask_user when requirements are ambiguous.',
      'Record Q&A in plan file ## Clarifications.',
      'Do not proceed past unanswered questions.',
    ],
    parameters: {
      question: { type: 'string', description: 'The question to ask' },
      context: { type: 'string', description: 'Which task this relates to', optional: true },
    },
    async execute(toolCallId: string, params: any, signal: AbortSignal, onUpdate: any, ctx: any) {
      const { question, context = 'General' } = params;
      
      const answer = await ctx.ui.input(
        `🤔 Clarification [${context}]`,
        question,
        ''
      );
      
      if (currentPlanPath && existsSync(currentPlanPath)) {
        let content = readFileSync(currentPlanPath, 'utf-8');
        const qaBlock = `\nQ: ${question}\nContext: ${context}\nA: ${answer || '<!-- Waiting -->'}\n`;
        
        if (content.includes('## Clarifications')) {
          const idx = content.indexOf('## Clarifications');
          const nextSection = content.indexOf('\n## ', idx + 1);
          if (nextSection === -1) {
            content += qaBlock;
          } else {
            content = content.slice(0, nextSection) + qaBlock + '\n' + content.slice(nextSection);
          }
        }
        writeFileSync(currentPlanPath, content, 'utf-8');
      }
      
      return {
        content: [{ type: 'text', text: answer ? `✅ Answer: "${answer}"` : '❓ Unanswered' }],
        details: { answered: !!answer, question, answer },
      };
    },
  });

  // ── Command: /plan ───────────────────────────────────────────────────

  pi.registerCommand('plan', {
    description: 'Create a new research-driven task plan',
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      if (!args || args.trim().length === 0) {
        ctx.ui.notify('Usage: /plan [detailed goal]', 'error');
        return;
      }

      const goal = args.trim();
      
      // Check knowledge base for similar past plans
      const similarPlans = findSimilarPlans(goal);
      
      const cwd = ctx.cwd || process.cwd();
      const plansDir = ensurePlansDir(cwd);
      cleanupPlanFiles(plansDir);
      
      const planId = `plan-${Date.now()}`;
      const planPath = join(plansDir, `${planId}.md`);
      
      const initialContent = generatePlanFile(goal, similarPlans);
      writeFileSync(planPath, initialContent, 'utf-8');
      
      currentPlan = parsePlanFile(planPath);
      currentPlanPath = planPath;
      
      // Build research prompt with knowledge base insights
      let kbGuidance = '';
      if (similarPlans.length > 0) {
        kbGuidance = [
          '',
          '📚 **PAST EXPERIENCE AVAILABLE:**',
          ...similarPlans.map((sp, i) => 
            `${i + 1}. Similar task (${Math.round(sp.successRate * 100)}% success): ${sp.solution}\n   Files: ${sp.files.join(', ')}\n   Watch out: ${sp.pitfalls.join(', ') || 'none'}`
          ),
          '',
          'Use this to guide your research, but verify everything.',
        ].join('\n');
      }
      
      const researchPrompt = [
        `🔬 PHASE 1: RESEARCH`,
        ``,
        `Plan: ${planPath}`,
        `Goal: ${goal}`,
        kbGuidance,
        ``,
        `COMPLETE THESE STEPS:`,
        ``,
        `1. Find ALL relevant files using grep, find, ls`,
        `2. Map external AND internal dependencies`,
        `3. Locate related test files`,
        `4. Identify potential risks and edge cases`,
        ``,
        `Populate ## Research Findings COMPLETELY.`,
        `Do NOT create tasks yet.`,
        `When done, update phase to "analyze" and research_completed to true.`,
      ].join('\n');

      await pi.sendUserMessage(researchPrompt, { deliverAs: 'steer' });
      
      const kbMsg = similarPlans.length > 0 ? ` (${similarPlans.length} similar past plans found)` : '';
      ctx.ui.notify(`🔬 Research started${kbMsg}`, 'info');
    },
  });

  // ── Command: /plan_show ──────────────────────────────────────────────

  pi.registerCommand('plan_show', {
    description: 'Show plan status with validation and parallel groups',
    handler: async (_args: string, ctx: ExtensionCommandContext) => {
      loadCurrentPlan(ctx);
      
      if (!currentPlan) {
        ctx.ui.notify('No active plan.', 'info');
        return;
      }

      const plan = currentPlan;
      const phaseEmoji: Record<PlanPhase, string> = {
        research: '🔬', analyze: '🧠', plan: '📋', execute: '⚡', complete: '✅',
      };
      
      let status = `${phaseEmoji[plan.phase]} **${plan.title}** [${plan.phase}]\n`;
      
      // Show validation status
      const validation = validatePhaseTransition(plan, plan.phase);
      if (!validation.valid) {
        status += `\n⚠️ Issues: ${validation.missing.join(', ')}`;
      } else {
        status += `\n✅ Validated`;
      }
      
      // Context summary
      if (plan.context) {
        status += `\n📁 ${plan.context.relevantFiles.length} files | 📦 ${plan.context.dependencies.length} deps | ⚠️ ${plan.context.potentialRisks.length} risks`;
      }
      
      // Tasks with parallel groups
      if (plan.tasks.length > 0) {
        const done = plan.tasks.filter(t => t.done).length;
        status += `\n\nTasks (${done}/${plan.tasks.length}):`;
        
        if (plan.phase === 'execute') {
          const groups = findParallelGroups(plan.tasks);
          groups.forEach((group, i) => {
            if (group.length > 1) {
              status += `\n  ⚡ Parallel Group ${i + 1}: ${group.map(t => t.text).join(' | ')}`;
            }
          });
        }
        
        for (const t of plan.tasks) {
          const icon = t.done ? '✅' : t.parallelGroup !== undefined ? '⚡' : '🔄';
          const blocked = t.dependencies.filter(d => !plan.tasks.find(t2 => t2.id === d)?.done);
          const blockInfo = blocked.length > 0 ? ` (waiting: ${blocked.join(', ')})` : '';
          status += `\n  ${icon} [${t.priority}] ${t.text}${blockInfo}`;
          if (t.actualMinutes) {
            status += ` (${t.actualMinutes}min)`;
          }
        }
      }
      
      // Checkpoints
      if (plan.checkpoints.length > 0) {
        status += `\n\n🔖 Checkpoints: ${plan.checkpoints.length}`;
      }
      
      // Clarifications
      const pendingQs = plan.clarifications.filter(c => !c.answer).length;
      if (pendingQs > 0) {
        status += `\n❓ ${pendingQs} questions pending`;
      }
      
      ctx.ui.notify(status, 'info');
    },
  });

  // ── Command: /plan_cancel ────────────────────────────────────────────

  pi.registerCommand('plan_cancel', {
    description: 'Cancel plan and delete file',
    handler: async (_args: string, ctx: ExtensionCommandContext) => {
      loadCurrentPlan(ctx);
      
      if (!currentPlan || !currentPlanPath) {
        ctx.ui.notify('No active plan.', 'info');
        return;
      }

      const confirmed = await ctx.ui.confirm(
        'Delete Plan',
        `Delete "${currentPlan.title}"?\n${currentPlan.tasks.length} tasks will be lost.`
      );
      
      if (confirmed) {
        if (existsSync(currentPlanPath)) unlinkSync(currentPlanPath);
        currentPlan = null;
        currentPlanPath = null;
        if (!ctx.isIdle()) ctx.abort();
        ctx.ui.notify('🗑️ Plan deleted.', 'info');
      }
    },
  });

  // ── Event: session_start ─────────────────────────────────────────────

  pi.on('session_start', async (_event, ctx) => {
    loadCurrentPlan(ctx);
    if (currentPlan && ctx.hasUI) {
      const validation = validatePhaseTransition(currentPlan, currentPlan.phase);
      const status = validation.valid ? '✅' : '⚠️';
      ctx.ui.notify(`📋 Plan loaded ${status}: "${currentPlan.title}" [${currentPlan.phase}]`, 'info');
    }
  });

  // ── Event: before_agent_start (Phase enforcement + Test generation + KB) ─

  pi.on('before_agent_start', async (event, ctx) => {
    loadCurrentPlan(ctx);
    
    if (!currentPlan || !currentPlanPath) return;
    
    const plan = currentPlan;
    
    // Check validation gates
    const validation = validatePhaseTransition(plan, plan.phase);
    let gateInstructions = '';
    
    if (!validation.valid) {
      gateInstructions = [
        ``,
        `╔══════════════════════════════════════╗`,
        `║  ⚠️ VALIDATION GATE FAILED          ║`,
        `╠══════════════════════════════════════╣`,
        ...validation.missing.map(m => `║  ❌ ${m.padEnd(34)}║`),
        ...validation.warnings.map(w => `║  ⚠️ ${w.padEnd(34)}║`),
        `╠══════════════════════════════════════╣`,
        `║  Fix these before proceeding.        ║`,
        `╚══════════════════════════════════════╝`,
        ``,
        `DO NOT advance to the next phase. Fix the issues above first.`,
      ].join('\n');
    }
    
    // Phase-specific instructions
    let phaseInstructions = '';
    
    switch (plan.phase) {
      case 'research':
        phaseInstructions = [
          ``,
          `🔬 RESEARCH PHASE`,
          `Find ALL relevant files, deps, tests, risks.`,
          `Populate ## Research Findings completely.`,
          `Then: set phase=analyze, research_completed=true`,
          gateInstructions,
        ].join('\n');
        break;
        
      case 'analyze':
        phaseInstructions = [
          ``,
          `🧠 ANALYSIS PHASE`,
          `Plan context: ${plan.context?.relevantFiles.length || 0} files, ${plan.context?.potentialRisks.length || 0} risks`,
          `Document change order rationale in ## Analysis.`,
          `Then: set phase=plan, analysis_completed=true`,
          gateInstructions,
        ].join('\n');
        break;
        
      case 'plan':
        phaseInstructions = [
          ``,
          `📋 PLANNING PHASE`,
          `Create ordered tasks with: priority, deps, files, tests, complexity, est`,
          `Foundation first (types/schemas), core logic, integration, tests, docs`,
          `Then: set phase=execute`,
          gateInstructions,
        ].join('\n');
        break;
        
      case 'execute': {
        const nextTasks = plan.tasks.filter(t => 
          !t.done && t.dependencies.every(d => plan.tasks.find(t2 => t2.id === d)?.done)
        );
        const blockedTasks = plan.tasks.filter(t => !t.done && !nextTasks.includes(t));
        
        // Detect parallel groups
        const groups = findParallelGroups(plan.tasks);
        const parallelGroup = groups[0] || [];
        
        let taskInstructions = '';
        
        if (nextTasks.length > 0) {
          taskInstructions += `\n\n**Next task(s):**\n`;
          
          if (parallelGroup.length > 1) {
            taskInstructions += `⚡ These ${parallelGroup.length} tasks can run in PARALLEL (no file overlap):\n`;
            taskInstructions += parallelGroup.map(t => `  - ${t.text}`).join('\n');
            taskInstructions += `\n\nWork on them together if efficient.`;
          } else {
            const next = nextTasks[0];
            taskInstructions += `\nFocus: ${next.text}`;
            taskInstructions += `\nPriority: ${next.priority} | Complexity: ${next.estimatedComplexity}`;
            taskInstructions += `\nEstimate: ${next.estimatedMinutes}min`;
            taskInstructions += `\nFiles: ${next.relatedFiles.join(', ') || 'Not specified'}`;
            
            // Auto-generate test template if no test file specified
            if (next.testFiles.length === 0 && next.relatedFiles.length > 0) {
              const lang = detectLanguage(next.relatedFiles);
              const testTemplate = generateTestTemplate(next, lang);
              const testPath = next.relatedFiles[0]
                .replace(/\.(ts|js|py)$/, '.test.$1')
                .replace('src/', 'tests/');
              
              taskInstructions += `\n\n📝 No test file specified. Consider creating: ${testPath}`;
              taskInstructions += `\n\`\`\`${lang}\n${testTemplate}\n\`\`\``;
            }
            
            // Create checkpoint before first file change
            if (!currentCheckpointTask || currentCheckpointTask !== next.id) {
              currentCheckpointTask = next.id;
              const hash = await createGitCheckpoint(pi, plan, currentPlanPath!, next.id, ctx.signal);
              if (hash) {
                taskInstructions += `\n\n🔖 Checkpoint created: ${hash.slice(0, 7)}`;
              }
            }
          }
        }
        
        if (blockedTasks.length > 0) {
          taskInstructions += `\n\n🔒 Blocked:\n`;
          taskInstructions += blockedTasks.map(t => 
            `  - ${t.text} (needs: ${t.dependencies.filter(d => !plan.tasks.find(t2 => t2.id === d)?.done).join(', ')})`
          ).join('\n');
        }
        
        // Retry info
        const retrying = nextTasks.filter(t => t.retryCount > 0);
        if (retrying.length > 0) {
          taskInstructions += `\n\n⚠️ Retrying: ${retrying.map(t => `${t.text} (attempt ${t.retryCount}/${t.maxRetries})`).join(', ')}`;
        }
        
        phaseInstructions = [
          ``,
          `⚡ EXECUTION (${plan.tasks.filter(t => t.done).length}/${plan.tasks.length})`,
          taskInstructions,
          gateInstructions,
          `\nMark complete tasks as [x]. Use ask_user for clarification.`,
        ].join('\n');
        break;
      }
      
      case 'complete':
        phaseInstructions = `\n✅ All tasks complete. Notify user.`;
        break;
    }
    
    event.systemPrompt = `${event.systemPrompt}\n${phaseInstructions}`;
  });

  // ── Event: tool_call (Create checkpoint before file changes) ─────────

  pi.on('tool_call', async (event, ctx) => {
    if (!currentPlan || !currentPlanPath) return;
    if (currentPlan.phase !== 'execute') return;
    
    const writeTools = ['write', 'edit'];
    if (!writeTools.includes(event.toolName)) return;
    
    const activeTask = currentPlan.tasks.find(t => 
      !t.done && t.dependencies.every(d => currentPlan!.tasks.find(t2 => t2.id === d)?.done)
    );
    
    if (!activeTask) return;
    
    // Create checkpoint on first write per task
    if (currentCheckpointTask !== activeTask.id) {
      currentCheckpointTask = activeTask.id;
      activeTask.startedAt = Date.now();
      
      // Update relatedFiles from actual file path
      const filePath = event.input?.path || event.input?.file_path;
      if (filePath && !activeTask.relatedFiles.includes(filePath)) {
        activeTask.relatedFiles.push(filePath);
      }
      
      await createGitCheckpoint(pi, currentPlan, currentPlanPath, activeTask.id, ctx.signal);
    }
  });

  // ── Event: tool_result (Sync state + Detect failures) ────────────────

  pi.on('tool_result', async (event, ctx) => {
    if (!currentPlan || !currentPlanPath) return;
    
    // Sync when plan file changes
    if ((event.toolName === 'write' || event.toolName === 'edit') && event.input?.path) {
      if (resolve(event.input.path) === resolve(currentPlanPath)) {
        const updated = parsePlanFile(currentPlanPath);
        if (updated) currentPlan = updated;
      }
    }
    
    // Handle task failures
    if (event.isError && currentPlan.phase === 'execute') {
      const activeTask = currentPlan.tasks.find(t => !t.done && t.startedAt);
      if (activeTask) {
        activeTask.errorLog.push(`[${new Date().toISOString()}] ${event.toolName}: ${JSON.stringify(event.content)}`);
        activeTask.retryCount++;
        
        if (activeTask.retryCount >= activeTask.maxRetries) {
          // Create recovery task
          const recoveryTask: PlanTask = {
            id: `recovery-${activeTask.id}`,
            text: `🔧 Recover from: ${activeTask.text}`,
            done: false,
            dependencies: [],
            priority: 'high',
            estimatedComplexity: 'moderate',
            relatedFiles: activeTask.relatedFiles,
            testFiles: [],
            estimatedMinutes: 10,
            retryCount: 0,
            maxRetries: 2,
            errorLog: [],
          };
          
          const idx = currentPlan.tasks.indexOf(activeTask);
          currentPlan.tasks.splice(idx + 1, 0, recoveryTask);
          savePlanFile(currentPlanPath, currentPlan);
          
          // Re-index task IDs
          currentPlan.tasks.forEach((t, i) => { t.id = `task-${i + 1}`; });
        }
      }
    }
  });

  // ── Event: turn_end (Track turns) ────────────────────────────────────

  pi.on('turn_end', async (_event, ctx) => {
    if (!currentPlan) return;
    currentPlan.totalTurns++;
    if (currentPlanPath) {
      savePlanFile(currentPlanPath, currentPlan);
    }
  });

  // ── Event: agent_end (Validate + Complete + Learn) ───────────────────

  pi.on('agent_end', async (_event, ctx) => {
    loadCurrentPlan(ctx);
    
    if (!currentPlan || !currentPlanPath) return;
    
    const plan = currentPlan;
    
    // Check for phase transitions
    if (plan.phase === 'research' && plan.researchCompleted) {
      const validation = validatePhaseTransition(plan, 'analyze');
      if (validation.valid) {
        plan.phase = 'analyze';
        savePlanFile(currentPlanPath, plan);
        if (ctx.hasUI) ctx.ui.notify('✅ Research validated. Moving to analysis.', 'success');
      }
    } else if (plan.phase === 'analyze' && plan.analysisCompleted) {
      const validation = validatePhaseTransition(plan, 'plan');
      if (validation.valid) {
        plan.phase = 'plan';
        savePlanFile(currentPlanPath, plan);
        if (ctx.hasUI) ctx.ui.notify('✅ Analysis validated. Ready for planning.', 'success');
      }
    } else if (plan.phase === 'plan' && plan.tasks.length > 0) {
      const validation = validatePhaseTransition(plan, 'execute');
      if (validation.valid) {
        plan.phase = 'execute';
        savePlanFile(currentPlanPath, plan);
        if (ctx.hasUI) ctx.ui.notify(`✅ Plan validated. Executing ${plan.tasks.length} tasks.`, 'success');
      }
    }
    
    // Complete tasks that finished this turn
    for (const task of plan.tasks) {
      if (task.done && task.startedAt && !task.completedAt) {
        task.completedAt = Date.now();
        task.actualMinutes = Math.round((task.completedAt - task.startedAt) / 60000);
      }
    }
    
    // Check full completion
    const allDone = plan.tasks.length > 0 && plan.tasks.every(t => t.done);
    const pendingQs = plan.clarifications.filter(c => !c.answer);
    
    if (allDone && pendingQs.length === 0) {
      plan.phase = 'complete';
      plan.completedAt = Date.now();
      savePlanFile(currentPlanPath, plan);
      
      // Add to knowledge base
      addToKnowledgeBase(plan);
      
      if (ctx.hasUI) {
        const totalTime = plan.tasks.reduce((sum, t) => sum + (t.actualMinutes || 0), 0);
        ctx.ui.notify(
          `✅ Complete! ${plan.tasks.length} tasks in ${plan.totalTurns} turns (${totalTime}min). Plan saved to knowledge base.`,
          'success'
        );
      }
    } else if (pendingQs.length > 0 && ctx.hasUI) {
      ctx.ui.notify(`⏳ ${pendingQs.length} questions pending...`, 'warning');
      
      for (const q of pendingQs) {
        const answer = await ctx.ui.input(`🤔 [${q.context}]`, q.question, '');
        if (answer) {
          q.answer = answer;
          q.answeredAt = Date.now();
          
          let content = readFileSync(currentPlanPath, 'utf-8');
          const escapedQ = q.question.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          content = content.replace(
            new RegExp(`(Q: ${escapedQ}\\nContext: .+\\n)A: <!-- Waiting -->`),
            `$1A: ${answer}`
          );
          writeFileSync(currentPlanPath, content, 'utf-8');
        }
      }
      
      if (pendingQs.every(q => q.answer)) {
        await pi.sendUserMessage(
          'All questions answered. Review ## Clarifications and continue.',
          { deliverAs: 'steer' }
        );
      }
    }
  });

  // ── Cleanup on shutdown ──────────────────────────────────────────────

  pi.on('session_shutdown', async (_event, ctx) => {
    const cwd = ctx.cwd || process.cwd();
    cleanupPlanFiles(join(cwd, PLANS_DIR));
  });
}
