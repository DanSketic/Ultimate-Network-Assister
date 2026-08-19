import type { BlueprintModule, ParamDef } from '../model';
import type { MhText } from './multiHousehold.text';

/*
 * Module catalogue and parameters for the multi-household Proxmox + UniFi
 * preset. Split from the builder so the (long) target-state logic stays
 * readable next to it.
 *
 * Structure lives here, prose lives in multiHousehold.text.ts. Codes match the
 * chapter numbers of the source handbook, so an exported guide and the original
 * are directly comparable.
 */

/** Everything about a module except its title and summary. */
type ModuleShape = Omit<BlueprintModule, 'title' | 'summary'>;

const MODULE_SHAPES: ModuleShape[] = [
  // ------------------------------------------------------------- overview
  { id: 'scope', code: '1', group: 'overview', targets: ['host'], risk: 'low', minutes: 10, optional: false },
  { id: 'hardware-state', code: '2', group: 'overview', targets: ['host'], risk: 'medium', minutes: 15, optional: true },
  { id: 'architecture', code: '3', group: 'overview', targets: ['unifi', 'proxmox'], risk: 'low', minutes: 10, optional: false },
  { id: 'safety-rules', code: '4', group: 'overview', targets: ['host'], risk: 'high', minutes: 15, optional: false },

  // -------------------------------------------------------------- network
  { id: 'vlan-wifi', code: '9', group: 'network', targets: ['unifi'], risk: 'high', minutes: 75, optional: false },
  { id: 'firewall', code: '10', group: 'network', targets: ['unifi'], risk: 'high', minutes: 60, optional: false, requires: ['vlan-wifi'] },
  { id: 'shared-printer', code: '10A', group: 'network', targets: ['unifi'], risk: 'medium', minutes: 30, optional: true, requires: ['firewall'] },
  { id: 'gateway-hardening', code: '10B', group: 'network', targets: ['unifi', 'proxmox'], risk: 'high', minutes: 45, optional: true, requires: ['firewall'] },
  { id: 'pve-bridges', code: '11', group: 'network', targets: ['proxmox'], risk: 'high', minutes: 30, optional: false },
  { id: 'cameras', code: '10C', group: 'network', targets: ['unifi'], risk: 'medium', minutes: 45, optional: true, requires: ['firewall'] },
  { id: 'public-access', code: '25', group: 'network', targets: ['unifi'], risk: 'high', minutes: 30, optional: true, requires: ['firewall'] },

  // --------------------------------------------------------------- server
  { id: 'physical', code: '5', group: 'server', targets: ['host'], risk: 'medium', minutes: 60, optional: true },
  { id: 'bios', code: '6', group: 'server', targets: ['host'], risk: 'medium', minutes: 20, optional: true },
  { id: 'pve-base', code: '7', group: 'server', targets: ['proxmox'], risk: 'low', minutes: 25, optional: false },
  { id: 'disk-validation', code: '8', group: 'server', targets: ['proxmox'], risk: 'medium', minutes: 40, optional: false, requires: ['pve-base'] },
  { id: 'storage', code: '12', group: 'server', targets: ['proxmox'], risk: 'high', minutes: 60, optional: false, requires: ['disk-validation'] },
  { id: 'resources', code: '13', group: 'server', targets: ['proxmox'], risk: 'medium', minutes: 20, optional: false },
  { id: 'vm-template', code: '14', group: 'server', targets: ['proxmox'], risk: 'medium', minutes: 35, optional: false, requires: ['storage'] },

  // ------------------------------------------------------------- services
  { id: 'adguard', code: '15', group: 'services', targets: ['proxmox'], risk: 'medium', minutes: 30, optional: true },
  { id: 'home-assistant', code: '16', group: 'services', targets: ['proxmox'], risk: 'medium', minutes: 40, optional: true },
  { id: 'windows-rdp', code: '17', group: 'services', targets: ['proxmox'], risk: 'medium', minutes: 60, optional: true },
  { id: 'gitlab', code: '18', group: 'services', targets: ['proxmox'], risk: 'medium', minutes: 60, optional: true },
  { id: 'gitlab-runner', code: '19', group: 'services', targets: ['proxmox', 'docker'], risk: 'medium', minutes: 45, optional: true, requires: ['gitlab'] },
  { id: 'prod-docker', code: '20', group: 'services', targets: ['proxmox', 'docker'], risk: 'medium', minutes: 45, optional: true },
  { id: 'media-docker', code: '21', group: 'services', targets: ['proxmox', 'docker'], risk: 'high', minutes: 90, optional: true, requires: ['storage'] },
  { id: 'media-stack', code: '22', group: 'services', targets: ['docker'], risk: 'medium', minutes: 60, optional: true, requires: ['media-docker'] },
  { id: 'nextcloud', code: '23', group: 'services', targets: ['proxmox', 'docker'], risk: 'medium', minutes: 60, optional: true },
  { id: 'cloudflare-tunnel', code: '24', group: 'services', targets: ['proxmox'], risk: 'medium', minutes: 30, optional: true },

  // ------------------------------------------------------------------ ops
  { id: 'boot-order', code: '26', group: 'ops', targets: ['proxmox'], risk: 'low', minutes: 20, optional: false },
  { id: 'monitoring', code: '27', group: 'ops', targets: ['proxmox'], risk: 'low', minutes: 40, optional: true },
  { id: 'updates', code: '28', group: 'ops', targets: ['proxmox', 'docker'], risk: 'medium', minutes: 30, optional: true },
  { id: 'troubleshooting', code: '29', group: 'ops', targets: ['proxmox'], risk: 'low', minutes: 0, optional: true },
  { id: 'handover', code: '30', group: 'ops', targets: ['unifi', 'proxmox'], risk: 'low', minutes: 45, optional: false },
];

export function buildModules(x: MhText): BlueprintModule[] {
  return MODULE_SHAPES.map<BlueprintModule>((shape) => {
    const text = x.modules[shape.id];
    return { ...shape, title: text?.title ?? shape.id, summary: text?.summary ?? '' };
  });
}

/** Everything about a parameter except its label, help and option labels. */
type ParamShape = Omit<ParamDef, 'label' | 'help' | 'group' | 'options'> & {
  group: keyof MhText['paramGroups'];
  /** Option values in display order; their labels come from the text bundle. */
  optionValues?: string[];
};

const vlan = (
  id: string,
  def: number,
  moduleId?: string,
): ParamShape => ({
  id,
  type: 'vlan',
  default: def,
  min: 1,
  max: 4094,
  group: 'vlans',
  ...(moduleId ? { moduleId } : {}),
});

const ip = (id: string, def: string, moduleId?: string): ParamShape => ({
  id,
  type: 'ipv4',
  default: def,
  group: 'fixedIps',
  ...(moduleId ? { moduleId } : {}),
});

const PARAM_SHAPES: ParamShape[] = [
  // ------------------------------------------------------------- addressing
  // Layout comes first: it decides how many household networks exist at all,
  // so every other choice below reads differently depending on it.
  {
    id: 'layout',
    type: 'enum',
    default: 'floorsIsolated',
    optionValues: ['single', 'floorsOpen', 'floorsIsolated'],
    group: 'addressing',
  },
  // Whether IoT and guests are cut up the same way the clients are. `auto`
  // splits them only where the floors are fully shut off from each other;
  // with open floors a separate sensor or guest subnet per floor divides
  // nothing that is not already open.
  {
    id: 'iotScope',
    type: 'enum',
    default: 'auto',
    optionValues: ['auto', 'perFloor', 'shared'],
    group: 'addressing',
  },
  {
    id: 'guestScope',
    type: 'enum',
    default: 'auto',
    optionValues: ['auto', 'perFloor', 'shared'],
    group: 'addressing',
  },
  { id: 'ipPrefix', type: 'text', default: '192.168', group: 'addressing' },
  { id: 'gatewayHostByte', type: 'number', default: 1, min: 1, max: 254, group: 'addressing' },

  // ----------------------------------------------------------- shared VLANs
  vlan('vlanMgmt', 2),
  vlan('vlanOwner', 15),
  vlan('vlanInfra', 20),
  vlan('vlanPrinters', 25, 'shared-printer'),
  vlan('vlanCameras', 35, 'cameras'),
  vlan('vlanDmz', 30, 'cloudflare-tunnel'),
  vlan('vlanVpn', 40),
  vlan('vlanRdp', 50, 'windows-rdp'),
  vlan('vlanMedia', 60, 'media-docker'),
  vlan('vlanTest', 100, 'gitlab-runner'),
  vlan('vlanProd', 200),
  { id: 'sharedGuestVlan', type: 'vlan', default: 90, min: 0, max: 4094, group: 'vlans' },

  // ---------------------------------------------------------------- Wi-Fi
  { id: 'ssidMain', type: 'text', default: 'MyWifi_Ultra', group: 'wifi', moduleId: 'vlan-wifi' },
  { id: 'ssidCast', type: 'text', default: 'MyWifi_Cast', group: 'wifi', moduleId: 'vlan-wifi' },
  { id: 'ssidIot', type: 'text', default: 'MyWifi_Lot', group: 'wifi', moduleId: 'vlan-wifi' },
  { id: 'ssidGuest', type: 'text', default: 'Vendeg', group: 'wifi', moduleId: 'vlan-wifi' },
  { id: 'castSharesClientVlan', type: 'boolean', default: true, group: 'wifi', moduleId: 'vlan-wifi' },
  { id: 'guestIsolation', type: 'boolean', default: true, group: 'wifi', moduleId: 'vlan-wifi' },

  // -------------------------------------------------------- fixed addresses
  ip('ipPve', '192.168.2.10'),
  ip('ipAdguard', '192.168.20.53', 'adguard'),
  ip('ipHomeAssistant', '192.168.20.10', 'home-assistant'),
  ip('ipPrinter', '192.168.25.10', 'shared-printer'),
  ip('ipNvr', '192.168.35.10', 'cameras'),
  ip('ipWindows', '192.168.50.10', 'windows-rdp'),
  ip('ipMedia', '192.168.60.10', 'media-docker'),
  ip('ipProdDocker', '192.168.200.10', 'prod-docker'),
  ip('ipGitlab', '192.168.200.20', 'gitlab'),
  ip('ipNextcloud', '192.168.200.30', 'nextcloud'),
  ip('ipRunner', '192.168.100.10', 'gitlab-runner'),
  ip('ipTunnel', '192.168.30.10', 'cloudflare-tunnel'),

  // --------------------------------------------------------------- server
  { id: 'ramProfile', type: 'enum', default: '64', optionValues: ['64', '48'], group: 'server' },
  { id: 'mgmtSeparateNic', type: 'boolean', default: true, group: 'server', moduleId: 'pve-bridges' },
  { id: 'trunkBridge', type: 'text', default: 'vmbr1', group: 'server', moduleId: 'pve-bridges' },

  // -------------------------------------------------------------- storage
  { id: 'fastPoolName', type: 'text', default: 'fastpool', group: 'storage', moduleId: 'storage' },
  {
    id: 'fastPoolDevices',
    type: 'text',
    default: '/dev/disk/by-id/ata-SSD1, /dev/disk/by-id/ata-SSD2',
    group: 'storage',
    moduleId: 'storage',
  },
  { id: 'mediaDiskCount', type: 'number', default: 2, min: 1, max: 8, group: 'storage', moduleId: 'storage' },
  { id: 'mediaMount', type: 'text', default: '/srv/media', group: 'storage', moduleId: 'storage' },
  { id: 'scratchDisk', type: 'boolean', default: false, group: 'storage', moduleId: 'storage' },

  // -------------------------------------------------------------- cameras
  { id: 'cameraCount', type: 'number', default: 6, min: 1, max: 64, group: 'cameras', moduleId: 'cameras' },
  {
    id: 'cameraRetentionDays',
    type: 'number',
    default: 14,
    min: 1,
    max: 365,
    unit: 'nap',
    group: 'cameras',
    moduleId: 'cameras',
  },
  { id: 'cameraInternet', type: 'boolean', default: false, group: 'cameras', moduleId: 'cameras' },

  // ----------------------------------------------------------- publishing
  { id: 'publicDomain', type: 'text', default: 'pelda.hu', group: 'publishing', moduleId: 'public-access' },
  {
    id: 'mediaPublicPort',
    type: 'number',
    default: 32400,
    min: 1,
    max: 65535,
    group: 'publishing',
    moduleId: 'public-access',
  },
  {
    id: 'idsMode',
    type: 'enum',
    default: 'ips',
    optionValues: ['ips', 'ids', 'off'],
    group: 'publishing',
    moduleId: 'gateway-hardening',
  },
];

export function buildParams(x: MhText): ParamDef[] {
  return PARAM_SHAPES.map<ParamDef>((shape) => {
    const { optionValues, group, ...rest } = shape;
    const text = x.params[shape.id];
    return {
      ...rest,
      ...(text?.default !== undefined ? { default: text.default } : {}),
      label: text?.label ?? shape.id,
      ...(text?.help ? { help: text.help } : {}),
      group: x.paramGroups[group],
      ...(optionValues
        ? {
            options: optionValues.map((value) => ({
              value,
              label: text?.options?.[value] ?? value,
            })),
          }
        : {}),
    };
  });
}
