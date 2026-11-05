import { HttpError } from './security';

export const MAX_IMAGE_BYTES = 3 * 1024 * 1024; // decoded image size
export const MAX_BODY_BYTES = 4_400_000; // stays under Vercel's 4.5 MB request limit
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp'] as const;

/** Checks the file's real signature so a renamed file can't pose as an image. */
export function matchesSignature(mime: string, bytes: Buffer): boolean {
  if (mime === 'image/jpeg') return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mime === 'image/png') return bytes.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  if (mime === 'image/webp') {
    return bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP';
  }
  return false;
}

/** Validates an uploaded receipt (data URL): allowed type, size, and real file signature. */
export function validateReceiptImage(body: any): { mime: string; data: string } {
  const match = typeof body?.image === 'string' && body.image.match(/^data:([a-z/]+);base64,([A-Za-z0-9+/=]+)$/);
  if (!match) throw new HttpError(400, 'Upload a JPEG, PNG or WebP image.');
  const [, mime, data] = match;
  if (!ALLOWED.includes(mime as (typeof ALLOWED)[number])) throw new HttpError(415, 'Upload a JPEG, PNG or WebP image.');
  const bytes = Buffer.from(data, 'base64');
  if (bytes.length === 0 || bytes.length > MAX_IMAGE_BYTES) throw new HttpError(413, 'Image must be 3 MB or smaller.');
  if (!matchesSignature(mime, bytes)) throw new HttpError(415, 'File content does not match an image.');
  return { mime, data };
}

/** Validates market-analysis input: a short place name and 0-10 bedrooms. */
export function validateMarketInput(body: any): { location: string; bedrooms: number } {
  const location = typeof body?.location === 'string'
    ? body.location.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 100)
    : '';
  const bedrooms = typeof body?.bedrooms === "number" ? body.bedrooms : NaN;
  if (!location) throw new HttpError(400, 'Enter a location.');
  if (!Number.isInteger(bedrooms) || bedrooms < 0 || bedrooms > 10) throw new HttpError(400, 'Bedrooms must be 0–10.');
  return { location, bedrooms };
}
