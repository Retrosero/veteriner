/**
 * @file ClamAV scan adapter unit testleri.
 * @module apps/api/common/adapters/clamav-scan/spec
 * @description Gerçek bir ClamAV kurulumu gerektirmeden yerel TCP daemon
 * taklidiyle INSTREAM çerçeveleme, bulunan imza ve health kontrolünü doğrular.
 * @security Testler tarama servisinin yanıtını fail-closed yorumladığını
 * kanıtlar; gerçek daemon erişimi CI dışında bir altyapı sorumluluğudur.
 */

import { once } from "node:events";
import { createServer, type Server, type Socket } from "node:net";

import { afterEach, describe, expect, it } from "vitest";

import { ClamAvScanAdapter } from "./clamav-scan.adapter.js";

const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(async (server) => {
      server.close();
      await once(server, "close");
    }),
  );
});

async function startDaemon(onData: (socket: Socket, data: Buffer) => void) {
  const server = createServer((socket) => {
    const chunks: Buffer[] = [];
    socket.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
      onData(socket, Buffer.concat(chunks));
    });
  });
  servers.push(server);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("test_daemon_address_unavailable");
  }
  return address.port;
}

describe("ClamAvScanAdapter", () => {
  it("INSTREAM çerçevesini gönderir ve temiz yanıtı clean olarak döner", async () => {
    const port = await startDaemon((socket, data) => {
      const command = Buffer.from("zINSTREAM\0");
      const payloadStart = command.byteLength + 4;
      const declaredSize = data.readUInt32BE(command.byteLength);
      const complete =
        data.byteLength >= payloadStart + declaredSize + 4 &&
        data.subarray(0, command.byteLength).equals(command);
      if (complete) socket.end("stream: OK\0");
    });
    const adapter = new ClamAvScanAdapter({ host: "127.0.0.1", port });

    await expect(
      adapter.scan({
        key: "tenants/a/files/b",
        body: Buffer.from("safe-content"),
        contentType: "application/pdf",
      }),
    ).resolves.toMatchObject({ outcome: "clean", details: "stream: OK" });
  });

  it("FOUND yanıtını infected olarak döner", async () => {
    const port = await startDaemon((socket, data) => {
      if (data.includes(Buffer.from("zINSTREAM\0"))) {
        socket.end("stream: Win.Test.EICAR_HDB-1 FOUND\0");
      }
    });
    const adapter = new ClamAvScanAdapter({ host: "127.0.0.1", port });

    await expect(
      adapter.scan({
        key: "tenants/a/files/b",
        body: Buffer.from("eicar"),
        contentType: "application/pdf",
      }),
    ).resolves.toMatchObject({
      outcome: "infected",
      details: "Win.Test.EICAR_HDB-1",
    });
  });

  it("PING/PONG ile daemon sağlığını doğrular", async () => {
    const port = await startDaemon((socket, data) => {
      if (data.equals(Buffer.from("zPING\0"))) socket.end("PONG\0");
    });
    const adapter = new ClamAvScanAdapter({ host: "127.0.0.1", port });

    await expect(adapter.healthCheck()).resolves.toBe(true);
  });
});
