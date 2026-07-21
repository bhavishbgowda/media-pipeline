import { z } from "zod";

export const idParamSchema = z.object({
  id: z.string().uuid({ message: "id must be a valid UUID" }),
});

export type IdParam = z.infer<typeof idParamSchema>;
