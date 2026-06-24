const { app, BrowserWindow, dialog, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs/promises");
const crypto = require("crypto");
const { pathToFileURL } = require("url");
const iconv = require("iconv-lite");

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

function getPaths() {
  const root = app.getPath("userData");
  return {
    root,
    booksDir: path.join(root, "books"),
    fontsDir: path.join(root, "fonts"),
    libraryFile: path.join(root, "library.json")
  };
}

async function ensureStorage() {
  const { booksDir, fontsDir, libraryFile } = getPaths();
  await fs.mkdir(booksDir, { recursive: true });
  await fs.mkdir(fontsDir, { recursive: true });
  try {
    await fs.access(libraryFile);
  } catch {
    await fs.writeFile(
      libraryFile,
      JSON.stringify({ books: [], settings: DEFAULT_SETTINGS }, null, 2),
      "utf8"
    );
  }
}

async function readLibrary() {
  await ensureStorage();
  const { libraryFile } = getPaths();
  try {
    const raw = await fs.readFile(libraryFile, "utf8");
    const data = JSON.parse(raw);
    return {
      books: Array.isArray(data.books) ? data.books : [],
      settings: normalizeSettings(data.settings)
    };
  } catch {
    return { books: [], settings: normalizeSettings() };
  }
}

async function writeLibrary(library) {
  const { libraryFile } = getPaths();
  await fs.writeFile(libraryFile, JSON.stringify(library, null, 2), "utf8");
}

function decodeTxt(buffer) {
  const utf8 = buffer.toString("utf8").replace(/^\uFEFF/, "");
  const suspiciousChars = (utf8.match(/\uFFFD/g) || []).length;
  if (suspiciousChars / Math.max(utf8.length, 1) < 0.01) {
    return { text: utf8, encoding: "utf8" };
  }

  const gbText = iconv.decode(buffer, "gb18030").replace(/^\uFEFF/, "");
  return { text: gbText, encoding: "gb18030" };
}

function makeBookTitle(filePath) {
  return path.basename(filePath, path.extname(filePath)).trim() || "未命名书籍";
}

function makeExcerpt(text) {
  const excerpt = text
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 3)
    .join(" ");

  if (excerpt.length <= 96) return excerpt;
  return `${excerpt.slice(0, 96).trimEnd()}...`;
}

function normalizeSettings(settings = {}) {
  return {
    ...DEFAULT_SETTINGS,
    ...settings,
    customFonts: Array.isArray(settings.customFonts) ? settings.customFonts : []
  };
}

function publicFont(font) {
  if (!font?.storedPath) return null;
  return {
    id: font.id,
    name: font.name,
    fileName: font.fileName,
    url: pathToFileURL(font.storedPath).toString()
  };
}

function publicLibrary(library) {
  const settings = normalizeSettings(library.settings);
  return {
    settings: {
      ...settings,
      customFonts: settings.customFonts.map(publicFont).filter(Boolean)
    },
    books: library.books.map(({ storedPath, ...book }) => book)
  };
}

function extractChapters(text) {
  const chapters = [];
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  let offset = 0;
  const chapterPattern =
    /^\s*((?:第[0-9０-９一二三四五六七八九十百千万两〇零壹贰叁肆伍陆柒捌玖拾佰仟]+[章节卷回部集篇])|序章|楔子|番外(?:[0-9０-９一二三四五六七八九十百千万两〇零]*)?|后记)(?:[\s:：、.-]*(.{0,42}))?\s*$/;

  lines.forEach((line, lineIndex) => {
    const trimmed = line.trim();
    if (trimmed.match(chapterPattern)) {
      chapters.push({
        id: `chapter-${chapters.length}`,
        title: trimmed.slice(0, 64),
        lineIndex,
        offset
      });
    }
    offset += line.length + 1;
  });

  if (chapters.length === 0 && text.trim()) {
    chapters.push({
      id: "chapter-0",
      title: "开始阅读",
      lineIndex: 0,
      offset: 0
    });
  }

  return chapters;
}

async function importTxtFiles(filePaths) {
  const txtPaths = [...new Set(filePaths)]
    .filter(Boolean)
    .filter((filePath) => path.extname(filePath).toLowerCase() === ".txt");

  if (txtPaths.length === 0) {
    return publicLibrary(await readLibrary());
  }

  const library = await readLibrary();
  const { booksDir } = getPaths();

  for (const sourcePath of txtPaths) {
    const buffer = await fs.readFile(sourcePath);
    const { text, encoding } = decodeTxt(buffer);
    const id = crypto.randomUUID();
    const storedPath = path.join(booksDir, `${id}.txt`);
    await fs.copyFile(sourcePath, storedPath);

    library.books.unshift({
      id,
      title: makeBookTitle(sourcePath),
      originalPath: sourcePath,
      storedPath,
      addedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      totalChars: text.length,
      excerpt: makeExcerpt(text),
      encoding,
      lastPosition: 0,
      progress: 0
    });
  }

  await writeLibrary(library);
  return publicLibrary(library);
}

async function createWindow() {
  const win = new BrowserWindow({
    width: 1240,
    height: 840,
    minWidth: 940,
    minHeight: 650,
    title: "本地 TXT 阅读器",
    backgroundColor: "#f3efe6",
    titleBarStyle: "hidden",
    titleBarOverlay: {
      color: "#f3efe6",
      symbolColor: "#3d3427",
      height: 42
    },
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  await win.loadFile(path.join(__dirname, "renderer", "index.html"));
}

app.whenReady().then(async () => {
  await ensureStorage();
  await createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

ipcMain.handle("library:get", async () => publicLibrary(await readLibrary()));

ipcMain.handle("books:importDialog", async () => {
  const result = await dialog.showOpenDialog({
    title: "导入本地 TXT 小说",
    properties: ["openFile", "multiSelections"],
    filters: [{ name: "TXT 小说", extensions: ["txt"] }]
  });

  if (result.canceled) {
    return publicLibrary(await readLibrary());
  }
  return importTxtFiles(result.filePaths);
});

ipcMain.handle("books:importPaths", async (_event, filePaths) => {
  return importTxtFiles(Array.isArray(filePaths) ? filePaths : []);
});

ipcMain.handle("books:read", async (_event, id) => {
  const library = await readLibrary();
  const book = library.books.find((item) => item.id === id);
  if (!book) {
    throw new Error("书籍不存在");
  }

  const buffer = await fs.readFile(book.storedPath);
  const { text } = decodeTxt(buffer);
  const publicData = publicLibrary({ books: [book], settings: library.settings });
  return {
    book: publicData.books[0],
    text,
    chapters: extractChapters(text),
    settings: publicData.settings
  };
});

ipcMain.handle("books:updateProgress", async (_event, payload) => {
  const library = await readLibrary();
  const book = library.books.find((item) => item.id === payload.id);
  if (!book) return publicLibrary(library);

  book.lastPosition = Math.max(0, Math.round(Number(payload.position) || 0));
  book.progress = Math.min(1, Math.max(0, Number(payload.progress) || 0));
  book.updatedAt = new Date().toISOString();
  await writeLibrary(library);
  return publicLibrary(library);
});

ipcMain.handle("settings:update", async (_event, settings) => {
  const library = await readLibrary();
  library.settings = normalizeSettings({
    ...library.settings,
    ...settings,
    customFonts: library.settings.customFonts
  });
  await writeLibrary(library);
  return publicLibrary(library);
});

ipcMain.handle("fonts:importDialog", async () => {
  const result = await dialog.showOpenDialog({
    title: "导入本地字体",
    properties: ["openFile"],
    filters: [{ name: "字体文件", extensions: ["ttf", "otf", "woff", "woff2"] }]
  });

  if (result.canceled || !result.filePaths[0]) {
    return publicLibrary(await readLibrary());
  }

  const sourcePath = result.filePaths[0];
  const extension = path.extname(sourcePath).toLowerCase();
  const id = crypto.randomUUID();
  const fileName = `${id}${extension}`;
  const { fontsDir } = getPaths();
  const storedPath = path.join(fontsDir, fileName);
  await fs.copyFile(sourcePath, storedPath);

  const library = await readLibrary();
  const font = {
    id,
    name: path.basename(sourcePath, extension).trim() || "本地字体",
    fileName,
    storedPath
  };

  library.settings = normalizeSettings(library.settings);
  library.settings.customFonts = [font, ...library.settings.customFonts];
  library.settings.fontFamily = id;
  await writeLibrary(library);
  return publicLibrary(library);
});

ipcMain.handle("books:remove", async (_event, id) => {
  const library = await readLibrary();
  const target = library.books.find((book) => book.id === id);
  library.books = library.books.filter((book) => book.id !== id);
  if (target?.storedPath) {
    await fs.rm(target.storedPath, { force: true });
  }
  await writeLibrary(library);
  return publicLibrary(library);
});
