import { Router } from "express";
import { getAdapter } from "../lib/dbManager.js";

const router = Router();

router.get("/fee-types", async (_req, res) => {
  const rows = await getAdapter().feeTypes.list();
  res.json(rows);
});

router.post("/fee-types", async (req, res) => {
  const body = req.body;
  if (!body.name) { res.status(400).json({ error: "name is required" }); return; }
  const row = await getAdapter().feeTypes.create(body);
  res.status(201).json(row);
});

router.put("/fee-types/:id", async (req, res) => {
  const row = await getAdapter().feeTypes.update(req.params.id, req.body);
  if (!row) { res.status(404).json({ error: "FeeType not found" }); return; }
  res.json(row);
});

router.delete("/fee-types/:id", async (req, res) => {
  await getAdapter().feeTypes.delete(req.params.id);
  res.status(204).send();
});

export default router;
