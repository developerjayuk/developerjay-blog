// Line-art SVGs are drawn for light backgrounds, so they get inverted in dark mode;
// raster images (photos, screenshots) would look wrong inverted, so they're left alone.
export function isSvgUrl(url: string): boolean {
  try {
    return new URL(url).pathname.toLowerCase().endsWith(".svg");
  } catch {
    return false;
  }
}
