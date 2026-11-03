interface QuoteRectangle {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Canvas percentages for the group, parent-relative percentages for its sibling slots. */
export function quoteLayout(aspectRatio: "9:16" | "16:9", hasSticker: boolean, stickerOnly = false): {
  container: QuoteRectangle;
  card: QuoteRectangle;
  sticker: QuoteRectangle | null;
} {
  const portrait = aspectRatio === "9:16";
  const frameAspect = portrait ? 9 / 16 : 16 / 9;
  // shortcut: fixed zones assume standard talking-head framing, use face-aware placement for moving or reframed hosts.
  const container = { x: portrait ? 5 : 30, y: portrait ? 60 : 58.5, width: portrait ? 90 : 40, height: portrait ? 20 : 10 };
  // Landscape's two-row slam captions start near 69%, so this card needs a compact slot.
  const cardWidth = portrait ? 64 : 12;
  const card = {
    x: portrait ? (hasSticker ? 28 : 18) : (hasSticker ? 45 : 44),
    y: portrait ? 64 : 60,
    width: cardWidth,
    height: cardWidth * frameAspect * 240 / 640,
  };
  const stickerWidth = stickerOnly ? (portrait ? 24 : 4.5) : (portrait ? 18 : 4);
  const sticker = {
    x: stickerOnly ? (portrait ? 8 : 48) : (portrait ? 7 : 37),
    y: portrait ? 64 : 60,
    width: stickerWidth,
    height: stickerWidth * frameAspect,
  };
  const relative = (rectangle: QuoteRectangle): QuoteRectangle => ({
    x: (rectangle.x - container.x) / container.width * 100,
    y: (rectangle.y - container.y) / container.height * 100,
    width: rectangle.width / container.width * 100,
    height: rectangle.height / container.height * 100,
  });
  return { container, card: relative(card), sticker: hasSticker ? relative(sticker) : null };
}
