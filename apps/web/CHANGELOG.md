# @getu/web

## 0.0.1

### Patch Changes

- [#262](https://github.com/iannoying/getu-translate/pull/262) [`d5ff421`](https://github.com/iannoying/getu-translate/commit/d5ff421ac487447d22d48c4f415fa14fcde4f5f3) Thanks [@iannoying](https://github.com/iannoying)! - 修复 PDF 预览页轮询状态失败时误显示翻译超时的问题。登录失效、任务不存在或无权限现在会显示对应错误。

- [#260](https://github.com/iannoying/getu-translate/pull/260) [`284d9ac`](https://github.com/iannoying/getu-translate/commit/284d9acf5af50e4b400680a2bdba0f9e44e7373a) Thanks [@iannoying](https://github.com/iannoying)! - 修复在线文本翻译免费模型结果不可见的问题，并为免费翻译服务增加请求超时兜底。

- [#257](https://github.com/iannoying/getu-translate/pull/257) [`1eee3a8`](https://github.com/iannoying/getu-translate/commit/1eee3a8135fcf69ead23d56d6cfd1698157301c8) Thanks [@iannoying](https://github.com/iannoying)! - fix(web): prevent text translate clicks before entitlements finish loading

- [#258](https://github.com/iannoying/getu-translate/pull/258) [`217733f`](https://github.com/iannoying/getu-translate/commit/217733f8a4d9d8bcba5eb51a3dab5007663675de) Thanks [@iannoying](https://github.com/iannoying)! - 修复未带语言前缀的网站页面访问问题。`/pricing`、`/document/` 等静态导出入口现在会直接跳转到用户偏好的语言页面，并避免先显示语言选择中间页。

- [#259](https://github.com/iannoying/getu-translate/pull/259) [`2e8bb98`](https://github.com/iannoying/getu-translate/commit/2e8bb980b9a1d4dcd52c712aeb74d9ca55be4e3d) Thanks [@iannoying](https://github.com/iannoying)! - 修复网站首页访问时先显示语言选择中间页的问题。根路径现在会直接跳转到用户偏好的语言首页。

- [#263](https://github.com/iannoying/getu-translate/pull/263) [`ea8e598`](https://github.com/iannoying/getu-translate/commit/ea8e598ed00b1f5b048270b7461f36617415912f) Thanks [@iannoying](https://github.com/iannoying)! - 新增 PDF 双列预览翻译流程，并修复 PDF 预览路由、重译输出、测试额度和大文档分块失败处理。

- Updated dependencies [[`ea8e598`](https://github.com/iannoying/getu-translate/commit/ea8e598ed00b1f5b048270b7461f36617415912f)]:
  - @getu/contract@0.0.1
