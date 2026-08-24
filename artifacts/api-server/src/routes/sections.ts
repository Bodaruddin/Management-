import { Router } from "express";
import { getAdapter } from "../lib/dbManager.js";

const router = Router();

router.get("/sections", async (_req, res) => {
  const rows = await getAdapter().sections.list();
  res.json(rows);
});

router.post("/sections", async (req, res) => {
  const { name } = req.body;
  if (!name?.trim()) { res.status(400).json({ error: "name is required" }); return; }
  try {
    const row = await getAdapter().sections.create(name.trim());
    res.status(201).json(row);
  } catch (e: any) {
    if (e?.code === "23505" || e?.message?.includes("unique")) {
      res.status(409).json({ error: "Section already exists" }); return;
    }
    throw e;
  }
});

router.put("/sections/:name", async (req, res) => {
  const { newName } = req.body;
  if (!newName?.trim()) { res.status(400).json({ error: "newName is required" }); return; }
  try {
    const row = await getAdapter().sections.rename(req.params.name, newName.trim());
    if (!row) { res.status(404).json({ error: "Section not found" }); return; }
    res.json(row);
  } catch (e: any) {
    if (e?.code === "23505" || e?.message?.includes("unique")) {
      res.status(409).json({ error: "Section already exists" }); return;
    }
    throw e;
  }
});

router.delete("/sections/:name", async (req, res) => {
  const ok = await getAdapter().sections.delete(req.params.name);
  if (!ok) { res.status(404).json({ error: "Section not found" }); return; }
  res.status(204).send();
});

export default router;
