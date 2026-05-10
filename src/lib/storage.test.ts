import { describe, expect, it } from "vitest";

import {
  uploadPropertyMap,
  uploadPropertyPhoto,
  uploadSitePhoto,
} from "./storage";

// These helpers reject obviously bad uploads (wrong MIME, oversize) before
// they ever talk to Supabase, which is the part that's actually testable
// without an SDK mock. Anything that gets past these checks goes through
// network I/O that we don't exercise here.

describe("storage upload validation", () => {
  describe("uploadPropertyMap", () => {
    it("rejects an unsupported content type", async () => {
      await expect(
        uploadPropertyMap({
          propertyId: "p1",
          filename: "x.gif",
          contentType: "image/gif",
          bytes: new Uint8Array(10),
        }),
      ).rejects.toThrow(/Unsupported map image type/);
    });

    it("rejects a payload over 5 MB", async () => {
      const tooBig = new Uint8Array(5 * 1024 * 1024 + 1);
      await expect(
        uploadPropertyMap({
          propertyId: "p1",
          filename: "x.png",
          contentType: "image/png",
          bytes: tooBig,
        }),
      ).rejects.toThrow(/exceeds 5MB/);
    });
  });

  describe("uploadPropertyPhoto", () => {
    it("rejects an unsupported content type", async () => {
      await expect(
        uploadPropertyPhoto({
          propertyId: "p1",
          filename: "x.tiff",
          contentType: "image/tiff",
          bytes: new Uint8Array(10),
        }),
      ).rejects.toThrow(/Unsupported photo type/);
    });

    it("rejects a payload over 10 MB", async () => {
      const tooBig = new Uint8Array(10 * 1024 * 1024 + 1);
      await expect(
        uploadPropertyPhoto({
          propertyId: "p1",
          filename: "x.png",
          contentType: "image/png",
          bytes: tooBig,
        }),
      ).rejects.toThrow(/exceeds 10MB/);
    });
  });

  describe("uploadSitePhoto", () => {
    it("rejects an unsupported content type", async () => {
      await expect(
        uploadSitePhoto({
          propertyId: "p1",
          siteId: "s1",
          filename: "x.bmp",
          contentType: "image/bmp",
          bytes: new Uint8Array(10),
        }),
      ).rejects.toThrow(/Unsupported photo type/);
    });

    it("rejects a payload over 10 MB", async () => {
      const tooBig = new Uint8Array(10 * 1024 * 1024 + 1);
      await expect(
        uploadSitePhoto({
          propertyId: "p1",
          siteId: "s1",
          filename: "x.png",
          contentType: "image/png",
          bytes: tooBig,
        }),
      ).rejects.toThrow(/exceeds 10MB/);
    });
  });
});
