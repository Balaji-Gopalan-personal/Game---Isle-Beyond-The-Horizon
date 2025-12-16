import charactersCsv from './catan_clone_characters.csv?raw';

export interface AICharacter {
  name: string;          // From "Lead Character(s)" column
  cartoon: string;       // From "Cartoon Title" column
  imageUrl: string;      // Constructed from "1-Word" column
  filename: string;      // From "1-Word" column for easy reference
}

// Parse CSV data
function parseCharactersCSV(): AICharacter[] {
  const lines = charactersCsv.trim().split('\n');
  const characters: AICharacter[] = [];

  // Skip header row
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    // Handle CSV parsing with quoted fields
    const matches = line.match(/(?:^|,)("(?:[^"]|"")*"|[^,]*)/g);
    if (!matches || matches.length < 4) continue;

    const fields = matches.map(field => {
      // Remove leading comma and quotes
      let value = field.replace(/^,?"?|"?$/g, '');
      // Handle escaped quotes
      value = value.replace(/""/g, '"');
      return value.trim();
    });

    // CSV structure: #, Cartoon Title, Lead Character(s), 1-Word
    const cartoonTitle = fields[1];
    const characterName = fields[2];
    const filename = fields[3];

    if (cartoonTitle && characterName && filename) {
      // Convert filename to lowercase to match actual file names
      const lowerFilename = filename.toLowerCase();
      const extension = '.png';

      characters.push({
        name: characterName,
        cartoon: cartoonTitle,
        imageUrl: `/images/characters/${lowerFilename}${extension}`,
        filename: filename
      });
    }
  }

  return characters;
}

export const AI_CHARACTERS: AICharacter[] = parseCharactersCSV();

export const getRandomCharacters = (count: number): AICharacter[] => {
  const shuffled = [...AI_CHARACTERS].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
};
