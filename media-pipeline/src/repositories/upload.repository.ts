import { Upload, UploadStatus } from "@prisma/client";
import { prisma } from "../config/prisma";
import { DatabaseError } from "../utils/errors";

// Repository pattern: this is the ONLY module in the codebase allowed to
// touch `prisma.upload`. Services depend on this interface, never on
// Prisma directly, so the ORM/database can be swapped without touching
// business logic.
export interface CreateUploadInput {
  filename: string;
  filepath: string;
  mimeType: string;
  sizeBytes: number;
  hash: string;
}

class UploadRepository {
  async create(data: CreateUploadInput): Promise<Upload> {
    try {
      return await prisma.upload.create({ data: { ...data, status: "PENDING" } });
    } catch (err) {
      throw new DatabaseError(`Failed to create upload record: ${(err as Error).message}`);
    }
  }

  async findById(id: string): Promise<Upload | null> {
    try {
      return await prisma.upload.findUnique({ where: { id } });
    } catch (err) {
      throw new DatabaseError(`Failed to fetch upload ${id}: ${(err as Error).message}`);
    }
  }

  async findByHash(hash: string): Promise<Upload | null> {
    try {
      return await prisma.upload.findFirst({ where: { hash }, orderBy: { createdAt: "asc" } });
    } catch (err) {
      throw new DatabaseError(`Failed to look up upload by hash: ${(err as Error).message}`);
    }
  }

  async updateStatus(id: string, status: UploadStatus, failureReason?: string): Promise<Upload> {
    try {
      return await prisma.upload.update({
        where: { id },
        data: { status, failureReason: failureReason ?? null },
      });
    } catch (err) {
      throw new DatabaseError(`Failed to update status for upload ${id}: ${(err as Error).message}`);
    }
  }
}

export const uploadRepository = new UploadRepository();
