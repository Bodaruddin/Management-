import type { DocumentBranding } from '@/context/AppContext';

export function documentLogoHtml(
  branding: DocumentBranding,
  width: number,
  height: number,
  alt = 'School logo',
): string {
  if (!branding.logoDataUrl) return '';
  return `<img src="${branding.logoDataUrl}" alt="${alt}" width="${width}" height="${height}" style="width:${width}px;height:${height}px;object-fit:contain;display:block;margin:0 auto" />`;
}

export function documentSignatureHtml(
  branding: DocumentBranding,
  width = 130,
  height = 40,
): string {
  return signatureImageHtml(branding.signatureDataUrl, 'Authorised signature', width, height);
}

export function principalSignatureHtml(
  branding: DocumentBranding,
  width = 130,
  height = 40,
): string {
  const url = branding.principalSignatureDataUrl || branding.signatureDataUrl;
  return signatureImageHtml(url, 'Principal signature', width, height);
}

export function teacherSignatureHtml(
  branding: DocumentBranding,
  width = 130,
  height = 40,
): string {
  return signatureImageHtml(branding.teacherSignatureDataUrl, 'Class Teacher signature', width, height);
}

export function examInChargeSignatureHtml(
  branding: DocumentBranding,
  width = 130,
  height = 40,
): string {
  return signatureImageHtml(branding.examInChargeSignatureDataUrl, 'Exam In-Charge signature', width, height);
}

function signatureImageHtml(
  url: string | null | undefined,
  alt: string,
  width: number,
  height: number,
): string {
  if (!url) return '';
  return `<img src="${url}" alt="${alt}" width="${width}" height="${height}" style="width:${width}px;height:${height}px;object-fit:contain;display:block;margin:0 auto 2px" />`;
}