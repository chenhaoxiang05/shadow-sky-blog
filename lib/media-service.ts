import { hasRole } from "./authorization";
import { DomainError, type Actor } from "./domain";
import type { Repository } from "./repository";
import type { StorageProvider } from "./storage";

const types = [
  { mime: "image/png", ext: "png", test: (b: Uint8Array) => b.length > 8 && [137,80,78,71,13,10,26,10].every((v, i) => b[i] === v) },
  { mime: "image/jpeg", ext: "jpg", test: (b: Uint8Array) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: "image/webp", ext: "webp", test: (b: Uint8Array) => b.length > 12 && text(b, 0, 4) === "RIFF" && text(b, 8, 12) === "WEBP" },
  { mime: "image/gif", ext: "gif", test: (b: Uint8Array) => b.length > 6 && ["GIF87a", "GIF89a"].includes(text(b, 0, 6)) },
] as const;

export class MediaService {
  constructor(private repo: Repository, private storage: StorageProvider) {}
  async upload(actor: Actor, input: { data: Uint8Array; declaredMime: string; purpose: "AVATAR" | "COVER" | "CONTENT"; requestId: string }) {
    if (!hasRole(actor, input.purpose === "AVATAR" ? "MEMBER" : "CONTRIBUTOR")) throw new DomainError("FORBIDDEN", "当前角色不能上传此类图片", 403);
    const max = input.purpose === "AVATAR" ? 5_000_000 : 10_000_000;
    if (!input.data.length || input.data.length > max) throw new DomainError("INVALID_INPUT", `图片大小必须小于 ${max / 1_000_000}MB`, 400);
    const detected = types.find((type) => type.test(input.data));
    if (!detected || detected.mime !== input.declaredMime) throw new DomainError("INVALID_INPUT", "文件内容与允许的图片类型不匹配", 400);
    const storageKey = await this.storage.put(input.data, detected.ext);
    try {
      const buffer = new ArrayBuffer(input.data.byteLength); new Uint8Array(buffer).set(input.data);
      const sha256 = bytesToHex(new Uint8Array(await crypto.subtle.digest("SHA-256", buffer)));
      const asset = await this.repo.createMediaAsset({ ownerId: actor.userId!, storageKey, mimeType: detected.mime, byteSize: input.data.length, sha256 });
      await this.repo.audit({ actorId: actor.userId, action: "MEDIA_UPLOADED", targetType: "MEDIA", targetId: asset.id, requestId: input.requestId, metadata: { purpose: input.purpose, mimeType: detected.mime, byteSize: input.data.length } });
      return { ...asset, url: `/api/media/${asset.id}` };
    } catch (error) { await this.storage.delete(storageKey); throw error; }
  }
  async read(id: string) { const asset = await this.repo.findMediaAssetById(id); if (!asset) throw new DomainError("NOT_FOUND", "图片不存在", 404); return { asset, data: await this.storage.get(asset.storageKey) }; }
}

function text(bytes: Uint8Array, start: number, end: number) { return String.fromCharCode(...bytes.slice(start, end)); }
function bytesToHex(bytes: Uint8Array) { return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join(""); }
