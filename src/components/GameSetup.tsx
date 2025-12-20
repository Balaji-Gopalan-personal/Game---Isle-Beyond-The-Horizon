import React, { useState } from 'react';
import { Users, Settings, User, Palette, Grid3X3, Shuffle, Brain, Trophy, Route, Shield, Package, MapPin, Coins } from 'lucide-react';
import { BoardSize } from '../data/boardStructure';
import { BOARD_STRUCTURES } from '../data/boardStructure';
import { getRandomCharacters, AICharacter } from '../data/aiCharacters';
import { CharacterAvatar } from './CharacterAvatar';
import { PLAYER_COLOR_ARRAY } from '../utils/playerColors';

interface GameSettings {
  pointsToWin: number;
  longestRoadEnabled: boolean;
  longestRoadSize: number;
  longestRoadBonus: number;
  largestArmyEnabled: boolean;
  largestArmySize: number;
  largestArmyBonus: number;
  maxResourceHold: number;
  robberCanReturnToDesert: boolean;
  tradingPortsEnabled: boolean;
  numberOfTradingPorts: number;
  developmentCardDeck: 'standard' | 'expanded';
}

interface GameSetupProps {
  onStartWithConfig: (
    aiCount: number,
    playerName: string,
    playerColor: string,
    boardSize: BoardSize,
    aiCharacters: AICharacter[],
    playerOrder: number[],
    aiDifficulty: 'easy' | 'normal' | 'hard',
    aiColors: string[],
    gameSettings: GameSettings
  ) => void;
  defaultPlayerName?: string;
}

export const GameSetup: React.FC<GameSetupProps> = ({ onStartWithConfig, defaultPlayerName = '' }) => {
  const [aiPlayerCount, setAiPlayerCount] = useState(0);
  const [playerName, setPlayerName] = useState(defaultPlayerName);
  const [playerColor, setPlayerColor] = useState('blue');
  const [boardSize, setBoardSize] = useState<BoardSize>('standard');
  const [aiCharacters, setAiCharacters] = useState<AICharacter[]>([]);
  const [aiColors, setAiColors] = useState<string[]>([]);
  const [playerOrder, setPlayerOrder] = useState<number[]>([]);
  const [aiDifficulty, setAiDifficulty] = useState<'easy' | 'normal' | 'hard'>('normal');
  const [nameError, setNameError] = useState('');
  
  // Game settings
  const [pointsToWin, setPointsToWin] = useState<number>(0);
  const [longestRoadEnabled, setLongestRoadEnabled] = useState(true);
  const [longestRoadSize, setLongestRoadSize] = useState(5);
  const [longestRoadBonus, setLongestRoadBonus] = useState(2);
  const [largestArmyEnabled, setLargestArmyEnabled] = useState(true);
  const [largestArmySize, setLargestArmySize] = useState(3);
  const [largestArmyBonus, setLargestArmyBonus] = useState(2);
  const [maxResourceHold, setMaxResourceHold] = useState(7);
  const [robberCanReturnToDesert, setRobberCanReturnToDesert] = useState(false);
  const [tradingPortsEnabled, setTradingPortsEnabled] = useState(true);
  const [numberOfTradingPorts, setNumberOfTradingPorts] = useState(3);
  const [developmentCardDeck, setDevelopmentCardDeck] = useState<'standard' | 'expanded'>('standard');
  const [testingMode, setTestingMode] = useState(false);

  const availableColors = PLAYER_COLOR_ARRAY.map(color => ({
    value: color.name,
    label: color.label,
    color: color.hex
  }));

  const maxAiPlayers = BOARD_STRUCTURES[boardSize].maxPlayers - 1;

  // Points to win options based on board size and player count
  const getPointsToWinOptions = () => {
    const totalPlayers = aiPlayerCount + 1;
    const baseRanges = {
      tiny: { min: 7, max: 11 },
      small: { min: 9, max: 12 },
      standard: { min: 11, max: 14 },
      large: { min: 13, max: 16 },
      huge: { min: 15, max: 18 }
    };
    
    const range = baseRanges[boardSize];
    const options = [];
    const minPoints = range.min - totalPlayers;
    const maxPoints = range.max - totalPlayers;
    
    for (let i = minPoints; i <= maxPoints; i++) {
      options.push(i);
    }
    return options;
  };

  // Get default points to win (middle value)
  const getDefaultPointsToWin = () => {
    const options = getPointsToWinOptions();
    if (options.length === 0) return 0;
    const middleIndex = Math.floor(options.length / 2);
    return options[middleIndex];
  };

  // Longest road size options based on board size
  const getLongestRoadOptions = () => {
    const ranges = {
      tiny: { min: 2, max: 4 },
      small: { min: 2, max: 6 },
      standard: { min: 3, max: 7 },
      large: { min: 4, max: 8 },
      huge: { min: 6, max: 10 }
    };
    
    const range = ranges[boardSize];
    const options = [];
    for (let i = range.min; i <= range.max; i++) {
      options.push(i);
    }
    return options;
  };

  // Trading ports options based on board size
  const getTradingPortsOptions = () => {
    const ranges = {
      tiny: { min: 1, max: 6 },
      small: { min: 1, max: 8 },
      standard: { min: 1, max: 10 },
      large: { min: 1, max: 12 },
      huge: { min: 1, max: 14 }
    };
    
    const range = ranges[boardSize];
    const options = [];
    for (let i = range.min; i <= range.max; i++) {
      options.push(i);
    }
    return options;
  };

  // Get default trading ports count (middle value)
  const getDefaultTradingPorts = () => {
    const options = getTradingPortsOptions();
    if (options.length === 0) return 3;
    const middleIndex = Math.floor(options.length / 2);
    return options[middleIndex];
  };

  const generatePlayerOrder = (totalPlayers: number) => {
    const order = Array.from({ length: totalPlayers }, (_, i) => i + 1);
    return order.sort(() => Math.random() - 0.5);
  };

  const generateAiColors = (count: number, excludeColor: string) => {
    const availableForAi = availableColors.filter(c => c.value !== excludeColor);
    const shuffled = [...availableForAi].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count).map(c => c.value);
  };

  const resetGameSettings = () => {
    if (aiPlayerCount > 0) {
      setPointsToWin(getDefaultPointsToWin());
      const longestRoadOptions = getLongestRoadOptions();
      const middleIndex = Math.floor(longestRoadOptions.length / 2);
      setLongestRoadSize(longestRoadOptions[middleIndex]);
      setNumberOfTradingPorts(getDefaultTradingPorts());
    } else {
      setPointsToWin(0);
    }
  };

  const handleBoardSizeChange = (newBoardSize: BoardSize) => {
    setBoardSize(newBoardSize);
    setAiPlayerCount(0);
    setAiCharacters([]);
    setAiColors([]);
    setPlayerOrder([]);
    
    // Reset game settings with new board size
    setPointsToWin(0);
    const longestRoadOptions = getLongestRoadOptions();
    const middleIndex = Math.floor(longestRoadOptions.length / 2);
    setLongestRoadSize(longestRoadOptions[middleIndex]);
    setNumberOfTradingPorts(getDefaultTradingPorts());
  };

  const handleAiCountChange = (count: number) => {
    setAiPlayerCount(count);
    
    // Set points to win when player count changes
    if (count > 0) {
      const totalPlayers = count + 1;
      const baseRanges = {
        tiny: { min: 7, max: 11 },
        small: { min: 9, max: 12 },
        standard: { min: 11, max: 14 },
        large: { min: 13, max: 16 },
        huge: { min: 15, max: 18 }
      };
      
      const range = baseRanges[boardSize];
      const minPoints = range.min - totalPlayers;
      const maxPoints = range.max - totalPlayers;
      const options = [];
      
      for (let i = minPoints; i <= maxPoints; i++) {
        options.push(i);
      }
      
      if (options.length > 0) {
        const middleIndex = Math.floor(options.length / 2);
        setPointsToWin(options[middleIndex]);
      }
    } else {
      setPointsToWin(0);
    }
    
    if (count > 0) {
      const characters = getRandomCharacters(count);
      setAiCharacters(characters);
      const colors = generateAiColors(count, playerColor);
      setAiColors(colors);
      const order = generatePlayerOrder(count + 1);
      setPlayerOrder(order);
    } else {
      setAiCharacters([]);
      setAiColors([]);
      setPlayerOrder([]);
    }
  };

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const name = e.target.value;
    setPlayerName(name);
    
    if (name.length < 2) {
      setNameError('Name must be at least 2 characters');
    } else if (name.length > 15) {
      setNameError('Name must be 15 characters or less');
    } else {
      setNameError('');
    }
  };

  const handleColorChange = (newColor: string) => {
    setPlayerColor(newColor);
    if (aiPlayerCount > 0) {
      const colors = generateAiColors(aiPlayerCount, newColor);
      setAiColors(colors);
    }
  };

  const handleStartGame = () => {
    if (playerName.length >= 2 && playerName.length <= 15 && aiPlayerCount > 0 && pointsToWin > 0) {
      console.log('=== GAME SETUP DATA FLOW ===');
      console.log('Player Name:', playerName);
      console.log('Player Color:', playerColor);
      console.log('AI Characters:', aiCharacters.map(c => c.name));
      console.log('AI Colors:', aiColors);
      console.log('Player Order:', playerOrder);
      console.log('AI Difficulty:', aiDifficulty);
      
      // Get current configuration values as displayed on screen
      const gameSettings: GameSettings = {
        pointsToWin: pointsToWin || getDefaultPointsToWin(),
        longestRoadEnabled: longestRoadEnabled,
        longestRoadSize: longestRoadSize,
        longestRoadBonus: longestRoadBonus,
        largestArmyEnabled: largestArmyEnabled,
        largestArmySize: largestArmySize,
        largestArmyBonus: largestArmyBonus,
        maxResourceHold: maxResourceHold,
        robberCanReturnToDesert: robberCanReturnToDesert,
        tradingPortsEnabled: tradingPortsEnabled,
        numberOfTradingPorts: numberOfTradingPorts,
        developmentCardDeck: developmentCardDeck,
        testingMode: testingMode
      };
      
      console.log('Game Settings:', gameSettings);
      
      onStartWithConfig(
        aiPlayerCount, 
        playerName, 
        playerColor, 
        boardSize, 
        aiCharacters, 
        playerOrder, 
        aiDifficulty, 
        aiColors,
        gameSettings
      );
    }
  };

  const isValidName = playerName.length >= 2 && playerName.length <= 15;
  const canStart = isValidName && aiPlayerCount > 0 && pointsToWin > 0;

  return (
    <div 
      className="bg-gradient-to-br from-blue-50 to-green-50 rounded-xl shadow-lg p-8 w-full max-w-7xl mx-auto relative overflow-hidden"
      style={{
        backgroundImage: 'url(/public/ItN-2865034419.gif)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat'
      }}
    >
      <div className="absolute inset-0 bg-white bg-opacity-85 rounded-xl"></div>
      <div className="relative z-10">
      <div className="flex justify-between items-center mb-4">
        <img
          src="/images/chatgpt_image_dec_20,_2025,_11_59_13_am.png"
          alt="Isle Beyond the Horizon"
          className="h-40 object-contain"
        />
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm font-medium text-gray-700 cursor-pointer">
            <input
              type="checkbox"
              checked={testingMode}
              onChange={(e) => {
                const checked = e.target.checked;
                setTestingMode(checked);
                if (checked) {
                  setMaxResourceHold(0);
                }
              }}
              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            />
            Testing Mode
          </label>
          <button
            onClick={handleStartGame}
            disabled={!canStart}
            className={`px-6 py-2 rounded-lg font-semibold text-base transition-all duration-200 ${
              canStart
                ? 'bg-gradient-to-r from-blue-500 to-green-500 hover:from-blue-600 hover:to-green-600 text-white shadow-lg hover:shadow-xl transform hover:scale-105'
                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
            }`}
          >
            Start Game →
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column - Player Configuration */}
        <div className="space-y-6">
          <div className="bg-white rounded-lg p-6 shadow-lg border border-gray-200">
            <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <User className="w-5 h-5 text-blue-600" />
              Player Settings
            </h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Your Name</label>
                <input
                  type="text"
                  value={playerName}
                  onChange={handleNameChange}
                  placeholder="Enter your name (2-15 characters)"
                  className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    nameError ? 'border-red-500' : 'border-gray-300'
                  }`}
                  maxLength={15}
                />
                {nameError && (
                  <div className="text-red-500 text-sm mt-1">{nameError}</div>
                )}
                <div className="text-xs text-gray-500 mt-1">
                  {playerName.length}/15 characters
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <Palette className="w-4 h-4 inline mr-1" />
                  Your Color
                </label>
                <div className="grid grid-cols-7 gap-3">
                  {availableColors.map((color) => (
                    <button
                      key={color.value}
                      onClick={() => handleColorChange(color.value)}
                      className={`p-4 rounded-lg border-2 transition-all duration-200 flex flex-col items-center gap-2 ${
                        playerColor === color.value
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div
                        className="w-6 h-6 rounded-full border-2 border-white shadow-sm"
                        style={{ backgroundColor: color.color }}
                      />
                      <span className="text-xs font-medium text-gray-700">
                        {color.label}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg p-6 shadow-lg border border-gray-200">
            <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <Grid3X3 className="w-5 h-5 text-green-600" />
              Board & Players
            </h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Board Size</label>
                <div className="grid grid-cols-5 gap-2">
                  {(Object.entries(BOARD_STRUCTURES) as [BoardSize, typeof BOARD_STRUCTURES[BoardSize]][]).map(([size, config]) => (
                    <button
                      key={size}
                      onClick={() => handleBoardSizeChange(size)}
                      className={`p-2 rounded-lg border-2 transition-all duration-200 text-center ${
                        boardSize === size
                          ? 'border-green-500 bg-green-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="font-semibold text-gray-800 text-sm">{config.name}</div>
                      <div className="text-xs text-gray-600">
                        {config.totalCenters} centers
                      </div>
                      <div className="text-xs text-gray-600">
                        Max {config.maxPlayers}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <Users className="w-4 h-4 inline mr-1" />
                  Number of Players
                </label>
                <select
                  value={aiPlayerCount === 0 ? '' : aiPlayerCount + 1}
                  onChange={(e) => handleAiCountChange(parseInt(e.target.value) - 1)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select number of players...</option>
                  {Array.from({ length: maxAiPlayers }, (_, i) => i + 2).map(totalPlayers => (
                    <option key={totalPlayers} value={totalPlayers}>
                      {totalPlayers} Players (You + {totalPlayers - 1} AI)
                    </option>
                  ))}
                </select>
              </div>

              {aiPlayerCount > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    <Brain className="w-4 h-4 inline mr-1" />
                    AI Difficulty
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { value: 'easy', label: 'Easy', description: '60% optimal' },
                      { value: 'normal', label: 'Normal', description: '80% optimal' },
                      { value: 'hard', label: 'Hard', description: '100% optimal' }
                    ].map((difficulty) => (
                      <button
                        key={difficulty.value}
                        onClick={() => setAiDifficulty(difficulty.value as 'easy' | 'normal' | 'hard')}
                        className={`p-2 rounded-lg border-2 transition-all duration-200 text-center ${
                          aiDifficulty === difficulty.value
                            ? 'border-orange-500 bg-orange-50'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <div className="font-semibold text-gray-800 text-sm">{difficulty.label}</div>
                        <div className="text-xs text-gray-600">{difficulty.description}</div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column - Game Rules & Turn Order */}
        <div className="space-y-6">
          <div className="bg-white rounded-lg p-6 shadow-lg border border-gray-200">
            <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <Settings className="w-5 h-5 text-orange-600" />
              Game Rules
            </h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <Trophy className="w-4 h-4 inline mr-1" />
                  Points to Win
                </label>
                <select
                  value={pointsToWin || ''}
                  onChange={(e) => setPointsToWin(parseInt(e.target.value))}
                  disabled={aiPlayerCount === 0}
                  className={`w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    aiPlayerCount === 0 ? 'bg-gray-100 text-gray-400' : ''
                  }`}
                >
                  <option value="">Select points to win...</option>
                  {aiPlayerCount > 0 && getPointsToWinOptions().map(points => (
                    <option key={points} value={points}>
                      {points} Points
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                      <input
                        type="checkbox"
                        checked={longestRoadEnabled}
                        onChange={(e) => setLongestRoadEnabled(e.target.checked)}
                        className="rounded"
                      />
                      <Route className="w-4 h-4" />
                      Longest Road
                    </label>
                    {longestRoadEnabled && (
                      <div className="space-y-2">
                        <select
                          value={longestRoadSize}
                          onChange={(e) => setLongestRoadSize(parseInt(e.target.value))}
                          className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                        >
                          {getLongestRoadOptions().map(size => (
                            <option key={size} value={size}>Min {size} connected roads</option>
                          ))}
                        </select>
                        <select
                          value={longestRoadBonus}
                          onChange={(e) => setLongestRoadBonus(parseInt(e.target.value))}
                          className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                        >
                          {[1, 2, 3, 4].map(bonus => (
                            <option key={bonus} value={bonus}>+{bonus} points</option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                      <input
                        type="checkbox"
                        checked={largestArmyEnabled}
                        onChange={(e) => setLargestArmyEnabled(e.target.checked)}
                        className="rounded"
                      />
                      <Shield className="w-4 h-4" />
                      Largest Army
                    </label>
                    {largestArmyEnabled && (
                      <div className="space-y-2">
                        <select
                          value={largestArmySize}
                          onChange={(e) => setLargestArmySize(parseInt(e.target.value))}
                          className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                        >
                          {[1, 2, 3, 4, 5].map(size => (
                            <option key={size} value={size}>Min {size} guards</option>
                          ))}
                        </select>
                        <select
                          value={largestArmyBonus}
                          onChange={(e) => setLargestArmyBonus(parseInt(e.target.value))}
                          className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                        >
                          {[1, 2, 3, 4].map(bonus => (
                            <option key={bonus} value={bonus}>+{bonus} points</option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      <Package className="w-4 h-4 inline mr-1" />
                      Max Resource Hold
                    </label>
                    <select
                      value={maxResourceHold}
                      onChange={(e) => {
                        const newValue = parseInt(e.target.value);
                        setMaxResourceHold(newValue);
                        if (newValue !== 0) {
                          setTestingMode(false);
                        }
                      }}
                      className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                    >
                      <option value={0}>No limit</option>
                      {[5, 6, 7, 8].map(max => (
                        <option key={max} value={max}>{max} resources</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      <span className="inline-block w-4 h-4 mr-1 align-middle" style={{ fontSize: '14px' }}>🏁</span>
                      Can Robber return to Desert?
                    </label>
                    <select
                      value={robberCanReturnToDesert ? 'yes' : 'no'}
                      onChange={(e) => setRobberCanReturnToDesert(e.target.value === 'yes')}
                      className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                    >
                      <option value="yes">Yes</option>
                      <option value="no">No</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                      <input
                        type="checkbox"
                        checked={tradingPortsEnabled}
                        onChange={(e) => setTradingPortsEnabled(e.target.checked)}
                        className="rounded"
                      />
                      <MapPin className="w-4 h-4" />
                      Trading Ports
                    </label>
                    {tradingPortsEnabled && (
                      <select
                        value={numberOfTradingPorts}
                        onChange={(e) => setNumberOfTradingPorts(parseInt(e.target.value))}
                        className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                      >
                        {getTradingPortsOptions().map(count => (
                          <option key={count} value={count}>{count} ports</option>
                        ))}
                      </select>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      <Coins className="w-4 h-4 inline mr-1" />
                      Development Card Deck
                    </label>
                    <select
                      value={developmentCardDeck}
                      onChange={(e) => setDevelopmentCardDeck(e.target.value as 'standard' | 'expanded')}
                      className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                    >
                      <option value="standard">Standard Deck (25 cards)</option>
                      <option value="expanded">Expanded Deck (34 cards)</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          {/* Turn Order Section - Right Column */}
          {aiPlayerCount > 0 && (
            <div className="bg-white rounded-lg p-6 shadow-lg border border-gray-200">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-sm font-medium text-gray-700 flex items-center gap-2">
                  <Shuffle className="w-6 h-6 text-purple-600" />
                  Turn Order
                </h3>
                <button
                  onClick={() => {
                    const characters = getRandomCharacters(aiPlayerCount);
                    setAiCharacters(characters);
                    const colors = generateAiColors(aiPlayerCount, playerColor);
                    setAiColors(colors);
                    const order = generatePlayerOrder(aiPlayerCount + 1);
                    setPlayerOrder(order);
                  }}
                  className="bg-purple-100 hover:bg-purple-200 text-purple-700 text-xs py-1 px-2 rounded transition-colors duration-200 flex items-center gap-1"
                >
                  <Shuffle className="w-3 h-3" />
                  Shuffle
                </button>
              </div>
              
              <div className="grid grid-cols-4 gap-1.5 max-h-96 overflow-y-auto">
                {playerOrder.map((orderPosition, index) => {
                  const isHuman = orderPosition === 1;
                  const aiIndex = orderPosition - 2;
                  const aiCharacter = isHuman ? null : aiCharacters[aiIndex];
                  const aiColor = isHuman ? null : aiColors[aiIndex];
                  const playerColorObj = availableColors.find(c => c.value === playerColor);
                  const aiColorObj = aiColor ? availableColors.find(c => c.value === aiColor) : null;

                  return orderPosition <= aiPlayerCount + 1 ? (
                    <div key={orderPosition} className="bg-gray-50 p-1.5 rounded border text-center">
                      {isHuman ? (
                        <div>
                          <div
                            className="text-[10px] font-semibold mb-0.5"
                            style={{ color: playerColorObj?.color }}
                          >
                            P{index + 1} {playerName || 'Player'}
                          </div>
                          <div className="text-[9px] text-gray-600">Human</div>
                        </div>
                      ) : (
                        <div>
                          <div
                            className="text-[10px] font-semibold mb-0.5"
                            style={{ color: aiColorObj?.color }}
                          >
                            P{index + 1} {aiCharacter?.name}
                          </div>
                          <div className="text-[8px] text-gray-500 mb-0.5 line-clamp-1">
                            {aiCharacter?.cartoon}
                          </div>
                          <CharacterAvatar
                            character={aiCharacter}
                            color={aiColorObj?.color || '#666'}
                            size="xs"
                            className="mx-auto"
                          />
                        </div>
                      )}
                    </div>
                  ) : null;
                })}
              </div>
            </div>
          )}
        </div>
      </div>
      
      </div>
    </div>
  );
};