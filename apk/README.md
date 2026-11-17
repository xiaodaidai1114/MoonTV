# MoonTV Android 客户端（轻量 WebView 外壳）

约 56 KB，零第三方依赖，只做一件事：把你自己部署的 MoonTV 站点装进一个原生壳里，
带全屏播放、返回键导航和服务器切换。

## 产物

- `moontv.apk` —— 已签名的安装包（minSdk 23 / targetSdk 34，通用，无架构限制）
- `keystore.jks` —— 签名密钥（口令 `moontv123`，别名 `moontv`）。**升级安装必须用同一个密钥**，
  丢了就只能卸载重装，所以别删。

## 首次使用

1. 安装后打开，弹出「选择服务器」。
2. 直接粘贴站点地址（如 `http://43.163.211.88:3000`），或点「常用地址」从预置的两台里选。
3. 登录/注册都在页面里完成，和浏览器里一模一样。

## 交互

| 操作 | 效果 |
| --- | --- |
| 返回键 | 页面后退；已在首页时弹出「刷新页面 / 更换服务器 / 退出」 |
| 全屏视频 | 自动进入沉浸全屏，返回键退出全屏 |
| 站外链接 | 交给系统浏览器打开 |
| 连不上 | 显示「连不上服务器」页，可点重试 |

## 构建

需要 JDK 17 与 Android SDK（`build-tools;34.0.0`、`platforms;android-34`）：

```bash
JAVA_HOME=/path/to/jdk17 ./build.sh
```

> build-tools 34 自带的 d8 在 JDK 21+ 上处理内部类会崩，所以固定用 JDK 17 编译和转 dex。

改默认服务器列表：编辑 `src/com/moontv/app/MainActivity.java` 里的 `KNOWN_SERVERS`，
改版本号：`AndroidManifest.xml` 的 `versionCode` / `versionName`。
