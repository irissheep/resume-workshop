# Release 0.1.0

简历工坊 Windows x64 首版，包含本地简历编辑、三种模板、PDF 输出、JSON 备份及用户自带模型的 AI 助手。

## 下载与使用

- 安装版：Resume-Workshop-0.1.0-x64.exe。
- ZIP 版：Resume-Workshop-0.1.0-x64.zip，完整解压后运行 Resume Workshop.exe。
- 校验值：SHA256SUMS.txt。
- [逐步使用教程](https://github.com/irissheep/resume-workshop/blob/main/docs/USER_GUIDE.md)。
- [源码与使用说明](https://github.com/irissheep/resume-workshop)。

使用安装版或 ZIP 不需要 Node.js 或 Python。无模型密钥也可以手动制作和导出简历。AI 需要配置自己的模型服务，文案须人工核对。

## 验证与范围

单元测试、桌面流程和 PDF 自动检查记录见 [验收报告](https://github.com/irissheep/resume-workshop/blob/main/docs/VALIDATION.md)。真实模型服务与另一台无开发环境电脑尚未验证。安装包未进行代码签名。

本版本支持 Windows x64、兼容基本 Chat Completions 文本接口、PDF 与本应用 JSON 备份。第三方许可随发行包保留。

## 开源与隐私

采用 MIT 许可，使用项目贡献者署名。源码不包含用户草稿、模型设置、API Key、缓存或本机用户名路径。公开截图与测试使用虚构资料。发布检查范围见 [隐私检查记录](https://github.com/irissheep/resume-workshop/blob/main/docs/PRIVACY_REVIEW.md)。

[问题反馈](https://github.com/irissheep/resume-workshop/issues)：请使用虚构数据复现，勿上传私人简历或密钥。