/**
 * Database Connection Manager REST routes
 *
 * GET    /api/db-connections            — list all (masked, no secrets)
 * GET    /api/db-connections/active     — active connection info
 * POST   /api/db-connections            — create (PostgreSQL or Firebase)
 * PUT    /api/db-connections/:id        — update
 * DELETE /api/db-connections/:id        — delete
 * POST   /api/db-connections/:id/test       — test connectivity
 * POST   /api/db-connections/:id/activate   — switch active + auto-init schema
 */
import { Router } from "express";
import {
  listConnections,
  createConnectionPg,
  createConnectionFirebase,
  updateConnection,
  deleteConnection,
  testConnection,
  activateConnection,
  getActiveConnectionInfo,
  type FirebaseConfig,
} from "../lib/dbManager.js";

const router = Router();

router.get("/db-connections", (_req, res) => {
  res.json(listConnections());
});

router.get("/db-connections/active", (_req, res) => {
  res.json(getActiveConnectionInfo());
});

router.post("/db-connections", (req, res) => {
  const { name, dbType = "postgresql", url, ...fbFields } = req.body;

  if (!name) { res.status(400).json({ error: "name is required" }); return; }

  if (dbType === "firebase") {
    const config: FirebaseConfig = {
      projectId: fbFields.projectId ?? "",
      apiKey: fbFields.apiKey ?? "",
      authDomain: fbFields.authDomain ?? "",
      storageBucket: fbFields.storageBucket ?? "",
      messagingSenderId: fbFields.messagingSenderId ?? "",
      appId: fbFields.appId ?? "",
      serviceAccountJson: fbFields.serviceAccountJson ?? "",
    };
    if (!config.projectId || !config.serviceAccountJson) {
      res.status(400).json({ error: "projectId and serviceAccountJson are required for Firebase" });
      return;
    }
    try { JSON.parse(config.serviceAccountJson); } catch {
      res.status(400).json({ error: "serviceAccountJson must be valid JSON" });
      return;
    }
    const conn = createConnectionFirebase({ name, config });
    res.status(201).json(conn);
  } else {
    // PostgreSQL (default, backward-compatible)
    if (!url) { res.status(400).json({ error: "url is required for PostgreSQL" }); return; }
    try { new URL(url); } catch {
      res.status(400).json({ error: "Invalid connection URL" });
      return;
    }
    const conn = createConnectionPg({ name, url });
    res.status(201).json(conn);
  }
});

router.put("/db-connections/:id", async (req, res) => {
  const { name, url, config } = req.body;
  if (url) {
    try { new URL(url); } catch {
      res.status(400).json({ error: "Invalid connection URL" });
      return;
    }
  }
  const conn = await updateConnection(req.params.id, { name, url, config });
  if (!conn) { res.status(404).json({ error: "Connection not found" }); return; }
  res.json(conn);
});

router.delete("/db-connections/:id", async (req, res) => {
  const ok = await deleteConnection(req.params.id);
  if (!ok) { res.status(404).json({ error: "Connection not found" }); return; }
  res.status(204).send();
});

router.post("/db-connections/:id/test", async (req, res) => {
  const result = await testConnection(req.params.id);
  res.json(result);
});

router.post("/db-connections/:id/activate", async (req, res) => {
  const result = await activateConnection(req.params.id);
  res.status(result.success ? 200 : 400).json(result);
});

export default router;
