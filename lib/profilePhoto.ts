import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { Platform } from 'react-native';

export function isRemotePhotoUrl(uri: string | null | undefined): uri is string {
  return typeof uri === 'string' && /^https?:\/\//i.test(uri.trim());
}

function isDurableLocalUri(uri: string): boolean {
  if (uri.startsWith('data:')) return true;
  const lower = uri.toLowerCase();
  return (
    lower.includes('/documents/') ||
    lower.includes('/document/') ||
    lower.includes('/profile-photos/')
  );
}

/**
 * Copia a foto para armazenamento permanente da app (não cache).
 * URIs da galeria/cache desaparecem — por isso a foto "sumia".
 */
export async function persistProfilePhotoLocally(
  sourceUri: string,
  userId: string,
): Promise<string> {
  const trimmed = sourceUri.trim();
  if (!trimmed) return trimmed;
  if (isRemotePhotoUrl(trimmed) || isDurableLocalUri(trimmed)) return trimmed;

  if (Platform.OS === 'web') {
    const context = ImageManipulator.manipulate(trimmed);
    const rendered = await context.renderAsync();
    const saved = await rendered.saveAsync({
      compress: 0.85,
      format: SaveFormat.JPEG,
      base64: true,
    });
    if (saved.base64) return `data:image/jpeg;base64,${saved.base64}`;
    return saved.uri;
  }

  const dir = new Directory(Paths.document, 'profile-photos');
  if (!dir.exists) {
    dir.create({ intermediates: true, idempotent: true });
  }

  const dest = new File(dir, `${userId}.jpg`);
  if (dest.exists) {
    dest.delete();
  }

  const source = new File(trimmed);
  source.copy(dest);
  return dest.uri;
}
