# 定制版维护流程

本项目使用 .claude/settings.json hooks 和 tools/custom-sync.py 自动触发预检及收尾提醒。此规范适用于通过本项目 Claude Code 会话执行的任务，不拦截外部编辑器或手动 Git 操作。

## 修改前

UserPromptSubmit 自动 fetch upstream/main，用 merge-tree 生成预览，不修改工作区、索引或当前分支；报告在 Git 目录 custom-sync-report.md，输出包含其路径。merge-tree 会写临时 Git 对象，但不会实际合并。

- 结合本次需求阅读预检报告、双方 diff 及未提交工作。预览只覆盖已提交 HEAD；必须额外检查未提交变更，不能据此承诺没有冲突。
- 上游有新提交：先概述新增功能、双方重叠的文件、具体文本冲突及可能的行为兼容问题，推荐处理方式，询问用户现在整合或本次跳过。得到答复前不合并、不做依赖该决定的编辑。
- 没有新提交：简要说明后继续用户已授权的修改，不重复询问。
- 用户选择整合：先保存本任务已有工作、建立唯一命名备份分支，再合并明确预检的上游提交，适配而非删除定制。工作区有不属于本任务的改动时不可擅自提交、暂存或覆盖。
- fetch/预检失败时应说明原因，不能默默使用过期报告；恢复检查或取得用户允许本次离线继续。
- 本地定制及回归清单见 docs/CUSTOM-UPDATES.md；API 契约见 docs/EXTERNAL-TRANSLATION-API.md。

## 完成后自动同步（用户已授权）

用户已要求每次修改任务完成后自动提交并同步到自己的 GitHub fork，无需重复征求普通 commit/push 许可。

- 只有任务实际完成、必要检查通过后才提交；等待用户回答、纯问答、检查失败、半成品均不自动提交。
- 审阅 diff，只显式 git add 本任务文件，禁止 git add -A。不要纳入 .specstory/、.vscode/、凭据、日志或其他任务的文件。若文件混有其他人的改动，先隔离本任务变更或询问。
- 确认当前分支为 custom-features，origin fetch/push URL 均为 https://github.com/flowercold/shinkansen.git（可接受相同仓库 SSH URL）。不匹配时暂停同步并说明，不切换分支或改远程。
- 使用有意义的提交说明，并以 Co-Authored-By: Claude Code <noreply@anthropic.com> 结束。
- 普通推送：git push -u origin HEAD:refs/heads/custom-features。不强推、不推 main/upstream、不自动合并 GitHub PR、不发布。
- 如果有待推送的旧提交，先审阅这些提交确认属于本项目定制再推送。远程拒绝、网络或认证失败时保留本地提交并报告；不得通过强推解决。
- 收尾报告提交 SHA、目标分支、检查结果、推送成功或失败及未完成项。Stop hook 是提醒，不能仅因每次对话停止就把工作区全部提交。
