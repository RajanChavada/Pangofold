import QRCode from "react-qr-code";
import { cn } from "../lib/cn";

interface CollabInviteQrProps {
  url: string | null;
  /** Shown under the code */
  caption?: string;
  className?: string;
  /** Pixel size of the QR module area */
  size?: number;
}

/**
 * Scannable QR for a collaborate / friend-logging URL (or any same-tab URL).
 */
export function CollabInviteQr({
  url,
  caption = "Scan to open on your phone",
  className,
  size = 140,
}: CollabInviteQrProps) {
  if (!url) return null;

  return (
    <div className={cn("flex flex-col items-center gap-2", className)}>
      <div className="rounded-2xl border border-border bg-white p-3 shadow-sm">
        <QRCode value={url} size={size} level="M" fgColor="#0f172a" bgColor="#ffffff" />
      </div>
      {caption && <p className="text-[11px] text-text-muted text-center max-w-[200px] leading-snug">{caption}</p>}
    </div>
  );
}
