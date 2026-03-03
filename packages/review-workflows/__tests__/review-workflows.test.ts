import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { createWorkflowService } from '../src/services/workflow.js';
import { registerWorkflowRoutes } from '../src/routes/index.js';
import type { WorkflowService } from '../src/services/workflow.js';

function createDb() {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  return db;
}

describe('@apick/review-workflows', () => {
  let db: ReturnType<typeof Database>;
  let service: WorkflowService;

  beforeEach(() => {
    db = createDb();
    service = createWorkflowService({ rawDb: db });
  });

  // ---------------------------------------------------------------------------
  // Workflow CRUD
  // ---------------------------------------------------------------------------

  describe('Workflow CRUD', () => {
    it('creates a workflow', () => {
      const wf = service.create({ name: 'Editorial Review' });
      expect(wf.id).toBeDefined();
      expect(wf.name).toBe('Editorial Review');
      expect(wf.contentTypes).toEqual([]);
      expect(wf.stages).toEqual([]);
    });

    it('creates a workflow with initial stages', () => {
      const wf = service.create({
        name: 'Pipeline',
        stages: [{ name: 'Draft' }, { name: 'In Review', color: '#FF0000' }, { name: 'Approved' }],
      });
      expect(wf.stages).toHaveLength(3);
      expect(wf.stages[0].name).toBe('Draft');
      expect(wf.stages[0].position).toBe(0);
      expect(wf.stages[1].color).toBe('#FF0000');
      expect(wf.stages[2].position).toBe(2);
    });

    it('creates a workflow with content types', () => {
      const wf = service.create({ name: 'For Articles', contentTypes: ['api::article.article'] });
      expect(wf.contentTypes).toEqual(['api::article.article']);
    });

    it('lists all workflows', () => {
      service.create({ name: 'WF1' });
      service.create({ name: 'WF2' });
      expect(service.findAll()).toHaveLength(2);
    });

    it('finds a workflow by id', () => {
      const wf = service.create({ name: 'Findable' });
      const found = service.findOne(wf.id!);
      expect(found).not.toBeNull();
      expect(found!.name).toBe('Findable');
    });

    it('returns null for non-existent workflow', () => {
      expect(service.findOne(999)).toBeNull();
    });

    it('updates a workflow', () => {
      const wf = service.create({ name: 'Old' });
      const updated = service.updateById(wf.id!, { name: 'Updated' });
      expect(updated!.name).toBe('Updated');
    });

    it('updates content types on a workflow', () => {
      const wf = service.create({ name: 'Typed' });
      const updated = service.updateById(wf.id!, { contentTypes: ['api::page.page'] });
      expect(updated!.contentTypes).toEqual(['api::page.page']);
    });

    it('deletes a workflow', () => {
      const wf = service.create({ name: 'Delete Me' });
      expect(service.deleteById(wf.id!)).toBe(true);
      expect(service.findOne(wf.id!)).toBeNull();
    });

    it('returns false when deleting non-existent workflow', () => {
      expect(service.deleteById(999)).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // Stages
  // ---------------------------------------------------------------------------

  describe('Stages', () => {
    it('adds a stage to a workflow', () => {
      const wf = service.create({ name: 'WF' });
      const stage = service.addStage(wf.id!, { name: 'Review' });
      expect(stage).not.toBeNull();
      expect(stage!.name).toBe('Review');
      expect(stage!.position).toBe(0);
    });

    it('adds stages with auto-incrementing position', () => {
      const wf = service.create({ name: 'WF' });
      service.addStage(wf.id!, { name: 'Draft' });
      const second = service.addStage(wf.id!, { name: 'Review' });
      expect(second!.position).toBe(1);
    });

    it('returns null when adding stage to non-existent workflow', () => {
      expect(service.addStage(999, { name: 'Stage' })).toBeNull();
    });

    it('removes a stage', () => {
      const wf = service.create({ name: 'WF' });
      const stage = service.addStage(wf.id!, { name: 'Remove Me' });
      expect(service.removeStage(stage!.id!)).toBe(true);
      expect(service.getStages(wf.id!)).toHaveLength(0);
    });

    it('lists stages for a workflow', () => {
      const wf = service.create({ name: 'WF' });
      service.addStage(wf.id!, { name: 'A' });
      service.addStage(wf.id!, { name: 'B' });
      service.addStage(wf.id!, { name: 'C' });
      const stages = service.getStages(wf.id!);
      expect(stages).toHaveLength(3);
      expect(stages.map(s => s.name)).toEqual(['A', 'B', 'C']);
    });

    it('uses default color when not specified', () => {
      const wf = service.create({ name: 'WF' });
      const stage = service.addStage(wf.id!, { name: 'Default Color' });
      expect(stage!.color).toBe('#4945FF');
    });

    it('uses custom color when specified', () => {
      const wf = service.create({ name: 'WF' });
      const stage = service.addStage(wf.id!, { name: 'Custom', color: '#22CC44' });
      expect(stage!.color).toBe('#22CC44');
    });
  });

  // ---------------------------------------------------------------------------
  // Stage Assignments
  // ---------------------------------------------------------------------------

  describe('Stage Assignments', () => {
    it('assigns a document to a stage', () => {
      const wf = service.create({ name: 'WF', stages: [{ name: 'Draft' }, { name: 'Review' }] });
      const stages = service.getStages(wf.id!);
      const result = service.assignStage('api::article.article', 'doc-1', stages[0].id!);
      expect(result).toBe(true);
    });

    it('retrieves the current stage of a document', () => {
      const wf = service.create({ name: 'WF', stages: [{ name: 'Draft' }, { name: 'Review' }] });
      const stages = service.getStages(wf.id!);
      service.assignStage('api::article.article', 'doc-1', stages[0].id!);
      const stage = service.getDocumentStage('api::article.article', 'doc-1');
      expect(stage).not.toBeNull();
      expect(stage!.name).toBe('Draft');
    });

    it('transitions a document to a new stage', () => {
      const wf = service.create({ name: 'WF', stages: [{ name: 'Draft' }, { name: 'Review' }] });
      const stages = service.getStages(wf.id!);
      service.assignStage('api::article.article', 'doc-1', stages[0].id!);
      service.assignStage('api::article.article', 'doc-1', stages[1].id!);
      const stage = service.getDocumentStage('api::article.article', 'doc-1');
      expect(stage!.name).toBe('Review');
    });

    it('returns null for unassigned document', () => {
      expect(service.getDocumentStage('api::article.article', 'unassigned')).toBeNull();
    });

    it('returns false when assigning to non-existent stage', () => {
      expect(service.assignStage('api::a.a', 'doc-1', 999)).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // Routes
  // ---------------------------------------------------------------------------

  describe('Routes', () => {
    it('registers routes on the router', () => {
      const routes: string[] = [];
      const mockRouter = {
        on(method: string, path: string) { routes.push(`${method} ${path}`); },
      };
      registerWorkflowRoutes({ router: mockRouter, workflowService: service });
      expect(routes).toContain('GET /admin/review-workflows');
      expect(routes).toContain('POST /admin/review-workflows');
      expect(routes).toContain('POST /admin/review-workflows/:id/stages');
      expect(routes).toContain('PUT /admin/review-workflows/assign-stage');
    });
  });
});
