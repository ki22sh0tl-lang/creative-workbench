# 创意中台 · 创意关系图谱

基于原“创意中台”业务，提供全景图谱、分类展开、记录详情、关联追溯与列表视图。SQLite 数据存放在本目录的 `data/creative.db`，与原项目独立。

## 本地运行

需要 Node.js 24+。

```powershell
npm ci
$env:PORT = '3100'
$env:HOST = '127.0.0.1'
npm start
```

访问 http://127.0.0.1:3100/ 。`/app` 同样是工作台，`/about` 为原宣传页。

项目无数据时，可运行 `npm run seed:social` 添加明确标注的模拟项目。已有数据库不需要再次初始化。

## 使用

- 顶部切换项目和实验批次；选择五个分类节点浏览记录。
- 选择记录打开详情；点击关联内容追溯来源；已发布内容可创建下一轮任务。
- 列表视图保留表单、审核、发布记录、数据录入及密集查阅功能。
- 管理菜单提供账号、发布计划、标签、CSV 数据分析和 AI 批次复盘入口。
- 图谱搜索支持当前批次关键词与三类快捷查询；Ctrl / Cmd + K 聚焦搜索，Esc 返回上一层。
- 暂停动效暂停场景持续运动，分类导航仍可使用。减少动态效果偏好下使用静态场景与即时布局切换。

## 检查

```powershell
npm test
npm run check:ui
node --check frontend/spatial.js
node --check frontend/universe.js
```

运行依赖只新增固定版本 Three.js。前端模块与 Three.js 通过本地静态资源白名单提供，不依赖外部 CDN。

## 帧率复测

访问 http://127.0.0.1:3100/?perf=1 ，`canvas` 的 `data-perf` 输出滚动帧采样，`data-transition-perf` 输出最近一次布局转场采样；正常页面不采集这些信息。统计的是实际 WebGL 渲染回调间隔与主线程提交耗时，不等同于 GPU 完成时间或显示器呈现帧数。显示器刷新率、其他程序负载与设备性能会影响结果。

优化证据见 `analysis/performance/measurements.json` 与 `analysis/performance/优化记录.md`。

## Render 演示部署

`render.yaml` 使用 Node.js 24、`npm ci` 和 `npm start`，健康检查为 `/api/health`。设置 `NODE_ENV=production`、`DB_PATH=/tmp/creative.db`、`SEED_DEMO=true`；服务默认监听 `0.0.0.0` 并读取平台提供的 `PORT`。

云端仅初始化虚构演示数据，不上传本地数据库。免费实例使用临时 SQLite，重启或重新部署后新增数据可能丢失，模拟项目会重新初始化。
