import path from "node:path";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";

export interface StorageProvider { put(data: Uint8Array, extension: string): Promise<string>; get(key: string): Promise<Uint8Array>; delete(key: string): Promise<void>; }

export class LocalStorageProvider implements StorageProvider {
  private root = path.resolve(process.env.UPLOAD_ROOT || path.join(process.cwd(), "uploads"));
  async put(data: Uint8Array, extension: string) { await mkdir(this.root, { recursive: true }); const key = `${crypto.randomUUID()}.${extension}`; await writeFile(this.safePath(key), data); return key; }
  async get(key: string) { return new Uint8Array(await readFile(this.safePath(key))); }
  async delete(key: string) { await unlink(this.safePath(key)).catch(() => undefined); }
  private safePath(key: string) { if (!/^[0-9a-f-]{36}\.(png|jpe?g|webp|gif)$/.test(key)) throw new Error("INVALID_STORAGE_KEY"); const target = path.resolve(this.root, key); if (path.dirname(target) !== this.root) throw new Error("INVALID_STORAGE_PATH"); return target; }
}
