---
status: accepted
---

# 普通提醒经标准 Web Push 推送到浏览器

2026-11-23 决定。Web 与 Android、iOS 同为一等平台，普通提醒在 Web 上也要按时弹出。服务端已经为 Expo 和 FCM 计算到期提醒、按会话登记设备，所以 Web 作为第三个推送渠道 `web` 接入同一套投递：

- 浏览器经 service worker 订阅；
- 服务端以 VAPID 签名、aes128gcm 加密后，直接投递到浏览器自带的推送服务：Chrome 是 FCM，Edge 是微软 WNS，Safari 是 Apple；
- Web 只收普通提醒，没有闹铃。

Web 用户在日本，使用 Chrome、Edge 和 Safari（含 iOS 主屏应用）。当时的服务器是临时的，它自身能否连上各家推送服务，不影响这个决定。

## 考虑过的方案

- **只在页面开着时用 Notification API 弹出**：不用改服务端，但标签页一关就收不到，做不到按时提醒。
- **浏览器本机定时通知（Notification Triggers）**：浏览器已经放弃这个提案。
- **第三方推送服务**：多一个外部账户，提醒内容也要多经一家服务商，换来的到期计算和设备登记，服务端本来就有。
- **自己实现 RFC 8291 加密**：仓库里 FCM 的 OAuth 签名是手写的，但加密写错了不会报错，只会静默收不到。所以用 `web-push` 库生成密文和请求头，发送仍用 `fetch`，与其他渠道一致。
- **公钥由 API 下发**：换密钥时不用重新构建 Web，但要多一个接口。密钥极少更换，所以公钥随 Web 构建下发（`EXPO_PUBLIC_REMINDER_WEB_PUSH_KEY`）。

## 后果

- 服务端会向用户提交的订阅地址发请求，所以只接受已知推送服务的主机。这份白名单是 SSRF 防线，不能当成多余的校验去掉。
- 浏览器退出后的送达取决于浏览器和系统。macOS Safari 可在退出后接收；iOS 和 iPadOS 上只有添加到主屏幕后才能订阅。[Apple WWDC：Meet Web Push for Safari](https://developer.apple.com/videos/play/wwdc2022/10098/?time=576)
- 订阅和通知权限都绑定站点来源。迁到正式域名后，用户要在新地址重新允许通知，旧地址的 Web 登记要清掉。
- 更换 VAPID 密钥会让现有订阅失效，推送服务会返回 403。客户端每次同步时比对公钥，不一致就重新订阅。
