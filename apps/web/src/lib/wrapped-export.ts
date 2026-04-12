import { toPng } from "html-to-image";
import JSZip from "jszip";

/**
 * Capture a fixed card element repeatedly while advancing slide index (ZIP of PNGs).
 */
export async function exportStoryCardAsZip(options: {
  cardElement: HTMLElement;
  slideCount: number;
  setSlideIndex: (i: number) => void;
  /** Slide index to restore after export (usually current index when export started). */
  restoreIndex: number;
  zipFilename: string;
  /** Prefix inside the zip, e.g. "wrapped" → wrapped-01.png */
  filePrefix: string;
  /** ms to wait after each index change for Framer to settle */
  settleMs?: number;
}): Promise<void> {
  const {
    cardElement,
    slideCount,
    setSlideIndex,
    restoreIndex,
    zipFilename,
    filePrefix,
    settleMs = 520,
  } = options;

  const zip = new JSZip();

  try {
    for (let i = 0; i < slideCount; i++) {
      setSlideIndex(i);
      await new Promise((r) => setTimeout(r, settleMs));
      const dataUrl = await toPng(cardElement, {
        pixelRatio: 2,
        cacheBust: true,
      });
      const b64 = dataUrl.split(",")[1];
      if (b64) {
        zip.file(`${filePrefix}-${String(i + 1).padStart(2, "0")}.png`, b64, { base64: true });
      }
    }
    const blob = await zip.generateAsync({ type: "blob" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = zipFilename.endsWith(".zip") ? zipFilename : `${zipFilename}.zip`;
    a.click();
    URL.revokeObjectURL(a.href);
  } finally {
    setSlideIndex(restoreIndex);
  }
}
