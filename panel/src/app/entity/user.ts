import { IUser } from "./entity_interface";

export enum UserPassWordType {
  md5 = 0,
  bcrypt = 1
}

export enum UserStatus {
  PENDING_VERIFY = 0, // waiting for email verification
  ACTIVE = 1, // normal
  SUSPENDED = 2, // suspended / banned
  EXPIRED = 3 // subscription expired
}

export interface IUserApp {
  instanceUuid: string;
  daemonId: string;
  instanceInfo?: any;
}

export class User implements IUser {
  uuid: string = "";
  userName: string = "";
  passWord: string = "";
  passWordType: number = UserPassWordType.bcrypt;
  salt: string = "";
  permission: number = 0;
  registerTime: string = "";
  loginTime: string = "";
  instances: Array<IUserApp> = [];
  apiKey: string = "";
  isInit: boolean = false;
  secret = "";
  open2FA = false;
  ssoSub = "";
  ssoBound = false;
  email = "";
  emailVerified = false;
  emailVerifyToken = "";
  emailVerifyExpire = 0;
  status: number = UserStatus.ACTIVE;
  balance = 0;
}

export enum ROLE {
  ADMIN = 10,
  USER = 1,
  GUEST = 0,
  BAN = -1
}
