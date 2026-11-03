import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { quoteLayout } from "./quote-layout";

const builderSource = readFileSync(new URL("./builder.ts", import.meta.url), "utf8");
const captionPadding = Number(builderSource.match(/\.caption\{[^}]*padding-bottom:(\d+)px/)![1]);
const slamStyle = builderSource.match(/\.style-slam \.cap-inner\{[^}]*font-size:(\d+)px;line-height:([\d.]+)/)!;
const captionRows = Number(builderSource.match(/-webkit-line-clamp:(\d+)/)![1]);
const captionHeight = captionPadding + Number(slamStyle[1]) * Number(slamStyle[2]) * captionRows;

for (const aspectRatio of ["9:16", "16:9"] as const) {
  test(`${aspectRatio} quotes and stickers stay separate inside the lower safe band`, () => {
    const frame = aspectRatio === "9:16" ? { width: 1080, height: 1920 } : { width: 1920, height: 1080 };
    const captionTop = (frame.height - captionHeight) / frame.height * 100;
    for (const [hasSticker, stickerOnly] of [[false, false], [true, false], [true, true]] as const) {
      const layout = quoteLayout(aspectRatio, hasSticker, stickerOnly);
      assert.deepEqual(layout, quoteLayout(aspectRatio, hasSticker, stickerOnly));
      if (!stickerOnly) assert.deepEqual(layout, quoteLayout(aspectRatio, hasSticker));
      assert.equal(!!layout.sticker, hasSticker);
      const canvas = (rectangle: typeof layout.card) => ({
        x: layout.container.x + rectangle.x * layout.container.width / 100,
        y: layout.container.y + rectangle.y * layout.container.height / 100,
        width: rectangle.width * layout.container.width / 100,
        height: rectangle.height * layout.container.height / 100,
      });
      const card = canvas(layout.card);
      assert.ok(Math.abs(card.width * frame.width / (card.height * frame.height) - 640 / 240) < 0.001);
      // Enclose the independent card/sticker rotations, sticker sway, entry overshoot and translation.
      const bounds = (rectangle: typeof card, degrees: number, sway: number) => {
        const radians = degrees * Math.PI / 180;
        const width = rectangle.width * frame.width / 100;
        const height = rectangle.height * frame.height / 100;
        const halfWidth = (width * Math.cos(radians) + height * Math.sin(radians)) / frame.width * 50;
        const halfHeight = (width * Math.sin(radians) + height * Math.cos(radians)) / frame.height * 50;
        const centerX = rectangle.x + rectangle.width / 2;
        const centerY = rectangle.y + rectangle.height / 2;
        const groupX = layout.container.x + layout.container.width / 2;
        const groupY = layout.container.y + layout.container.height / 2;
        return {
          left: groupX + (centerX - halfWidth - groupX) * 1.02,
          right: groupX + (centerX + halfWidth - groupX) * 1.02,
          top: groupY + (centerY - halfHeight - sway - groupY) * 1.02,
          bottom: groupY + (centerY + halfHeight + sway - groupY) * 1.02 + layout.container.height * 0.05,
        };
      };
      const cardBounds = bounds(card, 2, 0);
      const rectangles = stickerOnly ? [] : [{ ...cardBounds, shadow: 3 }];
      if (layout.sticker) {
        const sticker = canvas(layout.sticker);
        const stickerBounds = bounds(sticker, 6, sticker.height * 0.03);
        if (!stickerOnly) assert.ok(stickerBounds.right < cardBounds.left, "sticker must never cover quote text");
        rectangles.push({ ...stickerBounds, shadow: 0 });
      }
      for (const rectangle of rectangles) {
        assert.ok(rectangle.left >= 5 && rectangle.right <= 95, "keep five-percent side margins");
        assert.ok(rectangle.top >= 58, "reserve the upper talking-head area");
        assert.ok(rectangle.bottom + rectangle.shadow / frame.height * 100 < captionTop, "including any card shadow, stay above actual two-row slam captions");
      }
    }
  });
}
