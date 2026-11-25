# Mizu 网页单词本

可在电脑和手机浏览器使用的单词本。字词增删改、英文和中文检索、五种主题、隐藏词条列、中英独立字号和字重均在网页中操作。背景使用固定的高不透明度。主题和显示偏好保存在各浏览器内。

## 在自己的 Firebase 上使用

1. 打开 [Firebase 控制台](https://console.firebase.google.com/)，选择自己的项目。进入「项目设置 → 常规 → 你的应用」，添加网页应用并复制其 `firebaseConfig`。
2. 进入「Authentication → 登录方法」，启用「电子邮件／密码」。在「用户」页添加或确认已有的邮箱账号。
3. 进入「Firestore Database」，创建默认 Cloud Firestore 数据库。在「规则」页发布 [firestore.rules](public/firestore.rules) 中的规则。项目已有其他规则时，把 `match /mizuSync/{uid}` 块合并到现有规则中，保留其他路径的规则。Mizu 桌面版已有同一规则时可以直接复用。
4. 在网页右上角点击云朵图标，粘贴配置，输入上一步的 Firebase 账号和密码。页面显示「已同步」后，再增删改词条。若登录提示来源限制，检查网页 API Key 的网站限制是否允许实际部署的域名。

登录请求由浏览器交给 Firebase。网页会记住网页应用配置，登录会话保留在当前浏览器标签页，退出时清除会话。请使用网页应用配置，Firebase 服务账号私钥不适用于此网页。数据存于自己的项目中，读写由 Firebase Rules 按账户 UID 隔离。

## 与桌面版共用词条

- 同一 Firebase 项目和账号使用 `mizuSync/{uid}` 中的同一份备份。
- 已有桌面备份时，网页只更新备份的 `Words`，保留已有待办和桌面显示设置。首次从空数据库添加单词时，网页用默认桌面设置建立与桌面版兼容的备份。
- 桌面版通过「设置 → 同步 → 恢复云端备份」读取网页保存的词条。桌面版恢复沿用其备份流程，会同时恢复备份里的待办和显示设置。桌面版上传备份后，已连接的网页会刷新词条。
- 未登录时，可在当前浏览器保存单词。连接 Firebase 后显示云端单词本，本机词条留在浏览器里。如果本机还有云端未收录的单词，可以在 Firebase 设置中手动合并，重名词保留云端版本。
- 云端写入需要联网。若其他设备已修改正在编辑的词条，网页会提示重新打开再试。

## 本地运行和部署

```sh
npm ci
npm run dev
npm test
npm run build
```

部署时发布 `dist/`。站点是纯静态网页，由浏览器直接连接 Firebase。部署无需填写项目配置或提供服务账号。

参考 [Firebase 邮箱密码登录](https://firebase.google.com/docs/auth/web/password-auth) 和 [Firestore 事务](https://firebase.google.com/docs/firestore/manage-data/transactions)。
