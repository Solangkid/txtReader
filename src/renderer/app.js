const api = window.readerAPI;

const DEFAULT_SETTINGS = {
  fontSize: 20,
  lineHeight: 1.85,
  letterSpacing: 0,
  contentWidth: 900,
  theme: "paper",
  coverSize: "standard",
  fontFamily: "system",
  customFonts: []
};

const FONT_OPTIONS = [
  {
    id: "system",
    name: "系统默认",
    stack: '"Microsoft YaHei UI", "Microsoft YaHei", "Segoe UI", sans-serif'
  },
  { id: "songti", name: "宋体", stack: 'SimSun, "宋体", serif' },
  { id: "kaiti", name: "楷体", stack: 'KaiTi, "楷体", serif' },
  { id: "fangsong", name: "仿宋", stack: 'FangSong, "仿宋", serif' },
  { id: "heiti", name: "黑体", stack: 'SimHei, "黑体", sans-serif' },
  { id: "yahei", name: "微软雅黑", stack: '"Microsoft YaHei UI", "Microsoft YaHei", sans-serif' },
  { id: "dengxian", name: "等线", stack: 'DengXian, "等线", sans-serif' }
];

const state = {
  library: { books: [], settings: DEFAULT_SETTINGS },
  currentBook: null,
  chapters: [],
  saveTimer: null,
  settingsTimer: null,
  settingsFrame: null,
  pendingSettingsPatch: {},
  scrollFrame: null,
  clockTimer: null,
  weatherTimer: null,
  chapterMetricsTimer: null,
  lastScrollTop: 0,
  activeChapter: -1,
  chapterTops: [],
  readerLines: [],
  segments: [],
  segmentHeights: [],
  renderedRange: { start: 0, end: -1 },
  tocVisible: true
};

const els = {
  backButton: document.querySelector("#backButton"),
  importButton: document.querySelector("#importButton"),
  settingsToggle: document.querySelector("#settingsToggle"),
  tocToggle: document.querySelector("#tocToggle"),
  topReadout: document.querySelector("#topReadout"),
  topProgressBar: document.querySelector("#topProgressBar"),
  topProgressText: document.querySelector("#topProgressText"),
  clockText: document.querySelector("#clockText"),
  weatherText: document.querySelector("#weatherText"),
  subtitle: document.querySelector("#subtitle"),
  bookshelfView: document.querySelector("#bookshelfView"),
  readerView: document.querySelector("#readerView"),
  readerStage: document.querySelector("#readerStage"),
  bookGrid: document.querySelector("#bookGrid"),
  emptyState: document.querySelector("#emptyState"),
  dropPanel: document.querySelector("#dropPanel"),
  readerTitle: document.querySelector("#readerTitle"),
  readerPage: document.querySelector("#readerPage"),
  readerContent: document.querySelector("#readerContent"),
  tocDrawer: document.querySelector("#tocDrawer"),
  tocList: document.querySelector("#tocList"),
  tocCount: document.querySelector("#tocCount"),
  settingsPanel: document.querySelector("#settingsPanel"),
  fontSize: document.querySelector("#fontSize"),
  lineHeight: document.querySelector("#lineHeight"),
  letterSpacing: document.querySelector("#letterSpacing"),
  contentWidth: document.querySelector("#contentWidth"),
  fontSelect: document.querySelector("#fontSelect"),
  themeRow: document.querySelector("#themeRow"),
  coverSizeRow: document.querySelector("#coverSizeRow")
};

function percent(value) {
  return `${Math.round((Number(value) || 0) * 100)}%`;
}

function clamp(number, min, max) {
  return Math.min(max, Math.max(min, number));
}

function normalizeSettings(settings = {}) {
  return {
    ...DEFAULT_SETTINGS,
    ...settings,
    customFonts: Array.isArray(settings.customFonts) ? settings.customFonts : []
  };
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function clampExcerpt(text, maxLength = 88) {
  const value = String(text || "").trim();
  if (!value) return "";
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength).trimEnd()}...`;
}

function cssString(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function installCustomFonts(fonts) {
  let style = document.querySelector("#customFontStyles");
  if (!style) {
    style = document.createElement("style");
    style.id = "customFontStyles";
    document.head.appendChild(style);
  }

  style.textContent = fonts
    .filter((font) => font.id && font.url)
    .map((font) => {
      const family = `LocalFont-${cssString(font.id)}`;
      const url = cssString(font.url);
      return `@font-face{font-family:"${family}";src:url("${url}");font-display:swap;}`;
    })
    .join("\n");
}

function fontStack(settings) {
  const font = FONT_OPTIONS.find((item) => item.id === settings.fontFamily);
  return font ? font.stack : FONT_OPTIONS[0].stack;
}

function renderFontOptions(settings) {
  const current = settings.fontFamily || "system";
  els.fontSelect.innerHTML = "";

  FONT_OPTIONS.forEach((font) => {
    const option = document.createElement("option");
    option.value = font.id;
    option.textContent = font.name;
    els.fontSelect.appendChild(option);
  });

  els.fontSelect.value = FONT_OPTIONS.some((font) => font.id === current) ? current : "system";
}

function applySettings(settings, syncControls = true) {
  const merged = normalizeSettings(settings);
  installCustomFonts(merged.customFonts);

  document.body.classList.toggle("theme-night", merged.theme === "night");
  document.body.classList.toggle("theme-jade", merged.theme === "jade");
  document.body.dataset.coverSize = merged.coverSize;

  requestAnimationFrame(() => {
    document.documentElement.style.setProperty("--font-size", `${merged.fontSize}px`);
    document.documentElement.style.setProperty("--line-height", merged.lineHeight);
    document.documentElement.style.setProperty("--letter-spacing", `${merged.letterSpacing}px`);
    document.documentElement.style.setProperty("--content-width", `${merged.contentWidth}px`);
    document.documentElement.style.setProperty("--reader-font-family", fontStack(merged));
  });

  if (syncControls) {
    els.fontSize.value = merged.fontSize;
    els.lineHeight.value = merged.lineHeight;
    els.letterSpacing.value = merged.letterSpacing;
    els.contentWidth.value = merged.contentWidth;
    renderFontOptions(merged);
  }

  els.themeRow.querySelectorAll("button").forEach((button) => {
    button.classList.toggle("active", button.dataset.theme === merged.theme);
  });
  els.coverSizeRow.querySelectorAll("button").forEach((button) => {
    button.classList.toggle("active", button.dataset.size === merged.coverSize);
  });

  state.library.settings = merged;
}

function scheduleSettingsSave() {
  clearTimeout(state.settingsTimer);
  state.settingsTimer = setTimeout(async () => {
    state.library = await api.updateSettings(state.library.settings);
    applySettings(state.library.settings, false);
  }, 520);
}

function updateSettingsPreview(patch) {
  state.pendingSettingsPatch = { ...state.pendingSettingsPatch, ...patch };
  if (!state.settingsFrame) {
    state.settingsFrame = requestAnimationFrame(() => {
      state.settingsFrame = null;
      const nextSettings = { ...state.library.settings, ...state.pendingSettingsPatch };
      state.pendingSettingsPatch = {};
      const progress =
        els.readerPage.scrollTop / Math.max(1, els.readerPage.scrollHeight - els.readerPage.clientHeight);
      applySettings(nextSettings, false);
      resetSegmentHeights();
      state.renderedRange = { start: 0, end: -1 };
      requestAnimationFrame(() => {
        const maxScroll = Math.max(1, els.readerPage.scrollHeight - els.readerPage.clientHeight);
        els.readerPage.scrollTop = progress * maxScroll;
        renderVirtualWindow(findSegmentByScroll());
        refreshChapterMetrics();
      });
    });
  }
  scheduleChapterMetricsRefresh();
  scheduleSettingsSave();
}

function scheduleChapterMetricsRefresh() {
  clearTimeout(state.chapterMetricsTimer);
  state.chapterMetricsTimer = setTimeout(() => {
    requestAnimationFrame(() => {
      refreshChapterMetrics();
      renderVirtualWindow(findSegmentByScroll());
    });
  }, 140);
}

function buildSegments(lines, chapters) {
  const segments = [];

  if (chapters[0]?.lineIndex > 0) {
    segments.push({
      id: "intro",
      title: "正文开头",
      lineStart: 0,
      lineEnd: chapters[0].lineIndex,
      tocIndex: -1
    });
  }

  chapters.forEach((chapter, index) => {
    segments.push({
      id: chapter.id,
      title: chapter.title,
      lineStart: chapter.lineIndex,
      lineEnd: chapters[index + 1]?.lineIndex ?? lines.length,
      tocIndex: index
    });
  });

  if (segments.length === 0 && lines.length > 0) {
    segments.push({
      id: "chapter-0",
      title: "开始阅读",
      lineStart: 0,
      lineEnd: lines.length,
      tocIndex: -1
    });
  }

  return segments.filter((segment) => segment.lineEnd > segment.lineStart);
}

function estimateSegmentHeight(segment) {
  const settings = normalizeSettings(state.library.settings);
  const fontSize = Number(settings.fontSize) || 20;
  const lineHeight = fontSize * (Number(settings.lineHeight) || 1.85);
  const contentWidth = Number(settings.contentWidth) || 900;
  const letterSpacing = Number(settings.letterSpacing) || 0;
  const charWidth = Math.max(8, fontSize * 0.95 + letterSpacing);
  const charsPerLine = Math.max(12, Math.floor(contentWidth / charWidth));
  let visualRows = segment.tocIndex >= 0 ? 2.8 : 0.5;

  for (let index = segment.lineStart; index < segment.lineEnd; index += 1) {
    const lineLength = state.readerLines[index]?.trim().length || 1;
    visualRows += Math.max(1, Math.ceil(lineLength / charsPerLine));
  }

  return Math.max(lineHeight * 3, Math.ceil(visualRows * lineHeight));
}

function resetSegmentHeights() {
  state.segmentHeights = state.segments.map(estimateSegmentHeight);
}

function segmentTop(index) {
  let top = 0;
  for (let cursor = 0; cursor < index; cursor += 1) {
    top += state.segmentHeights[cursor] || 0;
  }
  return top;
}

function findSegmentByScroll(scrollTop = Math.max(0, els.readerPage.scrollTop - els.readerContent.offsetTop)) {
  let low = 0;
  let high = state.segmentHeights.length - 1;
  let active = 0;
  let accumulated = 0;
  const prefix = [];

  for (let index = 0; index < state.segmentHeights.length; index += 1) {
    prefix[index] = accumulated;
    accumulated += state.segmentHeights[index] || 0;
  }

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (prefix[mid] <= scrollTop) {
      active = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return clamp(active, 0, Math.max(0, state.segments.length - 1));
}

function refreshChapterMetrics() {
  state.chapterTops = state.chapters.map((chapter, chapterIndex) => {
    const segmentIndex = state.segments.findIndex((segment) => segment.tocIndex === chapterIndex);
    return segmentIndex >= 0 ? els.readerContent.offsetTop + segmentTop(segmentIndex) : 0;
  });
}

function updateVirtualSpacers() {
  const topSpacer = els.readerContent.querySelector(".virtual-spacer.top");
  const bottomSpacer = els.readerContent.querySelector(".virtual-spacer.bottom");
  if (!topSpacer || !bottomSpacer) return;

  topSpacer.style.height = `${segmentTop(state.renderedRange.start)}px`;
  const bottomStart = state.renderedRange.end + 1;
  const bottomHeight = Math.max(0, segmentTop(state.segmentHeights.length) - segmentTop(bottomStart));
  bottomSpacer.style.height = `${bottomHeight}px`;
}

function measureRenderedSegments() {
  let changed = false;
  els.readerContent.querySelectorAll(".reader-segment").forEach((section) => {
    const index = Number(section.dataset.segmentIndex);
    const measured = Math.ceil(section.getBoundingClientRect().height);
    if (Number.isFinite(index) && measured > 0 && Math.abs((state.segmentHeights[index] || 0) - measured) > 4) {
      state.segmentHeights[index] = measured;
      changed = true;
    }
  });

  if (changed) {
    updateVirtualSpacers();
    refreshChapterMetrics();
  }
}

function createSegmentNode(segment, segmentIndex) {
  const section = document.createElement("section");
  section.className = "reader-segment";
  section.dataset.segmentIndex = segmentIndex;
  if (segment.tocIndex >= 0) section.id = segment.id;

  for (let lineIndex = segment.lineStart; lineIndex < segment.lineEnd; lineIndex += 1) {
    const row = document.createElement("div");
    row.className = "reader-line";
    row.textContent = state.readerLines[lineIndex] || " ";

    if (lineIndex === segment.lineStart && segment.tocIndex >= 0) {
      row.classList.add("chapter-line");
      row.dataset.chapterIndex = segment.tocIndex;
    }

    section.appendChild(row);
  }

  return section;
}

function renderVirtualWindow(centerIndex = 0) {
  if (state.segments.length === 0) {
    els.readerContent.innerHTML = "";
    state.renderedRange = { start: 0, end: -1 };
    return;
  }

  const center = clamp(centerIndex, 0, state.segments.length - 1);
  const start = clamp(center - 1, 0, state.segments.length - 1);
  const end = clamp(center + 1, 0, state.segments.length - 1);
  if (state.renderedRange.start === start && state.renderedRange.end === end) {
    updateVirtualSpacers();
    return;
  }

  const fragment = document.createDocumentFragment();
  const topSpacer = document.createElement("div");
  topSpacer.className = "virtual-spacer top";
  topSpacer.style.height = `${segmentTop(start)}px`;
  fragment.appendChild(topSpacer);

  for (let index = start; index <= end; index += 1) {
    fragment.appendChild(createSegmentNode(state.segments[index], index));
  }

  const bottomSpacer = document.createElement("div");
  bottomSpacer.className = "virtual-spacer bottom";
  bottomSpacer.style.height = `${Math.max(0, segmentTop(state.segmentHeights.length) - segmentTop(end + 1))}px`;
  fragment.appendChild(bottomSpacer);

  state.renderedRange = { start, end };
  els.readerContent.replaceChildren(fragment);
  requestAnimationFrame(() => {
    measureRenderedSegments();
    updateActiveChapter();
  });
}

function renderBookshelf() {
  const { books } = state.library;
  els.bookGrid.innerHTML = "";
  els.emptyState.classList.toggle("hidden", books.length > 0);
  els.subtitle.textContent = books.length ? `${books.length} 本书在本地书架中` : "纯本地离线阅读";

  books.forEach((book, index) => {
    const card = document.createElement("article");
    card.className = "book-card";
    card.tabIndex = 0;
    card.setAttribute("role", "button");
    card.setAttribute("aria-label", `打开 ${book.title}`);
    card.style.animationDelay = `${Math.min(index * 42, 320)}ms`;
    card.innerHTML = `
      <div class="book-spine"></div>
      <h3>${escapeHtml(book.title)}</h3>
      <p title="${escapeHtml(book.excerpt || "")}">${escapeHtml(
        clampExcerpt(book.excerpt || "这本书还没有摘录，打开后从第一页开始阅读。")
      )}</p>
      <div class="card-footer">
        <span>${percent(book.progress)} · ${Math.max(1, Math.round(book.totalChars / 10000))} 万字</span>
        <button class="remove-book" title="移出书架" aria-label="移出书架">×</button>
      </div>
    `;

    card.addEventListener("click", () => openBook(book.id));
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openBook(book.id);
      }
    });
    card.querySelector(".remove-book").addEventListener("click", async (event) => {
      event.stopPropagation();
      if (!window.confirm(`从书架移出《${book.title}》？`)) return;
      state.library = await api.removeBook(book.id);
      applySettings(state.library.settings);
      renderBookshelf();
    });
    els.bookGrid.appendChild(card);
  });
}

function renderReaderText(text, chapters) {
  state.readerLines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  state.segments = buildSegments(state.readerLines, chapters);
  state.renderedRange = { start: 0, end: -1 };
  resetSegmentHeights();
  refreshChapterMetrics();
  renderVirtualWindow(0);
}

function renderToc(chapters) {
  els.tocList.innerHTML = "";
  els.tocCount.textContent = chapters.length;

  chapters.forEach((chapter, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "toc-item";
    button.dataset.index = index;
    button.title = chapter.title;
    button.textContent = chapter.title;
    button.addEventListener("click", () => jumpToChapter(index));
    els.tocList.appendChild(button);
  });
}

function setTocVisible(visible) {
  state.tocVisible = visible;
  els.readerView.classList.toggle("toc-open", visible);
  els.tocToggle.classList.toggle("active", visible);
}

function updateActiveChapter() {
  const top = els.readerPage.scrollTop + 120;
  let low = 0;
  let high = state.chapterTops.length - 1;
  let active = -1;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (state.chapterTops[mid] <= top) {
      active = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  if (active === state.activeChapter) return;
  state.activeChapter = active;
  els.tocList.querySelectorAll(".toc-item").forEach((item) => {
    item.classList.toggle("active", Number(item.dataset.index) === active);
  });
}

function updateReaderProgress(shouldSave = true) {
  const maxScroll = Math.max(1, els.readerPage.scrollHeight - els.readerPage.clientHeight);
  const progress = Math.min(1, Math.max(0, els.readerPage.scrollTop / maxScroll));
  els.topProgressBar.style.width = percent(progress);
  els.topProgressText.textContent = percent(progress);
  updateActiveChapter();

  if (!shouldSave || !state.currentBook) return;
  clearTimeout(state.saveTimer);
  state.saveTimer = setTimeout(async () => {
    state.library = await api.updateProgress({
      id: state.currentBook.id,
      position: els.readerPage.scrollTop,
      progress
    });
    const freshBook = state.library.books.find((book) => book.id === state.currentBook.id);
    if (freshBook) state.currentBook = freshBook;
  }, 360);
}

function onReaderScroll() {
  state.lastScrollTop = els.readerPage.scrollTop;

  if (state.scrollFrame) return;
  state.scrollFrame = requestAnimationFrame(() => {
    state.scrollFrame = null;
    const segmentIndex = findSegmentByScroll();
    if (
      segmentIndex <= state.renderedRange.start ||
      segmentIndex >= state.renderedRange.end ||
      segmentIndex < state.renderedRange.start ||
      segmentIndex > state.renderedRange.end
    ) {
      renderVirtualWindow(segmentIndex);
    }
    updateReaderProgress(true);
  });
}

function animateScrollTo(target) {
  const start = els.readerPage.scrollTop;
  const distance = target - start;
  const duration = clamp(Math.abs(distance) * 0.45, 520, 1250);
  const startTime = performance.now();

  function ease(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  function tick(now) {
    const elapsed = now - startTime;
    const t = Math.min(1, elapsed / duration);
    els.readerPage.scrollTop = start + distance * ease(t);
    if (t < 1) {
      requestAnimationFrame(tick);
    } else {
      updateReaderProgress(true);
    }
  }

  requestAnimationFrame(tick);
}

function jumpToChapter(index) {
  const segmentIndex = state.segments.findIndex((segment) => segment.tocIndex === index);
  if (segmentIndex < 0) return;
  renderVirtualWindow(segmentIndex);
  const targetTop = els.readerContent.offsetTop + segmentTop(segmentIndex) - 44;
  requestAnimationFrame(() => animateScrollTo(Math.max(0, targetTop)));
  scheduleChapterMetricsRefresh();
  setTocVisible(false);
}

function updateClock() {
  const now = new Date();
  const time = new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(now);
  const date = new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    weekday: "short"
  }).format(now);
  els.clockText.textContent = `${time} · ${date}`;
}

async function updateWeather() {
  try {
    const response = await fetch("https://wttr.in/?format=%C+%t", { cache: "no-store" });
    if (!response.ok) throw new Error("weather unavailable");
    const text = (await response.text()).replace(/\s+/g, " ").trim();
    if (!text || /<\s*!doctype|<\s*html|<\s*head|<\s*meta/i.test(text) || text.length > 48) {
      throw new Error("invalid weather payload");
    }
    els.weatherText.textContent = text || "天气暂不可用";
  } catch {
    els.weatherText.textContent = "天气暂不可用";
  }
}

function startReaderTelemetry() {
  updateClock();
  updateWeather();
  clearInterval(state.clockTimer);
  clearInterval(state.weatherTimer);
  state.clockTimer = setInterval(updateClock, 1000);
  state.weatherTimer = setInterval(updateWeather, 30 * 60 * 1000);
}

function stopReaderTelemetry() {
  clearInterval(state.clockTimer);
  clearInterval(state.weatherTimer);
  state.clockTimer = null;
  state.weatherTimer = null;
}

function showShelf() {
  clearTimeout(state.saveTimer);
  stopReaderTelemetry();
  state.currentBook = null;
  state.chapters = [];
  state.readerLines = [];
  state.segments = [];
  state.segmentHeights = [];
  state.chapterTops = [];
  state.renderedRange = { start: 0, end: -1 };
  els.readerContent.innerHTML = "";
  document.body.classList.remove("reader-mode");
  els.settingsPanel.classList.add("hidden");
  els.readerView.classList.add("hidden");
  els.bookshelfView.classList.remove("hidden");
  els.backButton.classList.add("hidden");
  els.settingsToggle.classList.add("hidden");
  els.tocToggle.classList.add("hidden");
  els.topReadout.classList.add("hidden");
  els.importButton.classList.remove("hidden");
  els.coverSizeRow.classList.remove("hidden");
  document.querySelector(".brand h1").textContent = "本地书架";
  els.subtitle.textContent = state.library.books.length ? `${state.library.books.length} 本书在本地书架中` : "纯本地离线阅读";
  renderBookshelf();
}

async function openBook(id) {
  const result = await api.readBook(id);
  state.currentBook = result.book;
  state.chapters = result.chapters || [];
  state.library.settings = result.settings;
  applySettings(result.settings);

  els.readerTitle.textContent = result.book.title;
  renderReaderText(result.text, state.chapters);
  renderToc(state.chapters);
  setTocVisible(false);
  state.activeChapter = -1;
  document.body.classList.add("reader-mode");
  startReaderTelemetry();

  els.bookshelfView.classList.add("hidden");
  els.readerView.classList.remove("hidden");
  els.backButton.classList.remove("hidden");
  els.settingsToggle.classList.remove("hidden");
  els.tocToggle.classList.remove("hidden");
  els.topReadout.classList.remove("hidden");
  els.importButton.classList.add("hidden");
  els.coverSizeRow.classList.add("hidden");
  document.querySelector(".brand h1").textContent = "";
  els.subtitle.textContent = "";

  requestAnimationFrame(() => {
    const savedPosition = result.book.lastPosition || 0;
    const segmentIndex = findSegmentByScroll(Math.max(0, savedPosition - els.readerContent.offsetTop));
    renderVirtualWindow(segmentIndex);
    requestAnimationFrame(() => {
      els.readerPage.scrollTop = savedPosition;
      state.lastScrollTop = els.readerPage.scrollTop;
      refreshChapterMetrics();
      updateReaderProgress(false);
    });
  });
}

async function importWithDialog() {
  const oldIds = new Set(state.library.books.map((book) => book.id));
  state.library = await api.importWithDialog();
  applySettings(state.library.settings);
  const freshBook = state.library.books.find((book) => !oldIds.has(book.id));
  if (freshBook) {
    await openBook(freshBook.id);
  } else {
    renderBookshelf();
  }
}

async function importDroppedFiles(files) {
  const paths = Array.from(files)
    .map((file) => api.getPathForFile(file))
    .filter(Boolean);
  const oldIds = new Set(state.library.books.map((book) => book.id));
  state.library = await api.importPaths(paths);
  applySettings(state.library.settings);
  const freshBook = state.library.books.find((book) => !oldIds.has(book.id));
  if (freshBook) {
    await openBook(freshBook.id);
  } else {
    renderBookshelf();
  }
}

function wireEvents() {
  els.importButton.addEventListener("click", importWithDialog);
  els.backButton.addEventListener("click", showShelf);
  els.settingsToggle.addEventListener("click", () => {
    els.settingsPanel.classList.toggle("hidden");
    if (!els.settingsPanel.classList.contains("hidden")) setTocVisible(false);
  });
  els.tocToggle.addEventListener("click", () => setTocVisible(!state.tocVisible));
  els.readerPage.addEventListener("scroll", onReaderScroll, { passive: true });
  els.readerPage.addEventListener("pointerdown", () => {
    setTocVisible(false);
    els.readerContent.classList.add("awakened");
  });
  els.readerPage.addEventListener("focusin", () => setTocVisible(false));

  ["dragenter", "dragover"].forEach((eventName) => {
    window.addEventListener(eventName, (event) => {
      event.preventDefault();
      els.dropPanel.classList.add("dragging");
    });
  });

  ["dragleave", "drop"].forEach((eventName) => {
    window.addEventListener(eventName, (event) => {
      event.preventDefault();
      if (eventName === "drop" && event.dataTransfer?.files?.length) {
        importDroppedFiles(event.dataTransfer.files);
      }
      els.dropPanel.classList.remove("dragging");
    });
  });

  els.fontSize.addEventListener("input", (event) => updateSettingsPreview({ fontSize: Number(event.target.value) }));
  els.lineHeight.addEventListener("input", (event) => updateSettingsPreview({ lineHeight: Number(event.target.value) }));
  els.letterSpacing.addEventListener("input", (event) =>
    updateSettingsPreview({ letterSpacing: Number(event.target.value) })
  );
  els.contentWidth.addEventListener("input", (event) =>
    updateSettingsPreview({ contentWidth: Number(event.target.value) })
  );
  els.fontSelect.addEventListener("change", (event) => updateSettingsPreview({ fontFamily: event.target.value }));
  els.themeRow.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-theme]");
    if (button) updateSettingsPreview({ theme: button.dataset.theme });
  });
  els.coverSizeRow.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-size]");
    if (button) updateSettingsPreview({ coverSize: button.dataset.size });
  });
}

async function boot() {
  wireEvents();
  state.library = await api.getLibrary();
  applySettings(state.library.settings);
  renderBookshelf();
}

boot();
