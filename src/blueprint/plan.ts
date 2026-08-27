import type { Dict } from '@/i18n';
import { capabilityFor } from './automation';
import type {
  AutomationLevel,
  Plan,
  PlanAction,
  PlanModule,
  PlanStep,
  PlannedGuest,
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
  /** Step ids — within this module, or `module.step` for another module's. */
  requires?: string[];
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

/**
 * An API call the plan describes.
 *
 * `writable` says whether this application is the one that can make it. Only
 * the two object kinds the applier writes — UniFi networks and port profiles —
 * pass it; everything else is an exact description of a call for a person to
 * make in the controller, and the step is counted accordingly.
 */
const api = (
  label: string,
  body: string,
  target: PlanAction['target'],
  writable = false,
): PlanAction => ({
  kind: 'api',
  label,
  body,
  target,
  destructive: false,
  ...(writable ? { writable: true } : {}),
});

const cmd = (
  label: string,
  body: string,
  target: PlanAction['target'] = 'proxmox',
  destructive = false,
): PlanAction => ({ kind: 'command', label, body, target, destructive });

/* ------------------------------------------------------------ step builders */

const BUILDERS: Record<string, StepBuilder> = {
  /*
   * The host itself, before anything runs on it.
   *
   * Every command here is one this application can send and a person would
   * otherwise type: the repository a subscription-less host needs, the upgrade
   * that follows it, and the handful of packages the rest of the plan assumes
   * are there — `lldpd` so the estate can see what is plugged into what,
   * `smartmontools` so the disks are watched, `mergerfs` so the media pool can
   * be assembled. The upgrade is marked as the interruption it is.
   */
  'pve-base': (_r, p) => [
    {
      id: 'repos',
      title: p.baseReposTitle,
      detail: p.baseReposDetail,
      requested: 'assisted',
      risk: 'low',
      minutes: 10,
      actions: [
        cmd(p.baseActions.check, 'pveversion -v | head -3; cat /etc/apt/sources.list.d/*.list'),
        cmd(
          p.baseActions.noSubscription,
          [
            'test -f /etc/apt/sources.list.d/pve-enterprise.list &&',
            '  sed -i "s/^deb/# deb/" /etc/apt/sources.list.d/pve-enterprise.list',
            'echo "deb http://download.proxmox.com/debian/pve $(. /etc/os-release && echo $VERSION_CODENAME) pve-no-subscription"' +
              ' > /etc/apt/sources.list.d/pve-no-subscription.list',
          ].join('\n'),
        ),
        cmd(p.baseActions.update, 'apt-get update'),
      ],
      verification: p.baseReposVerify,
    },
    {
      id: 'packages',
      requires: ['repos'],
      title: p.basePackagesTitle,
      detail: p.basePackagesDetail,
      requested: 'assisted',
      risk: 'medium',
      minutes: 20,
      actions: [
        cmd(p.baseActions.upgrade, 'DEBIAN_FRONTEND=noninteractive apt-get -y full-upgrade'),
        cmd(
          p.baseActions.packages,
          'DEBIAN_FRONTEND=noninteractive apt-get -y install lldpd smartmontools mergerfs zfsutils-linux ethtool',
        ),
        cmd(p.baseActions.services, 'systemctl enable --now lldpd smartd zfs-zed; systemctl is-active lldpd smartd'),
      ],
      verification: p.basePackagesVerify,
    },
  ],

  /*
   * The container template every LXC in the plan is built from.
   *
   * Downloaded rather than named: which build is current changes month to
   * month, so the command asks the mirror what it has and takes the newest
   * Debian standard image, which is then what the guest steps create from.
   */
  'vm-template': (_r, p) => [
    {
      id: 'template',
      requires: ['pve-base.packages'],
      title: p.templateTitle,
      detail: p.templateDetail,
      requested: 'assisted',
      risk: 'low',
      minutes: 10,
      actions: [
        cmd(p.templateActions.refresh, 'pveam update'),
        cmd(
          p.templateActions.download,
          [
            'TPL=$(pveam available --section system | awk \'/debian-1[0-9]-standard/ {print $2}\' | tail -1)',
            'test -n "$TPL" || { echo "no debian template offered"; exit 1; }',
            'pveam download local "$TPL"',
            'pveam list local',
          ].join('\n'),
        ),
      ],
      verification: p.templateVerify,
    },
    {
      id: 'snippets',
      requires: ['template'],
      title: p.snippetsTitle,
      detail: p.snippetsDetail,
      requested: 'assisted',
      risk: 'low',
      minutes: 5,
      actions: [
        cmd(
          p.snippetsAction,
          [
            "CUR=$(awk '/^dir: local$/{f=1} f&&/content/{print $2; exit}' /etc/pve/storage.cfg)",
            'test -n "$CUR" || { echo "no dir storage called local"; exit 1; }',
            'echo "$CUR" | grep -q snippets && { echo "already there: $CUR"; exit 0; }',
            'pvesm set local --content "$CUR,snippets"',
            'install -d /var/lib/vz/snippets && pvesm status',
          ].join('\n'),
        ),
      ],
      verification: p.snippetsVerify,
    },
    {
      id: 'cloud-image',
      requires: ['snippets'],
      title: p.imageTitle,
      detail: p.imageDetail,
      requested: 'assisted',
      risk: 'low',
      minutes: 10,
      actions: [
        cmd(
          p.imageAction,
          [
            `cd ${IMAGE_DIR}`,
            `test -f ${DEBIAN_IMAGE} && { echo "already downloaded"; exit 0; }`,
            `curl -fsSLO ${DEBIAN_BASE}/${DEBIAN_IMAGE}`,
            `curl -fsSLO ${DEBIAN_BASE}/SHA512SUMS`,
            // Verified against the list the mirror publishes beside it, not
            // taken on trust because the download succeeded.
            `grep ${DEBIAN_IMAGE} SHA512SUMS | sha512sum -c -`,
          ].join('\n'),
        ),
      ],
      verification: p.imageVerify,
    },
  ],

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
            true,
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
            true,
          ),
        ),
        verification: p.portProfilesVerify,
      });
    }

    // A port with nothing on it is in the layout so that the estate is
    // described completely, not so that someone is sent to configure it.
    const assigned = r.ports.filter((port) => port.role !== 'unused');

    if (assigned.length > 0) {
      // Assigning a profile to a physical port is deliberately not automated:
      // on the wrong port it severs the controller's own uplink, and nothing
      // inside the application could undo that.
      steps.push({
        id: 'port-assignment',
        title: p.portAssignTitle(assigned.length),
        detail: p.portAssignDetail,
        requested: 'assisted',
        minutes: 20,
        risk: 'high',
        prechecks: p.portAssignPrechecks,
        actions: [...new Set(assigned.map((port) => port.device))].map((device) =>
          ui(
            device,
            assigned
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

  /*
   * Start-up order, as commands rather than as a table to copy by hand.
   *
   * It read as an API action and asked to be automated, which was a promise
   * nothing could keep: the applier writes UniFi objects and has never written
   * anything to Proxmox. The values were the same either way, so the difference
   * was entirely in whether the plan overstated what would happen. As `qm set`
   * and `pct set` they are commands the application can actually run, one
   * approval at a time, and the ones it cannot are still exactly what to type.
   */
  'boot-order': (r, p) => [
    {
      id: 'boot',
      title: p.bootTitle,
      detail: p.bootDetail,
      requested: 'assisted',
      risk: 'low',
      minutes: 20,
      actions: bootOrder(r).map(({ guest, order, delay }) =>
        cmd(
          `${guest.name} (${guest.vmid})`,
          `${guest.kind === 'lxc' ? 'pct' : 'qm'} set ${guest.vmid} --startup order=${order}` +
            (delay > 0 ? `,up=${delay}` : ''),
          'proxmox',
        ),
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
        api(`${n.name} (VLAN ${n.vlan})`, p.k8sNetBody(n.name, n.vlan, n.cidr, n.gateway), 'unifi', true),
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


/* ---------------------------------------------------------- host and guests */

/**
 * The cloud image a Linux guest is installed from.
 *
 * A cloud image is a disk with the operating system already on it and nothing
 * decided yet: no hostname, no user, no address. Proxmox hands it those on
 * first boot through cloud-init, which is what turns "install an operating
 * system" from a console session with a mouse into a command that finishes on
 * its own. Debian publishes one per release with a checksum list beside it.
 */
const IMAGE_DIR = '/var/lib/vz/template/iso';
const DEBIAN_BASE = 'https://cloud.debian.org/images/cloud/bookworm/latest';
const DEBIAN_IMAGE = 'debian-12-genericcloud-amd64.qcow2';

/*
 * Building the machines, rather than describing them.
 *
 * The guest list has always been exact — id, network, cores, memory, disk —
 * and the plan still asked a person to type it into the Proxmox interface
 * twice: once for the shell of the machine and once for its network. Every
 * value in a `pct create` line is one the target state already decided, so the
 * line can be written here and, with an approval, run.
 *
 * Two things it deliberately does not do. It does not install an operating
 * system: an ISO is a choice, an unattended install is a project, and pretending
 * otherwise would produce a command that stops halfway with a prompt nobody can
 * see. And it does not touch a machine that already exists — every creation is
 * guarded by its own status check, so running the step twice is not a way to
 * lose the first one.
 */

/** The first number in a spec like "4–6" or "512 MB–1 GB". */
function firstNumber(text: string): number {
  const match = text.match(/\d+/);
  return match ? Number(match[0]) : 0;
}

/** Memory in MiB, from "8 GB", "512 MB–1 GB" or "3 GB". */
function memoryMiB(text: string): number {
  const value = firstNumber(text);
  if (value === 0) return 512;
  // The unit that belongs to the first number, not to the range's other end.
  const upTo = text.slice(0, text.indexOf(String(value)) + String(value).length + 4).toUpperCase();
  return upTo.includes('MB') ? value : value * 1024;
}

/** Disk size in whole GB, from "220–300 GB" or "60 GB + data disk". */
function diskGiB(text: string): number {
  return firstNumber(text) || 16;
}

/** How many bits the planned network's range uses, e.g. 24. */
function prefixOf(cidr: string): number {
  const bits = Number(cidr.split('/')[1]);
  return Number.isInteger(bits) && bits > 0 && bits <= 32 ? bits : 24;
}

/** The storage a guest's disk goes on: the pool the plan built for them. */
function guestStore(r: ResolvedBlueprint): string {
  const pool = r.storage.find((x) => x.kind === 'zfs-mirror' || x.kind === 'lvm-thin');
  return pool?.name ?? 'local-lvm';
}

function trunkBridge(r: ResolvedBlueprint): string {
  return String(r.blueprint.params['trunkBridge'] ?? 'vmbr1');
}

/**
 * The steps that build one guest.
 *
 * Written per module rather than as one long list, so a guest belongs to the
 * module that introduced it and disappears with it.
 */
function guestSteps(moduleId: string): StepBuilder {
  return (r, p) => {
    const guests = r.guests.filter((g) => g.moduleId === moduleId);
    const store = guestStore(r);
    const bridge = trunkBridge(r);

    /*
     * What has to exist before a machine can be built on it.
     *
     * The pool the disk goes on, the bridge the network card plugs into, and —
     * for a container — the template it is created from. Named as steps rather
     * than checked at runtime: the point is that someone reading the plan, or
     * running it, is told the order rather than discovering it from a failure.
     */
    const pool = r.storage.find((x) => x.kind === 'zfs-mirror' || x.kind === 'lvm-thin');
    const needs = [
      'pve-base.packages',
      'pve-bridges.interfaces',
      ...(pool ? [`storage.storage-${pool.name}`] : []),
    ];

    const machines: DraftStep[] = guests.map((g) => {
      const net = r.networks.find((n) => n.vlan === g.vlan);
      const cores = firstNumber(g.vcpu) || 1;
      const memory = memoryMiB(g.ram);
      const disk = diskGiB(g.disk);
      const address =
        g.ip && net ? `,ip=${g.ip}/${prefixOf(net.cidr)},gw=${net.gateway}` : ',ip=dhcp';
      const windows = /windows/i.test(g.os);
      /*
       * A machine that installs itself.
       *
       * Anything Debian-shaped is built from a cloud image, which means the
       * disk arrives with the system already on it and the machine gets no
       * empty disk here — the operating-system step imports one and sizes it.
       * Everything else keeps the blank disk an installer needs to write to.
       */
      const cloudInit = !windows && /debian|ubuntu/i.test(g.os);

      const actions: PlanAction[] =
        g.kind === 'lxc'
          ? [
              cmd(
                p.guest.createLxc,
                [
                  `pct status ${g.vmid} >/dev/null 2>&1 && echo "${g.vmid} exists" && exit 0`,
                  `TPL=$(pveam list local | awk '/debian-1[0-9]-standard/ {print $1}' | tail -1)`,
                  `test -n "$TPL" || { echo "no debian template on local"; exit 1; }`,
                  `pct create ${g.vmid} "$TPL" \\`,
                  `  --hostname ${slug(g.name)} --cores ${cores} --memory ${memory} --swap 0 \\`,
                  `  --rootfs ${store}:${disk} \\`,
                  `  --net0 name=eth0,bridge=${bridge},tag=${g.vlan}${address} \\`,
                  `  --unprivileged 1 --onboot 1 --features nesting=1`,
                ].join('\n'),
              ),
              cmd(p.guest.start, `pct start ${g.vmid} || true; pct status ${g.vmid}`),
            ]
          : [
              cmd(
                p.guest.createVm,
                [
                  `qm status ${g.vmid} >/dev/null 2>&1 && echo "${g.vmid} exists" && exit 0`,
                  `qm create ${g.vmid} --name ${slug(g.name)} \\`,
                  `  --cores ${cores} --memory ${memory} --ostype ${windows ? 'win11' : 'l26'} \\`,
                  `  --machine q35 --bios ovmf --agent 1 --onboot 1 \\`,
                  `  --scsihw virtio-scsi-single \\`,
                  cloudInit ? '' : `  --scsi0 ${store}:${disk} \\`,
                  `  --efidisk0 ${store}:1,efitype=4m,pre-enrolled-keys=1 \\`,
                  windows ? `  --tpmstate0 ${store}:1,version=v2.0 \\` : '',
                  // A cloud image talks to the serial port, and nothing else,
                  // until cloud-init has finished: without this the console is
                  // blank and the machine looks hung while it is working.
                  cloudInit ? '  --serial0 socket --vga serial0 \\' : '',
                  `  --net0 virtio,bridge=${bridge},tag=${g.vlan} \\`,
                  `  --boot order=scsi0`,
                ]
                  .filter(Boolean)
                  .join('\n'),
              ),
              // Where an operating system still has to be installed by hand —
              // Windows, and only Windows — the plan says so with the shape of
              // the command rather than with a sentence. Anything installed
              // from an image, cloud or appliance, needs none of this: its own
              // step below imports it.
              ...(cloudInit || /home assistant/i.test(g.os)
                ? []
                : [
                    cmd(
                      p.guest.install,
                      `qm set ${g.vmid} --ide2 local:iso/<${g.os}>.iso,media=cdrom --boot order='ide2;scsi0'`,
                    ),
                  ]),
            ];

      return {
        id: `guest-${g.vmid}`,
        title: p.guest.title(g.vmid, g.name),
        detail: p.guest.detail(g.os, g.purpose),
        requested: 'assisted' as const,
        risk: 'medium' as const,
        minutes: g.kind === 'lxc' ? 15 : 30,
        requires: g.kind === 'lxc' ? [...needs, 'vm-template.template'] : needs,
        actions,
        verification: p.guest.verify(g.vmid),
      };
    });

    /*
     * The operating system, installed without anybody watching.
     *
     * This is the step that used to be a sentence saying "install Debian". A
     * cloud image makes it a sequence: import the disk the system is already
     * on, size it to what the plan asked for, and hand cloud-init the few
     * things it needs to decide — who logs in, with which key, on which
     * address. The address comes from the target state, so the machine comes
     * up on the network it was designed for rather than on whatever DHCP
     * offered it.
     *
     * The keys are the host's own. A machine that can already reach the
     * hypervisor as root is the machine that should be able to reach what the
     * hypervisor builds; issuing a new key here would be a secret this
     * application would have to keep, and it keeps none.
     */
    const systems = guests.flatMap((g) => {
      if (g.kind !== 'vm') return [];
      const net = r.networks.find((n) => n.vlan === g.vlan);
      const debian = /debian|ubuntu/i.test(g.os) && !/windows/i.test(g.os);
      const haos = /home assistant/i.test(g.os);

      /*
       * An appliance image, which installs itself and configures nothing.
       *
       * Home Assistant ships its operating system as a disk image, so the
       * install is the same import as a cloud image — and the difference is
       * what comes after: it reads no cloud-init, so its address is set in its
       * own console. The plan says which one it should be rather than
       * pretending to have set it.
       */
      if (haos) {
        return [
          {
            id: `os-${g.vmid}`,
            title: p.system.title(g.vmid, g.name),
            detail: p.system.applianceDetail(g.os),
            requested: 'assisted' as const,
            risk: 'medium' as const,
            minutes: 20,
            requires: [`guest-${g.vmid}`],
            actions: [
              cmd(
                p.system.importAppliance,
                [
                  `qm config ${g.vmid} | grep -q '^scsi0' && { echo "${g.vmid} already has a system disk"; exit 0; }`,
                  `cd ${IMAGE_DIR}`,
                  'VER=$(curl -fsSL https://api.github.com/repos/home-assistant/operating-system/releases/latest' +
                    " | grep -o '\"tag_name\": *\"[^\"]*\"' | head -1 | cut -d'\"' -f4)",
                  'test -n "$VER" || { echo "could not read the latest release"; exit 1; }',
                  'test -f "haos_ova-$VER.qcow2" ||',
                  '  { curl -fsSLO "https://github.com/home-assistant/operating-system/releases/download/$VER/haos_ova-$VER.qcow2.xz"' +
                    ' && unxz -f "haos_ova-$VER.qcow2.xz"; }',
                  `qm set ${g.vmid} --scsi0 ${store}:0,import-from=${IMAGE_DIR}/"haos_ova-$VER.qcow2"`,
                ].join('\n'),
              ),
              cmd(p.system.start, `qm start ${g.vmid}; qm status ${g.vmid}`),
              cmd(
                p.system.applianceAddress,
                `# ${g.name}: <console> → network → static ${g.ip ?? ''}`,
              ),
            ],
            verification: p.system.applianceVerify(g.ip ?? ''),
          },
        ];
      }

      if (!debian) return [];

      const address = g.ip && net ? `ip=${g.ip}/${prefixOf(net.cidr)},gw=${net.gateway}` : 'ip=dhcp';
      /*
       * The resolver the estate is planning to run, where it plans one.
       *
       * A machine handed the gateway as its DNS is a machine that never sees
       * the filtering the plan spent a module setting up. The gateway is the
       * fallback for an estate with no resolver of its own.
       */
      const dns = r.services.find((x) => x.moduleId === 'adguard')?.host ?? net?.gateway ?? '';
      const disk = diskGiB(g.disk);

      return [
        {
          id: `os-${g.vmid}`,
          title: p.system.title(g.vmid, g.name),
          detail: p.system.detail(g.os),
          requested: 'assisted' as const,
          risk: 'medium' as const,
          minutes: 20,
          requires: [`guest-${g.vmid}`, 'vm-template.cloud-image'],
          actions: [
            cmd(
              p.system.importDisk,
              [
                `qm config ${g.vmid} | grep -q '^scsi0' && { echo "${g.vmid} already has a system disk"; exit 0; }`,
                `qm set ${g.vmid} --scsi0 ${store}:0,import-from=${IMAGE_DIR}/${DEBIAN_IMAGE}`,
                `qm disk resize ${g.vmid} scsi0 ${disk}G`,
              ].join('\n'),
            ),
            cmd(
              p.system.firstBoot,
              [
                `cat > /var/lib/vz/snippets/qga-${g.vmid}.yaml <<'YAML'`,
                '#cloud-config',
                'package_update: true',
                'packages:',
                '  - qemu-guest-agent',
                'runcmd:',
                '  - systemctl enable --now qemu-guest-agent',
                'YAML',
                `qm set ${g.vmid} --ide2 ${store}:cloudinit --boot order=scsi0 \\`,
                `  --ciuser root --sshkeys /root/.ssh/authorized_keys \\`,
                `  --ipconfig0 ${address}${dns ? ` --nameserver ${dns}` : ''} \\`,
                `  --cicustom "vendor=local:snippets/qga-${g.vmid}.yaml"`,
              ].join('\n'),
            ),
            cmd(p.system.start, `qm start ${g.vmid}; qm status ${g.vmid}`),
            cmd(
              p.system.waitForAgent,
              [
                `for i in $(seq 1 30); do`,
                `  qm guest exec ${g.vmid} -- true >/dev/null 2>&1 && { echo "${g.vmid}: agent up"; exit 0; }`,
                '  sleep 10',
                'done',
                `echo "${g.vmid}: no answer in five minutes — look at the console"; exit 1`,
              ].join('\n'),
            ),
          ],
          verification: p.system.verify(g.vmid, g.ip ?? ''),
        },
      ];
    });

    /*
     * And what runs inside them.
     *
     * A separate step from building the machine, because it is a separate act
     * with a separate precondition: the box exists is one thing, the box
     * answers is another. Only the guests this application has an honest
     * install for get one — the rest keep the module's own description.
     */
    const installs = guests.flatMap((g) => {
      const actions = installScript(moduleId, g, r, p);
      if (actions.length === 0) return [];
      return [
        {
          id: `install-${g.vmid}`,
          title: p.inGuest.title(g.name),
          detail: p.inGuest.detail(g.os),
          requested: 'assisted' as const,
          risk: 'medium' as const,
          minutes: 25,
          requires: systems.some((x) => x.id === `os-${g.vmid}`)
            ? [`os-${g.vmid}`]
            : [`guest-${g.vmid}`],
          actions: [reachable(g.kind === 'lxc' ? 'lxc' : 'vm', g.vmid, p), ...actions],
          verification: p.inGuest.verify(g.name, service(r, moduleId)),
        },
      ];
    });

    return [...machines, ...systems, ...installs];
  };
}

/** Where the module's service answers, for the verification line. */
function service(r: ResolvedBlueprint, moduleId: string): string {
  const found = r.services.find((s) => s.moduleId === moduleId);
  return found ? `${found.host} · ${found.ports}` : '—';
}

/** A hostname the far side will accept: letters, digits and dashes. */
function slug(name: string): string {
  return (
    name
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'guest'
  );
}

/*
 * The modules whose whole content is "build this machine".
 *
 * Registered from the guest list rather than written out one by one: a module
 * that introduces a guest gets the steps that build it, and a module that
 * introduces none keeps its review step.
 */
for (const moduleId of [
  'adguard',
  'home-assistant',
  'windows-rdp',
  'gitlab',
  'gitlab-runner',
  'prod-docker',
  'media-docker',
  'nextcloud',
  'cloudflare-tunnel',
]) {
  BUILDERS[moduleId] = guestSteps(moduleId);
}


/* ------------------------------------------------------ inside the machines */

/*
 * Installing the software, not only building the box.
 *
 * The host can reach inside a machine it runs, and the two ways are not the
 * same. A container is reachable the moment it starts — `pct exec` runs in it
 * from the host, with no agent and no credentials of its own. A virtual
 * machine is reachable only once an operating system is installed and the
 * QEMU guest agent is answering, which is why every one of these steps starts
 * by asking whether it answers rather than assuming it.
 *
 * What is here is what a package manager can finish. Anything that needs a
 * token, a domain or a decision — registering a runner, connecting a tunnel,
 * the contents of a compose file — is written as a shape with the blank left
 * in it, which keeps it out of anything that runs on its own.
 */

/** Runs a line inside the machine, whichever kind of machine it is. */
function inGuest(kind: 'lxc' | 'vm', vmid: number, script: string): string {
  const oneLine = script.replace(/\n\s*/g, ' ');
  return kind === 'lxc'
    ? `pct exec ${vmid} -- bash -lc ${quote(oneLine)}`
    : // No timeout: an install is minutes, and the default is thirty seconds.
      `qm guest exec ${vmid} --timeout 0 -- bash -lc ${quote(oneLine)}`;
}

/** Single-quoted for a shell, with any quote of its own escaped. */
function quote(text: string): string {
  return `'${text.replace(/'/g, `'\\''`)}'`;
}

/** Whether the machine can be reached at all, asked before anything is done. */
function reachable(kind: 'lxc' | 'vm', vmid: number, p: PlanText): PlanAction {
  return cmd(
    p.inGuest.reachable,
    kind === 'lxc'
      ? `pct status ${vmid} | grep -q running || { echo "${vmid} is not running"; exit 1; }`
      : [
          `qm guest exec ${vmid} -- true >/dev/null 2>&1 ||`,
          `  { echo "${vmid}: no guest agent — install the OS and qemu-guest-agent first"; exit 1; }`,
          `echo "${vmid} answers"`,
        ].join('\n'),
  );
}

/**
 * What to install inside each machine, by the module that introduced it.
 *
 * Distribution packages wherever the software has them, and the vendor's own
 * repository where it does not — never a script piped from the network into a
 * shell, which is the one install method that cannot be read before it runs.
 */
function installScript(moduleId: string, g: PlannedGuest, r: ResolvedBlueprint, p: PlanText): PlanAction[] {
  const kind = g.kind === 'lxc' ? 'lxc' : 'vm';
  const run = (script: string) => inGuest(kind, g.vmid, script);
  const service = r.services.find((s) => s.moduleId === moduleId);

  const base = `apt-get update && DEBIAN_FRONTEND=noninteractive apt-get -y install ca-certificates curl gnupg`;

  switch (moduleId) {
    case 'adguard':
      return [
        cmd(p.inGuest.packages, run(base)),
        cmd(
          p.inGuest.download,
          run(
            `cd /tmp && curl -fsSL -o AdGuardHome.tar.gz https://static.adguard.net/adguardhome/release/AdGuardHome_linux_amd64.tar.gz && sha256sum AdGuardHome.tar.gz`,
          ),
        ),
        cmd(
          p.inGuest.install,
          run(
            `cd /tmp && tar -xzf AdGuardHome.tar.gz && ./AdGuardHome/AdGuardHome -s install && systemctl is-active AdGuardHome`,
          ),
        ),
        cmd(
          p.inGuest.configure,
          `# ${service?.host ?? g.ip ?? ''}:3000 — <admin user>, <password>, upstream DNS`,
        ),
      ];

    case 'cloudflare-tunnel':
      return [
        cmd(p.inGuest.packages, run(base)),
        cmd(
          p.inGuest.repo,
          run(
            `curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg -o /usr/share/keyrings/cloudflare-main.gpg && ` +
              `echo "deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared any main" ` +
              `> /etc/apt/sources.list.d/cloudflared.list`,
          ),
        ),
        cmd(p.inGuest.install, run(`apt-get update && apt-get -y install cloudflared && cloudflared --version`)),
        cmd(p.inGuest.configure, `${inGuest(kind, g.vmid, 'cloudflared service install <tunnel-token>')}`),
      ];

    case 'prod-docker':
    case 'media-docker':
      return [
        cmd(p.inGuest.packages, run(base)),
        cmd(
          p.inGuest.repo,
          run(
            `install -m 0755 -d /etc/apt/keyrings && ` +
              `curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc && ` +
              `chmod a+r /etc/apt/keyrings/docker.asc && ` +
              `echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian $(. /etc/os-release && echo $VERSION_CODENAME) stable" ` +
              `> /etc/apt/sources.list.d/docker.list`,
          ),
        ),
        cmd(
          p.inGuest.install,
          run(
            `apt-get update && DEBIAN_FRONTEND=noninteractive apt-get -y install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin && docker version --format "{{.Server.Version}}"`,
          ),
        ),
        cmd(p.inGuest.configure, `# ${g.name}: docker compose up -d — <compose file>`),
      ];

    case 'gitlab':
      return [
        cmd(p.inGuest.packages, run(`${base} && apt-get -y install perl postfix`)),
        cmd(
          p.inGuest.repo,
          run(
            `curl -fsSL https://packages.gitlab.com/gitlab/gitlab-ce/gpgkey -o /usr/share/keyrings/gitlab.gpg && ` +
              `echo "deb [signed-by=/usr/share/keyrings/gitlab.gpg] https://packages.gitlab.com/gitlab/gitlab-ce/debian/ $(. /etc/os-release && echo $VERSION_CODENAME) main" ` +
              `> /etc/apt/sources.list.d/gitlab-ce.list`,
          ),
        ),
        cmd(
          p.inGuest.install,
          run(
            `apt-get update && EXTERNAL_URL="http://${service?.host ?? g.ip ?? ''}" DEBIAN_FRONTEND=noninteractive apt-get -y install gitlab-ce && gitlab-ctl status`,
          ),
        ),
      ];

    case 'gitlab-runner':
      return [
        cmd(p.inGuest.packages, run(base)),
        cmd(
          p.inGuest.repo,
          run(
            `curl -fsSL https://packages.gitlab.com/runner/gitlab-runner/gpgkey -o /usr/share/keyrings/gitlab-runner.gpg && ` +
              `echo "deb [signed-by=/usr/share/keyrings/gitlab-runner.gpg] https://packages.gitlab.com/runner/gitlab-runner/debian/ $(. /etc/os-release && echo $VERSION_CODENAME) main" ` +
              `> /etc/apt/sources.list.d/gitlab-runner.list`,
          ),
        ),
        cmd(p.inGuest.install, run(`apt-get update && apt-get -y install gitlab-runner && gitlab-runner --version`)),
        cmd(
          p.inGuest.configure,
          inGuest(kind, g.vmid, 'gitlab-runner register --url <gitlab-url> --token <runner-token>'),
        ),
      ];

    case 'nextcloud':
      return [
        cmd(p.inGuest.packages, run(base)),
        cmd(
          p.inGuest.repo,
          run(
            `install -m 0755 -d /etc/apt/keyrings && ` +
              `curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc && ` +
              `echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian $(. /etc/os-release && echo $VERSION_CODENAME) stable" ` +
              `> /etc/apt/sources.list.d/docker.list`,
          ),
        ),
        cmd(
          p.inGuest.install,
          run(
            `apt-get update && DEBIAN_FRONTEND=noninteractive apt-get -y install docker-ce docker-ce-cli containerd.io docker-compose-plugin && ` +
              `docker volume create nextcloud_aio_mastercontainer`,
          ),
        ),
        cmd(
          p.inGuest.configure,
          inGuest(
            kind,
            g.vmid,
            'docker run -d --name nextcloud-aio-mastercontainer --restart always -p 8080:8080 ' +
              '-e APACHE_PORT=11000 -e NEXTCLOUD_DATADIR=<data path> ' +
              '-v nextcloud_aio_mastercontainer:/mnt/docker-aio-config -v /var/run/docker.sock:/var/run/docker.sock:ro ' +
              'nextcloud/all-in-one:latest',
          ),
        ),
      ];

    default:
      return [];
  }
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
        // A bare id is a sibling in the same module; anything with a dot in it
        // names a step somewhere else in the plan.
        requires: (d.requires ?? []).map((id) => (id.includes('.') ? id : `${module.id}.${id}`)),
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
