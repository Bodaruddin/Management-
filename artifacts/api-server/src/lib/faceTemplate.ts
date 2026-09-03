import jpeg from "jpeg-js";

const TEMPLATE_SIZE = 24;
// The original matcher compared one exact 24x24 crop. That was too sensitive
// to JPEG noise, lighting, and small changes in how a teacher held the phone.
// Keep the threshold high enough to avoid accepting unrelated images, but allow
// the normal variation produced by a front-facing phone camera.
const MATCH_THRESHOLD = 0.72;

type DecodedImage = {
  data: Uint8Array;
  width: number;
  height: number;
};

function decodeImage(imageBase64: string): DecodedImage {
  let raw = imageBase64.trim();
  if (/^data:image\/[^;]+;base64,/i.test(raw)) {
    raw = raw.slice(raw.indexOf(",") + 1);
  }
  raw = raw.replace(/\s/g, "").replace(/-/g, "+").replace(/_/g, "/");
  if (!raw || raw.length > 7_000_000) {
    throw new Error("The selfie is missing or too large");
  }
  try {
    const bytes = Buffer.from(raw, "base64");
    if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
      throw new Error("The camera returned an unsupported image format");
    }
    return jpeg.decode(bytes, {
      useTArray: true,
      formatAsRGBA: true,
      tolerantDecoding: true,
      maxMemoryUsageInMB: 768,
    }) as DecodedImage;
  } catch {
    throw new Error("The selfie could not be read. Please capture it again.");
  }
}

type NormalizationOptions = {
  flipX?: boolean;
  shiftX?: number;
  shiftY?: number;
  zoom?: number;
};

// These variants cover the changes we can see without storing the original
// photo: mirrored front-camera output, a little movement in the guide, and
// different distances from the camera. New enrollments store all variants;
// old v1 profiles are matched against all of them as well.
const TEMPLATE_VARIANTS: NormalizationOptions[] = [
  {},
  { flipX: true },
  { zoom: 1.12 },
  { zoom: 1.25 },
  { shiftX: -0.08 },
  { shiftX: 0.08 },
  { shiftY: -0.08 },
  { shiftY: 0.08 },
  { zoom: 1.12, shiftX: -0.06 },
  { zoom: 1.12, shiftX: 0.06 },
  { zoom: 1.12, shiftY: -0.06 },
  { zoom: 1.12, shiftY: 0.06 },
];

function normalizedPixelsWithOptions(
  image: DecodedImage,
  options: NormalizationOptions = {},
  legacySampling = false,
): number[] {
  const side = Math.min(image.width, image.height);
  const zoom = Math.max(1, options.zoom ?? 1);
  const cropSide = Math.max(1, Math.floor(side / zoom));
  const maxLeft = Math.max(0, image.width - cropSide);
  const maxTop = Math.max(0, image.height - cropSide);
  const centeredLeft = (image.width - cropSide) / 2;
  const centeredTop = (image.height - cropSide) / 2;
  const left = Math.max(
    0,
    Math.min(maxLeft, Math.round(centeredLeft + (options.shiftX ?? 0) * side)),
  );
  const top = Math.max(
    0,
    Math.min(maxTop, Math.round(centeredTop + (options.shiftY ?? 0) * side)),
  );
  const pixels: number[] = [];

  for (let y = 0; y < TEMPLATE_SIZE; y += 1) {
    for (let x = 0; x < TEMPLATE_SIZE; x += 1) {
      // Average four samples from each output cell instead of taking one
      // pixel. This makes the descriptor much less affected by JPEG blocks
      // and camera sensor noise. Keep the original single-sample path for
      // v1 profiles so an existing enrollment remains compatible.
      let luminance = 0;
      let sampleCount = 0;
      const sampleOffsets = legacySampling ? [0.5] : [0.25, 0.75];
      for (const sampleX of sampleOffsets) {
        for (const sampleY of sampleOffsets) {
          const localX = Math.min(
            cropSide - 1,
            Math.floor(((x + sampleX) * cropSide) / TEMPLATE_SIZE),
          );
          const localY = Math.min(
            cropSide - 1,
            Math.floor(((y + sampleY) * cropSide) / TEMPLATE_SIZE),
          );
          const orientedX = options.flipX ? cropSide - 1 - localX : localX;
          const sourceX = Math.min(image.width - 1, left + orientedX);
          const sourceY = Math.min(image.height - 1, top + localY);
          const offset = (sourceY * image.width + sourceX) * 4;
          const red = image.data[offset] ?? 0;
          const green = image.data[offset + 1] ?? 0;
          const blue = image.data[offset + 2] ?? 0;
          luminance += 0.299 * red + 0.587 * green + 0.114 * blue;
          sampleCount += 1;
        }
      }
      pixels.push(luminance / sampleCount);
    }
  }

  const mean = pixels.reduce((sum, value) => sum + value, 0) / pixels.length;
  const variance = pixels.reduce((sum, value) => sum + (value - mean) ** 2, 0) / pixels.length;
  const deviation = Math.sqrt(variance) || 1;
  return pixels.map((value) => Math.round(((value - mean) / deviation) * 32));
}

export function createFaceTemplate(imageBase64: string): string {
  const image = decodeImage(imageBase64);
  const templates = TEMPLATE_VARIANTS.map((options) =>
    normalizedPixelsWithOptions(image, options),
  );
  return `v2:${JSON.stringify(templates)}`;
}

function isValidTemplate(values: unknown): values is number[] {
  return Array.isArray(values)
    && values.length === TEMPLATE_SIZE * TEMPLATE_SIZE
    && values.every((value) => typeof value === "number" && Number.isFinite(value));
}

function parseTemplates(value: unknown): number[][] | null {
  if (typeof value !== "string") return null;
  if (value.startsWith("v1:")) {
    const values = value.slice(3).split(",").map(Number);
    return isValidTemplate(values) ? [values] : null;
  }
  if (!value.startsWith("v2:")) return null;
  try {
    const templates: unknown = JSON.parse(value.slice(3));
    if (!Array.isArray(templates) || templates.length === 0 || templates.length > 32) return null;
    return templates.every(isValidTemplate) ? templates : null;
  } catch {
    return null;
  }
}

function similarity(left: number[], right: number[]): number {
  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;
  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index];
    leftMagnitude += left[index] ** 2;
    rightMagnitude += right[index] ** 2;
  }
  if (!leftMagnitude || !rightMagnitude) return 0;
  return dot / Math.sqrt(leftMagnitude * rightMagnitude);
}

export function faceMatches(storedTemplate: unknown, imageBase64: string): boolean {
  const storedTemplates = parseTemplates(storedTemplate);
  if (!storedTemplates) return false;
  const image = decodeImage(imageBase64);

  const candidates = TEMPLATE_VARIANTS.map((options) =>
    normalizedPixelsWithOptions(image, options),
  );
  const legacyCandidates = typeof storedTemplate === "string" && storedTemplate.startsWith("v1:")
    ? TEMPLATE_VARIANTS.map((options) =>
      normalizedPixelsWithOptions(image, options, true),
    )
    : [];

  return storedTemplates.some((stored) =>
    [...candidates, ...legacyCandidates].some((candidate) =>
      similarity(stored, candidate) >= MATCH_THRESHOLD,
    ),
  );
}

export const faceMatchThreshold = MATCH_THRESHOLD;