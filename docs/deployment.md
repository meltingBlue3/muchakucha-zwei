# 生产部署

本文记录现有生产环境。项目命令在仓库根目录执行，另有 `cd` 的示例除外；本地环境见 [开发指南](development.md#本地开发)。

## 环境与入口

服务器为 `47.117.148.16`（阿里云 ECS 上海，Ubuntu 24.04，2 vCPU / 2 GiB）。Caddy 在 443 终止 TLS：`/api/*` 转发 API，其余路径提供 Expo 静态产物，Web 与 API 同源。

| 项目 | 单元 / 位置 |
| --- | --- |
| API | systemd `muchakucha-api`，以 `muchakucha` 用户运行，监听 `127.0.0.1:3000` |
| 反向代理 | systemd `caddy`，对外监听 80 / 443 |
| 数据库 | systemd `postgresql`，库和角色均为 `muchakucha`，仅监听 localhost |
| 代码 / Web 产物 | `/opt/muchakucha` / `/var/www/muchakucha` |
| 服务端密钥 | `/etc/muchakucha/api.env`，`0600 root`，由 systemd `EnvironmentFile` 读取 |
| 自动续期 / 备份 | `snap.certbot.renew.timer` / `muchakucha-backup.timer` |

对外只开放 22 / 80 / 443；API 与数据库流量限于本机。

## 日常更新

### API

在服务器的 `/opt/muchakucha` 中执行：

```bash
pnpm install --frozen-lockfile --filter api...
pnpm --filter api prisma:generate
pnpm --filter api exec prisma migrate deploy
pnpm --filter api build

systemctl restart muchakucha-api
```

### Web

在开发机构建后上传。服务器内存有限，只安装 API 依赖，Web 保持本地构建：

```bash
EXPO_PUBLIC_API_ORIGIN=https://47.117.148.16 pnpm --filter client exec expo export --platform web --clear
grep -ohE "https?://(localhost|127\.0\.0\.1|47\.117\.148\.16)[:0-9]*" apps/client/dist/_expo/static/js/web/entry-*.js | sort -u
rsync -az --delete apps/client/dist/ <server>:/var/www/muchakucha/
```

`EXPO_PUBLIC_API_ORIGIN` 在 Metro 转换模块时写进代码，而 Metro 会缓存转换结果，不加 `--clear` 可能沿用上一次导出的地址，比如测试用的本机地址。`grep` 只应输出 `https://47.117.148.16` 一行；出现 `localhost` 或 `127.0.0.1` 时不要上传。`--clear` 会清空正在运行的 `expo start` 共用的缓存，导出前先停掉本机的开发服务器。

## 首次配置

### 环境变量

`/etc/muchakucha/api.env` 保存在仓库外：

```bash
NODE_ENV=production
PORT=3000
HOST=127.0.0.1
TRUST_PROXY=127.0.0.1
WEB_ORIGIN=https://47.117.148.16
DATABASE_URL=postgresql://muchakucha:<密码>@127.0.0.1:5432/muchakucha?schema=public
JWT_ACCESS_SECRET=<强随机密钥，≥32 字节，如 openssl rand -base64 48>
```

`WEB_ORIGIN` 必须是 HTTPS 精确来源；跨域请求仅允许所列来源。启用助手还需配置并备份 `ASSISTANT_ENCRYPTION_KEY`，保管与更换限制见 [开发指南](development.md#ai-助手)。

`TRUST_PROXY` 填代理自身的明确 IP / CIDR，同机为 `127.0.0.1`；不接受 `true`、`*` 或域名。缺失时所有用户共用代理 IP 的限流配额；无条件信任转发头则可伪造来源绕过限流。直连 API 时不设置它。

### IP 证书与续期

使用 [Let's Encrypt IP 证书](https://letsencrypt.org/2026/01/15/6day-and-ip-general-availability)，有效期仅 160 小时，需保持自动续期。使用支持 `--ip-address` 的 snap 版 Certbot（至少 5.3），续期由其 timer 调度。

首次签发时，确认 Caddy 尚未占用 80 端口：

```bash
snap install --classic certbot
certbot certonly --standalone \
  --preferred-profile shortlived \
  --ip-address 47.117.148.16
```

Caddy 启用后占用 80，续期必须改成 webroot。在 `/etc/letsencrypt/renewal/47.117.148.16.conf` 设置：

```ini
authenticator = webroot

[[webroot_map]]
47.117.148.16 = /var/www/html
```

Certbot 续期会重置证书权限，Caddy 用户不能直接读取私钥。`/etc/letsencrypt/renewal-hooks/deploy/10-caddy.sh` 使用可执行脚本复制证书并重载：

```sh
#!/bin/sh
set -e
SRC=/etc/letsencrypt/live/47.117.148.16
install -d -m 750 -o root -g caddy /etc/caddy/tls
install -m 640 -o root -g caddy "$SRC/fullchain.pem" /etc/caddy/tls/fullchain.pem
install -m 640 -o root -g caddy "$SRC/privkey.pem"   /etc/caddy/tls/privkey.pem
systemctl reload caddy
```

配置后运行 `certbot renew --dry-run` 检查续期。

### Caddyfile

```caddyfile
{
	auto_https off
}

:80 {
	handle /.well-known/acme-challenge/* {
		root * /var/www/html
		file_server
	}
	handle {
		redir https://47.117.148.16{uri} permanent
	}
}

:443 {
	tls /etc/caddy/tls/fullchain.pem /etc/caddy/tls/privkey.pem

	encode zstd gzip

	handle /api/* {
		reverse_proxy 127.0.0.1:3000
	}

	handle {
		root * /var/www/muchakucha
		try_files {path} /index.html
		file_server
	}
}
```

直连 IP 的客户端不发送 IP SNI，站点按端口声明，避免按主机匹配导致 TLS 握手失败。`try_files` 为单页应用的深层路由提供刷新兜底。

### 安装时的网络与内存问题

GitHub HTTPS 无法连接时，可从可访问机器生成 git bundle 后上传；包下载受限时可使用 npm 镜像，保持 `--frozen-lockfile` 校验。服务器构建内存不足时检查 swap 与 `vm.swappiness`，Web 仍在开发机构建。

## 备份与恢复

`muchakucha-backup.timer` 每日触发 `/usr/local/sbin/muchakucha-backup`，以 `pg_dump -Fc` 写入 `/var/backups/muchakucha/`，保留 14 天。先写 `.partial` 再改名，避免把中断文件当成备份；timer 的 `Persistent=true` 在重启后补跑错过的任务。

```bash
systemctl start muchakucha-backup.service
systemctl list-timers muchakucha-backup.timer
```

恢复演练只使用临时库，确认可恢复后再决定正式恢复：

```bash
sudo -u postgres createdb muchakucha_restore_drill
sudo -u postgres pg_restore -d muchakucha_restore_drill --exit-on-error <dump>
sudo -u postgres dropdb muchakucha_restore_drill
```

备份与数据库同盘，只防误删和逻辑损坏。已决定不配置收费云快照，明确接受系统盘损坏或实例丢失时数据与备份一起丢失的风险；助手主密钥也需配套保管。

## 移动端分发

构建配置见 [eas.json](../apps/client/eas.json)。`preview` 和 `production` 都连接线上家庭数据；`preview` 生成不依赖开发机的内部分发安装包：

```bash
cd apps/client
pnpm exec eas build --profile preview --platform android
```
