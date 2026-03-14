import React from 'react';
import { GameState } from '../types/game';
import { BoardSize } from '../data/boardConfigs';
import { loadBoardGraph, loadBoardForSize } from '../graph/loadBoard';
import { canPlaceVillage } from '../engine/validators';
import { useAssets } from '../contexts/AssetsContext';
import { getResourceImage, getBoardImage } from '../utils/assetHelpers';
import { getPlayerColorHex } from '../utils/playerColors';

interface CenterData {
  id: number;
  topVertex: number;
  vertices: number[];
  x: number;
  y: number;
  resourceType: 'desert' | 'clay' | 'lumber' | 'grain' | 'fabric' | 'mineral';
  value: number;
}

interface GameBoardProps {
  gameState: GameState;
  boardSize?: BoardSize;
  onVertexClick?: (vertexId: number) => void;
  selectedVertex?: number | null;
  validRoadVertices?: number[];
  firstRoadVertex?: number | null;
  onCentreClick?: (centreId: number) => void;
  selectedCentre?: number | null;
  waitingForConfirmation?: boolean;
}

export const GameBoard: React.FC<GameBoardProps> = ({
  gameState,
  boardSize = 'standard',
  onVertexClick,
  selectedVertex,
  validRoadVertices = [],
  firstRoadVertex = null,
  onCentreClick,
  selectedCentre = null,
  waitingForConfirmation = false
}) => {
  const { assets } = useAssets();

  const [animatingRoads, setAnimatingRoads] = React.useState<Set<string>>(new Set());
  const [animatingVillages, setAnimatingVillages] = React.useState<Set<number>>(new Set());
  const [upgradingVillages, setUpgradingVillages] = React.useState<Set<number>>(new Set());
  const [flashingRobberHexes, setFlashingRobberHexes] = React.useState<Set<number>>(new Set());
  const prevRoadsRef = React.useRef<string[]>([]);
  const prevVillagesRef = React.useRef<{id: number, type: string}[]>([]);
  const prevRobberPositionRef = React.useRef<number | undefined>(undefined);

  React.useEffect(() => {
    const currentRoadIds = gameState.roads.map(r => r.id);
    const newRoads = currentRoadIds.filter(id => !prevRoadsRef.current.includes(id));

    if (newRoads.length > 0) {
      setAnimatingRoads(prev => {
        const next = new Set(prev);
        newRoads.forEach(id => next.add(id));
        return next;
      });

      newRoads.forEach(roadId => {
        setTimeout(() => {
          setAnimatingRoads(prev => {
            const next = new Set(prev);
            next.delete(roadId);
            return next;
          });
        }, 390);
      });
    }

    prevRoadsRef.current = currentRoadIds;
  }, [gameState.roads]);

  React.useEffect(() => {
    const currentVillages = gameState.villages.map(v => ({ id: v.vertexId, type: v.type }));
    const prevVillagesMap = new Map(prevVillagesRef.current.map(v => [v.id, v.type]));

    currentVillages.forEach(curr => {
      const prev = prevVillagesMap.get(curr.id);

      if (!prev) {
        setAnimatingVillages(s => new Set(s).add(curr.id));
        setTimeout(() => {
          setAnimatingVillages(s => {
            const next = new Set(s);
            next.delete(curr.id);
            return next;
          });
        }, 390);
      } else if (prev === 'settlement' && curr.type === 'city') {
        setUpgradingVillages(s => new Set(s).add(curr.id));
        setTimeout(() => {
          setUpgradingVillages(s => {
            const next = new Set(s);
            next.delete(curr.id);
            return next;
          });
        }, 650);
      }
    });

    prevVillagesRef.current = currentVillages;
  }, [gameState.villages]);

  React.useEffect(() => {
    const newPos = gameState.robberPosition;
    const oldPos = prevRobberPositionRef.current;

    if (newPos !== undefined && oldPos !== undefined && newPos !== oldPos) {
      setFlashingRobberHexes(prev => new Set(prev).add(oldPos));
      setTimeout(() => {
        setFlashingRobberHexes(prev => {
          const next = new Set(prev);
          next.delete(oldPos);
          next.add(newPos);
          return next;
        });
        setTimeout(() => {
          setFlashingRobberHexes(prev => {
            const next = new Set(prev);
            next.delete(newPos);
            return next;
          });
        }, 250);
      }, 250);
    }

    prevRobberPositionRef.current = newPos;
  }, [gameState.robberPosition]);

  const boardData = React.useMemo(() => {
    console.log('Loading board graph...');
    const data = loadBoardForSize(boardSize);
    console.log('Board graph loaded:', {
      vertices: Object.keys(data.graph.vertices).length,
      edges: Object.keys(data.graph.edges).length,
      centers: data.centers.length
    });
    console.log('- Board size being used:', boardSize);
    return data;
  }, [boardSize]);

  const boardGraph = boardData.graph;
  const centers = boardData.centers;

  console.log('GameBoard Debug: State of centers array:', centers);
  console.log('GameBoard Debug: First 5 centers:', centers.slice(0, 5));

  // Use trading ports from game state (generated once in useGameEngine)
  const tradingPorts = React.useMemo(() => {
    if (!gameState.gameSettings?.tradingPortsEnabled) return [];
    if (!gameState.tradingPorts || gameState.tradingPorts.length === 0) {
      console.warn('GameBoard: Trading ports enabled but no ports found in gameState');
      return [];
    }
    console.log('GameBoard: Using trading ports from gameState:', gameState.tradingPorts);
    return gameState.tradingPorts;
  }, [gameState.gameSettings?.tradingPortsEnabled, gameState.tradingPorts]);

  const vertices = Object.values(boardGraph.vertices);
  const edges = Object.values(boardGraph.edges);

  console.log('GameBoard Debug:', {
    verticesCount: vertices.length,
    edgesCount: edges.length,
    centersCount: centers.length,
    sampleVertex: vertices[0],
    sampleEdge: edges[0]
  });

  if (vertices.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-md p-4 h-full flex items-center justify-center">
        <div className="text-center">
          <div className="text-lg font-semibold text-gray-800 mb-2">Loading Board...</div>
        </div>
      </div>
    );
  }

  // Calculate board dimensions
  const minX = Math.min(...vertices.map(v => v.x));
  const maxX = Math.max(...vertices.map(v => v.x));
  const minY = Math.min(...vertices.map(v => v.y));
  const maxY = Math.max(...vertices.map(v => v.y));
  
  const boardWidth = maxX - minX;
  const boardHeight = maxY - minY;
  
  // Scale for wider board
  const containerWidth = 1000;
  const targetBoardWidth = containerWidth * 0.85;
  const scale = targetBoardWidth / boardWidth;
  
  const padding = 60;
  const viewBoxWidth = boardWidth * scale + padding * 2;
  const viewBoxHeight = boardHeight * scale + padding * 2;

  const getVertexPosition = (vertex: typeof vertices[0]) => ({
    x: (vertex.x - minX) * scale + padding,
    y: (vertex.y - minY) * scale + padding
  });

  const getCenterPosition = (center: typeof centers[0]) => ({
    x: (center.x - minX) * scale + padding,
    y: (center.y - minY) * scale + padding
  });

  const getResourceImageSrc = (resourceType: string): string | undefined => {
    return getResourceImage(assets, resourceType);
  };

  const getResourceColor = (resourceType: string) => {
    switch (resourceType) {
      case 'desert': return '#F4E4C1';
      case 'clay': return '#B7410E';
      case 'lumber': return '#228B22';
      case 'grain': return '#FFD700';
      case 'fabric': return '#87CEEB';
      case 'mineral': return '#696969';
      default: return '#F4E4C1';
    }
  };

  const getNumberStyle = (value: number) => {
    if (value === 6 || value === 8) {
      return { fontSize: Math.max(28.8, scale * 0.72), fill: '#dc2626', fontWeight: 'bold' }; // Reduced by 50% from previous
    } else if (value === 5 || value === 9) {
      return { fontSize: Math.max(24, scale * 0.6), fill: '#000', fontWeight: 'bold' }; // Reduced by 50% from previous
    } else if (value === 4 || value === 10) {
      return { fontSize: Math.max(21.6, scale * 0.54), fill: '#000', fontWeight: 'bold' }; // Reduced by 50% from previous
    } else if (value === 3 || value === 11) {
      return { fontSize: Math.max(19.2, scale * 0.48), fill: '#000', fontWeight: 'bold' }; // Reduced by 50% from previous
    } else if (value === 2 || value === 12) {
      return { fontSize: Math.max(16.8, scale * 0.42), fill: '#000', fontWeight: 'bold' }; // Reduced by 50% from previous
    }
    return { fontSize: Math.max(19.2, scale * 0.48), fill: '#000', fontWeight: 'bold' }; // Reduced by 50% from previous
  };

  const desertCenter = centers.find(center => center.resourceType === 'desert');

  // Create island boundary that follows the outer edge of the board
  const createIslandPath = () => {
    // Find border vertices (vertices with fewer than 3 connections) using the actual board graph
    const borderVertices: typeof vertices = [];
    
    vertices.forEach(vertex => {
      // Use the board graph's edgesByVertex to get actual connections
      const connections = boardGraph.edgesByVertex?.[vertex.id]?.length || 0;
      
      if (connections < 3) {
        borderVertices.push(vertex);
      }
    });
    
    // Sort border vertices by angle from center to create proper outline
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    
    borderVertices.sort((a, b) => {
      const angleA = Math.atan2(a.y - centerY, a.x - centerX);
      const angleB = Math.atan2(b.y - centerY, b.x - centerX);
      return angleA - angleB;
    });
    
    // Create path with padding around border vertices
    const paddedPoints = borderVertices.map(vertex => {
      const pos = getVertexPosition(vertex);
      const angle = Math.atan2(vertex.y - centerY, vertex.x - centerX);
      const paddingDistance = 60 * scale; // Increased padding for better shape
      
      return {
        x: pos.x + Math.cos(angle) * paddingDistance,
        y: pos.y + Math.sin(angle) * paddingDistance
      };
    });
    
    if (paddedPoints.length === 0) return '';
    
    // Create smooth path
    let path = `M ${paddedPoints[0].x},${paddedPoints[0].y}`;
    
    for (let i = 1; i < paddedPoints.length; i++) {
      const curr = paddedPoints[i];
      const prev = paddedPoints[i - 1];
      const next = paddedPoints[(i + 1) % paddedPoints.length];
      
      // Add smooth curves between points
      const cp1x = prev.x + (curr.x - prev.x) * 0.5;
      const cp1y = prev.y + (curr.y - prev.y) * 0.5;
      
      path += ` Q ${cp1x},${cp1y} ${curr.x},${curr.y}`;
    }
    
    path += ' Z';
    return path;
  };

  const islandPath = createIslandPath();

  return (
    <div className="bg-white rounded-lg shadow-md p-4 h-full relative overflow-hidden flex items-center justify-center">
      <style>{`
        @keyframes road-draw {
          to {
            stroke-dashoffset: 0;
          }
        }
        @keyframes village-dissolve-in {
          0% {
            opacity: 0;
            clip-path: polygon(0% 100%, 100% 100%, 100% 100%, 0% 100%);
          }
          100% {
            opacity: 1;
            clip-path: polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%);
          }
        }
        @keyframes village-dissolve-out {
          0% {
            opacity: 1;
            clip-path: polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%);
          }
          100% {
            opacity: 0;
            clip-path: polygon(0% 0%, 100% 0%, 100% 0%, 0% 0%);
          }
        }
        @keyframes estate-dissolve-in {
          0% {
            opacity: 0;
            clip-path: polygon(0% 100%, 100% 100%, 100% 100%, 0% 100%);
          }
          100% {
            opacity: 1;
            clip-path: polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%);
          }
        }
      `}</style>
      {/* Ocean background */}
      <div
        className="absolute inset-0 rounded-lg"
        style={{
          backgroundImage: `url(${getBoardImage(assets, 'ocean')})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
          opacity: 0.6,
          filter: 'contrast(0.7) brightness(1.1)',
        }}
      />
      
      <div className="relative z-10 h-full w-full flex items-center justify-center">
        <svg
          viewBox={`0 0 ${viewBoxWidth} ${viewBoxHeight}`}
          className="w-full h-full rounded-lg"
          style={{ aspectRatio: `${viewBoxWidth}/${viewBoxHeight}` }}
        >
          <defs>
            <pattern id="checkerboard" patternUnits="userSpaceOnUse" width="10" height="10">
              <rect width="5" height="5" fill="white" />
              <rect x="5" y="5" width="5" height="5" fill="white" />
              <rect x="5" y="0" width="5" height="5" fill="black" />
              <rect x="0" y="5" width="5" height="5" fill="black" />
            </pattern>

            {/* Resource image patterns for centers */}
            <pattern id="pattern-desert" patternUnits="objectBoundingBox" width="1" height="1" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice">
              <image
                href={getResourceImageSrc('desert')}
                x="0"
                y="0"
                width="100"
                height="100"
                preserveAspectRatio="xMidYMid slice"
              />
            </pattern>

            <pattern id="pattern-clay" patternUnits="objectBoundingBox" width="1" height="1" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice">
              <image
                href={getResourceImageSrc('clay')}
                x="0"
                y="0"
                width="100"
                height="100"
                preserveAspectRatio="xMidYMid slice"
              />
            </pattern>

            <pattern id="pattern-lumber" patternUnits="objectBoundingBox" width="1" height="1" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice">
              <image
                href={getResourceImageSrc('lumber')}
                x="0"
                y="0"
                width="100"
                height="100"
                preserveAspectRatio="xMidYMid slice"
              />
            </pattern>

            <pattern id="pattern-grain" patternUnits="objectBoundingBox" width="1" height="1" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice">
              <image
                href={getResourceImageSrc('grain')}
                x="0"
                y="0"
                width="100"
                height="100"
                preserveAspectRatio="xMidYMid slice"
              />
            </pattern>

            <pattern id="pattern-fabric" patternUnits="objectBoundingBox" width="1" height="1" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice">
              <image
                href={getResourceImageSrc('fabric')}
                x="0"
                y="0"
                width="100"
                height="100"
                preserveAspectRatio="xMidYMid slice"
              />
            </pattern>

            <pattern id="pattern-mineral" patternUnits="objectBoundingBox" width="1" height="1" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice">
              <image
                href={getResourceImageSrc('mineral')}
                x="0"
                y="0"
                width="100"
                height="100"
                preserveAspectRatio="xMidYMid slice"
              />
            </pattern>

            {/* Landmass pattern for island background */}
            <pattern id="pattern-landmass" patternUnits="objectBoundingBox" width="1" height="1" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice">
              <image
                href={getBoardImage(assets, 'landmass')}
                x="0"
                y="0"
                width="100"
                height="100"
                preserveAspectRatio="xMidYMid slice"
                style={{ filter: 'contrast(0.3) brightness(1.3)' }}
              />
            </pattern>
          </defs>

          {/* Island background */}
          {islandPath && (
            <path
              d={islandPath}
              fill="url(#pattern-landmass)"
              stroke="#228B22"
              strokeWidth="4"
            />
          )}
          
          {/* Draw edges */}
          {Object.values(boardGraph.edges).map((edge) => {
            const vertex1 = boardGraph.vertices[edge.v1];
            const vertex2 = boardGraph.vertices[edge.v2];
            if (!vertex1 || !vertex2) return null;
            
            const pos1 = getVertexPosition(vertex1);
            const pos2 = getVertexPosition(vertex2);
            
            return (
              <line
                key={edge.id}
                x1={pos1.x}
                y1={pos1.y}
                x2={pos2.x}
                y2={pos2.y}
                stroke="#666666"
                strokeWidth="8"
                opacity="1"
              />
            );
          })}
          
          {/* Draw roads */}
          {gameState.roads.map((road) => {
            const fromVertex = boardGraph.vertices[road.from];
            const toVertex = boardGraph.vertices[road.to];
            const roadPlayer = gameState.players.find(p => p.id === road.playerId);

            if (!fromVertex || !toVertex || !roadPlayer) {
              console.error(`DEBUG: Road rendering failed for road ${road.id}:`, {
                roadId: road.id,
                from: road.from,
                to: road.to,
                fromVertex: !!fromVertex,
                toVertex: !!toVertex,
                roadPlayer: !!roadPlayer,
                playerId: road.playerId,
                availableVertices: Object.keys(boardGraph.vertices).map(Number).slice(0, 5),
                roadFrom: road.from,
                roadTo: road.to
              });
              return null;
            }

            const fromPos = getVertexPosition(fromVertex);
            const toPos = getVertexPosition(toVertex);

            // Check if vertices are owned by checking for settlements/cities or other roads
            // Exclude the current road when checking road connections
            const isOwnedFrom = gameState.verticesOccupiedBy[road.from] === road.playerId ||
                                gameState.roads.some(r => r.playerId === road.playerId && r.id !== road.id && (r.from === road.from || r.to === road.from));
            const isOwnedTo = gameState.verticesOccupiedBy[road.to] === road.playerId ||
                              gameState.roads.some(r => r.playerId === road.playerId && r.id !== road.id && (r.from === road.to || r.to === road.to));

            // Determine drawing direction: draw FROM the owned vertex
            let startX = fromPos.x;
            let startY = fromPos.y;
            let endX = toPos.x;
            let endY = toPos.y;

            // If only 'to' is owned, swap to draw from 'to' to 'from'
            if (isOwnedTo && !isOwnedFrom) {
              startX = toPos.x;
              startY = toPos.y;
              endX = fromPos.x;
              endY = fromPos.y;
            }
            // If both are owned, prefer to draw from the vertex with a settlement/city
            else if (isOwnedFrom && isOwnedTo) {
              const hasSettlementFrom = gameState.verticesOccupiedBy[road.from] === road.playerId;
              const hasSettlementTo = gameState.verticesOccupiedBy[road.to] === road.playerId;

              if (hasSettlementTo && !hasSettlementFrom) {
                startX = toPos.x;
                startY = toPos.y;
                endX = fromPos.x;
                endY = fromPos.y;
              }
            }

            const isAnimating = animatingRoads.has(road.id);
            const dx = endX - startX;
            const dy = endY - startY;
            const length = Math.sqrt(dx * dx + dy * dy);

            return (
              <line
                key={road.id}
                x1={startX}
                y1={startY}
                x2={endX}
                y2={endY}
                stroke={getPlayerColorHex(roadPlayer.color)}
                strokeWidth="18"
                strokeLinecap="round"
                strokeDasharray={isAnimating ? length : undefined}
                strokeDashoffset={isAnimating ? length : undefined}
                style={isAnimating ? {
                  animation: 'road-draw 0.39s ease-out forwards'
                } : undefined}
              />
            );
          })}
          
          {/* Draw centers */}
          {centers.map((center) => {
            const pos = getCenterPosition(center);
            const circleRadius = Math.max(42, scale * 1.08); // Reduced by 50% from previous

            // Check if this centre is clickable for robber movement
            const isMovingRobber = gameState.turnState.step === 'move_robber';
            const currentPlayer = gameState.players.find(p => p.id === gameState.currentPlayer);
            const isNotWaitingForDiceConfirmation = !waitingForConfirmation;
            const isNotInDiscardPhase = gameState.turnState.step !== 'awaiting_discard';
            const canClickCentre = isMovingRobber && currentPlayer?.isHuman && onCentreClick && isNotWaitingForDiceConfirmation && isNotInDiscardPhase;

            // Check if this centre is the current robber position
            const isCurrentRobberPosition = gameState.robberPosition === center.id;

            // Check if this centre is selectable (not current position, not desert if restricted)
            const robberCanReturnToDesert = gameState.gameSettings?.robberCanReturnToDesert || false;
            const isDesert = center.resourceType === 'desert';
            const isValidDestination = !isCurrentRobberPosition && (robberCanReturnToDesert || !isDesert);

            // Check if this centre is selected
            const isSelected = selectedCentre === center.id;

            return (
              <g key={`center-${center.id}`}>
                {/* Selection highlight */}
                {isSelected && (
                  <circle
                    cx={pos.x}
                    cy={pos.y}
                    r={circleRadius * 1.2}
                    fill="none"
                    stroke="#FFD700"
                    strokeWidth="4"
                    opacity="0.9"
                  />
                )}

                {/* Clickable area for robber movement - visual indicator */}
                {canClickCentre && isValidDestination && (
                  <circle
                    cx={pos.x}
                    cy={pos.y}
                    r={circleRadius * 1.3}
                    fill="rgba(255, 165, 0, 0.2)"
                    stroke="rgba(255, 140, 0, 0.8)"
                    strokeWidth="3"
                    pointerEvents="none"
                  />
                )}

                {/* Invalid destination indicator (current position or restricted desert) */}
                {canClickCentre && !isValidDestination && (
                  <circle
                    cx={pos.x}
                    cy={pos.y}
                    r={circleRadius * 1.1}
                    fill="rgba(128, 128, 128, 0.3)"
                    stroke="none"
                    pointerEvents="none"
                  />
                )}

                {/* Robber movement flash */}
                {flashingRobberHexes.has(center.id) && (
                  <circle
                    key={`robber-flash-${center.id}-${Date.now()}`}
                    cx={pos.x}
                    cy={pos.y}
                    r={circleRadius * 1.15}
                    fill="none"
                    stroke="#FF8C00"
                    strokeWidth="8"
                    pointerEvents="none"
                    style={{ animation: 'robber-hex-flash 0.25s ease-out forwards' }}
                  />
                )}

                {/* Resource circle with image pattern */}
                <circle
                  cx={pos.x}
                  cy={pos.y}
                  r={circleRadius}
                  fill={`url(#pattern-${center.resourceType})`}
                  stroke="#000000"
                  strokeWidth="6"
                  pointerEvents="none"
                />

                {/* Number token background */}
                {center.value > 0 && (
                  <circle
                    cx={pos.x}
                    cy={pos.y}
                    r={Math.max(21.6, circleRadius * 0.5)} // Reduced by 50% from previous
                    fill="white"
                    opacity="0.95"
                    stroke="#000000"
                    strokeWidth="3"
                    pointerEvents="none"
                  />
                )}

                {/* Number text */}
                {center.value > 0 && (
                  <text
                    x={pos.x}
                    y={pos.y + Math.max(7.2, scale * 0.18)} // Reduced by 50% from previous
                    textAnchor="middle"
                    {...getNumberStyle(center.value)}
                    pointerEvents="none"
                  >
                    {center.value}
                  </text>
                )}

                {/* Large invisible clickable area covering entire centre including number token */}
                {canClickCentre && isValidDestination && (
                  <circle
                    cx={pos.x}
                    cy={pos.y}
                    r={circleRadius * 1.3}
                    fill="transparent"
                    style={{ cursor: 'pointer' }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onCentreClick(center.id);
                    }}
                  />
                )}
              </g>
            );
          })}
          
          {/* Draw robber */}
          {gameState.robberPosition !== undefined && (() => {
            const robberCentre = centers.find(c => c.id === gameState.robberPosition);
            if (!robberCentre) return null;

            const pos = getCenterPosition(robberCentre);
            const robberRadius = Math.max(10.8, scale * 0.27);

            return (
              <circle
                cx={pos.x}
                cy={pos.y}
                r={robberRadius}
                fill="url(#checkerboard)"
                stroke="#000"
                strokeWidth="1.5"
              />
            );
          })()}
          
          {/* Draw trading ports */}
          {tradingPorts.map((port) => {
            // Get the two vertices for this port
            const vertex1 = boardGraph.vertices[port.vertices[0]];
            const vertex2 = boardGraph.vertices[port.vertices[1]];
            
            if (!vertex1 || !vertex2) return null;
            
            const pos1 = getVertexPosition(vertex1);
            const pos2 = getVertexPosition(vertex2);
            
            // Calculate exact midpoint of the edge
            const midX = (pos1.x + pos2.x) / 2;
            const midY = (pos1.y + pos2.y) / 2;
            
            // Calculate edge direction and perpendicular direction
            const edgeAngle = Math.atan2(pos2.y - pos1.y, pos2.x - pos1.x);
            const perpAngle = edgeAngle + Math.PI / 2; // Perpendicular to edge
            
            // Calculate distance from edge midpoint to make port tangent to vertex circles
            const vertexRadius = Math.max(19.44, scale * 0.486); // Same as vertex circles
            const rectHeight = 30;
            const portDistance = vertexRadius + rectHeight / 2 + 5; // 5px gap
            
            // Calculate board center to determine which side of edge to place port
            const boardCenterX = viewBoxWidth / 2;
            const boardCenterY = viewBoxHeight / 2;
            
            const testX1 = midX + Math.cos(perpAngle) * portDistance;
            const testY1 = midY + Math.sin(perpAngle) * portDistance;
            const testX2 = midX + Math.cos(perpAngle + Math.PI) * portDistance;
            const testY2 = midY + Math.sin(perpAngle + Math.PI) * portDistance;
            
            const dist1 = Math.sqrt((testX1 - boardCenterX) ** 2 + (testY1 - boardCenterY) ** 2);
            const dist2 = Math.sqrt((testX2 - boardCenterX) ** 2 + (testY2 - boardCenterY) ** 2);
            
            // Choose the direction that's farther from board center
            const finalPerpAngle = dist1 > dist2 ? perpAngle : perpAngle + Math.PI;
            
            // Position port perpendicular to edge, away from board center
            const portX = midX + Math.cos(finalPerpAngle) * portDistance;
            const portY = midY + Math.sin(finalPerpAngle) * portDistance;
            
            const edgeLength = Math.sqrt((pos2.x - pos1.x) ** 2 + (pos2.y - pos1.y) ** 2);
            const rectWidth = Math.max(50, edgeLength * 0.7); // Rectangle width proportional to edge length
            const rotation = (edgeAngle * 180) / Math.PI;
            
            // Font size matching vertices  
            const fontSize = Math.max(15.12, scale * 0.378); // Same as vertex font size
            
            return (
              <g key={port.id}>
                {/* Port rectangle - positioned parallel to edge */}
                <rect
                  x={-rectWidth / 2}
                  y={-rectHeight / 2}
                  width={rectWidth}
                  height={rectHeight}
                  fill="white"
                  stroke="#8B4513"
                  strokeWidth="2"
                  rx="5"
                  transform={`translate(${portX}, ${portY}) rotate(${rotation})`}
                />
                
                {port.type === 'generic' ? (
                  /* Generic port: just show "3" */
                  <text
                    x={portX}
                    y={portY + fontSize * 0.35}
                    textAnchor="middle"
                    fontSize={fontSize}
                    fill="#8B4513"
                    fontWeight="bold"
                    transform={`rotate(${rotation}, ${portX}, ${portY})`}
                  >
                    3
                  </text>
                ) : (
                  /* Specific resource port: show "2" and resource square */
                  <g>
                    {/* Number "2" */}
                    <text
                      x={portX - rectWidth / 6}
                      y={portY + fontSize * 0.35}
                      textAnchor="middle"
                      fontSize={fontSize}
                      fill="#8B4513"
                      fontWeight="bold"
                      transform={`rotate(${rotation}, ${portX}, ${portY})`}
                    >
                      2
                    </text>
                    {/* Resource square */}
                    <g transform={`translate(${portX}, ${portY}) rotate(${rotation})`}>
                      <rect
                        x={rectWidth / 6}
                        y={-rectHeight / 4}
                        width={rectHeight / 2}
                        height={rectHeight / 2}
                        fill={`url(#pattern-${port.type})`}
                        stroke="#8B4513"
                        strokeWidth="1"
                      />
                    </g>
                  </g>
                )}
              </g>
            );
          })}
          
          {/* Draw vertices */}
          {vertices.map((vertex, index) => {
            const pos = getVertexPosition(vertex);
            const vertexRadius = Math.max(16, scale * 0.4); // Subtle background circle
            const fontSize = Math.max(12, scale * 0.3); // Vertex number font size
            
            // Check if this vertex has a village
            const village = gameState.villages.find(v => v.vertexId === vertex.id);
            const villagePlayer = village ? gameState.players.find(p => p.id === village.playerId) : null;
            
            // Check if this vertex is selectable for village placement
            const currentPlayer = gameState.players.find(p => p.id === gameState.currentPlayer);
            const isValidForVillage = currentPlayer?.isHuman && 
              gameState.turnState.step === 'init_place_village' &&
              gameState.turnState.currentPlayerId === currentPlayer.id &&
              !gameState.verticesOccupiedBy[vertex.id] &&
              canPlaceVillage(vertex.id, gameState.verticesOccupiedBy || {}, boardSize);
            
            // Check if this vertex is valid for road placement
            const isValidForRoad = validRoadVertices.includes(vertex.id) && gameState.turnState.step !== 'free_upgrade_selection';

            // Check if this vertex is valid for estate upgrade
            const isValidForEstate = currentPlayer?.isHuman &&
              gameState.turnState.step === 'place_estate_gameplay' &&
              gameState.turnState.currentPlayerId === currentPlayer.id &&
              village &&
              village.playerId === currentPlayer.id &&
              village.type === 'settlement';

            // Check if this vertex is valid for free upgrade
            const isValidForFreeUpgrade = currentPlayer?.isHuman &&
              gameState.turnState.step === 'free_upgrade_selection' &&
              validRoadVertices.includes(vertex.id);

            // Check if this vertex is currently selected
            const isSelected = selectedVertex === vertex.id;
            
            // Calculate icon diameter using the scaling formula
            const vertexCircleDiameter = vertexRadius * 2;
            const iconDiameter = Math.max(50, Math.min(90, vertexCircleDiameter * 3.3)); // clamp(vertexCircleDiameter * 3.3, min=50px, max=90px) - 50% increase
            const iconFontSize = iconDiameter * 0.88; // Icon size relative to diameter (increased by 10% from 0.8 to 0.88)
            
            // Calculate click area radius (larger for easier clicking)
            const clickRadius = Math.max(vertexRadius * 2, 30);
            
            return (
              <g key={`vertex-${vertex.id || index}`}>
                {/* Click area - invisible but larger for easier clicking */}
                {(isValidForVillage || (isValidForRoad && onVertexClick) || (isValidForEstate && onVertexClick) || (isValidForFreeUpgrade && onVertexClick)) && (
                  <circle
                    cx={pos.x}
                    cy={pos.y}
                    r={Math.max(25, vertexRadius * 1.5)}
                    fill="transparent"
                    style={{ cursor: 'pointer' }}
                    onClick={(e) => {
                      console.log('DEBUG: Click area clicked for vertex:', vertex.id, 'isValidForVillage:', isValidForVillage, 'isValidForRoad:', isValidForRoad, 'isValidForEstate:', isValidForEstate, 'isValidForFreeUpgrade:', isValidForFreeUpgrade);
                      console.log('DEBUG: onVertexClick exists:', !!onVertexClick);
                      console.log('DEBUG: Current turn step:', gameState?.turnState?.step);
                      e.stopPropagation();
                      onVertexClick?.(vertex.id);
                    }}
                  />
                )}
                
                {/* Visible click area for valid villages - solid circle */}
                {isValidForVillage && (
                  <circle
                    cx={pos.x}
                    cy={pos.y}
                    r={Math.max(20, vertexRadius * 1.2)}
                    fill="rgba(144, 238, 144, 0.3)"
                    stroke="rgba(0, 128, 0, 0.8)"
                    strokeWidth="2"
                    style={{ cursor: 'pointer' }}
                    onClick={(e) => {
                      console.log('DEBUG: Visible click area clicked for vertex:', vertex.id);
                      console.log('DEBUG: onVertexClick exists:', !!onVertexClick);
                      e.stopPropagation();
                      onVertexClick?.(vertex.id);
                    }}
                  />
                )}
                
                {/* Visible click area for valid road vertices - Step 1: Owned vertices (blue) */}
                {isValidForRoad && currentPlayer && onVertexClick && !firstRoadVertex && (
                  <circle
                    cx={pos.x}
                    cy={pos.y}
                    r={Math.max(35, vertexRadius * 2.2)}
                    fill="rgba(59, 130, 246, 0.3)"
                    stroke={getPlayerColorHex(currentPlayer.color)}
                    strokeWidth="3"
                    style={{ cursor: 'pointer' }}
                    opacity="0.8"
                    onClick={(e) => {
                      console.log('DEBUG: Road vertex (owned) click area clicked for vertex:', vertex.id);
                      console.log('DEBUG: onVertexClick exists:', !!onVertexClick);
                      console.log('DEBUG: Current turn step:', gameState?.turnState?.step);
                      e.stopPropagation();
                      onVertexClick?.(vertex.id);
                    }}
                  />
                )}

                {/* Highlight ring for valid road vertices - Step 1: Owned vertices (blue) */}
                {isValidForRoad && currentPlayer && !firstRoadVertex && (
                  <circle
                    cx={pos.x}
                    cy={pos.y}
                    r={vertexRadius * 2.5}
                    fill="none"
                    stroke={getPlayerColorHex(currentPlayer.color)}
                    strokeWidth="4"
                    strokeDasharray="8,4"
                    opacity="0.8"
                    style={{ pointerEvents: 'none' }}
                  />
                )}

                {/* Visible click area for valid road vertices - Step 2: Empty adjacent vertices (orange) */}
                {isValidForRoad && currentPlayer && onVertexClick && firstRoadVertex && (
                  <circle
                    cx={pos.x}
                    cy={pos.y}
                    r={Math.max(35, vertexRadius * 2.2)}
                    fill="rgba(255, 165, 0, 0.3)"
                    stroke={getPlayerColorHex(currentPlayer.color)}
                    strokeWidth="3"
                    style={{ cursor: 'pointer' }}
                    opacity="0.8"
                    onClick={(e) => {
                      console.log('DEBUG: Road vertex (empty adjacent) click area clicked for vertex:', vertex.id);
                      console.log('DEBUG: onVertexClick exists:', !!onVertexClick);
                      console.log('DEBUG: Current turn step:', gameState?.turnState?.step);
                      e.stopPropagation();
                      onVertexClick?.(vertex.id);
                    }}
                  />
                )}

                {/* Highlight ring for valid road vertices - Step 2: Empty adjacent vertices (orange) */}
                {isValidForRoad && currentPlayer && firstRoadVertex && (
                  <circle
                    cx={pos.x}
                    cy={pos.y}
                    r={vertexRadius * 2.5}
                    fill="none"
                    stroke="rgba(255, 165, 0, 1.0)"
                    strokeWidth="4"
                    strokeDasharray="8,4"
                    opacity="0.9"
                    style={{ pointerEvents: 'none' }}
                  />
                )}

                {/* Visible click area for upgradeable villages (estate) */}
                {isValidForEstate && currentPlayer && onVertexClick && (
                  <circle
                    cx={pos.x}
                    cy={pos.y}
                    r={Math.max(35, vertexRadius * 2.2)}
                    fill="rgba(147, 51, 234, 0.2)"
                    stroke={getPlayerColorHex(currentPlayer.color)}
                    strokeWidth="2"
                    style={{ cursor: 'pointer' }}
                    opacity="0.8"
                    onClick={(e) => {
                      console.log('DEBUG: Estate upgrade click area clicked for vertex:', vertex.id);
                      console.log('DEBUG: onVertexClick exists:', !!onVertexClick);
                      console.log('DEBUG: Current turn step:', gameState?.turnState?.step);
                      e.stopPropagation();
                      onVertexClick?.(vertex.id);
                    }}
                  />
                )}

                {/* Highlight ring for upgradeable estates */}
                {isValidForEstate && currentPlayer && (
                  <circle
                    cx={pos.x}
                    cy={pos.y}
                    r={vertexRadius * 2.5}
                    fill="none"
                    stroke={getPlayerColorHex(currentPlayer.color)}
                    strokeWidth="4"
                    strokeDasharray="8,4"
                    opacity="0.8"
                    style={{ pointerEvents: 'none' }}
                  />
                )}

                {/* Visible click area for free upgrade villages */}
                {isValidForFreeUpgrade && currentPlayer && onVertexClick && (
                  <circle
                    cx={pos.x}
                    cy={pos.y}
                    r={Math.max(35, vertexRadius * 2.2)}
                    fill="rgba(251, 191, 36, 0.2)"
                    stroke={getPlayerColorHex(currentPlayer.color)}
                    strokeWidth="3"
                    style={{ cursor: 'pointer' }}
                    opacity="0.8"
                    onClick={(e) => {
                      console.log('DEBUG: Free upgrade click area clicked for vertex:', vertex.id);
                      console.log('DEBUG: onVertexClick exists:', !!onVertexClick);
                      console.log('DEBUG: Current turn step:', gameState?.turnState?.step);
                      e.stopPropagation();
                      onVertexClick?.(vertex.id);
                    }}
                  />
                )}

                {/* Highlight ring for free upgrade villages */}
                {isValidForFreeUpgrade && currentPlayer && (
                  <circle
                    cx={pos.x}
                    cy={pos.y}
                    r={vertexRadius * 2.5}
                    fill="none"
                    stroke="rgba(251, 191, 36, 1.0)"
                    strokeWidth="4"
                    strokeDasharray="8,4"
                    opacity="0.9"
                    style={{ pointerEvents: 'none' }}
                  />
                )}

                {/* First road vertex highlight (starting point) */}
                {firstRoadVertex === vertex.id && (
                  <circle
                    cx={pos.x}
                    cy={pos.y}
                    r={vertexRadius * 1.8}
                    fill="none"
                    stroke="#3B82F6"
                    strokeWidth="4"
                    opacity="1.0"
                  />
                )}

                {/* Selection highlight (ending point) */}
                {isSelected && (
                  <circle
                    cx={pos.x}
                    cy={pos.y}
                    r={vertexRadius * 1.8}
                    fill="none"
                    stroke="#FFD700"
                    strokeWidth="3"
                    opacity="0.9"
                  />
                )}
                
                {/* Base layer: Subtle white vertex circle background */}
                <circle
                  cx={pos.x}
                  cy={pos.y}
                  r={vertexRadius}
                  fill={isValidForVillage ? "rgba(144, 238, 144, 0.8)" : "rgba(255, 255, 255, 0.9)"}
                  stroke={isValidForVillage ? "rgba(0, 128, 0, 1.0)" : "rgba(0, 0, 0, 0.5)"}
                  strokeWidth="1"
                  style={(isValidForVillage || isValidForRoad || isValidForEstate || isValidForFreeUpgrade) && onVertexClick ? { cursor: 'pointer' } : {}}
                  onClick={(isValidForVillage || isValidForRoad || isValidForEstate || isValidForFreeUpgrade) && onVertexClick ? (e) => {
                    console.log('DEBUG: Base vertex circle clicked for vertex:', vertex.id, 'isValidForVillage:', isValidForVillage, 'isValidForRoad:', isValidForRoad, 'isValidForEstate:', isValidForEstate, 'isValidForFreeUpgrade:', isValidForFreeUpgrade);
                    e.stopPropagation();
                    onVertexClick(vertex.id);
                  } : undefined}
                />
                
                {/* Village/Estate icon layer: Render on top, centered at vertex coordinate */}
                {villagePlayer && (
                  <>
                    {upgradingVillages.has(vertex.id) ? (
                      <>
                        <text
                          x={pos.x}
                          y={pos.y + iconFontSize * 0.2}
                          textAnchor="middle"
                          fontSize={iconFontSize}
                          fill={getPlayerColorHex(villagePlayer.color)}
                          fontWeight="bold"
                          stroke={getPlayerColorHex(villagePlayer.color)}
                          strokeWidth="3"
                          style={{
                            pointerEvents: 'none',
                            animation: 'village-dissolve-out 0.26s ease-out forwards'
                          }}
                        >
                          ⌂
                        </text>
                        <text
                          x={pos.x}
                          y={pos.y + iconFontSize * 0.2}
                          textAnchor="middle"
                          fontSize={iconFontSize}
                          fill={getPlayerColorHex(villagePlayer.color)}
                          fontWeight="bold"
                          stroke={getPlayerColorHex(villagePlayer.color)}
                          strokeWidth="3"
                          style={{
                            pointerEvents: 'none',
                            animation: 'estate-dissolve-in 0.39s ease-out 0.26s forwards',
                            opacity: 0
                          }}
                        >
                          ⛫
                        </text>
                      </>
                    ) : (
                      <text
                        x={pos.x}
                        y={pos.y + iconFontSize * 0.2}
                        textAnchor="middle"
                        fontSize={iconFontSize}
                        fill={getPlayerColorHex(villagePlayer.color)}
                        fontWeight="bold"
                        stroke={getPlayerColorHex(villagePlayer.color)}
                        strokeWidth="3"
                        style={{
                          cursor: (isValidForEstate || isValidForFreeUpgrade) && onVertexClick ? 'pointer' : undefined,
                          pointerEvents: (isValidForEstate || isValidForFreeUpgrade) && onVertexClick ? 'auto' : 'none',
                          ...(animatingVillages.has(vertex.id) ? {
                            animation: 'village-dissolve-in 0.39s ease-out forwards'
                          } : {})
                        }}
                        onClick={(isValidForEstate || isValidForFreeUpgrade) && onVertexClick ? (e) => {
                          console.log('DEBUG: Village icon clicked for vertex:', vertex.id);
                          e.stopPropagation();
                          onVertexClick(vertex.id);
                        } : undefined}
                      >
                        {village.type === 'city' ? '⛫' : '⌂'}
                      </text>
                    )}
                  </>
                )}
                
                {/* Top layer: Vertex number - always visible and centered on top of icon */}
                <text
                  x={pos.x}
                  y={pos.y + fontSize * 0.35}
                  textAnchor="middle"
                  fontSize={fontSize}
                  fill="#000000"
                  fontWeight="bold"
                  stroke="#FFFFFF"
                  strokeWidth="3"
                  paintOrder="stroke fill"
                  style={(isValidForEstate || isValidForFreeUpgrade) && onVertexClick ? { cursor: 'pointer', pointerEvents: 'auto', userSelect: 'none' } : { pointerEvents: 'none', userSelect: 'none' }}
                  onClick={(isValidForEstate || isValidForFreeUpgrade) && onVertexClick ? (e) => {
                    console.log('DEBUG: Vertex number clicked for vertex:', vertex.id);
                    e.stopPropagation();
                    onVertexClick(vertex.id);
                  } : undefined}
                >
                  {vertex.id}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
};