# Trend Top 账户与订阅设计检查

日期：2026-09-16。

**视觉来源与比较边界**

- 功能参考：`docs/qa/account/reference-login.png`、`reference-discovery.png`、`reference-billing.png`，来自 Trendshift。用户明确要求保留本站 UI，参考站的紫色、圆角、字号与表单内容不是像素复制目标。
- 本站视觉来源：用户提交的页脚截图，以及提交 `8c63c75` 中的 `docs/qa/account/local-footer.png`。它保存了本次修正前的同一页脚状态。
- 实现：`http://localhost:3002/login?locale=en`、`/en/account`、`/en/account/subscription`、`/en/account/delivery`、`/en/home#subscribe`。
- 桌面截图：`docs/qa/account/local-login.png`、`local-account-menu.png`、`local-plan.png`、`local-delivery.png`、`local-subscribe-dialog.png`、`local-footer.png`。
- 手机目标视口：390×844，`local-login-mobile.png`、`local-delivery-mobile.png`。本地浏览器可见区域捕获为 375×812，完整推送页为 375×2878；内容未横向溢出。
- 桌面目标视口 1280×720；参考捕获 1280×720，本地浏览器可见区域捕获 1265×712。比较保留原始比例，没有拉伸；15×8 的浏览器边缘差异不作为布局缺陷。页脚前后均为 1265×712，均在底部、英文、测试账户登录状态。

**组合比较证据**

组合图片已生成并实际打开检查，不只分别观看截图。它们保存在忽略的本地 QA 目录，避免再次发布参考截图中的账户信息：

- 全视图：`data/test-account-qa/comparison-login.png`、`comparison-footer.png`。
- 局部：`comparison-login-controls.png` 对比表单、Google 资源、按钮形状与文字；`comparison-footer-labels.png` 对比六个名称、数字和核心品牌的对齐。

登录页有独立的品牌和表单，无主站搜索 / 导航干扰；邮箱与 Google 入口的组织借鉴参考。本站保留邮箱密码流程，所以比参考站多一个密码字段和忘记密码入口，法律文字在 720 高度下需要向下滚动。这是产品内容差异，主要登录动作仍可见；手机允许正常纵向滚动。

**已修正的问题与比较历史**

| 优先级 | 发现 | 修正 | 修正后证据 |
| --- | --- | --- | --- |
| P1 | 已登录后导航仍显示 Sign in；后续版本又改成首字母 | 统一登录状态，使用图标库的黑色人像按钮 | `local-account-menu.png`、`local-footer.png` |
| P1 | 账户设置和订阅入口内容相同 | 拆为安全、账单、邮件推送三个路径与活动标签 | `local-plan.png`、`local-delivery.png`，浏览器实际点击验证 |
| P1 | 订阅下拉内按 Escape 会关闭整个弹窗，丢失编辑上下文 | 先关闭内部下拉并归还触发器焦点，再关闭外层弹窗 | 修正构建后实际验证主题和语言两种下拉，`local-subscribe-dialog.png` |
| P2 | 页脚 Components / Repositories 被截成省略号，类型文字受编号挤占 | 编号移至左上角、名称单独居中，核心文案使用 Six collections | `comparison-footer-labels.png` 前后同视口比较、`local-footer.png` 和手机底部截图 |

**五个必查面**

- 字体：保留本站无衬线粗标题、表单字号与蓝色小标题；页脚左侧保留既有衬线品牌。六个类型无截断，手机标题自然换行。
- 间距与布局：方框、细边、单列表单、清晰活动标签延续本站。桌面核心 / 六类型布局稳定，手机降为纵向布局；没有横向溢出或控件相撞。
- 色彩：主操作黑白，活动标签及重点蓝色；取消和退款确认区分状态，未引入参考站的紫色主题。
- 资源质量：人像来自图标库，Google G 使用官方彩色图片，以 20×20 展示，无变形。参考站波形 logo 没有复制到本站。
- 文案：账户 / 付费续订 / 邮件发送明确区分；推送表单不显示 Signed in 邮箱；页脚六入口与实际六类型一致。

**交互验证**

- 登录后导航状态、退出后访客状态、独立 `/login` 路径。
- 账户菜单进入三个不同页面；管理入口只存在于管理员菜单。
- 主题与语言可以多选、保存并在重载后恢复；弹窗内也可选择。
- 取消续订和退款表单可以打开及返回。真实支付动作未执行。
- 页脚 Cookies 实际打开 `/en/privacy#cookies`，页面存在对应说明与存储清单。
- 桌面及手机页面截图检查；浏览器 warning / error 日志为空。

**验证边界与后续细化**

Google 和 Creem 的真实服务联调仍需用户配置凭据，自动化测试使用服务替身；本地测试配置已关闭虚假的登录 / 支付入口。密码更新与真实财务操作未通过浏览器提交。Docker 镜像构建尚未在本环境运行。

目前没有剩余的 P0 / P1 / P2 视觉或核心交互问题。P3 可后续优化登录页在较矮窗口中的信息密度，但不缩小移动点击区域或隐藏法律入口。

**Implementation checklist**

- [x] 保留原站风格，完成全视图和局部组合比较。
- [x] 修正账户状态、页面重复、Escape 层级和六类型截断。
- [x] 检查桌面、手机和控制台，重置临时视口。
- [x] 26 项测试与前端生产构建通过。
- [ ] 配置真实 Google / Creem 并完成 test 模式联调。

final result: passed
