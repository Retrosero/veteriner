/**
 * @file S3 storage adapter unit testleri.
 * @module apps/api/common/adapters/s3-storage/spec
 * @description SDK istemcisini ağ yerine kontrollü fake ile değiştirerek
 * upload checksum/SSE, metadata ve arşiv taşıma komutlarını doğrular.
 * @security Testler public URL yerine adapter'in kısa ömürlü URL ve private
 * bucket varsayımlarıyla çalıştığını; nesne arşivlemede hedef prefix'i
 * kullandığını kanıtlar.
 */

import {
  CopyObjectCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { describe, expect, it, vi } from "vitest";

import { S3StorageAdapter } from "./s3-storage.adapter.js";

type Send = (command: unknown) => Promise<unknown>;

function makeAdapter(send: Send): S3StorageAdapter {
  const adapter = new S3StorageAdapter({
    bucket: "vetniva-private",
    region: "eu-central-1",
    endpoint: "http://minio.test",
    forcePathStyle: true,
  });
  Object.defineProperty(adapter, "client", { value: { send } });
  return adapter;
}

describe("S3StorageAdapter", () => {
  it("upload sırasında SHA-256, metadata ve SSE-S3 gönderir", async () => {
    const send = vi.fn().mockResolvedValue({});
    const adapter = makeAdapter(send);

    const object = await adapter.put({
      key: "tenants/t-1/files/f-1",
      body: Buffer.from("safe-content"),
      contentType: "application/pdf",
      metadata: { tenantId: "t-1" },
    });

    const command: unknown = send.mock.calls[0]?.[0];
    expect(command).toBeInstanceOf(PutObjectCommand);
    expect((command as PutObjectCommand).input).toMatchObject({
      Bucket: "vetniva-private",
      Key: "tenants/t-1/files/f-1",
      ContentType: "application/pdf",
      ContentLength: 12,
      Metadata: { tenantId: "t-1" },
      ServerSideEncryption: "AES256",
    });
    expect(object.checksumSha256).toHaveLength(64);
  });

  it("metadata okumasını StorageObject olarak döner", async () => {
    const send = vi.fn().mockResolvedValue({
      ContentLength: 42,
      ContentType: "application/pdf",
      LastModified: new Date("2026-08-01T00:00:00.000Z"),
      ChecksumSHA256: Buffer.from("checksum").toString("base64"),
    });
    const adapter = makeAdapter(send);

    await expect(adapter.get("tenants/t-1/files/f-1")).resolves.toEqual({
      key: "tenants/t-1/files/f-1",
      size: 42,
      contentType: "application/pdf",
      lastModified: new Date("2026-08-01T00:00:00.000Z"),
      checksumSha256: Buffer.from("checksum").toString("hex"),
    });
    expect(send.mock.calls[0]?.[0]).toBeInstanceOf(HeadObjectCommand);
  });

  it("arşivlemede önce archived prefix'ine kopyalar, sonra kaynak anahtarı taşır", async () => {
    const send = vi.fn().mockResolvedValue({});
    const adapter = makeAdapter(send);

    await adapter.archive("tenants/t 1/files/f-1", "retention");

    expect(send.mock.calls[0]?.[0]).toBeInstanceOf(CopyObjectCommand);
    expect((send.mock.calls[0]?.[0] as CopyObjectCommand).input).toMatchObject({
      Bucket: "vetniva-private",
      Key: "archived/tenants/t 1/files/f-1",
      CopySource: "/vetniva-private/tenants/t%201/files/f-1",
      MetadataDirective: "COPY",
    });
    expect(send.mock.calls[1]?.[0]).toBeInstanceOf(DeleteObjectCommand);
    expect((send.mock.calls[1]?.[0] as DeleteObjectCommand).input).toEqual({
      Bucket: "vetniva-private",
      Key: "tenants/t 1/files/f-1",
    });
  });

  it("HeadBucket başarılı olduğunda healthy döner", async () => {
    const send = vi.fn().mockResolvedValue({});
    const adapter = makeAdapter(send);

    await expect(adapter.healthCheck()).resolves.toBe(true);
    expect(send.mock.calls[0]?.[0]).toBeInstanceOf(HeadBucketCommand);
  });
});
