import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { checkUpload, FileRejected, sniff } from "./file-type";
import { isPublicIP } from "./ip";
import { parsePublicUrl, safeFetch, UrlRejected } from "./safe-fetch";

describe("classification IP", () => {
  it.each([
    "127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254",
    "100.64.0.1", "0.0.0.0", "224.0.0.1", "255.255.255.255", "198.18.0.1",
    "::1", "::", "fe80::1", "fc00::1", "fd12:3456::1", "::ffff:127.0.0.1", "::ffff:10.0.0.1",
    "::ffff:7f00:1", "64:ff9b::a00:1", "2002:7f00:1::", "ff02::1", "2001:db8::1", "fec0::1",
  ])("bloque %s", (ip) => expect(isPublicIP(ip)).toBe(false));

  it.each(["1.1.1.1", "8.8.8.8", "93.184.215.14", "2606:4700:4700::1111", "::ffff:8.8.8.8"])(
    "autorise %s",
    (ip) => expect(isPublicIP(ip)).toBe(true),
  );

  it("refuse les formes invalides", () => {
    for (const ip of ["", "1.2.3", "256.1.1.1", "localhost", "fe80::1%eth0", "1::2::3"]) {
      expect(isPublicIP(ip)).toBe(false);
    }
  });
});

describe("validation d'URL", () => {
  const rejects = (raw: string, code: string) => {
    try {
      parsePublicUrl(raw);
      throw new Error("aurait dû être refusée");
    } catch (e) {
      expect(e).toBeInstanceOf(UrlRejected);
      expect((e as UrlRejected).code).toBe(code);
    }
  };

  it("refuse les schémas non HTTP", () => {
    rejects("file:///etc/passwd", "scheme");
    rejects("ftp://example.com/a", "scheme");
    rejects("javascript:alert(1)", "scheme");
  });
  it("refuse les identifiants", () => rejects("https://user:pass@example.com/", "credentials"));
  it("refuse les ports non standard", () => rejects("http://example.com:8080/", "port"));
  it("refuse les IP privées littérales", () => {
    rejects("http://127.0.0.1/", "private_address");
    rejects("http://[::1]/", "private_address");
    rejects("http://169.254.169.254/latest/meta-data/", "private_address");
    rejects("http://2130706433/", "private_address"); // 127.0.0.1 en décimal, normalisé par URL
    rejects("http://0x7f.1/", "private_address");
  });
  it("refuse localhost et domaines internes", () => {
    rejects("http://localhost/", "private_address");
    rejects("http://api.localhost/", "private_address");
  });
  it("accepte une URL publique", () => {
    expect(parsePublicUrl("https://example.com/doc").hostname).toBe("example.com");
  });
});

describe("téléchargement sûr", () => {
  let server: http.Server;
  let port = 0;
  beforeAll(async () => {
    server = http.createServer((_req, res) => {
      res.writeHead(200, { "content-type": "text/plain" });
      res.end("secret interne");
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    port = (server.address() as AddressInfo).port;
  });
  afterAll(() => server.close());

  const opts = { maxBytes: 1000, timeoutMs: 2000, maxRedirects: 2, allowedContentTypes: ["text/plain"] };

  it("refuse un nom DNS qui résout vers une IP privée (rebinding)", async () => {
    await expect(
      safeFetch("http://evil.example/", { ...opts, resolver: async () => [{ address: "127.0.0.1", family: 4 }] }),
    ).rejects.toMatchObject({ code: "private_address" });
  });

  it("refuse un nom qui mélange adresses publiques et privées", async () => {
    await expect(
      safeFetch("http://mixed.example/", {
        ...opts,
        resolver: async () => [
          { address: "8.8.8.8", family: 4 },
          { address: "10.0.0.1", family: 4 },
        ],
      }),
    ).rejects.toMatchObject({ code: "private_address" });
  });

  it("ne joint jamais le serveur local, même sur un port ouvert", async () => {
    await expect(safeFetch(`http://127.0.0.1:${port}/`, opts)).rejects.toBeInstanceOf(UrlRejected);
  });
});

describe("contrôle des fichiers", () => {
  const pdf = new TextEncoder().encode("%PDF-1.7\n...");
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);

  it("reconnaît les signatures", () => {
    expect(sniff(pdf)).toBe("pdf");
    expect(sniff(png)).toBe("png");
    expect(sniff(new TextEncoder().encode("Bonjour à tous"))).toBe("txt");
    expect(sniff(new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0x03]))).toBeNull(); // exécutable Windows
  });

  it("refuse un fichier vide ou trop gros", () => {
    expect(() => checkUpload(new Uint8Array(), "a.pdf", "application/pdf", 10)).toThrow(FileRejected);
    expect(() => checkUpload(pdf, "a.pdf", "application/pdf", 5)).toThrow(/taille/);
  });

  it("refuse une extension qui ment sur le contenu", () => {
    expect(() => checkUpload(png, "rapport.pdf", "application/pdf", 1000)).toThrow(/ne correspond pas/);
    expect(() => checkUpload(pdf, "doc.pdf", "image/png", 1000)).toThrow(/ne correspond pas/);
  });

  it("accepte un PDF cohérent", () => {
    expect(checkUpload(pdf, "Doc.PDF", "application/pdf", 1000)).toBe("pdf");
  });
});
