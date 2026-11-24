# DSH 手机入口桥接（Tailscale）

把电脑上的 DeepSeek Harness（DSH）桌面版网页界面，通过你自己的 Tailscale 私有网络送给手机。
TechPulse 首页的「DSH 进度」卡片就是这个入口。

```
手机浏览器 ──https──> tailscaled（tailnet 私有）──> 127.0.0.1:8787 桥接 ──> DSH 127.0.0.1:<随机端口>
```

## 它解决的两个问题

1. **DSH 桌面版只监听 127.0.0.1，而且端口每次启动随机**（`--port 0`）。
   桥接用 `netstat` 找监听端口，再用 DSH 的 `/manifest.webmanifest` 确认是它。
2. **DSH 每次启动都会生成一次性 `?token=`**，只打印在启动 URL 里，手机上没法拿到。
   桥接用本机 `.dsh/.credentials.yaml` 里的 owner 签名密钥，按 DSH 自己的格式
   （`dsh-auth-<sha256(authority)>` + HMAC-SHA256 签名载荷）签发 30 天会话 cookie，
   并把 Host / Origin 改写回 loopback，让 DSH 的浏览器信任栅栏照常放行。

因此手机端**不需要粘贴 token**，打开就能用。

## 安装

前置：Node.js（DSH 桌面版自带运行时不算，需系统里有 `node.exe`）；电脑已装 Tailscale 并登录。

```powershell
cd E:\Project\TechPulse\bridge
powershell -ExecutionPolicy Bypass -File .\install-bridge.ps1
```

脚本会：

1. 生成 `start-bridge.vbs`（隐藏控制台窗口）；
2. 注册登录自启任务 `TechPulse-DSHBridge`；
3. 立即启动，并请求一次 `/__health` 验证。

然后在电脑上执行一次：

```powershell
tailscale serve --bg 8787
tailscale status
```

第二条命令里 `Self` 那行的 `xxx.yyy.ts.net` 就是手机要填的地址：
`https://xxx.yyy.ts.net/`。

## 手机端

1. 手机安装 Tailscale App，登录**同一个账号**并打开 VPN 开关；
2. 打开 TechPulse，点首页「DSH 进度」；
3. 填入 `https://xxx.yyy.ts.net/` 保存。卡片会显示「在线」。

## 健康检查

```powershell
curl.exe http://127.0.0.1:8787/__health
# {"ok":true,"port":51071,"cookie":true}
```

`/__health` 带 `Access-Control-Allow-Origin: *`，所以 TechPulse 页面能跨域读取在线状态。

## 安全边界

- 桥接**只监听 127.0.0.1**，不监听局域网，也不监听 0.0.0.0。
- 对外只有 `tailscale serve` 提供的 tailnet 地址；**不要**用 `tailscale funnel`
  或路由器端口映射把它放上公网。
- 会话 cookie 等价于 DSH 所有者权限：能打开这个地址的人就能在你电脑上执行操作。
  请只让自己账号下的设备加入 tailnet。
- 桥接会读取 `%USERPROFILE%\.dsh\.credentials.yaml` 里的
  `client-connection/browser-session` 密钥。能读这个文件的本地进程本来就能冒充你，
  所以它没有增加本机权限。
- DSH 升级后如果改了 cookie 格式（`v1` 载荷或 `dsh-auth-` 前缀），桥接需要同步更新。

## 排错

| 现象 | 处理 |
| --- | --- |
| `/__health` 返回 `ok:false` | DSH 没启动，或还没起网页服务；打开一次 DSH 桌面版即可 |
| 卡片显示「离线」 | 手机没连 tailnet，或 `tailscale serve` 没配置 |
| 页面 401 | 桥接签名密钥读错：确认 `DSH_HOME` 指向 `.dsh` 目录 |
| 页面 403 | 请求的 Origin 没被改写：确认没在桥接前面再套一层反代 |
| 端口冲突 | 用 `BRIDGE_PORT` 环境变量换端口，并同步改 `tailscale serve` |
