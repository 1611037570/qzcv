-- 充值计费表结构。只新增表，不改动简历、统计等已有表。
-- 【唯一真源】实际的建表语句在 billing.service.ts 的 SCHEMA_STATEMENTS，服务启动时幂等执行；
-- 本文件是同一份结构的可读版本，供提前建表、DBA 审核或调整索引用，改动请以代码为准并同步本文件。
-- 字符集统一 utf8mb4，金额一律用「分」、令牌一律用「个」存储，避免浮点误差。
--
-- 早期版本曾按 IP+UA 推导账户，使用 billing_account / billing_order / billing_ledger 三张表，
-- 现已改为凭证制（余额归属于一次性凭证），那三张表不再使用，确认无数据后可直接 DROP。

-- 访问凭证与余额：一个订单发一张凭证，服务端只存密文哈希，不存明文。
CREATE TABLE IF NOT EXISTS `billing_license` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
  `key_id` VARCHAR(16) NOT NULL COMMENT '凭证公开部分，用于查库定位',
  `secret_hash` CHAR(64) NOT NULL COMMENT '密文的 SHA-256 哈希，服务端不存明文',
  `salt` VARCHAR(16) NOT NULL COMMENT '哈希盐值',
  `status` TINYINT NOT NULL DEFAULT 1 COMMENT '凭证状态：1 可用 2 已用完 3 已作废',
  `balance_tokens` BIGINT NOT NULL DEFAULT 0 COMMENT '当前可用计费令牌余额',
  `total_recharged_tokens` BIGINT NOT NULL DEFAULT 0 COMMENT '累计充值到账令牌',
  `total_consumed_tokens` BIGINT NOT NULL DEFAULT 0 COMMENT '累计消耗计费令牌',
  `order_no` VARCHAR(40) NOT NULL DEFAULT '' COMMENT '发放该凭证的订单号，一单只发一张',
  `risk_flags` JSON NULL COMMENT '风控标记，记录异常消费特征',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `last_used_at` DATETIME NULL COMMENT '最近一次消费时间',
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_key_id` (`key_id`),
  UNIQUE KEY `uk_order_no` (`order_no`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='访问凭证与余额';

-- 充值订单：金额与到账令牌在下单时快照，改价不影响历史订单。
CREATE TABLE IF NOT EXISTS `billing_recharge_order` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
  `order_no` VARCHAR(40) NOT NULL COMMENT '本地订单号，对外唯一',
  `package_id` VARCHAR(32) NOT NULL COMMENT '套餐标识，对应服务端套餐配置',
  `package_name` VARCHAR(64) NOT NULL DEFAULT '' COMMENT '套餐名称快照',
  `amount_fen` INT UNSIGNED NOT NULL COMMENT '应付金额（分），服务端定价，不信任前端',
  `tokens` BIGINT NOT NULL DEFAULT 0 COMMENT '到账计费令牌总数',
  `bonus_tokens` BIGINT NOT NULL DEFAULT 0 COMMENT '赠送的计费令牌',
  `status` TINYINT NOT NULL DEFAULT 0 COMMENT '订单状态：0 待支付 1 已支付 2 已发放 3 已关闭',
  `channel` VARCHAR(16) NOT NULL DEFAULT 'mock' COMMENT '支付渠道标识',
  `provider_txn_id` VARCHAR(64) NULL COMMENT '支付平台交易号，唯一索引防止重复回调重复发放',
  `pay_url` VARCHAR(255) NOT NULL DEFAULT '' COMMENT '收银台地址或二维码内容',
  `license_key_id` VARCHAR(16) NOT NULL DEFAULT '' COMMENT '发放后绑定的凭证公开部分',
  `target_key_id` VARCHAR(16) NOT NULL DEFAULT '' COMMENT '下单时指定的续充凭证，为空表示发新凭证',
  `ip_hash` VARCHAR(64) NOT NULL DEFAULT '' COMMENT '下单来源 IP 哈希，仅用于短时归属校验与限流',
  `paid_at` DATETIME NULL COMMENT '支付完成时间',
  `issued_at` DATETIME NULL COMMENT '凭证发放时间',
  `expire_at` DATETIME NULL COMMENT '订单支付截止时间',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_order_no` (`order_no`),
  UNIQUE KEY `uk_provider_txn` (`provider_txn_id`),
  KEY `idx_ip_created` (`ip_hash`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='充值订单';

-- 令牌流水：充值为正、消耗为负，每条都带余额快照，便于对账与客诉排查。
CREATE TABLE IF NOT EXISTS `billing_license_ledger` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
  `key_id` VARCHAR(16) NOT NULL COMMENT '归属凭证的公开部分',
  `type` VARCHAR(16) NOT NULL COMMENT '流水类型：RECHARGE 充值 / CONSUME 消耗 / ADJUST 人工调整',
  `tokens` BIGINT NOT NULL COMMENT '变动令牌数，正数入账负数扣减',
  `balance_after` BIGINT NOT NULL DEFAULT 0 COMMENT '变动后的余额快照',
  `order_no` VARCHAR(40) NOT NULL DEFAULT '' COMMENT '关联订单号，消耗流水为空',
  `model` VARCHAR(64) NOT NULL DEFAULT '' COMMENT '消耗流水的实际上游模型',
  `prompt_tokens` INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '消耗流水的输入令牌数',
  `completion_tokens` INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '消耗流水的输出令牌数',
  `upstream_cost_micro` BIGINT NOT NULL DEFAULT 0 COMMENT '本次消耗的上游成本（微元），仅用于毛利核算',
  `model_ratio` DECIMAL(8,3) NOT NULL DEFAULT 1.000 COMMENT '计费时命中的模型倍率',
  `time_ratio` DECIMAL(8,3) NOT NULL DEFAULT 1.000 COMMENT '计费时命中的时段倍率',
  `remark` VARCHAR(128) NOT NULL DEFAULT '' COMMENT '流水说明',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`id`),
  KEY `idx_key_id` (`key_id`, `id`),
  KEY `idx_order_no` (`order_no`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='凭证令牌流水';
