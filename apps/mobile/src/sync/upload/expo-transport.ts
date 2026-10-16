/**
 * Real {@link UploadTransport} for the LibrePhotos chunked-upload endpoints
 * (apps/backend/api/views/upload.py). App-only: imported solely by sync/run.
 *
 * Auth: every call sends `Authorization: Bearer <token>`. The upload views used
 * to read the JWT from a `jwt` COOKIE only, which is a browser-ism — React
 * Native's `fetch` cannot reliably set a `Cookie` header (on iOS NSURLSession
 * owns the cookie store and drops or overrides it), so `complete()` arrived
 * unauthenticated and answered 403 while the native chunk upload — whose headers
 * *are* passed verbatim — answered 200. The backend now accepts the header on
 * both views; the cookie is still sent alongside so this client keeps working
 * against a server that has not been updated yet.
 *
 * The bytes go through `expo-file-system` `uploadAsync` (streams from disk,
 * background URLSession on iOS), in chunks of at most UPLOAD_CHUNK_SIZE bytes
 * (see ./chunks): a single request for a whole photo was refused with a 413 by
 * the proxy. Resuming a half-sent file across runs is still a Phase 4
 * enhancement (see handoff); a failed run starts the file again.
 */
import { File, Paths, type FileHandle } from "expo-file-system";
import * as FileSystem from "expo-file-system/legacy";
import * as MediaLibrary from "expo-media-library/legacy";
import { isRecord, parseJson } from "@/lib/guards";
import { chunkRanges, contentRange } from "./chunks";
import type {
  UploadCompleteInput,
  UploadFileInput,
  UploadProgress,
  UploadResult,
  UploadTransport,
} from "./transport";

export type TransportDeps = {
  /** Bare server origin, no trailing slash, no `/api`. */
  serverAddress: () => string;
  getAccessToken: () => Promise<string | null>;
};

function authHeaders(token: string | null, withCookie: boolean): Record<string, string> {
  const h: Record<string, string> = {};
  if (token) {
    h.Authorization = `Bearer ${token}`;
    if (withCookie) h.Cookie = `jwt=${token}`;
  }
  return h;
}

/**
 * Network access IS allowed here, unlike in the hash pass: an upload cannot
 * happen without the bytes, and by the time we are here the user has turned
 * backup on and the Wi-Fi/charging gate has said yes. The iCloud path hands us
 * an already-resolved `file://` uri, so this is a no-op for it.
 */
async function resolveReadableUri(id: string, uri: string): Promise<string> {
  if (!uri.startsWith("ph://")) return uri;
  const info = await MediaLibrary.getAssetInfoAsync(id, { shouldDownloadFromNetwork: true });
  if (!info.localUri) throw new Error("could not resolve ph:// asset to a local uri");
  return info.localUri;
}

/**
 * Fold the server's own explanation into the thrown message.
 *
 * A bare "HTTP 400" in the sync log is exactly why the stuck-upload bug took a
 * device export to diagnose: the server always said *why* ("md5 checksum does
 * not match", "No scan directory configured"), and the client threw that away.
 */
function httpError(what: string, status: number, body: string): Error {
  let detail = (body ?? "").trim();
  try {
    const parsed = parseJson(detail);
    if (isRecord(parsed) && typeof parsed.detail === "string" && parsed.detail) detail = parsed.detail;
  } catch {
    // not JSON — keep the raw text
  }
  if (detail.length > 300) detail = `${detail.slice(0, 300)}…`;
  return new Error(detail ? `${what} failed: HTTP ${status} — ${detail}` : `${what} failed: HTTP ${status}`);
}

/**
 * Copy `length` bytes from `start` of the open source file into a new file in
 * the cache, for one chunk request. The caller deletes it after the request.
 */
function writeChunk(source: FileHandle, start: number, length: number): File {
  source.offset = start;
  const bytes = source.readBytes(length);
  if (bytes.length !== length) throw new Error("asset file changed size while uploading");
  const chunk = new File(Paths.cache, `upload-chunk-${Date.now()}-${start}`);
  chunk.create({ overwrite: true });
  chunk.write(bytes);
  return chunk;
}

function deleteQuietly(file: File | null): void {
  if (!file) return;
  try {
    file.delete();
  } catch {
    // already gone; the cache is cleared by the OS anyway
  }
}

export function createExpoUploadTransport(deps: TransportDeps): UploadTransport {
  const base = () => deps.serverAddress().replace(/\/+$/, "");

  return {
    async exists(hash: string): Promise<boolean> {
      const token = await deps.getAccessToken();
      const res = await fetch(`${base()}/api/exists/${encodeURIComponent(hash)}/`, {
        method: "GET",
        headers: { Accept: "application/json", ...authHeaders(token, false) },
      });
      if (!res.ok) throw httpError("exists check", res.status, await res.text().catch(() => ""));
      const json: unknown = await res.json();
      return isRecord(json) && json.exists === true;
    },

    async uploadFile(
      input: UploadFileInput,
      onProgress?: (p: UploadProgress) => void
    ): Promise<UploadResult> {
      const token = await deps.getAccessToken();
      const uri = await resolveReadableUri(input.assetId, input.uri);
      // Checksum the bytes we are about to send, in the same stat call that
      // sizes them — the completion call must not checksum a stale hash from
      // the hash pass (see UploadResult.md5). When the caller already measured
      // these exact bytes (the iCloud path checksums the original as it lands),
      // take its answer and stat for the size only: re-reading a just-downloaded
      // original to learn what we were told is the second half of paying twice.
      const stat = await FileSystem.getInfoAsync(uri, { md5: input.md5 == null });
      if (!stat.exists) throw new Error("asset file not found on disk");
      const size = stat.size ?? 0;
      const md5 = input.md5 ?? stat.md5 ?? undefined;

      // At most UPLOAD_CHUNK_SIZE bytes per request: the proxy answers 413 to a
      // larger body. A file that fits goes up straight from disk; a larger one
      // is cut into temporary chunk files, one per request.
      const ranges = chunkRanges(size);
      const source = ranges.length > 1 ? new File(uri).open() : null;
      let uploadId = "";
      let sent = 0;
      try {
        for (const range of ranges) {
          const length = range.end - range.start + 1;
          const chunk = source ? writeChunk(source, range.start, length) : null;
          try {
            const task = FileSystem.createUploadTask(
              `${base()}/api/upload/`,
              chunk?.uri ?? uri,
              {
                httpMethod: "POST",
                sessionType: FileSystem.FileSystemSessionType.BACKGROUND,
                uploadType: FileSystem.FileSystemUploadType.MULTIPART,
                fieldName: "file",
                mimeType: input.type === "video" ? "video/mp4" : "application/octet-stream",
                parameters: {
                  offset: String(range.start),
                  user: String(input.userId),
                  ...(uploadId ? { upload_id: uploadId } : {}),
                },
                headers: {
                  "Content-Range": contentRange(range, size),
                  ...authHeaders(token, true),
                },
              },
              (data) => {
                const inChunk = Math.min(data.totalBytesSent, length);
                onProgress?.({ sent: sent + inChunk, total: size });
              }
            );
            const result = await task.uploadAsync();
            if (!result) throw new Error("upload failed: no response");
            if (result.status >= 300) throw httpError("upload", result.status, result.body);
            try {
              const parsed = parseJson(result.body);
              uploadId = isRecord(parsed) && typeof parsed.upload_id === "string" ? parsed.upload_id : "";
            } catch {
              throw new Error("upload response was not valid JSON");
            }
            if (!uploadId) throw new Error("upload response missing upload_id");
          } finally {
            deleteQuietly(chunk);
          }
          sent += Math.max(0, length);
        }
      } finally {
        source?.close();
      }
      return { uploadId, md5 };
    },

    async complete(input: UploadCompleteInput): Promise<void> {
      const token = await deps.getAccessToken();
      const form = new FormData();
      form.append("upload_id", input.uploadId);
      form.append("md5", input.md5);
      form.append("user", String(input.userId));
      form.append("filename", input.filename);
      if (input.deviceCreatedAt != null) form.append("device_created_at", String(input.deviceCreatedAt));
      if (input.deviceModifiedAt != null) form.append("device_modified_at", String(input.deviceModifiedAt));
      const res = await fetch(`${base()}/api/upload/complete/`, {
        method: "POST",
        headers: { ...authHeaders(token, true) },
        body: form,
      });
      if (!res.ok) throw httpError("complete", res.status, await res.text().catch(() => ""));
    },
  };
}
