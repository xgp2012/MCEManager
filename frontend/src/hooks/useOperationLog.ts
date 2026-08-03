import { computed, ref } from "vue";
import { getOperationLog } from "@/services/apis/operationLog";
import { t } from "@/lang/i18n";
import type { OperationLoggerItem } from "@/types/operationLog";

type TextRenderResult = {
  text: string;
  data: string[];
};

type OperationRenderer = {
  [K in OperationLoggerItem["type"]]: (
    // This variable is actually used internally. Fix the plugin's false positive error.
    // eslint-disable-next-line no-unused-vars
    item: Extract<OperationLoggerItem, { type: K }>
  ) => TextRenderResult;
};

const renderMap: OperationRenderer = {
  instance_start: (item) => ({
    text: t("TXT_CODE_e4605c4"),
    data: [item.operator_name || item.operation_id, item.instance_name || item.instance_id]
  }),
  instance_stop: (item) => ({
    text: t("TXT_CODE_48c286cc"),
    data: [item.operator_name || item.operation_id, item.instance_name || item.instance_id]
  }),
  instance_restart: (item) => ({
    text: t("TXT_CODE_fa7002ef"),
    data: [item.operator_name || item.operation_id, item.instance_name || item.instance_id]
  }),
  instance_update: (item) => ({
    text: t("TXT_CODE_e1454ba7"),
    data: [item.operator_name || item.operation_id, item.instance_name || item.instance_id]
  }),
  instance_kill: (item) => ({
    text: t("TXT_CODE_ee54440"),
    data: [item.operator_name || item.operation_id, item.instance_name || item.instance_id]
  }),
  instance_config_change: (item) => ({
    text: t("TXT_CODE_30fcc19a"),
    data: [item.operator_name || item.operation_id, item.instance_name || item.instance_id]
  }),
  instance_create: (item) => ({
    text: t("TXT_CODE_9ab6fd"),
    data: [item.operator_name || item.operation_id, item.instance_name || item.instance_id]
  }),
  instance_delete: (item) => ({
    text: t("TXT_CODE_61b6facb"),
    data: [item.operator_name || item.operation_id, item.instance_name || item.instance_id]
  }),
  instance_file_upload: (item) => ({
    text: t("TXT_CODE_58e4a9bd"),
    data: [
      item.operator_name || item.operation_id,
      item.instance_name || item.instance_id,
      item.file || ""
    ]
  }),
  instance_file_update: (item) => ({
    text: t("TXT_CODE_c5687e56"),
    data: [
      item.operator_name || item.operation_id,
      item.instance_name || item.instance_id,
      item.file
    ]
  }),
  instance_file_download: (item) => ({
    text: t("TXT_CODE_6f43f95f"),
    data: [
      item.operator_name || item.operation_id,
      item.instance_name || item.instance_id,
      item.file
    ]
  }),
  instance_file_delete: (item) => ({
    text: t("TXT_CODE_de567e84"),
    data: [
      item.operator_name || item.operation_id,
      item.instance_name || item.instance_id,
      item.file
    ]
  }),
  instance_task_create: (item) => ({
    text: t("TXT_CODE_5ddb00f2"),
    data: [
      item.operator_name || item.operation_id,
      item.instance_name || item.instance_id,
      item.task_name
    ]
  }),
  instance_task_delete: (item) => ({
    text: t("TXT_CODE_41f86ac"),
    data: [
      item.operator_name || item.operation_id,
      item.instance_name || item.instance_id,
      item.task_name
    ]
  }),
  daemon_create: (item) => ({
    text: t("TXT_CODE_f7969e5a"),
    data: [item.operator_name || item.operation_id, item.daemon_id]
  }),
  daemon_remove: (item) => ({
    text: t("TXT_CODE_384d278f"),
    data: [item.operator_name || item.operation_id, item.daemon_id]
  }),
  daemon_config_change: (item) => ({
    text: t("TXT_CODE_b6ac7af4"),
    data: [item.operator_name || item.operation_id, item.daemon_id]
  }),
  user_create: (item) => ({
    text: t("TXT_CODE_faa1962b"),
    data: [item.operator_name || item.operation_id, item.target_user_name]
  }),
  user_delete: (item) => ({
    text: t("TXT_CODE_cd76bc9"),
    data: [item.operator_name || item.operation_id, item.target_user_name]
  }),
  user_config_change: (item) => ({
    text: t("TXT_CODE_5564bc4c"),
    data: [item.operator_name || item.operation_id]
  }),
  user_login: (item) => ({
    text: t("TXT_CODE_31a48870") + ` (${item.operator_ip})`,
    data: [
      item.operator_name || item.operation_id,
      item.login_result ? t("TXT_CODE_43fcaf94") : t("TXT_CODE_56c686f8")
    ]
  }),
  system_config_change: (item) => ({
    text: t("TXT_CODE_d6312bd5"),
    data: [item.operator_name || item.operation_id]
  }),
  plan_create: (item) => ({
    text: t("TXT_CODE_OPLOG_PLAN_CREATE"),
    data: [item.operator_name || item.operation_id, item.plan_name || item.plan_id]
  }),
  plan_update: (item) => ({
    text: t("TXT_CODE_OPLOG_PLAN_UPDATE"),
    data: [item.operator_name || item.operation_id, item.plan_name || item.plan_id]
  }),
  plan_delete: (item) => ({
    text: t("TXT_CODE_OPLOG_PLAN_DELETE"),
    data: [item.operator_name || item.operation_id, item.plan_name || item.plan_id]
  }),
  template_create: (item) => ({
    text: t("TXT_CODE_OPLOG_TEMPLATE_CREATE"),
    data: [item.operator_name || item.operation_id, item.template_name || item.template_id]
  }),
  template_update: (item) => ({
    text: t("TXT_CODE_OPLOG_TEMPLATE_UPDATE"),
    data: [item.operator_name || item.operation_id, item.template_name || item.template_id]
  }),
  template_delete: (item) => ({
    text: t("TXT_CODE_OPLOG_TEMPLATE_DELETE"),
    data: [item.operator_name || item.operation_id, item.template_name || item.template_id]
  }),
  template_import: (item) => ({
    text: t("TXT_CODE_OPLOG_TEMPLATE_IMPORT"),
    data: [item.operator_name || item.operation_id, item.template_name || item.template_id]
  }),
  template_clone: (item) => ({
    text: t("TXT_CODE_OPLOG_TEMPLATE_CLONE"),
    data: [item.operator_name || item.operation_id, item.template_name || item.template_id]
  }),
  user_status_change: (item) => ({
    text: t("TXT_CODE_OPLOG_USER_STATUS_CHANGE"),
    data: [item.operator_name || item.operation_id, item.target_user_name]
  }),
  user_balance_change: (item) => ({
    text: t("TXT_CODE_OPLOG_USER_BALANCE_CHANGE"),
    data: [item.operator_name || item.operation_id, item.target_user_name, item.change]
  }),
  user_impersonate: (item) => ({
    text: t("TXT_CODE_OPLOG_USER_IMPERSONATE"),
    data: [item.operator_name || item.operation_id, item.target_user_name]
  }),
  order_retry_provision: (item) => ({
    text: t("TXT_CODE_OPLOG_ORDER_RETRY_PROVISION"),
    data: [item.operator_name || item.operation_id, item.order_id]
  }),
  order_refund: (item) => ({
    text: t("TXT_CODE_OPLOG_ORDER_REFUND"),
    data: [item.operator_name || item.operation_id, item.order_id]
  }),
  order_mark_paid: (item) => ({
    text: t("TXT_CODE_OPLOG_ORDER_MARK_PAID"),
    data: [item.operator_name || item.operation_id, item.order_id]
  }),
  subscription_force_cancel: (item) => ({
    text: t("TXT_CODE_OPLOG_SUBSCRIPTION_FORCE_CANCEL"),
    data: [item.operator_name || item.operation_id, item.subscription_id]
  }),
  subscription_renew_now: (item) => ({
    text: t("TXT_CODE_OPLOG_SUBSCRIPTION_RENEW_NOW"),
    data: [item.operator_name || item.operation_id, item.subscription_id]
  }),
  subscription_auto_renew_change: (item) => ({
    text: t("TXT_CODE_OPLOG_SUBSCRIPTION_AUTO_RENEW_CHANGE"),
    data: [item.operator_name || item.operation_id, item.subscription_id, item.enabled]
  }),
  instance_extend: (item) => ({
    text: t("TXT_CODE_OPLOG_INSTANCE_EXTEND"),
    data: [item.operator_name || item.operation_id, item.instance_name || item.instance_id]
  }),
  instance_suspend: (item) => ({
    text: t("TXT_CODE_OPLOG_INSTANCE_SUSPEND"),
    data: [item.operator_name || item.operation_id, item.instance_name || item.instance_id]
  }),
  instance_resume: (item) => ({
    text: t("TXT_CODE_OPLOG_INSTANCE_RESUME"),
    data: [item.operator_name || item.operation_id, item.instance_name || item.instance_id]
  }),
  instance_bandwidth_change: (item) => ({
    text: t("TXT_CODE_OPLOG_INSTANCE_BANDWIDTH_CHANGE"),
    data: [item.operator_name || item.operation_id, item.instance_name || item.instance_id]
  }),
  pay_config_change: (item) => ({
    text: t("TXT_CODE_OPLOG_PAY_CONFIG_CHANGE"),
    data: [item.operator_name || item.operation_id]
  }),
  email_config_change: (item) => ({
    text: t("TXT_CODE_OPLOG_EMAIL_CONFIG_CHANGE"),
    data: [item.operator_name || item.operation_id]
  }),
  business_setting_change: (item) => ({
    text: t("TXT_CODE_OPLOG_BUSINESS_SETTING_CHANGE"),
    data: [item.operator_name || item.operation_id]
  })
};

export const useOperationLog = () => {
  const logs = ref<OperationLoggerItem[]>([]);

  const levelColors = {
    info: "blue",
    warning: "orange",
    error: "red",
    unknown: "gray"
  };

  const fetchData = async () => {
    const { execute } = getOperationLog();
    const data = await execute();
    logs.value = data.value?.reverse() || [];
  };

  const generateTextByItem = (item: OperationLoggerItem) => {
    const handler = renderMap[item.type];
    if (!handler) return t("TXT_CODE_43df9305");
    const { text, data } = handler(item as any);
    let i = 0;
    return text.replace(/\<\<\s*[\w_]+\s*\>\>/g, () => data[i++] ?? "--");
  };

  const getColorByLevel = (level: OperationLoggerItem["operation_level"]) => {
    return levelColors[level] ?? levelColors.unknown;
  };

  const formattedLogs = computed(() => {
    return logs.value.map((item) => {
      return {
        ...item,
        color: getColorByLevel(item.operation_level),
        text: generateTextByItem(item)
      };
    });
  });

  return { fetchData, logs, getColorByLevel, generateTextByItem, formattedLogs };
};
