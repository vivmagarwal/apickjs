/**
 * Review Workflows Service.
 *
 * Multi-stage content approval workflows with configurable stages,
 * permissions, and transitions.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Workflow {
  id?: number;
  name: string;
  contentTypes: string[];
  stages: WorkflowStage[];
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowStage {
  id?: number;
  workflowId: number;
  name: string;
  color: string;
  position: number;
}

export interface WorkflowService {
  findAll(): Workflow[];
  findOne(id: number): Workflow | null;
  create(data: { name: string; contentTypes?: string[]; stages?: Array<{ name: string; color?: string }> }): Workflow;
  updateById(id: number, data: Partial<{ name: string; contentTypes: string[] }>): Workflow | null;
  deleteById(id: number): boolean;
  addStage(workflowId: number, data: { name: string; color?: string }): WorkflowStage | null;
  removeStage(stageId: number): boolean;
  getStages(workflowId: number): WorkflowStage[];
  assignStage(contentType: string, documentId: string, stageId: number): boolean;
  getDocumentStage(contentType: string, documentId: string): WorkflowStage | null;
}

export interface WorkflowServiceConfig {
  rawDb: any;
}

// ---------------------------------------------------------------------------
// Table setup & service factory
// ---------------------------------------------------------------------------

function ensureTables(db: any): void {
  db.exec(`CREATE TABLE IF NOT EXISTS "review_workflows" (
    "id" INTEGER PRIMARY KEY AUTOINCREMENT,
    "name" VARCHAR(255) NOT NULL,
    "content_types" TEXT NOT NULL DEFAULT '[]',
    "created_at" TEXT NOT NULL,
    "updated_at" TEXT NOT NULL
  )`);

  db.exec(`CREATE TABLE IF NOT EXISTS "review_workflow_stages" (
    "id" INTEGER PRIMARY KEY AUTOINCREMENT,
    "workflow_id" INTEGER NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "color" VARCHAR(20) NOT NULL DEFAULT '#4945FF',
    "position" INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY ("workflow_id") REFERENCES "review_workflows"("id") ON DELETE CASCADE
  )`);

  db.exec(`CREATE TABLE IF NOT EXISTS "review_workflow_assignments" (
    "id" INTEGER PRIMARY KEY AUTOINCREMENT,
    "content_type" VARCHAR(255) NOT NULL,
    "document_id" VARCHAR(255) NOT NULL,
    "stage_id" INTEGER NOT NULL,
    FOREIGN KEY ("stage_id") REFERENCES "review_workflow_stages"("id") ON DELETE CASCADE
  )`);

  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS "idx_rw_assignments_doc"
    ON "review_workflow_assignments" ("content_type", "document_id")`);
}

export function createWorkflowService(config: WorkflowServiceConfig): WorkflowService {
  const { rawDb } = config;
  ensureTables(rawDb);

  function getStagesForWorkflow(workflowId: number): WorkflowStage[] {
    return rawDb.prepare(`SELECT * FROM "review_workflow_stages" WHERE workflow_id = ? ORDER BY position ASC`)
      .all(workflowId)
      .map((r: any) => ({ id: r.id, workflowId: r.workflow_id, name: r.name, color: r.color, position: r.position }));
  }

  function rowToWorkflow(row: any): Workflow {
    return {
      id: row.id, name: row.name,
      contentTypes: JSON.parse(row.content_types || '[]'),
      stages: getStagesForWorkflow(row.id),
      createdAt: row.created_at, updatedAt: row.updated_at,
    };
  }

  return {
    findAll() {
      return rawDb.prepare(`SELECT * FROM "review_workflows" ORDER BY id ASC`).all().map(rowToWorkflow);
    },

    findOne(id) {
      const row = rawDb.prepare(`SELECT * FROM "review_workflows" WHERE id = ?`).get(id);
      return row ? rowToWorkflow(row) : null;
    },

    create(data) {
      const now = new Date().toISOString();
      const result = rawDb.prepare(`
        INSERT INTO "review_workflows" (name, content_types, created_at, updated_at)
        VALUES (?, ?, ?, ?)
      `).run(data.name, JSON.stringify(data.contentTypes || []), now, now);

      const workflowId = result.lastInsertRowid as number;

      if (data.stages) {
        for (let i = 0; i < data.stages.length; i++) {
          rawDb.prepare(`
            INSERT INTO "review_workflow_stages" (workflow_id, name, color, position)
            VALUES (?, ?, ?, ?)
          `).run(workflowId, data.stages[i].name, data.stages[i].color || '#4945FF', i);
        }
      }

      return this.findOne(workflowId)!;
    },

    updateById(id, data) {
      const existing = this.findOne(id);
      if (!existing) return null;

      const now = new Date().toISOString();
      const sets: string[] = ['updated_at = ?'];
      const values: any[] = [now];
      if (data.name !== undefined) { sets.push('name = ?'); values.push(data.name); }
      if (data.contentTypes !== undefined) { sets.push('content_types = ?'); values.push(JSON.stringify(data.contentTypes)); }
      values.push(id);
      rawDb.prepare(`UPDATE "review_workflows" SET ${sets.join(', ')} WHERE id = ?`).run(...values);
      return this.findOne(id);
    },

    deleteById(id) {
      const result = rawDb.prepare(`DELETE FROM "review_workflows" WHERE id = ?`).run(id);
      return result.changes > 0;
    },

    addStage(workflowId, data) {
      const workflow = this.findOne(workflowId);
      if (!workflow) return null;

      const maxPos = rawDb.prepare(`SELECT MAX(position) as max FROM "review_workflow_stages" WHERE workflow_id = ?`).get(workflowId);
      const position = (maxPos?.max ?? -1) + 1;

      const result = rawDb.prepare(`
        INSERT INTO "review_workflow_stages" (workflow_id, name, color, position)
        VALUES (?, ?, ?, ?)
      `).run(workflowId, data.name, data.color || '#4945FF', position);

      const row = rawDb.prepare(`SELECT * FROM "review_workflow_stages" WHERE id = ?`).get(result.lastInsertRowid);
      return { id: row.id, workflowId: row.workflow_id, name: row.name, color: row.color, position: row.position };
    },

    removeStage(stageId) {
      const result = rawDb.prepare(`DELETE FROM "review_workflow_stages" WHERE id = ?`).run(stageId);
      return result.changes > 0;
    },

    getStages: getStagesForWorkflow,

    assignStage(contentType, documentId, stageId) {
      const stage = rawDb.prepare(`SELECT * FROM "review_workflow_stages" WHERE id = ?`).get(stageId);
      if (!stage) return false;

      const existing = rawDb.prepare(
        `SELECT id FROM "review_workflow_assignments" WHERE content_type = ? AND document_id = ?`
      ).get(contentType, documentId);

      if (existing) {
        rawDb.prepare(`UPDATE "review_workflow_assignments" SET stage_id = ? WHERE id = ?`).run(stageId, existing.id);
      } else {
        rawDb.prepare(`INSERT INTO "review_workflow_assignments" (content_type, document_id, stage_id) VALUES (?, ?, ?)`)
          .run(contentType, documentId, stageId);
      }
      return true;
    },

    getDocumentStage(contentType, documentId) {
      const row = rawDb.prepare(`
        SELECT s.* FROM "review_workflow_assignments" a
        JOIN "review_workflow_stages" s ON a.stage_id = s.id
        WHERE a.content_type = ? AND a.document_id = ?
      `).get(contentType, documentId);

      if (!row) return null;
      return { id: row.id, workflowId: row.workflow_id, name: row.name, color: row.color, position: row.position };
    },
  };
}
