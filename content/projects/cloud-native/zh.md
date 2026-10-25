## 后端与 AWS 基础设施 {#overview}

我实现了用户、商品和图片管理的 Spring Boot 服务，并接入 AWS 计算、存储与邮件服务。Terraform 配置网络和应用资源，GitHub Actions 与 Packer 将每次发布构建为机器镜像。

应用运行在 {{fact:azs}} 个可用区的私有子网中，通过 HTTPS Application Load Balancer 接收请求。RDS MySQL 保存业务数据，Flyway 管理数据库变更，S3 保存商品图片。我配置了 Route 53 应用与邮件记录、TLS 监听器、各组件的 IAM 角色、KMS 加密与 Secrets Manager 访问。

用户注册后，后端发布 SNS 事件，由 Lambda 经 Mailgun 发送验证邮件，将邮件发送从注册请求中分离。

## 跨 AWS 账号的镜像发布 {#delivery}

我围绕版本化机器镜像设计发布流水线。GitHub Actions 在 dev 账号构建应用，Packer 将应用、systemd 服务和 CloudWatch agent 打包为镜像。工作流随后将镜像共享给 demo 账号，创建启动模板版本，并触发 Auto Scaling 实例刷新。

镜像和启动模板版本共同构成发布单元。实例从同一份产物启动，回滚时可以选择之前的版本。这条路径用镜像构建时间换取可重复的部署过程；成功运行中，从构建到实例刷新结束的耗时中位数为 {{fact:deploy_median}}。

实例启动时从 Secrets Manager 读取数据库密码，再启动应用与监控代理。镜像保存应用和运行配置，密钥在启动阶段注入。

## 网络与组件权限 {#boundaries}

我将 VPC 划分为公有和私有子网。负载均衡器接收公网流量，应用实例使用私有地址，通过 NAT 网关访问外部服务，并通过安全组引用连接 RDS。

各组件角色分别定义对 S3、KMS、Secrets Manager 和 SNS 的访问。Terraform 创建 {{fact:kms_keys}} 个客户管理的 KMS 密钥，用于对象存储、实例磁盘、数据库和密钥服务，并将生成的数据库密码写入 Secrets Manager。

应用层跨多个可用区运行，数据库与 NAT 网关采用单可用区配置，这是项目在基础设施成本上的选择。

## 业务数据与数据库变更 {#validation}

API 分别处理用户、商品和图片操作。MySQL 保存结构化记录，S3 保存图片对象。Flyway 执行数据库迁移，Hibernate 在服务启动时检查映射与数据库结构是否一致。

## AOP 指标采集与日志监控 {#observability}

我使用 Spring AOP 为控制器层和仓储层编写统一的监控切面，将指标采集与业务逻辑分离。控制器切面按 HTTP 状态码统计调用次数和耗时，仓储切面记录数据库操作的成功次数、错误次数与耗时。

指标通过 Micrometer 和 StatsD 汇集到 CloudWatch agent；结构化 JSON 日志发送至 CloudWatch Logs，便于分析接口与数据库访问情况。基础设施中的 CloudWatch CPU 告警联动 Auto Scaling 扩缩容策略。

## 异步邮箱验证 {#email}

我设计并实现了 SNS → Lambda → Mailgun 的异步邮箱验证流程。用户注册后，后端将验证事件发布到 SNS，由 Python Lambda 函数发送包含一次性、短时有效令牌的验证链接，邮件发送不阻塞注册接口。

Lambda 部署在 VPC 内，并通过独立的 GitHub Actions 工作流依次发布到 dev 和 demo 账号，将函数更新纳入自动化交付。

## 将应用需求落实到基础设施 {#planning}

我根据 API 的运行需求设计基础设施：数据库访问对应安全组规则和密钥读取，图片存储对应 S3 权限，注册事件对应 SNS 与 Lambda 集成。发布工作流再将这些要求落实到镜像和启动配置中。
