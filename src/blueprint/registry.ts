import type { Dict, Lang } from '@/i18n';
import type { Blueprint, BlueprintPreset } from './model';
import { createKubernetesHomelabPreset } from './presets/kubernetesHomelab';
import { createMultiHouseholdPreset } from './presets/multiHousehold';
import { createBlueprint } from './resolve';

/**
 * Presets are built per language rather than translated after the fact: their
 * prose comes out of `build()` already composed with household names and VLAN
 * ids, so there is nothing left to translate once it has run.
 */
export function presets(lang: Lang): BlueprintPreset[] {
  return [createMultiHouseholdPreset(lang), createKubernetesHomelabPreset(lang)];
}

export function findPreset(id: string, lang: Lang): BlueprintPreset | undefined {
  return presets(lang).find((p) => p.id === id);
}

/**
 * The blueprint the application opens with.
 *
 * The multi-household preset's defaults are the estate from the source
 * handbook, so this is that plan, editable: change a parameter or switch a
 * module off and the target state, the plan and the exported guide follow.
 */
export function starterBlueprints(lang: Lang, t: Dict): Blueprint[] {
  const home = createBlueprint(createMultiHouseholdPreset(lang), t.blueprint.starterName);
  home.description = t.blueprint.starterDescription;
  // Marks it as the app's document rather than the user's: until they edit it,
  // its names follow the interface language.
  home.source = 'preset';
  return [home];
}
