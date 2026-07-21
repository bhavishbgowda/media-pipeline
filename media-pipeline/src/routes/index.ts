import { Router } from "express";
import uploadRoutes from "./upload.routes";
import statusRoutes from "./status.routes";
import healthRoutes from "./health.routes";

const router = Router();
router.use(uploadRoutes);
router.use(statusRoutes);
router.use(healthRoutes);

export default router;
