# 创意中台

> 当前以“小红书 / 抖音内容团队”工作流为主，按实验批次组织灵感、选题、发布数据和复盘。运行 `npm run seed:social` 可添加 1 批次、2 批次及 8 篇 AI 图文 / 视频模拟内容，详见 [模拟项目验收](docs/模拟内容项目验收.md)。

本地可运行的前后端基础版本。Node.js 24+，原生 JavaScript 前端，Node HTTP API，SQLite 持久化；无第三方运行依赖。

## 运行

```powershell
npm start
```

访问 http://127.0.0.1:3000，先创建项目，再建立标签。开发时用 `npm run dev`，修改后端自动重启，修改前端刷新浏览器。

可选：运行 `npm run seed` 创建明确标记的演示项目。重复执行不会覆盖原项目；演示数据不代表真实平台效果。运行 `npm run check` 和 `npm run check:ui` 验证后端与前端语法。

## 已有模块

- 工作台：真实数量、待办、各流程入口。
- 竞品素材、创意方向、素材需求、素材资产：新建、编辑、状态、搜索、标签筛选式搜索、前后关联。
- 投放配置、素材投放关系、上线包：已审核素材绑定、重复关系检查、创建时保存固定快照、广告 ID 登记。
- 数据分析、批次复盘：按批次查看 72 小时表现、BI、CSV；DeepSeek / OpenAI 入口只在复盘页使用。
- 项目管理、标签字典：创建项目和标签；不同项目的数据及关联隔离。

## 推荐验收路径

创建项目 → 添加标签 → 登记竞品 → 新建创意 → 下达需求 → 登记素材并初审通过 → 创建可使用配置 → 建立关系 → 创建上线包 → 登记广告 ID 并设为已上线 → 录入日数据 → 查看标签表现。

制作工作在外部完成；素材资产保存飞书或其他文件 HTTP(S) 链接。基础版将每个尺寸 / 版本作为一条素材记录，尚未实现截图中的父素材与尺寸子文件分层。

## 目录

```text
backend/db.js       数据库建表与连接
backend/server.js   HTTP API、字段校验、关联规则、统计
backend/seed.js     可选演示数据
frontend/          页面、样式、表单和 API 调用
shared/modules.js  前后端共用模块字段定义
tests/api.test.js  可运行的集成检查
data/creative.db   本地数据（启动后生成，不进入 Git）
```

记录采用稳定 ID 和按模块校验的 JSON 业务字段；项目、标签映射、报表行使用独立表。后续查询需求明确后，可将模块业务字段迁移成专用关系表。

## API

所有写入接口接受 JSON，异常返回 `{ "error": "..." }`。

| 方法 | 路径 | 功能 |
|---|---|---|
| GET | /healthz | Render 健康检查，返回 `ok` |
| GET | /api/health | 本地 API 健康检查 |
| GET / POST | /api/projects | 列表 / 创建项目 |
| GET | /api/workspace?projectId=ID | 项目记录、标签、统计 |
| POST | /api/tags | 创建标签：projectId、category、name |
| POST | /api/records | 创建记录：projectId、kind、title、status、data、tags |
| PUT | /api/records/ID | 更新 title、status、data、tags |
| POST | /api/metrics | 新增日数据：projectId、packageId、date、spend、impressions、clicks、installs |

`kind` 与字段定义见 shared/modules.js。同一投放包每天仅一条报表，重复提交返回 409。CTR 使用总点击 / 总展示，CPI 使用总花费 / 总安装，分母为零返回 null。标签分组可重叠，不可相加；结论仅为描述统计。

## 当前边界

这是基础开发框架，非可直接上线的多人系统。当前没有账号与角色权限；初审由状态表达。尚未接飞书同步、广告平台 API、真实文件上传、报表导入、报表修改、批量生成需求或自动放量。

同一项目需人工保持相同币种、时区、归因窗口。上线包快照固定素材和配置；不自动追随后续修改。数据行关联上线包，由上线包保存广告 ID；后续接广告平台时需强化平台 ID 映射和历史变更管理。

`PORT` 可覆盖端口，`DB_PATH` 可覆盖数据库路径。部署配置在 `render.yaml`：Render 使用 `npm ci`、`npm start` 和 `/healthz`，演示环境通过 `SEED_DEMO=true` 初始化模拟项目。Render 免费实例的本地文件可能在重启或重新部署后丢失，正式使用应接持久化磁盘或外部数据库；API Key 和 `CAPTURE_TOKEN` 只放环境变量。多人部署前需要补身份认证、项目权限、审计、迁移及并发更新保护。

基础版按项目一次读取记录（小团队演示规模）；数据量增长后再增加服务端分页与聚合查询。
