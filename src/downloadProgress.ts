export interface DownloadProgress {
  engine: string;
  receivedBytes: number;
  totalBytes: number | null;
  fileName: string;
  phase: "downloading" | "validating";
}
export function downloadFraction(
  progress: DownloadProgress | undefined | null,
) {
  if (
    !progress ||
    progress.phase !== "downloading" ||
    !Number.isSafeInteger(progress.receivedBytes) ||
    progress.receivedBytes < 0 ||
    !Number.isSafeInteger(progress.totalBytes) ||
    progress.totalBytes! <= 0 ||
    progress.receivedBytes > progress.totalBytes!
  )
    return null;
  return progress.receivedBytes / progress.totalBytes!;
}
