# 字帖生成器 v2.8.5-hotfix PWA 安装指南

> 版本：v2.8.5-hotfix
> 更新日期：2026-07-25
> 在线地址：https://lcfactorization.github.io/calligraphy-sheet-generator/
> GitHub 仓库：https://github.com/lcfactorization/calligraphy-sheet-generator

---

## 一、PWA 在线访问

> [!NOTE]
> 字帖生成器已通过 PWA（Progressive Web App）标准认证，可像原生应用一样安装到桌面或主屏幕，支持离线使用。

### 在线访问二维码

![PWA 二维码](https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=https%3A%2F%2Flcfactorization.github.io%2Fcalligraphy-sheet-generator%2F)

扫码或点击下方链接进入应用：

**https://lcfactorization.github.io/calligraphy-sheet-generator/**

---

## 二、4 平台详细安装步骤

### 1. Android Chrome 安装步骤

1. 使用 Chrome 浏览器（版本 ≥ 90）打开 PWA 链接
2. 等待页面完全加载（Service Worker 注册成功）
3. 点击右上角「⋮」菜单按钮
4. 选择「添加到主屏幕」
5. 在弹窗中确认应用名称（默认「字帖生成器」），点击「安装」
6. 返回主屏幕，可见「字帖生成器」独立图标
7. 点击图标启动，无浏览器地址栏即为安装成功

### 2. Huawei MatePad HarmonyOS 安装步骤

1. 使用华为浏览器打开 PWA 链接
2. 等待页面完全加载
3. 点击地址栏右侧「⋮」菜单按钮
4. 选择「添加到」→「主屏幕」
5. 在弹窗中确认安装，点击「确定」
6. 返回桌面，可见「字帖生成器」图标
7. 点击图标启动，全屏运行即为安装成功

> [!NOTE]
> HarmonyOS 4.0+ 默认浏览器基于 Chromium 内核，PWA 安装流程与 Android Chrome 一致。

### 3. iOS Safari 安装步骤

1. 使用 Safari 浏览器（iOS 12+）打开 PWA 链接
2. 等待页面完全加载
3. 点击底部「分享」按钮（方框 + 向上箭头）
4. 在弹出的分享面板中向下滑动，选择「添加到主屏幕」
5. 在弹窗中确认应用名称，点击「添加」
6. 返回主屏幕，可见「字帖生成器」图标
7. 点击图标启动，无 Safari 顶部地址栏即为安装成功

> [!WARNING]
> iOS Safari 不支持 `window.print()` 直接调起系统打印，需通过「分享」→「打印」走 AirPrint 路径。v2.8.5-hotfix 已针对此路径优化打印样式表。

### 4. Desktop Chrome 安装步骤

1. 使用 Chrome 浏览器（版本 ≥ 90）打开 PWA 链接
2. 等待页面完全加载
3. 地址栏右侧出现安装图标（⊕ 或显示器+箭头）
4. 点击安装图标，在弹窗中点击「安装」
5. 应用在新窗口打开，无浏览器地址栏与标签栏
6. 桌面与开始菜单自动生成「字帖生成器」快捷方式
7. 后续可从开始菜单或桌面直接启动

---

## 三、PWA 验证清单

安装完成后，请逐项验证以下 10 项：

- [ ] 1. 桌面/主屏幕出现独立「字帖生成器」图标
- [ ] 2. 启动后无浏览器地址栏（standalone 模式）
- [ ] 3. 应用图标在任务栏/最近任务中显示正常
- [ ] 4. 应用启动时长 ≤ 2 秒
- [ ] 5. 关闭网络（飞行模式）后启动应用，页面正常加载
- [ ] 6. 离线状态下输入文本并生成字帖功能正常
- [ ] 7. 离线状态下打印 PDF 功能正常
- [ ] 8. 应用内切换字格类型、颜色预设响应正常
- [ ] 9. 应用关闭后再次启动，最近输入文本被恢复（localStorage 持久化）
- [ ] 10. Chrome DevTools → Application → Service Workers 显示已激活

---

## 四、故障排查

### 问题 1：扫码后未出现安装提示

> [!NOTE]
> 可能原因：浏览器版本过低 / 未通过 HTTPS 访问 / Service Worker 注册失败

排查步骤：
1. 确认浏览器版本（Chrome ≥ 90 / Safari ≥ 15 / 华为浏览器 ≥ 14）
2. 确认访问地址为 `https://` 开头
3. 打开 DevTools → Application → Service Workers，查看是否有报错
4. 清空浏览器缓存后重新访问
5. 手动通过菜单触发「添加到主屏幕」

### 问题 2：安装后启动仍显示地址栏

> [!IMPORTANT]
> 这表示 PWA 未以 standalone 模式启动。

排查步骤：
1. 确认通过「添加到主屏幕」安装，而非「添加书签」
2. 删除主屏幕图标，重新执行安装流程
3. 检查 `manifest.json` 中 `display` 字段是否为 `standalone`
4. Android Chrome 可通过 `chrome://flags/#enable-improved-pwa` 启用增强模式

### 问题 3：离线状态打开白屏

> [!WARNING]
> Service Worker 缓存未命中或缓存路径错误。

排查步骤：
1. 联网状态下首次访问需完整加载一次，确保 SW 缓存生成
2. DevTools → Application → Cache Storage 检查缓存条目数 ≥ 10
3. 清空所有缓存后重新联网访问一次，再测试离线
4. 若仍失败，升级浏览器版本后重试

### 问题 4：打印 PDF 时页眉页脚缺失

> [!NOTE]
> v2.8.5-hotfix 已通过真实 DOM 节点替代伪元素方案修复此问题。

排查步骤：
1. 确认应用版本为 v2.8.5-hotfix（页面底部可见版本号）
2. 若为旧版本，清空缓存后重新访问以加载最新 SW
3. DevTools → Application → Service Workers → Update 强制更新
4. 重新执行打印流程

### 问题 5：微信内置浏览器无法打印

> [!WARNING]
> 微信 X5 内核默认拦截 `window.print()`，v2.8.5-hotfix 通过 iframe 降级方案修复。

排查步骤：
1. 确认微信版本 ≥ 8.0.30
2. 点击「打印 PDF」按钮后等待 2-3 秒，观察是否调起系统打印
3. 若仍未调起，点击右上角「···」→「在浏览器中打开」，使用系统浏览器重试
4. 系统浏览器中按「Android Chrome 安装步骤」安装 PWA 后使用

---

> [!IMPORTANT]
> 本指南适用于 v2.8.5-hotfix 版本。如遇其他问题，请在 GitHub 仓库提交 Issue：https://github.com/lcfactorization/calligraphy-sheet-generator/issues
