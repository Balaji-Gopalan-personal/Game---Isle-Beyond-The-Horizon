import { Assets } from './assetRegistry';
import { convertImageToDataUri } from '../utils/imageConverter';

const loadCategory = async (
  assets: Record<string, string>,
  categoryName: string
): Promise<Record<string, string>> => {
  const entries = Object.entries(assets);
  const results = await Promise.allSettled(
    entries.map(async ([key, path]) => {
      const extension = path.split('.').pop()?.toLowerCase();
      if (extension === 'gif') {
        return { key, dataUri: path };
      }
      const dataUri = await convertImageToDataUri(path);
      return { key, dataUri };
    })
  );

  const loadedCategory: Record<string, string> = {};
  let failedCount = 0;

  results.forEach((result, index) => {
    const [key, path] = entries[index];
    if (result.status === 'fulfilled') {
      loadedCategory[key] = result.value.dataUri;
    } else {
      failedCount++;
      console.error(`Failed to load ${categoryName} asset: ${key} (${path})`, result.reason);
    }
  });

  if (failedCount > 0) {
    console.warn(`${failedCount} ${categoryName} asset(s) failed to load`);
  }

  console.log(`Converted ${Object.keys(loadedCategory).length} ${categoryName} assets to data URIs`);
  return loadedCategory;
};

export async function preloadCharacterAssets(): Promise<Record<string, string>> {
  console.log('Preloading character assets...');
  const characters = await loadCategory(Assets.characters, 'character');
  console.log(`Loaded ${Object.keys(characters).length} character assets`);
  return characters;
}

export async function preloadGameAssets(deckType: 'standard' | 'expanded'): Promise<{
  resources: Record<string, string>;
  board: Record<string, string>;
  developmentCards: Record<string, string>;
}> {
  console.log('Preloading game assets...');

  const devCardAssets = deckType === 'standard'
    ? {
        boomingEconomy: Assets.developmentCards.boomingEconomy,
        expertNegotiator: Assets.developmentCards.expertNegotiator,
        extraPoint: Assets.developmentCards.extraPoint,
        guard: Assets.developmentCards.guard,
        roadConstruction: Assets.developmentCards.roadConstruction,
      }
    : Assets.developmentCards;

  const [resources, board, developmentCards] = await Promise.all([
    loadCategory(Assets.resources, 'resource'),
    loadCategory(Assets.board, 'board'),
    loadCategory(devCardAssets, 'development card'),
  ]);

  console.log(`Loaded ${Object.keys(resources).length} resource assets`);
  console.log(`Loaded ${Object.keys(board).length} board assets`);
  console.log(`Loaded ${Object.keys(developmentCards).length} development card assets`);

  return {
    resources,
    board,
    developmentCards,
  };
}
