import { useDefineApi } from "@/stores/useDefineApi";
import type {
  BusinessSettings,
  EmailConfig,
  PayConfig
} from "@/types/business";

export const getPayConfig = useDefineApi<any, PayConfig>({
  url: "/api/admin/pay/config",
  method: "GET"
});

export const updatePayConfig = useDefineApi<
  {
    data: Partial<PayConfig>;
  },
  boolean
>({
  url: "/api/admin/pay/config",
  method: "PUT"
});

export const testPayConfig = useDefineApi<
  any,
  {
    success: boolean;
    status: number;
    message?: string;
  }
>({
  url: "/api/admin/pay/test",
  method: "POST"
});

export const getEmailConfig = useDefineApi<any, EmailConfig>({
  url: "/api/admin/email/config",
  method: "GET"
});

export const updateEmailConfig = useDefineApi<
  {
    data: Partial<EmailConfig>;
  },
  boolean
>({
  url: "/api/admin/email/config",
  method: "PUT"
});

export const testEmailConfig = useDefineApi<
  {
    data: {
      to: string;
    };
  },
  boolean
>({
  url: "/api/admin/email/test",
  method: "POST"
});

export const getBusinessSettings = useDefineApi<any, BusinessSettings>({
  url: "/api/admin/settings",
  method: "GET"
});

export const updateBusinessSettings = useDefineApi<
  {
    data: Partial<BusinessSettings>;
  },
  boolean
>({
  url: "/api/admin/settings",
  method: "PUT"
});
