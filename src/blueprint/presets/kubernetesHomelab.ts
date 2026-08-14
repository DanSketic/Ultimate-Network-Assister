import type { Lang } from '@/i18n';
import type {
  BlueprintModule,
  BlueprintPreset,
  BuildContext,
  BuildResult,
  ParamDef,
  PlannedGuest,
  PlannedNetwork,
  PlannedService,
  PlannedStorage,
} from '../model';

/*
 * Kubernetes homelab on Proxmox.
 *
 * Deliberately a different shape from the multi-household preset: no
 * households, no Wi-Fi, one flat cluster VLAN and a node count that drives the
 * guest list. It exists to keep the blueprint model honest — anything the
 * model can only express for the first preset is a modelling mistake.
 *
 * Small enough that its text bundle lives here rather than in a sibling file.
 */

interface K8sText {
  name: string;
  description: string;
  modules: Record<string, { title: string; summary: string }>;
  params: Record<string, { label: string; options?: Record<string, string> }>;
  groups: { cluster: string; addressing: string; storage: string; publishing: string };
  netPurpose: string;
  controlPlane: string;
  worker: string;
  storageNfsDevices: string;
  storagePerNodeDevices: string;
  storageNoReplication: string;
  storageReplicated: string;
  ingressName: string;
  ingressPurpose: string;
  monitoringName: string;
  monitoringPurpose: string;
  portApi: string;
  portIngress: string;
}

const HU: K8sText = {
  name: 'Kubernetes homelab',
  description:
    'Fürt saját VLAN-ban, a csomópontszám paraméterből következik. Nincs háztartás és nincs Wi-Fi — a modell ugyanaz, csak más alakú célállapotot ír le.',
  modules: {
    'k8s-plan': {
      title: 'Fürtterv és döntések',
      summary: 'Disztribúció, csomópontszám, hálózati tartományok rögzítése.',
    },
    'k8s-network': {
      title: 'Fürthálózat',
      summary: 'Külön VLAN a csomópontoknak, elkülönítve a háztartási hálózatoktól.',
    },
    'k8s-nodes': {
      title: 'Csomópont-VM-ek',
      summary: 'Vezérlő és futtató csomópontok létrehozása a hypervisoron.',
    },
    'k8s-install': {
      title: 'Fürt telepítése',
      summary: 'Vezérlősík indítása, csomópontok csatlakoztatása.',
    },
    'k8s-storage': {
      title: 'Tárhelyosztály',
      summary: 'Perzisztens kötetek háttértára a fürt számára.',
    },
    'k8s-ingress': {
      title: 'Ingress és tanúsítványok',
      summary: 'Bejövő forgalom kezelése és automatikus tanúsítványkiadás.',
    },
    'k8s-monitoring': { title: 'Monitoring', summary: 'Metrikagyűjtés és riasztás a fürtben.' },
    'k8s-backup': {
      title: 'Mentés és visszaállítási próba',
      summary: 'Fürtállapot és kötetek mentése, igazolt visszatöltéssel.',
    },
  },
  params: {
    distro: {
      label: 'Disztribúció',
      options: {
        k3s: 'k3s – könnyű, egybineáris',
        kubeadm: 'kubeadm – upstream',
        talos: 'Talos – változtathatatlan OS',
      },
    },
    controlPlanes: { label: 'Vezérlő csomópontok' },
    workers: { label: 'Futtató csomópontok' },
    nodeVcpu: { label: 'vCPU csomópontonként' },
    nodeRamGb: { label: 'RAM csomópontonként' },
    nodeDiskGb: { label: 'Lemez csomópontonként' },
    ipPrefix: { label: 'IP-előtag' },
    gatewayHostByte: { label: 'Átjáró utolsó oktettje' },
    clusterVlan: { label: 'Fürt VLAN' },
    nodeStartHost: { label: 'Első csomópont utolsó oktettje' },
    podCidr: { label: 'Pod tartomány' },
    serviceCidr: { label: 'Service tartomány' },
    storageBackend: {
      label: 'Tárhely háttér',
      options: {
        longhorn: 'Longhorn – replikált blokktár',
        nfs: 'NFS – meglévő tárolóról',
        'local-path': 'Local path – nincs replikáció',
      },
    },
    ingressDomain: { label: 'Ingress domain' },
  },
  groups: { cluster: 'Fürt', addressing: 'Címzés', storage: 'Tárhely', publishing: 'Publikálás' },
  netPurpose: 'Fürt csomópontjai; a pod- és service-tartomány a fürtön belül marad',
  controlPlane: 'Vezérlősík',
  worker: 'Munkaterhelés',
  storageNfsDevices: 'meglévő NFS export',
  storagePerNodeDevices: 'csomópontonkénti lemez',
  storageNoReplication:
    'Perzisztens kötetek replikáció nélkül; csomópontkieséskor az adat nem érhető el',
  storageReplicated: 'Perzisztens kötetek a fürt számára',
  ingressName: 'Ingress',
  ingressPurpose: 'Bejövő forgalom elosztása a fürtön belül',
  monitoringName: 'Monitoring',
  monitoringPurpose: 'Metrikák és riasztások',
  portApi: 'Fürt API',
  portIngress: 'Bejövő forgalom',
};

const EN: K8sText = {
  name: 'Kubernetes homelab',
  description:
    'A cluster in its own VLAN, with the node count following from a parameter. No households and no Wi-Fi — the same model, describing a differently shaped target state.',
  modules: {
    'k8s-plan': {
      title: 'Cluster plan and decisions',
      summary: 'Settling the distribution, the node count and the network ranges.',
    },
    'k8s-network': {
      title: 'Cluster network',
      summary: 'A separate VLAN for the nodes, kept apart from the household networks.',
    },
    'k8s-nodes': {
      title: 'Node VMs',
      summary: 'Creating the control-plane and worker nodes on the hypervisor.',
    },
    'k8s-install': {
      title: 'Cluster install',
      summary: 'Bringing up the control plane and joining the nodes.',
    },
    'k8s-storage': {
      title: 'Storage class',
      summary: 'The backing store for the cluster’s persistent volumes.',
    },
    'k8s-ingress': {
      title: 'Ingress and certificates',
      summary: 'Handling inbound traffic and issuing certificates automatically.',
    },
    'k8s-monitoring': { title: 'Monitoring', summary: 'Metrics collection and alerting in the cluster.' },
    'k8s-backup': {
      title: 'Backup and restore test',
      summary: 'Backing up cluster state and volumes, with a proven restore.',
    },
  },
  params: {
    distro: {
      label: 'Distribution',
      options: {
        k3s: 'k3s – lightweight, single binary',
        kubeadm: 'kubeadm – upstream',
        talos: 'Talos – immutable OS',
      },
    },
    controlPlanes: { label: 'Control-plane nodes' },
    workers: { label: 'Worker nodes' },
    nodeVcpu: { label: 'vCPU per node' },
    nodeRamGb: { label: 'RAM per node' },
    nodeDiskGb: { label: 'Disk per node' },
    ipPrefix: { label: 'IP prefix' },
    gatewayHostByte: { label: 'Gateway host octet' },
    clusterVlan: { label: 'Cluster VLAN' },
    nodeStartHost: { label: 'First node host octet' },
    podCidr: { label: 'Pod range' },
    serviceCidr: { label: 'Service range' },
    storageBackend: {
      label: 'Storage backend',
      options: {
        longhorn: 'Longhorn – replicated block storage',
        nfs: 'NFS – from existing storage',
        'local-path': 'Local path – no replication',
      },
    },
    ingressDomain: { label: 'Ingress domain' },
  },
  groups: { cluster: 'Cluster', addressing: 'Addressing', storage: 'Storage', publishing: 'Publishing' },
  netPurpose: 'The cluster nodes; the pod and service ranges stay inside the cluster',
  controlPlane: 'Control plane',
  worker: 'Workloads',
  storageNfsDevices: 'existing NFS export',
  storagePerNodeDevices: 'one disk per node',
  storageNoReplication:
    'Persistent volumes without replication; if a node drops out its data is unreachable',
  storageReplicated: 'Persistent volumes for the cluster',
  ingressName: 'Ingress',
  ingressPurpose: 'Distributing inbound traffic inside the cluster',
  monitoringName: 'Monitoring',
  monitoringPurpose: 'Metrics and alerts',
  portApi: 'Cluster API',
  portIngress: 'Inbound traffic',
};

type ModuleShape = Omit<BlueprintModule, 'title' | 'summary'>;

const MODULE_SHAPES: ModuleShape[] = [
  { id: 'k8s-plan', code: '1', group: 'overview', targets: ['kubernetes'], risk: 'low', minutes: 15, optional: false },
  { id: 'k8s-network', code: '2', group: 'network', targets: ['unifi'], risk: 'medium', minutes: 25, optional: false },
  { id: 'k8s-nodes', code: '3', group: 'server', targets: ['proxmox'], risk: 'medium', minutes: 45, optional: false },
  { id: 'k8s-install', code: '4', group: 'server', targets: ['kubernetes'], risk: 'high', minutes: 60, optional: false, requires: ['k8s-nodes'] },
  { id: 'k8s-storage', code: '5', group: 'server', targets: ['kubernetes'], risk: 'medium', minutes: 40, optional: true, requires: ['k8s-install'] },
  { id: 'k8s-ingress', code: '6', group: 'services', targets: ['kubernetes'], risk: 'medium', minutes: 35, optional: true, requires: ['k8s-install'] },
  { id: 'k8s-monitoring', code: '7', group: 'ops', targets: ['kubernetes'], risk: 'low', minutes: 40, optional: true, requires: ['k8s-install'] },
  { id: 'k8s-backup', code: '8', group: 'ops', targets: ['kubernetes'], risk: 'medium', minutes: 45, optional: false, requires: ['k8s-install'] },
];

type ParamShape = Omit<ParamDef, 'label' | 'group' | 'options'> & {
  group: keyof K8sText['groups'];
  optionValues?: string[];
};

const PARAM_SHAPES: ParamShape[] = [
  { id: 'distro', type: 'enum', default: 'k3s', optionValues: ['k3s', 'kubeadm', 'talos'], group: 'cluster' },
  { id: 'controlPlanes', type: 'number', default: 1, min: 1, max: 5, group: 'cluster' },
  { id: 'workers', type: 'number', default: 2, min: 0, max: 10, group: 'cluster' },
  { id: 'nodeVcpu', type: 'number', default: 4, min: 1, max: 32, group: 'cluster' },
  { id: 'nodeRamGb', type: 'number', default: 8, min: 2, max: 128, unit: 'GB', group: 'cluster' },
  { id: 'nodeDiskGb', type: 'number', default: 60, min: 20, max: 2000, unit: 'GB', group: 'cluster' },

  { id: 'ipPrefix', type: 'text', default: '192.168', group: 'addressing' },
  { id: 'gatewayHostByte', type: 'number', default: 1, min: 1, max: 254, group: 'addressing' },
  { id: 'clusterVlan', type: 'vlan', default: 120, min: 1, max: 254, group: 'addressing' },
  { id: 'nodeStartHost', type: 'number', default: 10, min: 2, max: 250, group: 'addressing' },
  { id: 'podCidr', type: 'cidr', default: '10.42.0.0/16', group: 'addressing' },
  { id: 'serviceCidr', type: 'cidr', default: '10.43.0.0/16', group: 'addressing' },

  {
    id: 'storageBackend',
    type: 'enum',
    default: 'longhorn',
    optionValues: ['longhorn', 'nfs', 'local-path'],
    group: 'storage',
    moduleId: 'k8s-storage',
  },
  { id: 'ingressDomain', type: 'text', default: 'k8s.home', group: 'publishing', moduleId: 'k8s-ingress' },
];

function makeBuild(x: K8sText) {
  return function build(ctx: BuildContext): BuildResult {
    const prefix = ctx.str('ipPrefix');
    const vlan = ctx.num('clusterVlan');
    const gw = ctx.num('gatewayHostByte');
    const startHost = ctx.num('nodeStartHost');
    const distro = ctx.str('distro');

    const networks: PlannedNetwork[] = [
      {
        vlan,
        name: 'K8S-NODES',
        cidr: `${prefix}.${vlan}.0/24`,
        gateway: `${prefix}.${vlan}.${gw}`,
        role: 'server-prod',
        purpose: x.netPurpose,
        moduleId: 'k8s-network',
      },
    ];

    const guests: PlannedGuest[] = [];
    const controlPlanes = ctx.num('controlPlanes');
    const workers = ctx.num('workers');
    const vcpu = String(ctx.num('nodeVcpu'));
    const ram = `${ctx.num('nodeRamGb')} GB`;
    const disk = `${ctx.num('nodeDiskGb')} GB`;
    const os = distro === 'talos' ? 'Talos Linux' : 'Debian';

    let host = startHost;
    let vmid = 300;
    for (let i = 1; i <= controlPlanes; i++) {
      guests.push({
        vmid: vmid++,
        name: `cp-${i}`,
        kind: 'vm',
        vlan,
        vcpu,
        ram,
        disk,
        ip: `${prefix}.${vlan}.${host++}`,
        os,
        purpose: x.controlPlane,
        moduleId: 'k8s-nodes',
      });
    }
    for (let i = 1; i <= workers; i++) {
      guests.push({
        vmid: vmid++,
        name: `worker-${i}`,
        kind: 'vm',
        vlan,
        vcpu,
        ram,
        disk,
        ip: `${prefix}.${vlan}.${host++}`,
        os,
        purpose: x.worker,
        moduleId: 'k8s-nodes',
      });
    }

    const storage: PlannedStorage[] = [];
    if (ctx.enabled.has('k8s-storage')) {
      const backend = ctx.str('storageBackend');
      storage.push({
        name: backend,
        kind: backend === 'nfs' ? 'directory' : 'lvm-thin',
        devices: backend === 'nfs' ? x.storageNfsDevices : x.storagePerNodeDevices,
        purpose: backend === 'local-path' ? x.storageNoReplication : x.storageReplicated,
        destructive: false,
        moduleId: 'k8s-storage',
      });
    }

    const services: PlannedService[] = [];
    if (ctx.enabled.has('k8s-ingress')) {
      services.push({
        name: x.ingressName,
        host: `*.${ctx.str('ingressDomain')}`,
        ports: '80, 443',
        exposure: 'internal',
        purpose: x.ingressPurpose,
        moduleId: 'k8s-ingress',
      });
    }
    if (ctx.enabled.has('k8s-monitoring')) {
      services.push({
        name: x.monitoringName,
        host: `monitoring.${ctx.str('ingressDomain')}`,
        ports: '443',
        exposure: 'internal',
        purpose: x.monitoringPurpose,
        moduleId: 'k8s-monitoring',
      });
    }

    return {
      networks,
      ssids: [],
      zones: [],
      addressObjects: guests.map((g) => ({
        name: g.name.toUpperCase(),
        address: g.ip ?? '',
        purpose: g.purpose,
      })),
      portObjects: [
        { name: 'K8S-API', protocol: 'tcp', ports: '6443', purpose: x.portApi },
        { name: 'K8S-INGRESS', protocol: 'tcp', ports: '80, 443', purpose: x.portIngress },
      ],
      policies: [],
      guests,
      storage,
      services,
    };
  };
}

export function createKubernetesHomelabPreset(lang: Lang): BlueprintPreset {
  const x = lang === 'en' ? EN : HU;
  return {
    id: 'kubernetes-homelab',
    name: x.name,
    description: x.description,
    targets: ['kubernetes', 'proxmox', 'unifi'],
    modules: MODULE_SHAPES.map<BlueprintModule>((shape) => ({
      ...shape,
      title: x.modules[shape.id]?.title ?? shape.id,
      summary: x.modules[shape.id]?.summary ?? '',
    })),
    params: PARAM_SHAPES.map<ParamDef>((shape) => {
      const { optionValues, group, ...rest } = shape;
      const text = x.params[shape.id];
      return {
        ...rest,
        label: text?.label ?? shape.id,
        group: x.groups[group],
        ...(optionValues
          ? { options: optionValues.map((value) => ({ value, label: text?.options?.[value] ?? value })) }
          : {}),
      };
    }),
    households: [],
    householdsEditable: false,
    build: makeBuild(x),
  };
}
