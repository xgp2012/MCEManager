import { LocalFileSource, QueryWrapper } from "mcsmanager-common";
import { v4 } from "uuid";
import Storage from "../common/storage/sys_storage";
import {
  Template,
  TemplateCategory,
  TemplatePort,
  TemplateType,
  TemplateVolume
} from "../entity/template";
import { $t } from "../i18n";
import { logger } from "./log";

class TemplateSubsystem {
  public readonly objects: Map<string, Template> = new Map();

  async initialize() {
    for (const uuid of await Storage.getStorage().list("Template")) {
      const template = (await Storage.getStorage().load("Template", Template, uuid)) as Template;
      this.objects.set(uuid, template);
    }
    logger.info($t("TXT_CODE_TEMPLATE_LOADED", { n: this.objects.size }));
  }

  async create(config: Partial<Template>): Promise<Template> {
    const uuid = v4().replace(/-/gim, "");
    const now = new Date().toLocaleString();
    const template = new Template();
    template.uuid = uuid;
    template.createdAt = now;
    template.updatedAt = now;
    this.objects.set(uuid, template);
    await this.edit(uuid, config);
    await Storage.getStorage().store("Template", uuid, template);
    return template;
  }

  async edit(uuid: string, config: Partial<Template>) {
    const template = this.getInstance(uuid);
    if (!template) throw new Error($t("TXT_CODE_TEMPLATE_NOT_FOUND"));
    if (config.name != null) template.name = String(config.name);
    if (config.displayName != null) template.displayName = String(config.displayName);
    if (config.description != null) template.description = String(config.description);
    if (config.category != null) template.category = Number(config.category);
    if (config.type != null) template.type = Number(config.type);
    if (config.dockerImage != null) template.dockerImage = String(config.dockerImage);
    if (config.dockerTag != null) template.dockerTag = String(config.dockerTag);
    if (config.processCommand != null) template.processCommand = String(config.processCommand);
    if (config.processArgs != null) template.processArgs = String(config.processArgs);
    if (config.processEnv != null) template.processEnv = config.processEnv || {};
    if (config.defaultCpuLimit != null) template.defaultCpuLimit = Number(config.defaultCpuLimit);
    if (config.defaultMemoryLimit != null)
      template.defaultMemoryLimit = Number(config.defaultMemoryLimit);
    if (config.defaultDiskLimit != null) template.defaultDiskLimit = Number(config.defaultDiskLimit);
    if (config.defaultUploadLimit != null)
      template.defaultUploadLimit = Number(config.defaultUploadLimit);
    if (config.defaultDownloadLimit != null)
      template.defaultDownloadLimit = Number(config.defaultDownloadLimit);
    if (config.ports != null) template.ports = this.normalizePorts(config.ports);
    if (config.volumes != null) template.volumes = this.normalizeVolumes(config.volumes);
    if (config.version != null) template.version = String(config.version);
    if (config.author != null) template.author = String(config.author);
    if (config.iconUrl != null) template.iconUrl = String(config.iconUrl);
    if (config.readme != null) template.readme = String(config.readme);
    if (config.enabled != null) template.enabled = Boolean(config.enabled);
    if (config.isOfficial != null) template.isOfficial = Boolean(config.isOfficial);
    if (config.sortOrder != null) template.sortOrder = Number(config.sortOrder);
    template.updatedAt = new Date().toLocaleString();
    await Storage.getStorage().store("Template", uuid, template);
  }

  async deleteInstance(uuid: string) {
    if (this.objects.has(uuid)) {
      this.objects.delete(uuid);
      await Storage.getStorage().delete("Template", uuid);
    }
  }

  getInstance(uuid: string) {
    return this.objects.get(uuid) || null;
  }

  getQueryWrapper() {
    return new QueryWrapper(new LocalFileSource<Template>(this.objects));
  }

  list(onlyEnabled = false): Template[] {
    const result: Template[] = [];
    this.objects.forEach((template) => {
      if (onlyEnabled && !template.enabled) return;
      result.push(template);
    });
    result.sort(
      (a, b) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt)
    );
    return result;
  }

  /**
   * Deep clone a template into a brand new entry (used by the clone API).
   */
  async clone(uuid: string): Promise<Template> {
    const source = this.getInstance(uuid);
    if (!source) throw new Error($t("TXT_CODE_TEMPLATE_NOT_FOUND"));
    const data = JSON.parse(JSON.stringify(source)) as Template;
    const newUuid = v4().replace(/-/gim, "");
    const now = new Date().toLocaleString();
    data.uuid = newUuid;
    data.createdAt = now;
    data.updatedAt = now;
    data.enabled = false;
    data.name = `${source.name}-clone`;
    this.objects.set(newUuid, data);
    await Storage.getStorage().store("Template", newUuid, data);
    return data;
  }

  private normalizePorts(ports: TemplatePort[]): TemplatePort[] {
    if (!Array.isArray(ports)) return [];
    const result: TemplatePort[] = [];
    for (const port of ports) {
      const containerPort = Number(port?.containerPort);
      if (!Number.isInteger(containerPort) || containerPort <= 0 || containerPort > 65535) continue;
      const protocol = String(port?.protocol || "tcp").toLowerCase();
      if (protocol !== "tcp" && protocol !== "udp") continue;
      result.push({
        containerPort,
        protocol,
        name: String(port?.name || `port-${containerPort}`),
        description: port?.description ? String(port.description) : undefined
      });
    }
    return result;
  }

  private normalizeVolumes(volumes: TemplateVolume[]): TemplateVolume[] {
    if (!Array.isArray(volumes)) return [];
    const result: TemplateVolume[] = [];
    for (const volume of volumes) {
      const containerPath = String(volume?.containerPath || "").trim();
      if (!containerPath || !containerPath.startsWith("/")) continue;
      result.push({
        containerPath,
        hostPath: volume?.hostPath ? String(volume.hostPath) : undefined,
        name: volume?.name ? String(volume.name) : undefined,
        readOnly: Boolean(volume?.readOnly)
      });
    }
    return result;
  }

  /**
   * Export a template to a portable JSON object (market exchange format).
   */
  exportData(uuid: string): Template | null {
    const template = this.getInstance(uuid);
    if (!template) return null;
    return JSON.parse(JSON.stringify(template));
  }

  /**
   * Import a template from a portable JSON object (market exchange format).
   * Invalid entries are rejected to avoid storing malformed data.
   */
  async importData(data: any): Promise<Template> {
    if (!data || typeof data !== "object")
      throw new Error($t("TXT_CODE_TEMPLATE_IMPORT_INVALID"));

    const config: Partial<Template> = {
      name: String(data.name || "").trim(),
      displayName: String(data.displayName || data.name || "").trim(),
      description: String(data.description || ""),
      category: Number(data.category ?? TemplateCategory.OTHER),
      type: Number(data.type ?? TemplateType.PROCESS),
      dockerImage: data.dockerImage ? String(data.dockerImage) : "",
      dockerTag: data.dockerTag ? String(data.dockerTag) : "",
      processCommand: data.processCommand ? String(data.processCommand) : "",
      processArgs: data.processArgs ? String(data.processArgs) : "",
      processEnv: data.processEnv && typeof data.processEnv === "object" ? data.processEnv : {},
      defaultCpuLimit: Number(data.defaultCpuLimit ?? 0),
      defaultMemoryLimit: Number(data.defaultMemoryLimit ?? 0),
      defaultDiskLimit: Number(data.defaultDiskLimit ?? 0),
      defaultUploadLimit: Number(data.defaultUploadLimit ?? 0),
      defaultDownloadLimit: Number(data.defaultDownloadLimit ?? 0),
      ports: this.normalizePorts(data.ports || []),
      volumes: this.normalizeVolumes(data.volumes || []),
      version: String(data.version || "1.0.0"),
      author: String(data.author || ""),
      iconUrl: data.iconUrl ? String(data.iconUrl) : "",
      readme: data.readme ? String(data.readme) : "",
      isOfficial: Boolean(data.isOfficial),
      sortOrder: Number(data.sortOrder ?? 0)
    };

    if (!config.name) throw new Error($t("TXT_CODE_TEMPLATE_IMPORT_INVALID"));
    const type = Number(config.type);
    if (type !== TemplateType.DOCKER && type !== TemplateType.PROCESS)
      throw new Error($t("TXT_CODE_TEMPLATE_IMPORT_INVALID"));

    return this.create(config);
  }
}

export default new TemplateSubsystem();
