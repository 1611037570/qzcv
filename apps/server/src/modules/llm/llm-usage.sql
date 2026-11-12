-- 仅新增人工智能令牌消耗表，不修改已有表。
-- 与 ai_usage_count 的区别：本表按使用者逐次记录，用于后续免费额度与付费扣减。
CREATE TABLE IF NOT EXISTS `llm_usage` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
  `client_key` VARCHAR(64) NOT NULL DEFAULT '' COMMENT '使用者标识，由 IP 与设备标识推导',
  `ip_hash` VARCHAR(64) NOT NULL DEFAULT '' COMMENT '来源 IP 的哈希值',
  `model` VARCHAR(64) NOT NULL DEFAULT '' COMMENT '本次实际使用的上游模型',
  `prompt_tokens` INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '输入消耗令牌数',
  `completion_tokens` INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '输出消耗令牌数',
  `total_tokens` INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '本次消耗令牌总数',
  `estimated` TINYINT NOT NULL DEFAULT 0 COMMENT '是否为估算值：0 上游计量 1 本地估算',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '记录时间',
  PRIMARY KEY (`id`),
  KEY `idx_client_key` (`client_key`),
  KEY `idx_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='人工智能令牌消耗记录';
