// Instance template entity definition.
// A template describes how to deploy an instance (Docker container or native
// process) including image/command, default resource limits, exposed ports,
// persistent volumes and metadata for the marketplace.

export enum TemplateCategory {
  MINECRAFT_JAVA = 1,
  MINECRAFT_BEDROCK = 2,
  STEAM_GAME = 3,
  VOICE_CHAT = 4,
  PROXY = 5,
  DATABASE = 6,
  WEB_SERVICE = 7,
  OTHER = 99
}

export enum TemplateType {
  DOCKER = 1, // Docker container template
  PROCESS = 2 // Native process command template
}

export interface TemplatePort {
  containerPort: number;
  protocol: "tcp" | "udp";
  name: string;
  description?: string;
}

export interface TemplateVolume {
  containerPath: string;
  hostPath?: string; // empty means anonymous volume
  name?: string;
  readOnly: boolean;
}

export interface ITemplate {
  uuid: string;
  name: string;
  displayName: string;
  description: string;
  category: TemplateCategory;
  type: TemplateType;
  // image / runtime configuration
  dockerImage?: string; // Docker image (type = DOCKER)
  dockerTag?: string; // image tag
  processCommand?: string; // start command (type = PROCESS)
  processArgs?: string; // start arguments
  processEnv?: Record<string, string>; // environment variables
  // default resource values (a plan may override these)
  defaultCpuLimit: number;
  defaultMemoryLimit: number; // MB
  defaultDiskLimit: number; // GB
  defaultUploadLimit: number; // Mbps
  defaultDownloadLimit: number; // Mbps
  // port mapping
  ports: TemplatePort[];
  // persistent volumes
  volumes: TemplateVolume[];
  // metadata
  version: string;
  author: string;
  iconUrl?: string;
  readme?: string;
  // status
  enabled: boolean;
  isOfficial: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export class Template implements ITemplate {
  uuid = "";
  name = "";
  displayName = "";
  description = "";
  category: number = TemplateCategory.OTHER;
  type: number = TemplateType.PROCESS;
  dockerImage = "";
  dockerTag = "";
  processCommand = "";
  processArgs = "";
  processEnv: Record<string, string> = {};
  defaultCpuLimit = 0;
  defaultMemoryLimit = 0;
  defaultDiskLimit = 0;
  defaultUploadLimit = 0;
  defaultDownloadLimit = 0;
  ports: TemplatePort[] = [];
  volumes: TemplateVolume[] = [];
  version = "1.0.0";
  author = "";
  iconUrl = "";
  readme = "";
  enabled = true;
  isOfficial = false;
  sortOrder = 0;
  createdAt = "";
  updatedAt = "";
}
