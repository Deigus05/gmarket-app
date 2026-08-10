import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { Image as RNImage } from 'react-native';

/** Max long-edge for marketplace uploads (good quality, light for weak networks). */
export const UPLOAD_MAX_EDGE = 1024;
/** JPEG quality for uploads (~100–280 KB typical). */
export const UPLOAD_QUALITY = 0.65;

export type ImageSizePreset = 'thumb' | 'card' | 'detail' | 'full';

const PRESETS: Record<Exclude<ImageSizePreset, 'full'>, { width: number; quality: number }> = {
  thumb: { width: 400, quality: 70 },
  card: { width: 640, quality: 72 },
  detail: { width: 1080, quality: 78 },
};

function getImageSize(uri: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    RNImage.getSize(
      uri,
      (width, height) => resolve({ width, height }),
      (error) => reject(error),
    );
  });
}

/**
 * Resize + JPEG compress a local image before upload.
 * Keeps aspect ratio; skips resize when already small enough.
 */
export async function compressImageForUpload(
  uri: string,
  maxEdge = UPLOAD_MAX_EDGE,
  quality = UPLOAD_QUALITY,
): Promise<string> {
  const context = ImageManipulator.manipulate(uri);

  try {
    const { width, height } = await getImageSize(uri);
    const longest = Math.max(width, height);
    if (longest > maxEdge) {
      if (width >= height) context.resize({ width: maxEdge });
      else context.resize({ height: maxEdge });
    }
  } catch {
    // Size unknown — re-encode as JPEG without forced upscale.
  }

  const rendered = await context.renderAsync();
  const saved = await rendered.saveAsync({
    compress: quality,
    format: SaveFormat.JPEG,
  });
  return saved.uri;
}

export async function compressImagesForUpload(uris: string[]): Promise<string[]> {
  const results = await Promise.all(
    uris.map(async (uri) => {
      try {
        return await compressImageForUpload(uri);
      } catch {
        return uri;
      }
    }),
  );
  return results;
}

/** First usable image from gallery / cover fields. */
export function firstImageUrl(
  urls?: Array<string | null | undefined> | null,
  single?: string | null,
  fallback = '',
): string {
  const fromGallery = urls?.find((image) => typeof image === 'string' && image.trim().length > 0);
  if (fromGallery?.trim()) return fromGallery.trim();
  if (typeof single === 'string' && single.trim().length > 0) return single.trim();
  return fallback;
}

function setQueryParams(url: string, params: Record<string, string>): string {
  try {
    const parsed = new URL(url);
    Object.entries(params).forEach(([key, value]) => {
      parsed.searchParams.set(key, value);
    });
    return parsed.toString();
  } catch {
    const base = url.split('?')[0];
    const qs = Object.entries(params)
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
      .join('&');
    return `${base}?${qs}`;
  }
}

/**
 * When true, rewrite Supabase Storage object URLs to Image Transform
 * render URLs. Requires Pro + Image Transformations enabled — leave false
 * until the backend confirms transforms are on (otherwise images 404).
 */
export const ENABLE_SUPABASE_IMAGE_TRANSFORMS = false;

/**
 * Request a lighter remote variant when the host supports it
 * (optional Supabase Image Transforms, Unsplash). Falls back to original URL.
 * Primary savings for GMarket come from compressImageForUpload on publish.
 */
export function optimizedImageUrl(
  url: string | null | undefined,
  preset: ImageSizePreset = 'card',
): string {
  if (!url || !url.trim()) return '';
  const trimmed = url.trim();
  if (preset === 'full' || trimmed.startsWith('file:') || trimmed.startsWith('data:')) {
    return trimmed;
  }

  const { width, quality } = PRESETS[preset];

  if (ENABLE_SUPABASE_IMAGE_TRANSFORMS) {
    // Supabase Storage: /object/public/... → /render/image/public/...?width&quality
    if (trimmed.includes('/storage/v1/object/')) {
      const renderUrl = trimmed.replace('/storage/v1/object/', '/storage/v1/render/image/');
      return setQueryParams(renderUrl, {
        width: String(width),
        quality: String(quality),
        resize: 'contain',
      });
    }

    if (trimmed.includes('/storage/v1/render/image/')) {
      return setQueryParams(trimmed, {
        width: String(width),
        quality: String(quality),
        resize: 'contain',
      });
    }
  }

  // Unsplash (and similar CDN query APIs).
  if (/images\.unsplash\.com/i.test(trimmed)) {
    return setQueryParams(trimmed, {
      w: String(width),
      q: String(quality),
      auto: 'format',
      fit: 'max',
    });
  }

  return trimmed;
}

/** Convenience for product/property cards in lists. */
export function listImageUrl(
  urls?: Array<string | null | undefined> | null,
  single?: string | null,
  fallback = '',
  preset: ImageSizePreset = 'card',
): string {
  return optimizedImageUrl(firstImageUrl(urls, single, fallback), preset);
}
