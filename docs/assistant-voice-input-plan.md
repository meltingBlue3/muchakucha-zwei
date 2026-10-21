# AI 助手语音输入方案

状态：云端转写已实现，浏览器端已用真实百炼验收；App 真机录音待验收。更新日期：2026-10-22。

## 结论

语音输入采用「录音 → 本应用 API → 阿里云百炼 Qwen-ASR → 文字追加到草稿 → 用户检查后手动发送」。三端共用一条路径，不使用手机或浏览器自带的语音识别。

首版（`archive/voice-system-recognition` 分支）曾用 `expo-speech-recognition` 调用系统识别。家里有国产 Android 手机，这类手机常常没有标准 `SpeechRecognizer` 可用的识别服务，或者只有连不上的 Google 服务：麦克风要么不出现，要么每次都报网络错误。所以改用云端转写，换来的代价是说话时没有逐字预览。

## 配置与费用

转写服务是模型配置的一种「用途」。添加配置时选择 **用途 → 语音转写**，协议固定为 `qwen-asr`，地址默认 `https://dashscope.aliyuncs.com/compatible-mode/v1`，模型默认 `qwen3-asr-flash`。

- 沿用模型配置的加密存储、家庭共享、测试连接和本月用量统计；谁创建配置，谁付费。生产环境不需要新增环境变量。
- 协议决定用途：转写配置不能创建对话，对话配置也不接收音频（`ASSISTANT_PROVIDER_PURPOSE_MISMATCH`）；用途在创建后不能更改。数据库约束 `assistant_providers_protocol_check` 随迁移 `20261022000000_assistant_transcription_protocol` 扩展。
- 客户端优先使用自己的转写配置，没有时使用家人共享的。家庭里没有可用的转写配置时不显示麦克风。
- 测试连接会转写一秒 16 kHz 静音，不发送录音或家庭数据。
- 价格参考：北京地域 0.00022 元/秒，一条 10 秒的语音约 0.2 分钱（[模型说明](https://help.aliyun.com/zh/model-studio/qwen3-asr-flash)）。以百炼控制台为准。

## 接口

`POST /api/v1/households/:householdId/assistant/transcriptions`，请求体 `{ providerId, mimeType, audio }`，返回 `{ text }`。

- `audio` 是不带 `data:` 前缀的 base64，最长 880,000 字符（约 640 KiB），放得进 Fastify 默认 1 MiB 的请求体，不需要 multipart 依赖。客户端按 16 kHz 单声道、32 kbit/s 录音，一分钟约 240 KB。
- `mimeType` 限 `audio/mp4`、`audio/aac`、`audio/webm`、`audio/ogg`、`audio/wav`、`audio/mpeg`。手机录 M4A（AAC），Chrome 录 WebM Opus，Safari 录 MP4。
- 服务端以 OpenAI 兼容的 `chat/completions` 调用 Qwen-ASR：音频作为 `input_audio` 的 data URL，`asr_options` 为 `{ language: 'zh', enable_itn: true }`，时间和数字写成阿拉伯数字（「3点」）。请求复用模型调用的传输层：只允许公网 HTTPS、固定 DNS、45 秒超时、上游错误只返回稳定代码（[接口文档](https://help.aliyun.com/zh/model-studio/qwen-asr-api-reference)）。
- 每人每分钟 10 次。成功后计入该配置的本月用量（次数与 tokens）。
- 音频只在内存中经过 API，不写盘、不入库；日志脱敏字段新增 `*.audio`，失败日志只记录错误代码。

## 客户端

- `src/platform/voice/`：`voice-recorder.ts` 用 `expo-audio` 录音，`recording-file.native.ts` 读取文件为 base64 后立即删除，`recording-file.web.ts` 读取 Blob 后释放 URL。`expo-audio` 包含在 Expo Go 中，联调不需要开发客户端。
- `use-assistant-voice-input.ts`：状态依次为空闲、打开麦克风、录音、转写，然后回到空闲。每次点按都是一个独立尝试，已取消尝试的迟到结果不会改动草稿。
- 交互：麦克风在发送按钮左侧。录音时底栏换成「× 取消 · 朱色录音点 · 音量条 · 计时 · ✓ 完成」，转写时显示「正在转写…」。文字追加到草稿末尾，草稿非空时换行，不自动发送。
- 边界：60 秒自动完成；短于 0.4 秒视为误触；转写 30 秒超时；合并后超过 8,000 字时不截断也不合并，只提示。离开页面、失去写权限时丢弃录音；切到后台或来电时转写已录部分。
- 权限只在第一次点按时申请；已经允许时只查询、不再申请。永久拒绝时，手机端提供「打开设置」；Web 提示到网站设置中允许。Web 只在 HTTPS 或 localhost 上显示麦克风。
- Android 申请权限时总会打开系统权限页，即使已经允许；这期间应用会被报告为「后台」。所以只有开始录音以后切到后台才算离开，打开麦克风的过程中收到的后台事件不处理。之前的版本把它当成离开，在 Android App 里点麦克风只会闪一下（2026-10-22 修复）。
- 原生配置：iOS `NSMicrophoneUsageDescription`，Android `RECORD_AUDIO`、`MODIFY_AUDIO_SETTINGS`。关闭了 `expo-audio` 默认的后台播放，不添加前台服务和 iOS 后台音频模式。

## 验证记录（2026-10-22）

- API：单元测试 197 项通过，新增的覆盖 Qwen 请求格式、两种 content 形态、无效响应、用途隔离和静音 WAV。助手集成测试 36 项通过，其中新增 7 项，覆盖共享配置转写与用量、请求体上限（880,000 字符可通过，再多 4 个字符被拒）、参数校验、用途隔离、私有配置与非成员、静音测试连接、上游失败不泄露信息。集成测试使用本机 PostgreSQL 17 的 `muchakucha_test` 库，迁移由测试初始化执行。重新生成的 API 客户端稳定，没有额外差异。
- 客户端：Jest 55 个套件、551 项测试通过；全仓类型检查通过。新增的语音测试覆盖：录音转写后追加到草稿、没有配置时不显示麦克风、取消与迟到结果、60 秒自动完成、三种权限拒绝、静音/误触/上游失败、超时、长度上限、切后台与离开页面、打开麦克风时取消、会话面板发送，以及配置表单的用途选择和录音适配层。
- Web：`playwright.ui.config.ts` 中助手相关 16 项通过（原有 10 项、语音 6 项），在 320、390、1440 宽度下运行，含 axe 检查和键盘操作。浏览器用的是真实 MediaRecorder，麦克风是注入的振荡器音源，接口为模拟；测试还检查了麦克风轨道在完成、取消、离开页面后都已关闭。
- 原生：Android 和 iOS 的 JavaScript 打包通过。Expo config introspection 确认了上述 iOS 和 Android 权限，且没有后台服务。没有编译原生安装包。

## 尚未验证

- 生产环境的电脑浏览器和手机浏览器已用真实百炼配置录音转写成功（2026-10-22，人工验收）。App 录的 M4A 是否被 Qwen-ASR 接受还没确认；如果被拒绝（`ASSISTANT_PROVIDER_REJECTED`），需要改录音格式或在服务端转码。
- 第一版 preview 包在 Android 上打不开麦克风（见上文「客户端」）。修复后还没有在 Android 和 iOS 真机上录音，包括权限弹窗、来电中断和 Android 极短录音。
- Web 端界面由 Playwright 模拟接口和浏览器假麦克风验证，不能证明真实识别质量。

## 后续可以考虑

- 把家人姓名、标签名作为 Qwen-ASR 的上下文，提高人名识别率。这会让这些名字发送给转写服务，需要先确认。
- 改为流式转写，在说话时逐字显示。需要 WebSocket 和不同的服务端接口，不在本期范围内。
