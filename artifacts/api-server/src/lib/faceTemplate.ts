import jpeg from "jpeg-js";

const TEMPLATE_SIZE = 24;
// A phone can return the same face with a mirrored image, a slightly different
// crop, or a few pixels of movement inside the camera guide. Keep the threshold
// conservative and handle those camera variations explicitly below.
const MATCH_THRESHOLD = 0.78;

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

function normalizedPixels(image: DecodedImage): number[] {
  return normalizedPixelsWithOptions(image);
}

type NormalizationOptions = {
  flipX?: boolean;
  shiftX?: number;
  shiftY?: number;
  zoom?: number;
};

function normalizedPixelsWithOptions(
  image: DecodedImage,
  options: NormalizationOptions = {},
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
      const localX = Math.min(cropSide - 1, Math.floor(((x + 0.5) * cropSide) / TEMPLATE_SIZE));
      const localY = Math.min(cropSide - 1, Math.floor(((y + 0.5) * cropSide) / TEMPLATE_SIZE));
      const sourceX = Math.min(
        image.width - 1,
        left + (options.flipX ? cropSide - 1 - localX : localX),
      );
      const sourceY = Math.min(image.height - 1, top + localY);
      const offset = (sourceY * image.width + sourceX) * 4;
      const red = image.data[offset] ?? 0;
      const green = image.data[offset + 1] ?? 0;
      const blue = image.data[offset + 2] ?? 0;
      pixels.push(0.299 * red + 0.587 * green + 0.114 * blue);
    }
  }

  const mean = pixels.reduce((sum, value) => sum + value, 0) / pixels.length;
  const variance = pixels.reduce((sum, value) => sum + (value - mean) ** 2, 0) / pixels.length;
  const deviation = Math.sqrt(variance) || 1;
  return pixels.map((value) => Math.round(((value - mean) / deviation) * 32));
}

export function createFaceTemplate(imageBase64: string): string {
  const template = normalizedPixels(decodeImage(imageBase64));
  return `v1:${template.join(",")}`;
}

function parseTemplate(value: unknown): number[] | null {
  if (typeof value !== "string" || !value.startsWith("v1:")) return null;
  const values = value.slice(3).split(",").map(Number);
  return values.length === TEMPLATE_SIZE * TEMPLATE_SIZE && values.every(Number.isFinite) ? values : null;
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
  const stored = parseTemplate(storedTemplate);
  if (!stored) return false;
  const image = decodeImage(imageBase64);

  // Keep v1 templates usable, but make matching tolerant of the normal
  // differences between the enrollment photo and a later phone capture.
  const candidates = [
    {},
    { flipX: true },
    { shiftX: -0.07 },
    { shiftX: 0.07 },
    { shiftY: -0.07 },
    { shiftY: 0.07 },
    { zoom: 1.1 },
    { flipX: true, zoom: 1.1 },
  ];

  return candidates.some((options) =>
    similarity(stored, normalizedPixelsWithOptions(image, options)) >= MATCH_THRESHOLD,
  );
}

export const faceMatchThreshold = MATCH_THRESHOLD;