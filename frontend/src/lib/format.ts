export function fileSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${Number((bytes / (1024 * 1024)).toFixed(2))} MiB`;
  if (bytes >= 1024) return `${Number((bytes / 1024).toFixed(2))} KiB`;
  return `${bytes} B`;
}
export const imageTypes = (types: string[]) => types.map(type => type === "image/jpeg" ? "JPEG" : "PNG").join(" / ");
