# Mizu 网页单词本

可在电脑和手机浏览器使用的单词本。字词增删改、英文和中文检索、五种主题、隐藏词条列、中英独立字号和字重均在网页中操作。背景使用固定的高不透明度。主题和显示偏好保存在各浏览器内。

在列表上方切换词本。在「设置 → 词本」管理哪些词本出现在列表里，也可新建自定义词本。个人和自建词本支持增删改。五套备考词本可浏览、搜索和练习。

点放大镜展开搜索。在「设置 → 显示 → 翻页方式」可选按钮翻页、左右滑动或下滚加载。左右滑动支持触屏和横向触控板手势。每批载入最多 50 个词，并保留上一页与下一页按钮。

顶部每日诗词随本地日期轮换，点击可阅读整首。网页与桌面版内置离线诗库使用同一组选句。右上角的游戏入口可打开数字华容道、舒尔特方块、数独和反应力测试。数字华容道由合法移动打乱，数独题目生成时校验唯一解。

右上角的练习按钮支持勾选一本、多本或全部词本，从带中文释义的词条中随机抽取最多 10 个词。可以翻卡自测，或用至少四种不同的释义练习四选一。网页记住上次选择的练习方式及词本。

## 内置词本覆盖范围

五套词本包含 [ECDICT 固定版本](https://github.com/skywind3000/ECDICT/tree/39cfb9672c0906b63569e0453c2e6abfb9ab182a) 中对应标签的全部带释义词条。四、六级补入官方大纲附表能够匹配 ECDICT 中文释义的词，按英文拼写去重。词条内容来自 ECDICT，按 [MIT 许可](public/wordpacks/LICENSE-ECDICT.txt) 分发。

| 词本 | 标签 | 实际词条 |
| --- | --- | ---: |
| 四级 | cet4 + 附表补充 | 5,319 |
| 六级 | cet6 + 附表补充 | 7,303 |
| 雅思 | ielts | 5,040 |
| 托福 | toefl | 6,974 |
| GRE | gre | 7,504 |

以 [2016 年四六级官方大纲附表](https://cet.neea.edu.cn/xhtml1/folder/16113/1588-1.htm) 的主词目列为基准，四级取未标星的主词目，六级同时纳入标星词。展开可识别的拼写变体并去重后，四级匹配 4,123 / 4,125 种拼写，六级匹配 5,398 / 5,403 种拼写。统计以能够解析的主词目为范围，附表派生词列没有单独纳入核验。雅思、托福和 GRE 的词本是 ECDICT 的完整备考标签集合。

如需复现数据，在 Python 环境中安装 `pymupdf`，下载固定版本的 `ecdict.csv` 和上述官方大纲 PDF，再运行 `python scripts/build-wordpacks.py ecdict.csv --cet-pdf cet-syllabus.pdf`。脚本校验两个输入的 SHA256。运行时网页直接载入生成的词包。

## 在自己的 Firebase 上使用

1. 打开 [Firebase 控制台](https://console.firebase.google.com/)，选择自己的项目。进入「项目设置 → 常规 → 你的应用」，添加网页应用并复制其 `firebaseConfig`。
2. 进入「Authentication → 登录方法」，启用「电子邮件／密码」。在「用户」页添加或确认已有的邮箱账号。
3. 进入「Firestore Database」，创建默认 Cloud Firestore 数据库。在「规则」页发布 [firestore.rules](public/firestore.rules) 中的规则。项目已有其他规则时，把 Mizu 的两个 `match` 块和它们使用的函数合并到现有规则中，保留其他路径的规则。历史规则可继续同步「我的单词本」，新增的 `mizuWebBooks/{uid}` 路径用于同步自建词本，发布新版规则后需要重新登录。
4. 在网页右上角点击云朵图标，粘贴配置，输入上一步的 Firebase 账号和密码。页面显示「已同步」后，再增删改词条。若登录提示来源限制，检查网页 API Key 的网站限制是否允许实际部署的域名。

登录请求由浏览器交给 Firebase。网页会记住网页应用配置，登录会话保留在当前浏览器标签页，退出时清除会话。请使用网页应用配置，Firebase 服务账号私钥不适用于此网页。数据存于自己的项目中，读写由 Firebase Rules 按账户 UID 隔离。

## 与桌面版共用词条

- 同一 Firebase 项目和账号通过 `mizuSync/{uid}` 共享「我的单词本」。网页自建词本通过 `mizuWebBooks/{uid}` 在浏览器之间同步。
- 已有桌面备份时，网页只更新备份的 `Words`，保留已有待办和桌面显示设置。首次从空数据库添加单词时，网页用默认桌面设置建立与桌面版兼容的备份。
- 桌面版通过「设置 → 同步 → 恢复云端备份」读取网页保存的词条。桌面版恢复沿用其备份流程，会同时恢复备份里的待办和显示设置。桌面版上传备份后，已连接的网页会刷新词条。
- 未登录时，词条和自建词本保存在当前浏览器。连接 Firebase 后可在 Firebase 设置中分开合并本机词条和本机自建词本。合并只添加缺失条目，保留云端已有版本。
- 云端写入需要联网。若其他设备已修改正在编辑的词条，网页会提示重新打开再试。

## 本地运行和部署

```sh
npm ci
npm run dev
npm test
npm run build
```

部署时发布 `dist/`。站点是纯静态网页，由浏览器直接连接 Firebase。部署无需填写项目配置或提供服务账号。

## Cloudflare Pages 直接上传

1. 进入 **Workers & Pages → Create application → Drag and drop your files**。
2. 直接拖入生成的 `Mizu-Web-Cloudflare-Pages.zip`，再点击部署。ZIP 根目录就是可发布静态文件。
3. 打开分配的 `pages.dev` 地址，通过右上角云朵登录自己的 Firebase。如果网页 API Key 设置了网站限制，请允许该页面的实际域名。

可以用 `npm run build` 和 `python scripts/package-cloudflare.py` 重新生成上传 ZIP。Cloudflare Pages 按协商压缩静态资源，包内 `_headers` 对哈希命名的脚本、样式和词包设置长缓存，并让浏览器重新验证 HTML。首次打开个人词本不会下载公共词包，选中哪本就载入哪本。游戏页面在打开时单独加载。

[Cloudflare Pages 直接上传](https://developers.cloudflare.com/pages/get-started/direct-upload/) · [静态资源压缩与缓存](https://developers.cloudflare.com/pages/configuration/serving-pages/) · [响应头文档](https://developers.cloudflare.com/pages/configuration/headers/)

参考 [Firebase 邮箱密码登录](https://firebase.google.com/docs/auth/web/password-auth) 和 [Firestore 事务](https://firebase.google.com/docs/firestore/manage-data/transactions)。
