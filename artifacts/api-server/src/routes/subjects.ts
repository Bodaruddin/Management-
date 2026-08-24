import { Router } from "express";
import { getAdapter } from "../lib/dbManager.js";

const router = Router();

router.get("/subjects", async (_req, res) => {
  const names = await getAdapter().subjects.list();
  res.json(names);
});

router.post("/subjects", async (req, res) => {
  const { name, id } = req.body;
  if (!name) { res.status(400).json({ error: "name is required" }); return; }
  try {
    const row = await getAdapter().subjects.create(name, id);
    res.status(201).json(row);
  } catch {
    res.status(409).json({ error: "Subject already exists" });
  }
});

router.delete("/subjects/:name", async (req, res) => {
  await getAdapter().subjects.delete(decodeURIComponent(req.params.name));
  res.status(204).send();
});

export default router;
