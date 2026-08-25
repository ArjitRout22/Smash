// Generates iOS "apple-touch-startup-image" launch screens so an installed
// home-screen PWA opens on a branded splash (app icon on the dark brand bg)
// instead of a white screen. Run: `node scripts/gen-ios-splash.mjs`
// Output: public/splash/*.png  (referenced by <link> tags in src/app/layout.tsx)
import sharp from "sharp";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "public", "splash");
const icon = join(root, "public", "icon-512.png");
const BG = { r: 11, g: 17, b: 32, alpha: 1 }; // #0b1120 (brand dark)

// Common iPhone portrait launch sizes (device pixels) + their CSS dimensions/DPR
// for the media query. Portrait only — iOS uses these on cold launch.
const DEVICES = [
  { w: 750, h: 1334, cssW: 375, cssH: 667, dpr: 2 }, // SE 2/3, 8
  { w: 828, h: 1792, cssW: 414, cssH: 896, dpr: 2 }, // XR, 11
  { w: 1125, h: 2436, cssW: 375, cssH: 812, dpr: 3 }, // X, XS, 11 Pro, 12/13 mini
  { w: 1170, h: 2532, cssW: 390, cssH: 844, dpr: 3 }, // 12, 13, 14
  { w: 1179, h: 2556, cssW: 393, cssH: 852, dpr: 3 }, // 14 Pro, 15, 16
  { w: 1242, h: 2208, cssW: 414, cssH: 736, dpr: 3 }, // 8 Plus
  { w: 1242, h: 2688, cssW: 414, cssH: 896, dpr: 3 }, // XS Max, 11 Pro Max
  { w: 1284, h: 2778, cssW: 428, cssH: 926, dpr: 3 }, // 12/13 Pro Max, 14 Plus
  { w: 1290, h: 2796, cssW: 430, cssH: 932, dpr: 3 }, // 14 Pro Max, 15/16 Pro Max
];

await mkdir(outDir, { recursive: true });

for (const d of DEVICES) {
  const iconSize = Math.round(Math.min(d.w, d.h) * 0.34);
  const resizedIcon = await sharp(icon).resize(iconSize, iconSize, { fit: "contain" }).png().toBuffer();
  const left = Math.round((d.w - iconSize) / 2);
  const top = Math.round((d.h - iconSize) / 2);
  const name = `apple-splash-${d.w}-${d.h}.png`;
  await sharp({ create: { width: d.w, height: d.h, channels: 4, background: BG } })
    .composite([{ input: resizedIcon, left, top }])
    .png()
    .toFile(join(outDir, name));
  console.log("wrote", name);
}

// Emit the <link> tags to paste into the layout (portrait).
console.log("\n--- <link> tags ---");
for (const d of DEVICES) {
  console.log(
    `<link rel="apple-touch-startup-image" media="(device-width: ${d.cssW}px) and (device-height: ${d.cssH}px) and (-webkit-device-pixel-ratio: ${d.dpr}) and (orientation: portrait)" href="/splash/apple-splash-${d.w}-${d.h}.png" />`
  );
}
