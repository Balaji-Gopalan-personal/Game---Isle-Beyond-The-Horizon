import { runSetupPhaseTest } from './engine/setupPhaseTest';
import { BoardSize } from './data/boardConfigs';

console.log('======================================');
console.log('   GAME ENGINE TEST HARNESS');
console.log('======================================\n');

console.log('Testing refactored game engine modules...\n');

const boardSizes: BoardSize[] = ['tiny', 'small', 'standard'];

for (const size of boardSizes) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Testing board size: ${size.toUpperCase()}`);
  console.log('='.repeat(60));

  try {
    runSetupPhaseTest(size);
    console.log(`✓ ${size} board test completed successfully`);
  } catch (error) {
    console.error(`✗ ${size} board test failed:`, error);
  }
}

console.log('\n======================================');
console.log('   TEST HARNESS COMPLETE');
console.log('======================================');

export { runSetupPhaseTest };
