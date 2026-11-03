/**
 * Golden vectors for the Go port (backend/internal/domain, backend/internal/validation).
 * Run with `npm run golden`: it calls the real TypeScript and writes backend/testdata/golden/*.json
 * as arrays of {input, output}. The Go tests must reproduce every output. Deterministic: a seeded
 * PRNG, no clock, so a rerun leaves no diff.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import { DEFAULT_FONTS, FONT_OPTIONS, fontOrDefault, isFontKey } from "../src/lib/domain/fonts";
import * as limits from "../src/lib/domain/limits";
import { nameProblem, normalizeName, suggestNames } from "../src/lib/domain/names";
import { decodeCursor, encodeCursor } from "../src/lib/domain/posts";
import { addToken } from "../src/lib/domain/tokens";
import {
  derivePostType,
  looksLike,
  mediaKey,
  monogramKey,
  monogramMime,
  monogramProblem,
  qrKey,
  qrProblem,
  svgBytesProblem,
  svgProblem,
  uploadProblem,
  type UploadFile,
} from "../src/lib/domain/uploads";
import * as v from "../src/lib/validation";

const OUT = fileURLToPath(new URL("../backend/testdata/golden/", import.meta.url));

function write(name: string, cases: { input: unknown; output: unknown }[]) {
  mkdirSync(OUT, { recursive: true });
  writeFileSync(`${OUT}${name}.json`, JSON.stringify(cases) + "\n");
}

/** Run `fn`; a throw becomes {error:true} (the Go side returns an error). */
const tryOut = (fn: () => unknown) => {
  try {
    return { ok: true, value: fn() };
  } catch {
    return { ok: false };
  }
};

// ---- seeded fuzz -----------------------------------------------------------------------------
function rng(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const WS = ["\t", "\n", "\v", "\f", "\r", " ", " ", " ", " ", " ", " ", " ", " ", " ", " ", "　", "﻿"];
// Not JS whitespace (but look like it): Go's unicode.IsSpace says yes for U+0085, JS says no.
const NOT_WS = ["\u0085", "᠎", "​", "⁠", "­"];
const ALPHABET = [
  ..."abcXYZ019 -&",
  ...WS,
  ...NOT_WS,
  "‌", "‍", "‎", "‏", "‪", "‫", "‬", "‭", "‮", "⁦", "⁩",
  "͏", "ᅟ", "ᅠ", "ㅤ", "ﾠ", "︀", "️", "\u{e0100}", "\u{e0001}", "\u{e0041}",
  "\u0000", "\u0001", "\u001b", "\u007f", "\u009f", "؜", "᠋", "⁡", "⁯", "￹", "￻",
  "😀", "👨‍👩‍👧", "🏳️‍🌈", "é", "é", "José", "ﬁ", "ﬂ", "Ａ", "ｌ", "①", "㌶", "㎏", "ǆ", "ᵃ", "ℌ", "İ", "ı", "ß", "ǅ", "Å", "Å",
  "가", "가", "ｱ", "ﾞ", "Ω", "Ω", "Ali", "名前", "ا", "́",
];
const fuzzString = (r: () => number, maxLen: number, alphabet: readonly string[] = ALPHABET) => {
  const n = Math.floor(r() * (maxLen + 1));
  let s = "";
  for (let i = 0; i < n; i++) s += alphabet[Math.floor(r() * alphabet.length)];
  return s;
};

// ---- limits, fonts, tokens -------------------------------------------------------------------
test("limits", () => {
  const entries = Object.entries(limits).map(([k, val]) => ({ input: k, output: val }));
  expect(entries.length).toBeGreaterThan(30);
  write("limits", entries);
});

test("fonts", () => {
  const keys = FONT_OPTIONS.map((f) => f.key);
  const keyCases = [...keys, "", "POPPINS", "poppins ", "comic-sans", "constructor", "__proto__", "toString", "pinyon_script"];
  write("fonts", [
    { input: "keys", output: keys },
    { input: "defaults", output: DEFAULT_FONTS },
    ...keyCases.map((k) => ({ input: { fn: "isFontKey", key: k }, output: isFontKey(k) })),
    ...(["names", "wishes", "body"] as const).flatMap((role) =>
      [...keyCases, null].map((k) => ({ input: { fn: "fontOrDefault", role, key: k }, output: fontOrDefault(role, k) })),
    ),
  ]);
});

test("add-token", () => {
  const cases: string[][][] = [
    [[], ["a"]],
    [["a", "b"], ["c"]],
    [["1", "2", "3", "4", "5"], ["6"]],
    [["a", "b", "c"], ["a"]],
    [["1", "2", "3", "4", "5"], ["3"]],
    [["a", "a", "b"], ["c"]],
    [["1", "2", "3", "4", "5", "6", "7"], ["8"]],
  ];
  write("add-token", cases.map(([tokens, [token]]) => ({ input: { tokens, token }, output: addToken(tokens!, token!) })));
});

// ---- names -----------------------------------------------------------------------------------
const nameInputs = (): string[] => {
  const r = rng(1);
  const fixed = [
    "", " ", "Ali", "  Aina \t  from\nKajang ", "Al​i‮", "ㅤㅤ", "Ａｌｉ", "José", "José", "ﬁnd", "ﬂow", "İstanbul", "ıi",
    "😀".repeat(23), "😀".repeat(24), "😀".repeat(25), "a".repeat(23), "a".repeat(24), "a".repeat(25),
    "👨‍👩‍👧", "👨‍👩‍👧", "🏳️‍🌈", "a\u0085b", "a᠎b", "\u0085", "᠎", "\ud800", "a\ud800b", "\ud83d\u200b\ude00", "\udc00a", "\ud83d", "😀", "\ude00\ud83d",
    "x\u0000y", "x\u001by", "\u007f", "tab\there", "line\nbreak", "cr\rlf", "a\vb", "a\fb", "\tAli\t", "a  b", "　Ali　", "﻿Ali",
    "ǆ", "ǅ", "㌶", "㎏", "①②③", "ｱﾞ", "가", "가", "Ω", "Å", "ª", "²", "™", "…", "‼", "ℌ", "ａｂｃ", "ＡＢＣ１２３",
    "ᅟ", "ᅠ", "ㅤ", "ﾠ", "͏", "️", "\u{e0100}", "\u{e0041}", "\u{e0001}", "؜", "⁦abc⁩", "⁯", "⁡", "￹", "￻",
    ...WS.map((w) => `a${w}b`),
    ...WS.map((w) => `${w}${w}Ali${w}`),
    ...NOT_WS.map((w) => `a${w}b`),
  ];
  const fuzz = Array.from({ length: 3000 }, () => fuzzString(r, 30));
  // Around the length limits: 22..26 code points of mixed content.
  const edge = Array.from({ length: 300 }, () => {
    const n = 22 + Math.floor(r() * 5);
    return Array.from({ length: n }, () => ["a", "😀", "Ａ", "é", "ﬁ"][Math.floor(r() * 5)]).join("");
  });
  return [...fixed, ...fuzz, ...edge];
};

test("names", () => {
  const inputs = nameInputs();
  write("normalize-name", inputs.map((s) => ({ input: s, output: normalizeName(s) })));
  // nameProblem takes any string (length only), so feed it raw and normalized forms.
  write("name-problem", inputs.slice(0, 600).flatMap((s) => [s, normalizeName(s)]).map((s) => ({ input: s, output: nameProblem(s) })));

  // NFKC sweep: Node's ICU and Go's x/text may sit on different Unicode versions. Every code point
  // whose normalizeName result differs from itself, so the Go side checks the whole range.
  const sweep: { input: number; output: string }[] = [];
  for (let cp = 0; cp <= 0x10ffff; cp++) {
    if (cp >= 0xd800 && cp <= 0xdfff) continue;
    const s = String.fromCodePoint(cp);
    const out = normalizeName(`a${s}b`);
    if (out !== `a${s}b`) sweep.push({ input: cp, output: out });
  }
  write("normalize-sweep", sweep);

  // toLowerCase is what the suggestions compare with (taken names are lower-cased): single code points, then
  // the context-sensitive cases (final sigma) and U+0130 that Go's strings.ToLower does not do.
  const lowerSweep: { input: number; output: string }[] = [];
  for (let cp = 0; cp <= 0x10ffff; cp++) {
    if (cp >= 0xd800 && cp <= 0xdfff) continue;
    const s = String.fromCodePoint(cp);
    if (s.toLowerCase() !== s) lowerSweep.push({ input: cp, output: s.toLowerCase() });
  }
  write("lower-sweep", lowerSweep);
  const lowerStrings = ["ΑΣ", "ΑΣ ", "Σ", "ΑΣΑ", "Α.Σ", "AΣ'", "Σ Σ", "ΑΣ\u0301", "ΑΣ.Α", "Α\u00adΣ", "ΑΣ\u00ad", "ΑΣ\u200b", "1Σ", "ΑΣΣ", "ΑΣ\u02b0", "İ", "İİ", "AİB", "ΑΣ's", "ΣΑΣ", "A\ud800Σ", "ǅ", "ẞ", "Ω", "K", "Å", "ΑΣ\ud83d\ude00", "Α:Σ", "Α’Σ", "Α·Σ", "Α\u2019Σ"];
  write("lower-strings", lowerStrings.map((x) => ({ input: x, output: x.toLowerCase() })));

  const suggest: { name: string; taken: string[] }[] = [
    { name: "Ali", taken: [] },
    { name: "Ali", taken: ["ali 2"] },
    { name: "Ali", taken: ["ali 2", "ali & family"] },
    { name: "Ali", taken: ["ali 2", "ali & family", "ali 3", "ali 4"] },
    { name: "Ali", taken: ["ali 3"] },
    { name: "Ali", taken: ["Ali 2"] },
    { name: "a".repeat(20), taken: [] },
    { name: "a".repeat(21), taken: [] },
    { name: "a".repeat(22), taken: [] },
    { name: "a".repeat(23), taken: [] },
    { name: "a".repeat(24), taken: [] },
    { name: "😀".repeat(20), taken: [] },
    { name: "😀".repeat(18), taken: [] },
    { name: "İstanbul", taken: ["i̇stanbul 2", "istanbul 2"] },
    { name: "ÀLİ", taken: ["àli̇ 2"] },
    { name: "ẞ", taken: ["ß 2"] },
    { name: "Σίσυφος", taken: ["σίσυφος 2", "ςίσυφος 2"] },
    { name: "ΑΣ", taken: ["ας 2", "ασ 2"] },
    { name: "ǅ", taken: ["ǆ 2"] },
  ];
  write("suggest-names", suggest.map((s) => ({ input: s, output: suggestNames(s.name, new Set(s.taken)) })));
});

// ---- upload rules ----------------------------------------------------------------------------
const MB = limits.MB;
const JPG = "image/jpeg";
const main = (position: number, over: Partial<UploadFile> = {}): UploadFile => ({ role: "main", position, mime: JPG, bytes: 1 * MB, ...over });
const thumb = (position: number, over: Partial<UploadFile> = {}): UploadFile => ({ role: "thumb", position, mime: JPG, bytes: 50_000, ...over });
const poster: UploadFile = { role: "poster", position: 0, mime: JPG, bytes: 9000 };
const photos = (n: number) => Array.from({ length: n }, (_, i) => [main(i), thumb(i)]).flat();
const video = (over: Partial<UploadFile> = {}) => main(0, { mime: "video/mp4", bytes: 20 * MB, durationS: 30, ...over });

const fileSets = (): UploadFile[][] => {
  const fixed: UploadFile[][] = [
    photos(1), photos(10), photos(11), [video()], [video(), poster], [], [thumb(0)], [main(0)], [...photos(1), thumb(1)],
    [main(1), thumb(1)], [main(0), main(0), thumb(0)], [main(0, { mime: "image/svg+xml" }), thumb(0)], [video({ mime: "text/html" })],
    [main(0), thumb(0, { mime: "image/png" })], [...photos(1), video({ position: 1 })], [video(), video({ position: 1 })],
    [video({ position: 1 })], [video(), thumb(0)], [video(), poster, poster], [...photos(1), poster],
    [main(0, { bytes: 15 * MB + 1 }), thumb(0)], [main(0, { bytes: 15 * MB }), thumb(0)], [main(0), thumb(0, { bytes: 1 * MB + 1 })],
    [video({ bytes: 80 * MB + 1 })], [video({ bytes: 80 * MB })], [video({ durationS: undefined })], [video({ durationS: 31 })], [video({ durationS: 30.5 })],
    [video(), { ...poster, bytes: 1 * MB + 1 }], [video(), { ...poster, position: 1 }], [video({ mime: "video/quicktime" })], [video({ mime: "video/webm" })],
    [main(0, { mime: "video/mp4" }), thumb(0)], [video(), { ...poster, mime: "image/png" }],
  ];
  const r = rng(2);
  const pick = <T,>(xs: readonly T[]) => xs[Math.floor(r() * xs.length)]!;
  const fuzz = Array.from({ length: 1200 }, () => {
    const n = Math.floor(r() * 5);
    return Array.from({ length: n }, () => {
      const role = pick(["main", "main", "thumb", "poster"] as const);
      const f: UploadFile = {
        role,
        position: pick([0, 0, 1, 2, 3, 9]),
        mime: pick([JPG, JPG, JPG, "video/mp4", "video/quicktime", "video/webm", "image/png", "text/html"]),
        bytes: pick([1, 9000, 50_000, 1 * MB, 1 * MB + 1, 15 * MB, 15 * MB + 1, 80 * MB, 80 * MB + 1]),
      };
      if (r() < 0.5) f.durationS = pick([1, 29.9, 30, 31]);
      return f;
    });
  });
  return [...fixed, ...fuzz];
};

test("uploads", () => {
  const fileCases = fileSets();
  write("upload-problem", fileCases.map((files) => ({ input: files, output: uploadProblem(files) })));

  const mimes = [JPG, "image/png", "image/webp", "image/svg+xml", "image/gif", "video/mp4", "video/quicktime", "video/webm", "text/html", ""];
  const sets: string[][] = [
    ...[0, 1, 2, 10, 11].flatMap((n) => mimes.map((m) => Array<string>(n).fill(m))),
    [JPG, "video/mp4"], ["video/mp4", "video/mp4"], ["video/mp4", JPG], ["video/webm", "video/quicktime"],
  ];
  write("derive-post-type", sets.map((ms) => ({ input: ms, output: derivePostType(ms.map((mime) => ({ mime }))) })));


  const keyCases: { eventId: string; postId: string; role: "main" | "thumb" | "poster"; position: number; mime: string }[] = [];
  for (const role of ["main", "thumb", "poster"] as const) {
    for (const mime of mimes) for (const position of [0, 2, 9]) keyCases.push({ eventId: "e", postId: "p", role, position, mime });
  }
  write("media-key", keyCases.map((c) => ({ input: c, output: tryOut(() => mediaKey(c.eventId, c.postId, c)) })));

  const idMimes = [...mimes, "IMAGE/PNG", "image/jpg"];
  write("qr-key", idMimes.map((m) => ({ input: { eventId: "e1", id: "abc", mime: m }, output: tryOut(() => qrKey("e1", "abc", m)) })));
  write("monogram-key", idMimes.map((m) => ({ input: { eventId: "e1", id: "abc", mime: m }, output: tryOut(() => monogramKey("e1", "abc", m)) })));
  const mk = ["events/e1/admin/monogram-abc.webp", "events/e1/admin/monogram-abc.svg", "events/e1/admin/monogram-abc.png", "events/e1/admin/monogram-abc.gif",
    "", "png", "a.png", ".png", "x.PNG", "noext", "dir.v2/file", "a.svg.png", "svg", "webp"];
  write("monogram-mime", mk.map((k) => ({ input: k, output: monogramMime(k) })));

  const sizes = [0, 1, 1000, 1 * MB, 1 * MB + 1, 2 * MB, 2 * MB + 1, 80 * MB];
  const problems = mimes.flatMap((m) => sizes.map((b) => ({ mime: m, bytes: b })));
  write("qr-problem", problems.map((p) => ({ input: p, output: qrProblem(p.mime, p.bytes) })));
  write("monogram-problem", problems.map((p) => ({ input: p, output: monogramProblem(p.mime, p.bytes) })));
});

const hex = (b: Uint8Array) => Buffer.from(b).toString("hex");
const unhex = (h: string) => new Uint8Array(Buffer.from(h, "hex"));

test("looks-like", () => {
  const r = rng(3);
  const heads: number[][] = [
    [0xff, 0xd8, 0xff, 0xe0], [0xff, 0xd8], [0xff, 0xd8, 0xfe], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], [0x89, 0x50, 0x4e],
    [0x1a, 0x45, 0xdf, 0xa3], [0x1a, 0x45, 0xdf], [...Buffer.from("RIFF    WEBP")], [...Buffer.from("RIFF    WAVE")], [...Buffer.from("RIFFxxxxWEB")],
    [0, 0, 0, 0x18, ...Buffer.from("ftyp")], [0, 0, 0, 0x18, ...Buffer.from("moov")], [0, 0, 0, 0x18, ...Buffer.from("mdat")], [0, 0, 0, 0x18, ...Buffer.from("wide")],
    [0, 0, 0, 0x18, ...Buffer.from("free")], [0, 0, 0, 0x18, ...Buffer.from("skip")], [0, 0, 0, 0x18, ...Buffer.from("pnot")], [0, 0, 0, 0x18, ...Buffer.from("fty")],
    [], [0], [...Buffer.from("<html><script>x</script></html>")],
  ];
  const mimes = [JPG, "image/png", "image/webp", "video/mp4", "video/quicktime", "video/webm", "image/svg+xml", "text/html"];
  const cases = mimes.flatMap((mime) => heads.map((h) => ({ mime, start: hex(Uint8Array.from([...h, ...Array(Math.max(0, 16 - h.length)).fill(0)])) })));
  // Short buffers and random bytes.
  const short = mimes.flatMap((mime) => heads.map((h) => ({ mime, start: hex(Uint8Array.from(h)) })));
  const noise = Array.from({ length: 300 }, () => ({ mime: mimes[Math.floor(r() * mimes.length)]!, start: hex(Uint8Array.from({ length: Math.floor(r() * 16) }, () => Math.floor(r() * 256))) }));
  write("looks-like", [...cases, ...short, ...noise].map((c) => ({ input: c, output: looksLike(c.mime, unhex(c.start)) })));
});

test("svg", () => {
  const texts = [
    '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0h10v10z"/></svg>',
    '<svg><use href="#a"/><use xlink:href="#a"/><image href="data:image/png;base64,AAAA"/><rect fill="url(#g)"/></svg>',
    "<svg><script>x</script></svg>", '<svg onload="x()">', "<svg><foreignObject/></svg>", '<svg xmlns:s="http://www.w3.org/2000/svg"><s:script>alert(1)</s:script></svg>',
    '<svg xmlns:h="http://www.w3.org/1999/xhtml"><h:script>alert(1)</h:script></svg>', "<svg><x:foreignObject/></svg>",
    '<svg><image href="&#104;ttps://evil.test/a.png"/></svg>', '<svg><a href="&#106;avascript:x"/></svg>', '<svg><a href="javascript:x"/></svg>',
    '<svg><image href="https://evil.test/a.png"/></svg>', '<svg><image xlink:href="//evil.test/a.png"/></svg>', '<svg style="fill:url(https://evil.test/x)">',
    '<!DOCTYPE svg [<!ENTITY x "y">]><svg/>', "<svg><style>@import 'x.css';</style></svg>", "<SVG ONLOAD=x>", "<html><body>hi</body></html>", "", "<svg", "<sv g>",
    // JS \s versus ASCII \s: each whitespace char between the parts of a rule.
    ...WS.flatMap((w) => [`<svg${w}onload=x>`, `<svg><image href${w}=${w}"https://x"/></svg>`, `<svg><image href=${w}"//x"/></svg>`, `<svg style="fill:url(${w}https://x)">`, `<svg ${w}ONCLICK${w}= x>`]),
    ...NOT_WS.flatMap((w) => [`<svg${w}onload=x>`, `<svg><image href${w}=${w}"https://x"/></svg>`, `<svg><image href=${w}"//x"/></svg>`]),
    '<svg xmlns:s="x"><s:Script/></svg>', '<svg><a\nonclick="x"></svg>', "<svg a='b'onload=1>", '<svg><a href=" https://x"></svg>', '<svg><a href="\thttps://x"></svg>', "<svg>url( //x)</svg>",
    "<svg>url('http://x')</svg>", '<svg a="b"/onclick=1>', "<svg><title>onload=x</title></svg>", "<svg>ONLOAD=</svg>", "<svg> onload = 1 </svg>", "<svg>@IMPORT</svg>", "<svg>&#x6a;</svg>",
    "<svg>JAVASCRIPT:</svg>", "<svg><!entity></svg>", "﻿<svg/>", "<svg>é名前😀</svg>", "<svg onload=1>", "<svg>\u0085onload=1</svg>",
  ];
  write("svg-problem", texts.map((t) => ({ input: t, output: svgProblem(t) })));

  const enc = (...parts: (string | number[])[]) => Uint8Array.from(parts.flatMap((p) => (typeof p === "string" ? [...new TextEncoder().encode(p)] : p)));
  const bytes: Uint8Array[] = [
    enc('<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0"/></svg>'), enc('<?xml version="1.0" encoding="UTF-8"?><svg/>'),
    enc("<svg><scr", [0x1b], "(Bipt>x</script></svg>"), enc("<svg>", [0], "</svg>"), enc("<svg>", [0xff, 0xfe], "</svg>"),
    enc('<?xml version="1.0" encoding="ISO-2022-JP"?><svg/>'), enc("<?xml version='1.0' encoding='latin1'?><svg/>"),
    enc([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]), enc("<html></html>"), enc("<svg><script/></svg>"),
    enc([0xef, 0xbb, 0xbf], "<svg/>"), enc([0xef, 0xbb, 0xbf], '<?xml version="1.0" encoding="latin1"?><svg/>'), enc([0xef, 0xbb, 0xbf, 0xef, 0xbb, 0xbf], "<svg/>"),
    enc("<svg>", [0xed, 0xa0, 0x80], "</svg>"), enc("<svg>", [0xc0, 0xaf], "</svg>"), enc("<svg>", [0xf4, 0x90, 0x80, 0x80], "</svg>"), enc("<svg>", [0xf0, 0x9f, 0x98, 0x80], "</svg>"), enc("<svg>", [0xe2, 0x82], "</svg>"),
    enc(""), enc([0xef, 0xbb, 0xbf]), enc([0xef, 0xbb]),
    enc('<?xml encoding="utf-8"?><svg/>'), enc('<?xml version="1.0" encoding=" UTF-8 "?><svg/>'), enc('<?xml version="1.0" encoding=""?><svg/>'), enc('<?xml version="1.0" ENCODING = "Utf-8" ?><svg/>'),
    enc('<?xml version="1.0"?><svg/>'), enc('  \n<?xml version="1.0" encoding="UTF-16"?><svg/>'), enc('<?xml version="1.0" encoding="UTF-16"?><svg/>'),
    enc('<?xml version="1.0" encoding="UTF-16" ?><svg/>'), enc('<?xml version="1.0"?><svg encoding="x"/>'), enc('<?xml version="1.0" encoding=utf-8?><svg/>'),
    enc('<?xmlfoo encoding="x"?><svg/>'), enc('<?xml\nencoding\n=\n"UTF-7"?><svg/>'), enc('<?xml version="1.0" encoding=" utf-8 "?><svg/>'), enc('<?xml version="1.0" encoding="UTF− 8"?><svg/>'),
  ];
  write("svg-bytes-problem", bytes.map((b) => ({ input: hex(b), output: svgBytesProblem(b) })));
});

// ---- cursor ----------------------------------------------------------------------------------
test("cursor", () => {
  const stamp = "2026-10-25T10:00:00.123456+00:00";
  const id = "b0000000-0000-4000-8000-000000000001";
  const b64 = (s: string) => Buffer.from(s, "latin1").toString("base64");
  const raw = (s: string) => b64(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const stamps = [stamp, "2026-10-25T10:00:00Z", "2026-10-25T10:00:00+08:00", "2026-10-25T10:00:00.1-05:30", "2026-10-25T10:00:00.1234567Z", "2026-10-25 10:00:00Z", "2026-10-25T10:00:00",
    "yesterday", "", "2026-10-25T10:00:00+00:00),id.gt.0", "2026-10-25T10:00:00.Z", "2026-10-25T10:00:00Z\n", "２０２６-10-25T10:00:00Z", "2026-10-25T10:00:00z", "2026-10-25t10:00:00Z", "2026-10-25T10:00:00+0000"];
  const ids = [id, id.toUpperCase(), "nope", "", "b0000000-0000-4000-8000-00000000000g", "b0000000-0000-4000-8000-0000000000012", `${id}\n`, " " + id, "ｂ0000000-0000-4000-8000-000000000001"];
  const good = stamps.flatMap((s) => ids.map((i) => ({ createdAt: s, id: i })));
  // Printable ASCII only: btoa throws above U+00FF, and Go writes UTF-8 where btoa writes Latin-1. The
  // server only ever encodes values it read from Postgres, and decoding rejects anything else.
  const printable = (x: string) => /^[\x20-\x7e]*$/.test(x);
  write("cursor-encode", good.filter((c) => printable(c.createdAt) && printable(c.id)).map((c) => ({ input: c, output: encodeCursor(c.createdAt, c.id) })));
  const decodeOf = (s: string) => decodeCursor(s);
  const handmade = [
    "", "not-base64!", "e30", "W10", raw("[]"), raw('["a"]'), raw(`["${stamp}","${id}","x"]`), raw(`[1,"${id}"]`), raw(`["${stamp}",null]`), raw(`{"0":"${stamp}","1":"${id}"}`),
    raw(`["${stamp}","${id}"]`), raw(`  [ "${stamp}" , "${id}" ]  `), raw(`["${stamp}","${id}"]x`), raw(`["\\u0032026-10-25T10:00:00Z","${id}"]`), raw(`["${stamp}","${id}"]\n`),
    b64(`["${stamp}","${id}"]`), b64(`["${stamp}","${id}"]`).replace(/=+$/, ""), `${raw(`["${stamp}","${id}"]`)}=`, `${raw(`["${stamp}","${id}"]`)}==`, ` ${raw(`["${stamp}","${id}"]`)} `,
    raw(`["${stamp}","${id}"]`).replace(/(.{10})/, "$1\n"), raw(`["${stamp}","${id}"]`).replace(/(.{10})/, "$1 "), raw(`["${stamp}","${id}"]`) + "A", raw(`["${stamp}","${id}"]`) + "AA", raw(`["${stamp}","${id}"]`) + "AAA",
    "AAAAA", "AAAA", "AAA", "AA", "A", "====", "A===", "AA==", "AA=", "AA=A", "a=b=", "ab=c", "a b", "\ta\n", "é", raw("é[]"), raw('["é","x"]'), raw("[\u0000]"),
    raw(`["${stamp}","${id}"]`).replace(/-/g, "+").replace(/_/g, "/"), "+", "/", "-_", "-_-_",
  ];
  const r = rng(4);
  const b64chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_+/= \n.";
  const valid = good.slice(0, 40).map((c) => raw(JSON.stringify([c.createdAt, c.id])));
  const mutate = Array.from({ length: 800 }, () => {
    const base = valid[Math.floor(r() * valid.length)]!;
    const chars = [...base];
    const k = 1 + Math.floor(r() * 3);
    for (let i = 0; i < k; i++) {
      const at = Math.floor(r() * chars.length);
      const op = r();
      if (op < 0.5) chars[at] = b64chars[Math.floor(r() * b64chars.length)]!;
      else if (op < 0.75) chars.splice(at, 1);
      else chars.splice(at, 0, b64chars[Math.floor(r() * b64chars.length)]!);
    }
    return chars.join("");
  });
  const noise = Array.from({ length: 700 }, () => fuzzString(r, 60, [...b64chars, "[", "]", '"', "é", "\u0000"]));
  write("cursor-decode", [...handmade, ...valid, ...mutate, ...noise].map((c) => ({ input: c, output: decodeOf(c) })));
});

// ---- schemas ---------------------------------------------------------------------------------
/** A body written as JSON text, so number forms like 1.0 or 1e2 survive. */
class Raw {
  constructor(readonly text: string) {}
}
const raw = (text: string) => new Raw(text);
const text = (c: unknown) => (c instanceof Raw ? c.text : JSON.stringify(c) ?? "undefined");

type Schema = { safeParse(x: unknown): { success: true; data: unknown } | { success: false; error: { issues: { message: string }[] } } };
function schemaFile(name: string, schema: Schema, cases: unknown[]) {
  write(`schema-${name}`, cases.map((c) => {
    const t = text(c);
    let parsed: unknown = null; // a body that is not JSON reads as null
    try { parsed = JSON.parse(t); } catch { /* null */ }
    const r = schema.safeParse(parsed);
    return { input: t, output: r.success ? { ok: true, data: r.data } : { ok: false, message: r.error.issues[0]!.message } };
  }));
}

const UUID = "b0000000-0000-4000-8000-000000000001";
/** Non-object bodies and common structural failures, shared by every object schema. */
const structural: unknown[] = [null, raw("not json"), raw(""), raw("{"), raw("[1,2]x"), [], [{}], "s", "", 0, 1, 1.5, true, false, {}, { unknown: 1 }, raw("undefined"), raw("{\"a\":1,\"a\":2}")];

const typeVariants = (key: string, base: Record<string, unknown> = {}): unknown[] =>
  [null, true, false, 0, 1, -1, 1.5, "", "x", "1", [], ["a"], {}, { a: 1 }].map((x) => ({ ...base, [key]: x }));

const intForms = (key: string, base: Record<string, unknown> = {}): unknown[] =>
  [
    "0", "1", "-1", "1.0", "1.5", "1e2", "1E2", "1e+2", "0.5", "-0", "-0.0", "0.0", "2.0", "9", "10", "20", "21", "19", "29", "30", "31", "30.0", "30.000001", "100", "19999", "20000", "20001", "20000.5", "100000000", "83886080", "83886081",
    "83886080.0", "1048576", "1048577", "2097152", "2097153", "9007199254740991", "9007199254740992", "9007199254740993", "-9007199254740991", "-9007199254740993", "1e300", "-1e300", "1e400", "-1e400", "123456789012345678901234567890",
    "0.1e1", "1.0e0", "5e-1", "4.9999999999999999", "4.99999999999999",
  ].map((n) => raw(`{${JSON.stringify(key)}:${n}${Object.keys(base).length ? "," + Object.entries(base).map(([k, val]) => `${JSON.stringify(k)}:${JSON.stringify(val)}`).join(",") : ""}}`));

const strLen = (n: number, ch = "a") => ch.repeat(n);

test("schema-guests", () => {
  const names = [...nameInputs().slice(0, 150), ...nameInputs().slice(-60)];
  schemaFile("createGuestBody", v.createGuestBody, [
    ...structural, ...typeVariants("name"), { name: "Ali" }, { name: " Ali ", extra: 1 }, { name: "A" }, { name: "" }, { name: "   " }, { name: "😀".repeat(24) }, { name: "😀".repeat(25) },
    { name: "ㅤㅤ" }, { name: "Ａｌｉ" }, { name: "\ud800" }, raw('{"name":"\\ud800\\ud800"}'), raw('{"name":"a\\udc00b"}'), raw('{"name":"Al\\u200bi"}'), raw('{"name":"A","name":"Bob"}'), raw('{"name":"Bob","name":"A"}'),
    { name: "ab", other: [1] }, { Name: "Ali" }, ...names.map((name) => ({ name })),
  ]);
  const uuids = [UUID, UUID.toUpperCase(), "00000000-0000-0000-0000-000000000000", "ffffffff-ffff-ffff-ffff-ffffffffffff", "FFFFFFFF-FFFF-FFFF-FFFF-FFFFFFFFFFFF", "11111111-1111-1111-1111-111111111111",
    "b0000000-0000-0000-8000-000000000001", "b0000000-0000-9000-8000-000000000001", "b0000000-0000-4000-7000-000000000001", "b0000000-0000-4000-9000-000000000001", "b0000000-0000-4000-A000-000000000001", "b0000000-0000-4000-b000-000000000001", "b0000000-0000-4000-c000-000000000001",
    "b0000000-0000-4000-8000-00000000000", "b0000000-0000-4000-8000-0000000000011", `${UUID}\n`, ` ${UUID}`, `{${UUID}}`, UUID.replace(/-/g, ""), "nope", "", "g0000000-0000-4000-8000-000000000001", "ｂ0000000-0000-4000-8000-000000000001", "b0000000-0000-1000-8000-000000000001", "b0000000-0000-8000-8000-000000000001"];
  schemaFile("activateGuestBody", v.activateGuestBody, [...structural, ...typeVariants("guestId"), ...uuids.map((guestId) => ({ guestId })), { guestId: UUID, extra: true }]);
  write("schema-postIdParam", uuids.map((u) => ({ input: u, output: (() => { const r = v.postIdParam.safeParse(u); return r.success ? { ok: true, data: r.data } : { ok: false, message: r.error.issues[0]!.message }; })() })));
});

test("schema-uploads", () => {
  const f = (over: Record<string, unknown> = {}) => ({ role: "main", position: 0, mime: JPG, bytes: 1000, ...over });
  const t = (over: Record<string, unknown> = {}) => ({ role: "thumb", position: 0, mime: JPG, bytes: 1000, ...over });
  const roleVariants = ["main", "thumb", "poster", "MAIN", "", "other", null, 1, true].map((role) => ({ files: [f({ role })] }));
  const wrap = (file: unknown) => ({ files: [file] });
  schemaFile("createUploadBody", v.createUploadBody, [
    ...structural, ...typeVariants("files"), { files: [] }, { files: [f(), t()] }, { files: [f()] }, { files: [t()] }, { files: Array(21).fill(f()) }, { files: Array(20).fill(f()) }, { files: Array(20).fill(t()) },
    ...roleVariants,
    ...["role", "position", "mime", "bytes", "width", "height", "durationS"].flatMap((k) => typeVariants(k, f()).map(wrap)),
    ...intForms("position", f()).map((c) => raw(`{"files":[${text(c)}]}`)),
    ...intForms("bytes", f()).map((c) => raw(`{"files":[${text(c)}]}`)),
    ...intForms("width", f()).map((c) => raw(`{"files":[${text(c)}]}`)),
    ...intForms("height", f()).map((c) => raw(`{"files":[${text(c)}]}`)),
    ...intForms("durationS", f({ mime: "video/mp4" })).map((c) => raw(`{"files":[${text(c)}]}`)),
    wrap({ role: "main" }), wrap({}), wrap(null), wrap([]), wrap("x"), wrap({ ...f(), mime: strLen(100) }), wrap({ ...f(), mime: strLen(101) }), wrap({ ...f(), mime: "😀".repeat(50) }), wrap({ ...f(), mime: "😀".repeat(51) }), wrap({ ...f(), mime: "😀".repeat(50) }),
    wrap({ ...f(), extra: 1 }), { files: [f()], extra: 1 }, { files: [f({ position: 10 }), t()] }, { files: [f({ bytes: 80 * MB + 1 })] },
    { files: [f({ position: -1 }), f({ role: "thumb", position: 99 })] }, { files: [{ role: "x", position: 99, mime: 1, bytes: "x" }] },
    { files: [f({ mime: "video/mp4", durationS: 30, bytes: 80 * MB }), t({ mime: "image/png" })] }, { files: [f({ mime: "video/mp4", bytes: 20 * MB, durationS: 30 }), { role: "poster", position: 0, mime: JPG, bytes: 9000 }] },
    { files: [f({ mime: "video/mp4", durationS: 31 })] }, { files: [f({ mime: "video/mp4" })] },
    { files: [f(), t(), f({ position: 1 }), t({ position: 1 })] }, { files: [f(), f()] }, { files: [t(), f(), t({ role: "poster" })] },
    { files: [...Array(20).fill(f()), f({ position: 99 })] }, { files: [...Array(21).fill(f()), 1] }, { files: [] },
    { files: [f({ width: 20000, height: 20000 }), t()] }, { files: [f({ width: 20001 }), t()] },
  ]);

  const sf = (over: Record<string, unknown> = {}) => ({ role: "main", position: 0, mime: JPG, bytes: 1000, key: "events/e/p/0.jpg", ...over });
  schemaFile("storedFiles", v.storedFiles, [
    null, [], [sf()], [sf(), sf({ role: "thumb", key: "k" })], {}, "x", [null], [{}], [sf({ key: "" })], [sf({ key: 1 })], [sf({ key: undefined })], [sf({ position: 99, bytes: 80 * MB * 10, durationS: 999, width: 99999 })],
    [sf({ position: -1 })], [sf({ bytes: 0 })], [sf({ bytes: -1 })], [sf({ bytes: 1.5 })], [sf({ durationS: 0 })], [sf({ durationS: -1 })], [sf({ width: 0 })], [sf({ height: 1.5 })], [sf({ role: "x" })], [sf({ mime: null })], [sf({ extra: 1 })],
    [sf({ width: 10, height: 20, durationS: 1.5 })], [sf({ position: 0 }), 1], [sf({ mime: "" })],
    raw('[{"role":"main","position":1.0,"mime":"image/jpeg","bytes":10.0,"key":"k"}]'), raw('[{"role":"main","position":1e1,"mime":"image/jpeg","bytes":1e3,"key":"k"}]'),
    raw('[{"role":"main","position":0,"mime":"image/jpeg","bytes":9007199254740993,"key":"k"}]'), raw('[{"role":"main","position":-0,"mime":"image/jpeg","bytes":1,"key":"k"}]'),
  ]);
});

test("schema-posts", () => {
  const cap = (n: number, ch = "a") => ch.repeat(n);
  const cases: unknown[] = [
    ...structural, ...typeVariants("postId"), ...typeVariants("caption"), ...typeVariants("wishText"),
    { wishText: "Congrats!" }, { wishText: "abc" }, { wishText: "ab" }, { wishText: "  ab  " }, { wishText: "  abc  " }, { wishText: "" }, { wishText: "   " }, { wishText: cap(300) }, { wishText: cap(301) }, { wishText: ` ${cap(300)} ` },
    { wishText: "😀".repeat(300) }, { wishText: "😀".repeat(301) }, { wishText: "😀😀" }, { wishText: "😀😀😀" }, { wishText: "  abc　" }, { wishText: "﻿abc﻿" }, { wishText: "\u0085abc\u0085" }, { wishText: "᠎abc" },
    { wishText: "\ud800\ud800\ud800" }, raw('{"wishText":"\\ud800\\ud800"}'), { wishText: "ab​" },
    { postId: UUID }, { postId: "nope" }, { postId: "" }, { postId: UUID, wishText: "hello" }, {}, { caption: "x" }, { caption: "x", postId: UUID, wishText: "hello" },
    { postId: UUID, caption: "Nice day" }, { postId: UUID, caption: "  Nice  " }, { postId: UUID, caption: "" }, { postId: UUID, caption: "   " }, { postId: UUID, caption: cap(120) }, { postId: UUID, caption: cap(121) },
    { postId: UUID, caption: ` ${cap(120)} ` }, { postId: UUID, caption: "😀".repeat(60) }, { postId: UUID, caption: "😀".repeat(61) }, { postId: UUID, caption: "😀".repeat(59) + "a" }, { postId: UUID, caption: "😀".repeat(59) + "aa" },
    { postId: UUID, caption: "\ud83d".repeat(120) }, { postId: UUID, caption: "\ud83d".repeat(121) }, { postId: UUID, caption: "　" + cap(120) + "　" }, { postId: UUID, caption: "é".repeat(120) }, { postId: UUID, caption: "é".repeat(121) },
    { postId: "nope", caption: cap(121), wishText: "x" }, { postId: UUID, caption: cap(121), wishText: "hello" }, { postId: "nope", wishText: "ab" }, { caption: cap(121), wishText: "ab" }, { caption: cap(121) }, { caption: 1, wishText: "ab" },
    { postId: UUID, extra: { a: 1 }, type: "wish", guestId: "x" },
  ];
  schemaFile("createPostBody", v.createPostBody, cases);
});

test("schema-admin", () => {
  schemaFile("adminLoginBody", v.adminLoginBody, [
    ...structural, ...typeVariants("passcode"), { passcode: "x" }, { passcode: "" }, { passcode: " " }, { passcode: strLen(200) }, { passcode: strLen(201) }, { passcode: "😀".repeat(100) }, { passcode: "😀".repeat(101) }, { passcode: "😀".repeat(99) + "a" },
    { passcode: "😀".repeat(99) + "aa" }, { passcode: "\ud800".repeat(200) }, { passcode: "\ud800".repeat(201) }, { passcode: " abc " }, { passcode: "p", extra: 1 },
  ]);

  const fields = ["groomName", "brideName", "headerMessage", "qrAccountName", "qrBank", "uploadsOpen", "fontNames", "fontWishes", "fontBody"];
  const lenCases = (key: string, max: number) => [
    { [key]: "x" }, { [key]: "" }, { [key]: "   " }, { [key]: "  x  " }, { [key]: strLen(max) }, { [key]: strLen(max + 1) }, { [key]: ` ${strLen(max)} ` }, { [key]: `　${strLen(max)}﻿` },
    { [key]: "😀".repeat(max / 2) }, { [key]: "😀".repeat(max / 2 + 1) }, { [key]: "😀".repeat(max / 2 - 1) + "a" }, { [key]: "😀".repeat(max / 2 - 1) + "aa" }, { [key]: "\ud800".repeat(max) }, { [key]: "\ud800".repeat(max + 1) },
    { [key]: "\u0085" }, { [key]: "᠎" }, { [key]: "名前" },
  ];
  schemaFile("updateEventBody", v.updateEventBody, [
    ...structural, ...fields.flatMap((k) => typeVariants(k)),
    ...lenCases("groomName", 40), ...lenCases("brideName", 40), ...lenCases("headerMessage", 120), ...lenCases("qrAccountName", 80), ...lenCases("qrBank", 60),
    { uploadsOpen: true }, { uploadsOpen: false }, { uploadsOpen: "true" }, { uploadsOpen: 0 }, { uploadsOpen: 1 }, { uploadsOpen: null },
    ...FONT_OPTIONS.slice(0, 3).flatMap((o) => [{ fontNames: o.key }, { fontWishes: o.key }, { fontBody: o.key }]),
    { fontNames: "comic-sans" }, { fontNames: "" }, { fontNames: "Poppins" }, { fontNames: null }, { fontWishes: "x" }, { fontBody: "x" }, { fontBody: "poppins " },
    { groomName: "Aiman", brideName: "Sofea", headerMessage: "Raikan memori anda bersama", qrAccountName: "Aiman bin Ali", qrBank: "Maybank", uploadsOpen: true, fontNames: "great-vibes", fontWishes: "lora", fontBody: "inter" },
    { groomName: "", brideName: "", headerMessage: "x" }, { groomName: strLen(41), brideName: "", headerMessage: strLen(121) }, { brideName: "", groomName: strLen(41) },
    { headerMessage: strLen(121), groomName: "x" }, { uploadsOpen: "x", groomName: "" }, { fontBody: "x", fontNames: "y" }, { qrBank: strLen(61), qrAccountName: strLen(81) }, { unknown: 1 }, { unknown: 1, uploadsOpen: true }, { groomName: undefined },
    raw('{"groomName":"A","groomName":""}'), raw('{"groomName":"","groomName":"A"}'),
  ]);

  const presign = (key: "qr" | "mono") => {
    const mimes = key === "qr" ? ["image/png", "image/jpeg", "image/gif", "image/webp", "image/svg+xml", "", "IMAGE/PNG"] : ["image/png", "image/webp", "image/svg+xml", "image/jpeg", "image/gif", ""];
    return [
      ...structural, ...typeVariants("mime", { bytes: 100 }), ...typeVariants("bytes", { mime: "image/png" }),
      ...mimes.flatMap((mime) => [100, 1 * MB, 1 * MB + 1, 2 * MB, 2 * MB + 1].map((bytes) => ({ mime, bytes }))),
      { mime: "image/png" }, { bytes: 100 }, { mime: strLen(100), bytes: 1 }, { mime: strLen(101), bytes: 1 }, { mime: "😀".repeat(51), bytes: 0 }, { mime: "x", bytes: -1 }, { mime: 1, bytes: "x" }, { bytes: 0, mime: 1 },
      ...intForms("bytes", { mime: "image/png" }),
    ];
  };
  schemaFile("qrPresignBody", v.qrPresignBody, presign("qr"));
  schemaFile("monogramPresignBody", v.monogramPresignBody, presign("mono"));

  const confirm = [
    ...structural, ...typeVariants("key"), { key: "events/e/admin/qr-1.png" }, { key: "" }, { key: " " }, { key: strLen(200) }, { key: strLen(201) }, { key: "😀".repeat(100) }, { key: "😀".repeat(101) }, { key: "\ud800".repeat(200) },
    { key: "\ud800".repeat(201) }, { key: "k", extra: 1 }, { Key: "k" },
  ];
  schemaFile("qrConfirmBody", v.qrConfirmBody, confirm);
  schemaFile("monogramConfirmBody", v.monogramConfirmBody, confirm);
  schemaFile("hideBody", v.hideBody, [...structural, ...typeVariants("hidden"), { hidden: true }, { hidden: false }, { hidden: "true" }, { hidden: 1 }, { hidden: null }, { hidden: true, extra: 1 }, raw('{"hidden":true,"hidden":false}')]);
});
