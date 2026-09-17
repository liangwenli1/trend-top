# 账户与订阅 UI 验收

日期：2026-09-18。验证代码：9ba5931。

## 环境

本地隔离 Demo 数据库，已预置 Free、Pro、管理员三个合成账户。所有验证码只写入 Demo outbox。未发送真实邮件、未调用真实付款或取消付款、未修改生产管理员配置。

## 自动检查

生产构建通过。

| 测试文件 | 通过数量 |
| --- | ---: |
| server/api.test.js | 3 |
| server/billing.test.js | 1 |
| server/email-login.test.js | 1 |
| server/pulse.test.js | 9 |
| server/mail.test.js | 3 |
| server/catalog.test.js | 22 |
| 总计 | 39 |

计费回归包含匿名管理员 API 返回 401、普通用户管理员 API 返回 403。原计费、摘要权益与来源判断没有更改。

## 页面检查

- 未登录访问 Settings，返回验证码登录并保留下一页地址。
- Pro 和管理员头像菜单均只包含 Subscribe & billing、Settings、Sign out；邮箱保留为身份说明。
- 普通用户 Settings 没有 Site administration；直接打开 panel=admin 仍仅显示普通邮件设置。
- 管理员 Settings 内显示嵌入的网站管理页；没有提交配置。
- Pro 在 Settings 暂停、恢复、确认停止邮件，状态正常更新；账单页仍显示 Active Pro 和当前有效周期。
- 账单页没有邮件启停按钮，保留取消付费续订、付款记录与退款入口。
- 原 account/delivery?intent=stop 转到 Settings 邮件分类；停止后的状态正确读取。链接不会绕过确认自动停止。
- Skill 弹窗使用 12 个 Skill、13 条路径的合成仓库。桌面两列、390px 手机单列，列表内部滚动。搜索 packs/ 返回同名 Skill 的两个位置；Escape 关闭后焦点回到 Explore 按钮。
- Official 的实际样式为蓝底白字；Community 为白底蓝字；两者均为方角。修正了旧样式覆盖。
- Free 设置在 320px 下未横向溢出；390px 下分类导航正常换行。Pro 邮件操作按钮为黑底白字。
- 首页 CTA 文案收敛为三项核心价值，Get started 居中且箭头单独定位。
- 页脚只有 Privacy、Terms，没有 Cookies 入口。
- 验证码邮件和每日摘要 HTML 预览中，品牌图标成功加载并分别位于 390px、1440px 视口中心。
- 最终首页浏览器错误日志为空。

## 截图

- [桌面 Skill 弹窗](skills-desktop.png)
- [手机 Skill 弹窗](skills-mobile.png)
- [管理员设置](admin-settings.png)
- [Free 手机设置](free-settings-mobile.png)
- [验证码邮件手机预览](auth-email-mobile.png)
- [首页 Pro 介绍与居中按钮](pro-cta-desktop.png)

邮件检查为浏览器 HTML 预览，未在 Gmail、QQ 邮箱或 Outlook 内发送并验证。共享邮件品牌头使用内联样式与表格布局，实际邮件客户端差异仍需后续观察。
