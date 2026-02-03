import { Assets } from './assetRegistry';

const loadImage = (src: string): Promise<HTMLImageElement | null> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => {
      console.warn(`Failed to load image: ${src}`);
      resolve(null);
    };
    img.src = src;
  });
};

const loadCategory = async (
  assets: Record<string, string>,
  categoryName: string
): Promise<Record<string, string>> => {
  const entries = Object.entries(assets);
  const promises = entries.map(([key, path]) =>
    loadImage(path).then(img => ({ key, img, path }))
  );

  const results = await Promise.all(promises);
  const loadedCategory: Record<string, string> = {};
  let failedCount = 0;

  results.forEach(({ key, img, path }) => {
    if (img) {
      loadedCategory[key] = path;
    } else {
      failedCount++;
      console.error(`Failed to load ${categoryName} asset: ${key} (${path})`);
    }
  });

  if (failedCount > 0) {
    console.warn(`${failedCount} ${categoryName} asset(s) failed to load`);
  }

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
