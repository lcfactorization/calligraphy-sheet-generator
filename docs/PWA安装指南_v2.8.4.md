# 字帖生成器 — PWA 安装指南 v2.8.4

> **应用名称**：字帖生成器（短名：字帖）
> **在线地址**：https://lcfactorization.github.io/calligraphy-sheet-generator/
> **GitHub 仓库**：https://github.com/lcfactorization/calligraphy-sheet-generator
> **PWA 显示模式**：standalone（无浏览器地址栏）
> **主题色**：#9E2A2B（朱砂红 / 印泥红）　**背景色**：#ffffff
> **PWA manifest**：`name='字帖生成器', short_name='字帖', display='standalone', theme_color='#9E2A2B'`
> **适用版本**：v2.8.1 - v2.8.4
> **生成日期**：2026-07-25
> **负责小组**：小组 E

---

## 一、扫码访问

### 1.1 PWA 安装二维码

扫描下方二维码即可在手机 / 平板上打开字帖生成器在线版（无需应用商店）：

#### 1.1.1 标准尺寸（240×240）

<p align="center">
  <img src="https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=https://lcfactorization.github.io/calligraphy-sheet-generator/&color=000000&bgcolor=ffffff&qzone=2" alt="字帖生成器 PWA 安装二维码（240×240）" width="240" height="240"/>
</p>

<p align="center"><em>▲ 240×240 标准尺寸二维码（URL：lcfactorization.github.io/calligraphy-sheet-generator/）</em></p>

#### 1.1.2 高清尺寸（480×480）

<p align="center">
  <img src="https://api.qrserver.com/v1/create-qr-code/?size=480x480&data=https://lcfactorization.github.io/calligraphy-sheet-generator/&color=000000&bgcolor=ffffff&qzone=2" alt="字帖生成器 PWA 安装二维码（480×480 高清）" width="480" height="480"/>
</p>

<p align="center"><em>▲ 480×480 高清尺寸二维码（适合打印或大屏展示）</em></p>

> [!TIP]
> - 手机系统自带相机扫一扫即可识别，识别后点击弹出的「在浏览器中打开」。
> - 如用微信扫码，请选择「在浏览器打开」——**微信内置浏览器不支持 PWA 安装**，必须跳出到系统浏览器。
> - 二维码由 `api.qrserver.com` 在线生成，URL 中包含完整的 GitHub Pages 链接，扫码后直接打开应用。

### 1.2 二维码 URL 直链

如需自行生成或嵌入网页，可直接使用以下 URL：

```
# 240×240 标准尺寸
https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=https://lcfactorization.github.io/calligraphy-sheet-generator/&color=000000&bgcolor=ffffff&qzone=2

# 480×480 高清尺寸
https://api.qrserver.com/v1/create-qr-code/?size=480x480&data=https://lcfactorization.github.io/calligraphy-sheet-generator/&color=000000&bgcolor=ffffff&qzone=2
```

### 1.3 手动输入访问地址

如无法扫码，请在浏览器地址栏直接输入：

```
https://lcfactorization.github.io/calligraphy-sheet-generator/
```

> [!NOTE]
> 推荐复制粘贴而非手输，URL 较长容易拼错。若打开后页面空白，请检查是否多 / 少了空格或字符。

---

## 二、各平台安装步骤

### 各平台差异速览表

| 平台 | 推荐浏览器 | 菜单入口 | 菜单项名称 | 图标位置 | 启动模式 |
| --- | --- | --- | --- | --- | --- |
| 华为 MatePad / HarmonyOS 4.0+ | 华为浏览器 / Chrome | 右下角 ⋮（三点） | **「添加到主屏幕」** 或 **「安装应用」** | 桌面最后一屏 | standalone（无地址栏） |
| Android 手机 | Chrome 90+ / Edge / Firefox | 右上角 ⋮（三点） | **「安装应用」** / **「添加到主屏幕」** | 主屏幕 / 应用抽屉 | standalone（无地址栏） |
| iOS 手机 / iPad | Safari 16.4+（必须 Safari） | 底部 △↑（分享） | **「添加到主屏幕」** | 主屏幕（最后页） | standalone（无地址栏） |
| Desktop Chrome（Windows / MacOS） | Chrome 90+ | 地址栏右侧 ⊕（安装图标） | **「安装」** | 开始菜单 / Launchpad | 独立窗口（无标签栏） |
| MacOS Safari | Safari 17.0+（macOS Sonoma 14+） | 菜单栏「文件」→「添加到 Dock」 | **「添加到 Dock」** | Dock 右侧分区 | 独立窗口 |

> [!WARNING]
> **iOS 仅支持 Safari 安装 PWA**，Chrome / Firefox / 微信等第三方浏览器在 iOS 上无法触发 PWA 安装菜单——这是 Apple 平台限制，并非应用 bug。

---

### 2.1 华为 MatePad / HarmonyOS 4.0+（华为浏览器 / Chrome）

> [!IMPORTANT]
> **HarmonyOS MatePad 是 v2.8.4 重点优化平台**
>
> v2.8.4 修复了 MatePad 上分页错误（14 行/页 → 11 行/页）、笔画 SVG 与拼音对齐、页眉页脚每页同步等问题。安装 PWA 后可获得最佳离线体验。

#### 步骤 1：扫码或访问 URL

- 用 MatePad 自带「相机」扫描上方二维码，识别后点击「在浏览器中打开」
- 或直接打开**华为浏览器**，在地址栏输入 `https://lcfactorization.github.io/calligraphy-sheet-generator/`

#### 步骤 2：打开浏览器菜单

- 在华为浏览器右下角点击 **⋮（三个竖排点）** 图标
- 弹出菜单自下而上滑出

#### 步骤 3：选择安装项

- 在菜单中找到并点击 **「添加到主屏幕」**（部分 HarmonyOS 版本显示为 **「安装应用」**）
- 弹出确认对话框，显示应用名「字帖生成器」和图标预览
- 点击 **「添加」** / **「确定」**

#### 步骤 4：确认图标位置

- 安装完成后，桌面最后一屏（或新屏）出现 **「字帖」** 图标（深红色背景 #9E2A2B，毛笔「字」字样）
- 可长按图标拖动到首屏以便快速访问

#### 步骤 5：HarmonyOS 特殊设置

> [!WARNING]
> **HarmonyOS 浏览器 PWA 安装特殊设置**
>
> HarmonyOS 浏览器对 PWA 支持有限，建议进行以下设置以确保 PWA 正常运行：
>
> 1. **允许存储权限**：
>    - 设置 → 应用 → 应用管理 → 华为浏览器 → 权限 → 存储 → 允许
>    - 或：设置 → 隐私 → 权限管理 → 存储 → 华为浏览器 → 允许
> 2. **关闭隐私模式**（如已开启）：
>    - 华为浏览器 → 设置 → 隐私设置 → 关闭「无痕浏览」
>    - 隐私模式下 Service Worker 无法注册，PWA 离线功能不可用
> 3. **允许后台运行**（可选，用于 PWA 自动更新）：
>    - 设置 → 应用 → 应用管理 → 华为浏览器 → 电池 → 允许后台运行
> 4. **清理浏览器缓存**（如已安装过旧版本）：
>    - 华为浏览器 → 设置 → 清理加速 → 清理缓存
>    - 重新访问 GitHub Pages 在线地址触发 Service Worker 重新注册
> 5. **建议改用 Chrome 浏览器**（如华为浏览器仍异常）：
>    - HarmonyOS 也支持 Chrome 浏览器，可从华为应用市场下载
>    - Chrome 对 PWA 支持更完善，安装步骤与 Android 一致

#### 步骤 6：启动验证

- 点击桌面「字帖」图标启动
- **预期**：直接进入字帖生成器主界面，**顶部无浏览器地址栏**，状态栏下方即应用内容
- 应用名「字帖生成器」短暂出现在启动画面（splash screen）
- 状态栏背景色为朱砂红 #9E2A2B

#### 步骤 7：卸载方法

- 长按桌面「字帖」图标 → 弹出菜单选择 **「卸载」** 或 **「移除」**
- 或：设置 → 应用 → 应用管理 → 找到「字帖生成器」 → 卸载

> [!TIP]
> HarmonyOS 4.0+ 的「智慧多窗」支持下拉悬停，安装后可在 MatePad 上将字帖生成器作为悬浮窗使用，方便边看字帖边临摹。

---

### 2.2 Android 手机（Chrome 90+ / Edge / Firefox）

#### 步骤 1：扫码或访问 URL

- 用系统相机扫描二维码 → 点击「用 Chrome 打开」（或默认浏览器）
- 或打开 Chrome，地址栏粘贴 `https://lcfactorization.github.io/calligraphy-sheet-generator/`

#### 步骤 2：打开浏览器菜单

- 在 Chrome 右上角点击 **⋮（三个竖排点）** 图标
- 菜单从底部滑出

#### 步骤 3：选择安装项

- 菜单中点击 **「安装应用」**（Chrome 90+）或 **「添加到主屏幕」**（旧版）
- 弹出安装确认弹窗，显示应用图标、名称「字帖生成器」、权限说明
- 点击 **「安装」** 按钮

#### 步骤 4：确认图标位置

- 安装完成，主屏幕出现「字帖」图标
- 同时在**应用抽屉**中也可找到（Settings → Apps 中显示为已安装应用）

#### 步骤 5：启动验证

- 从主屏或应用抽屉点击「字帖」图标启动
- **预期**：
  - 显示启动画面（应用名 + 图标，约 1-2 秒）
  - 进入主界面后**顶部无地址栏、无 Chrome 标签栏**
  - 主题色 #9E2A2B 显示在状态栏背景
  - 可从屏幕边缘滑动返回

#### 步骤 6：卸载方法

- 长按主屏「字帖」图标 → 拖至顶部「卸载」区域
- 或：设置 → 应用 → 字帖生成器 → 卸载
- 或：Play 商店 → 我的应用 → 卸载

> [!NOTE]
> **Edge 用户**：菜单在右下角（三点）；**Firefox 用户**：菜单在右下角（三点），菜单项名为「添加到主屏幕」。Firefox 不支持 standalone 启动画面，体验略逊于 Chrome。

---

### 2.3 iOS 手机 / iPad（Safari 16.4+，必须 Safari）

#### 步骤 1：扫码或访问 URL

- 用系统相机扫描二维码 → 点击「在 Safari 中打开」
- 或打开 **Safari**（蓝色指南针图标），地址栏粘贴 `https://lcfactorization.github.io/calligraphy-sheet-generator/`

> [!WARNING]
> **不要用 Chrome / Firefox / 微信内置浏览器**——iOS 上只有 Safari 能将 PWA 添加到主屏幕。微信扫码后请点击右上角 ⋯ → 「在 Safari 中打开」。

#### 步骤 2：打开分享菜单

- 在 Safari 底部工具栏点击 **△↑（向上箭头从方框中伸出）** 图标，即「分享」按钮
- 位置：Safari 底部中央偏右，紧邻标签页切换按钮
- 弹出分享面板（自下而上滑出）

#### 步骤 3：选择安装项

- 在分享面板第二行（「操作」区）找到并滚动选择 **「添加到主屏幕」**（图标为方块+加号）
- 如未看到，向左滑动第二行 → 点击 **「更多」** → 启用「添加到主屏幕」
- 弹出确认界面，可编辑图标名称（默认「字帖生成器」，建议改为「字帖」更省屏）
- 点击右上角 **「添加」**

#### 步骤 4：确认图标位置

- 主屏幕最后一页出现「字帖」图标
- 图标采用应用自定义图标（朱砂红 #9E2A2B 背景 + 毛笔「字」字样），非 Safari 截图

#### 步骤 5：启动验证

- 点击主屏「字帖」图标启动
- **预期**：
  - 显示启动画面（白色背景 + 中央「字帖生成器」文字 + 图标，约 1 秒）
  - 进入主界面后**顶部无 Safari 地址栏、无底部工具栏**
  - 整屏显示应用内容
  - 从屏幕顶部边缘下滑可呼出通知中心，从底部边缘上滑回主屏

#### 步骤 6：卸载方法

- 长按主屏「字帖」图标 → 图标抖动 → 点击左上角 **ⓧ（删除标记）** → 确认删除
- 或：设置 → 通用 → iPhone 储存空间 → 字帖生成器 → 删除 App

> [!TIP]
> iOS 16.4+ 已支持 PWA 推送通知和 Badge API，字帖生成器未来扩展「练习提醒」功能时可直接复用。

---

### 2.4 Desktop Chrome（Windows / MacOS）

#### 步骤 1：访问 URL

- 打开 Chrome（Windows 或 MacOS），地址栏输入 `https://lcfactorization.github.io/calligraphy-sheet-generator/`
- 等待页面完全加载（看右上角图标变化）

#### 步骤 2：找到安装入口

- **方式 A（推荐）**：在地址栏右侧（紧邻 ⭐ 收藏星标）找到 **⊕（加号在圆圈中）** 图标，即「安装应用」图标
- **方式 B**：点击浏览器右上角 **⋮（Chrome）** 菜单 → 找到 **「投放、保存和分享」** → 点击 **「将页面作为应用安装」**

> [!NOTE]
> 若地址栏右侧未显示 ⊕ 图标，说明 Service Worker 还在注册中，请刷新页面等待 3-5 秒后重试。

#### 步骤 3：确认安装

- 弹出安装对话框，显示应用名「字帖生成器」、图标、权限说明
- 点击 **「安装」** 按钮

#### 步骤 4：确认图标位置

- 安装后自动启动应用，弹出独立窗口
- **Windows**：「开始 → 所有应用 → 字帖生成器」
- **MacOS**：自动加入 **Launchpad（启动台）**，可在「应用程序」文件夹找到「字帖生成器.app」
- **桌面快捷方式**：可选创建（安装时勾选「创建桌面快捷方式」）
- **任务栏**：可右键任务栏图标 → 「固定到任务栏」

#### 步骤 5：启动验证

- 从开始菜单 / Launchpad / 桌面快捷方式启动
- **预期**：
  - 独立窗口打开（无浏览器标签栏、无地址栏）
  - 窗口标题栏显示「字帖生成器」
  - 窗口大小可独立调整、可最大化
  - 任务栏图标为应用专属图标（朱砂红「字」字样），而非浏览器图标

#### 步骤 6：卸载方法

- **方式 A**：开始菜单右键「字帖生成器」 → **「卸载」**
- **方式 B**：在应用窗口中点击右上角 **⋮ → 卸载**
- **方式 C**：设置 → 应用 → 已安装的应用 → 字帖生成器 → 卸载

---

### 2.5 MacOS Safari（macOS Sonoma 14+）

#### 步骤 1：访问 URL

- 打开 Safari（macOS Sonoma 14+），地址栏输入 `https://lcfactorization.github.io/calligraphy-sheet-generator/`

#### 步骤 2：找到安装入口

- 菜单栏点击 **「文件」 → 「添加到 Dock」**
- 或地址栏左侧出现 ⊕ 图标时直接点击

#### 步骤 3：确认安装

- 弹出安装对话框 → 点击 **「添加」** / **「安装」**

#### 步骤 4：确认图标位置

- 直接添加到 **Dock** 右侧分区（应用图标区）
- 也可在「应用程序」文件夹找到「字帖生成器.app」

#### 步骤 5：启动验证

- 从 Dock / Spotlight / Launchpad 启动
- **预期**：
  - 独立窗口打开，无浏览器标签栏和地址栏
  - 窗口标题栏显示「字帖生成器」
  - Dock 图标为应用专属朱砂红「字」字样
  - 支持 Spotlight 搜索「字帖」启动

#### 步骤 6：卸载方法

- 右键 Dock 图标 → 选项 → 从 Dock 移除
- 或访达 → 应用程序 → 字帖生成器 → 移至废纸篓

> [!TIP]
> macOS 上 Chrome / Edge / Safari 三种浏览器安装的 PWA 都以独立 `.app` 包形式存在，可设置开机自启动（系统设置 → 通用 → 登录项）。

---

## 三、PWA 验证清单

> [!NOTE]
> 安装完成后，请逐项验证以下功能点，全部通过方可判定 PWA 安装成功。

| # | 验证项 | 验证步骤 | 预期结果 | 状态 |
| --- | --- | --- | --- | --- |
| 1 | 安装后图标颜色正确（朱砂红 #9E2A2B） | 安装后查看桌面 / 主屏 | 出现「字帖」图标，深红色背景 #9E2A2B + 毛笔「字」字样，非浏览器默认图标 | ☐ |
| 2 | 启动画面正确 | 启动后观察首屏 | 显示 1-2 秒 splash screen，含「字帖生成器」名称与图标 | ☐ |
| 3 | 离线模式可用 | 安装 PWA 后首次在线访问一次（缓存资源）→ 断开网络 → 关闭应用 → 重新打开 | 应用可正常加载主界面，无「无法连接」提示，字帖生成功能正常 | ☐ |
| 4 | 字体缓存生效 | 离线状态下输入汉字生成字帖 | 字体正确显示，无方框乱码（Service Worker 已缓存字体文件到 `fonts-cache`） | ☐ |
| 5 | 启动后无浏览器地址栏 | 点击图标启动应用 | 顶部无地址栏、无标签栏，应用占满屏幕（standalone 模式） | ☐ |
| 6 | 主题色生效 | 观察状态栏 / 标题栏背景色 | 状态栏背景为朱砂红 #9E2A2B，与图标主色一致 | ☐ |
| 7 | 历史记录可保存 | 生成字帖 → 关闭应用 → 重新打开 → 查看「历史记录」 | 之前生成的字帖记录仍存在 | ☐ |
| 8 | PDF 导出可用 | 生成字帖 → 点击「导出 PDF」 | 成功下载 PDF 文件，内容与预览一致，矢量文字可选可复制 | ☐ |

> [!WARNING]
> 第 3 项「离线可访问」与第 4 项「字体缓存生效」是 PWA 的核心特征。若断网后无法启动或字体显示为方框，说明 Service Worker 未正确注册或字体缓存未完成——请回到在线环境刷新一次页面让 SW 完成缓存，再测试。

---

## 四、HarmonyOS 特殊说明

> [!IMPORTANT]
> **HarmonyOS MatePad 是 v2.8.4 重点优化平台，但仍存在 PWA 兼容性注意事项**
>
> HarmonyOS 浏览器对 PWA 支持有限，建议使用华为浏览器或 Chrome，并注意以下事项。

### 4.1 HarmonyOS 浏览器对 PWA 支持有限

- HarmonyOS 浏览器基于 Chromium 内核，但部分 PWA API（如 Badge API、Push API）支持不完整
- **建议优先使用华为浏览器 14.0.5.300+** 或从华为应用市场下载 Chrome 浏览器
- 如华为浏览器 PWA 安装失败，请改用 Chrome（安装步骤与 Android 一致）

### 4.2 Service Worker 需要 HTTPS 才能注册

> [!WARNING]
> **Service Worker 必须在 HTTPS 环境下注册**
>
> - GitHub Pages 默认提供 HTTPS（`https://lcfactorization.github.io/...`），满足此要求
> - 若使用本地 `http://localhost:3000` 测试，浏览器会破例允许 Service Worker 注册（localhost 是特例）
> - 如自建服务器部署，必须配置 HTTPS 证书（推荐 Let's Encrypt 免费证书）
> - HTTP 环境（非 localhost）下 PWA 完全不可用

### 4.3 离线缓存可能受系统清理影响

> [!NOTE]
> **HarmonyOS 系统清理策略对 PWA 缓存的影响**
>
> - HarmonyOS 系统的「手机管家」/「平板管家」可能在存储紧张时清理 PWA 缓存
> - 清理后离线访问可能失败，需要重新在线访问触发缓存重建
> - **建议定期打开应用刷新缓存**（每周至少一次，避免长期不访问导致缓存过期）
> - 如需长期离线使用，可在「手机管家 → 清理加速 → 白名单」中将华为浏览器加入白名单

### 4.4 HarmonyOS 网页转 PDF 兜底路径

> [!TIP]
> 即使 PWA 安装正常，HarmonyOS 浏览器打印 PDF 偶尔可能出现空白。此时可走以下兜底路径：
>
> | HarmonyOS 版本 | 浏览器版本 | 「网页转 PDF」入口路径 |
> |---|---|---|
> | HarmonyOS 6.0+ | 华为浏览器 6.1.1.300+ | 网页下方 **∷ > 保存 PDF**（或网页上方下载按钮） |
> | HarmonyOS 3.0 ~ 5.x | 华为浏览器 12.x ~ 13.x | 网页右下角 **∷（四个点）→ 更多 → WPS Office → 网页转 PDF → 确定 → 跳转 WPS → 保存到云文档 / 本地** |
> | HarmonyOS < 3.0 | 旧版浏览器 | 网页右下角 **更多 → 分享 → 更多 → 网页转 PDF → 选择保存位置 → 保存**（需登录 WPS 账号） |
> | 长截屏路径（通用） | 任意版本 | **音量下键 + 电源键 → 滚动截屏 → 图库 → 另存为 PDF** |

---

## 五、附录：版本与平台兼容性

### 5.1 浏览器最低版本要求

| 平台 | 浏览器 | 最低版本 | 备注 |
| --- | --- | --- | --- |
| HarmonyOS | 华为浏览器 | 14.0.5.300+ | 需 HarmonyOS 4.0+ |
| HarmonyOS | Chrome | 90+ | 可从华为应用市场下载 |
| Android | Chrome | 90+ | 推荐 Chrome 110+ |
| Android | Edge | 100+ | |
| Android | Firefox | 110+ | 不支持 standalone 启动画面 |
| iOS / iPadOS | Safari | 16.4+ | iOS 16.4 以下仅能添加网页快捷方式 |
| Windows | Chrome | 90+ | 推荐 Chrome 110+ |
| Windows | Edge | 100+ | 基于 Chromium，体验同 Chrome |
| macOS | Chrome | 90+ | |
| macOS | Edge | 100+ | |
| macOS | Safari | 17.0+ | macOS Sonoma 14+ 才支持「添加到 Dock」 |

### 5.2 PWA 核心配置（来自 vite.config.js）

| 配置项 | 值 | 说明 |
| --- | --- | --- |
| `name` | 字帖生成器 | 应用全名 |
| `short_name` | 字帖 | 主屏图标下方显示的短名（≤6 字符） |
| `display` | standalone | 启动模式：无浏览器地址栏 |
| `theme_color` | #9E2A2B | 状态栏 / 标题栏背景色（朱砂红） |
| `background_color` | #ffffff | 启动画面背景色（白） |
| `start_url` | ./ | 启动入口 |
| `registerType` | autoUpdate | Service Worker 自动更新 |
| `icons` | 192 / 512 / maskable | 三种规格图标（SVG 矢量） |

### 5.3 字体缓存策略

| 资源类型 | 缓存策略 | 有效期 | 缓存名 |
| --- | --- | --- | --- |
| 字体文件（woff / woff2 / ttf / otf） | CacheFirst | 1 年 | `fonts-cache` |
| JS / CSS / HTML / SVG | 预缓存 | 跟随版本 | `workbox-precache-v2` |

---

## 六、常见问题 FAQ

### Q1：扫码后微信打开无法安装怎么办？

**A**：微信内置浏览器（X5 内核）出于安全限制**不支持 PWA 安装**。解决步骤：

1. 在微信扫码后，点击右上角 **⋯（三个点）** 菜单
2. 选择 **「在浏览器打开」** 或 **「在 Safari 中打开」**（iOS）/ **「在浏览器中打开」**（Android）
3. 系统会自动跳转到默认浏览器（iOS → Safari，Android → 系统默认或 Chrome）
4. 在系统浏览器中再执行安装步骤

> [!TIP]
> 也可直接用系统相机扫码（非微信扫一扫），识别 URL 后会直接弹出「在浏览器中打开」，省去中间跳转步骤。

### Q2：iOS Safari 安装后图标颜色不对 / 显示为 Safari 截图？

**A**：可能原因与解决方案：

1. **未用 Safari 安装**：iOS 仅 Safari 支持 PWA 安装，Chrome / Firefox / 微信内置浏览器添加的只是网页快捷方式（图标为 Safari 截图）。请回到 Safari 重新执行「添加到主屏幕」。
2. **iOS 版本过低**：iOS 16.4 以下系统不支持完整 PWA 图标。请升级到 iOS 16.4+。
3. **manifest 加载失败**：在 Safari 中重新打开页面，等待完全加载后再点「添加到主屏幕」。
4. **缓存了旧版 manifest**：删除主屏旧图标 → Safari 设置 → 清除历史记录与网站数据 → 重新访问并安装。

### Q3：HarmonyOS 安装后启动仍有地址栏？

**A**：这通常意味着系统将其识别为「网页快捷方式」而非「PWA 应用」。检查清单：

- **HarmonyOS 版本**：需 HarmonyOS 4.0+ 才完整支持 PWA standalone 模式
- **浏览器版本**：华为浏览器需升级到 14.0.5.300+ 版本
- **manifest display 字段**：本项目 `display: 'standalone'` 已正确配置
- **解决方案**：删除桌面图标 → 华为浏览器中刷新页面 → 等待 5 秒 → 重新执行「添加到主屏幕」。若仍不行，改用 Chrome 安装（HarmonyOS 也支持 Chrome）。

### Q4：离线时字体显示不正常 / 显示为方框？

**A**：可能原因：

1. **首次访问未完成字体缓存**：字帖生成器需要预缓存中文字体文件。首次访问时请**保持在线直到页面完全加载完毕**（约 10-30 秒），让 Service Worker 完成字体缓存。
2. **Storage 配额不足**：iOS Safari 对 PWA 缓存配额较紧（约 50MB），如设备存储紧张可能清掉缓存。请清理 Safari 离线数据后重新在线访问。
3. **HarmonyOS 系统清理缓存**：如使用「手机管家」清理过存储，请重新在线访问触发缓存重建。
4. **解决方案**：在线状态下打开应用 → 等待 30 秒 → 关闭 → 断网 → 重新打开。字体应已缓存到 `fonts-cache` 中。

> [!TIP]
> 项目 vite.config.js 中已配置 `runtimeCaching` 对字体文件采用 `CacheFirst` 策略，缓存有效期 1 年，首次成功缓存后离线访问无虞。

### Q5：安装后如何更新到新版本？

**A**：本项目采用 `registerType: 'autoUpdate'` 策略：

1. **自动更新**：每次启动应用时，Service Worker 会自动检查更新（约 24 小时一次），有新版本时后台下载并在下次启动时生效。
2. **强制立即更新**：
   - 关闭应用 → 重新打开（触发 SW 检查）
   - 或：在应用中点击设置中心 → 查看「版本号」 → 若显示新版本号则已更新
3. **手动清除旧版本**（更新异常时）：
   - iOS：删除主屏图标 → Safari 清除历史记录与网站数据 → 重新访问安装
   - Android：设置 → 应用 → 字帖生成器 → 清除存储 → 重新打开应用
   - 桌面：卸载 → 重新安装

> [!WARNING]
> 若更新后功能异常，可能是旧版 Service Worker 残留。在浏览器（非 PWA 应用）中访问 `chrome://serviceworker-internals/`（Chrome）→ 找到字帖生成器 → 点击「Unregister」 → 重新加载页面。

---

## 七、紧急回退方案

> [!WARNING]
> 若评审现场 PWA 安装失败、设备不兼容，可使用以下回退方案保证演示不中断：

### 方案 A：直接浏览器访问（无需安装）

直接在任何浏览器中打开在线地址即可使用全部前端功能（除离线访问外，PWA 与浏览器版本功能完全一致）：

```
https://lcfactorization.github.io/calligraphy-sheet-generator/
```

### 方案 B：本地静态文件演示

1. 从 GitHub Releases 下载最新 `dist.zip`
2. 解压到本地任意目录
3. 用浏览器打开 `index.html`（无需服务器）

### 方案 C：本地开发服务器

```bash
git clone https://github.com/lcfactorization/calligraphy-sheet-generator.git
cd poem2pdf-distribution
npm install
npm run dev      # 启动开发服务器 http://localhost:3000
npm run build    # 构建生产版本到 dist/
npm run preview  # 预览构建产物
```

> [!TIP]
> 评审现场推荐同时准备方案 A（在线）+ 方案 B（离线 zip）双保险，网络异常时立即切换。

---

**文档维护**：小组 E　**最后更新**：2026-07-25　**版本**：v2.8.4
_配套文档：[飞书问卷提交数据_v2.8.4.md](./飞书问卷提交数据_v2.8.4.md) / [移动端功能测试清单_v2.8.4.md](./移动端功能测试清单_v2.8.4.md) / [复赛发布_v2.8.4.md](./复赛发布_v2.8.4.md)_
