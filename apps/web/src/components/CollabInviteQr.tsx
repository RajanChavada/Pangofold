import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { cn } from "../lib/cn";

interface CollabInviteQrProps {
  url: string | null;
  /** Shown under the code */
  caption?: string;
  className?: string;
  /** Pixel size of the QR image */
  size?: number;
}

/**
 * Scannable QR for a collaborate / friend-logging URL (or any text).
 * Uses `qrcode` PNG data URLs instead of react-qr-code to avoid Vite/CJS default-export issues (React #130).
 */
export function CollabInviteQr({
  url,
  caption = "Scan to open on your phone",
  className,
  size = 140,
}: CollabInviteQrProps) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!url) {
      setDataUrl(null);
      setFailed(false);
      return;
    }
    let cancelled = false;
    setFailed(false);
    setDataUrl(null);

    void QRCode.toDataURL(url, {
      width: size,
      margin: 2,
      color: { dark: "#0f172a", light: "#ffffff" },
      errorCorrectionLevel: "M",
    })
      .then((u) => {
        if (!cancelled) setDataUrl(u);
      })
      .catch(() => {
        if (!cancelled) {
          setFailed(true);
          setDataUrl(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [url, size]);

  if (!url) return null;

  return (
    <div className={cn("flex flex-col items-center gap-2", className)}>
      <div className="rounded-2xl border border-border bg-white p-3 shadow-sm">
        {dataUrl ? (
          <img src={dataUrl} alt="" width={size} height={size} className="block max-w-none" />
        ) : (
          <div
            className="bg-surface-muted animate-pulse rounded-lg"
            style={{ width: size, height: size }}
            aria-hidden
          />
        )}
        {failed && (
          <p className="text-[10px] text-amber-800 text-center mt-2 max-w-[180px]">Couldn’t render QR — use Copy instead.</p>
        )}
      </div>
      {caption && <p className="text-[11px] text-text-muted text-center max-w-[200px] leading-snug">{caption}</p>}
    </div>
  );
}
