import { describe, expect, it } from "vitest";
import { sanitizeSvg, svgSize, SvgRejected } from "./svg";

describe("assainissement des SVG générés", () => {
  it("garde le dessin", () => {
    const out = sanitizeSvg('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600"><g fill="#f1d94e"><path d="M0 0L10 10Z"/><circle cx="5" cy="5" r="2"/></g></svg>');
    expect(out).toContain("<path");
    expect(out).toContain('viewBox="0 0 800 600"');
    expect(out).not.toContain("<?xml");
  });

  it("retire scripts, événements, objets étrangers et liens externes", () => {
    const out = sanitizeSvg(
      '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><script>alert(1)</script><foreignObject><div>x</div></foreignObject>' +
        '<a href="https://evil.example"><rect width="1" height="1"/></a><use href="https://evil.example/x.svg#a"/><use href="#ok"/>' +
        '<rect width="2" height="2" style="fill:url(https://evil.example/a)" onclick="x()"/><image href="https://evil.example/p.png"/></svg>',
    );
    expect(out).not.toMatch(/script|onload|onclick|foreignObject|evil\.example|<image|<a[\s>]/i);
    expect(out).toContain('<use href="#ok"/>');
  });

  it("refuse ce qui n'est pas un SVG", () => {
    expect(() => sanitizeSvg("<html><body>x</body></html>")).toThrow(SvgRejected);
    expect(() => sanitizeSvg("x".repeat(1_600_000))).toThrow(SvgRejected);
  });

  it("lit les dimensions du viewBox", () => {
    expect(svgSize('<svg viewBox="0 0 1024 768"></svg>')).toEqual({ width: 1024, height: 768 });
    expect(svgSize('<svg width="99999" height="3"></svg>')).toEqual({ width: 4096, height: 16 });
  });
});
