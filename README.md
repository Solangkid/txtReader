# 本地 TXT 阅读器 Demo

这是一个面向 Windows 11 的纯本地离线 TXT 小说阅读器 Demo。它使用 Electron 构建，书籍、阅读进度和排版设置都保存在本机应用数据目录，不需要联网服务。

## 运行方式

```powershell
npm install
npm start
```

如果你的 PowerShell 里 `npm` 没有反应，可以直接使用本机 Node.js 目录里的 npm：

```powershell
& 'D:\Nodejs\npm.cmd' install
& 'D:\Nodejs\npm.cmd' start
```

## 当前 Demo 功能

- 首屏是书架，第一次打开为空。
- 支持右上角按钮打开 Windows 文件弹窗导入 TXT。
- 支持把 TXT 文件拖到窗口内导入。
- 点击书籍后进入阅读页，并恢复上次阅读位置。
- 阅读页支持字体大小、行距、字距、阅读宽度、主题调整。
- 阅读进度、书架和排版设置会自动本地保存。

## 本地数据

导入的 TXT 会复制到 Electron 的 `userData` 目录内，原文件不会被修改。这个 Demo 不上传、不同步、不连接任何云服务。
