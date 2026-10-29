# dsh-intelligent-ui

**让 DeepSeek Harness 的回答，按内容选择更好读、更好用的形式。**

[English](README.en.md) · [安装](#安装) · [试一试](#装好后先问这几个问题) · [常见问题](#常见问题) · [反馈问题](https://github.com/cpsGGG/dsh-intelligent-ui/issues/new/choose)

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Build and test](https://github.com/cpsGGG/dsh-intelligent-ui/actions/workflows/ci.yml/badge.svg)](https://github.com/cpsGGG/dsh-intelligent-ui/actions/workflows/ci.yml)
![Status: Beta](https://img.shields.io/badge/status-beta-orange.svg)

解释一个复杂过程，可能需要一张结构图；比较一组数字，可能需要一张柱状图；反复调整预算，可能需要可以直接操作的输入框。

IUI 把这些形式带进 **DSH 原来的回答位置**。你照常提问，模型按需要组合文字、表格、公式、图片和交互组件。**简单问题保持简洁，有必要才画图。**

![IUI 交互计算器与数据图组件示例](assets/readme/overview.png)

*上图使用项目实际组件和合成示例数据生成。组件预览使用演示 Markdown 适配器；在 DSH 中，正文与公式由宿主原生渲染。*

## 你会得到什么

| 场景 | 回答中的效果 |
| --- | --- |
| 理解机制、架构和分支依赖 | 自动布局的结构图、流程图、双图对比；节点可展开说明 |
| 比较数据、观察趋势 | 柱状图、折线图，附单位、来源和可查看的数据表 |
| 反复调整人数、预算或比例 | 数字输入、滑块、下拉选项，结果即时变化 |
| 阅读数学解释 | 正式排版的分式、求和、根号和上下标；结构节点也能显示公式 |
| 认识真实事物的外观 | Wikimedia Commons 照片，附来源、作者和许可 |
| 保存或分享图形 | 对话里直接复制图片；完整图形导出为 PNG |
| 整理行动与补充信息 | 可勾选清单、选项卡、折叠详情 |

正文仍是回答主体。无需复制长篇回答到另一个网页，也无需为每条消息选择模板。

## 安装

### 1. 确认 DSH 版本

首发版本为 **0.6.1 Beta**。主要实机验证环境是 **DSH 0.2.1-rc.3 桌面端 / Windows**；早期接口契约也在 `0.2.1-rc.2` 核查过。声明的宿主范围为 `>=0.2.1-rc.2 <0.3.0`，其他版本、操作系统和第三方插件组合仍需要更多测试。

需要已配置好模型的 DeepSeek Harness。IUI 不需要另外申请模型 API Key；正常聊天仍使用你在 DSH 中选择的模型及其计费方式。

### 2. 安装到正在使用的 Profile

如果 `dsh` 命令可用，在终端运行：

```sh
dsh plugin --profile desktop add "github:cpsGGG/dsh-intelligent-ui#v0.6.1"
```

这里的 `desktop` 是常见桌面 Profile 名。使用其他 Profile 时，请替换为实际名称。**仓库已附带 `lib/` 构建文件，普通安装不需要运行 `npm install` 或自己编译。**

有“添加插件来源”入口的客户端，也可以把下面的来源交给该入口：

```text
github:cpsGGG/dsh-intelligent-ui#v0.6.1
```

**Windows 提示“找不到 dsh”时：**使用当前 DSH 桌面安装自带的 CLI。下面是路径格式示例，请替换成自己的安装位置：

```powershell
& 'C:\path\to\DeepSeek Harness\resources\runtime\cli\bin\dsh.cmd' plugin --profile desktop add 'github:cpsGGG/dsh-intelligent-ui#v0.6.1'
```

优先使用当前桌面发行版自带的 CLI，避免全局 CLI 与桌面宿主版本不一致。安装机制可参考 [DSH 官方插件文档](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/publish.md)。

### 3. 回到对话，打开开关

1. 在 DSH 的插件管理中确认 `dsh-intelligent-ui` 已启用。
2. 打开一个对话，在输入框下方找到 **Intelligent UI** 开关。
3. 开关保持“开”，照常发问。

开关按对话保存，新对话默认开启。插件本身可以一直启用，你只需要在对话里切换。安装后没有入口时，先确认 Profile；若客户端提示需要重启，请等当前任务结束后正常退出并重开 DSH。

| 操作 | 影响 |
| --- | --- |
| 对话开关“开” | 当前对话后续请求可以生成 IUI 组件 |
| 对话开关“关” | 当前对话后续请求使用普通 Markdown；已有回答保留原样 |
| 在插件管理中停用插件 | 撤销 IUI 规则、工具和渲染器；已有组件可能显示为原始协议文字 |

## 装好后，先问这几个问题

直接复制下面任意一个问题到普通对话即可，不需要输入组件名。

**改数字，看结果：**

> 晚饭花了 268 元，现在有 4 个人，但人数可能增加。我想能直接调整人数，看看每人要付多少钱。

**看数据：**

> 我这周每天阅读 25、40、55、20、45 分钟。帮我分析变化，用合适的图表呈现，保留单位和原始数据。

**理解结构与公式：**

> 解释普通 Attention 和 Linear Attention 的区别。我想理解关键计算结构和公式，图只画必要的依赖关系。

**看真实照片：**

> 富士山是什么样的？给我看两张真实照片，附来源，简单说明外观特点。

**把步骤落到行动：**

> 我想做一个能给朋友试用的小产品。帮我列出第一次试用前的关键步骤和可勾选清单。

模型可能选择不同布局；明确要求图表、结构对比或可调输入，会更容易得到对应形式。简单问题只用文字、表格或公式回答，也是正确结果。

![深色主题下的实际结构图和数学节点组件示例](assets/readme/diagram-dark.png)

## 什么时候会自动出图

IUI 的实现由 **呈现规则 + 模型选择 + 组件校验与渲染** 组成：

1. 开关打开后，当前对话的模型请求带上[呈现规则](plugin/answer-style.md)。
2. 模型判断哪种形式能减少理解负担，生成普通 Markdown 和必要的结构化组件。
3. 插件识别完整、有效的组件，就地渲染。流式输出中的未完成组件显示占位，无法识别的内容保留原文。

属性比较优先表格，有可比数据时才画数据图，依赖关系难用短段落说清时才画结构图。一次简单算数通常直接给结果；需要反复调整输入时才用计算器。

没有固定触发词，也没有“每条回答必须画几张图”的要求。组件选择依赖模型遵循规则的能力，IUI 不保证每次都生成同一种形式。

## 复制图片与操作组件

- 普通图片右上角、IUI 图形上方有 **复制图片** 按钮。成功后可在支持图片的应用里按 `Ctrl+V`。
- 普通图片按读取到的原图像素复制；JPEG/WebP 等转换为 PNG。GIF 复制为静态图。
- 结构图、流程图和数据图复制为完整 PNG，包含公式、连线和说明；窄窗口中横向滚动的部分也包含在内。
- 调整计算器和滑块只在本机更新结果，不会额外请求模型或自动发送消息。
- 节点说明、清单与输入状态按会话、消息、组件隔离保存在本机。

## 常见问题

### 已经开了，为什么还是文字？

先确认开关打开后发出了一条新请求。历史回答不会被补画，也不会重新生成。简单问题允许纯文字；复杂问题可以明确说“用一张简洁结构图”或“让我能调整数字”。若显示的是 `iui-*` 原始代码，检查插件是否启用、客户端是否已经加载新版本。

### 侧栏 Intelligent UI 页面是做什么的？

那是组件示例，方便不消耗模型请求地试操作。日常使用在正常对话中进行。根目录早期网页原型也不订阅 DSH 对话，插件不需要启动这个网页服务。

### 能自动生成任何网页或应用吗？

当前支持限定组件：`iui-chart`、`iui-flow`、`iui-diagram`、`iui-compare`、`iui-interactive`、`iui-gallery`、`iui-tabs`、`iui-checklist` 和 `iui-details`。适合解释、比较和简单计算；尚不支持任意 HTML、游戏、地图或复杂仿真。计算器使用受限表达式解析器，不执行模型提供的 JavaScript。

### 图片是全网搜索或 AI 生成的吗？

当前额外提供的检索工具只搜索 **Wikimedia Commons**。它返回真实图片及归属信息，不需要搜索密钥。匹配质量取决于关键词与收录情况，当前没有额外的文生图能力。DSH 自带的图片和附件能力仍可正常使用。

### 为什么图片能显示，却复制失败？

外部站点可能允许显示图片，但不允许跨域读取像素。剪贴板权限、未加载完成或体积过大也可能导致失败。插件会给出提示，可打开来源页后复制；一次复制上限为 32 MiB 或 2400 万像素。

### 公式会不会被误当成代码？

新回答要求使用正式 TeX，交给 DSH 原生数学渲染。可明确识别的旧公式代码框会在显示时转换，真正的代码、用户要求的源码和歧义内容保留。查看原文和复制原文仍可取得原始回答。这不是任意 ASCII 数学的通用转换器。

### 兼容所有模型、主题和平台吗？

首发主要在 DSH 0.2.1-rc.3 / Windows 验证，原生问答使用过 DeepSeek-V4.1-Flash。其他模型需要能遵循组件协议；图片检索还需要工具调用能力。深浅主题已验证，第三方皮肤及其他渲染插件的组合仍需反馈。0.6.1 去掉了切换对话时多余的全局设置刷新；不承诺解决宿主或其他换肤插件的所有主题问题。

### 会增加费用或上传我的聊天吗？

模型仍由 DSH 调用，呈现规则会占用一定上下文，具体费用随模型而定。控件交互和 PNG 导出在本机完成。图片搜索会向 Wikimedia Commons 发送模型选择的检索词，展示图片时会请求对应图片主机。IUI 没有独立的聊天上传或遥测服务。请避免把私人信息放进公开图片检索词。

## 更新与卸载

在 [Releases](https://github.com/cpsGGG/dsh-intelligent-ui/releases) 查看新版本与安装指令，再安装对应标签。升级宿主规则或工具后，完成当前任务再正常重开 DSH，确保模块缓存更新。

卸载：

```sh
dsh plugin --profile desktop remove dsh-intelligent-ui
```

会话原文不会被删除。若只是想恢复某个对话的普通回答，关闭输入框旁的开关即可。

## 开发与贡献

使用 Node.js 22.12+ 或 24：

```sh
git clone https://github.com/cpsGGG/dsh-intelligent-ui.git
cd dsh-intelligent-ui
npm ci
npm run check
```

完整测试依赖已包含在项目中。`npm test` 会检查依赖并拒绝跳过测试；CI 覆盖 Linux / Windows 与 Node.js 22 / 24。首发前本机 87 项检查全部通过，0 跳过；原生 DSH 的验收范围见[集成说明](docs/dsh-integration.md)。

想在没有 DSH 会话的情况下试组件：

```sh
npm run demo
```

打开 <http://127.0.0.1:4173/assets/readme/demo.html>。这是相同组件的合成数据预览，不连接聊天、不请求模型。端口被占用时设置 `PORT` 为其他端口。

更多信息：[贡献指南](CONTRIBUTING.md) · [更新记录](CHANGELOG.md) · [宿主接口](docs/host-contract.md) · [图片工具](docs/image-tool-contract.md) · [问题反馈](https://github.com/cpsGGG/dsh-intelligent-ui/issues/new/choose)

## 许可与归属

本项目原创代码采用 [MIT License](LICENSE)。第三方依赖保留各自许可，完整文本与来源见 [THIRD-PARTY-NOTICES](lib/THIRD-PARTY-NOTICES.txt)。

这是面向 DeepSeek Harness 的社区插件，与 DeepSeek、OpenAI 均无官方关联。名称中的 Intelligent UI 描述的是本项目的呈现方式。
