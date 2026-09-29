import { Router } from "express";
import { getAdapter } from "../lib/dbManager.js";

const router = Router();

router.get("/expenses", async (_req, res) => {
  const rows = await getAdapter().expenses.list();
  res.json(rows);
});

router.post("/expenses", async (req, res) => {
  const body = req.body;
  if (!body.description || body.amount == null) {
    res.status(400).json({ error: "description and amount are required" });
    return;
  }
  const row = await getAdapter().expenses.create(body);
  res.status(201).json(row);
});

router.put("/expenses/:id", async (req, res) => {
  const body = req.body;
  if (!body.description || body.amount == null) {
    res.status(400).json({ error: "description and amount are required" });
    return;
  }
  const row = await getAdapter().expenses.update(req.params.id, body);
  if (!row) {
    res.status(404).json({ error: "Expense not found" });
    return;
  }
  res.json(row);
});

router.delete("/expenses/:id", async (req, res) => {
  await getAdapter().expenses.delete(req.params.id);
  res.status(204).send();
});

export default router;
