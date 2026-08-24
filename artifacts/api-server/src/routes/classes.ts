import { Router } from "express";
import { getAdapter } from "../lib/dbManager.js";
import { z } from "zod";

const router = Router();

const NameSchema = z.object({ name: z.string().min(1, "Name is required").max(100).trim() });
const RenameSchema = z.object({ newName: z.string().min(1, "New name is required").max(100).trim() });

router.get("/classes", async (_req, res) => {
  const names = await getAdapter().classes.list();
  res.json(names);
});

router.post("/classes", async (req, res) => {
  const parsed = NameSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten().fieldErrors }); return; }
  try {
    const cls = await getAdapter().classes.create(parsed.data.name);
    res.status(201).json(cls);
  } catch (e: any) {
    if (e?.code === "23505" || e?.message?.includes("already exists") || e?.message?.includes("UNIQUE")) {
      res.status(409).json({ error: "Class already exists" });
      return;
    }
    throw e;
  }
});

router.put("/classes/:name", async (req, res) => {
  const oldName = decodeURIComponent(req.params.name);
  const parsed = RenameSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten().fieldErrors }); return; }
  try {
    const updated = await getAdapter().classes.rename(oldName, parsed.data.newName);
    if (!updated) { res.status(404).json({ error: "Class not found" }); return; }
    res.json(updated);
  } catch (e: any) {
    if (e?.code === "23505" || e?.message?.includes("already exists") || e?.message?.includes("UNIQUE")) {
      res.status(409).json({ error: "Class already exists" });
      return;
    }
    throw e;
  }
});

router.delete("/classes/:name", async (req, res) => {
  const deleted = await getAdapter().classes.delete(decodeURIComponent(req.params.name));
  if (!deleted) { res.status(404).json({ error: "Class not found" }); return; }
  res.status(204).send();
});

export default router;
