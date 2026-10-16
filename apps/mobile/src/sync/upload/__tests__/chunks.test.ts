/**
 * @jest-environment node
 *
 * The proxy answers 413 to a body over 1 MB, so no chunk may be larger than
 * UPLOAD_CHUNK_SIZE, and the chunks must cover the file exactly once.
 */
import { chunkRanges, contentRange, UPLOAD_CHUNK_SIZE } from "../chunks";

describe("chunkRanges", () => {
  it("keeps a small file in one chunk", () => {
    expect(chunkRanges(1234)).toEqual([{ start: 0, end: 1233 }]);
  });

  it("splits a large file into chunks of at most UPLOAD_CHUNK_SIZE bytes", () => {
    const size = 3_807_360; // a photo the proxy refused in one request
    const ranges = chunkRanges(size);
    expect(ranges).toHaveLength(4);
    for (const r of ranges) expect(r.end - r.start + 1).toBeLessThanOrEqual(UPLOAD_CHUNK_SIZE);
    // Contiguous and covering the whole file.
    expect(ranges[0].start).toBe(0);
    for (let i = 1; i < ranges.length; i++) expect(ranges[i].start).toBe(ranges[i - 1].end + 1);
    expect(ranges[ranges.length - 1].end).toBe(size - 1);
  });

  it("does not add an empty chunk when the size is an exact multiple", () => {
    expect(chunkRanges(2 * UPLOAD_CHUNK_SIZE)).toEqual([
      { start: 0, end: UPLOAD_CHUNK_SIZE - 1 },
      { start: UPLOAD_CHUNK_SIZE, end: 2 * UPLOAD_CHUNK_SIZE - 1 },
    ]);
  });

  it("gives an empty file one empty chunk", () => {
    expect(chunkRanges(0)).toEqual([{ start: 0, end: -1 }]);
  });
});

describe("contentRange", () => {
  it("names the chunk's bytes and the whole file's size", () => {
    expect(contentRange({ start: 1_000_000, end: 1_999_999 }, 3_807_360)).toBe("bytes 1000000-1999999/3807360");
  });

  it("matches the old single-request header for an empty file", () => {
    expect(contentRange({ start: 0, end: -1 }, 0)).toBe("bytes 0-0/0");
  });
});
