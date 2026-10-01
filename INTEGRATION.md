# Tripothon 最小真实联调

2026-10-01 核对。当前没有真实付费调用；运行环境中 `OPENAI_API_KEY` 与 `WORLDLABS_API_KEY` 均未检测到。仅检查是否存在，没有读取其他项目凭据、配置持续授权或验证账号权限。

## 用户需要决定什么

批准一次合成资料测试：一次 Agent、一次参考图、一次 Draft 世界生成。预计消耗约 **US$0.21–0.25**，应用预留 **US$0.35**。若 World Labs 没有 API 额度，官方最低充值 **US$5**；该充值不是单次消耗，且不同于 Marble 网页额度。账户、充值与资料发送均由用户自行决定。当前不需要安装任何软件。

## 已实现和固定的模型

| 能力 | 实际适配器与小测试模型 | 配置/账户条件 |
|---|---|---|
| 记忆 Agent | OpenAI Responses，`gpt-5.4-mini`；文字与最多 4 张低细节图像，严格 JSON Schema | `OPENAI_API_KEY`、`OPENAI_MODEL=gpt-5.4-mini`，API 账户有该模型权限及额度 |
| 口述参考图 | OpenAI Images generations，`gpt-image-1.5`，1024×1024、low、n=1 | 同一 OpenAI key、`OPENAI_IMAGE_MODEL=gpt-image-1.5`；图像模型可能要求组织验证，需用户账户确认 |
| 可探索世界 | World Labs World API，`marble-1.0-draft` | `WORLDLABS_API_KEY`、`WORLDLABS_MODEL=marble-1.0-draft`、独立 API 额度 |

当前代码不含 Anthropic、Gemini 或其他图片供应商适配器。OpenAI 模型采用这里列明的固定配置，不声称是最新模型。World Labs 文档还列出 `marble-1.0`、`marble-1.1`、`marble-1.1-plus`；小测试入口刻意只允许 Draft，避免切到高费用模型。改变模型或增加次数须先重新审核预算和代码。

模型与协议依据：[GPT-5.4 mini](https://developers.openai.com/api/docs/models/gpt-5.4-mini)、[GPT Image 1.5](https://developers.openai.com/api/docs/models/gpt-image-1.5)、[World Labs models](https://docs.worldlabs.ai/api/models)。

## 单次成本与真正的硬限制

小测试估算假设：纯文字 Agent 约 6,000 输入 token、最多 2,000 输出 token；短描述生成一张低清方形参考图；参考图作为 World Labs 非全景单图。Agent 按 $0.75/百万输入和 $4.50/百万输出约 **$0.0135**；参考图输出 **$0.009**，另加文字输入；Draft 非全景单图 **230 credits=$0.184**。合计基础约 $0.207，加提示词等余量按 $0.21–0.25 准备。多图 Draft 为 250 credits=$0.20。这里未含税、汇率或账户特定定价。[OpenAI 价格](https://developers.openai.com/api/docs/pricing)、[图片价格](https://developers.openai.com/api/docs/models/gpt-image-1.5)、[World Labs 价格](https://docs.worldlabs.ai/api/pricing)。

代码硬限制的是**应用发出的付费请求数量**：

- `ALLOW_PAID_PROVIDERS=0` 默认关闭；服务端模型、凭据、开关与页面明确同意缺一不可。
- `PAID_TEST_MAX_AGENT_CALLS`、`PAID_TEST_MAX_IMAGE_CALLS`、`PAID_TEST_MAX_WORLD_CALLS` 默认 0，仅接受 0 或 1。范围是当前数据库的全部项目，重启不清零。
- 每次网络请求前在 SQLite 原子预占 `paid_requests`。同一内容版本 Agent、同一确认描述图片和世界均去重；成功返回旧结果，进行中或未知结果拒绝重发。
- 失败和超时仍占次数，因为外部可能已经收费。不会自动重试付费 POST。没有删除账本或自动补充额度的 UI。
- Agent 输入文本最多 16 KB、4 图、输出上限 2,000 token；图片描述最多 8 KB、low、1 张。World 只允许 Draft、最多 4 张来源图；没有高价 mesh export 调用。
- `PAID_TEST_BUDGET_USD` 默认 0。账本按 Agent $0.10、图片 $0.05、世界 $0.20 预留，余额不足拒绝发出请求。

**预留金额是估算防护，不是供应商账单硬上限。**价格、图像 token 计费和其他客户端的调用可能不受本应用约束。World Labs 官方明确：关闭自动充值仍可能产生月底 overage，预付余额不是硬上限。因此不能承诺“余额用尽便一定停止收费”。真正严格的账户美元上限需要供应商明确提供并验证的控制，本轮未配置或声称已经实现。

## 最少用户操作，不在聊天中传 key

1. 用户在已有 OpenAI / World Labs 控制台确认 API 权限与额度，并批准上面的单次范围；需要新账号或充值时由用户本人完成。
2. 停止当前本地 Demo，在自己的 Terminal 进入本目录，运行：

   ```sh
   python3 scripts/start-with-keys.py --approved-test
   ```

   脚本先检查本机端口；随后用隐藏输入读取两枚 key，只交给本次 Node 进程。不写 `.env`、钥匙串、shell 历史或后台启动配置。关闭进程后需再次输入。不要把 key 发给聊天或放进命令参数。本轮仅编写脚本，没有运行密钥输入或开启真实开关。

3. 浏览器中新建仅含合成文字的项目，依次执行 AI 整理 → 人工核对来源与问题 → 确认 → 参考图 → 选择生成图并确认 World Labs。每个外部动作在页面上都需明确同意；新项目不会绕过已使用的一次额度。

## 已核对的协议与失败处理

- OpenAI `POST /v1/responses`，`store:false`、带来源 ID 的图文 content、严格 `text.format` schema。响应事实引用在本地重新校验。
- 图片 `POST /v1/images/generations`，明确 `quality:low`、`n:1`、`output_format:png`；只接受返回的 base64。生成图标为推测，不能升格为历史来源。
- World Labs `media-assets:prepare_upload` → 按 upload_info 指示上传 → `worlds:generate` → `operations/{id}` → `worlds/{id}`。使用 `WLT-Api-Key`，不把 key 传给上传或资产 CDN。
- 支持文字/单图/多图。多图设 `reconstruct_images:true`，不凭空指定方位；图片必须由用户选择属于同地、同目标年代的材料。`permission.public:false`。网页编辑能力不能据此推定 API 也支持。
- operation ID 落库后只恢复 GET 查询。429/超时/常见 5xx 退避，成功清除旧错误；401、无效结果等停止查询。查询最多 60 次或 1 小时，超过后 `needs_review`，不再生成。提交阶段未知结果也进入人工核对。
- 成功世界的 SPZ 优先读取 `100k`，其次 `500k` / full_res；只允许已保存任务且当前用户是项目成员。下载限制 64 MB、拒绝重定向、不附 key，存到 `data/world-assets/<job-id>.spz`。未知 CDN 主机、链接失效或不支持的扩展触发备用内容，不冒充成功。

## SPZ 实测与边界

<http://127.0.0.1:4317/spz-preview.html> 已在内置浏览器验证真实扫描渲染、拖动、重置、390×844 布局。使用 [Niantic 官方 SPZ 样例](https://github.com/nianticlabs/spz)，MIT 授权随文件保留；不是用户生成结果。没有安装 Three、Spark 或新增运行依赖。

原生解码支持 gzip v1–v3 / 分流 Zstd v4（不支持改变坐标/打包的扩展）。WebGL 渲染各向异性高斯，worker 做深度排序，最多显示 100k 点，只有 DC 颜色，无高阶球谐、碰撞体或生产级性能保证。World Labs 尺度、地面偏移和 180° X 轴变换遵循[官方渲染文档](https://docs.worldlabs.ai/api/rendering-spz)。真实供应商输出的显示质量与私有资产可读性尚未联调。

## 验证证据和剩余验收

`npm test` 包含后端与供应商边界测试。覆盖并发 HTTP 点击、重启、跨项目次数限制、模糊外部结果不重发、协议参数、轮询退避、SPZ v2/v3/v4、坐标变换和下载限制。测试预加载模块拦截所有供应商 URL，密钥是合成字符串，无真实费用。

已有 12 项完整 Demo 浏览器检查、桌面/手机页面截图及 28.48 秒真实操作录屏。追加 `evidence/spz-public-sample.png` 为实际 SPZ 画面导出。手机测试仅为桌面浏览器模拟视口，未测试 iPhone Safari 实机。

获批后首次联调仍要核对：账号/model 权限、图片生成返回、Agent 对同年代冲突的判断与来源准确性、实际账单、operation 恢复、真实 SPZ/缩略图链接与归档、3–5 个独立身份共享同一世界。正式远程手机访问还需要单独批准账号与托管方案；真实多人后端当前只监听回环地址。Pages 预览仅为独立静态合成示例。


2026-10-01 再次核对模型：官方 models 页面与 generate 接口均明确支持 `marble-1.0-draft`。默认值文档存在差异：models 页面称 1.0、将迁移至 1.1；[generate 接口文档](https://docs.worldlabs.ai/api/reference/worlds/generate)及 OpenAPI 已标 1.1。应用始终显式发送 Draft，未凭默认值切换模型，尚未进行真实调用验证。
