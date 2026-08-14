import type { Lang } from '@/i18n';
import { RECOMMENDATIONS_EN, RISKS_EN } from './advice.en';
import type { Recommendation, Risk } from './model';

export function demoRisks(lang: Lang): Risk[] {
  return lang === 'en' ? RISKS_EN : RISKS;
}

export function demoRecommendations(lang: Lang): Recommendation[] {
  return lang === 'en' ? RECOMMENDATIONS_EN : RECOMMENDATIONS;
}

export const RISKS: Risk[] = [
  {
    severity: 'bad',
    title: 'GitLab kötetekhez nincs mentési bizonyíték',
    where: 'Servers · VM 202',
    text: 'A vzdump csak a VM lemezt menti, a kötet-szintű visszaállítás nem tesztelt.',
  },
  {
    severity: 'bad',
    title: 'AP – Garázs 2 napja offline',
    where: 'Mgmt · 10.0.1.23',
    text: 'A PoE port állapota távolról nem ellenőrizhető, helyszíni vizsgálat kell.',
  },
  {
    severity: 'warn',
    title: 'ZFS tank 87%-on',
    where: 'Servers · tank',
    text: '90% felett az írási teljesítmény romlik, snapshotok elakadhatnak.',
  },
  {
    severity: 'warn',
    title: 'IoT izoláció nem ellenőrzött',
    where: 'IoT · VLAN 20',
    text: 'A szabály létezik, de az érvényesülése nincs felméréssel igazolva.',
  },
  {
    severity: 'warn',
    title: 'local-lvm 78%-on a pve01-en',
    where: 'Mgmt · pve01',
    text: 'Snapshot előtt kapacitásellenőrzés szükséges.',
  },
  {
    severity: 'info',
    title: 'Proxmox bridge módosítás előkészítés alatt',
    where: 'Mgmt · vmbr0',
    text: 'A változtatáshoz helyi recovery-konzol és visszaállítási terv kell.',
  },
];

export const RECOMMENDATIONS: Recommendation[] = [
  {
    id: 'r1',
    severity: 'bad',
    title: 'GitLab kötet-szintű mentés bevezetése',
    where: 'VM 202 · Docker host',
    impact: 'Adatvesztés kockázatának megszüntetése',
    risk: 'Alacsony',
    duration: '~40 perc',
    why: 'A jelenlegi vzdump a VM lemezképét menti, de a konténerkötetekről nincs ellenőrzött visszaállítás. Egy sérült kötet esetén a 23 projekt nem állítható helyre bizonyíthatóan.',
    steps: [
      { name: 'Felmérés', text: 'A GitLab kötetek és méretük listázása a Docker hoston.', state: 'kész' },
      { name: 'Előellenőrzés', text: 'Szabad kapacitás a tank poolon (min. 120 GB).', state: 'kész' },
      { name: 'Mentés / checkpoint', text: 'VM 202 snapshot a művelet előtt.', state: 'folyamatban' },
      { name: 'Végrehajtás', text: 'Napi gitlab-backup job + kötet-szintű archiválás a tankra.', state: 'vár' },
      { name: 'Ellenőrzés', text: 'Visszaállítási próba izolált konténerbe.', state: 'vár' },
      { name: 'Visszaállítás', text: 'Snapshot visszatöltése, ha a job terhelést okoz.', state: 'vár' },
    ],
  },
  {
    id: 'r2',
    severity: 'warn',
    title: 'IoT izoláció igazolása aktív ellenőrzéssel',
    where: 'VLAN 20 · Gateway',
    impact: 'A szegmentáció bizonyított állapotba kerül',
    risk: 'Alacsony',
    duration: '~15 perc',
    why: 'A tűzfalszabály létezik a konfigurációban, de a felmérés nem tudja igazolni, hogy a forgalom ténylegesen elakad. A Home Assistant a Trusted zónából is válaszol.',
    steps: [
      { name: 'Felmérés', text: 'IoT zóna aktuális szabálysorrendjének kiolvasása.', state: 'kész' },
      { name: 'Előellenőrzés', text: 'Érintett eszközök és szolgáltatások listája (24 eszköz).', state: 'kész' },
      { name: 'Mentés / checkpoint', text: 'Site backup letöltése helyi gépre.', state: 'vár' },
      { name: 'Végrehajtás', text: 'Ellenőrző kliens ideiglenes elhelyezése a VLAN 20-ban.', state: 'vár' },
      { name: 'Ellenőrzés', text: 'Elérési teszt a Trusted zóna felé, naplóval.', state: 'vár' },
      { name: 'Visszaállítás', text: 'Ideiglenes kliens és szabály eltávolítása.', state: 'vár' },
    ],
  },
  {
    id: 'r3',
    severity: 'warn',
    title: 'ZFS kapacitás felszabadítása 80% alá',
    where: 'tank · RAIDZ1',
    impact: 'Stabil írási teljesítmény, működő snapshotok',
    risk: 'Közepes',
    duration: '~30 perc',
    why: '6,9 TB használt a 8 TB-ból. A régi snapshotok 640 GB-ot foglalnak, a megőrzési szabály nincs beállítva.',
    steps: [
      { name: 'Felmérés', text: 'Snapshot lista és foglalt méret pooltípusonként.', state: 'kész' },
      { name: 'Előellenőrzés', text: 'Replikációtól függő snapshotok kizárása.', state: 'folyamatban' },
      { name: 'Mentés / checkpoint', text: 'Offsite replikáció sikeres lefutása a törlés előtt.', state: 'vár' },
      { name: 'Végrehajtás', text: '30 napnál régebbi, nem hivatkozott snapshotok törlése.', state: 'vár' },
      { name: 'Ellenőrzés', text: 'Pool állapot és szabad kapacitás újramérése.', state: 'vár' },
      { name: 'Visszaállítás', text: 'Nem szükséges: a törlés csak igazolt snapshotokra vonatkozik.', state: 'vár' },
    ],
  },
  {
    id: 'r4',
    severity: 'warn',
    title: 'AP – Emelet fix csatorna beállítása',
    where: '10.0.1.22 · U6 Lite',
    impact: 'Alacsonyabb újraküldés, stabilabb Wi-Fi',
    risk: 'Alacsony',
    duration: '~10 perc',
    why: '68%-os csatorna-kihasználtság és 11,4% újraküldési arány. A szomszédos hálózatok a 149-es csatornát használják.',
    steps: [
      { name: 'Felmérés', text: 'Csatornafoglaltság mérése 24 órán át.', state: 'folyamatban' },
      { name: 'Előellenőrzés', text: 'Érintett kliensek (9) és roaming beállítás.', state: 'vár' },
      { name: 'Mentés / checkpoint', text: 'Site backup.', state: 'vár' },
      { name: 'Végrehajtás', text: 'Fix csatorna: 44, teljesítmény közepes.', state: 'vár' },
      { name: 'Ellenőrzés', text: 'Újraküldési arány 24 óra után.', state: 'vár' },
      { name: 'Visszaállítás', text: 'Automatikus csatornaválasztás visszakapcsolása.', state: 'vár' },
    ],
  },
  {
    id: 'r5',
    severity: 'info',
    title: 'Proxmox bridge átalakítás VLAN-tudatosra',
    where: 'pve01 · vmbr0',
    impact: 'VM-enkénti VLAN tagelés a hoston',
    risk: 'Magas',
    duration: 'Ablak: 45 perc',
    why: 'A bridge jelenleg nem VLAN-tudatos, a tagelés a switch oldalán történik. Az átalakítás megszakítja a host hálózatát, ezért helyi konzol kötelező.',
    steps: [
      { name: 'Felmérés', text: 'Aktuális /etc/network/interfaces mentése.', state: 'kész' },
      { name: 'Előellenőrzés', text: 'Helyi konzol vagy IPMI elérés igazolása.', state: 'vár' },
      { name: 'Mentés / checkpoint', text: 'Konfigurációs mentés + VM leállítási sorrend.', state: 'vár' },
      { name: 'Végrehajtás', text: 'vmbr0 VLAN-aware kapcsoló, egy lépésben.', state: 'vár' },
      { name: 'Ellenőrzés', text: 'Host és VM elérés minden VLAN-ban.', state: 'vár' },
      { name: 'Visszaállítás', text: 'Az eredeti interfaces fájl visszamásolása konzolról.', state: 'vár' },
    ],
  },
];
