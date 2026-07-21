import express from "express";
import cors from "cors";
import helmet from "helmet";
import routes from "./routes";
import { requestLogger } from "./middlewares/requestLogger";
import { errorHandler, notFoundHandler } from "./middlewares/errorHandler";

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors());
  app.use(requestLogger);
  app.use(express.json());

  app.use("/", routes);

  app.use(notFoundHandler);
  app.use(errorHandler); // must be registered last

  return app;
}
