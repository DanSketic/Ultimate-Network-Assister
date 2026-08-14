import type { Lang } from '@/i18n';
import type {
  AddressObject,
  BlueprintPreset,
  BuildContext,
  BuildResult,
  Household,
  PlannedGuest,
  PlannedNetwork,
  PlannedPolicy,
  PlannedService,
  PlannedSsid,
  PlannedStorage,
  PlannedZone,
  PortObject,
  PpskEntry,
} from '../model';
import { buildModules, buildParams } from './multiHousehold.modules';
import { mhText, type MhText } from './multiHousehold.text';

/*
 * Multi-household Proxmox + UniFi estate.
 *
 * One gateway, one hypervisor, and N households that must not see each other.
 * Every household gets a client, an IoT and a guest VLAN; shared services sit
 * in their own VLANs and are reached through named allows only.
 *
 * Policy ordering follows the handbook: specific allows first, broad blocks
 * last, so a later deny can never shadow an earlier permit.
 *
 * The preset is built per language rather than translated afterwards — every
 * string here comes out of `build()` already glued to a household name or a
 * VLAN id, so there would be nothing left to translate once it has run.
 */

const ORDER = {
  householdAllow: 100,
  printerAllow: 200,
  iotAllow: 300,
  guestAllow: 400,
  adminAllow: 500,
  crossHouseholdBlock: 700,
  zoneBlock: 800,
  catchAll: 900,
} as const;

/** Household ids stay stable across languages; only the display name moves. */
const HOUSEHOLD_SHAPES = [
  { id: 'house-1', clientVlan: 10, iotVlan: 71, guestVlan: 91 },
  { id: 'house-2', clientVlan: 11, iotVlan: 72, guestVlan: 92 },
  { id: 'house-3', clientVlan: 12, iotVlan: 73, guestVlan: 93 },
] as const;

export function defaultHouseholds(x: MhText): Household[] {
  return HOUSEHOLD_SHAPES.map<Household>((shape, i) => ({
    ...shape,
    name: x.households[i]?.name ?? shape.id,
    slug: x.households[i]?.slug ?? shape.id.toUpperCase(),
  }));
}

/** Third octet is the VLAN id, the way the handbook allocates subnets. */
function subnet(prefix: string, vlan: number): string {
  return `${prefix}.${vlan}.0/24`;
}

function gatewayAddress(prefix: string, vlan: number, hostByte: number): string {
  return `${prefix}.${vlan}.${hostByte}`;
}

interface GuestSpec {
  vmid: number;
  name: string;
  moduleId: string;
  kind: 'vm' | 'lxc';
  vlanParam: string;
  vcpu: string;
  ram64: string;
  ram48: string;
  /** Set when the tightened profile also changes how the guest is run. */
  ram48Note?: boolean;
  disk: string;
  os: string;
  ipParam?: string;
}

const GUESTS: GuestSpec[] = [
  {
    vmid: 100, name: 'Windows', moduleId: 'windows-rdp', kind: 'vm', vlanParam: 'vlanRdp',
    vcpu: '4–6', ram64: '10 GB', ram48: '8 GB', disk: '220–300 GB', os: 'Windows 11',
    ipParam: 'ipWindows',
  },
  {
    vmid: 110, name: 'GitLab', moduleId: 'gitlab', kind: 'vm', vlanParam: 'vlanProd',
    vcpu: '4', ram64: '8–10 GB', ram48: '8 GB', disk: '120–180 GB', os: 'Debian',
    ipParam: 'ipGitlab',
  },
  {
    vmid: 120, name: 'Media', moduleId: 'media-docker', kind: 'vm', vlanParam: 'vlanMedia',
    vcpu: '4–6', ram64: '8 GB', ram48: '6 GB', disk: '70–100 GB', os: 'Debian',
    ipParam: 'ipMedia',
  },
  {
    vmid: 130, name: 'Prod Docker', moduleId: 'prod-docker', kind: 'vm', vlanParam: 'vlanProd',
    vcpu: '4', ram64: '5–6 GB', ram48: '4 GB', disk: '80–120 GB', os: 'Debian',
    ipParam: 'ipProdDocker',
  },
  {
    vmid: 140, name: 'Test / Runner', moduleId: 'gitlab-runner', kind: 'vm', vlanParam: 'vlanTest',
    vcpu: '4–6', ram64: '5–6 GB', ram48: '', ram48Note: true, disk: '100 GB', os: 'Debian',
    ipParam: 'ipRunner',
  },
  {
    vmid: 150, name: 'Home Assistant', moduleId: 'home-assistant', kind: 'vm', vlanParam: 'vlanInfra',
    vcpu: '2', ram64: '4 GB', ram48: '3 GB', disk: '32–64 GB', os: 'Home Assistant OS',
    ipParam: 'ipHomeAssistant',
  },
  {
    vmid: 160, name: 'Nextcloud', moduleId: 'nextcloud', kind: 'vm', vlanParam: 'vlanProd',
    vcpu: '4', ram64: '6 GB', ram48: '4 GB', disk: '60 GB + data disk', os: 'Debian',
    ipParam: 'ipNextcloud',
  },
  {
    vmid: 170, name: 'AdGuard Home', moduleId: 'adguard', kind: 'lxc', vlanParam: 'vlanInfra',
    vcpu: '1', ram64: '512 MB–1 GB', ram48: '512 MB–1 GB', disk: '8 GB', os: 'Debian LXC',
    ipParam: 'ipAdguard',
  },
  {
    vmid: 180, name: 'Tunnel', moduleId: 'cloudflare-tunnel', kind: 'lxc', vlanParam: 'vlanDmz',
    vcpu: '1', ram64: '256–512 MB', ram48: '256–512 MB', disk: '4 GB', os: 'Debian LXC',
    ipParam: 'ipTunnel',
  },
];

function makeBuild(x: MhText) {
  return function build(ctx: BuildContext): BuildResult {
    const { enabled } = ctx;
    const prefix = ctx.str('ipPrefix');
    const gwByte = ctx.num('gatewayHostByte');
    const ram48 = ctx.str('ramProfile') === '48';

    /*
     * Layout decides how the building is cut up:
     *
     *   single          one set of networks for the whole building; the
     *                   household list is not used.
     *   floorsOpen      a subnet per floor, and the floors are allowed to
     *                   reach each other — one household, several segments.
     *   floorsIsolated  a subnet per floor, and they never see each other.
     *
     * Only the last two differ in policy; the networks are built the same way,
     * which keeps the difference legible in the plan instead of hidden in two
     * near-identical branches.
     */
    const layout = ctx.str('layout');
    const perFloor = layout !== 'single';
    const floorsIsolated = layout === 'floorsIsolated';

    // In single-household mode the whole building is one synthetic household,
    // so every downstream loop stays the same shape.
    const households: Household[] = perFloor
      ? ctx.households
      : [
          {
            id: 'building',
            name: x.net.buildingName,
            slug: x.net.buildingName,
            clientVlan: ctx.households[0]?.clientVlan ?? 10,
            iotVlan: ctx.households[0]?.iotVlan ?? 71,
            guestVlan: ctx.households[0]?.guestVlan ?? 91,
          },
        ];

    /**
     * Names a per-household object. With one household there is nothing to
     * tell apart, so the suffix would only produce `HOME-HOME`.
     */
    const per = (base: string, slug: string) => (perFloor ? `${base}-${slug}` : base);

    const networks: PlannedNetwork[] = [];
    const zones: PlannedZone[] = [];
    const policies: PlannedPolicy[] = [];
    const addressObjects: AddressObject[] = [];
    const portObjects: PortObject[] = [];
    const guests: PlannedGuest[] = [];
    const storage: PlannedStorage[] = [];
    const services: PlannedService[] = [];

    const addNetwork = (
      vlan: number,
      name: string,
      role: PlannedNetwork['role'],
      purpose: string,
      moduleId: string,
      householdId?: string,
    ) => {
      networks.push({
        vlan,
        name,
        cidr: subnet(prefix, vlan),
        gateway: gatewayAddress(prefix, vlan, gwByte),
        role,
        purpose,
        moduleId,
        ...(householdId ? { householdId } : {}),
      });
    };

    const addZone = (
      name: string,
      purpose: string,
      vlans: number[],
      moduleId: string,
      householdId?: string,
    ) => {
      zones.push({ name, purpose, vlans, moduleId, ...(householdId ? { householdId } : {}) });
    };

    /* ----------------------------------------------------- shared networks */

    const vlanMgmt = ctx.num('vlanMgmt');
    const vlanOwner = ctx.num('vlanOwner');
    const vlanInfra = ctx.num('vlanInfra');
    const vlanVpn = ctx.num('vlanVpn');
    const vlanProd = ctx.num('vlanProd');

    addNetwork(vlanMgmt, 'MGMT', 'management', x.net.mgmt, 'vlan-wifi');
    addNetwork(vlanOwner, 'OWNER-TRUSTED', 'trusted', x.net.owner, 'vlan-wifi');
    addNetwork(vlanInfra, 'INFRA', 'infra', x.net.infra, 'vlan-wifi');
    addNetwork(vlanVpn, 'VPN', 'vpn', x.net.vpn, 'vlan-wifi');
    addNetwork(vlanProd, 'SERVER-PROD', 'server-prod', x.net.prod, 'vlan-wifi');

    const hasPrinter = enabled.has('shared-printer');
    const vlanPrinters = ctx.num('vlanPrinters');
    if (hasPrinter) {
      addNetwork(vlanPrinters, 'SHARED-PRINTERS', 'printers', x.net.printers, 'shared-printer');
    }

    const hasTunnel = enabled.has('cloudflare-tunnel');
    const vlanDmz = ctx.num('vlanDmz');
    if (hasTunnel) addNetwork(vlanDmz, 'DMZ', 'dmz', x.net.dmz, 'cloudflare-tunnel');

    const hasRdp = enabled.has('windows-rdp');
    const vlanRdp = ctx.num('vlanRdp');
    if (hasRdp) addNetwork(vlanRdp, 'RDP', 'rdp', x.net.rdp, 'windows-rdp');

    const hasMedia = enabled.has('media-docker');
    const vlanMedia = ctx.num('vlanMedia');
    if (hasMedia) addNetwork(vlanMedia, 'MEDIA', 'media', x.net.media, 'media-docker');

    const hasTest = enabled.has('gitlab-runner');
    const vlanTest = ctx.num('vlanTest');
    if (hasTest) addNetwork(vlanTest, 'SERVER-TEST', 'server-test', x.net.test, 'gitlab-runner');

    /* -------------------------------------------------- household networks */

    for (const h of households) {
      addNetwork(
        h.clientVlan,
        per('HOME', h.slug),
        'household',
        perFloor ? x.net.household(h.name) : x.net.buildingClients,
        'vlan-wifi',
        h.id,
      );
      addNetwork(
        h.iotVlan,
        per('IOT', h.slug),
        'iot',
        perFloor ? x.net.iot(h.name) : x.net.buildingIot,
        'vlan-wifi',
        h.id,
      );
      addNetwork(
        h.guestVlan,
        per('GUEST', h.slug),
        'guest',
        perFloor ? x.net.guest(h.name) : x.net.buildingGuests,
        'vlan-wifi',
        h.id,
      );
    }

    const hasCameras = enabled.has('cameras');
    const vlanCameras = ctx.num('vlanCameras');
    if (hasCameras) {
      addNetwork(vlanCameras, 'CAMERA', 'cameras', x.net.cameras, 'cameras');
    }

    const sharedGuestVlan = ctx.num('sharedGuestVlan');
    if (sharedGuestVlan > 0) {
      addNetwork(sharedGuestVlan, x.net.sharedGuestName, 'guest', x.net.sharedGuest, 'vlan-wifi');
    }

    /* ---------------------------------------------------------------- Wi-Fi */

    const ssids: PlannedSsid[] = [];
    if (enabled.has('vlan-wifi')) {
      const castShares = ctx.bool('castSharesClientVlan');

      ssids.push({
        name: ctx.str('ssidMain'),
        security: 'wpa2-ppsk',
        band: x.ssid.band245,
        purpose: x.ssid.mainPurpose,
        ppsk: households.map((h) => ({
          label: x.ssid.clientsKey(h.name),
          vlan: h.clientVlan,
          householdId: h.id,
        })),
        moduleId: 'vlan-wifi',
      });

      ssids.push({
        name: ctx.str('ssidCast'),
        security: 'wpa2-ppsk',
        band: x.ssid.band245,
        purpose: castShares ? x.ssid.castShared : x.ssid.castSeparate,
        ppsk: households.map((h) => ({
          label: x.ssid.castKey(h.name),
          vlan: castShares ? h.clientVlan : h.iotVlan,
          householdId: h.id,
          note: castShares ? x.ssid.castNote : undefined,
        })),
        moduleId: 'vlan-wifi',
      });

      ssids.push({
        name: ctx.str('ssidIot'),
        security: 'wpa2-ppsk',
        band: x.ssid.band24,
        purpose: x.ssid.iotPurpose,
        ppsk: households.map((h) => ({
          label: x.ssid.iotKey(h.name),
          vlan: h.iotVlan,
          householdId: h.id,
        })),
        moduleId: 'vlan-wifi',
      });

      const guestKeys: PpskEntry[] = households.map((h) => ({
        label: x.ssid.guestKey(h.name),
        vlan: h.guestVlan,
        householdId: h.id,
      }));
      if (sharedGuestVlan > 0) {
        guestKeys.push({ label: x.ssid.sharedGuestKey, vlan: sharedGuestVlan });
      }
      ssids.push({
        name: ctx.str('ssidGuest'),
        security: 'wpa2-ppsk',
        band: x.ssid.band245,
        purpose: x.ssid.guestPurpose,
        ppsk: guestKeys,
        moduleId: 'vlan-wifi',
      });
    }

    /* ---------------------------------------------------------------- zones */

    if (enabled.has('firewall')) {
      addZone('MGMT', x.zone.mgmt, [vlanMgmt], 'firewall');
      addZone('OWNER', x.zone.owner, [vlanOwner], 'firewall');
      addZone('INFRA', x.zone.infra, [vlanInfra], 'firewall');
      addZone('PROD', x.zone.prod, [vlanProd], 'firewall');
      addZone('VPN', x.zone.vpn, [vlanVpn], 'firewall');
      addZone('EXTERNAL', x.zone.external, [], 'firewall');

      for (const h of households) {
        addZone(
          per('HOUSE', h.slug),
          perFloor ? x.zone.house(h.name) : x.net.buildingClients,
          [h.clientVlan],
          'firewall',
          h.id,
        );
        addZone(
          per('IOT', h.slug),
          perFloor ? x.zone.iot(h.name) : x.net.buildingIot,
          [h.iotVlan],
          'firewall',
          h.id,
        );
      }

      const guestVlans = households.map((h) => h.guestVlan);
      if (sharedGuestVlan > 0) guestVlans.push(sharedGuestVlan);
      addZone('GUEST', x.zone.guest, guestVlans, 'firewall');

      if (hasCameras) addZone('CAMERA', x.zone.cameras, [vlanCameras], 'cameras');
      if (hasPrinter) addZone('PRINTERS', x.zone.printers, [vlanPrinters], 'shared-printer');
      if (hasTest) addZone('TEST', x.zone.test, [vlanTest], 'gitlab-runner');
      if (hasMedia) addZone('MEDIA', x.zone.media, [vlanMedia], 'media-docker');
      if (hasRdp) addZone('RDP', x.zone.rdp, [vlanRdp], 'windows-rdp');
      if (hasTunnel) addZone('DMZ', x.zone.dmz, [vlanDmz], 'cloudflare-tunnel');
    }

    /* ------------------------------------------------------- named objects */

    if (enabled.has('firewall')) {
      addressObjects.push({ name: 'PVE-MGMT', address: ctx.str('ipPve'), purpose: x.object.pveMgmt });
      if (enabled.has('adguard')) {
        addressObjects.push({ name: 'ADGUARD', address: ctx.str('ipAdguard'), purpose: x.object.adguard });
      }
      if (enabled.has('home-assistant')) {
        addressObjects.push({
          name: 'HOMEASSISTANT',
          address: ctx.str('ipHomeAssistant'),
          purpose: x.object.homeAssistant,
        });
      }
      if (hasPrinter) {
        addressObjects.push({ name: 'SHARED-PRINTER', address: ctx.str('ipPrinter'), purpose: x.object.printer });
      }
      if (hasRdp) {
        addressObjects.push({ name: 'WINDOWS-RDP', address: ctx.str('ipWindows'), purpose: x.object.windows });
      }
      if (hasMedia) {
        addressObjects.push({ name: 'MEDIA-SERVER', address: ctx.str('ipMedia'), purpose: x.object.media });
      }
      if (enabled.has('prod-docker')) {
        addressObjects.push({ name: 'PROD-DOCKER', address: ctx.str('ipProdDocker'), purpose: x.object.prodDocker });
      }
      if (enabled.has('gitlab')) {
        addressObjects.push({ name: 'GITLAB', address: ctx.str('ipGitlab'), purpose: x.object.gitlab });
      }
      if (enabled.has('nextcloud')) {
        addressObjects.push({ name: 'NEXTCLOUD', address: ctx.str('ipNextcloud'), purpose: x.object.nextcloud });
      }
      if (hasTest) {
        addressObjects.push({ name: 'TEST-RUNNER', address: ctx.str('ipRunner'), purpose: x.object.runner });
      }
      if (hasTunnel) {
        addressObjects.push({ name: 'TUNNEL', address: ctx.str('ipTunnel'), purpose: x.object.tunnel });
      }
      if (hasCameras) {
        addressObjects.push({ name: 'NVR', address: ctx.str('ipNvr'), purpose: x.object.nvr });
      }

      portObjects.push(
        { name: 'DNS', protocol: 'tcp/udp', ports: '53', purpose: x.object.dns },
        { name: 'NTP', protocol: 'udp', ports: '123', purpose: x.object.ntp },
        { name: 'PROXMOX-ADMIN', protocol: 'tcp', ports: '8006, 22', purpose: x.object.proxmoxAdmin },
        { name: 'WEB-HTTPS', protocol: 'tcp', ports: '443', purpose: x.object.webHttps },
      );
      if (hasRdp) portObjects.push({ name: 'RDP', protocol: 'tcp', ports: '3389', purpose: x.object.rdp });
      if (hasMedia) {
        portObjects.push(
          {
            name: 'MEDIA-STREAM',
            protocol: 'tcp',
            ports: String(ctx.num('mediaPublicPort')),
            purpose: x.object.mediaStream,
          },
          {
            name: 'MEDIA-ADMIN',
            protocol: 'tcp',
            ports: '7878, 8989, 9696, 8080, 6789, 5055, 8181',
            purpose: x.object.mediaAdmin,
          },
        );
      }
      if (enabled.has('home-assistant')) {
        portObjects.push({
          name: 'HOMEASSISTANT',
          protocol: 'tcp',
          ports: '8123',
          purpose: x.object.homeAssistantPort,
        });
      }
      if (enabled.has('gitlab')) {
        portObjects.push(
          { name: 'GITLAB-WEB', protocol: 'tcp', ports: '80, 443', purpose: x.object.gitlabWeb },
          { name: 'GITLAB-SSH', protocol: 'tcp', ports: '22', purpose: x.object.gitlabSsh },
        );
      }
      if (hasCameras) {
        portObjects.push(
          { name: 'CAMERA-STREAM', protocol: 'tcp', ports: '554, 8000', purpose: x.object.cameraStream },
          { name: 'NVR-ADMIN', protocol: 'tcp', ports: '443, 7080, 7443', purpose: x.object.cameraAdmin },
        );
      }
      if (hasPrinter) {
        // The handbook is explicit that SNMP must not be merged into the TCP
        // print object; keeping them apart also keeps the allows narrow.
        portObjects.push(
          { name: 'PRINTER-TCP', protocol: 'tcp', ports: '9100, 631, 515', purpose: x.object.printerTcp },
          { name: 'PRINTER-SNMP', protocol: 'udp', ports: '161', purpose: x.object.printerSnmp },
          { name: 'PRINTER-ADMIN', protocol: 'tcp', ports: '80, 443', purpose: x.object.printerAdmin },
        );
      }
    }

    /* ------------------------------------------------------------- policies */

    if (enabled.has('firewall')) {
      // A block rule may only name zones that exist, otherwise switching a
      // module off would leave the plan referring to something never created.
      const zoneList = (...names: (string | false)[]) => names.filter(Boolean).join(', ');
      const iotBlocked = zoneList(
        'MGMT',
        'OWNER',
        'PROD',
        hasTest && 'TEST',
        hasRdp && 'RDP',
        hasPrinter && 'PRINTERS',
        hasCameras && 'CAMERA',
      );
      const mediaBlocked = zoneList('MGMT', 'OWNER', hasRdp && 'RDP', hasTest && 'TEST', 'PROD');

      for (const h of households) {
        const house = per('HOUSE', h.slug);

        policies.push({
          order: ORDER.householdAllow,
          from: house,
          to: 'EXTERNAL',
          action: 'allow',
          log: false,
          purpose: x.policy.internet,
          moduleId: 'firewall',
        });

        if (enabled.has('adguard')) {
          policies.push({
            order: ORDER.householdAllow + 1,
            from: house,
            to: 'ADGUARD',
            ports: 'DNS',
            action: 'allow',
            log: false,
            purpose: x.policy.dns,
            moduleId: 'firewall',
          });
        }
        if (hasMedia) {
          policies.push({
            order: ORDER.householdAllow + 2,
            from: house,
            to: 'MEDIA-SERVER',
            ports: 'MEDIA-STREAM',
            action: 'allow',
            log: false,
            purpose: x.policy.mediaStream,
            moduleId: 'firewall',
          });
        }
        if (enabled.has('nextcloud')) {
          policies.push({
            order: ORDER.householdAllow + 3,
            from: house,
            to: 'NEXTCLOUD',
            ports: 'WEB-HTTPS',
            action: 'allow',
            log: false,
            purpose: x.policy.nextcloud,
            moduleId: 'firewall',
          });
        }
        if (enabled.has('home-assistant')) {
          policies.push({
            order: ORDER.householdAllow + 4,
            from: house,
            to: 'HOMEASSISTANT',
            ports: 'HOMEASSISTANT',
            action: 'allow',
            log: false,
            purpose: x.policy.homeAssistant,
            moduleId: 'firewall',
          });
        }
        if (hasPrinter) {
          policies.push({
            order: ORDER.printerAllow,
            from: house,
            to: 'SHARED-PRINTER',
            ports: 'PRINTER-TCP',
            action: 'allow',
            log: false,
            purpose: x.policy.printing,
            moduleId: 'shared-printer',
          });
        }

        // IoT: resolver and clock only, plus whatever automation needs.
        const iot = per('IOT', h.slug);
        if (enabled.has('adguard')) {
          policies.push({
            order: ORDER.iotAllow,
            from: iot,
            to: 'ADGUARD',
            ports: 'DNS',
            action: 'allow',
            log: false,
            purpose: x.policy.dns,
            moduleId: 'firewall',
          });
        }
        policies.push({
          order: ORDER.iotAllow + 1,
          from: iot,
          to: 'EXTERNAL',
          ports: 'NTP',
          action: 'allow',
          log: false,
          purpose: x.policy.ntp,
          moduleId: 'firewall',
        });
        if (enabled.has('home-assistant')) {
          policies.push({
            order: ORDER.iotAllow + 2,
            from: 'HOMEASSISTANT',
            to: iot,
            action: 'allow',
            log: false,
            purpose: x.policy.automationToIot,
            moduleId: 'firewall',
          });
        }
        policies.push({
          order: ORDER.zoneBlock,
          from: iot,
          to: iotBlocked,
          action: 'block',
          log: true,
          purpose: x.policy.iotBlock,
          moduleId: 'firewall',
        });
      }

      // Between floors: shut off entirely, or allowed to talk, depending on
      // the layout. The IoT block stays either way — floors sharing a
      // household is not a reason for one floor's sensors to reach another's.
      for (let i = 0; i < households.length; i++) {
        for (let j = i + 1; j < households.length; j++) {
          const a = households[i]!;
          const b = households[j]!;
          policies.push(
            floorsIsolated
              ? {
                  order: ORDER.crossHouseholdBlock,
                  from: `HOUSE-${a.slug}`,
                  to: `HOUSE-${b.slug}`,
                  action: 'block',
                  log: true,
                  purpose: x.policy.crossHousehold,
                  moduleId: 'firewall',
                }
              : {
                  order: ORDER.householdAllow + 10,
                  from: `HOUSE-${a.slug}`,
                  to: `HOUSE-${b.slug}`,
                  action: 'allow',
                  log: false,
                  purpose: x.policy.crossFloorAllow,
                  moduleId: 'firewall',
                },
          );
          policies.push({
            order: ORDER.crossHouseholdBlock + 1,
            from: `IOT-${a.slug}`,
            to: `IOT-${b.slug}`,
            action: 'block',
            log: true,
            purpose: floorsIsolated ? x.policy.crossIot : x.policy.crossFloorIotBlock,
            moduleId: 'firewall',
          });
        }
      }

      policies.push({
        order: ORDER.guestAllow,
        from: 'GUEST',
        to: 'EXTERNAL',
        action: 'allow',
        log: false,
        purpose: x.policy.guestInternet,
        moduleId: 'firewall',
      });
      policies.push({
        order: ORDER.zoneBlock + 1,
        from: 'GUEST',
        to: x.policy.targetInternalZones,
        action: 'block',
        log: true,
        purpose: x.policy.guestBlock,
        moduleId: 'firewall',
      });

      policies.push({
        order: ORDER.adminAllow,
        from: 'OWNER',
        to: 'PVE-MGMT',
        ports: 'PROXMOX-ADMIN',
        action: 'allow',
        log: false,
        purpose: x.policy.ownerAdmin,
        moduleId: 'firewall',
      });
      policies.push({
        order: ORDER.adminAllow + 1,
        from: 'VPN',
        to: 'PVE-MGMT',
        ports: 'PROXMOX-ADMIN',
        action: 'allow',
        log: false,
        purpose: x.policy.vpnAdmin,
        moduleId: 'firewall',
      });

      if (hasMedia) {
        policies.push({
          order: ORDER.zoneBlock + 2,
          from: 'MEDIA',
          to: mediaBlocked,
          action: 'block',
          log: true,
          purpose: x.policy.mediaBlock,
          moduleId: 'firewall',
        });
      }
      if (hasTest) {
        policies.push({
          order: ORDER.zoneBlock + 3,
          from: 'TEST',
          to: zoneList('PROD', 'MGMT', households.length > 0 && x.policy.targetAllHouseAndIot),
          action: 'block',
          log: true,
          purpose: x.policy.testBlock,
          moduleId: 'firewall',
        });
      }
      if (hasTunnel) {
        policies.push({
          order: ORDER.zoneBlock + 4,
          from: 'DMZ',
          to: x.policy.targetPublishedOrigin,
          action: 'block',
          log: true,
          purpose: x.policy.dmzBlock,
          moduleId: 'cloudflare-tunnel',
        });
      }
      if (hasPrinter) {
        policies.push({
          order: ORDER.zoneBlock + 5,
          from: 'PRINTERS',
          to: x.policy.targetEveryZone,
          action: 'block',
          log: true,
          purpose: x.policy.printerBlock,
          moduleId: 'shared-printer',
        });
      }

      if (hasCameras) {
        // The recorder reaches in; the cameras never reach out. A camera is a
        // Linux box on the outside wall of the house — treat it that way.
        policies.push({
          order: ORDER.adminAllow + 10,
          from: 'NVR',
          to: 'CAMERA',
          ports: 'CAMERA-STREAM',
          action: 'allow',
          log: false,
          purpose: x.policy.nvrToCameras,
          moduleId: 'cameras',
        });
        policies.push({
          order: ORDER.adminAllow + 11,
          from: 'OWNER',
          to: 'NVR',
          ports: 'NVR-ADMIN',
          action: 'allow',
          log: false,
          purpose: x.policy.ownerToNvr,
          moduleId: 'cameras',
        });
        if (ctx.bool('cameraInternet')) {
          policies.push({
            order: ORDER.adminAllow + 12,
            from: 'NVR',
            to: 'EXTERNAL',
            action: 'allow',
            log: false,
            purpose: x.policy.nvrInternet,
            moduleId: 'cameras',
          });
        }
        policies.push({
          order: ORDER.zoneBlock + 6,
          from: 'CAMERA',
          to: x.policy.targetEveryZone,
          action: 'block',
          log: true,
          purpose: x.policy.cameraBlock,
          moduleId: 'cameras',
        });
      }

      policies.push({
        order: ORDER.catchAll,
        from: x.policy.targetEveryZone,
        to: x.policy.targetEveryZone,
        action: 'block',
        log: true,
        purpose: x.policy.catchAll,
        moduleId: 'firewall',
      });
    }

    /* --------------------------------------------------------------- guests */

    const vlanOf: Record<string, number> = {
      vlanRdp,
      vlanProd,
      vlanMedia,
      vlanTest,
      vlanInfra,
      vlanDmz,
    };

    for (const spec of GUESTS) {
      if (!enabled.has(spec.moduleId)) continue;
      const tight = spec.ram48Note ? (x.guest['runOnDemand'] ?? spec.ram48) : spec.ram48;
      guests.push({
        vmid: spec.vmid,
        name: spec.name,
        kind: spec.kind,
        vlan: vlanOf[spec.vlanParam] ?? 0,
        vcpu: spec.vcpu,
        ram: ram48 ? tight : spec.ram64,
        disk: spec.disk,
        os: spec.os,
        purpose: x.guest[spec.moduleId] ?? '',
        moduleId: spec.moduleId,
        ...(spec.ipParam ? { ip: ctx.str(spec.ipParam) } : {}),
      });
    }

    /* -------------------------------------------------------------- storage */

    if (enabled.has('storage')) {
      storage.push({
        name: ctx.str('fastPoolName'),
        kind: 'zfs-mirror',
        devices: ctx.str('fastPoolDevices'),
        purpose: x.storage.fastPool,
        destructive: true,
        moduleId: 'storage',
      });

      const diskCount = ctx.num('mediaDiskCount');
      for (let i = 1; i <= diskCount; i++) {
        storage.push({
          name: `media${i}`,
          kind: 'xfs',
          devices: x.storage.mediaDevice(i),
          purpose: x.storage.mediaDisk,
          destructive: true,
          moduleId: 'storage',
        });
      }
      storage.push({
        name: ctx.str('mediaMount'),
        kind: 'mergerfs',
        devices: Array.from({ length: diskCount }, (_, i) => `media${i + 1}`).join(' + '),
        purpose: x.storage.mediaMount,
        destructive: false,
        moduleId: 'storage',
      });

      if (ctx.bool('scratchDisk')) {
        storage.push({
          name: 'scratch',
          kind: 'directory',
          devices: x.storage.scratchDevice,
          purpose: x.storage.scratch,
          destructive: true,
          moduleId: 'storage',
        });
      }
    }

    /* ------------------------------------------------------------- services */

    const addService = (
      name: string,
      moduleId: string,
      hostParam: string,
      ports: string,
      exposure: PlannedService['exposure'],
    ) => {
      if (!enabled.has(moduleId)) return;
      services.push({
        name,
        host: ctx.str(hostParam),
        ports,
        exposure,
        purpose: x.service[moduleId] ?? '',
        moduleId,
      });
    };

    const s = x.service;
    addService(s['adguardName'] ?? 'AdGuard Home', 'adguard', 'ipAdguard', '53/udp, 3000/tcp', 'internal');
    addService(s['homeAssistantName'] ?? 'Home Assistant', 'home-assistant', 'ipHomeAssistant', '8123/tcp', 'internal');
    addService(s['gitlabName'] ?? 'GitLab', 'gitlab', 'ipGitlab', '80, 443, 22', 'internal');
    addService(s['prodDockerName'] ?? 'Prod Docker', 'prod-docker', 'ipProdDocker', s['perStack'] ?? '', 'internal');
    addService(
      s['mediaName'] ?? 'Media',
      'media-stack',
      'ipMedia',
      `${ctx.num('mediaPublicPort')}/tcp`,
      enabled.has('public-access') ? 'public' : 'internal',
    );
    addService(
      s['nextcloudName'] ?? 'Nextcloud',
      'nextcloud',
      'ipNextcloud',
      '443/tcp',
      enabled.has('public-access') ? 'public' : 'internal',
    );
    addService(s['tunnelName'] ?? 'Tunnel', 'cloudflare-tunnel', 'ipTunnel', s['outbound'] ?? '', 'tunnel');
    addService(s['camerasName'] ?? 'NVR', 'cameras', 'ipNvr', '443/tcp, 554/tcp', 'internal');
    addService(s['windowsName'] ?? 'Windows RDP', 'windows-rdp', 'ipWindows', '3389/tcp', 'vpn');

    return { networks, ssids, zones, addressObjects, portObjects, policies, guests, storage, services };
  };
}

export function createMultiHouseholdPreset(lang: Lang): BlueprintPreset {
  const x = mhText(lang);
  return {
    id: 'multi-household-proxmox-unifi',
    name: x.presetName,
    description: x.presetDescription,
    targets: ['unifi', 'proxmox', 'docker', 'host'],
    modules: buildModules(x),
    params: buildParams(x),
    households: defaultHouseholds(x),
    householdsEditable: true,
    householdVlanBase: { client: 10, iot: 71, guest: 91 },
    build: makeBuild(x),
  };
}
