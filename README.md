# crawler 平台 Helm Charts

解耦自 `crawler-worker-python/deploy/helm/crawler-platform` 单一 umbrella chart。
按 devops-capability「一服务一 chart」约定，拆为 1 个 bootstrap + 7 个微服务 chart，
每个 chart 独立打包（`helm_package.sh`）、独立 release（`helm_install`）。

## 设计要点：解耦后的共享面

umbrella 内的共享资源（ConfigMap / 外部 Secret 引用 / 初始化 Job）抽到 **bootstrap chart `crawler-platform`**：

- ConfigMap `crawler-platform-config`：全部业务进程的非敏感共享配置（Kafka/RMQ/Mongo/Redis/Sonyflake/OTel）。
- 初始化 Job（helm hook，`pre-install`/`pre-upgrade`）：PG migrate（weight -5）→ Kafka topics / RMQ topology（weight -3）。
- 外部 Secret `crawler-platform-secrets`：**由基建预建**（ExternalSecrets/SealedSecrets），chart 只按名引用，不持久化密码。

各业务 chart 通过 `envFrom: configMapRef` + `secretKeyRef` **按名引用**上述 ConfigMap / Secret —— 这是解耦的核心。
滚动更新不再用 umbrella 的 `checksum/config`（跨 release 拿不到），改用本仓约定的 `forceUpdate` 时间戳注解。

## 镜像 ↔ build playbook（2 个镜像）

| 镜像 | build playbook | 构建方式 | 被哪些 chart 使用 |
|---|---|---|---|
| `crawler/crawler-backend-go` | `build_crawler-backend-go.yml` | `build_golang` (buildx) | crawler-api / -status-manager / -data-consumer / -admin-api + bootstrap 的 migrate Job |
| `crawler/crawler` | `build_crawler.yml` | `build_python` | crawler-worker-http / -general / -ifood |

## chart ↔ deploy playbook（8 个）

| chart | 工作负载 | 端口 | 特殊资源 | deploy playbook |
|---|---|---|---|---|
| `crawler-platform` | 3×Job(hook) + ConfigMap | — | 初始化 / 共享配置 | `deploy_crawler-platform.yml` |
| `crawler-api` | StatefulSet | 8080 | Service(headless+ClusterIP) + Ingress + HPA + PDB | `deploy_crawler-api.yml` |
| `crawler-status-manager` | Deployment | 8082 | Service + PDB | `deploy_crawler-status-manager.yml` |
| `crawler-data-consumer` | Deployment | 8083 | Service + PDB | `deploy_crawler-data-consumer.yml` |
| `crawler-admin-api` | Deployment | 8081 | Service(ClusterIP) + **NetworkPolicy** + PDB（无 Ingress） | `deploy_crawler-admin-api.yml` |
| `crawler-worker-http` | Deployment | 8080 | Service + 探针 | `deploy_crawler-worker-http.yml` |
| `crawler-worker-general` | Deployment | — | **KEDA** ScaledObject+TriggerAuth + PDB | `deploy_crawler-worker-general.yml` |
| `crawler-worker-ifood` | Deployment | — | IPIPGO 代理 env + 加重资源 + KEDA(可选) + PDB | `deploy_crawler-worker-ifood.yml` |

> 注：源 umbrella 的 `rmq-twitter`、`mongo-lease` 两个 worker 触发器本次未迁移（按需再加）。

## 部署顺序（重要）

1. **前置（基建一次性）**：在目标 namespace 预建
   - docker-registry 拉取 Secret `harbor`；
   - 外部 Secret `crawler-platform-secrets`（含 `POSTGRES_DSN` / `REDIS_ADDRS` / `REDIS_PASSWORD` / `MONGO_URI` / `RABBITMQ_URL` + `RABBITMQ_MGMT_URL/USER/PASS`）；
   - 如启用 KEDA：集群已装 KEDA Operator；如启用 ifood：Secret `crawler-ifood-proxy`（`IPIPGO_USER`/`IPIPGO_PASSWORD`）。
2. **bootstrap 先行**：`deploy_crawler-platform.yml` —— 落地 ConfigMap + 跑完 migrate / kafka-topic-init / rmq-topology-init。
   - `crawler_rmq_channels` 必须覆盖将要启用的 worker channel（如同时上 ifood，需加 `- ifood`）。
3. **再部业务**：其余 7 个 `deploy_*` playbook（彼此无强依赖，可并行）。

## 打包 / 升级

```bash
# 单 chart 打包并推 nexus（product=crawler）
sh helm_package.sh crawler-api crawler

# 或经 upgrade_helm_chart role 批量（版本变化才重打包上传）
# vars: { app_list: [crawler-platform, crawler-api, ...], nexus_domain: nexus.xiaoxitech.com }
```

deploy playbook 经 `helm_install` role：release 名 = chart 名 = `app_name`，
values 由 `charts/crawler/<app_name>/values.yaml.j2` 经 Ansible 渲染后传入 `helm upgrade --install`。

## rpc 子系统（spider_platform/rpc，独立于 crawler-platform 解耦面）

RPC gateway + 浏览器 Worker 框架（TikTok worker），源真相 `rpc/deploy/k8s/`。
**不依赖** `crawler-platform` bootstrap（无 PG/Kafka/RMQ/共享 ConfigMap），配置由各 chart
自建 ConfigMap 承载；仅复用 namespace 里预建的镜像拉取 Secret `harbor`。

| chart | 工作负载 | 端口 | 特殊资源 | build / deploy playbook |
|---|---|---|---|---|
| `crawler-rpc-gateway` | Deployment（**固定 1 副本 + Recreate**，注册表在进程内存） | 8765(ws) / 8766(http) | Service(ClusterIP) + 自建 ConfigMap | `build_crawler-rpc-gateway.yml` / `deploy_crawler-rpc-gateway.yml` |
| `crawler-worker-rpc` | Deployment（默认 3 副本 × 3 浏览器） | —（只外连 gateway WS） | 自建 ConfigMap + /dev/shm(Memory 2Gi) + /opt emptyDir + pgrep 探针 + PDB | `build_crawler-worker-rpc.yml` / `deploy_crawler-worker-rpc.yml` |

- 两个镜像同仓（`spider_platform/rpc`）不同 Dockerfile（`deploy/server/`、`deploy/worker/`），
  构建上下文均为仓库根；build 走 `build_python`，push 到 `nj-cp-harbor.xx6.cn/crawler/*`
 （基座任务显式传 `product=crawler`，勿挂 crawler-test.env）。
- **部署顺序**：先 `deploy_crawler-rpc-gateway.yml` 再 `deploy_crawler-worker-rpc.yml` ——
  worker chart 按 `ws://crawler-rpc-gateway.<release ns>.svc.cluster.local:8765` 回连注册。
- worker 扩容改 `crawler_worker_rpc_replica_count`（每副本固定 3 浏览器，资源按此配）；
  gateway 副本数不开放。CLOAK_PROXY 走 ConfigMap 明文（内网口径，源真相如此），
  出口不能是被屏蔽地区（如 HK）。

## cookies 子系统（spider_platform/cookies，独立于 crawler-platform 解耦面）

cookie 池生产者 cookiegen（in-process controller + worker 池），源真相 `cookies/deploy/cookiegen.yaml`。
**不依赖** `crawler-platform` bootstrap；配置由 chart 自建 ConfigMap + Secret 承载，
仅复用 namespace 里预建的镜像拉取 Secret `harbor`。

| chart | 工作负载 | 端口 | 特殊资源 | build / deploy playbook |
|---|---|---|---|---|
| `crawler-cookies` | Deployment（**固定 1 副本 + Recreate**，N 副本 = N 倍产量且互不协调） | 9090(metrics) | 自建 ConfigMap + Secret（REDIS_PASSWORD）+ metrics Service（prometheus.io 注解） | `build_crawler-cookies.yml` / `deploy_crawler-cookies.yml` |

- 镜像 `crawler/crawler-cookies`（仓库 `spider_platform/cookies`，根 Dockerfile，uv 多阶段、无浏览器）；
  build 走 `build_python`，push 到 `nj-cp-harbor.xx6.cn/crawler/*`（基座任务显式传 `product=crawler`，勿挂 crawler-test.env）。
- **依赖**：namespace 内已有 **Redis Cluster**（`crawler_cookies_redis_addrs` 逗号分隔 host:port 起始节点，
  须与 crawler 消费端同池 `serp:cookies`）与已部署的 `crawler-sgss-server`（SG_SS_API_URL 指向同 ns :8999）。
  代码 `redis_client.py` 恒走 RedisCluster，仅读 `REDIS_ADDRS` / `REDIS_PASSWORD`；密码经 crawler-test.json
  传 `crawler_cookies_redis_password`（勿提交 git）。
- 池水位 target / max_concurrency **不在 chart 配**，走 Redis 热配置（重启不丢、可热调）：
  `redis-cli HSET cookiegen:config:serp:cookies target 1000 max_concurrency 10`；
  换站点改 `crawler_cookies_site`（入口 `python -m cookiegen.sites.<site>`）。
