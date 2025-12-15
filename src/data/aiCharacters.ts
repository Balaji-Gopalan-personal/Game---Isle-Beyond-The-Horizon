export interface AICharacter {
  name: string;
  cartoon: string;
  imageUrl: string;
  description: string;
}

export const AI_CHARACTERS: AICharacter[] = [
  { name: "Astro Boy", cartoon: "Astro Boy", imageUrl: "images/characters/Astro-Boy.png", description: "Robot with a heart of gold" },
  { name: "Barbapapa", cartoon: "Barbapapa", imageUrl: "images/characters/Barbapapa.png", description: "Shape-shifting blob creature" },
  { name: "Batman", cartoon: "Batman: The Animated Series", imageUrl: "images/characters/Batman.png", description: "The Dark Knight" },
  { name: "Bert", cartoon: "Sesame Street", imageUrl: "images/characters/Bert.png", description: "Ernie's best friend" },
  { name: "Bravestarr", cartoon: "BraveStarr", imageUrl: "images/characters/Bravestarr.png", description: "Space marshal" },
  { name: "Buggy", cartoon: "Various", imageUrl: "images/characters/Buggy.png", description: "Classic cartoon character" },
  { name: "Bunny", cartoon: "Various", imageUrl: "images/characters/Bunny.png", description: "Adorable rabbit" },
  { name: "Casper", cartoon: "Casper the Friendly Ghost", imageUrl: "images/characters/Casper.png", description: "The friendly ghost" },
  { name: "Caveman", cartoon: "Captain Caveman", imageUrl: "images/characters/Caveman.png", description: "Prehistoric superhero" },
  { name: "Chip", cartoon: "Chip 'n Dale", imageUrl: "images/characters/Chip.png", description: "Clever chipmunk" },
  { name: "Chipmunk", cartoon: "Alvin and the Chipmunks", imageUrl: "images/characters/Chipmunk.png", description: "Musical chipmunk" },
  { name: "Dynomutt", cartoon: "Dynomutt, Dog Wonder", imageUrl: "images/characters/Dynomutt.png", description: "Bionic dog" },
  { name: "Flintstone", cartoon: "The Flintstones", imageUrl: "images/characters/Flintstone.png", description: "Stone age family man" },
  { name: "Gadget", cartoon: "Inspector Gadget", imageUrl: "images/characters/Gadget.png", description: "Go-go-gadget detective" },
  { name: "Garfield", cartoon: "Garfield and Friends", imageUrl: "images/characters/Garfield.png", description: "Lasagna-loving cat" },
  { name: "Ghost", cartoon: "Various", imageUrl: "images/characters/Ghost.png", description: "Spooky specter" },
  { name: "GI Joe", cartoon: "G.I. Joe", imageUrl: "images/characters/GIJoe.png", description: "American hero" },
  { name: "Gobot", cartoon: "Challenge of the GoBots", imageUrl: "images/characters/Gobot.png", description: "Transforming robot" },
  { name: "He-Man", cartoon: "He-Man", imageUrl: "images/characters/He-Man.png", description: "Most powerful man" },
  { name: "Heathcliff", cartoon: "Heathcliff", imageUrl: "images/characters/Heathcliff.png", description: "Tough cat" },
  { name: "Jem", cartoon: "Jem and the Holograms", imageUrl: "images/characters/Jem.jpg", description: "Rock star" },
  { name: "Jetson", cartoon: "The Jetsons", imageUrl: "images/characters/Jetson.png", description: "Space age family" },
  { name: "Josie", cartoon: "Josie and the Pussycats", imageUrl: "images/characters/Josie.png", description: "Musical adventurer" },
  { name: "Kermit", cartoon: "The Muppets", imageUrl: "images/characters/Kermit.png", description: "The frog" },
  { name: "Lion-O", cartoon: "ThunderCats", imageUrl: "images/characters/Lion-O.png", description: "Lord of ThunderCats" },
  { name: "Mark", cartoon: "Battle of the Planets", imageUrl: "images/characters/Mark.png", description: "Team leader" },
  { name: "Mouse", cartoon: "Various", imageUrl: "images/characters/Mouse.png", description: "Clever rodent" },
  { name: "Optimus", cartoon: "Transformers", imageUrl: "images/characters/Optimus.png", description: "Autobot leader" },
  { name: "Panther", cartoon: "Various", imageUrl: "images/characters/Panther.png", description: "Sleek predator" },
  { name: "Puppy", cartoon: "Various", imageUrl: "images/characters/Puppy.png", description: "Playful pup" },
  { name: "Racer", cartoon: "Speed Racer", imageUrl: "images/characters/Racer.png", description: "Speed demon" },
  { name: "Rainbow", cartoon: "Rainbow Brite", imageUrl: "images/characters/Rainbow.png", description: "Color keeper" },
  { name: "Ranger", cartoon: "Power Rangers", imageUrl: "images/characters/Ranger.png", description: "Morphin hero" },
  { name: "Scooby", cartoon: "Scooby-Doo", imageUrl: "images/characters/Scooby.png", description: "Mystery solver" },
  { name: "Scrooge", cartoon: "DuckTales", imageUrl: "images/characters/Scrooge.png", description: "Richest duck" },
  { name: "She-Ra", cartoon: "She-Ra", imageUrl: "images/characters/She-Ra.png", description: "Princess of Power" },
  { name: "Smurf", cartoon: "The Smurfs", imageUrl: "images/characters/Smurf.png", description: "Blue creature" },
  { name: "Snork", cartoon: "Snorks", imageUrl: "images/characters/Snork.png", description: "Underwater dweller" },
  { name: "Spidey", cartoon: "Spider-Man", imageUrl: "images/characters/Spidey.png", description: "Web slinger" },
  { name: "Teddy", cartoon: "Teddy Ruxpin", imageUrl: "images/characters/Teddy.png", description: "Storytelling bear" },
  { name: "Tenderheart", cartoon: "Care Bears", imageUrl: "images/characters/Tenderheart.png", description: "Caring bear" },
  { name: "Thundarr", cartoon: "Thundarr the Barbarian", imageUrl: "images/characters/Thundarr.png", description: "Post-apocalyptic hero" },
  { name: "TMNT", cartoon: "Teenage Mutant Ninja Turtles", imageUrl: "images/characters/TMNT.png", description: "Pizza-loving turtle" },
  { name: "Tom", cartoon: "Tom and Jerry", imageUrl: "images/characters/Tom.png", description: "Cat chaser" },
  { name: "Trakker", cartoon: "M.A.S.K.", imageUrl: "images/characters/Trakker.png", description: "Masked warrior" },
  { name: "Voltron", cartoon: "Voltron", imageUrl: "images/characters/Voltron.png", description: "Defender of universe" },
  { name: "Woody", cartoon: "Toy Story", imageUrl: "images/characters/Woody.png", description: "Cowboy toy" },
  { name: "Wuzzle", cartoon: "The Wuzzles", imageUrl: "images/characters/Wuzzle.png", description: "Mixed creature" },
  { name: "Yogi", cartoon: "Yogi Bear", imageUrl: "images/characters/Yogi.png", description: "Smarter than average" },
  { name: "Zummi", cartoon: "Gummi Bears", imageUrl: "images/characters/Zummi.png", description: "Magical bear" }
];

export const getRandomCharacters = (count: number): AICharacter[] => {
  const shuffled = [...AI_CHARACTERS].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
};