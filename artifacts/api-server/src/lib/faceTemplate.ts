import jpeg from "jpeg-js";

const TEMPLATE_SIZE = 24;
const DEFAULT_MATCH_THRESHOLD = 0.82;
const MIN_MATCH_THRESHOLD = 0.82;
const MAX_MATCH_THRESHOLD = 0.9;
const MIN_IMAGE_SIDE = 160;
const MIN_LIVE_QUALITY = 0.2;
const MAX_ENROLLMENT_SAMPLES = 5;

type DecodedImage = {
  data: Uint8Array;
  width: number;
  height: number;
};

export type FaceImageQuality = {
  score: number;
  brightness: number;
  contrast: number;
  sharpness: number;
  width: number;
  height: number;
};

type NormalizationOptions = {
  flipX?: boolean;
  shiftX?: number;
  shiftY?: number;
  zoom?: number;
};

type ParsedTemplate = {
  templates: number[][];
  threshold: number;
  sampleCount: number;
};

// A front-camera image can be mirrored and the face can move slightly inside
// the guide. These variants make the descriptor tolerant to normal capture
// variation without accepting a low-quality or structurally unrelated image.
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

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

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

function luminanceAt(image: DecodedImage, x: number, y: number): number {
  const sourceX = clamp(Math.round(x), 0, image.width - 1);
  const sourceY = clamp(Math.round(y), 0, image.height - 1);
  const offset = (sourceY * image.width + sourceX) * 4;
  const red = image.data[offset] ?? 0;
  const green = image.data[offset + 1] ?? 0;
  const blue = image.data[offset + 2] ?? 0;
  return 0.299 * red + 0.587 * green + 0.114 * blue;
}

function qualityFromImage(image: DecodedImage): FaceImageQuality {
  const sampleStep = Math.max(2, Math.floor(Math.min(image.width, image.height) / 96));
  let count = 0;
  let total = 0;
  let squareTotal = 0;
  let gradientTotal = 0;

  for (let y = 0; y < image.height; y += sampleStep) {
    for (let x = 0; x < image.width; x += sampleStep) {
      const value = luminanceAt(image, x, y);
      total += value;
      squareTotal += value * value;
      gradientTotal += Math.abs(value - luminanceAt(image, x + sampleStep, y));
      gradientTotal += Math.abs(value - luminanceAt(image, x, y + sampleStep));
      count += 1;
    }
  }

  const brightness = count ? total / count / 255 : 0;
  const contrast = count ? Math.sqrt(Math.max(0, squareTotal / count - (total / count) ** 2)) / 255 : 0;
  const sharpness = count ? gradientTotal / count / 255 : 0;

  // Reject only genuinely unusable frames. The score is deliberately broad
  // enough for indoor classrooms while still filtering dark, washed-out, or
  // badly blurred frames before they reach the matcher.
  const exposureScore = 1 - clamp(Math.abs(brightness - 0.5) / 0.5, 0, 1);
  const contrastScore = clamp((contrast - 0.06) / 0.24, 0, 1);
  const sharpnessScore = clamp((sharpness - 0.015) / 0.12, 0, 1);
  const sizeScore = clamp(Math.min(image.width, image.height) / 480, 0, 1);
  const score = clamp(
    exposureScore * 0.35 + contrastScore * 0.25 + sharpnessScore * 0.25 + sizeScore * 0.15,
    0,
    1,
  );

  return {
    score,
    brightness,
    contrast,
    sharpness,
    width: image.width,
    height: image.height,
  };
}

function isUsableQuality(quality: FaceImageQuality): boolean {
  return Math.min(quality.width, quality.height) >= MIN_IMAGE_SIDE
    && quality.brightness >= 0.06
    && quality.brightness <= 0.96
    && quality.contrast >= 0.035
    && quality.score >= MIN_LIVE_QUALITY;
}

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
  const left = clamp(
    Math.round(centeredLeft + (options.shiftX ?? 0) * side),
    0,
    maxLeft,
  );
  const top = clamp(
    Math.round(centeredTop + (options.shiftY ?? 0) * side),
    0,
    maxTop,
  );
  const pixels: number[] = [];

  for (let y = 0; y < TEMPLATE_SIZE; y += 1) {
    for (let x = 0; x < TEMPLATE_SIZE; x += 1) {
      // Average four samples per output cell. This smooths JPEG blocks and
      // sensor noise while retaining the old single-sample path for v1 data.
      let value = 0;
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
          value += luminanceAt(image, left + orientedX, top + localY);
          sampleCount += 1;
        }
      }
      pixels.push(value / sampleCount);
    }
  }

  const mean = pixels.reduce((sum, current) => sum + current, 0) / pixels.length;
  const variance = pixels.reduce((sum, current) => sum + (current - mean) ** 2, 0) / pixels.length;
  const deviation = Math.sqrt(variance) || 1;
  return pixels.map((current) => Math.round(((current - mean) / deviation) * 32));
}

function descriptorsForImage(image: DecodedImage): number[][] {
  return TEMPLATE_VARIANTS.map((options) => normalizedPixelsWithOptions(image, options));
}

function isValidTemplate(values: unknown): values is number[] {
  return Array.isArray(values)
    && values.length === TEMPLATE_SIZE * TEMPLATE_SIZE
    && values.every((value) => typeof value === "number" && Number.isFinite(value));
}

function parseTemplates(value: unknown): ParsedTemplate | null {
  if (typeof value !== "string") return null;

  if (value.startsWith("v1:")) {
    const values = value.slice(3).split(",").map(Number);
    return isValidTemplate(values)
      ? { templates: [values], threshold: DEFAULT_MATCH_THRESHOLD, sampleCount: 1 }
      : null;
  }

  if (value.startsWith("v2:")) {
    try {
      const templates: unknown = JSON.parse(value.slice(3));
      return Array.isArray(templates)
        && templates.length > 0
        && templates.length <= 32
        && templates.every(isValidTemplate)
        ? { templates, threshold: DEFAULT_MATCH_THRESHOLD, sampleCount: 1 }
        : null;
    } catch {
      return null;
    }
  }

  if (!value.startsWith("v3:")) return null;
  try {
    const payload: any = JSON.parse(value.slice(3));
    const templates = payload?.templates;
    if (!Array.isArray(templates) || templates.length === 0 || templates.length > 64
      || !templates.every(isValidTemplate)) return null;
    const threshold = typeof payload.threshold === "number" && Number.isFinite(payload.threshold)
      ? clamp(payload.threshold, MIN_MATCH_THRESHOLD, MAX_MATCH_THRESHOLD)
      : DEFAULT_MATCH_THRESHOLD;
    return {
      templates,
      threshold,
      sampleCount: Number.isInteger(payload.sampleCount) ? payload.sampleCount : 1,
    };
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

function calibratedThreshold(descriptors: number[][]): number {
  const canonical = descriptors.filter((_value, index) => index % TEMPLATE_VARIANTS.length === 0);
  const pairwise: number[] = [];
  for (let left = 0; left < canonical.length; left += 1) {
    for (let right = left + 1; right < canonical.length; right += 1) {
      pairwise.push(similarity(canonical[left], canonical[right]));
    }
  }
  if (!pairwise.length) return DEFAULT_MATCH_THRESHOLD;
  pairwise.sort((a, b) => a - b);
  // Leave a small margin below the least similar genuine enrollment sample,
  // but never lower the hard security floor or exceed the calibrated ceiling.
  return clamp(Math.min(...pairwise) - 0.04, MIN_MATCH_THRESHOLD, MAX_MATCH_THRESHOLD);
}

export function analyzeFaceImage(imageBase64: string): FaceImageQuality {
  return qualityFromImage(decodeImage(imageBase64));
}

export function createFaceTemplate(imageBase64: string): string {
  const image = decodeImage(imageBase64);
  const quality = qualityFromImage(image);
  if (!isUsableQuality(quality)) {
    throw new Error("The enrollment photo is too dark, blurry, or small. Please improve the lighting and try again.");
  }
  return `v2:${JSON.stringify(descriptorsForImage(image))}`;
}

export function createFaceTemplateFromSamples(imageBase64List: string[]): string {
  const samples = imageBase64List
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .slice(0, MAX_ENROLLMENT_SAMPLES)
    .map((imageBase64) => {
      const image = decodeImage(imageBase64);
      return { descriptors: descriptorsForImage(image), quality: qualityFromImage(image) };
    })
    .filter((sample) => isUsableQuality(sample.quality))
    .sort((left, right) => right.quality.score - left.quality.score);

  if (samples.length < 3) {
    throw new Error("We need at least 3 clear face samples. Improve the lighting, keep your face centered, and try again.");
  }

  const descriptors = samples.flatMap((sample) => sample.descriptors);
  const averageQuality = samples.reduce((sum, sample) => sum + sample.quality.score, 0) / samples.length;
  return `v3:${JSON.stringify({
    templates: descriptors,
    threshold: calibratedThreshold(descriptors),
    sampleCount: samples.length,
    qualityScore: Number(averageQuality.toFixed(3)),
  })}`;
}

export type FaceMatchResult = {
  matched: boolean;
  usable: boolean;
  score: number;
  threshold: number;
  quality: FaceImageQuality;
  sampleCount: number;
};

export function matchFaceTemplate(storedTemplate: unknown, imageBase64: string): FaceMatchResult {
  const parsed = parseTemplates(storedTemplate);
  if (!parsed) {
    return {
      matched: false,
      usable: false,
      score: 0,
      threshold: DEFAULT_MATCH_THRESHOLD,
      quality: { score: 0, brightness: 0, contrast: 0, sharpness: 0, width: 0, height: 0 },
      sampleCount: 0,
    };
  }

  const image = decodeImage(imageBase64);
  const quality = qualityFromImage(image);
  if (!isUsableQuality(quality)) {
    return { matched: false, usable: false, score: 0, threshold: parsed.threshold, quality, sampleCount: parsed.sampleCount };
  }

  const candidates = descriptorsForImage(image);
  let score = 0;
  for (const stored of parsed.templates) {
    for (const candidate of candidates) {
      score = Math.max(score, similarity(stored, candidate));
    }
  }

  return {
    matched: score >= parsed.threshold,
    usable: true,
    score,
    threshold: parsed.threshold,
    quality,
    sampleCount: parsed.sampleCount,
  };
}

export function faceMatches(storedTemplate: unknown, imageBase64: string): boolean {
  return matchFaceTemplate(storedTemplate, imageBase64).matched;
}

export const faceMatchThreshold = DEFAULT_MATCH_THRESHOLD;