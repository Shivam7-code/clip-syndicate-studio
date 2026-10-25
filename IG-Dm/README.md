# Instagram DM Slideshow Studio (`IG-Dm`)

A reverse-engineered, high-fidelity standalone implementation of the **Instagram DM Promo Generator** from [Slideshows.gg](https://www.slideshows.gg/app/promo/instagram-dm).

## Features

- **Pixel-Perfect Canvas Engine**:
  - Full screen 9:16 portrait mode (`1318 × 2346` master resolution).
  - Close-up cropped mode (`828` width with dynamic height).
  - Authentic Instagram DM purple gradients (`rgb(114, 58, 243)` &rarr; `rgb(100, 66, 248)`).
  - Context-aware corner rounding: adjacent messages from the same sender collapse to `16px` radius while outer corners retain `84px` radius.
  - Story reply card with `"You replied to their story"`, 9:16 image rendering with aspect cover preservation, and grey vertical indicator bar.
- **Full Typography & Emoji System**:
  - Grapheme cluster parsing with `Intl.Segmenter`.
  - Automatic Twemoji SVG fallback fetching for cross-platform visual consistency.
  - Smart quotes normalization (`“...”`, `’`).
- **Interactive Studio UI**:
  - Left navigation sidebar matching Slideshows.gg with active `Slideshow` tab and `Syco Bot` profile card.
  - Top header with `10 credits` pill badge and user avatar.
  - Live 3-column reactive slide preview grid with individual slide download buttons.
  - In-memory ZIP archiver for one-click `"Download all"` slide exports.
  - Story picture uploader with thumbnail preview and removal.

## Quick Start

```bash
# Start the standalone server (port 3001)
node server.mjs
```

Then visit [http://localhost:3001/app/promo/instagram-dm](http://localhost:3001/app/promo/instagram-dm).

## Architecture & Reconstructed Specifications

Read the complete engineering specification, grammar breakdown, and layout mathematics in [ARCHITECTURE.md](ARCHITECTURE.md).
