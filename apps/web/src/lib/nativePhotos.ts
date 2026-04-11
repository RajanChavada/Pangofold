import { Capacitor } from "@capacitor/core";

export function isCapacitorNative(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

/** One photo from camera / photo library (native only). Returns null on web. */
export async function pickOneNativePhoto(): Promise<File | null> {
  if (!isCapacitorNative()) return null;

  const { Camera, CameraResultType, CameraSource } = await import("@capacitor/camera");

  const photo = await Camera.getPhoto({
    quality: 88,
    allowEditing: false,
    resultType: CameraResultType.Base64,
    source: CameraSource.Prompt,
  });

  const base64 = photo.base64String;
  if (!base64) return null;

  const mime =
    photo.format === "png"
      ? "image/png"
      : photo.format === "jpeg" || photo.format === "jpg"
        ? "image/jpeg"
        : "image/jpeg";

  const binary = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const name = `capture-${Date.now()}.${mime === "image/png" ? "png" : "jpg"}`;
  return new File([binary], name, { type: mime });
}
