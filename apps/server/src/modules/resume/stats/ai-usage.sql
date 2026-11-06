-- 仅新增 AI 使用次数表，不修改已有表。
CREATE TABLE IF NOT EXISTS `ai_usage_count` (
  `id` TINYINT UNSIGNED NOT NULL COMMENT '固定记录标识',
  `count` BIGINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '成功完成的累计次数',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AI 使用次数';
