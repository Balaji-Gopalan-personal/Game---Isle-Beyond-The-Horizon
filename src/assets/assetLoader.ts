import { Assets } from './assetRegistry';

const loadImage = (src: string): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
    img.src = src;
  });
};

const loadCategory = async (
  assets: Record<string, string>
): Promise<Record<string, HTMLImageElement>> => {
  const entries = Object.entries(assets);
  const promises = entries.map(([key, path]) =>
    loadImage(path).then(img => ({ key, img }))
  );

  const results = await Promise.all(promises);
  const loadedCategory: Record<string, HTMLImageElement> = {};

  results.forEach(({ key, img }) => {
    loadedCategory[key] = img;
  });

  return loadedCategory;
};

export async function preloadCharacterAssets(): Promise<Record<string, HTMLImageElement>> {
  console.log('Preloading character assets...');
  const characters = await loadCategory(Assets.characters);
  console.log(`Loaded ${Object.keys(characters).length} character assets`);
  return characters;
}

export async function preloadGameAssets(deckType: 'standard' | 'expanded'): Promise<{
  resources: Record<string, HTMLImageElement>;
  board: Record<string, HTMLImageElement>;
  developmentCards: Record<string, HTMLImageElement>;
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
    loadCategory(Assets.resources),
    loadCategory(Assets.board),
    loadCategory(devCardAssets),
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
