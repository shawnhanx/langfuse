# Langfuse托管架构设计

> 基于CProm托管监控的设计思路，实现Langfuse LLMOps平台的托管服务

## 1. 架构概览

### 1.1 整体架构图

```
┌─────────────────────────────────────────────────────────────────┐
│                          控制面（Control Plane）                   │
│  ┌──────────────────┐              ┌────────────────────┐       │
│  │ langfuse-service │─────CRUD────▶│resource-controller │       │
│  │  (业务逻辑层)      │              │  (资源编排层)       │       │
│  └──────────────────┘              └────────┬───────────┘       │
└────────────────────────────────────────────┼─────────────────────┘
                                             │
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┼━━━━━━━━━━━━━━━━━━━━
                                             │
┌────────────────────────────────────────────▼─────────────────────┐
│                         数据面（Data Plane）                       │
│  ┌──────────────┐      调用Langfuse资源                           │
│  │   langfuse   │◀─────────────────┐                             │
│  │   operator   │      调用CNCNetwork资源                         │
│  └──────┬───────┘◀─────────────────┤                             │
│         │                          │                             │
│         │创建CustomResource         │                             │
│         ▼                    ┌─────▼──────┐                      │
│  ┌─────────────────────────┐│            │                      │
│  │ Langfuse_CustomResource ││ APIServer  │                      │
│  │ ┌────────────────────┐  ││            │                      │
│  │ │ BOS (对象存储)      │  │└────────────┘                      │
│  │ │ ClickHouse (OLAP)  │  │       │                            │
│  │ │ Redis (缓存)        │  │       │调用CNCNetwork             │
│  │ │ PostgreSQL (OLTP)  │  │       │                            │
│  │ ├────────────────────┤  │       ▼                            │
│  │ │  langfuse-web      │◀─┼───┌────────┐                       │
│  │ │  (Next.js全栈应用)  │  │   │ nginx  │                       │
│  │ ├────────────────────┤  │   │(Ingress)│                      │
│  │ │ langfuse-worker    │  │   └───┬────┘                       │
│  │ │  (BullMQ多队列)    │  │       │                            │
│  │ └────────────────────┘  │   ┌───▼────┐                       │
│  └─────────────────────────┘   │  blb   │                       │
│                                 │(负载均衡)│                      │
│                                 └───┬────┘                       │
│                                     │                            │
│                              ┌──────▼────────┐                   │
│                              │  cncnetwork   │                   │
│                              │  (跨VPC通信)   │                   │
│                              └──────┬────────┘                   │
└──────────────────────────────────────┼────────────────────────────┘
                                      │
                    ┌─────────────────▼────────────────┐
                    │          VPC外                    │
                    │   ┌──────────┐   ┌──────────┐   │
                    │   │ ai-agent │───│服务网卡  │   │
                    │   └──────────┘   └──────────┘   │
                    └──────────────────────────────────┘
                                      │
                            https://{langfuse-id}.cnc.baidubce.bi.com
                            Authentication: sha256(pk:sk)
```

### 1.2 托管模式对比

| 维度 | CProm托管 | Langfuse托管 |
|------|-----------|-------------|
| **核心服务** | Prometheus/VictoriaMetrics | Langfuse (Web + Worker) |
| **存储后端** | VMStorage | PostgreSQL + ClickHouse + BOS + Redis |
| **采集代理** | VMAgent (部署到用户集群) | 无需采集，用户直接调用API |
| **访问方式** | PromQL查询 | RESTful API + Web UI |
| **网络隔离** | CNCNetwork | CNCNetwork |
| **多租户隔离** | 独立VMCluster | 独立Langfuse实例 + 独立数据库Schema |

---

## 2. CRD 设计

### 2.1 LangfuseInstance (核心CRD)

类似于CProm的`MonitorInstance`，定义Langfuse实例的配置。

#### API定义

```go
// pkg/apis/langfuse/v1/langfuse_instance_types.go

package v1

import (
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

// LangfuseInstanceSpec 定义Langfuse实例的期望状态
type LangfuseInstanceSpec struct {
	// 实例版本
	Version string `json:"version"`

	// 部署配置
	DeploymentConfig LangfuseDeploymentConfig `json:"deploymentConfig"`

	// 存储配置
	StorageConfig LangfuseStorageConfig `json:"storageConfig"`

	// 网络配置
	NetworkConfig NetworkConfig `json:"networkConfig"`

	// 认证配置
	AuthConfig AuthConfig `json:"authConfig,omitempty"`
}

// LangfuseDeploymentConfig 部署配置
type LangfuseDeploymentConfig struct {
	// Web服务配置
	Web ComponentConfig `json:"web"`

	// Worker服务配置
	Worker ComponentConfig `json:"worker"`

	// Nginx配置
	Nginx NginxConfig `json:"nginx,omitempty"`
}

// ComponentConfig 组件通用配置
type ComponentConfig struct {
	// 副本数
	Replicas int32 `json:"replicas"`

	// 资源规格
	Resources ResourceRequirements `json:"resources"`

	// 镜像配置
	Image ImageConfig `json:"image,omitempty"`
}

// LangfuseStorageConfig 存储配置
type LangfuseStorageConfig struct {
	// PostgreSQL配置 (主数据库)
	PostgreSQL DatabaseConfig `json:"postgresql"`

	// ClickHouse配置 (OLAP分析)
	ClickHouse DatabaseConfig `json:"clickhouse"`

	// Redis配置 (缓存)
	Redis RedisConfig `json:"redis"`

	// BOS配置 (对象存储)
	BOS BOSConfig `json:"bos"`
}

// DatabaseConfig 数据库配置
type DatabaseConfig struct {
	// 数据库类型: managed (托管) / external (外部)
	Type string `json:"type"`

	// 托管数据库配置
	ManagedConfig *ManagedDatabaseConfig `json:"managedConfig,omitempty"`

	// 外部数据库配置
	ExternalConfig *ExternalDatabaseConfig `json:"externalConfig,omitempty"`
}

// ManagedDatabaseConfig 托管数据库配置
type ManagedDatabaseConfig struct {
	// 存储大小 (GB)
	StorageSize int `json:"storageSize"`

	// 存储类型: SSD / HDD
	StorageClass string `json:"storageClass"`

	// CPU核数
	CPU int `json:"cpu"`

	// 内存大小 (GB)
	Memory int `json:"memory"`

	// 高可用配置
	HighAvailability bool `json:"highAvailability"`
}

// ExternalDatabaseConfig 外部数据库配置
type ExternalDatabaseConfig struct {
	// 连接地址
	Host string `json:"host"`

	// 端口
	Port int `json:"port"`

	// 数据库名
	Database string `json:"database"`

	// 用户名
	Username string `json:"username"`

	// 密码Secret引用
	PasswordSecret string `json:"passwordSecret"`
}

// RedisConfig Redis配置
type RedisConfig struct {
	// 类型: managed / external
	Type string `json:"type"`

	// 托管Redis配置
	ManagedConfig *ManagedRedisConfig `json:"managedConfig,omitempty"`

	// 外部Redis配置
	ExternalConfig *ExternalRedisConfig `json:"externalConfig,omitempty"`
}

// BOSConfig 对象存储配置
type BOSConfig struct {
	// Bucket名称
	Bucket string `json:"bucket"`

	// 区域
	Region string `json:"region"`

	// 访问密钥Secret引用
	AccessKeySecret string `json:"accessKeySecret"`
}

// NetworkConfig 网络配置
type NetworkConfig struct {
	// 是否启用公网访问
	PublicAccess bool `json:"publicAccess"`

	// 自定义域名
	CustomDomain string `json:"customDomain,omitempty"`

	// CNCNetwork配置
	CNCNetworkConfig CNCNetworkConfig `json:"cncNetworkConfig,omitempty"`
}

// CNCNetworkConfig 跨VPC网络配置
type CNCNetworkConfig struct {
	// 是否启用CNCNetwork
	Enabled bool `json:"enabled"`

	// 允许访问的VPC列表
	AllowedVPCs []string `json:"allowedVPCs,omitempty"`
}

// AuthConfig 认证配置
type AuthConfig struct {
	// 是否启用身份验证
	Enabled bool `json:"enabled"`

	// 认证方式: api-key / oauth / ldap
	Method string `json:"method"`

	// SSO配置
	SSOConfig *SSOConfig `json:"ssoConfig,omitempty"`
}

// LangfuseInstanceStatus 定义Langfuse实例的观测状态
type LangfuseInstanceStatus struct {
	// 实例阶段: Pending / Creating / Running / Failed / Terminating
	Phase LangfuseInstancePhase `json:"phase"`

	// 访问端点
	Endpoints LangfuseEndpoints `json:"endpoints,omitempty"`

	// 组件状态
	ComponentStatus map[string]ComponentStatus `json:"componentStatus,omitempty"`

	// 访问凭证
	Credentials Credentials `json:"credentials,omitempty"`

	// 条件信息
	Conditions []metav1.Condition `json:"conditions,omitempty"`

	// 最后更新时间
	LastUpdateTime *metav1.Time `json:"lastUpdateTime,omitempty"`
}

// LangfuseInstancePhase 实例阶段
type LangfuseInstancePhase string

const (
	LangfuseInstancePhasePending      LangfuseInstancePhase = "Pending"
	LangfuseInstancePhaseCreating     LangfuseInstancePhase = "Creating"
	LangfuseInstancePhaseRunning      LangfuseInstancePhase = "Running"
	LangfuseInstancePhaseFailed       LangfuseInstancePhase = "Failed"
	LangfuseInstancePhaseTerminating  LangfuseInstancePhase = "Terminating"
)

// LangfuseEndpoints 访问端点
type LangfuseEndpoints struct {
	// Web UI地址
	WebUI string `json:"webUI"`

	// API地址
	API string `json:"api"`

	// 内网访问地址
	InternalEndpoint string `json:"internalEndpoint,omitempty"`
}

// ComponentStatus 组件状态
type ComponentStatus struct {
	// 就绪副本数
	ReadyReplicas int32 `json:"readyReplicas"`

	// 期望副本数
	DesiredReplicas int32 `json:"desiredReplicas"`

	// 状态: Ready / NotReady / Unknown
	Status string `json:"status"`
}

// Credentials 访问凭证
type Credentials struct {
	// 初始管理员用户名
	AdminUsername string `json:"adminUsername,omitempty"`

	// 初始管理员密码Secret引用
	AdminPasswordSecret string `json:"adminPasswordSecret,omitempty"`

	// API认证密钥
	APIKey string `json:"apiKey,omitempty"`
}

// +kubebuilder:object:root=true
// +kubebuilder:subresource:status
// +kubebuilder:resource:scope=Namespaced
// +kubebuilder:printcolumn:name="Phase",type=string,JSONPath=`.status.phase`
// +kubebuilder:printcolumn:name="WebUI",type=string,JSONPath=`.status.endpoints.webUI`
// +kubebuilder:printcolumn:name="Age",type=date,JSONPath=`.metadata.creationTimestamp`

// LangfuseInstance 是Langfuse实例的Schema
type LangfuseInstance struct {
	metav1.TypeMeta   `json:",inline"`
	metav1.ObjectMeta `json:"metadata,omitempty"`

	Spec   LangfuseInstanceSpec   `json:"spec,omitempty"`
	Status LangfuseInstanceStatus `json:"status,omitempty"`
}

// +kubebuilder:object:root=true

// LangfuseInstanceList 包含LangfuseInstance的列表
type LangfuseInstanceList struct {
	metav1.TypeMeta `json:",inline"`
	metav1.ListMeta `json:"metadata,omitempty"`
	Items           []LangfuseInstance `json:"items"`
}

func init() {
	SchemeBuilder.Register(&LangfuseInstance{}, &LangfuseInstanceList{})
}
```

#### 使用示例

```yaml
apiVersion: langfuse.baidu.com/v1
kind: LangfuseInstance
metadata:
  name: my-langfuse
  namespace: langfuse-system
spec:
  version: "v2.51.0"

  deploymentConfig:
    web:
      replicas: 2
      resources:
        cpu: 2
        memory: 4Gi
    worker:
      replicas: 3
      resources:
        cpu: 1
        memory: 2Gi

  storageConfig:
    postgresql:
      type: managed
      managedConfig:
        storageSize: 100
        storageClass: SSD
        cpu: 4
        memory: 8
        highAvailability: true

    clickhouse:
      type: managed
      managedConfig:
        storageSize: 500
        storageClass: SSD
        cpu: 8
        memory: 16

    redis:
      type: managed
      managedConfig:
        memory: 4

    bos:
      bucket: langfuse-traces
      region: bj
      accessKeySecret: langfuse-bos-secret

  networkConfig:
    publicAccess: true
    customDomain: "my-langfuse.example.com"
    cncNetworkConfig:
      enabled: true
      allowedVPCs:
        - vpc-xxx123
        - vpc-yyy456

  authConfig:
    enabled: true
    method: api-key
```

---

## 3. 控制器架构

参考CProm的双控制器架构：`cprom-controller` + `cprom-service`

### 3.1 resource-controller (资源编排控制器)

> 类似CProm的 `cprom-controller`，运行在**资源集群**

#### 职责

1. **监听LangfuseInstance CRD**
   - Watch LangfuseInstance的创建/更新/删除事件

2. **Namespace管理**
   - 为每个实例创建独立的Namespace
   - 格式: `langfuse-{instance-id}`

3. **Helm Release管理**
   - 通过Helm部署langfuse-instance Chart
   - 管理Chart版本升级
   - 处理删除时的资源清理

4. **CNCNetwork资源创建**
   - 创建跨VPC网络配置
   - 配置BLB负载均衡器
   - 管理域名映射

5. **状态同步**
   - 定期同步Pod状态到CRD Status
   - 更新Endpoints信息
   - 汇报组件健康状态

#### 核心代码结构

```go
// services/resource-controller/controllers/langfuse_instance_controller.go

package controllers

import (
	"context"
	langfusev1 "icode.baidu.com/baidu/cprom/cloud-stack/pkg/apis/langfuse/v1"
	"sigs.k8s.io/controller-runtime/pkg/reconcile"
)

type LangfuseInstanceReconciler struct {
	client.Client
	Scheme *runtime.Scheme
	HelmClient helm.Client
}

func (r *LangfuseInstanceReconciler) Reconcile(ctx context.Context, req reconcile.Request) (reconcile.Result, error) {
	log := log.FromContext(ctx)

	// 1. 获取LangfuseInstance
	instance := &langfusev1.LangfuseInstance{}
	if err := r.Get(ctx, req.NamespacedName, instance); err != nil {
		return reconcile.Result{}, client.IgnoreNotFound(err)
	}

	// 2. 处理删除逻辑
	if !instance.DeletionTimestamp.IsZero() {
		return r.reconcileDelete(ctx, instance)
	}

	// 3. 确保Finalizer存在
	if err := r.ensureFinalizer(ctx, instance); err != nil {
		return reconcile.Result{}, err
	}

	// 4. 创建独立Namespace
	if err := r.ensureNamespace(ctx, instance); err != nil {
		return reconcile.Result{}, err
	}

	// 5. 部署Helm Release (langfuse-instance)
	if err := r.ensureHelmRelease(ctx, instance); err != nil {
		return reconcile.Result{}, err
	}

	// 6. 创建CNCNetwork资源
	if err := r.ensureCNCNetwork(ctx, instance); err != nil {
		return reconcile.Result{}, err
	}

	// 7. 等待CNCNetwork就绪
	if err := r.ensureCNCNetworkReady(ctx, instance); err != nil {
		return reconcile.Result{RequeueAfter: 10 * time.Second}, err
	}

	// 8. 更新Status
	if err := r.updateStatus(ctx, instance); err != nil {
		return reconcile.Result{}, err
	}

	return reconcile.Result{RequeueAfter: 1 * time.Minute}, nil
}

// ensureNamespace 确保实例独立命名空间存在
func (r *LangfuseInstanceReconciler) ensureNamespace(ctx context.Context, instance *langfusev1.LangfuseInstance) error {
	namespace := fmt.Sprintf("langfuse-%s", instance.Name)

	ns := &corev1.Namespace{
		ObjectMeta: metav1.ObjectMeta{
			Name: namespace,
			Labels: map[string]string{
				"langfuse.baidu.com/instance": instance.Name,
			},
		},
	}

	return r.Create(ctx, ns)
}

// ensureHelmRelease 通过Helm部署Langfuse实例
func (r *LangfuseInstanceReconciler) ensureHelmRelease(ctx context.Context, instance *langfusev1.LangfuseInstance) error {
	releaseName := fmt.Sprintf("langfuse-%s", instance.Name)
	namespace := fmt.Sprintf("langfuse-%s", instance.Name)

	// 生成Helm values
	values := r.generateHelmValues(instance)

	// 安装或升级Helm Chart
	return r.HelmClient.InstallOrUpgrade(
		releaseName,
		"charts/langfuse-instance",
		namespace,
		values,
	)
}

// ensureCNCNetwork 创建跨VPC网络配置
func (r *LangfuseInstanceReconciler) ensureCNCNetwork(ctx context.Context, instance *langfusev1.LangfuseInstance) error {
	if !instance.Spec.NetworkConfig.CNCNetworkConfig.Enabled {
		return nil
	}

	cncNetwork := &cncv1.CNCNetwork{
		ObjectMeta: metav1.ObjectMeta{
			Name:      fmt.Sprintf("langfuse-%s", instance.Name),
			Namespace: fmt.Sprintf("langfuse-%s", instance.Name),
		},
		Spec: cncv1.CNCNetworkSpec{
			ServiceName: fmt.Sprintf("langfuse-%s-nginx", instance.Name),
			ServicePort: 80,
			AllowedVPCs: instance.Spec.NetworkConfig.CNCNetworkConfig.AllowedVPCs,
		},
	}

	return r.Create(ctx, cncNetwork)
}
```

### 3.2 langfuse-service (业务逻辑服务)

> 类似CProm的 `cprom-service`，提供RESTful API和业务逻辑

#### 职责

1. **接收用户请求**
   - 创建/查询/更新/删除Langfuse实例
   - 管理项目和API Keys

2. **CRUD操作CRD**
   - 通过Kubernetes API操作LangfuseInstance CRD

3. **数据库管理**
   - 存储实例元数据
   - 管理租户信息
   - 记录计费数据

4. **凭证管理**
   - 生成初始管理员账号
   - 管理API Keys
   - 生成访问Token

5. **计费集成**
   - 统计资源使用量
   - 对接计费系统

#### API设计

```go
// services/langfuse-service/api/instance.go

// POST /api/v1/instances
// 创建Langfuse实例
func CreateInstance(c *gin.Context) {
	var req CreateInstanceRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": err.Error()})
		return
	}

	// 1. 参数校验
	if err := validateRequest(req); err != nil {
		c.JSON(400, gin.H{"error": err.Error()})
		return
	}

	// 2. 创建数据库记录
	instanceID := generateInstanceID()
	dbInstance := &models.LangfuseInstance{
		InstanceID: instanceID,
		UserID:     req.UserID,
		Name:       req.Name,
		Status:     "Creating",
	}
	if err := db.Create(dbInstance).Error; err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}

	// 3. 创建LangfuseInstance CRD
	instance := &langfusev1.LangfuseInstance{
		ObjectMeta: metav1.ObjectMeta{
			Name:      instanceID,
			Namespace: "langfuse-system",
		},
		Spec: req.ToSpec(),
	}

	if err := k8sClient.Create(context.Background(), instance); err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}

	// 4. 返回实例ID
	c.JSON(200, gin.H{
		"instanceId": instanceID,
		"status":     "Creating",
		"message":    "Instance creation initiated",
	})
}

// GET /api/v1/instances/:id
// 查询实例状态
func GetInstance(c *gin.Context) {
	instanceID := c.Param("id")

	// 1. 从数据库获取基本信息
	dbInstance := &models.LangfuseInstance{}
	if err := db.Where("instance_id = ?", instanceID).First(dbInstance).Error; err != nil {
		c.JSON(404, gin.H{"error": "Instance not found"})
		return
	}

	// 2. 从CRD获取实时状态
	instance := &langfusev1.LangfuseInstance{}
	if err := k8sClient.Get(context.Background(),
		client.ObjectKey{Name: instanceID, Namespace: "langfuse-system"},
		instance); err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}

	// 3. 返回合并后的信息
	c.JSON(200, gin.H{
		"instanceId": instanceID,
		"name":       dbInstance.Name,
		"status":     instance.Status.Phase,
		"endpoints":  instance.Status.Endpoints,
		"createdAt":  dbInstance.CreatedAt,
	})
}
```

---

## 4. Langfuse Operator

> 类似于VM Operator，负责监听CRD并创建实际的Kubernetes资源

### 4.1 职责

1. **监听LangfuseInstance CRD**
   - Watch CRD变化事件

2. **创建StatefulSet/Deployment**
   - 部署PostgreSQL StatefulSet (如果是托管模式)
   - 部署ClickHouse StatefulSet
   - 部署Redis StatefulSet
   - 部署langfuse-web Deployment
   - 部署langfuse-worker Deployment

3. **创建Service**
   - PostgreSQL Service
   - ClickHouse Service
   - Redis Service
   - langfuse-web Service
   - langfuse-worker Service

4. **创建Ingress/Nginx**
   - 配置Nginx反向代理
   - 配置SSL证书
   - 配置路由规则

5. **创建PVC**
   - PostgreSQL数据持久化
   - ClickHouse数据持久化

6. **配置Secret**
   - 数据库密码
   - API Keys
   - 对象存储凭证

### 4.2 Operator代码结构

```go
// services/langfuse-operator/controllers/langfuse_controller.go

package controllers

import (
	langfusev1 "icode.baidu.com/baidu/cprom/cloud-stack/pkg/apis/langfuse/v1"
)

type LangfuseReconciler struct {
	client.Client
	Scheme *runtime.Scheme
}

func (r *LangfuseReconciler) Reconcile(ctx context.Context, req reconcile.Request) (reconcile.Result, error) {
	instance := &langfusev1.LangfuseInstance{}
	if err := r.Get(ctx, req.NamespacedName, instance); err != nil {
		return reconcile.Result{}, client.IgnoreNotFound(err)
	}

	// 1. 创建Secret (数据库密码等)
	if err := r.ensureSecrets(ctx, instance); err != nil {
		return reconcile.Result{}, err
	}

	// 2. 创建PostgreSQL
	if err := r.ensurePostgreSQL(ctx, instance); err != nil {
		return reconcile.Result{}, err
	}

	// 3. 创建ClickHouse
	if err := r.ensureClickHouse(ctx, instance); err != nil {
		return reconcile.Result{}, err
	}

	// 4. 创建Redis
	if err := r.ensureRedis(ctx, instance); err != nil {
		return reconcile.Result{}, err
	}

	// 5. 等待数据库就绪
	if !r.isDatabaseReady(ctx, instance) {
		return reconcile.Result{RequeueAfter: 10 * time.Second}, nil
	}

	// 6. 初始化数据库Schema
	if err := r.initializeDatabase(ctx, instance); err != nil {
		return reconcile.Result{}, err
	}

	// 7. 创建langfuse-web
	if err := r.ensureLangfuseWeb(ctx, instance); err != nil {
		return reconcile.Result{}, err
	}

	// 8. 创建langfuse-worker
	if err := r.ensureLangfuseWorker(ctx, instance); err != nil {
		return reconcile.Result{}, err
	}

	// 9. 创建Nginx Ingress
	if err := r.ensureNginx(ctx, instance); err != nil {
		return reconcile.Result{}, err
	}

	return reconcile.Result{}, nil
}

// ensurePostgreSQL 创建PostgreSQL StatefulSet
func (r *LangfuseReconciler) ensurePostgreSQL(ctx context.Context, instance *langfusev1.LangfuseInstance) error {
	if instance.Spec.StorageConfig.PostgreSQL.Type == "external" {
		return nil // 使用外部数据库，跳过创建
	}

	statefulSet := &appsv1.StatefulSet{
		ObjectMeta: metav1.ObjectMeta{
			Name:      fmt.Sprintf("%s-postgresql", instance.Name),
			Namespace: instance.Namespace,
		},
		Spec: appsv1.StatefulSetSpec{
			Replicas: pointer.Int32(1),
			Selector: &metav1.LabelSelector{
				MatchLabels: map[string]string{
					"app": "postgresql",
					"instance": instance.Name,
				},
			},
			Template: corev1.PodTemplateSpec{
				ObjectMeta: metav1.ObjectMeta{
					Labels: map[string]string{
						"app": "postgresql",
						"instance": instance.Name,
					},
				},
				Spec: corev1.PodSpec{
					Containers: []corev1.Container{
						{
							Name:  "postgresql",
							Image: "postgres:15",
							Env: []corev1.EnvVar{
								{Name: "POSTGRES_DB", Value: "langfuse"},
								{Name: "POSTGRES_USER", Value: "langfuse"},
								{Name: "POSTGRES_PASSWORD", ValueFrom: &corev1.EnvVarSource{
									SecretKeyRef: &corev1.SecretKeySelector{
										LocalObjectReference: corev1.LocalObjectReference{
											Name: fmt.Sprintf("%s-db-secret", instance.Name),
										},
										Key: "password",
									},
								}},
							},
							VolumeMounts: []corev1.VolumeMount{
								{Name: "data", MountPath: "/var/lib/postgresql/data"},
							},
						},
					},
				},
			},
			VolumeClaimTemplates: []corev1.PersistentVolumeClaim{
				{
					ObjectMeta: metav1.ObjectMeta{Name: "data"},
					Spec: corev1.PersistentVolumeClaimSpec{
						AccessModes: []corev1.PersistentVolumeAccessMode{corev1.ReadWriteOnce},
						Resources: corev1.ResourceRequirements{
							Requests: corev1.ResourceList{
								corev1.ResourceStorage: resource.MustParse(
									fmt.Sprintf("%dGi", instance.Spec.StorageConfig.PostgreSQL.ManagedConfig.StorageSize),
								),
							},
						},
					},
				},
			},
		},
	}

	return r.Create(ctx, statefulSet)
}

// ensureLangfuseWeb 创建Langfuse Web Deployment
func (r *LangfuseReconciler) ensureLangfuseWeb(ctx context.Context, instance *langfusev1.LangfuseInstance) error {
	deployment := &appsv1.Deployment{
		ObjectMeta: metav1.ObjectMeta{
			Name:      fmt.Sprintf("%s-web", instance.Name),
			Namespace: instance.Namespace,
		},
		Spec: appsv1.DeploymentSpec{
			Replicas: &instance.Spec.DeploymentConfig.Web.Replicas,
			Selector: &metav1.LabelSelector{
				MatchLabels: map[string]string{
					"app": "langfuse-web",
					"instance": instance.Name,
				},
			},
			Template: corev1.PodTemplateSpec{
				ObjectMeta: metav1.ObjectMeta{
					Labels: map[string]string{
						"app": "langfuse-web",
						"instance": instance.Name,
					},
				},
				Spec: corev1.PodSpec{
					Containers: []corev1.Container{
						{
							Name:  "web",
							Image: fmt.Sprintf("langfuse/langfuse:%s", instance.Spec.Version),
							Env: r.generateWebEnvVars(instance),
							Ports: []corev1.ContainerPort{
								{ContainerPort: 3000, Protocol: corev1.ProtocolTCP},
							},
						},
					},
				},
			},
		},
	}

	return r.Create(ctx, deployment)
}

// generateWebEnvVars 生成Web服务的环境变量
func (r *LangfuseReconciler) generateWebEnvVars(instance *langfusev1.LangfuseInstance) []corev1.EnvVar {
	return []corev1.EnvVar{
		{Name: "NODE_ENV", Value: "production"},
		{Name: "DATABASE_URL", Value: r.getDatabaseURL(instance)},
		{Name: "CLICKHOUSE_URL", Value: r.getClickHouseURL(instance)},
		{Name: "REDIS_URL", Value: r.getRedisURL(instance)},
		{Name: "S3_ENDPOINT", Value: r.getBOSEndpoint(instance)},
		{Name: "S3_BUCKET_NAME", Value: instance.Spec.StorageConfig.BOS.Bucket},
		{Name: "NEXTAUTH_URL", Value: instance.Status.Endpoints.WebUI},
		// ... 更多环境变量
	}
}
```

---

## 5. Helm Charts 设计

### 5.1 Charts 结构

```
charts/
├── langfuse-instance/           # 主Chart（由resource-controller部署）
│   ├── Chart.yaml
│   ├── values.yaml
│   ├── templates/
│   │   ├── langfuse-custom-resource.yaml  # 创建LangfuseInstance CRD实例
│   │   ├── cncnetwork.yaml                # 创建CNCNetwork
│   │   └── secret.yaml                    # 创建初始Secret
│   └── charts/                            # 子Charts
│       └── langfuse-operator/             # Operator Chart
│           ├── Chart.yaml
│           ├── templates/
│           │   ├── deployment.yaml        # Operator Deployment
│           │   ├── rbac.yaml              # ServiceAccount/Role/RoleBinding
│           │   └── service.yaml
│           └── values.yaml
```

### 5.2 langfuse-instance Chart

#### values.yaml

```yaml
# Langfuse版本
version: "v2.51.0"

# 实例配置
instance:
  name: "my-langfuse"
  namespace: "langfuse-system"

# Web服务配置
web:
  replicas: 2
  image:
    repository: langfuse/langfuse
    tag: "v2.51.0"
  resources:
    requests:
      cpu: "1000m"
      memory: "2Gi"
    limits:
      cpu: "2000m"
      memory: "4Gi"

# Worker服务配置
worker:
  replicas: 3
  image:
    repository: langfuse/langfuse
    tag: "v2.51.0"
  resources:
    requests:
      cpu: "500m"
      memory: "1Gi"
    limits:
      cpu: "1000m"
      memory: "2Gi"

# PostgreSQL配置
postgresql:
  enabled: true  # 是否启用托管PostgreSQL
  image:
    repository: postgres
    tag: "15"
  persistence:
    size: 100Gi
    storageClass: "cce-ssd"
  resources:
    requests:
      cpu: "2000m"
      memory: "4Gi"

# ClickHouse配置
clickhouse:
  enabled: true
  image:
    repository: clickhouse/clickhouse-server
    tag: "23.8"
  persistence:
    size: 500Gi
    storageClass: "cce-ssd"
  resources:
    requests:
      cpu: "4000m"
      memory: "8Gi"

# Redis配置
redis:
  enabled: true
  image:
    repository: redis
    tag: "7"
  resources:
    requests:
      cpu: "500m"
      memory: "2Gi"

# Nginx配置
nginx:
  enabled: true
  image:
    repository: nginx
    tag: "1.25"
  replicas: 2

# BOS对象存储配置
bos:
  bucket: "langfuse-traces"
  region: "bj"
  accessKeySecret: "langfuse-bos-secret"

# CNCNetwork配置
cncnetwork:
  enabled: true
  allowedVPCs:
    - "vpc-xxx123"
    - "vpc-yyy456"

# 网络配置
networking:
  publicAccess: true
  customDomain: ""
```

#### templates/langfuse-custom-resource.yaml

```yaml
apiVersion: langfuse.baidu.com/v1
kind: LangfuseInstance
metadata:
  name: {{ .Values.instance.name }}
  namespace: {{ .Values.instance.namespace }}
  labels:
    {{- include "langfuse.labels" . | nindent 4 }}
spec:
  version: {{ .Values.version }}

  deploymentConfig:
    web:
      replicas: {{ .Values.web.replicas }}
      resources:
        cpu: {{ .Values.web.resources.requests.cpu }}
        memory: {{ .Values.web.resources.requests.memory }}
      image:
        repository: {{ .Values.web.image.repository }}
        tag: {{ .Values.web.image.tag }}

    worker:
      replicas: {{ .Values.worker.replicas }}
      resources:
        cpu: {{ .Values.worker.resources.requests.cpu }}
        memory: {{ .Values.worker.resources.requests.memory }}
      image:
        repository: {{ .Values.worker.image.repository }}
        tag: {{ .Values.worker.image.tag }}

  storageConfig:
    postgresql:
      type: {{ if .Values.postgresql.enabled }}managed{{ else }}external{{ end }}
      {{- if .Values.postgresql.enabled }}
      managedConfig:
        storageSize: {{ .Values.postgresql.persistence.size | trimSuffix "Gi" | int }}
        storageClass: {{ .Values.postgresql.persistence.storageClass }}
        cpu: {{ .Values.postgresql.resources.requests.cpu | trimSuffix "m" | int | div 1000 }}
        memory: {{ .Values.postgresql.resources.requests.memory | trimSuffix "Gi" | int }}
        highAvailability: false
      {{- end }}

    clickhouse:
      type: managed
      managedConfig:
        storageSize: {{ .Values.clickhouse.persistence.size | trimSuffix "Gi" | int }}
        storageClass: {{ .Values.clickhouse.persistence.storageClass }}
        cpu: {{ .Values.clickhouse.resources.requests.cpu | trimSuffix "m" | int | div 1000 }}
        memory: {{ .Values.clickhouse.resources.requests.memory | trimSuffix "Gi" | int }}

    redis:
      type: managed
      managedConfig:
        memory: {{ .Values.redis.resources.requests.memory | trimSuffix "Gi" | int }}

    bos:
      bucket: {{ .Values.bos.bucket }}
      region: {{ .Values.bos.region }}
      accessKeySecret: {{ .Values.bos.accessKeySecret }}

  networkConfig:
    publicAccess: {{ .Values.networking.publicAccess }}
    {{- if .Values.networking.customDomain }}
    customDomain: {{ .Values.networking.customDomain }}
    {{- end }}
    cncNetworkConfig:
      enabled: {{ .Values.cncnetwork.enabled }}
      {{- if .Values.cncnetwork.allowedVPCs }}
      allowedVPCs:
        {{- toYaml .Values.cncnetwork.allowedVPCs | nindent 8 }}
      {{- end }}

  authConfig:
    enabled: true
    method: api-key
```

---

## 6. 数据流向

### 6.1 用户访问流程

```
┌────────────────────────────────────────────────────────────────┐
│                      用户AI应用 (VPC外)                          │
│                                                                 │
│  import { Langfuse } from "langfuse"                           │
│                                                                 │
│  const langfuse = new Langfuse({                               │
│    publicKey: "pk-xxx",                                        │
│    secretKey: "sk-xxx",                                        │
│    baseUrl: "https://langfuse-abc123.cnc.baidubce.bi.com"     │
│  })                                                             │
│                                                                 │
│  langfuse.trace({...})  // 发送trace数据                        │
└─────────────────────────┬──────────────────────────────────────┘
                          │ HTTPS POST /api/public/traces
                          │ Authorization: sha256(pk:sk)
                          ▼
┌────────────────────────────────────────────────────────────────┐
│                      服务网卡 (VPC边界)                          │
└─────────────────────────┬──────────────────────────────────────┘
                          │
                          ▼
┌────────────────────────────────────────────────────────────────┐
│                     CNCNetwork (跨VPC通信)                      │
└─────────────────────────┬──────────────────────────────────────┘
                          │
                          ▼
┌────────────────────────────────────────────────────────────────┐
│                      BLB (负载均衡器)                            │
└─────────────────────────┬──────────────────────────────────────┘
                          │
                          ▼
┌────────────────────────────────────────────────────────────────┐
│                      Nginx Ingress                              │
│  - SSL终止                                                       │
│  - 路由转发                                                      │
│  - 请求限流                                                      │
└─────────────────────────┬──────────────────────────────────────┘
                          │
                          ▼
┌────────────────────────────────────────────────────────────────┐
│                    langfuse-web Service                         │
│  - Next.js全栈应用(前端UI+后端API)                              │
│  - API路由处理                                                  │
│  - 身份验证                                                     │
└─────────────────────────┬──────────────────────────────────────┘
                          │
                          ├──────────────────┬──────────────────┐
                          │                  │                  │
                          ▼                  ▼                  ▼
          ┌───────────────────┐  ┌──────────────────┐  ┌───────────────────┐
          │   PostgreSQL       │  │  ClickHouse      │  │   BOS (对象存储)   │
          │  (主数据库)         │  │  (OLAP分析)      │  │  - 事件原始数据    │
          │  - 用户数据         │  │  - Trace数据     │  │  - 持久化存储      │
          │  - 项目配置         │  │  - 指标聚合      │  │  - 数据归档        │
          │  - API Keys        │  │  - 时序分析      │  │  - 批量导出文件    │
          └───────────────────┘  └──────────────────┘  └───────┬───────────┘
                    │                      ▲                    │
                    │                      │                    │读取事件数据
                    ▼                      │                    │
          ┌───────────────────┐            │                    │
          │   Redis (缓存)     │            │                    │
          │  - Session         │            │                    │
          │  - 任务队列         │            │                    │
          └───────┬───────────┘            │                    │
                  │                        │                    │
                  │IngestionQueue          │                    │
                  ▼                        │                    │
          ┌───────────────────┐            │                    │
          │ langfuse-worker    │────────────┴────────────────────┘
          │  (后台任务)         │  批量写入ClickHouse & PostgreSQL
          │  - 数据聚合         │
          │  - 报表生成         │
          │  - 定时任务         │
          └───────────────────┘
```

### 6.2 数据写入流程

```
1. AI应用调用SDK
   └─> langfuse.trace({...})

2. SDK发送HTTP请求
   └─> POST https://{instance-id}.cnc.baidubce.bi.com/api/public/ingestion
       Header: Authorization: Bearer {publicKey}:{secretKey}
       Body: { batch: [{ type: "trace-create", body: {...} }] }

3. 经过网络层
   └─> 服务网卡 -> CNCNetwork -> BLB -> Nginx

4. langfuse-web接收请求 (processEventBatch)
   ├─> 验证API Key (从PostgreSQL + Redis缓存查询)
   ├─> 速率限制检查
   ├─> 批量验证事件数据
   ├─> 上传事件到BOS (S3兼容存储,用于持久化和事件缓存)
   ├─> 将事件加入Redis IngestionQueue (异步处理)
   └─> 返回207 Multi-Status (包含每个事件的处理结果)

5. langfuse-worker消费队列 (ingestionQueueProcessor)
   ├─> 从Redis IngestionQueue获取任务
   ├─> 从BOS下载事件数据 (如果启用S3存储)
   ├─> 解析和转换Trace/Observation/Score等数据
   ├─> 写入PostgreSQL (事务型数据: 用户、项目、配置等)
   ├─> 批量写入ClickHouse (分析型数据: Trace、指标、时序数据)
   └─> 触发后续队列 (TraceUpsertQueue等,用于数据聚合和计算)

6. 数据查询
   ├─> Web UI查询 -> PostgreSQL (快速查询最近数据)
   └─> 报表分析 -> ClickHouse (复杂聚合查询)
```

**关键设计说明：**

1. **BOS (对象存储) 的作用**
   - **事件持久化**：在 web 端收到事件后立即上传到 BOS，确保数据不丢失
   - **事件缓存**：worker 处理时从 BOS 读取完整事件数据
   - **数据保留策略**：支持长期归档和按策略删除
   - **故障恢复**：如果 worker 处理失败，可以从 BOS 重新获取原始事件

2. **批量写入优化**
   - ClickHouse 使用 `ClickhouseWriter` 类进行批量写入，减少网络开销
   - 可配置写入间隔 (`LANGFUSE_INGESTION_CLICKHOUSE_WRITE_INTERVAL_MS`)
   - PostgreSQL 使用 Prisma ORM 的事务批处理

3. **队列延迟机制**
   - 支持可配置的队列延迟 (`LANGFUSE_INGESTION_QUEUE_DELAY_MS`)
   - 在 UTC 日期边界 (23:45-00:15) 自动增加延迟，避免乱序导致的重复数据

4. **Redis 缓存优化**
   - API Key 验证结果缓存在 Redis 中，减少数据库查询
   - 最近处理事件的缓存 (`recently-processed-cache`)，避免重复处理

5. **Worker 多队列系统 (基于 BullMQ)**
   - **IngestionQueue**: 摄取队列，处理事件数据的解析和存储
   - **TraceUpsertQueue**: Trace 聚合队列，支持分片 (sharding) 以提高并发性能
   - **EvalQueue**: 评估队列，执行 LLM 评估任务
   - **BatchExportQueue**: 批量导出队列，生成数据导出文件
   - **DataRetentionQueue**: 数据保留队列，执行数据清理策略
   - **PostHogIntegrationQueue / MixpanelIntegrationQueue**: 第三方集成队列
   - **WebhookQueue**: Webhook 通知队列
   - 每个队列独立配置并发数、重试策略和延迟参数

---

## 7. 部署流程

### 7.1 完整部署流程图

```
┌──────────────────────────────────────────────────────────────┐
│ 1. 用户通过API创建实例                                          │
│    POST /api/v1/instances                                     │
│    {                                                          │
│      "name": "my-langfuse",                                   │
│      "version": "v2.51.0",                                    │
│      "deploymentConfig": {...},                               │
│      "storageConfig": {...}                                   │
│    }                                                          │
└────────────────────────┬─────────────────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────────────────┐
│ 2. langfuse-service处理请求                                    │
│    ├─ 生成instanceID: "langfuse-abc123"                       │
│    ├─ 写入数据库记录                                           │
│    ├─ 生成初始凭证 (admin password, API key)                   │
│    └─ 创建LangfuseInstance CRD                                │
└────────────────────────┬─────────────────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────────────────┐
│ 3. resource-controller监听到CRD创建                            │
│    ├─ 创建Namespace: langfuse-abc123                          │
│    ├─ 创建Secret: 数据库密码、BOS凭证                           │
│    ├─ 通过Helm部署langfuse-instance Chart                     │
│    └─ 创建CNCNetwork资源                                       │
└────────────────────────┬─────────────────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────────────────┐
│ 4. Helm创建子资源                                              │
│    └─ 在Namespace: langfuse-abc123 中创建:                    │
│       └─ LangfuseInstance CR (被operator监听)                 │
└────────────────────────┬─────────────────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────────────────┐
│ 5. langfuse-operator监听到CR创建                               │
│    ├─ 创建PostgreSQL StatefulSet                              │
│    │  └─ PVC: postgresql-data (100Gi)                         │
│    ├─ 创建ClickHouse StatefulSet                              │
│    │  └─ PVC: clickhouse-data (500Gi)                         │
│    ├─ 创建Redis StatefulSet                                   │
│    ├─ 等待数据库就绪 (健康检查)                                 │
│    ├─ 执行数据库初始化 (prisma migrate)                         │
│    ├─ 创建langfuse-web Deployment (2 replicas)                │
│    ├─ 创建langfuse-worker Deployment (3 replicas)             │
│    ├─ 创建Nginx Deployment                                    │
│    └─ 创建对应的Services                                       │
└────────────────────────┬─────────────────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────────────────┐
│ 6. CNCNetwork Controller处理网络配置                           │
│    ├─ 创建BLB (负载均衡器)                                     │
│    ├─ 配置后端服务器 (nginx pods)                              │
│    ├─ 配置健康检查                                             │
│    ├─ 分配公网IP (如果启用)                                    │
│    ├─ 配置跨VPC访问 (allowedVPCs)                              │
│    └─ 配置域名: langfuse-abc123.cnc.baidubce.bi.com           │
└────────────────────────┬─────────────────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────────────────┐
│ 7. resource-controller更新Status                              │
│    └─ LangfuseInstance.Status:                                │
│       ├─ phase: Running                                       │
│       ├─ endpoints:                                           │
│       │  ├─ webUI: https://langfuse-abc123.cnc.baidubce...   │
│       │  └─ api: https://langfuse-abc123.cnc.baidubce...     │
│       ├─ componentStatus:                                     │
│       │  ├─ web: 2/2 Ready                                    │
│       │  ├─ worker: 3/3 Ready                                 │
│       │  └─ postgresql: 1/1 Ready                             │
│       └─ credentials:                                         │
│          ├─ adminUsername: admin                              │
│          └─ adminPasswordSecret: langfuse-abc123-admin-pwd    │
└────────────────────────┬─────────────────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────────────────┐
│ 8. 部署完成 - 用户可访问                                        │
│    ├─ Web UI: https://langfuse-abc123.cnc.baidubce.bi.com    │
│    ├─ 初始账号: admin / {从Secret获取密码}                      │
│    └─ AI应用可通过SDK接入                                       │
└──────────────────────────────────────────────────────────────┘
```

### 7.2 时间线

```
t=0s    用户创建请求
t=1s    CRD创建完成
t=5s    Namespace和Secret创建完成
t=10s   Helm Chart部署完成
t=30s   PostgreSQL Pod Running
t=60s   ClickHouse Pod Running
t=70s   数据库初始化完成
t=80s   langfuse-web Pods Running (2/2)
t=85s   langfuse-worker Pods Running (3/3)
t=90s   Nginx Pods Running (2/2)
t=120s  CNCNetwork配置完成
t=125s  BLB健康检查通过
t=130s  域名解析生效
t=135s  ✅ 实例完全可用
```

---

## 8. 配置管理

### 8.1 环境变量注入

所有配置通过Secret和ConfigMap注入到Pod中：

```yaml
# langfuse-web Deployment
env:
  # 数据库配置
  - name: DATABASE_URL
    valueFrom:
      secretKeyRef:
        name: langfuse-abc123-db-secret
        key: postgres-url

  # ClickHouse配置
  - name: CLICKHOUSE_URL
    valueFrom:
      secretKeyRef:
        name: langfuse-abc123-db-secret
        key: clickhouse-url

  # Redis配置
  - name: REDIS_URL
    valueFrom:
      secretKeyRef:
        name: langfuse-abc123-db-secret
        key: redis-url

  # 对象存储配置
  - name: S3_ENDPOINT
    value: "https://bj.bcebos.com"
  - name: S3_BUCKET_NAME
    value: "langfuse-traces"
  - name: S3_ACCESS_KEY_ID
    valueFrom:
      secretKeyRef:
        name: langfuse-bos-secret
        key: access-key-id
  - name: S3_SECRET_ACCESS_KEY
    valueFrom:
      secretKeyRef:
        name: langfuse-bos-secret
        key: secret-access-key

  # 应用配置
  - name: NEXTAUTH_URL
    value: "https://langfuse-abc123.cnc.baidubce.bi.com"
  - name: NEXTAUTH_SECRET
    valueFrom:
      secretKeyRef:
        name: langfuse-abc123-app-secret
        key: nextauth-secret

  # Telemetry (可选)
  - name: TELEMETRY_ENABLED
    value: "false"

  # 日志级别
  - name: LOG_LEVEL
    value: "info"
```

### 8.2 Secret管理

```go
// resource-controller创建Secret

func (r *LangfuseInstanceReconciler) createSecrets(ctx context.Context, instance *langfusev1.LangfuseInstance) error {
	namespace := fmt.Sprintf("langfuse-%s", instance.Name)

	// 1. 数据库Secret
	dbSecret := &corev1.Secret{
		ObjectMeta: metav1.ObjectMeta{
			Name:      fmt.Sprintf("%s-db-secret", instance.Name),
			Namespace: namespace,
		},
		StringData: map[string]string{
			"password": generatePassword(),
			"postgres-url": fmt.Sprintf(
				"postgresql://langfuse:%s@%s-postgresql:5432/langfuse",
				password,
				instance.Name,
			),
			"clickhouse-url": fmt.Sprintf(
				"http://%s-clickhouse:8123",
				instance.Name,
			),
			"redis-url": fmt.Sprintf(
				"redis://%s-redis:6379",
				instance.Name,
			),
		},
	}

	// 2. 应用Secret
	appSecret := &corev1.Secret{
		ObjectMeta: metav1.ObjectMeta{
			Name:      fmt.Sprintf("%s-app-secret", instance.Name),
			Namespace: namespace,
		},
		StringData: map[string]string{
			"nextauth-secret": generateSecret(32),
			"admin-password":  generatePassword(),
		},
	}

	// 3. BOS Secret (从用户提供的Secret复制)
	bosSecret := &corev1.Secret{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "langfuse-bos-secret",
			Namespace: namespace,
		},
		StringData: map[string]string{
			"access-key-id":     instance.Spec.StorageConfig.BOS.AccessKeyID,
			"secret-access-key": instance.Spec.StorageConfig.BOS.SecretAccessKey,
		},
	}

	// 创建Secret
	if err := r.Create(ctx, dbSecret); err != nil {
		return err
	}
	if err := r.Create(ctx, appSecret); err != nil {
		return err
	}
	if err := r.Create(ctx, bosSecret); err != nil {
		return err
	}

	return nil
}
```

---

## 9. 多租户隔离

### 9.1 隔离机制

| 隔离维度 | 实现方式 |
|---------|---------|
| **计算隔离** | 每个实例独立的Namespace + 独立的Pods |
| **存储隔离** | 独立的PVC + 独立的数据库实例 |
| **网络隔离** | Kubernetes Network Policy + CNCNetwork |
| **数据隔离** | 独立的数据库Schema + 独立的BOS Bucket前缀 |
| **认证隔离** | 每个实例独立的API Keys + JWT Secret |

### 9.2 资源配额

为每个Namespace设置ResourceQuota：

```yaml
apiVersion: v1
kind: ResourceQuota
metadata:
  name: langfuse-quota
  namespace: langfuse-abc123
spec:
  hard:
    requests.cpu: "20"
    requests.memory: "40Gi"
    requests.storage: "1Ti"
    persistentvolumeclaims: "10"
    pods: "50"
```

### 9.3 网络策略

只允许同Namespace内部通信：

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: langfuse-network-policy
  namespace: langfuse-abc123
spec:
  podSelector: {}  # 应用到所有Pod
  policyTypes:
    - Ingress
    - Egress
  ingress:
    # 允许来自同Namespace的流量
    - from:
      - namespaceSelector:
          matchLabels:
            name: langfuse-abc123
    # 允许来自Nginx Ingress的流量
    - from:
      - namespaceSelector:
          matchLabels:
            name: ingress-nginx
      ports:
        - protocol: TCP
          port: 3000
  egress:
    # 允许访问外部服务 (BOS等)
    - to:
      - namespaceSelector: {}
    # 允许DNS查询
    - to:
      - namespaceSelector: {}
      ports:
        - protocol: UDP
          port: 53
```

---

## 10. 监控和运维

### 10.1 自监控

所有组件暴露Prometheus metrics：

```yaml
# langfuse-web ServiceMonitor
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: langfuse-abc123-web
  namespace: langfuse-abc123
spec:
  selector:
    matchLabels:
      app: langfuse-web
      instance: langfuse-abc123
  endpoints:
    - port: metrics
      path: /api/metrics
      interval: 30s
```

### 10.2 告警规则

```yaml
apiVersion: monitoring.coreos.com/v1
kind: PrometheusRule
metadata:
  name: langfuse-alerts
  namespace: langfuse-abc123
spec:
  groups:
    - name: langfuse.rules
      interval: 30s
      rules:
        # Pod不健康告警
        - alert: LangfusePodDown
          expr: kube_pod_status_phase{namespace="langfuse-abc123", phase!="Running"} > 0
          for: 5m
          labels:
            severity: critical
          annotations:
            summary: "Langfuse Pod is down"
            description: "Pod {{ $labels.pod }} in namespace {{ $labels.namespace }} is not running"

        # 数据库连接失败告警
        - alert: LangfuseDatabaseConnectionFailed
          expr: langfuse_database_connection_errors_total > 10
          for: 5m
          labels:
            severity: critical
          annotations:
            summary: "Langfuse database connection failed"

        # API响应时间过长告警
        - alert: LangfuseAPISlowResponse
          expr: histogram_quantile(0.95, rate(langfuse_http_request_duration_seconds_bucket[5m])) > 2
          for: 10m
          labels:
            severity: warning
          annotations:
            summary: "Langfuse API response time is too high"
```

### 10.3 日志聚合

所有Pod日志统一收集到日志系统：

```yaml
# Fluent Bit配置
apiVersion: v1
kind: ConfigMap
metadata:
  name: fluent-bit-config
  namespace: langfuse-abc123
data:
  fluent-bit.conf: |
    [INPUT]
        Name              tail
        Path              /var/log/containers/*langfuse*.log
        Parser            docker
        Tag               langfuse.*
        Refresh_Interval  5

    [FILTER]
        Name                kubernetes
        Match               langfuse.*
        Kube_URL            https://kubernetes.default.svc:443
        Kube_CA_File        /var/run/secrets/kubernetes.io/serviceaccount/ca.crt
        Kube_Token_File     /var/run/secrets/kubernetes.io/serviceaccount/token

    [OUTPUT]
        Name  es
        Match langfuse.*
        Host  elasticsearch.logging.svc
        Port  9200
        Index langfuse
```

---

## 11. 计费集成

### 11.1 资源使用量统计

```go
// services/langfuse-billing/collector/resource_collector.go

type ResourceCollector struct {
	k8sClient client.Client
	db        *gorm.DB
}

// CollectResourceUsage 收集资源使用量
func (c *ResourceCollector) CollectResourceUsage(ctx context.Context, instanceID string) (*ResourceUsage, error) {
	namespace := fmt.Sprintf("langfuse-%s", instanceID)

	// 1. 获取Pod列表
	pods := &corev1.PodList{}
	if err := c.k8sClient.List(ctx, pods, client.InNamespace(namespace)); err != nil {
		return nil, err
	}

	// 2. 统计资源使用
	usage := &ResourceUsage{
		InstanceID: instanceID,
		Timestamp:  time.Now(),
	}

	for _, pod := range pods.Items {
		for _, container := range pod.Spec.Containers {
			usage.CPUCores += container.Resources.Requests.Cpu().AsApproximateFloat64()
			usage.MemoryGB += float64(container.Resources.Requests.Memory().Value()) / (1024 * 1024 * 1024)
		}
	}

	// 3. 统计存储使用
	pvcs := &corev1.PersistentVolumeClaimList{}
	if err := c.k8sClient.List(ctx, pvcs, client.InNamespace(namespace)); err != nil {
		return nil, err
	}

	for _, pvc := range pvcs.Items {
		usage.StorageGB += float64(pvc.Spec.Resources.Requests.Storage().Value()) / (1024 * 1024 * 1024)
	}

	// 4. 统计流量使用 (从Prometheus查询)
	usage.NetworkInGB = c.queryPrometheusMetric(
		fmt.Sprintf(`sum(rate(container_network_receive_bytes_total{namespace="%s"}[1h])) * 3600 / (1024*1024*1024)`, namespace),
	)
	usage.NetworkOutGB = c.queryPrometheusMetric(
		fmt.Sprintf(`sum(rate(container_network_transmit_bytes_total{namespace="%s"}[1h])) * 3600 / (1024*1024*1024)`, namespace),
	)

	// 5. 统计API调用次数 (从ClickHouse查询)
	usage.APIRequests = c.queryClickHouse(
		fmt.Sprintf(`SELECT count() FROM traces WHERE instanceId = '%s' AND timestamp >= now() - INTERVAL 1 HOUR`, instanceID),
	)

	// 6. 保存到数据库
	if err := c.db.Create(usage).Error; err != nil {
		return nil, err
	}

	return usage, nil
}

// CalculateCost 计算费用
func (c *ResourceCollector) CalculateCost(usage *ResourceUsage) float64 {
	const (
		cpuPricePerCoreHour    = 0.05  // 元/核/小时
		memoryPricePerGBHour   = 0.01  // 元/GB/小时
		storagePricePerGBMonth = 0.30  // 元/GB/月
		networkPricePerGB      = 0.80  // 元/GB
		apiPricePer1000Calls   = 0.01  // 元/1000次
	)

	cost := 0.0

	// 计算各项费用
	cost += usage.CPUCores * cpuPricePerCoreHour
	cost += usage.MemoryGB * memoryPricePerGBHour
	cost += usage.StorageGB * storagePricePerGBMonth / 30 / 24  // 折算到小时
	cost += (usage.NetworkInGB + usage.NetworkOutGB) * networkPricePerGB
	cost += float64(usage.APIRequests) / 1000 * apiPricePer1000Calls

	return cost
}
```

### 11.2 计费报表

```go
// GET /api/v1/instances/:id/billing
func GetInstanceBilling(c *gin.Context) {
	instanceID := c.Param("id")
	startTime := c.Query("start_time")  // RFC3339格式
	endTime := c.Query("end_time")

	// 查询资源使用记录
	var usages []models.ResourceUsage
	db.Where("instance_id = ? AND timestamp BETWEEN ? AND ?",
		instanceID, startTime, endTime).Find(&usages)

	// 计算总费用
	totalCost := 0.0
	for _, usage := range usages {
		totalCost += CalculateCost(&usage)
	}

	c.JSON(200, gin.H{
		"instanceId": instanceID,
		"period": gin.H{
			"start": startTime,
			"end":   endTime,
		},
		"totalCost": totalCost,
		"breakdown": gin.H{
			"compute":  calculateComputeCost(usages),
			"storage":  calculateStorageCost(usages),
			"network":  calculateNetworkCost(usages),
			"apiCalls": calculateAPICost(usages),
		},
		"usages": usages,
	})
}
```

---

## 12. 与CProm的对比总结

| 维度 | CProm | Langfuse托管 |
|------|-------|-------------|
| **核心服务** | Prometheus/VictoriaMetrics | Langfuse (Web全栈应用 + Worker) |
| **部署目标** | 监控采集 (用户集群) + 存储查询 (资源集群) | 完全托管 (仅资源集群) |
| **数据流向** | 用户集群Pull -> RemoteWrite -> 资源集群 | 用户应用Push -> API -> 资源集群 |
| **存储后端** | VMStorage (时序数据库) | PostgreSQL + ClickHouse + BOS |
| **网络模型** | VMAgent在用户集群,需要出向网络 | 用户应用直接调用API,需要入向网络 |
| **Operator** | vm-operator (开源) | langfuse-operator (自研) |
| **Chart复杂度** | 中等 (VMCluster 3组件) | 高 (6+ 组件:PG/CH/Redis/Web/Worker/Nginx) |
| **配置同步** | Sidecar动态拉取 | 不需要 (通过API直接操作) |
| **多租户隔离** | 独立VMCluster实例 | 独立Langfuse实例 + 独立DB |
| **计费模型** | 存储容量 + 查询QPS | 计算资源 + 存储 + API调用次数 |
| **典型规格** | 小型:2C4G, 大型:16C32G | 小型:8C16G (含DB), 大型:32C64G |

---

## 13. 开发路线图

### Phase 1: 基础架构 (Week 1-2)
- [ ] 定义LangfuseInstance CRD
- [ ] 实现resource-controller基础框架
- [ ] 实现langfuse-operator基础框架
- [ ] 创建langfuse-instance Helm Chart骨架

### Phase 2: 核心功能 (Week 3-4)
- [ ] 实现PostgreSQL托管部署
- [ ] 实现ClickHouse托管部署
- [ ] 实现Redis托管部署
- [ ] 实现langfuse-web/worker部署
- [ ] 实现数据库初始化逻辑

### Phase 3: 网络和访问 (Week 5)
- [ ] 集成CNCNetwork
- [ ] 配置Nginx Ingress
- [ ] 配置BLB负载均衡
- [ ] 配置域名和SSL证书

### Phase 4: 业务服务 (Week 6)
- [ ] 实现langfuse-service RESTful API
- [ ] 实现实例CRUD接口
- [ ] 实现凭证管理
- [ ] 集成用户认证

### Phase 5: 监控和运维 (Week 7)
- [ ] 添加Prometheus metrics
- [ ] 配置ServiceMonitor
- [ ] 添加告警规则
- [ ] 集成日志收集

### Phase 6: 计费和优化 (Week 8)
- [ ] 实现资源使用量统计
- [ ] 实现计费计算
- [ ] 性能优化
- [ ] 文档完善

---

## 14. 参考资料

### 14.1 Langfuse官方文档
- [Langfuse Self-Hosting Guide](https://langfuse.com/docs/deployment/self-host)
- [Langfuse Environment Variables](https://langfuse.com/docs/deployment/self-host#environment-variables)
- [Langfuse Architecture](https://langfuse.com/docs/deployment/architecture)

### 14.2 CProm代码参考
- `pkg/apis/cprom/v1/monitor_instance_types.go` - CRD定义
- `services/cprom-controller/controllers/monitor_instance.go` - 控制器实现
- `charts/monitor-instance/` - Helm Chart结构

### 14.3 技术栈
- **Kubernetes**: v1.25+
- **Helm**: v3.10+
- **Langfuse**: v2.51.0
- **PostgreSQL**: 15
- **ClickHouse**: 23.8
- **Redis**: 7.0
- **Nginx**: 1.25

---

## 附录: 快速开始示例

### A.1 创建实例

```bash
# 1. 通过API创建实例
curl -X POST http://langfuse-service.baidu.com/api/v1/instances \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -d '{
    "name": "my-first-langfuse",
    "version": "v2.51.0",
    "deploymentConfig": {
      "web": {"replicas": 2},
      "worker": {"replicas": 3}
    },
    "storageConfig": {
      "postgresql": {
        "type": "managed",
        "managedConfig": {"storageSize": 100}
      },
      "bos": {
        "bucket": "my-langfuse-traces",
        "region": "bj"
      }
    },
    "networkConfig": {
      "publicAccess": true,
      "cncNetworkConfig": {
        "enabled": true,
        "allowedVPCs": ["vpc-xxx123"]
      }
    }
  }'

# 2. 获取实例状态
curl http://langfuse-service.baidu.com/api/v1/instances/langfuse-abc123

# 响应示例:
{
  "instanceId": "langfuse-abc123",
  "name": "my-first-langfuse",
  "status": "Running",
  "endpoints": {
    "webUI": "https://langfuse-abc123.cnc.baidubce.bi.com",
    "api": "https://langfuse-abc123.cnc.baidubce.bi.com/api"
  },
  "credentials": {
    "adminUsername": "admin",
    "adminPasswordSecret": "langfuse-abc123-admin-pwd"
  },
  "createdAt": "2024-01-15T10:30:00Z"
}
```

### A.2 使用实例

```typescript
// 在AI应用中使用
import { Langfuse } from "langfuse"

const langfuse = new Langfuse({
  publicKey: "pk-lf-abc123-xxx",
  secretKey: "sk-lf-abc123-yyy",
  baseUrl: "https://langfuse-abc123.cnc.baidubce.bi.com"
})

// 记录Trace
const trace = langfuse.trace({
  name: "chat-completion",
  userId: "user-123",
  metadata: { model: "gpt-4" }
})

// 记录Generation
const generation = trace.generation({
  name: "openai-call",
  model: "gpt-4",
  modelParameters: { temperature: 0.7 },
  input: { messages: [...] },
  output: { content: "AI response..." }
})

// 结束Trace
await langfuse.flushAsync()
```

---

**文档版本**: v1.0
**最后更新**: 2024-01-15
**作者**: Cloud Platform Team
