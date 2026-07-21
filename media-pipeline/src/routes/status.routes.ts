import { Router } from "express";
import { validate } from "../middlewares/validateRequest";
import { idParamSchema } from "../validators/params.validator";
import { getStatus, getResult, getFailure } from "../controllers/status.controller";

const router = Router();
router.get("/status/:id", validate(idParamSchema, "params"), getStatus);
router.get("/result/:id", validate(idParamSchema, "params"), getResult);
router.get("/failure/:id", validate(idParamSchema, "params"), getFailure);

export default router;
