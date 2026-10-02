import { Router } from "express";
import { bearerToken, findAuthSession, revokeAuthSession } from "../lib/authSessions.js";

const router = Router();

router.get("/auth/session", async (req, res) => {
  const session = await findAuthSession(bearerToken(req.get("authorization")));
  if (!session) {
    res.status(401).json({ error: "SESSION_REVOKED" });
    return;
  }
  res.json({
    valid: true,
    userId: session.userId,
    role: session.role,
    expiresAt: new Date(session.expiresAt).toISOString(),
  });
});

router.post("/auth/logout", async (req, res) => {
  await revokeAuthSession(bearerToken(req.get("authorization")));
  res.status(204).send();
});

export default router;