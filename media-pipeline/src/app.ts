import express from "express";
import cors from "cors";
import helmet from "helmet";
import path from "path";              // NEW

import routes from "./routes";
import { requestLogger } from "./middlewares/requestLogger";
import { errorHandler, notFoundHandler } from "./middlewares/errorHandler";

export function createApp() {
  const app = express();

  app.use(
  helmet({
    contentSecurityPolicy: false,
  })
);
  app.use(cors());
  app.use(requestLogger);
  app.use(express.json());

  // Serve frontend
  app.use(express.static(path.join(process.cwd(), "public"))); // NEW

  // API Routes
  app.use("/", routes);

  // Homepage
  app.get("/", (_req, res) => { // NEW
    res.sendFile(path.join(process.cwd(), "public", "index.html"));
  });

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}