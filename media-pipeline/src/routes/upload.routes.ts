import { Router } from "express";
import { uploadMiddleware } from "../middlewares/upload.middleware";
import { uploadImage } from "../controllers/upload.controller";

const router = Router();
router.post("/upload", uploadMiddleware.single("image"), uploadImage);

export default router;
