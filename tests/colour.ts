/**
 * Colour maths for the palette assertions in styles-integrity.test.ts.
 *
 * Written because the round-two palette shipped two sets of values that the
 * token file called "orthogonal on purpose" and that were in four places the
 * same colour, and no test could say so: the only palette assertion in the
 * suite checked that tokens.ts mirrored tokens.css, which both copies of the
 * collision satisfied perfectly. 810 tests passed over --accent and
 * --page-theory both being #274c77.
 *
 * String equality would not have caught it either. --notice was #8a6a1f and
 * --page-analytic-residue was #8a6d1f, three parts in 255 of green apart and
 * indistinguishable on any screen, so the check has to be perceptual. CIEDE2000
 * is the CIE's own answer to the fact that Lab is not perceptually uniform, and
 * chroma is what separates a grey from a hue regardless of how far apart ΔE
 * puts them.
 *
 * No dependency: the suite runs offline and a colour library for two functions
 * is a supply chain for nothing.
 */

function channels(hex: string): readonly [number, number, number] {
  const s = hex.replace("#", "");
  const wide = s.length === 3 ? [...s].map((c) => c + c).join("") : s;
  return [0, 2, 4].map((i) => Number.parseInt(wide.slice(i, i + 2), 16)) as unknown as readonly [
    number,
    number,
    number,
  ];
}

function linear(c: number): number {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

/** CIE L*a*b* under D65, the space CIEDE2000 is defined on. */
export function lab(hex: string): readonly [number, number, number] {
  const [r, g, b] = channels(hex).map(linear) as unknown as [number, number, number];
  const x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047;
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}

/**
 * How much colour a value has, independent of how light it is. This is the
 * number that separates the chrome from the encoding: graphite is chroma 3.5
 * and every page type is above 27, and no amount of squinting turns one into
 * the other. ΔE alone would not say that, because it compresses large chroma
 * differences and reads a grey against a saturated navy at similar lightness as
 * only 13 apart.
 */
export function chroma(hex: string): number {
  const [, a, b] = lab(hex);
  return Math.hypot(a, b);
}

/** WCAG relative luminance, for the contrast assertions. */
export function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map(linear) as unknown as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * CIEDE2000. About 2.3 is the classic just-noticeable difference for two
 * swatches held side by side, so the 20 the palette assertions ask for is a
 * wide margin and the 3/255 of green that shipped between --notice and
 * --page-analytic-residue came to 1.5, under the threshold at which anyone
 * could have seen it.
 */
export function deltaE(hexA: string, hexB: string): number {
  const [l1, a1, b1] = lab(hexA);
  const [l2, a2, b2] = lab(hexB);
  const c1 = Math.hypot(a1, b1);
  const c2 = Math.hypot(a2, b2);
  const cBar = (c1 + c2) / 2;
  const g = 0.5 * (1 - Math.sqrt(cBar ** 7 / (cBar ** 7 + 25 ** 7)));
  const ap1 = (1 + g) * a1;
  const ap2 = (1 + g) * a2;
  const cp1 = Math.hypot(ap1, b1);
  const cp2 = Math.hypot(ap2, b2);
  const hp1 = ((Math.atan2(b1, ap1) * 180) / Math.PI + 360) % 360;
  const hp2 = ((Math.atan2(b2, ap2) * 180) / Math.PI + 360) % 360;
  const dL = l2 - l1;
  const dC = cp2 - cp1;
  const product = cp1 * cp2;
  let dh = 0;
  if (product !== 0) {
    dh = hp2 - hp1;
    if (dh > 180) dh -= 360;
    if (dh < -180) dh += 360;
  }
  const dH = 2 * Math.sqrt(product) * Math.sin((dh * Math.PI) / 360);
  const lBar = (l1 + l2) / 2;
  const cpBar = (cp1 + cp2) / 2;
  let hBar = hp1 + hp2;
  if (product !== 0) {
    if (Math.abs(hp1 - hp2) > 180) hBar += hBar < 360 ? 360 : -360;
    hBar /= 2;
  }
  const t =
    1 -
    0.17 * Math.cos(((hBar - 30) * Math.PI) / 180) +
    0.24 * Math.cos((2 * hBar * Math.PI) / 180) +
    0.32 * Math.cos(((3 * hBar + 6) * Math.PI) / 180) -
    0.2 * Math.cos(((4 * hBar - 63) * Math.PI) / 180);
  const dTheta = 30 * Math.exp(-(((hBar - 275) / 25) ** 2));
  const rc = 2 * Math.sqrt(cpBar ** 7 / (cpBar ** 7 + 25 ** 7));
  const sl = 1 + (0.015 * (lBar - 50) ** 2) / Math.sqrt(20 + (lBar - 50) ** 2);
  const sc = 1 + 0.045 * cpBar;
  const sh = 1 + 0.015 * cpBar * t;
  const rt = -Math.sin((2 * dTheta * Math.PI) / 180) * rc;
  return Math.sqrt(
    (dL / sl) ** 2 + (dC / sc) ** 2 + (dH / sh) ** 2 + rt * (dC / sc) * (dH / sh),
  );
}
