import jpeg from "jpeg-js";

const TEMPLATE_SIZE = 24;
const MATCH_THRESHOLD = 0.82;

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
  const side = Math.min(image.width, image.height);
  const left = Math.floor((image.width - side) / 2);
  const top = Math.floor((image.height - side) / 2);
  const pixels: number[] = [];

  for (let y = 0; y < TEMPLATE_SIZE; y += 1) {
    for (let x = 0; x < TEMPLATE_SIZE; x += 1) {
      const sourceX = Math.min(image.width - 1, left + Math.floor(((x + 0.5) * side) / TEMPLATE_SIZE));
      const sourceY = Math.min(image.height - 1, top + Math.floor(((y + 0.5) * side) / TEMPLATE_SIZE));
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
  return similarity(stored, normalizedPixels(decodeImage(imageBase64))) >= MATCH_THRESHOLD;
}

export const faceMatchThreshold = MATCH_THRESHOLD;