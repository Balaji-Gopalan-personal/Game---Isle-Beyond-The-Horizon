import { Assets } from './assetRegistry';

export type LoadedAssets = {
  resources: Record<string, HTMLImageElement>;
  board: Record<string, HTMLImageElement>;
  developmentCards: Record<string, HTMLImageElement>;
  characters: Record<string, HTMLImageElement>;
};

export async function preloadAssets(): Promise<LoadedAssets> {
  const loadedAssets: LoadedAssets = {
    resources: {},
    board: {},
    developmentCards: {},
    characters: {},
  };

  const loadImage = (src: string): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
      img.src = src;
    });
  };

  const loadCategory = async <T extends keyof typeof Assets>(
    category: T,
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

  const [resources, board, developmentCards, characters] = await Promise.all([
    loadCategory('resources', Assets.resources),
    loadCategory('board', Assets.board),
    loadCategory('developmentCards', Assets.developmentCards),
    loadCategory('characters', Assets.characters),
  ]);

  loadedAssets.resources = resources;
  loadedAssets.board = board;
  loadedAssets.developmentCards = developmentCards;
  loadedAssets.characters = characters;

  return loadedAssets;
}
