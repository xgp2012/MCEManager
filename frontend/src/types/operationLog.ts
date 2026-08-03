export type GlobalGeneralOptions = {
  operation_id: string;
  operation_time: string;
  operation_level: "info" | "warning" | "error";
  operator_ip: string;
  operator_name?: string;
};

export type InstanceGeneralOptions = {
  instance_id: string;
  daemon_id: string;
  instance_name?: string;
} & GlobalGeneralOptions;

export type InstanceStartOptions = {
  type: "instance_start";
} & InstanceGeneralOptions;

export type InstanceStopOptions = {
  type: "instance_stop";
} & InstanceGeneralOptions;

export type InstanceRestartOptions = {
  type: "instance_restart";
} & InstanceGeneralOptions;

export type InstanceUpdateOptions = {
  type: "instance_update";
} & InstanceGeneralOptions;

export type InstanceKillOptions = {
  type: "instance_kill";
} & InstanceGeneralOptions;

export type InstanceConfigChangeOptions = {
  type: "instance_config_change";
} & InstanceGeneralOptions;

export type InstanceCreateOptions = {
  type: "instance_create";
} & InstanceGeneralOptions;

export type InstanceDeleteOptions = {
  type: "instance_delete";
} & InstanceGeneralOptions;

export type InstanceFileUploadOptions = {
  type: "instance_file_upload";
  file?: string;
} & InstanceGeneralOptions;

export type InstanceFileUpdateOptions = {
  type: "instance_file_update";
  file: string;
} & InstanceGeneralOptions;

export type InstanceFileDownloadOptions = {
  type: "instance_file_download";
  file: string;
} & InstanceGeneralOptions;

export type InstanceFileDeleteOptions = {
  type: "instance_file_delete";
  file: string;
} & InstanceGeneralOptions;

export type InstanceTaskCreateOptions = {
  type: "instance_task_create";
  task_name: string;
} & InstanceGeneralOptions;

export type InstanceTaskDeleteOptions = {
  type: "instance_task_delete";
  task_name: string;
} & InstanceGeneralOptions;

export type DaemonCreateOptions = {
  type: "daemon_create";
  daemon_id: string;
} & GlobalGeneralOptions;

export type DaemonRemoveOptions = {
  type: "daemon_remove";
  daemon_id: string;
} & GlobalGeneralOptions;

export type DaemonConfigChangeOptions = {
  type: "daemon_config_change";
  daemon_id: string;
} & GlobalGeneralOptions;

export type UserCreateOptions = {
  type: "user_create";
  target_user_name: string;
} & GlobalGeneralOptions;

export type UserDeleteOptions = {
  type: "user_delete";
  target_user_name: string;
} & GlobalGeneralOptions;

export type UserConfigChangeOptions = {
  type: "user_config_change";
} & GlobalGeneralOptions;

export type UserLoginOptions = {
  type: "user_login";
  login_result: boolean;
} & GlobalGeneralOptions;

export type SystemConfigChangeOptions = {
  type: "system_config_change";
} & GlobalGeneralOptions;

// --- Phase 5: admin panel operation log actions ---

export type PlanCreateOptions = {
  type: "plan_create";
  plan_id: string;
  plan_name: string;
} & GlobalGeneralOptions;

export type PlanUpdateOptions = {
  type: "plan_update";
  plan_id: string;
  plan_name?: string;
} & GlobalGeneralOptions;

export type PlanDeleteOptions = {
  type: "plan_delete";
  plan_id: string;
  plan_name?: string;
} & GlobalGeneralOptions;

export type TemplateCreateOptions = {
  type: "template_create";
  template_id: string;
  template_name: string;
} & GlobalGeneralOptions;

export type TemplateUpdateOptions = {
  type: "template_update";
  template_id: string;
  template_name?: string;
} & GlobalGeneralOptions;

export type TemplateDeleteOptions = {
  type: "template_delete";
  template_id: string;
  template_name?: string;
} & GlobalGeneralOptions;

export type TemplateImportOptions = {
  type: "template_import";
  template_id: string;
  template_name?: string;
} & GlobalGeneralOptions;

export type TemplateCloneOptions = {
  type: "template_clone";
  template_id: string;
  template_name?: string;
} & GlobalGeneralOptions;

export type UserStatusChangeOptions = {
  type: "user_status_change";
  target_user_name: string;
  from_status?: string;
  to_status?: string;
} & GlobalGeneralOptions;

export type UserBalanceChangeOptions = {
  type: "user_balance_change";
  target_user_name: string;
  change: string;
} & GlobalGeneralOptions;

export type UserImpersonateOptions = {
  type: "user_impersonate";
  target_user_name: string;
} & GlobalGeneralOptions;

export type OrderRetryProvisionOptions = {
  type: "order_retry_provision";
  order_id: string;
} & GlobalGeneralOptions;

export type OrderRefundOptions = {
  type: "order_refund";
  order_id: string;
} & GlobalGeneralOptions;

export type OrderMarkPaidOptions = {
  type: "order_mark_paid";
  order_id: string;
} & GlobalGeneralOptions;

export type SubscriptionForceCancelOptions = {
  type: "subscription_force_cancel";
  subscription_id: string;
} & GlobalGeneralOptions;

export type SubscriptionRenewNowOptions = {
  type: "subscription_renew_now";
  subscription_id: string;
} & GlobalGeneralOptions;

export type SubscriptionAutoRenewChangeOptions = {
  type: "subscription_auto_renew_change";
  subscription_id: string;
  enabled: string;
} & GlobalGeneralOptions;

export type InstanceExtendOptions = {
  type: "instance_extend";
  instance_id: string;
  daemon_id: string;
  instance_name?: string;
} & GlobalGeneralOptions;

export type InstanceSuspendOptions = {
  type: "instance_suspend";
  instance_id: string;
  daemon_id: string;
  instance_name?: string;
} & GlobalGeneralOptions;

export type InstanceResumeOptions = {
  type: "instance_resume";
  instance_id: string;
  daemon_id: string;
  instance_name?: string;
} & GlobalGeneralOptions;

export type InstanceBandwidthChangeOptions = {
  type: "instance_bandwidth_change";
  instance_id: string;
  daemon_id: string;
  instance_name?: string;
} & GlobalGeneralOptions;

export type PayConfigChangeOptions = {
  type: "pay_config_change";
} & GlobalGeneralOptions;

export type EmailConfigChangeOptions = {
  type: "email_config_change";
} & GlobalGeneralOptions;

export type BusinessSettingChangeOptions = {
  type: "business_setting_change";
} & GlobalGeneralOptions;

export type OperationLoggerItem =
  | InstanceStartOptions
  | InstanceStopOptions
  | InstanceRestartOptions
  | InstanceUpdateOptions
  | InstanceKillOptions
  | InstanceConfigChangeOptions
  | InstanceCreateOptions
  | InstanceDeleteOptions
  | InstanceFileUploadOptions
  | InstanceFileUpdateOptions
  | InstanceFileDownloadOptions
  | InstanceFileDeleteOptions
  | InstanceTaskCreateOptions
  | InstanceTaskDeleteOptions
  | DaemonCreateOptions
  | DaemonRemoveOptions
  | DaemonConfigChangeOptions
  | UserCreateOptions
  | UserDeleteOptions
  | UserConfigChangeOptions
  | UserLoginOptions
  | SystemConfigChangeOptions
  | PlanCreateOptions
  | PlanUpdateOptions
  | PlanDeleteOptions
  | TemplateCreateOptions
  | TemplateUpdateOptions
  | TemplateDeleteOptions
  | TemplateImportOptions
  | TemplateCloneOptions
  | UserStatusChangeOptions
  | UserBalanceChangeOptions
  | UserImpersonateOptions
  | OrderRetryProvisionOptions
  | OrderRefundOptions
  | OrderMarkPaidOptions
  | SubscriptionForceCancelOptions
  | SubscriptionRenewNowOptions
  | SubscriptionAutoRenewChangeOptions
  | InstanceExtendOptions
  | InstanceSuspendOptions
  | InstanceResumeOptions
  | InstanceBandwidthChangeOptions
  | PayConfigChangeOptions
  | EmailConfigChangeOptions
  | BusinessSettingChangeOptions;
