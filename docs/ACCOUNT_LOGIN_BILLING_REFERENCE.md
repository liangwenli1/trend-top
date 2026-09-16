# 账户、登录与订阅管理

更新：2026-09-16。参考 Trendshift 的功能组织，视觉继续使用 Trend Top 的黑白、方框、粗标题和蓝色强调。

## 页面和菜单

| 入口 | 路径 | 内容 |
| --- | --- | --- |
| 登录 / 注册 | `/login?locale=zh` 或 `/login?locale=en` | 独立页面；邮箱密码登录、邮箱验证码注册、忘记密码、配置后出现 Google 登录 |
| 账户设置 | `/{locale}/account` | 已验证邮箱、登录方式、关联 Google、修改密码 |
| 套餐与账单 | `/{locale}/account/subscription` | 付费状态、续费日期、付款记录、取消付费续订、退款申请 |
| 邮件推送设置 | `/{locale}/account/delivery` | 六大内容类型、榜单、语言、主题、时间与时区、暂停 / 恢复 / 停止邮件 |
| 网站管理 | `/{locale}/admin` | 网站、价格、支付、Google 登录配置、采集运营及退款审核；仅管理员可见 |

登录后右上角显示黑色人像按钮，展开账户菜单。管理员与普通用户使用同一套登录；主导航不会多出 Admin。未登录访问账户页面会转到 `/login`，登录后返回原来的站内目标页面。

订阅弹窗只编辑邮件推送，不重复显示“Signed in: 邮箱”。下拉内选择语言和主题后可以保存；下拉展开时第一次 Escape 关闭下拉，保留弹窗和未保存内容，之后 Escape 才关闭弹窗。

页脚文案改为 **Six collections / 六大类型**，六个入口分别对应 Skills、Plugins、Agents、Components、Websites、Repositories；品牌核心与类型名称居中，避免长名称截断。

## Google 登录配置

1. 在 Google Cloud 创建 **Web application** 类型的 OAuth Client，配置应用名称、支持邮箱及所需的发布 / 测试用户设置。
2. 在网站管理的 Google 区域查看只读的回调地址，并原样填写到 Google 的 **Authorized redirect URIs**。
3. 回调路径为 `/api/auth/google/callback`。生产环境的 `PUBLIC_URL` 必须是网站的实际 HTTPS 地址；域名、端口、路径必须与 Google 配置一致。
4. 在网站管理填写 Client ID、Client Secret，启用 Google 登录并保存。只有配置完整且启用时，登录页才显示 Google 按钮。
5. 用 Google 测试账户完成登录、退出、再次登录，以及已有邮箱账户的关联流程；确认 Google 的测试用户限制和应用发布状态后再对公众开放。

Google 只用于基础身份与邮箱验证，不申请读取 Gmail 邮件，不保存 Google access / refresh token。身份以 Google 的稳定账号标识关联。第三方邮箱的 Google 身份不会直接覆盖已有邮箱密码账户，需要先通过本站邮箱验证或从已登录账户关联。

服务器校验一次性 state、浏览器绑定、PKCE、nonce 和 ID token；站内返回地址经过校验，不能通过登录参数跳转到外站。

Client Secret 与 Creem 密钥存入数据库时加密，后台重新加载只显示“已配置”，不会把明文密钥回传给浏览器。部署时必须持久保存加密基础密钥 `AUTH_SECRET`，并备份数据库；它属于服务器基础配置，不应因重启或重新构建而更换。

实现依据：[Google OAuth 服务端流程](https://developers.google.com/identity/protocols/oauth2/web-server)、[ID token 验证](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token)、[Google 登录品牌要求](https://developers.google.com/identity/branding-guidelines)。Google G 使用官方彩色资源，其余按钮样式沿用本站。

## 付费续订与邮件推送分别管理

| 操作 | 邮件推送 | 付费续订 |
| --- | --- | --- |
| 修改类型、主题、语言或发送时间 | 更新偏好 | 不变 |
| 暂停 / 停止邮件 | 暂停或停止发送 | 不变 |
| 取消付费续订 | 偏好保留；付费访问期结束后不再发送 Pro 摘要 | 当前周期结束后不再扣费 |
| 申请退款 | 偏好保留 | 进入退款审核；不能把申请退款当作取消续订 |

当前代码采用一个 Pro 档位、月付 / 年付两个周期，延续最新代码中的设置；不是不同功能等级。网站管理的展示金额需与对应 Creem 产品的实际价格一致，改变展示金额不会自动修改 Creem 产品。

### 取消续订

用户进入“套餐与账单”，选择“取消付费续订”，确认后通过 Creem 安排周期结束取消。页面保留当前访问截止时间，避免把停止邮件和取消扣费混在一起。

重复点击不会重复请求取消。网络超时等无法确认的结果会保留待确认状态，等待 Creem webhook 同步；不要因超时反复发起新操作。

### 退款

当前在线申请覆盖**首次成功付款后的 7 天内、服务与说明不符的问题**。用户在付款记录中选择申请退款、填写原因；其他扣费问题通过页脚联系方式处理。此处是当前产品政策，不是对所有地区法定权利的判断。

管理员进入网站管理的退款列表，选择审核：批准会调用 Creem 对原交易执行全额退款（包含原税费）；拒绝需填写用户可见的说明。页面政策约定在 3 个工作日内审核，实际退款到账时间取决于支付渠道。

申请状态包括已申请、处理中、待确认、需要处理、成功、失败、拒绝。申请与原交易唯一关联，审核使用并发锁；网络结果不明确时等待支付平台确认，不自动重复退款。成功退款记录不会被迟到的付款 webhook 覆盖。

退款与取消续订是不同动作。后台应核对 Creem 的订阅实际状态；只有退款成功且对应订阅已取消时，才按同步状态撤销对应权益。

实现依据：[Creem 取消订阅](https://docs.creem.io/api-reference/endpoint/cancel-subscription)、[退款接口](https://docs.creem.io/api-reference/endpoint/refund-payment)、[签名 webhook](https://docs.creem.io/code/webhooks)。

## Cookie 与浏览器存储

当前没有广告或行为追踪脚本，所以提供隐私说明和页脚 Cookies 入口，暂不增加“Accept all”弹窗。

| 存储 | 用途 | 生命周期 |
| --- | --- | --- |
| `trend_top_session` cookie | 登录会话 | 最长 30 天，退出时移除 |
| `trend_top_google_state` cookie | Google 登录请求验证 | 最长 10 分钟，回调结束后移除 |
| 界面语言 local storage | 用户选择的语言 | 用户清除浏览器存储前保留 |
| 语言提示 session storage | 本次浏览器会话不再重复提示 | 会话结束 |

用户可以清除浏览器存储，登录和语言偏好会随之重置。Google 与 Creem 的跳转页面遵循各自的隐私政策。

若以后增加非必要分析、广告或第三方嵌入，应先重新盘点实际存储行为，再增加分类选择、拒绝与修改偏好的入口，不能只做一个装饰性的同意按钮。必要存储与可选存储的区别参考 [ICO 的存储技术例外说明](https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guidance-on-the-use-of-storage-and-access-technologies/what-are-the-exceptions/)。

## Topic 去重与旧数据

统一规则在 `shared/topics.js`，同时生成数据库 `canonical_topic()` 函数。先规范大小写与分隔符、合并明确别名、过滤无信息量标签、去重，再按相关性排序并限制公开展示最多 5 个。

| 原始主题 | 规范后的公开主题 |
| --- | --- |
| `api, apis, public-api, public-apis, public` | `api` |
| `agent, agents, ai-agent, ai-agents` | `agents` |
| `mcp, mcp-server, model-context-protocol` | `mcp` |
| `react, reactjs, react-js` | `react` |
| `golang, go-lang, go` | `go` |
| `ai, llm` | `ai, llm`（相关，但不等价） |

`public / app / tool / software / project / repository` 等泛词不作为公开主题。没有使用任意词干合并，避免错误合并不同技术概念。

排行榜、详情、主题筛选和订阅偏好使用同一规范；筛选会匹配历史原始标签的规范结果。每一类的主题筛选与其订阅来源对齐，多类型订阅采用所选类型的主题集合。原始 GitHub topics 保留在数据库，作为来源证据和后续分类输入，不因公开展示上限丢失。

**部署新代码并重启服务即可让旧数据使用新规则，不需要清库或重新采集。** 启动时更新 SQL 函数，查询与响应中执行规范化。后续扩展别名时，修改共享规则并重新部署。

## 从参考站学习的下一步

参考截图位于 `docs/qa/account/reference-*.png`，来源为 [Trendshift 登录页](https://trendshift.io/login)、[发现页](https://trendshift.io/)、[Signal 页面](https://trendshift.io/signal)。

本次已经采用：独立登录页、两种登录入口、清晰的账户菜单、独立账单 / 推送页面，以及取消政策和退款入口。参考站的紫色、圆角和页面布局不替换本站的视觉体系。

建议后续按以下顺序评估，尚未作为本次功能实现：

1. **收藏与个人清单**：让用户保留发现的项目，提供可回访的筛选结果。
2. **历史时间入口**：明确统计日期、时区与窗口，增加可回查的榜单归档。
3. **用户提交项目**：在现有管理员候选审核上增加公开提交，补足热门项目漏采问题。
4. **外部热度证据**：展示已验证的 X / Reddit / Hacker News 来源链接，与 GitHub Star 增长分别表达。
5. **API 访问**：有明确数据消费需求后再增加 API key 和用量管理，不先扩大账户复杂度。

## 验证与上线边界

已通过 26 项自动化测试和生产前端构建，覆盖主题 JS / SQL 规则一致性、旧数据筛选、订阅持久化、OAuth state / PKCE / 账户关联、取消幂等性、退款审核和签名 webhook。浏览器检查覆盖桌面和 390×844 手机端、账户菜单、三个账户页面、订阅多选及 Escape 行为。

Google token 交换及支付调用使用测试替身；浏览器使用隔离的本地 demo 数据库。没有创建真实扣款或真实退款。上线前仍需用实际 Google 配置、Creem test 产品和签名 webhook 完成联调，并确认生产的支持邮箱、政策、价格与支付产品一致。当前环境没有 Docker 可执行文件，尚未运行 Docker 镜像构建；Dockerfile 已补入共享主题模块。
