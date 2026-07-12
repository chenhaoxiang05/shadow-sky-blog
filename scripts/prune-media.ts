import { withDatabase } from "../db";
import { PostgresRepository } from "../db/repository";
import { MediaService } from "../lib/media-service";
import { LocalStorageProvider } from "../lib/storage";

const limit = Number(process.env.MEDIA_PRUNE_BATCH_SIZE ?? 100);
if (!Number.isInteger(limit) || limit < 1 || limit > 500) throw new Error("MEDIA_PRUNE_BATCH_SIZE must be between 1 and 500");

const result = await withDatabase(async (db) => {
  const media = new MediaService(new PostgresRepository(db), new LocalStorageProvider());
  return media.prunePending(limit);
});

console.log(`Media cleanup finished: completed=${result.completed}, failed=${result.failed}.`);
if (result.failed > 0) process.exitCode = 1;
