# CET-6 Listening Study / 六级听力学习助手

一个离线优先的大学英语六级听力学习工具，收录 2016.12—2025.12 的 39
套听力资源，并提供逐句精听、中英对照、在线答题、自动评分和本地学习进度。

当前版本：**v1.1.0**。完整变化见 [CHANGELOG.md](CHANGELOG.md)。

## 功能

- 39 套听力音频与原文
- 0.75×、1×、1.25×、1.5× 播放速度
- 6081 条逐句学习单元与中文机器翻译
- 点击句子定位播放、播放位置实时高亮
- 单句/全文译文显隐与精听遮挡
- 逐题作答、自动保存、提交评分与错题标记
- 桌面浏览器与移动端响应式界面
- Android 独立离线应用源码
- 所有学习记录仅保存在设备本地

## 资料说明

学习资料来自 [Ysoseri1224/CET-6-Listening-10-Years-Resources-and-Analysis](https://github.com/Ysoseri1224/CET-6-Listening-10-Years-Resources-and-Analysis)，归档版本见 [Zenodo DOI 10.5281/zenodo.20474009](https://doi.org/10.5281/zenodo.20474009)。上游将资源文件声明为 CC BY 4.0。本项目未转载采用 CC BY-NC-ND 4.0 的上游分析文章。

完整的来源、许可边界与权利说明见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

## 获取仓库

音频使用 Git LFS 管理。请先安装 Git LFS，再克隆：

```bash
git lfs install
git clone https://github.com/getfine333-ux/cet6-listening-study.git
```

## 运行网页版

需要 Node.js 18 或更高版本。生成数据后，在仓库根目录启动静态服务器：

```bash
node web/build-data.mjs
python -m http.server 8765
```

然后访问 `http://localhost:8765/web/dist/`。

仓库已包含生成好的 `web/dist/data.js`，普通使用无需重新执行数据生成。

## 构建 Android 离线版

需要 JDK 17 和 Android SDK 35：

```powershell
node web/build-data.mjs
pwsh -File android/prepare-assets.ps1
cd android
./gradlew assembleDebug
```

生成的 APK 位于 `android/app/build/outputs/apk/debug/`。APK 会内置全部音频，体积约 900 MB。

## 重新生成逐句数据（可选）

仓库包含已经审核过的时间轴和机器翻译缓存。只有维护数据时才需要运行以下工具：

```bash
node web/build-data.mjs
python -m pip install -r web/requirements-align.txt
python web/align.py
node web/translate-data.mjs
node web/build-data.mjs
```

语音对齐会下载 Whisper 模型并消耗较多 CPU 时间；翻译脚本会请求第三方在线翻译服务，请先阅读脚本并确认服务条款。运行生成器产生的 `web/data/sentences.json` 是可再生的中间文件，已由 `.gitignore` 排除。

## 已知资料缺口

- 2019 年 12 月第 3 套缺少题目文件，但音频和原文可用。
- 2022 年 6 月只有前 13 题包含标准答案；其余题目不参与自动评分。
- 2016 年 12 月第 1/2 套、2017 年 6 月第 1/2 套的上游音频与原文内容不匹配，应用会显示警告并使用近似定位。
- 中文译文由机器生成，仅供理解辅助，不应视为权威译文。

## 许可证

- `web/`、`android/`：MIT License
- `resources/`：上游声明为 CC BY 4.0，详见第三方声明

本项目与全国大学英语四、六级考试委员会及资料来源站点无隶属或官方合作关系。
