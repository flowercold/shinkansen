# 定制版与上游同步规范

本仓库 origin 是 flowercold/shinkansen，upstream 是 jimmysu0309/shinkansen。定制分支为 custom-features，扩展加载目录为仓库内的 shinkansen/。

## 自动流程

本项目已配置 Claude Code 项目 hooks（.claude/settings.json）：每次提交需求时自动 fetch upstream/main，并用 git merge-tree 预览合并，不修改当前代码、索引或分支。报告保存在 Git 目录 custom-sync-report.md。上游有更新时，助手结合本次需求检查 diff、文本冲突、双方修改的文件及未提交工作，先询问现在整合还是本次跳过，再开始修改。

任务完成且必要检查通过后，助手按 CLAUDE.md 自动审阅、显式暂存本任务文件、提交并普通推送到 origin 的 custom-features 分支。Stop hook 会触发收尾检查；问答、等待决定、失败或半成品不会因为对话结束而被提交。不会自动强推或更新 main。

这套自动化只覆盖加载了项目配置的 Claude Code 会话，不会监听其他编辑器的手动修改。首次增加 .claude/settings.json 后，建议重新打开项目会话使 hooks 加载；脚本已手动通过输入输出测试，实际事件触发需在新会话验证。网络/认证失败会报告并保留本地工作。自动化行为规范见根目录 CLAUDE.md；可在 .claude/settings.json 删除对应 hooks 来停用。

## 合并会不会覆盖定制？

Git merge 使用共同祖先、当前分支、上游分支进行三方合并，而不是把上游文件直接覆盖到本地。

- 只有你修改的地方：通常保留你的修改。
- 只有上游修改的地方：引入上游修改。
- 双方修改同一段：如果 Git 无法自动协调，会停下来提示冲突，等待人工处理。
- 双方修改不同位置：可能自动合并成功，但仍然存在行为不兼容的可能。例如上游更换了内部消息名称，你的外部接口仍调用旧名称。Git 检查文本关系，不能保证功能兼容。

因此，同步的完整流程是：备份当前提交 → 合并 → 处理冲突 → 检查定制功能 → 再推送。不能把“没有冲突”当成“功能没问题”。

## 同步前

在仓库根目录操作，先检查工作区。未提交的代码应先完成并提交，或妥善暂存；不要对未保存的工作执行强制重置。

```bash
git status
```

```bash
git switch custom-features
```

创建一个未使用过的本地备份分支名；下例中的日期后缀每次换成新的名称。

```bash
git branch backup/custom-before-sync-YYYYMMDD
```

## 拉取并合并上游

```bash
git fetch upstream
```

```bash
git merge upstream/main
```

这两步不自动执行；每次希望同步时运行。想跟随正式发布版时，可以在 fetch 后改为合并具体发布 tag，而不是 main。main 可能包含尚未发布的功能。

不要用 `git reset --hard upstream/main` 同步定制分支，那会把当前分支指向上游版本。不要用 GitHub 的丢弃本地提交或强制同步操作替代合并。

## 出现冲突

```bash
git status
```

逐个阅读冲突文件，把上游的新功能和本地定制组合成最终代码，删除冲突标记。不要对全部文件一键采用 ours 或 theirs：这容易丢掉其中一边的功能。

解决后暂存每个明确检查过的文件，再完成合并：

```bash
git add <已解决冲突的文件路径>
```

```bash
git commit
```

如果需要放弃尚未完成的合并：

```bash
git merge --abort
```

## 每次合并必须核对的定制

- shinkansen/manifest.json 保留 contextMenus 权限、content-context-menu.js 脚本加载项，以及 externally_connectable.ids = ["*"]。
- shinkansen/background.js 保留右键菜单注册及 TRANSLATE_SELECTION 派送，保留 TRANSLATE_TEXTS 外部监听。其调用的内部批次处理器必须仍存在，输入输出仍兼容。
- shinkansen/content-context-menu.js 保留浮层及标题栏拖动、关闭、边界限制。
- shinkansen/_locales/*/messages.json 保留右键菜单和选译所用文案。
- 重新加载扩展、刷新测试网页：右键选译、拖动、关闭；从另一个扩展发起翻译，验证返回结果。按使用情况检查 Gemini、Google、自定义服务的主预设。
- 运行项目适用的语法检查、单元测试；浏览器测试需要单独完成，语法通过不能替代实测。

确认后将 custom-features 推送到自己的 fork，首次推送可设置跟踪关系：

```bash
git push -u origin custom-features
```

定制保留在 custom-features 分支；默认 main 分支不一定包含定制。换电脑时应检出 custom-features。保持扩展加载目录稳定；更换安装方式或加载路径可能改变扩展 ID，调用方需要重新配置。

## 给维护者或 AI 的要求

同步任务必须同时保留上游新功能和上述定制；遇到接口变化应适配调用，不能为了消除冲突删除任意一边。提交前说明更新到的上游提交、冲突处理、检查结果及未验证项。未经明确要求，不强制推送、不发布、不删除备份。

外部接口契约见 [EXTERNAL-TRANSLATION-API.md](EXTERNAL-TRANSLATION-API.md)。
