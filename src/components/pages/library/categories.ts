/** File type to Library tab. Shared by the server loader and the page. */
import type { LibraryCategory } from "../data/library";

const BY_EXTENSION: Record<string, LibraryCategory> = {
  md: "Text & PDF",
  txt: "Text & PDF",
  pdf: "Text & PDF",
  doc: "Text & PDF",
  docx: "Text & PDF",
  html: "Websites",
  htm: "Websites",
  ppt: "Slides",
  pptx: "Slides",
  key: "Slides",
  csv: "Spreadsheets",
  xls: "Spreadsheets",
  xlsx: "Spreadsheets",
  png: "Images",
  jpg: "Images",
  jpeg: "Images",
  gif: "Images",
  webp: "Images",
  svg: "Images",
  mp4: "Videos",
  mov: "Videos",
  webm: "Videos",
  mp3: "Audio",
  wav: "Audio",
  m4a: "Audio",
  apk: "Mobile apps",
  ipa: "Mobile apps",
};

export function categoryOf(name: string, mime?: string): LibraryCategory {
  const extension = name.includes(".") ? name.slice(name.lastIndexOf(".") + 1).toLowerCase() : "";
  if (BY_EXTENSION[extension]) return BY_EXTENSION[extension];
  if (mime?.startsWith("image/")) return "Images";
  if (mime?.startsWith("video/")) return "Videos";
  if (mime?.startsWith("audio/")) return "Audio";
  if (mime === "application/pdf" || mime?.startsWith("text/")) return "Text & PDF";
  return "Others";
}
