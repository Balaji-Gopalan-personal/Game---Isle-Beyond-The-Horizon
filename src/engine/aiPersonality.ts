export type StrategicDynamic = 'village_rusher' | 'estate_climber' | 'dev_card_gambler';

export function getStrategicDynamicForCharacter(characterName?: string): StrategicDynamic {
  if (!characterName) return 'village_rusher';

  const villageRusherNames = ['Astro Boy', 'GI Joe', 'Rainbow Brite', 'Voltron', 'Speed Racer', 'Jetson', 'Batman', 'Superman'];
  const estateClimberNames = ['Scrooge McDuck', 'He-Man', 'Lion-O', 'Optimus Prime', 'Bravestarr', 'Garfield', 'Yogi Bear'];
  const devCardGamblerNames = ['Brainy Smurf', 'Zummi Gummi', 'Chip', 'Dale', 'Donatello', 'Jem', 'Josie', 'Gadget'];

  if (villageRusherNames.some(n => characterName.includes(n))) return 'village_rusher';
  if (estateClimberNames.some(n => characterName.includes(n))) return 'estate_climber';
  if (devCardGamblerNames.some(n => characterName.includes(n))) return 'dev_card_gambler';

  return 'village_rusher';
}
