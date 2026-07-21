import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { statusService } from "../services/status.service";

export const getStatus = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params as unknown as { id: string };
  const result = await statusService.getStatus(id);
  res.status(200).json(result);
});

export const getResult = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params as unknown as { id: string };
  const result = await statusService.getResult(id);
  res.status(200).json(result);
});

export const getFailure = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params as unknown as { id: string };
  const result = await statusService.getFailure(id);
  res.status(200).json(result);
});
