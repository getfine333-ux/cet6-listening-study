# CET-6 Listening Study / 六级听力学习助手

一个离线优先的大学英语六级听力学习工具，收录 2016.12—2025.12 的 39
套听力资源，并提供音频播放、倍速、原文、在线答题、自动评分和本地学习进度。

## 功能

- 39 套听力音频与原文
- 0.75×、1×、1.25×、1.5× 播放速度
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
git clone <repository-url>
```

## 运行网页版

```bash
node web/build-data.mjs
python -m http.server 8765
```

然后访问 `http://localhost:8765/web/dist/`。

## 构建 Android 离线版

需要 JDK 17 和 Android SDK 35：

```powershell
node web/build-data.mjs
pwsh -File android/prepare-assets.ps1
cd android
./gradlew assembleDebug
```

生成的 APK 位于 `android/app/build/outputs/apk/debug/`。APK 会内置全部音频，体积约 900 MB。

## 已知资料缺口

- 2019 年 12 月第 3 套缺少题目文件，但音频和原文可用。
- 2022 年 6 月只有前 13 题包含标准答案；其余题目不参与自动评分。

## 许可证

- `web/`、`android/`：MIT License
- `resources/`：上游声明为 CC BY 4.0，详见第三方声明

本项目与全国大学英语四、六级考试委员会及资料来源站点无隶属或官方合作关系。
