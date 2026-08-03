import { useDefineApi } from "@/stores/useDefineApi";
import type { AdminUser, AdminUserDetail, PageResult } from "@/types/business";

export const listAdminUsers = useDefineApi<
  {
    params?: {
      page?: number;
      page_size?: number;
      keyword?: string;
      status?: number;
    };
  },
  PageResult<AdminUser>
>({
  url: "/api/admin/users",
  method: "GET"
});

export const getAdminUserDetail = useDefineApi<
  {
    params: {
      uuid: string;
    };
  },
  AdminUserDetail
>({
  url: "/api/admin/users",
  method: "GET"
});

export const updateAdminUserStatus = useDefineApi<
  {
    params: {
      uuid: string;
    };
    data: {
      status: number;
    };
  },
  boolean
>({
  url: "/api/admin/users",
  method: "PUT"
});

export const updateAdminUserBalance = useDefineApi<
  {
    params: {
      uuid: string;
    };
    data: {
      change: number;
    };
  },
  {
    balance: number;
  }
>({
  url: "/api/admin/users",
  method: "PUT"
});

export const impersonateUser = useDefineApi<
  {
    params: {
      uuid: string;
    };
  },
  {
    token: string;
    user: { uuid: string; userName: string; permission: number };
  }
>({
  url: "/api/admin/users",
  method: "POST"
});

export const deleteAdminUser = useDefineApi<
  {
    params: {
      uuid: string;
    };
  },
  boolean
>({
  url: "/api/admin/users",
  method: "DELETE"
});
