import React from 'react';
import { Route, Coins } from 'lucide-react';

export function BuildingPriceGuide() {
  const buildings = [
    {
      name: 'Road',
      icon: 'route',
      costs: [
        { resource: 'Clay', count: 1 },
        { resource: 'Lumber', count: 1 },
      ],
    },
    {
      name: 'Village',
      icon: 'house',
      costs: [
        { resource: 'Clay', count: 1 },
        { resource: 'Lumber', count: 1 },
        { resource: 'Grain', count: 1 },
        { resource: 'Fabric', count: 1 },
      ],
    },
    {
      name: 'Estate',
      icon: 'castle',
      costs: [
        { resource: 'Grain', count: 2 },
        { resource: 'Mineral', count: 3 },
      ],
    },
    {
      name: 'Dev Card',
      icon: 'coins',
      costs: [
        { resource: 'Grain', count: 1 },
        { resource: 'Fabric', count: 1 },
        { resource: 'Mineral', count: 1 },
      ],
    },
  ];

  const resourceImages: Record<string, string> = {
    Clay: '/Clay new.jpg',
    Lumber: '/Lumber new.jpg',
    Grain: '/Grain new.jpg',
    Fabric: '/Fabric new.jpg',
    Mineral: '/Mineral new.jpg',
  };

  const resourceLetters: Record<string, string> = {
    Clay: 'C',
    Lumber: 'L',
    Grain: 'G',
    Fabric: 'F',
    Mineral: 'M',
  };

  const renderIcon = (iconType: string) => {
    if (iconType === 'route') {
      return <Route className="w-4 h-4 text-gray-700" />;
    } else if (iconType === 'house') {
      return <span className="text-sm text-gray-700">⌂</span>;
    } else if (iconType === 'castle') {
      return <span className="text-sm text-gray-700">⛫</span>;
    } else if (iconType === 'coins') {
      return <Coins className="w-4 h-4 text-gray-700" />;
    }
    return null;
  };

  return (
    <div className="card flex flex-col" style={{ height: '100%' }}>
      <h3 className="text-base font-bold text-gray-800 mb-3">Building Costs</h3>
      <div className="grid grid-cols-2 gap-x-3 gap-y-2">
        {buildings.map((building) => (
          <div key={building.name} className="flex items-center gap-1.5">
            <div className="flex items-center gap-1.5 min-w-[80px]">
              {renderIcon(building.icon)}
              <div className="text-xs font-semibold text-gray-800">
                {building.name}:
              </div>
            </div>
            <div className="flex items-center gap-1">
              {building.costs.map((cost, idx) => (
                <React.Fragment key={idx}>
                  {Array.from({ length: cost.count }).map((_, i) => (
                    <div
                      key={i}
                      className="relative w-6 h-6 rounded border border-gray-300 overflow-hidden flex-shrink-0"
                      title={cost.resource}
                    >
                      <img
                        src={resourceImages[cost.resource]}
                        alt={cost.resource}
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute top-0 left-0 right-0 flex justify-center">
                        <span className="text-[10px] font-bold text-white bg-black bg-opacity-60 px-0.5 leading-tight">
                          {resourceLetters[cost.resource]}
                        </span>
                      </div>
                    </div>
                  ))}
                </React.Fragment>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
