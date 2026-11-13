# unlock-1113

基于 SiYuan v3.8.9 的补丁发行仓库。桌面和 Android 构建检出固定的上游提交，再依次应用原项目和 QingYu 补丁。[SiYuan Unlock 原项目](https://github.com/appdev/siyuan-unlock)

QingYu 是云存储下拉菜单中的独立选项。账号服务就绪后，登录可以自动配置 S3、恢复账号托管的同步密钥并开启同步。手动 S3、WebDAV、Local 和离线功能仍可使用。

## 构建与发布

在 GitHub Actions 手动运行 Desktop 或 release-android。客户端基线固定为 `v3.8.9`，提交为 `d3af9d5782082b379d45a69eedf4ebcfe8ba6889`，pnpm 固定为 `12.6.0`。构建默认提供 Actions 产物。勾选 `publish` 时，同一提交的产物可以汇入当前仓库的 `v3.8.9` 草稿 Release。

| 工作流 | 产物和要求 |
| --- | --- |
| Desktop | Windows、Linux 和 macOS 安装包。macOS 使用临时签名，未做公证。 |
| Android | ARM64 APK。签名和发布需在本仓库配置 `KEYSTORE`（Base64 JKS，别名 `siyuan`）和 `KEYSTORE_PASSWORD`。两项均未配置时，普通构建生成带 `-unsigned` 后缀的 APK，安装前需签名。覆盖安装需使用与原包匹配的签名。 |

私有仓库可通过有权限的 GitHub 账号访问 Actions 产物和 Releases。内置更新器使用 GitHub 的公开 Releases API，私有状态下请在 GitHub 页面手动下载。

## QingYu 账号服务

在仓库变量 `SIYUAN_MANAGED_STORAGE_ORIGIN` 配置账号服务的 HTTPS origin，例如 `https://accounts.example.com`。填写域名及可选端口即可。服务需提供 `/api/client/v1/` 设备会话、S3 配置和 `repo-key` 接口。仓库变量留空时，客户端会提示 QingYu 服务尚未配置。

当前内网测试服务可通过内核运行环境变量 `SIYUAN_MANAGED_STORAGE_ORIGIN` 和 `SIYUAN_MANAGED_STORAGE_ALLOW_HTTP=true` 接入。发行工作流的地址生成器只接受 HTTPS。

## 本地验证

```sh
bash scripts/prepare-source.sh siyuan
node --test scripts/configure-managed-storage.test.mjs
node scripts/configure-managed-storage.mjs siyuan
bash scripts/check-account-free.sh siyuan
```

客户端遵循 [AGPL-3.0](LICENSE)，第三方说明见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。构建出的客户端对应此仓库的补丁及上游固定提交。
