import jpeg from "jpeg-js";

const TEMPLATE_SIZE = 24;
// Camera framing varies noticeably between Android devices. The matcher still
// requires a strong structural similarity, but the threshold must allow for
// the normal crop, mirror, and lighting differences introduced by a second
// capture of the same face.
// A camera frame is not a biometric scan: Android changes exposure, portrait
// crop, mirror orientation, and autofocus between two captures. Keep the
// threshold strict enough to reject unrelated faces, but do not require the
// same pixel crop twice.
const MATCH_THRESHOLD = 0.58;
const MULTI_SAMPLE_THRESHOLD = 0.50;
const CONSISTENT_SAMPLE_THRESHOLD = 0.54;
const MAX_STORED_TEMPLATES = 96;
const MAX_ENROLLMENT_SAMPLES = 5;
const MIN_IMAGE_SIDE = 160;

type DecodedImage = {
  data: Uint8Array;
  width: number;
  height: number;
};

type FaceImageQuality = {
  score: number;
  brightness: number;
  contrast: number;
  sharpness: number;
};

export class FaceImageQualityError extends Error {
  code = "FACE_IMAGE_QUALITY";
}

function decodeImage(imageBase64: string): DecodedImage {
  let raw = imageBase64.trim();
  if (/^data:image\/[^;]+;base64,/i.test(raw)) {
    raw = raw.slice(raw.indexOf(",") + 1);
  }
  raw = raw.replace(/\s/g, "").replace(/-/g, "+").replace(/_/g, "/");
  if (!raw || raw.length > 7_000_000) {
    throw new FaceImageQualityError("The selfie is missing or too large");
  }
  try {
    const bytes = Buffer.from(raw, "base64");
    if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
      throw new Error("unsupported format");
    }
    const image = jpeg.decode(bytes, {
      useTArray: true,
      formatAsRGBA: true,
      tolerantDecoding: true,
      maxMemoryUsageInMB: 768,
    }) as DecodedImage;
    if (image.width < MIN_IMAGE_SIDE || image.height < MIN_IMAGE_SIDE) {
      throw new FaceImageQualityError("The selfie is too small. Move the phone a little closer and try again.");
    }
    return image;
  } catch (error) {
    if (error instanceof FaceImageQualityError) throw error;
    throw new FaceImageQualityError("The selfie could not be read. Please capture it again.");
  }
}

function luminanceAt(image: DecodedImage, x: number, y: number): number {
  const offset = (y * image.width + x) * 4;
  return 0.299 * (image.data[offset] ?? 0)
    + 0.587 * (image.data[offset + 1] ?? 0)
    + 0.114 * (image.data[offset + 2] ?? 0);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function inspectImageQuality(image: DecodedImage): FaceImageQuality {
  // Sample a small grid. This is intentionally inexpensive because check-in
  // can receive a short burst of frames from the camera.
  const samples: number[] = [];
  let gradientTotal = 0;
  const sampleWidth = 32;
  const sampleHeight = 32;
  // Judge lighting and sharpness inside the same centered face region used by
  // matching. A wall, window, or shirt should not make a clear face unusable.
  const side = Math.min(image.width, image.height);
  const cropSide = Math.max(1, Math.floor(side / 1.45));
  const cropLeft = Math.max(0, Math.floor((image.width - cropSide) / 2));
  const cropTop = Math.max(0, Math.floor((image.height - cropSide) / 2));
  for (let y = 0; y < sampleHeight; y += 1) {
    const sourceY = Math.min(image.height - 1, cropTop + Math.floor((y + 0.5) * cropSide / sampleHeight));
    for (let x = 0; x < sampleWidth; x += 1) {
      const sourceX = Math.min(image.width - 1, cropLeft + Math.floor((x + 0.5) * cropSide / sampleWidth));
      const value = luminanceAt(image, sourceX, sourceY);
      samples.push(value);
      if (x > 0) gradientTotal += Math.abs(value - samples[samples.length - 2]);
      if (y > 0) {
        const above = samples[(y - 1) * sampleWidth + x] ?? value;
        gradientTotal += Math.abs(value - above);
      }
    }
  }

  const mean = samples.reduce((sum, value) => sum + value, 0) / samples.length;
  const variance = samples.reduce((sum, value) => sum + (value - mean) ** 2, 0) / samples.length;
  const contrast = Math.sqrt(variance);
  const sharpness = gradientTotal / (sampleWidth * sampleHeight * 2);
  const brightness = 1 - Math.abs(mean - 128) / 128;
  const brightnessScore = mean < 25 || mean > 235 ? 0 : clamp(brightness, 0, 1);
  const contrastScore = clamp((contrast - 7) / 34, 0, 1);
  const sharpnessScore = clamp((sharpness - 2) / 28, 0, 1);
  const score = brightnessScore * 0.45 + contrastScore * 0.35 + sharpnessScore * 0.2;

  return { score, brightness: mean, contrast, sharpness };
}

function assertUsableFaceImage(image: DecodedImage): FaceImageQuality {
  const quality = inspectImageQuality(image);
  if (quality.score < 0.25) {
    if (quality.brightness < 25) {
      throw new FaceImageQualityError("The selfie is too dark. Face a light source without placing it behind you.");
    }
    if (quality.brightness > 235) {
      throw new FaceImageQualityError("The selfie is overexposed. Move away from direct light and try again.");
    }
    if (quality.sharpness < 2.5) {
      throw new FaceImageQualityError("The selfie is blurry. Hold the phone steady and try again.");
    }
    throw new FaceImageQualityError("The face is not clear enough. Center it in the frame and try again.");
  }
  return quality;
}

type NormalizationOptions = {
  flipX?: boolean;
  shiftX?: number;
  shiftY?: number;
  zoom?: number;
};

const TEMPLATE_VARIANTS: NormalizationOptions[] = [
  // Keep a full centered crop as a compatibility path. The face is not
  // always vertically centered in a portrait Android frame.
  { zoom: 1 },
  { zoom: 1.12 },
  { zoom: 1.28 },
  { zoom: 1.45 },
  { zoom: 1.65 },
  { zoom: 1.9 },
  { zoom: 2.15 },
  // Wider translations handle a face that is inside the guide but not
  // perfectly centered. This is especially important for tall phone frames.
  { zoom: 1.28, shiftX: -0.16 },
  { zoom: 1.28, shiftX: 0.16 },
  { zoom: 1.28, shiftY: -0.20 },
  { zoom: 1.28, shiftY: 0.20 },
  { zoom: 1.45, shiftX: -0.16 },
  { zoom: 1.45, shiftX: 0.16 },
  { zoom: 1.45, shiftY: -0.20 },
  { zoom: 1.45, shiftY: 0.20 },
  { zoom: 1.65, shiftX: -0.16 },
  { zoom: 1.65, shiftX: 0.16 },
  { zoom: 1.65, shiftY: -0.20 },
  { zoom: 1.65, shiftY: 0.20 },
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
  const left = Math.max(0, Math.min(maxLeft, Math.round(centeredLeft + (options.shiftX ?? 0) * side)));
  const top = Math.max(0, Math.min(maxTop, Math.round(centeredTop + (options.shiftY ?? 0) * side)));
  const pixels: number[] = [];

  for (let y = 0; y < TEMPLATE_SIZE; y += 1) {
    for (let x = 0; x < TEMPLATE_SIZE; x += 1) {
      let value = 0;
      let sampleCount = 0;
      const sampleOffsets = legacySampling ? [0.5] : [0.25, 0.75];
      for (const sampleX of sampleOffsets) {
        for (const sampleY of sampleOffsets) {
          const localX = Math.min(cropSide - 1, Math.floor(((x + sampleX) * cropSide) / TEMPLATE_SIZE));
          const localY = Math.min(cropSide - 1, Math.floor(((y + sampleY) * cropSide) / TEMPLATE_SIZE));
          const orientedX = options.flipX ? cropSide - 1 - localX : localX;
          value += luminanceAt(image, Math.min(image.width - 1, left + orientedX), Math.min(image.height - 1, top + localY));
          sampleCount += 1;
        }
      }
      pixels.push(value / sampleCount);
    }
  }

  const mean = pixels.reduce((sum, value) => sum + value, 0) / pixels.length;
  const variance = pixels.reduce((sum, value) => sum + (value - mean) ** 2, 0) / pixels.length;
  const deviation = Math.sqrt(variance) || 1;
  return pixels.map((value) => Math.round(((value - mean) / deviation) * 32));
}

function imageSamples(value: string | string[]): string[] {
  const samples = Array.isArray(value) ? value : [value];
  const clean = samples.filter((sample): sample is string => typeof sample === "string" && sample.trim().length > 0);
  if (clean.length === 0 || clean.length > MAX_ENROLLMENT_SAMPLES) {
    throw new FaceImageQualityError("Capture between one and five readable face samples.");
  }
  return clean;
}

export function createFaceTemplate(images: string | string[]): string {
  const samples = imageSamples(images);
  const templates: number[][] = [];
  for (const imageBase64 of samples) {
    const image = decodeImage(imageBase64);
    assertUsableFaceImage(image);
    for (const options of TEMPLATE_VARIANTS) {
      templates.push(normalizedPixelsWithOptions(image, options));
    }
  }
  return `v3:${JSON.stringify({ templates: templates.slice(0, MAX_STORED_TEMPLATES), sampleCount: samples.length })}`;
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
  if (value.startsWith("v2:")) {
    try {
      const templates: unknown = JSON.parse(value.slice(3));
      if (!Array.isArray(templates) || templates.length === 0 || templates.length > MAX_STORED_TEMPLATES) return null;
      return templates.every(isValidTemplate) ? templates : null;
    } catch {
      return null;
    }
  }
  if (!value.startsWith("v3:")) return null;
  try {
    const parsed: any = JSON.parse(value.slice(3));
    const templates = parsed?.templates;
    if (!Array.isArray(templates) || templates.length === 0 || templates.length > MAX_STORED_TEMPLATES) return null;
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
    // The face is normally in the middle of the camera guide. Strongly
    // down-weight the outside so clothing and background have little influence.
    const x = (index % TEMPLATE_SIZE) / (TEMPLATE_SIZE - 1) - 0.5;
    const y = Math.floor(index / TEMPLATE_SIZE) / (TEMPLATE_SIZE - 1) - 0.5;
    const distanceFromCenter = Math.min(1, Math.sqrt(x * x + y * y) / 0.7072);
    const weight = 1 - distanceFromCenter * 0.75;
    dot += left[index] * right[index] * weight;
    leftMagnitude += left[index] ** 2 * weight;
    rightMagnitude += right[index] ** 2 * weight;
  }
  if (!leftMagnitude || !rightMagnitude) return 0;
  return dot / Math.sqrt(leftMagnitude * rightMagnitude);
}

export function faceMatchScore(storedTemplate: unknown, imageBase64: string): number {
  const storedTemplates = parseTemplates(storedTemplate);
  if (!storedTemplates) return 0;
  const image = decodeImage(imageBase64);
  assertUsableFaceImage(image);
  // Compare both orientations for every crop. The preview is mirrored on
  // some Android devices while the saved JPEG is not (and on other devices
  // the opposite is true). Only checking two zoom levels made that mismatch
  // look like an unrecognized face.
  const candidates = TEMPLATE_VARIANTS.flatMap((options) => [
    normalizedPixelsWithOptions(image, options),
    normalizedPixelsWithOptions(image, { ...options, flipX: !options.flipX }),
  ]);
  // v1/v2 templates were enrolled with a full-frame candidate. Keep an
  // explicit compatibility path for those older profiles as well.
  const legacyCandidates = typeof storedTemplate === "string" && /^(v1|v2):/.test(storedTemplate)
    ? [{}, { flipX: true }].map((options) => normalizedPixelsWithOptions(image, options, true))
    : [];
  return Math.max(
    ...storedTemplates.flatMap((stored) =>
      [...candidates, ...legacyCandidates].map((candidate) => similarity(stored, candidate))),
  );
}

export function faceMatches(storedTemplate: unknown, imageBase64: string): boolean {
  return faceMatchScore(storedTemplate, imageBase64) >= MATCH_THRESHOLD;
}

export function faceMatchesAny(storedTemplate: unknown, images: string[]): { matched: boolean; score: number } {
  let bestScore = 0;
  let usableImageCount = 0;
  const scores: number[] = [];
  let lastQualityError: unknown;
  for (const image of images.slice(0, MAX_ENROLLMENT_SAMPLES)) {
    try {
      const score = faceMatchScore(storedTemplate, image);
      usableImageCount += 1;
      scores.push(score);
      bestScore = Math.max(bestScore, score);
    } catch (error) {
      lastQualityError = error;
    }
  }
  if (!usableImageCount && lastQualityError instanceof FaceImageQualityError) throw lastQualityError;
  // A single sharp frame can be enough. If the camera produced several
  // usable frames, also accept two consistent near-matches; this handles
  // small autofocus/framing changes without allowing one accidental frame to
  // pass on its own.
  const nearMatches = scores
    .filter((score) => score >= MULTI_SAMPLE_THRESHOLD)
    .sort((left, right) => right - left);
  const consistentSamples = nearMatches.length >= 2
    && nearMatches.slice(0, 2).reduce((sum, score) => sum + score, 0) / 2 >= CONSISTENT_SAMPLE_THRESHOLD;
  return { matched: bestScore >= MATCH_THRESHOLD || consistentSamples, score: bestScore };
}

export const faceMatchThreshold = MATCH_THRESHOLD;
