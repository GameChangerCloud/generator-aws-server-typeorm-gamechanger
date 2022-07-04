output "cluster_arn" {
  description = "Amazon Resource Name (ARN) of cluster"
  value       = module.rds_aurora_postgresql.cluster_arn
}