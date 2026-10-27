/**
 * Instagram DM Canvas & Layout Engine
 * Reverse-engineered from Slideshows.gg client chunk 1g97m0-ffgl1x.js
 */

// --- 1. Parser & AST Utilities ---

const DELIMITER_REGEX = /^-{3,}$/;
const STORY_REGEX = /^\[?story\]?\s*:?$/i;
const MESSAGE_REGEX = /^([^:\s]{1,20})\s*:\s*(.*)$/;

export function smartQuotes(text) {
  if (!text) return "";
  return text.replace(/"([^"]*)"/g, "“$1”").replace(/'/g, "’");
}

export function parseScript(scriptText, { story = true } = {}) {
  const slides = [];
  const skipped = [];
  let currentItems = [];
  let lastSender = null;
  let hasStory = false;

  const flushSlide = () => {
    if (currentItems.length > 0) {
      slides.push({ items: [...currentItems] });
      currentItems = [];
    }
  };

  const lines = (scriptText || "").split(/\r?\n/);
  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    if (DELIMITER_REGEX.test(trimmed)) {
      flushSlide();
      return;
    }

    if (STORY_REGEX.test(trimmed)) {
      if (story) {
        currentItems.push({ from: "story" });
        hasStory = true;
      } else {
        skipped.push(index + 1);
      }
      return;
    }

    const match = MESSAGE_REGEX.exec(trimmed);
    if (match && match[2].trim()) {
      lastSender = match[1].toLowerCase() === "me" ? "me" : "them";
      currentItems.push({
        from: lastSender,
        text: smartQuotes(match[2].trim().slice(0, 400)),
      });
      return;
    }

    if (lastSender && !match) {
      currentItems.push({
        from: lastSender,
        text: smartQuotes(trimmed.slice(0, 400)),
      });
    } else {
      skipped.push(index + 1);
    }
  });

  flushSlide();

  return {
    slides: slides.slice(0, 60),
    skipped,
    hasStory,
  };
}

// --- 2. Grapheme Segmentation & Twemoji Rendering ---

const EMOJI_FONT_STACK = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
let probeCanvas = null;
const segmenter =
  typeof Intl !== "undefined" && "Segmenter" in Intl
    ? new Intl.Segmenter(undefined, { granularity: "grapheme" })
    : null;

function splitGraphemes(text) {
  if (segmenter) {
    return Array.from(segmenter.segment(text), (s) => s.segment);
  }
  return Array.from(text);
}

const EMOJI_REGEX = /\p{Extended_Pictographic}|\p{Regional_Indicator}/u;

function segmentTokens(text) {
  const tokens = [];
  for (const cluster of splitGraphemes(text)) {
    if (EMOJI_REGEX.test(cluster)) {
      tokens.push({ text: cluster, emoji: true });
    } else {
      const prev = tokens[tokens.length - 1];
      if (prev && !prev.emoji) {
        prev.text += cluster;
      } else {
        tokens.push({ text: cluster, emoji: false });
      }
    }
  }
  return tokens;
}

const emojiMonoCache = new Map();
const twemojiImgCache = new Map();
const emojiSubscribers = new Set();
let emojiVersion = 0;

export function subscribeEmoji(cb) {
  emojiSubscribers.add(cb);
  return () => emojiSubscribers.delete(cb);
}

function notifyEmojiLoaded() {
  emojiVersion++;
  emojiSubscribers.forEach((cb) => {
    try {
      cb(emojiVersion);
    } catch (e) {
      console.error(e);
    }
  });
}

function isEmojiMonochrome(emoji) {
  if (emojiMonoCache.has(emoji)) return emojiMonoCache.get(emoji);

  if (!probeCanvas) {
    probeCanvas = document.createElement("canvas");
    probeCanvas.width = 192;
    probeCanvas.height = 96;
  }
  const ctx = probeCanvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return false;

  ctx.clearRect(0, 0, 192, 96);
  ctx.font = `64px ${EMOJI_FONT_STACK}`;
  const textWidth = Math.round(ctx.measureText(emoji).width);
  ctx.fillText(emoji, 64, 72);

  const imgData = ctx.getImageData(0, 0, 192, 96).data;
  let isMono = false;
  for (let x = 191; x >= 64; x--) {
    let colAlpha = 0;
    for (let y = 0; y < 96; y++) {
      if (imgData[(192 * y + x) * 4 + 3] > 200) colAlpha++;
    }
    if (colAlpha > 0) {
      isMono = x >= 64 + textWidth - 1 && colAlpha > 24;
      break;
    }
  }

  emojiMonoCache.set(emoji, isMono);
  return isMono;
}

function loadTwemoji(emoji) {
  if (twemojiImgCache.has(emoji)) {
    const cached = twemojiImgCache.get(emoji);
    return cached instanceof HTMLImageElement ? cached : null;
  }

  twemojiImgCache.set(emoji, "loading");
  const codePoints = Array.from(emoji).map((c) => c.codePointAt(0) ?? 0);
  const hasZwj = codePoints.includes(8205);
  const hex = codePoints
    .filter((cp) => hasZwj || cp !== 65039)
    .map((cp) => cp.toString(16))
    .join("-");

  const img = new Image();
  img.crossOrigin = "anonymous";
  img.onload = () => {
    twemojiImgCache.set(emoji, img);
    notifyEmojiLoaded();
  };
  img.onerror = () => {
    twemojiImgCache.set(emoji, "failed");
  };
  img.src = `https://cdn.jsdelivr.net/gh/jdecked/twemoji@15.1.0/assets/svg/${hex}.svg`;
  return null;
}

// --- 3. Canvas 2D Primitives ---

let measureContext = null;
function getMeasureContext() {
  if (!measureContext) {
    const canvas = document.createElement("canvas");
    measureContext = canvas.getContext("2d");
  }
  return measureContext;
}

function setFont(ctx, cfg) {
  const opsz = cfg.opsz ?? cfg.size;
  const ratio = cfg.size / opsz;
  ctx.font = `${cfg.weight ?? 400} ${opsz}px -apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", sans-serif`;
  if (typeof ctx.letterSpacing === "string") {
    ctx.letterSpacing = `${(cfg.tracking ?? 0) / ratio}px`;
  }
  return ratio;
}

export function textWidth(text, cfg) {
  const ctx = getMeasureContext();
  const ratio = setFont(ctx, cfg);
  const manualTracking = Boolean(cfg.tracking && typeof ctx.letterSpacing !== "string");
  let width = 0;

  for (const token of segmentTokens(text)) {
    if (token.emoji) {
      width += cfg.emoji + cfg.emojiGap;
    } else if (manualTracking) {
      for (const char of splitGraphemes(token.text)) {
        width += ctx.measureText(char).width * ratio + (cfg.tracking ?? 0);
      }
    } else {
      width += ctx.measureText(token.text).width * ratio;
    }
  }
  return width;
}

export function wrapText(text, maxWidth, cfg) {
  const words = text.split(" ");
  const lines = [];
  let currentLine = "";

  for (const word of words) {
    const candidate = currentLine ? `${currentLine} ${word}` : word;
    if (!currentLine || textWidth(candidate, cfg) <= maxWidth) {
      currentLine = candidate;
    } else {
      lines.push(currentLine);
      currentLine = word;
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines;
}

export function roundRect(ctx, x, y, width, height, radii) {
  if (typeof ctx.roundRect === "function") {
    ctx.roundRect(x, y, width, height, radii);
    return;
  }
  const [tl, tr, br, bl] =
    typeof radii === "number" ? [radii, radii, radii, radii] : radii;
  ctx.moveTo(x + tl, y);
  ctx.arcTo(x + width, y, x + width, y + height, tr);
  ctx.arcTo(x + width, y + height, x, y + height, br);
  ctx.arcTo(x, y + height, x, y, bl);
  ctx.arcTo(x, y, x + width, y, tl);
  ctx.closePath();
}

export function drawCover(ctx, img, dx, dy, dWidth, dHeight) {
  const sWidth = img.naturalWidth || img.width;
  const sHeight = img.naturalHeight || img.height;
  const scale = Math.max(dWidth / sWidth, dHeight / sHeight);
  const cropW = dWidth / scale;
  const cropH = dHeight / scale;
  const sx = (sWidth - cropW) / 2;
  const sy = (sHeight - cropH) / 2;
  ctx.drawImage(img, sx, sy, cropW, cropH, dx, dy, dWidth, dHeight);
}

export function drawText(ctx, text, x, y, cfg, color) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";

  for (const token of segmentTokens(text)) {
    if (token.emoji) {
      const emoji = token.text;
      const twemoji = loadTwemoji(emoji);
      if (twemoji) {
        ctx.drawImage(twemoji, x + cfg.emojiNudge, y - cfg.cap / 2 - cfg.emoji / 2, cfg.emoji, cfg.emoji);
      } else {
        // Fallback to system font
        ctx.save();
        ctx.font = `${cfg.emoji}px ${EMOJI_FONT_STACK}`;
        ctx.textBaseline = "middle";
        ctx.fillText(emoji, x + cfg.emojiNudge, y - cfg.cap / 2);
        ctx.restore();
      }
      x += cfg.emoji + cfg.emojiGap;
      continue;
    }

    const ratio = setFont(ctx, cfg);
    const manualTracking = Boolean(cfg.tracking && typeof ctx.letterSpacing !== "string");

    if (manualTracking) {
      for (const char of splitGraphemes(token.text)) {
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(ratio, ratio);
        ctx.fillText(char, 0, 0);
        ctx.restore();
        x += ctx.measureText(char).width * ratio + (cfg.tracking ?? 0);
      }
    } else {
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(ratio, ratio);
      ctx.fillText(token.text, 0, 0);
      ctx.restore();
      x += ctx.measureText(token.text).width * ratio;
    }
  }

  ctx.restore();
}

// --- 4. Instagram DM Slide Builder ---

const COLOR_BG_CANVAS = "rgb(11, 15, 24)";
const COLOR_BUBBLE_RECIPIENT = "rgb(35, 39, 48)";
const COLOR_TEXT_MUTED = "rgb(150, 155, 163)";
const COLOR_ACCENT_BAR = "rgb(36, 41, 45)";

const HEADER_CFG = {
  size: 50,
  opsz: 17,
  emoji: 60,
  emojiGap: 4,
  emojiNudge: 0,
  cap: 36,
};

export function buildSlideSpecs({
  parsed,
  look = "full",
  storyImage = null,
}) {
  const { slides } = parsed;
  if (!slides || slides.length === 0) return [];

  const allItems = slides.flatMap((s) => s.items);
  const slideIndices = slides.flatMap((s, idx) => s.items.map(() => idx));

  const isCloseup = look === "closeup";
  const scale = isCloseup ? 1.18 : 1.0;
  const s = (v) => Math.trunc(v * scale);

  const geom = {
    text: {
      size: s(65),
      opsz: isCloseup ? 32 : 17,
      emoji: s(82),
      emojiGap: 4,
      emojiNudge: 2,
      cap: s(46),
      tracking: isCloseup ? 0 : 1.7,
    },
    line: s(86),
    padX: s(54),
    padTop: s(46),
    padBottom: s(49),
    rBig: s(84),
    rSmall: s(16),
    margin: isCloseup ? 8 : 17,
    sameGap: s(11),
    diffGap: s(53),
    maxW: 1150,
  };

  const drawElements = [];
  let curY = 40;
  let prevSender = null;

  allItems.forEach((item, idx) => {
    if (item.from === "story") {
      const topY = curY;
      const bottomY = topY + 74 + 668;

      drawElements.push({
        from: "story",
        top: topY,
        bottom: bottomY,
        paint(ctx) {
          const title = "You replied to their story";
          const tw = textWidth(title, HEADER_CFG);
          drawText(ctx, title, 1245 - tw, topY + 48, HEADER_CFG, COLOR_TEXT_MUTED);

          const storyCardY = topY + 74;
          ctx.save();
          ctx.beginPath();
          roundRect(ctx, 860, storyCardY, 376, 668, 62);
          ctx.clip();

          if (storyImage) {
            drawCover(ctx, storyImage, 860, storyCardY, 376, 668);
          } else {
            ctx.fillStyle = COLOR_BUBBLE_RECIPIENT;
            ctx.fillRect(860, storyCardY, 376, 668);
            const phCfg = { size: 34, opsz: 17, emoji: 40, emojiGap: 4, emojiNudge: 0, cap: 24 };
            const label = "Story picture";
            const lw = textWidth(label, phCfg);
            drawText(ctx, label, 860 + (376 - lw) / 2, storyCardY + 334 + 12, phCfg, COLOR_TEXT_MUTED);
          }
          ctx.restore();

          // Grey indicator bar next to story
          ctx.beginPath();
          roundRect(ctx, 1287, storyCardY + 2, 14, 666, 7);
          ctx.fillStyle = COLOR_ACCENT_BAR;
          ctx.fill();
        },
      });

      curY = bottomY + 34;
      prevSender = "me";
      return;
    }

    if (prevSender !== null && item.from !== prevSender) {
      curY += geom.diffGap - geom.sameGap;
    }

    const prevSame = allItems[idx - 1]?.from === item.from;
    const nextSame = allItems[idx + 1]?.from === item.from;
    const lines = wrapText(item.text, geom.maxW - 2 * geom.padX, geom.text);
    const bubbleWidth = Math.trunc(
      Math.max(...lines.map((l) => textWidth(l, geom.text))) + 2 * geom.padX
    );
    const bubbleHeight =
      geom.padTop + geom.padBottom + geom.line * lines.length - 12;
    const isMe = item.from === "me";
    const bubbleX = isMe ? 1318 - geom.margin - bubbleWidth : geom.margin;

    const f = Math.min(geom.rBig, Math.floor(bubbleHeight / 2) - 2);
    const xR = prevSame ? geom.rSmall : f;
    const bR = nextSame ? geom.rSmall : f;
    const radii = isMe ? [f, xR, bR, f] : [xR, f, f, bR];
    const topY = curY;

    drawElements.push({
      from: item.from,
      top: topY,
      bottom: topY + bubbleHeight,
      paint(ctx) {
        ctx.beginPath();
        roundRect(ctx, bubbleX, topY, bubbleWidth, bubbleHeight, radii);
        if (isMe) {
          const grad = ctx.createLinearGradient(0, 400, 0, 1900);
          grad.addColorStop(0, "rgb(114, 58, 243)");
          grad.addColorStop(1, "rgb(100, 66, 248)");
          ctx.fillStyle = grad;
        } else {
          ctx.fillStyle = COLOR_BUBBLE_RECIPIENT;
        }
        ctx.fill();

        const textBaselineY =
          topY +
          (bubbleHeight - (lines.length - 1) * geom.line) / 2 +
          geom.text.cap / 2 -
          3;

        lines.forEach((lineText, lineIdx) => {
          drawText(
            ctx,
            lineText,
            bubbleX + geom.padX,
            textBaselineY + lineIdx * geom.line,
            geom.text,
            "#ffffff"
          );
        });
      },
    });

    curY = topY + bubbleHeight + geom.sameGap;
    prevSender = item.from;
  });

  // Now create the slide viewport specifications
  const slideSpecs = [];

  slides.forEach((_, slideIdx) => {
    const firstIdx = slideIndices.indexOf(slideIdx);
    const lastIdx = slideIndices.lastIndexOf(slideIdx);
    if (firstIdx < 0) return;

    const activeElements = drawElements.slice(0, lastIdx + 1);

    if (look === "full") {
      const topOffset = firstIdx === 0 ? 0 : drawElements[firstIdx - 1].top - 90;
      const bottomLimit = drawElements[lastIdx].bottom + 46;
      const contentHeight = bottomLimit - topOffset;
      const scaleFit = Math.min(1.0, 2346 / contentHeight);

      slideSpecs.push({
        width: 1318,
        height: 2346,
        draw(ctx) {
          ctx.fillStyle = "#000000";
          ctx.fillRect(0, 0, 1318, 2346);

          ctx.save();
          const offsetX = (1318 - 1318 * scaleFit) / 2;
          const offsetY = Math.floor((2346 - contentHeight * scaleFit) / 2);
          ctx.translate(offsetX, offsetY);
          ctx.scale(scaleFit, scaleFit);

          ctx.beginPath();
          ctx.rect(0, 0, 1318, contentHeight);
          ctx.clip();

          ctx.fillStyle = COLOR_BG_CANVAS;
          ctx.fillRect(0, 0, 1318, contentHeight);

          ctx.translate(0, -topOffset);

          for (const el of activeElements) {
            if (el.bottom > topOffset && el.top < bottomLimit) {
              el.paint(ctx);
            }
          }
          ctx.restore();
        },
      });
    } else {
      // Closeup mode
      const anchorIdx =
        allItems[firstIdx]?.from === "me" && firstIdx > 0 && allItems[firstIdx - 1]?.from !== "story"
          ? firstIdx - 1
          : firstIdx;
      const prevBottom = anchorIdx > 0 ? drawElements[anchorIdx - 1].bottom : 0;
      const nextTop =
        lastIdx + 1 < drawElements.length
          ? drawElements[lastIdx + 1].top
          : drawElements[lastIdx].bottom + 200;

      const cropTop = Math.max(0, prevBottom + 6, drawElements[anchorIdx].top - 50);
      const cropBottom = Math.min(nextTop - 6, drawElements[lastIdx].bottom + 50);
      const cropHeight = cropBottom - cropTop;
      const targetHeight = Math.round((828 * cropHeight) / 1318);

      slideSpecs.push({
        width: 828,
        height: targetHeight,
        draw(ctx) {
          ctx.fillStyle = COLOR_BG_CANVAS;
          ctx.fillRect(0, 0, 828, targetHeight);

          ctx.save();
          ctx.scale(828 / 1318, targetHeight / cropHeight);
          ctx.translate(0, -cropTop);

          for (const el of activeElements) {
            if (el.bottom > cropTop && el.top < cropBottom) {
              el.paint(ctx);
            }
          }
          ctx.restore();
        },
      });
    }
  });

  return slideSpecs;
}

export function renderToCanvas(spec, targetCanvas, scale = 1.0) {
  targetCanvas.width = Math.max(1, Math.round(spec.width * scale));
  targetCanvas.height = Math.max(1, Math.round(spec.height * scale));
  const ctx = targetCanvas.getContext("2d");
  if (!ctx) return;

  ctx.setTransform(
    targetCanvas.width / spec.width,
    0,
    0,
    targetCanvas.height / spec.height,
    0,
    0
  );
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  spec.draw(ctx);
}

export function specToPngBlob(spec) {
  const offscreen = document.createElement("canvas");
  renderToCanvas(spec, offscreen, 1.0);
  return new Promise((resolve, reject) => {
    offscreen.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Canvas toBlob failed"));
    }, "image/png");
  });
}
