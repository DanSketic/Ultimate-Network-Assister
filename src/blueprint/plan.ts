import type { Dict } from '@/i18n';
import { capabilityFor } from './automation';
import type {
  AutomationLevel,
  Plan,
  PlanAction,
  PlanModule,
  PlanStep,
  ResolvedBlueprint,
  RiskLevel,
} from './model';

/**
 * Turns a target state into ordered, executable steps.
 *
 * Modules that produce concrete state (networks, zones, pools, guests) get
 * steps derived from that state, so they change when a parameter changes. The
 * narrative modules — scope, hardware inventory, troubleshooting — get a single
 * review step, because there is nothing to apply.
 */

interface DraftStep {
  id: string;
  title: string;
  detail: string;
  risk?: RiskLevel;
  minutes?: number;
  requested?: AutomationLevel;
  requiresBackup?: boolean;
  requiresLocalConsole?: boolean;
  prechecks?: string[];
  actions?: PlanAction[];
  verification?: string[];
}

/** Plan prose comes from the dictionary; shell commands do not — see planText. */
type PlanText = Dict['planText'];

type StepBuilder = (r: ResolvedBlueprint, p: PlanText) => DraftStep[];

const ui = (label: string, body: string): PlanAction => ({
  kind: 'ui',
  label,
  body,
  target: 'unifi',
  destructive: false,
});

const api = (label: string, body: string, target: PlanAction['target']): PlanAction => ({
  kind: 'api',
  label,
  body,
  target,
  destructive: false,
});

const cmd = (
  label: string,
  body: string,
  target: PlanAction['target'] = 'proxmox',
  destructive = false,
): PlanAction => ({ kind: 'command', label, body, target, destructive });

/* ------------------------------------------------------------ step builders */

const BUILDERS: Record<string, StepBuilder> = {
  'vlan-wifi': (r, p) => {
    const steps: DraftStep[] = [
      {
        id: 'networks',
        title: p.networksTitle(r.networks.length),
        detail: p.networksDetail,
        requested: 'auto',
        minutes: 30,
        risk: 'medium',
        actions: r.networks.map((n) =>
          api(
            `${n.name} (VLAN ${n.vlan})`,
            p.networkBody(n.name, n.vlan, n.cidr, n.gateway),
            'unifi',
          ),
        ),
        verification: p.networksVerify,
      },
    ];

    for (const ssid of r.ssids) {
      steps.push({
        id: `ssid-${ssid.name}`,
        title: p.ssidTitle(ssid.name, ssid.ppsk.length),
        detail: p.ssidDetail(ssid.purpose),
        requested: 'assisted',
        minutes: 10,
        risk: 'medium',
        actions: [
          ui(
            p.ssidActionLabel,
            [
              p.ssidLine(ssid.name, ssid.security, ssid.band),
              ...ssid.ppsk.map(
                (k) => `  ${k.label} → VLAN ${k.vlan}${k.note ? ` (${k.note})` : ''}`,
              ),
            ].join('\n'),
          ),
        ],
        verification: p.ssidVerify,
      });
    }

    if (r.portProfiles.length > 0) {
      steps.push({
        id: 'port-profiles',
        title: p.portProfilesTitle(r.portProfiles.length),
        detail: p.portProfilesDetail,
        requested: 'auto',
        minutes: 15,
        risk: 'medium',
        actions: r.portProfiles.map((profile) =>
          api(
            profile.name,
            p.portProfileBody(
              profile.name,
              profile.nativeVlan || '—',
              profile.taggedVlans.length > 0 ? profile.taggedVlans.join(', ') : '—',
            ),
            'unifi',
          ),
        ),
        verification: p.portProfilesVerify,
      });
    }

    if (r.ports.length > 0) {
      // Assigning a profile to a physical port is deliberately not automated:
      // on the wrong port it severs the controller's own uplink, and nothing
      // inside the application could undo that.
      steps.push({
        id: 'port-assignment',
        title: p.portAssignTitle(r.ports.length),
        detail: p.portAssignDetail,
        requested: 'assisted',
        minutes: 20,
        risk: 'high',
        prechecks: p.portAssignPrechecks,
        actions: [...new Set(r.ports.map((port) => port.device))].map((device) =>
          ui(
            device,
            r.ports
              .filter((port) => port.device === device)
              .sort((a, b) => a.idx - b.idx)
              .map((port) =>
                p.portAssignLine(port.idx, port.label || '—', port.profile, port.poe),
              )
              .join('\n'),
          ),
        ),
        verification: p.portAssignVerify,
      });
    }

    return steps;
  },

  firewall: (r, p) => {
    const steps: DraftStep[] = [];

    if (r.zones.length > 0) {
      steps.push({
        id: 'zones',
        title: p.zonesTitle(r.zones.length),
        detail: p.zonesDetail,
        requested: 'auto',
        minutes: 15,
        risk: 'medium',
        actions: r.zones.map((z) =>
          api(
            z.name,
            p.zoneBody(z.name, z.vlans.length > 0 ? z.vlans.join(', ') : '—', z.purpose),
            'unifi',
          ),
        ),
        verification: p.zonesVerify,
      });
    }

    if (r.addressObjects.length + r.portObjects.length > 0) {
      steps.push({
        id: 'objects',
        title: p.objectsTitle(r.addressObjects.length, r.portObjects.length),
        detail: p.objectsDetail,
        requested: 'auto',
        minutes: 15,
        risk: 'low',
        actions: [
          ...r.addressObjects.map((a) =>
            api(a.name, p.addressBody(a.name, a.address, a.purpose), 'unifi'),
          ),
          ...r.portObjects.map((o) =>
            api(o.name, p.portBody(o.name, o.protocol.toUpperCase(), o.ports, o.purpose), 'unifi'),
          ),
        ],
        verification: p.objectsVerify,
      });
    }

    const allows = r.policies.filter((p) => p.action === 'allow');
    const blocks = r.policies.filter((p) => p.action !== 'allow');

    if (allows.length > 0) {
      steps.push({
        id: 'allows',
        title: p.allowsTitle(allows.length),
        detail: p.allowsDetail,
        requested: 'auto',
        minutes: 20,
        risk: 'high',
        requiresBackup: true,
        prechecks: p.allowsPrecheck,
        actions: allows
          .slice()
          .sort((a, b) => a.order - b.order)
          .map((rule) =>
            api(
              `${rule.from} → ${rule.to}`,
              p.allowBody(rule.from, rule.to, rule.ports ?? '', rule.order, rule.purpose),
              'unifi',
            ),
          ),
        verification: p.allowsVerify,
      });
    }

    if (blocks.length > 0) {
      steps.push({
        id: 'blocks',
        title: p.blocksTitle(blocks.length),
        detail: p.blocksDetail,
        requested: 'auto',
        minutes: 15,
        risk: 'high',
        requiresBackup: true,
        actions: blocks
          .slice()
          .sort((a, b) => a.order - b.order)
          .map((rule) =>
            api(
              `${rule.from} → ${rule.to}`,
              p.blockBody(rule.from, rule.to, rule.ports ?? '', rule.log, rule.order),
              'unifi',
            ),
          ),
        verification: p.blocksVerify,
      });
    }

    return steps;
  },

  'pve-bridges': (r, p) => {
    const trunk = String(r.blueprint.params['trunkBridge'] ?? 'vmbr1');
    const separate = r.blueprint.params['mgmtSeparateNic'] !== false;
    return [
      {
        id: 'interfaces',
        title: p.trunkTitle(trunk),
        detail: separate ? p.trunkDetailSeparate : p.trunkDetailShared,
        requested: 'assisted',
        risk: 'high',
        minutes: 30,
        requiresBackup: true,
        requiresLocalConsole: true,
        prechecks: p.trunkPrechecks,
        actions: [
          cmd(p.trunkActions.discover, 'ip -br link; ls -l /sys/class/net'),
          cmd(p.trunkActions.backup, 'cp /etc/network/interfaces /root/interfaces.bak.$(date +%F)'),
          cmd(
            p.trunkActions.bridge,
            [
              `auto ${trunk}`,
              `iface ${trunk} inet manual`,
              '        bridge-ports <trunk-nic>',
              '        bridge-stp off',
              '        bridge-fd 0',
              '        bridge-vlan-aware yes',
              '        bridge-vids 2-4094',
            ].join('\n'),
          ),
          cmd(p.trunkActions.check, 'ifreload -a -s'),
          cmd(p.trunkActions.restore, 'cp /root/interfaces.bak.* /etc/network/interfaces && ifreload -a'),
        ],
        verification: p.trunkVerify,
      },
    ];
  },

  storage: (r, p) => {
    const steps: DraftStep[] = [
      {
        id: 'identify',
        title: p.identifyTitle,
        detail: p.identifyDetail,
        requested: 'assisted',
        risk: 'medium',
        minutes: 15,
        actions: [
          cmd(p.identifyActions.inventory, 'lsblk -o NAME,SIZE,MODEL,SERIAL,MOUNTPOINT'),
          cmd(p.identifyActions.stablePaths, 'ls -l /dev/disk/by-id/'),
          cmd(p.identifyActions.smart, 'for d in /dev/sd?; do smartctl -H "$d"; done'),
        ],
        verification: p.identifyVerify,
      },
    ];

    for (const s of r.storage) {
      const destructive = s.destructive;
      steps.push({
        id: `storage-${s.name}`,
        title: p.storageTitle(s.name, s.kind),
        detail: `${s.purpose}${destructive ? p.storageDestructiveNote : ''}`,
        requested: destructive ? 'manual' : 'assisted',
        risk: destructive ? 'high' : 'medium',
        minutes: 15,
        requiresBackup: destructive,
        prechecks: destructive ? p.storagePrechecks : [],
        actions: storageActions(s.kind, s.name, s.devices, r, p),
        verification: s.kind === 'zfs-mirror' ? p.storageVerifyZfs : p.storageVerifyFs,
      });
    }

    return steps;
  },

  resources: (r, p) => [
    {
      id: 'resource-plan',
      title: p.resourcesTitle(r.guests.length),
      detail: p.resourcesDetail,
      requested: 'manual',
      risk: 'low',
      minutes: 20,
      verification: p.resourcesVerify,
    },
  ],

  'shared-printer': (r, p) => {
    const printer = r.addressObjects.find((a) => a.name === 'SHARED-PRINTER');
    return [
      {
        id: 'printer',
        title: p.printerTitle,
        detail: p.printerDetail,
        requested: 'auto',
        risk: 'medium',
        minutes: 25,
        actions: [
          api(p.printerSwitchport, p.printerSwitchportBody(printer?.address ?? '—'), 'unifi'),
          ui(p.printerSide, p.printerSideBody),
        ],
        verification: p.printerVerify,
      },
    ];
  },

  'gateway-hardening': (r, p) => {
    const mode = String(r.blueprint.params['idsMode'] ?? 'ips');
    return [
      {
        id: 'ips',
        title: p.idsTitle(mode.toUpperCase()),
        detail: mode === 'off' ? p.idsDetailOff : p.idsDetailOn,
        requested: 'auto',
        risk: 'medium',
        minutes: 20,
        actions: [api('IDS/IPS', p.idsBody(mode), 'unifi')],
        verification: p.idsVerify,
      },
      {
        id: 'upnp',
        title: p.upnpTitle,
        detail: p.upnpDetail,
        requested: 'auto',
        risk: 'low',
        minutes: 5,
        actions: [api('UPnP', p.upnpBody, 'unifi')],
        verification: p.upnpVerify,
      },
    ];
  },

  'public-access': (r, p) => {
    const domain = String(r.blueprint.params['publicDomain'] ?? '');
    const published = r.services.filter((s) => s.exposure === 'public');
    return [
      {
        id: 'publish',
        title: p.publishTitle(published.length),
        detail: p.publishDetail,
        requested: 'assisted',
        risk: 'high',
        minutes: 30,
        requiresBackup: true,
        prechecks: p.publishPrechecks,
        actions: published.map((s) =>
          api(s.name, p.publishBody(s.ports, s.host, `${s.name.toLowerCase()}.${domain}`), 'unifi'),
        ),
        verification: p.publishVerify,
      },
    ];
  },

  /*
   * The backup job.
   *
   * Written as commands rather than as prose because this is one of the few
   * places where the application can do the work: `pvesh` creates the job over
   * an SSH session, which is a change the policy allows once the operator has
   * approved that exact command. Reading the current jobs comes first, so the
   * plan never proposes a second one next to an existing job nobody saw.
   */
  backups: (r, p) => {
    const store = String(r.blueprint.params['backupStorage'] ?? 'local');
    const schedule = String(r.blueprint.params['backupSchedule'] ?? '02:30');
    const mode = String(r.blueprint.params['backupMode'] ?? 'snapshot');
    const daily = Number(r.blueprint.params['backupKeepDaily'] ?? 7);
    const weekly = Number(r.blueprint.params['backupKeepWeekly'] ?? 4);
    const keep = [
      daily > 0 ? `keep-daily=${daily}` : '',
      weekly > 0 ? `keep-weekly=${weekly}` : '',
    ]
      .filter(Boolean)
      .join(',');

    return [
      {
        id: 'existing',
        title: p.backupExistingTitle,
        detail: p.backupExistingDetail,
        requested: 'assisted',
        risk: 'low',
        minutes: 5,
        actions: [
          cmd(p.backupActions.list, 'pvesh get /cluster/backup --output-format json'),
          cmd(p.backupActions.stores, 'pvesm status --content backup'),
        ],
        verification: p.backupExistingVerify,
      },
      {
        id: 'create',
        title: p.backupCreateTitle(store, schedule),
        detail: p.backupCreateDetail,
        requested: 'assisted',
        risk: 'medium',
        minutes: 15,
        prechecks: p.backupCreatePrechecks(store),
        actions: [
          cmd(
            p.backupActions.create,
            `pvesh create /cluster/backup --schedule "${schedule}" --storage ${store} ` +
              `--all 1 --mode ${mode}` +
              (keep ? ` --prune-backups ${keep}` : '') +
              ` --comment "${p.backupComment}"`,
          ),
        ],
        verification: p.backupCreateVerify,
      },
      {
        id: 'prove',
        title: p.backupProveTitle,
        detail: p.backupProveDetail,
        requested: 'assisted',
        risk: 'low',
        minutes: 10,
        actions: [cmd(p.backupActions.files, `pvesm list ${store} --content backup`)],
        verification: p.backupProveVerify,
      },
    ];
  },

  'boot-order': (r, p) => [
    {
      id: 'boot',
      title: p.bootTitle,
      detail: p.bootDetail,
      requested: 'auto',
      risk: 'low',
      minutes: 20,
      actions: bootOrder(r).map(({ guest, order, delay }) =>
        api(guest.name, p.bootBody(guest.kind.toUpperCase(), guest.vmid, order, delay), 'proxmox'),
      ),
      verification: p.bootVerify,
    },
  ],

  'k8s-network': (r, p) => [
    {
      id: 'cluster-vlan',
      title: p.k8sNetTitle,
      detail: p.k8sNetDetail,
      requested: 'auto',
      risk: 'medium',
      minutes: 25,
      actions: r.networks.map((n) =>
        api(`${n.name} (VLAN ${n.vlan})`, p.k8sNetBody(n.name, n.vlan, n.cidr, n.gateway), 'unifi'),
      ),
      verification: p.k8sNetVerify,
    },
  ],

  'k8s-nodes': (r, p) => [
    {
      id: 'create-nodes',
      title: p.k8sNodesTitle(r.guests.length),
      detail: p.k8sNodesDetail,
      requested: 'assisted',
      risk: 'medium',
      minutes: 45,
      actions: r.guests.map((g) =>
        cmd(
          `${g.name} (${g.vmid})`,
          `qm clone <template> ${g.vmid} --name ${g.name} --full 1\n` +
            `qm set ${g.vmid} --cores ${g.vcpu} --memory ${parseInt(g.ram, 10) * 1024} --net0 virtio,bridge=vmbr1,tag=${g.vlan}\n` +
            p.k8sNodeComment(g.ip ?? '—'),
        ),
      ),
      verification: p.k8sNodesVerify,
    },
  ],

  'k8s-install': (r, p) => {
    const distro = String(r.blueprint.params['distro'] ?? 'k3s');
    const first = r.guests[0];
    const rest = r.guests.slice(1);
    return [
      {
        id: 'control-plane',
        title: p.k8sControlTitle,
        detail: p.k8sControlDetail(distro),
        requested: 'assisted',
        risk: 'high',
        minutes: 30,
        prechecks: p.k8sControlPrecheck,
        actions: [
          cmd(
            p.k8sInstallLabel,
            distro === 'k3s'
              ? `curl -sfL https://get.k3s.io | INSTALL_K3S_EXEC="--cluster-cidr=${r.blueprint.params['podCidr']} --service-cidr=${r.blueprint.params['serviceCidr']}" sh -`
              : p.k8sInstallOther(distro),
            'kubernetes',
          ),
          cmd(p.k8sTokenLabel, 'cat /var/lib/rancher/k3s/server/node-token', 'kubernetes'),
        ],
        verification: [p.k8sControlVerify(first?.name ?? p.k8sControlFallback)],
      },
      {
        id: 'join',
        title: p.k8sJoinTitle(rest.length),
        detail: p.k8sJoinDetail,
        requested: 'assisted',
        risk: 'medium',
        minutes: 30,
        actions: rest.map((g) =>
          cmd(
            g.name,
            `curl -sfL https://get.k3s.io | K3S_URL=https://${first?.ip ?? '<control-plane>'}:6443 K3S_TOKEN=<token> sh -`,
            'kubernetes',
          ),
        ),
        verification: p.k8sJoinVerify,
      },
    ];
  },

  handover: (r, p) => {
    // Cross-household checks only mean something where the households are
    // meant to be shut off from each other. Under the other layouts they would
    // be a checklist item that is supposed to fail.
    const isolated = String(r.blueprint.params['layout'] ?? 'floorsIsolated') === 'floorsIsolated';
    return [
      {
        id: 'handover',
        title: p.handoverTitle,
        detail: p.handoverDetail,
        requested: 'manual',
        risk: 'low',
        minutes: 45,
        verification: [
          ...(isolated
            ? r.blueprint.households.flatMap((h) =>
                r.blueprint.households
                  .filter((o) => o.id !== h.id)
                  .map((o) => p.handoverCross(h.name, o.name)),
              )
            : []),
          ...p.handoverVerify,
        ],
      },
    ];
  },
};

function storageActions(
  kind: string,
  name: string,
  devices: string,
  r: ResolvedBlueprint,
  p: PlanText,
): PlanAction[] {
  const mount = String(r.blueprint.params['mediaMount'] ?? '/srv/media');
  const a = p.storageActions;
  switch (kind) {
    case 'zfs-mirror':
      return [
        cmd(a.poolCreate, `zpool create -o ashift=12 ${name} mirror ${devices}`, 'proxmox', true),
        cmd(a.poolStatus, `zpool status ${name}`),
      ];
    case 'xfs':
      return [
        cmd(a.wipeTable, `sgdisk --zap-all /dev/disk/by-id/…`, 'proxmox', true),
        cmd(a.mkfs, `mkfs.xfs -L ${name} /dev/disk/by-id/…`, 'proxmox', true),
      ];
    case 'mergerfs':
      return [
        cmd(
          a.mergeMount,
          `mergerfs -o defaults,allow_other,use_ino,category.create=mfs /mnt/media* ${mount}`,
        ),
        cmd(a.hardlink, `touch ${mount}/.t && ln ${mount}/.t ${mount}/.t2 && rm ${mount}/.t*`),
      ];
    default:
      return [cmd(a.prepare, `# ${name}: ${devices}`)];
  }
}

/** DNS and storage first, then what depends on them. */
function bootOrder(r: ResolvedBlueprint) {
  const priority: Record<string, number> = {
    adguard: 1,
    'home-assistant': 2,
    'prod-docker': 3,
    gitlab: 4,
    nextcloud: 5,
    'media-docker': 6,
    'cloudflare-tunnel': 7,
    'windows-rdp': 8,
    'gitlab-runner': 9,
  };
  return r.guests
    .slice()
    .sort((a, b) => (priority[a.moduleId] ?? 50) - (priority[b.moduleId] ?? 50))
    .map((guest, i) => ({ guest, order: i + 1, delay: i === 0 ? 0 : 30 }));
}

/* -------------------------------------------------------------- assembly */

export function buildPlan(resolved: ResolvedBlueprint, t: Dict): Plan {
  const p = t.planText;
  const modules: PlanModule[] = [];
  const all: PlanStep[] = [];

  for (const module of resolved.modules) {
    const builder = BUILDERS[module.id];
    const drafts: DraftStep[] = builder
      ? builder(resolved, p)
      : [
          {
            id: 'review',
            title: module.title,
            detail: module.summary,
            requested: 'manual',
            risk: module.risk,
            minutes: module.minutes,
            verification: p.reviewVerify,
          },
        ];

    const steps = drafts.map((d) => {
      const actions = d.actions ?? [];
      const capability = capabilityFor(d.requested ?? 'manual', actions, t.blueprint.capability);
      const step: PlanStep = {
        id: `${module.id}.${d.id}`,
        moduleId: module.id,
        title: d.title,
        detail: d.detail,
        risk: d.risk ?? module.risk,
        minutes: d.minutes ?? 0,
        capability: capability.level,
        requiresBackup: d.requiresBackup ?? false,
        requiresLocalConsole: d.requiresLocalConsole ?? false,
        prechecks: d.prechecks ?? [],
        actions,
        verification: d.verification ?? [],
        ...(capability.reason ? { capabilityReason: capability.reason } : {}),
      };
      return step;
    });

    all.push(...steps);
    modules.push({
      module,
      steps,
      minutes: steps.reduce((sum, s) => sum + s.minutes, 0),
    });
  }

  const counts: Record<AutomationLevel, number> = { auto: 0, assisted: 0, manual: 0 };
  for (const s of all) counts[s.capability] += 1;

  return {
    modules,
    steps: all,
    totalMinutes: all.reduce((sum, s) => sum + s.minutes, 0),
    counts,
    destructiveCount: all.filter((s) => s.actions.some((a) => a.destructive)).length,
  };
}
