import { DevelopmentCard } from '../types/game';

interface CardDefinition {
  name: string;
  deckAffiliation: 'standard' | 'expanded';
  quantity: number;
  playStyle: string;
  rules: string;
  description: string;
  imageFile: string;
}

const CARD_DEFINITIONS: CardDefinition[] = [
  {
    name: 'Guard',
    deckAffiliation: 'standard',
    quantity: 14,
    description: 'The Guard is your law enforcement force.  Add it to your Army, and force the Robber to vacate your land!',
    imageFile: 'Guard.png',
    playStyle: 'Play removes Card from Dev Card hold and is discarded.',
    rules: 'Playing a Guard adds 1 to Army count.  If this Player is the first to meet or exceed the minimum Largest Army setting, add the Largest Army Bonus to the Player\'s score, and add the badge at the top right corner of the Player\'s Box in the Player Dashboard.  If another Player has the Largest Army badge and this Player currently exceeds that number, reduce the other Player\'s score by the Bonus amount, move the Badge to this Player and add the Bonus to this Player\'s score.  Update the Game Events log accordingly.  Then, after any Bonus calculations, this Player must move the Robber.  Stealing effect of moving the Robber is activated, and the Robber behaves as if it had been moved with a 7 roll.  Prompts in the Action Box for the Human Player must follow what we do for a 7 roll.  But there is no Discard effect for any Player in this case.'
  },
  {
    name: 'Extra Point',
    deckAffiliation: 'standard',
    quantity: 5,
    description: 'Your civilization is prospering.  Secretly add 1 point to your score.',
    imageFile: 'ExtraPoint.png',
    playStyle: 'Card cannot be played from Dev Card hold.',
    rules: 'Once the Card is drawn and added to the Resource Hold, this Player gets 1 point added to their Score.  However, the extra point is "secret".  If it\'s the Human Player, they can see it on their Player Dashboard and the Extra Point is noted in the Game Events log.  If it\'s an AI Player, the effect is hidden and all that is visible is that the current Player added 1 to their Dev Card hold.'
  },
  {
    name: 'Road Construction',
    deckAffiliation: 'standard',
    quantity: 2,
    description: 'Rapid expansion.  Add 2 Roads to your civilization, for free.',
    imageFile: 'RoadConstruction.png',
    playStyle: 'Play removes Card from Dev Card hold and is discarded.',
    rules: 'Player must add 2 Roads to the Board, following usual adjacency rules, without paying Resources to do so.'
  },
  {
    name: 'Booming Economy',
    deckAffiliation: 'standard',
    quantity: 2,
    description: 'This has been a time of extra producitivity.  2 extra Resources, for free.',
    imageFile: 'BoomingEconomy.png',
    playStyle: 'Play removes Card from Dev Card hold and is discarded.',
    rules: 'Player must choose 2 Resources (same type or 2 different types) and those are added to the Player\'s Resource Hold.  For the Human Player, selection can happen in a menu in the Action Box, but UX must fit in the box without th need for scrolling.  Counts are updated in the Player Dashboard.  What was chosen is itemized in the Events Log.'
  },
  {
    name: 'Closed Market',
    deckAffiliation: 'standard',
    quantity: 2,
    description: 'You command the market.  Name a Resource type, and all other Players must give up all their Resources of that type, to you.',
    imageFile: 'ClosedMarket.png',
    playStyle: 'Play removes Card from Dev Card hold and is discarded.',
    rules: 'Player must choose 1 Resource type and all other Players with that Resource in their Hold hand over any they have to the current Player.  For the Human Player, selection can happen in a menu in the Action Box, but UX must fit in the box without th need for scrolling.  Counts are updated in the Player Dashboard.  How many were transferred from who is itemized in the Events Log.'
  },
  {
    name: 'Resource Swap',
    deckAffiliation: 'expanded',
    quantity: 3,
    description: 'Unexpected deal!  Choose an opponent Player, and you and that Player swap your entire Resource Holds.',
    imageFile: 'ResourceSwap.png',
    playStyle: 'Play removes Card from Dev Card hold and is discarded.',
    rules: 'Player chooses any 1 Opponent Player.  All Resources are completely swapped between the two Players.  For the Human Player, selection can happen in a menu in the Action Box, but UX must fit in the box without th need for scrolling.  Counts are updated in the Player Dashboard.  Only who swapped with who is itemized in the Events Log.'
  },
  {
    name: 'Free Upgrade',
    deckAffiliation: 'expanded',
    quantity: 3,
    description: 'Your settlement is thriving.  Choose one of your Villages, and upgrade it to an Estate, for free.',
    imageFile: 'FreeUpgrade.png',
    playStyle: 'Play removes Card from Dev Card hold and is discarded.',
    rules: 'Can only be played if the Player has at least 1 Village on the Board.  Otherwise, Card cannot be played (and Human Player should get this feedback if trying to play the Card on their turn).  Choose any 1 Village and upgrade it to an Estate, without paying Resources.  Selection UX follows that of buying an upgrade.'
  },
  {
    name: 'Expert Negotiator',
    deckAffiliation: 'expanded',
    quantity: 3,
    description: 'Close the deal!  This turn, trade with the Bank at 2:1.',
    imageFile: 'ExpertNegotiator.png',
    playStyle: 'Play removes Card from Dev Card hold and is discarded.',
    rules: 'Can only be played if trading functionality has been implemented in the game code.  Otherwise, Card cannot be played (and Human Player should get this feedback if trying to play the Card on their turn).  For this turn only, trading UX is updated so that the Player can trade any 2 of the same Resource Types from their Hold for any 1 of any Resource Type from the Bank, regardless of whether or not the Player controls any Trading Ports.'
  }
];

function getImageUrl(imageFile: string): string {
  return `/images/cards/${imageFile}`;
}

export function createInitialDeck(deckType: 'standard' | 'expanded'): DevelopmentCard[] {
  const cards: DevelopmentCard[] = [];
  let cardIdCounter = 0;

  const cardsToInclude = deckType === 'expanded'
    ? CARD_DEFINITIONS
    : CARD_DEFINITIONS.filter(def => def.deckAffiliation === 'standard');

  for (const definition of cardsToInclude) {
    for (let i = 0; i < definition.quantity; i++) {
      cards.push({
        id: `card-${cardIdCounter++}`,
        name: definition.name,
        deckAffiliation: definition.deckAffiliation,
        playStyle: definition.playStyle,
        rules: definition.rules,
        description: definition.description,
        imageUrl: getImageUrl(definition.imageFile),
        location: 'deck',
        ownerId: undefined,
        turnDrawn: undefined
      });
    }
  }

  return cards;
}

export function shuffleDeck(cards: DevelopmentCard[]): DevelopmentCard[] {
  const shuffled = [...cards];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export function drawCard(deck: DevelopmentCard[]): { card: DevelopmentCard | null; remainingDeck: DevelopmentCard[] } {
  if (deck.length === 0) {
    return { card: null, remainingDeck: [] };
  }

  const [drawnCard, ...remainingCards] = deck;
  return { card: drawnCard, remainingDeck: remainingCards };
}

export function getTotalCardCount(deckType: 'standard' | 'expanded'): number {
  const cardsToCount = deckType === 'expanded'
    ? CARD_DEFINITIONS
    : CARD_DEFINITIONS.filter(def => def.deckAffiliation === 'standard');

  return cardsToCount.reduce((sum, def) => sum + def.quantity, 0);
}

export function reshuffleDeck(discardPile: DevelopmentCard[]): DevelopmentCard[] {
  const cardsToReshuffle = discardPile.filter(card => card.name !== 'Guard');

  const reshuffledCards = cardsToReshuffle.map(card => ({
    ...card,
    location: 'deck' as CardLocation,
    ownerId: undefined,
    turnDrawn: undefined
  }));

  return shuffleDeck(reshuffledCards);
}

export { CARD_DEFINITIONS };
