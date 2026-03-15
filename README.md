# OpenList 媒体整理工具 (OpenList Scraper)

**OpenList Scraper** 是一款现代化的本地媒体文件整理与元数据刮削工具。它专为影视爱好者设计，能够自动扫描本地或远程 (OpenList) 目录，智能识别剧集信息，刮削 TMDB 元数据，并批量执行重命名、生成 NFO 和下载海报等操作。

![App Screenshot](public/app-screenshot.png)

## ✨ 主要功能

*   **智能识别**：结合正则表达式与 **LLM (大语言模型)** 技术，精准识别文件名中的剧集、季数和集数信息，轻松应对各种复杂命名。
*   **元数据刮削**：对接 **TMDB (The Movie Database)** API，自动获取高质量的剧集简介、评分、发行日期和演职员表。
*   **批量整理**：
    *   **标准化重命名**：一键将乱序文件重命名为标准格式（如 `Series Name - S01E01 - Title.mkv`）。
    *   **NFO 生成**：生成兼容 Kodi/Emby/Plex 的 `.nfo` 元数据文件。
    *   **图片下载**：自动下载高清海报 (Poster) 和单集剧照 (Thumb)。
*   **双模式支持**：
    *   **本地模式**：直接管理本机硬盘或 NAS 挂载路径下的视频文件。
    *   **OpenList 模式**：支持连接 OpenList 服务器进行远程文件管理（需配置服务器 URL 和 Token）。
*   **现代化 UI**：基于 React + Tailwind CSS 构建的精美界面，支持 **深色模式 (Dark Mode)** 切换，提供网格与列表两种视图。
*   **灵活配置**：支持自定义正则匹配规则，可配置 OpenAI 兼容接口（如 LocalAI, Ollama）以降低识别成本。
*   **详细的日志系统**：内置活动日志面板，支持点击复制、折叠长日志（如 JSON 数据）、关键字高亮与多级日志过滤（Debug/Info/Error），方便排查元数据匹配问题。
*   **应用内更新**：安装版会在启动后静默检查 GitHub Releases，也支持点击标题栏版本号手动检查、下载并重启安装新版本。

## 🛠️ 技术栈

本项目基于以下前沿技术构建：

*   **框架核心**: [Electron](https://www.electronjs.org/) + [React](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/)
*   **构建工具**: [Vite](https://vitejs.dev/)
*   **样式方案**: [Tailwind CSS v4](https://tailwindcss.com/)
*   **图标库**: [Lucide React](https://lucide.dev/)
*   **状态管理**: [Zustand](https://github.com/pmndrs/zustand)
*   **数据存储**: [Electron Store](https://github.com/sindresorhus/electron-store) (本地配置) + Better-SQLite3 (媒体库缓存)

## 🚀 快速开始

### 开发环境搭建

1.  **克隆仓库**
    ```bash
    git clone https://github.com/your-username/openlist-scraper.git
    cd openlist-scraper
    ```

2.  **安装依赖**
    本仓库统一使用 `pnpm`。
    ```bash
    pnpm install
    ```
    安装完成后会自动执行 Electron 原生依赖重建，确保 `better-sqlite3` 对齐当前 Electron 版本。

3.  **启动开发模式**
    同时启动 Vite 开发服务器和 Electron 主进程。
    ```bash
    pnpm dev
    ```

### Windows 本地开发恢复

如果在 Windows 上运行 `pnpm dev` 时看到 `Could not locate the bindings file` 或其他 `better-sqlite3` native binding 错误，请在仓库根目录执行：

```bash
pnpm run rebuild:native
```

也可以使用 `npm run rebuild:native`。重建完成后重新启动开发环境即可。

### 打包发布

构建生产环境安装包：

```bash
pnpm build
```
打包后的文件将位于 `release/<version>/` 目录中。

当前仓库的 `electron-builder` 配置里已经预留了 Windows、macOS、Linux 的 target，但目前仓库内实际验证和发布流程仅覆盖 Windows。macOS / Linux 如需对外宣称支持，建议先分别完成对应平台的本地验证、安装器验证和 CI 发布链路。

发布前的安装器回归检查请参考 [docs/installer-qa-checklist.md](docs/installer-qa-checklist.md)。

### GitHub Actions 自动发布

仓库内置了 GitHub Actions 工作流 [`.github/workflows/release-build.yml`](.github/workflows/release-build.yml)，用于在 GitHub Release 发布后自动构建并上传 Windows 安装包。

当前行为如下：

1.  发布一个已发布状态的 GitHub Release。
2.  Release 的 Tag 必须与 `package.json` 版本一致，例如 `v1.3.1` 对应 `"version": "1.3.1"`。
3.  工作流会在 `windows-latest` 上执行 `pnpm install --frozen-lockfile` 和 `pnpm run build -- --win --publish never`。
4.  构建完成后，工作流会执行一次最小自动验证：静默安装安装包、检查 `OpenListScraper.exe` 是否落盘，并尝试启动已安装应用做冒烟测试。
5.  自动验证通过后，工作流会把以下文件上传到对应的 GitHub Release：
    *   `OpenListScraper-Windows-<version>-Setup.exe`
    *   `OpenListScraper-Windows-<version>-Setup.exe.blockmap`
    *   `latest.yml`

当前自动化不要求额外的 GitHub Secret，上传资产使用 Actions 内置的 `GITHUB_TOKEN` 即可。

注意事项：

*   目前工作流只自动构建 Windows 安装包，后续如需扩展 macOS/Linux，可在此工作流基础上增加矩阵构建。
*   当前发布产物仍为未签名安装包；如果后续接入代码签名，需要额外配置如 `CSC_LINK`、`CSC_KEY_PASSWORD` 等 Secret。
*   如果 Release Tag 与 `package.json` 版本不一致，工作流会直接失败，避免把错误版本的资产上传到 Release。
*   当前自动验证只覆盖“能安装并至少成功启动”的基础冒烟测试，不能替代 [docs/installer-qa-checklist.md](docs/installer-qa-checklist.md) 中的完整人工安装器回归。

### 自动更新发布要求

应用内更新依赖 `electron-updater` 和 GitHub Releases。发布新版本时请确保：

1.  GitHub Release 的 Tag 与 `package.json` 版本一致，例如 `v1.3.0`。
2.  上传 `release/<version>/` 中的以下文件：
    *   `OpenListScraper-Windows-<version>-Setup.exe`
    *   `OpenListScraper-Windows-<version>-Setup.exe.blockmap`
    *   `latest.yml`
3.  Release 保持为已发布状态，避免仅停留在 Draft。
4.  安装版应用启动后会自动检查更新；开发模式下不会启用自动更新。

`latest.yml` 和 `.blockmap` 由 `electron-builder` 在打包时生成，Windows NSIS 安装包会优先使用这些元数据执行差分下载。

项目会在打包前自动从 `public/app-icon.png` 生成 `build/icon.ico` 和 `build/icon.png`，用于 Windows 安装包和应用图标资源。

## ⚙️ 配置指南

首次启动软件后，请点击右上角的 **设置 (Settings)** 图标进行初始化配置：

1.  **元数据源 (Metadata Provider)**：
    *   输入您的 **TMDB API Read Access Token**。您可以在 [TMDB 官网](https://www.themoviedb.org/settings/api) 免费申请。
2.  **LLM 模型 (可选)**：
    *   为了获得最佳的文件名识别体验，建议配置 OpenAI 兼容接口（如 `https://api.openai.com/v1` 或本地 Ollama 地址 `http://localhost:11434/v1`）。
    *   输入 API Key 和模型名称（如 `gpt-3.5-turbo` 或 `llama3`）。
3.  **媒体库 (Media Library)**：
    *   选择 **本地 (Local)** 并指定您的视频文件夹路径。
    *   或者配置 OpenList 服务器信息。
4.  **调试 (Debugging)**：
    *   在 **通用 (General)** 设置中，您可以调整日志级别。设置为 **Debug** 可以查看详细的 API 请求参数、LLM Prompt 和原始 JSON 响应，便于排查扫描失败的原因。

## 📝 使用说明

1.  **浏览文件**：在主界面浏览您的视频目录。
2.  **选择文件**：
    *   点击文件卡片左侧的复选框进行多选。
    *   或点击顶部的 **"全选"** 按钮。
3.  **开始匹配**：
    *   点击工具栏右侧的 **"匹配选中 (Match)"** 按钮。
    *   系统将自动分析文件名，并弹窗让您确认匹配到的剧集信息。
4.  **执行整理**：
    *   确认无误后，勾选需要的操作（重命名、NFO、海报、剧照）。
    *   点击 **"执行"**，稍等片刻即可完成整理！

## 📄 许可证

本项目采用 MIT 许可证。详见 LICENSE 文件。

---
© 2025 Landon Li
