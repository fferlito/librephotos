/**
 * How a file is split for POST /api/upload/. Pure, so the node project tests it.
 *
 * A request body over 1 MB is refused by nginx's default `client_max_body_size`
 * with a 413, and the LibrePhotos proxy keeps that default. The web app sends
 * 1,000,000-byte chunks for the same reason (apps/frontend chunkedUpload.ts).
 */
export const UPLOAD_CHUNK_SIZE = 1_000_000;

/** One chunk: bytes `start..end`, both inclusive. */
export type ChunkRange = { start: number; end: number };

/**
 * The chunks of a file of `size` bytes, in order. An empty file still gets one
 * (empty) chunk, so the server creates an upload for it.
 */
export function chunkRanges(size: number, chunkSize: number = UPLOAD_CHUNK_SIZE): ChunkRange[] {
  if (size <= 0) return [{ start: 0, end: -1 }];
  const ranges: ChunkRange[] = [];
  for (let start = 0; start < size; start += chunkSize) {
    ranges.push({ start, end: Math.min(start + chunkSize, size) - 1 });
  }
  return ranges;
}

/** The `Content-Range` header of one chunk of a file of `size` bytes. */
export function contentRange(range: ChunkRange, size: number): string {
  return `bytes ${range.start}-${Math.max(range.start, range.end)}/${size}`;
}
