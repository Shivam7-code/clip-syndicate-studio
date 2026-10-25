/**
 * Instagram DM Slideshow Studio - Client Application
 * Pixel-perfect clone of Slideshows.gg /app/promo/instagram-dm
 */

import {
  parseScript,
  buildSlideSpecs,
  renderToCanvas,
  specToPngBlob,
  subscribeEmoji,
} from "./ig-renderer.js";
import { createZipBlob } from "./zip.js";

// --- Preset Examples ---

const EXAMPLES = [
  {
    look: "full",
    story: "/promo/ig-story-example.jpg",
    script: `story:
me: Say less
me: What time?
---
her: say less to WHAT 😭
---
me: Ur story said night in
me: So what time
---
her: that’s a caption not an invitation 😭
---
me: Too late
me: Already RSVP’d
---
her: u can’t rsvp to a caption 😭
her: and what would u even bring
---
me: Snacks and zero plans to leave
---
her: no plans to leave?? 😭
her: bro i don’t even know u
---
me: Easy fix, I’m free this weekend
her: night in was gonna be me and my blanket 😭
---
me: That blanket big enough for two
me: We could both be under it
---
her: hmm 👀
her: and when is this supposed to happen
---
me: Saturday
---
her: don’t u hoop wit ur boys on saturdays 👀
---
me: Ball can wait
me: U can’t
---
her: omg 😭
her: u’d really curve the boys for me
---
me: Already did
me: Told em I’m sick
---
her: bro it’s jay 😭
her: u just told the gc ur sick
her: screenshotted everything btw 💀`,
  },
  {
    look: "closeup",
    story: null,
    script: `her: my ex texted me happy birthday lol
---
me: nice of him
---
her: he said he misses talking to me
me: people miss what they lost
---
her: should i reply?
me: your phone, your call
---
her: that’s it? you don’t care?
me: didn’t say that
---
her: you’re being so quiet
me: i’m reading
---
her: are you jealous or something
me: should i be?
---
her: he asked if i’m free saturday
---
me: reply to him if you want. what i care about is what we’re doing saturday
---
her: so you don’t care if i reply to him?
me: i care. i just won’t compete for you
---
her: stop being dramatic. a little jealousy is cute
me: then i’m out
---
her: what?
me: saturday’s canceled.`,
  },
];

// --- State Management ---

class AppState {
  constructor() {
    this.exampleIndex = 0;
    this.look = EXAMPLES[0].look;
    this.storyUrl = EXAMPLES[0].story;
    this.storyImage = null;
    this.script = EXAMPLES[0].script;
    this.specs = [];
    this.downloadingSlide = null;
    this.isDownloadingAll = false;
    this.errorBanner = null;

    this.loadStoryImage(this.storyUrl);
  }

  loadStoryImage(url) {
    if (!url) {
      this.storyImage = null;
      this.updateSpecs();
      return;
    }
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      this.storyImage = img;
      this.updateSpecs();
    };
    img.onerror = () => {
      console.warn("Could not load story picture from", url);
      this.storyImage = null;
      this.updateSpecs();
    };
    img.src = url;
  }

  updateSpecs() {
    const parsed = parseScript(this.script, { story: true });
    this.parsed = parsed;
    this.specs = buildSlideSpecs({
      parsed,
      look: this.look,
      storyImage: this.storyImage,
    });
    this.render();
  }

  setScript(text) {
    this.script = text;
    this.updateSpecs();
  }

  setLook(newLook) {
    this.look = newLook;
    this.updateSpecs();
  }

  setStoryFile(file) {
    if (!file) {
      if (this.storyUrl && this.storyUrl.startsWith("blob:")) {
        URL.revokeObjectURL(this.storyUrl);
      }
      this.storyUrl = null;
      this.storyImage = null;
      this.updateSpecs();
      return;
    }
    const blobUrl = URL.createObjectURL(file);
    this.storyUrl = blobUrl;
    this.loadStoryImage(blobUrl);

    // If script doesn't have story:, prepend it
    const parsed = parseScript(this.script, { story: true });
    if (!parsed.hasStory) {
      this.script = `story:\n${this.script}`;
    }
    this.updateSpecs();
  }

  loadNextExample() {
    this.exampleIndex = (this.exampleIndex + 1) % EXAMPLES.length;
    const ex = EXAMPLES[this.exampleIndex];
    this.look = ex.look;
    this.storyUrl = ex.story;
    this.script = ex.script;
    this.loadStoryImage(this.storyUrl);
  }

  reset() {
    const ex = EXAMPLES[0];
    this.exampleIndex = 0;
    this.look = ex.look;
    this.storyUrl = ex.story;
    this.script = ex.script;
    this.loadStoryImage(this.storyUrl);
  }

  async downloadSlide(index) {
    const spec = this.specs[index];
    if (!spec) return;
    this.downloadingSlide = index;
    this.render();

    try {
      const blob = await specToPngBlob(spec);
      const filename = `instagram-dm-${String(index + 1).padStart(2, "0")}.png`;
      saveBlob(blob, filename);
    } catch (err) {
      console.error(err);
      alert("Could not render slide PNG.");
    } finally {
      this.downloadingSlide = null;
      this.render();
    }
  }

  async downloadAll() {
    if (!this.specs || this.specs.length === 0) return;
    this.isDownloadingAll = true;
    this.render();

    try {
      const files = {};
      for (let i = 0; i < this.specs.length; i++) {
        const spec = this.specs[i];
        const blob = await specToPngBlob(spec);
        const arrayBuf = await blob.arrayBuffer();
        const filename = `instagram-dm-${String(i + 1).padStart(2, "0")}.png`;
        files[filename] = new Uint8Array(arrayBuf);
      }

      const zipBlob = createZipBlob(files);
      saveBlob(zipBlob, "instagram-dm.zip");
    } catch (err) {
      console.error(err);
      alert("Could not generate ZIP file. Download slides individually.");
    } finally {
      this.isDownloadingAll = false;
      this.render();
    }
  }
}

function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Global App Instance
const app = new AppState();
subscribeEmoji(() => {
  app.updateSpecs();
});

// --- UI Rendering ---

const APP_CONTAINER = document.getElementById("app");

function renderApp() {
  const { look, script, specs, parsed, storyUrl, downloadingSlide, isDownloadingAll } = app;
  const slideCount = specs.length;

  const noteText =
    look === "full"
      ? "1318 × 2346 PNGs, the size of the original post. Free, no credits."
      : "828 wide and as tall as the bubbles, like the original. TikTok puts them on black.";

  const errors = [];
  if (parsed.skipped && parsed.skipped.length > 0) {
    const list = parsed.skipped.slice(0, 5).join(", ");
    errors.push(
      `Line ${list} ${parsed.skipped.length === 1 ? "isn’t" : "aren’t"} a message. Start each line with me: or her:.`
    );
  }
  if (parsed.hasStory && !storyUrl) {
    errors.push("Add the story picture below, or delete the story: line.");
  }

  APP_CONTAINER.innerHTML = `
    <div class="min-h-screen bg-[#fbfbfd] text-[#1d1d1f] flex flex-col font-sans">

      <!-- Left Sidebar + Main Content Layout -->
      <div class="flex flex-1 min-h-screen">

        <!-- Left Sidebar (matching Slideshows.gg exactly) -->
        <aside class="w-[240px] shrink-0 border-r border-[#e5e5ea] bg-white flex flex-col justify-between py-5 px-3 z-20 hidden md:flex">
          <div class="flex flex-col gap-6">
            <!-- Brand Logo -->
            <div class="flex items-center justify-between px-2">
              <a href="/" class="flex items-center gap-2.5 text-inherit no-underline">
                <img src="/art/logo-star.webp" alt="Slideshows Logo" class="w-7 h-7 object-contain" />
                <span class="font-heading font-extrabold text-[19px] tracking-tight text-[#111827]">Slideshows</span>
              </a>
              <button type="button" class="text-[#9ca3af] hover:text-[#111827] p-1 rounded-md transition-colors" title="Toggle Sidebar">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="9" y1="3" x2="9" y2="21"></line></svg>
              </button>
            </div>

            <!-- Primary Nav -->
            <nav class="flex flex-col gap-1">
              <a href="#" class="flex items-center gap-3 px-3 py-2 text-[14px] font-medium text-[#4b5563] hover:text-[#111827] hover:bg-[#f3f4f6] rounded-[10px] transition-colors">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>
                <span>Home</span>
              </a>
              <a href="#" class="flex items-center justify-between px-3 py-2 text-[14px] font-medium text-[#4b5563] hover:text-[#111827] hover:bg-[#f3f4f6] rounded-[10px] transition-colors">
                <div class="flex items-center gap-3">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>
                  <span>Image</span>
                </div>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"></polyline></svg>
              </a>
              <a href="#" class="flex items-center justify-between px-3 py-2 text-[14px] font-medium text-[#4b5563] hover:text-[#111827] hover:bg-[#f3f4f6] rounded-[10px] transition-colors">
                <div class="flex items-center gap-3">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="23 7 16 12 23 17 23 7"></polygon><rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect></svg>
                  <span>Video</span>
                </div>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"></polyline></svg>
              </a>

              <!-- Active Item: Slideshow -->
              <a href="#" class="flex items-center justify-between px-3 py-2 text-[14px] font-semibold text-[#111827] bg-[#f2f2f7] rounded-[10px] shadow-[inset_0_1px_1px_rgba(255,255,255,0.6)]">
                <div class="flex items-center gap-3">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>
                  <span>Slideshow</span>
                </div>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"></polyline></svg>
              </a>

              <a href="#" class="flex items-center gap-3 px-3 py-2 text-[14px] font-medium text-[#4b5563] hover:text-[#111827] hover:bg-[#f3f4f6] rounded-[10px] transition-colors">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="16" height="16" rx="2"></rect><rect x="9" y="9" width="6" height="6"></rect><line x1="9" y1="1" x2="9" y2="4"></line><line x1="15" y1="1" x2="15" y2="4"></line><line x1="9" y1="20" x2="9" y2="23"></line><line x1="15" y1="20" x2="15" y2="23"></line><line x1="20" y1="9" x2="23" y2="9"></line><line x1="20" y1="15" x2="23" y2="15"></line><line x1="1" y1="9" x2="4" y2="9"></line><line x1="1" y1="15" x2="4" y2="15"></line></svg>
                <span>MCP</span>
              </a>
            </nav>

            <!-- Library Section -->
            <div class="flex flex-col gap-1">
              <span class="px-3 text-[11px] font-semibold tracking-wider text-[#9ca3af] uppercase">Library</span>
              <a href="#" class="flex items-center gap-3 px-3 py-2 text-[14px] font-medium text-[#4b5563] hover:text-[#111827] hover:bg-[#f3f4f6] rounded-[10px] transition-colors">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                <span>Character presets</span>
              </a>
              <a href="#" class="flex items-center gap-3 px-3 py-2 text-[14px] font-medium text-[#4b5563] hover:text-[#111827] hover:bg-[#f3f4f6] rounded-[10px] transition-colors">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"></path><line x1="4" y1="22" x2="4" y2="15"></line></svg>
                <span>Campaign presets</span>
              </a>
            </div>

            <!-- Learn & connect -->
            <div class="flex flex-col gap-1">
              <span class="px-3 text-[11px] font-semibold tracking-wider text-[#9ca3af] uppercase">Learn & connect</span>
              <a href="#" class="flex items-center gap-3 px-3 py-2 text-[14px] font-medium text-[#4b5563] hover:text-[#111827] hover:bg-[#f3f4f6] rounded-[10px] transition-colors">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 10v6M2 10l10-5 10 5-10 5z"></path><path d="M6 12v5c3 3 9 3 12 0v-5"></path></svg>
                <span>Learn</span>
              </a>
            </div>
          </div>

          <!-- Bottom User Card -->
          <div class="flex flex-col gap-2 pt-4 border-t border-[#e5e5ea]">
            <a href="#" class="flex items-center gap-3 px-3 py-2 text-[14px] font-medium text-[#4b5563] hover:text-[#111827] hover:bg-[#f3f4f6] rounded-[10px] transition-colors">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
              <span>Help</span>
            </a>
            <div class="flex items-center gap-3 p-2 bg-[#f3f4f6]/60 rounded-[14px] border border-[#e5e5ea]/80">
              <div class="w-9 h-9 rounded-full bg-[#18181b] text-white flex items-center justify-center font-bold text-[14px]">
                S
              </div>
              <div class="flex flex-col">
                <span class="text-[13.5px] font-semibold text-[#111827] leading-tight">Syco Bot</span>
                <span class="text-[11.5px] text-[#6b7280]">Free</span>
              </div>
            </div>
          </div>
        </aside>

        <!-- Right Main Workspace Container -->
        <div class="flex-1 flex flex-col min-w-0 bg-[#fbfbfd]">

          <!-- Top Sticky Header -->
          <header class="h-[64px] border-b border-[#e5e5ea] bg-white/80 backdrop-blur-md px-6 flex items-center justify-between sticky top-0 z-30">
            <div class="flex items-center gap-3">
              <h1 class="text-[16px] font-bold text-[#111827] tracking-tight">Instagram DM</h1>
            </div>
            <div class="flex items-center gap-3">
              <div class="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-[#e5e5ea] bg-white text-[13px] font-semibold text-[#111827] shadow-sm">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="#2563eb" stroke="#2563eb"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>
                <span>10 credits</span>
              </div>
              <div class="w-8 h-8 rounded-full bg-[#18181b] text-white flex items-center justify-center font-bold text-[13px]">
                S
              </div>
            </div>
          </header>

          <!-- Main Page Body -->
          <main class="flex-1 max-w-[1400px] w-full mx-auto p-4 sm:p-6 lg:p-8 flex flex-col gap-6">

            <!-- Breadcrumb & Tool Identity Banner -->
            <div class="flex flex-col gap-3">
              <a href="#" class="inline-flex items-center gap-1.5 text-[13px] font-medium text-[#6b7280] hover:text-[#111827] transition-colors">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"></polyline></svg>
                <span>Promo tools</span>
              </a>

              <div class="flex items-center gap-3.5">
                <img src="/logos/apps/instagram.png" alt="Instagram Icon" class="w-12 h-12 rounded-[14px] object-cover shadow-sm ring-1 ring-black/5" />
                <div class="flex items-center gap-2.5">
                  <h2 class="text-[28px] sm:text-[32px] font-heading font-extrabold text-[#111827] tracking-tight">Instagram DM</h2>
                  <span class="px-2.5 py-0.5 rounded-full text-[12px] font-bold bg-[#ecfdf3] text-[#027a48] border border-[#a6f4c5]">Free</span>
                </div>
              </div>

              <p class="text-[14.5px] leading-relaxed text-[#4b5563] max-w-3xl">
                Write an Instagram DM and get it back as story slides, one beat per slide, in dark mode with the purple bubbles and the story reply. Full screen or close-up crops.
              </p>
            </div>

            <!-- Two Column Studio Grid: Slides on Left, Editor on Right -->
            <div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(350px,420px)] lg:items-start">

              <!-- Left Column: Slide Grid Card -->
              <section class="flex flex-col gap-5 rounded-[24px] border border-[#e5e5ea] bg-white p-5 sm:p-6 shadow-sm order-2 lg:order-1">
                <!-- SlideGrid Header -->
                <header class="flex flex-wrap items-center justify-between gap-3 pb-2 border-b border-[#f2f2f7]">
                  <div class="flex flex-col gap-0.5">
                    <h3 class="text-[20px] font-bold text-[#111827] tracking-tight">
                      ${slideCount} ${slideCount === 1 ? "slide" : "slides"}
                    </h3>
                    <p class="text-[13px] text-[#6b7280]">${noteText}</p>
                  </div>
                  <button
                    id="btn-download-all"
                    type="button"
                    class="inline-flex items-center gap-2 px-4 py-2 rounded-[12px] bg-gradient-to-b from-[#3b82f6] to-[#2563eb] text-white text-[13.5px] font-semibold shadow-sm hover:brightness-105 active:scale-[0.98] transition-all disabled:opacity-50 cursor-pointer"
                    ${slideCount === 0 || isDownloadingAll ? "disabled" : ""}
                  >
                    ${
                      isDownloadingAll
                        ? `<svg class="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10" stroke-opacity="0.25"></circle><path d="M12 2a10 10 0 0 1 10 10"></path></svg>`
                        : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>`
                    }
                    <span>${isDownloadingAll ? "Packing ZIP..." : "Download all"}</span>
                  </button>
                </header>

                <!-- Warnings Banner if any -->
                ${
                  errors.length > 0
                    ? `
                  <div class="flex flex-col gap-1.5 p-3.5 bg-[#fef3f2] border border-[#fee4e2] rounded-[14px]">
                    ${errors
                      .map(
                        (err) => `
                      <div class="flex items-center gap-2 text-[12.5px] font-semibold text-[#b42318]">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>
                        <span>${err}</span>
                      </div>
                    `
                      )
                      .join("")}
                  </div>
                `
                    : ""
                }

                <!-- Responsive 3-Column Slide Canvas Grid -->
                ${
                  slideCount > 0
                    ? `
                  <div class="grid grid-cols-2 sm:grid-cols-3 gap-4 items-start">
                    ${specs
                      .map(
                        (_, idx) => `
                      <div class="flex flex-col gap-2 group">
                        <div class="relative w-full rounded-[14px] overflow-hidden bg-black shadow-md ring-1 ring-black/10">
                          <canvas id="slide-canvas-${idx}" class="block w-full h-auto cursor-pointer" style="aspect-ratio: ${
                          specs[idx].width
                        } / ${specs[idx].height}"></canvas>
                        </div>
                        <div class="flex items-center justify-between px-1">
                          <span class="text-[12.5px] font-semibold text-[#6b7280]">Slide ${
                            idx + 1
                          }</span>
                          <button
                            type="button"
                            class="btn-download-single flex items-center justify-center w-8 h-8 rounded-full text-[#6b7280] hover:text-[#111827] hover:bg-[#f3f4f6] transition-colors"
                            data-index="${idx}"
                            title="Download slide ${idx + 1}"
                          >
                            ${
                              downloadingSlide === idx
                                ? `<svg class="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10" stroke-opacity="0.25"></circle><path d="M12 2a10 10 0 0 1 10 10"></path></svg>`
                                : `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>`
                            }
                          </button>
                        </div>
                      </div>
                    `
                      )
                      .join("")}
                  </div>
                `
                    : `
                  <div class="py-16 text-center text-[14px] text-[#6b7280] bg-[#f9fafb] rounded-[16px]">
                    Write a message to see the slides.
                  </div>
                `
                }
              </section>

              <!-- Right Column: Sticky Editor Panel -->
              <section class="flex flex-col gap-4 rounded-[24px] border border-[#e5e5ea] bg-white p-5 sm:p-6 shadow-sm order-1 lg:order-2 lg:sticky lg:top-[88px]">
                <!-- Editor Header -->
                <header class="flex items-center justify-between gap-3 pb-1">
                  <div class="flex flex-col gap-0.5">
                    <h3 class="text-[19px] font-bold text-[#111827] tracking-tight">Write the chat</h3>
                    <p class="text-[13px] text-[#6b7280]">Every slide updates as you type.</p>
                  </div>
                  <button
                    id="btn-reset"
                    type="button"
                    class="inline-flex items-center gap-1.5 h-8 px-3 rounded-full border border-[#e5e5ea] bg-white hover:bg-[#f9fafb] text-[12.5px] font-semibold text-[#374151] transition-colors shadow-sm cursor-pointer"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path><path d="M3 3v5h5"></path></svg>
                    <span>Reset</span>
                  </button>
                </header>

                <!-- Look Segmented Switch -->
                <div class="flex flex-col gap-1.5">
                  <span class="text-[12.5px] font-bold text-[#374151]">Look</span>
                  <div class="flex p-1 bg-[#f2f2f7] rounded-[12px] gap-1">
                    <button
                      type="button"
                      id="btn-look-full"
                      class="flex-1 py-1.5 text-center text-[13px] font-semibold rounded-[9px] transition-all cursor-pointer ${
                        look === "full"
                          ? "bg-white text-[#111827] shadow-sm"
                          : "text-[#6b7280] hover:text-[#111827]"
                      }"
                    >
                      Full screen
                    </button>
                    <button
                      type="button"
                      id="btn-look-closeup"
                      class="flex-1 py-1.5 text-center text-[13px] font-semibold rounded-[9px] transition-all cursor-pointer ${
                        look === "closeup"
                          ? "bg-white text-[#111827] shadow-sm"
                          : "text-[#6b7280] hover:text-[#111827]"
                      }"
                    >
                      Close-up
                    </button>
                  </div>
                  <p class="text-[12px] text-[#6b7280] leading-snug">
                    ${
                      look === "full"
                        ? "One beat per slide, centred on a black 9:16 frame."
                        : "Cropped tight to the new bubbles, like a zoomed-in phone screenshot."
                    }
                  </p>
                </div>

                <!-- Chat Script Textarea -->
                <div class="flex flex-col gap-1.5">
                  <span class="text-[12.5px] font-bold text-[#374151]">Chat</span>
                  <textarea
                    id="chat-textarea"
                    rows="14"
                    spellcheck="false"
                    class="w-full rounded-[14px] border border-[#e5e5ea] bg-white p-3 font-mono text-[13px] leading-[1.6] text-[#111827] focus:border-[#3b82f6] focus:outline-none focus:ring-2 focus:ring-[#3b82f6]/20 transition-all resize-y shadow-inner"
                  >${script}</textarea>
                </div>

                <!-- Action Buttons: + New slide & Load an example -->
                <div class="flex flex-wrap gap-2">
                  <button
                    id="btn-add-slide"
                    type="button"
                    class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[10px] border border-[#e5e5ea] bg-white hover:bg-[#f9fafb] text-[12.5px] font-semibold text-[#374151] shadow-sm cursor-pointer transition-colors"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                    <span>New slide</span>
                  </button>
                  <button
                    id="btn-load-example"
                    type="button"
                    class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[10px] border border-[#e5e5ea] bg-white hover:bg-[#f9fafb] text-[12.5px] font-semibold text-[#374151] shadow-sm cursor-pointer transition-colors"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8" cy="8" r="1.5"></circle><circle cx="16" cy="16" r="1.5"></circle><circle cx="8" cy="16" r="1.5"></circle><circle cx="16" cy="8" r="1.5"></circle><circle cx="12" cy="12" r="1.5"></circle></svg>
                    <span>Load an example</span>
                  </button>
                </div>

                <!-- Formatting Help Instructions -->
                <p class="text-[12px] leading-[1.5] text-[#6b7280]">
                  One message per line, starting with <code class="font-mono text-[#111827] font-semibold">me:</code> for your side or <code class="font-mono text-[#111827] font-semibold">her:</code> for theirs. Put <code class="font-mono text-[#111827] font-semibold">---</code> on its own line where the next slide starts. A slide never shows a later message.
                </p>

                <!-- Story Reply Picture Section -->
                <div class="flex flex-col gap-2 pt-4 border-t border-[#e5e5ea]">
                  <span class="text-[12.5px] font-bold text-[#374151]">Story reply picture</span>
                  <div class="flex items-center gap-3">
                    ${
                      storyUrl
                        ? `<img src="${storyUrl}" alt="Story thumbnail" class="h-14 w-8 rounded-[6px] object-cover ring-1 ring-black/10 shadow-sm shrink-0" />`
                        : ""
                    }
                    <label class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[10px] border border-[#e5e5ea] bg-white hover:bg-[#f9fafb] text-[12.5px] font-semibold text-[#374151] shadow-sm cursor-pointer transition-colors">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>
                      <span>${storyUrl ? "Change picture" : "Add a picture"}</span>
                      <input id="input-story-file" type="file" accept="image/png,image/jpeg,image/webp" class="hidden" />
                    </label>

                    ${
                      storyUrl
                        ? `
                      <button
                        id="btn-remove-story"
                        type="button"
                        class="p-2 rounded-[10px] border border-[#e5e5ea] text-[#6b7280] hover:text-[#b42318] hover:bg-[#fef3f2] hover:border-[#fee4e2] transition-colors cursor-pointer"
                        title="Remove story picture"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                      </button>
                    `
                        : ""
                    }
                  </div>
                  <p class="text-[12px] leading-relaxed text-[#6b7280]">
                    Goes where you write <code class="font-mono text-[#111827] font-semibold">story:</code>, under “You replied to their story”. Use a 9:16 picture.
                  </p>
                </div>

              </section>

            </div>

          </main>
        </div>

      </div>

    </div>
  `;

  // Draw Canvases for previews
  specs.forEach((spec, idx) => {
    const canvas = document.getElementById(`slide-canvas-${idx}`);
    if (canvas) {
      // 0.35 preview scale keeps memory low while looking very crisp
      renderToCanvas(spec, canvas, 0.35);
    }
  });

  // Attach Event Handlers
  attachEvents();
}

function attachEvents() {
  const textarea = document.getElementById("chat-textarea");
  if (textarea) {
    textarea.addEventListener("input", (e) => {
      app.setScript(e.target.value);
    });
  }

  const btnLookFull = document.getElementById("btn-look-full");
  if (btnLookFull) {
    btnLookFull.addEventListener("click", () => {
      app.setLook("full");
    });
  }

  const btnLookCloseup = document.getElementById("btn-look-closeup");
  if (btnLookCloseup) {
    btnLookCloseup.addEventListener("click", () => {
      app.setLook("closeup");
    });
  }

  const btnReset = document.getElementById("btn-reset");
  if (btnReset) {
    btnReset.addEventListener("click", () => {
      app.reset();
    });
  }

  const btnAddSlide = document.getElementById("btn-add-slide");
  if (btnAddSlide) {
    btnAddSlide.addEventListener("click", () => {
      const textarea = document.getElementById("chat-textarea");
      const text = app.script;
      const pos = textarea ? textarea.selectionEnd : text.length;
      const before = text.slice(0, pos).replace(/\s+$/, "");
      const after = text.slice(pos).replace(/^\s+/, "");
      const newText = `${before}\n---\n${after}`;
      app.setScript(newText);

      requestAnimationFrame(() => {
        if (textarea) {
          const nextPos = before.length + 5;
          textarea.focus();
          textarea.setSelectionRange(nextPos, nextPos);
        }
      });
    });
  }

  const btnLoadExample = document.getElementById("btn-load-example");
  if (btnLoadExample) {
    btnLoadExample.addEventListener("click", () => {
      app.loadNextExample();
    });
  }

  const fileInput = document.getElementById("input-story-file");
  if (fileInput) {
    fileInput.addEventListener("change", (e) => {
      const file = e.target.files?.[0] ?? null;
      app.setStoryFile(file);
      e.target.value = "";
    });
  }

  const btnRemoveStory = document.getElementById("btn-remove-story");
  if (btnRemoveStory) {
    btnRemoveStory.addEventListener("click", () => {
      app.setStoryFile(null);
    });
  }

  const btnDownloadAll = document.getElementById("btn-download-all");
  if (btnDownloadAll) {
    btnDownloadAll.addEventListener("click", () => {
      app.downloadAll();
    });
  }

  const singleButtons = document.querySelectorAll(".btn-download-single");
  singleButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = parseInt(btn.getAttribute("data-index"), 10);
      if (!isNaN(idx)) {
        app.downloadSlide(idx);
      }
    });
  });
}

// Bind app render to AppState
app.render = renderApp;

// Initial render
app.render();
