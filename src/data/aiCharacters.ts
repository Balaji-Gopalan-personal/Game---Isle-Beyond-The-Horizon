// AI Characters from popular 1980s cartoons
export interface AICharacter {
  name: string;
  cartoon: string;
  imageUrl: string;
  description: string;
}

export const AI_CHARACTERS: AICharacter[] = [
  {
    name: "He-Man",
    cartoon: "He-Man and the Masters of the Universe",
    imageUrl: "https://images.pexels.com/photos/6045242/pexels-photo-6045242.jpeg?auto=compress&cs=tinysrgb&w=150&h=150&fit=crop",
    description: "The most powerful man in the universe"
  },
  {
    name: "Lion-O",
    cartoon: "ThunderCats",
    imageUrl: "https://images.pexels.com/photos/5699456/pexels-photo-5699456.jpeg?auto=compress&cs=tinysrgb&w=150&h=150&fit=crop",
    description: "Lord of the ThunderCats"
  },
  {
    name: "Optimus Prime",
    cartoon: "Transformers",
    imageUrl: "https://images.pexels.com/photos/8728380/pexels-photo-8728380.jpeg?auto=compress&cs=tinysrgb&w=150&h=150&fit=crop",
    description: "Leader of the Autobots"
  },
  {
    name: "Inspector Gadget",
    cartoon: "Inspector Gadget",
    imageUrl: "https://images.pexels.com/photos/7319070/pexels-photo-7319070.jpeg?auto=compress&cs=tinysrgb&w=150&h=150&fit=crop",
    description: "Go-go-gadget detective"
  },
  {
    name: "Scrooge McDuck",
    cartoon: "DuckTales",
    imageUrl: "https://images.pexels.com/photos/6045268/pexels-photo-6045268.jpeg?auto=compress&cs=tinysrgb&w=150&h=150&fit=crop",
    description: "The richest duck in the world"
  },
  {
    name: "Garfield",
    cartoon: "Garfield and Friends",
    imageUrl: "https://images.pexels.com/photos/6853522/pexels-photo-6853522.jpeg?auto=compress&cs=tinysrgb&w=150&h=150&fit=crop",
    description: "Lasagna-loving cat"
  }
];

export const getRandomCharacters = (count: number): AICharacter[] => {
  const shuffled = [...AI_CHARACTERS].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
};