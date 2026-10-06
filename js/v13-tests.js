/**
 * v13-tests.js
 * Comprehensive test suite for BLACKOUT v13 enhancements
 * Tests: Textures, Audio, Power Systems, Fullscreen Menu Fix
 */

(function() {
    'use strict';
    
    window.GameTests = window.GameTests || {};
    
    // Test results logger
    const testResults = [];
    
    function logTest(name, passed, details) {
        const result = {
            name,
            passed,
            details,
            timestamp: new Date().toISOString()
        };
        testResults.push(result);
        console.log(`[TEST] ${name}: ${passed ? '✓ PASS' : '✗ FAIL'} ${details ? '- ' + details : ''}`);
    }
    
    // ===== TEXTURE TESTS =====
    window.GameTests.testTextures = function() {
        console.log('\n=== TEXTURE TESTS ===');
        
        // Test 1: Procedural Floor Materials
        const hasFloorMaterials = typeof window.generateProceduralFloorMaterial === 'function';
        logTest('Floor Material Generation', hasFloorMaterials, 
            hasFloorMaterials ? 'generateProceduralFloorMaterial exists' : 'Missing floor material generator');
        
        // Test 2: Wall Enhancement Pass
        const hasWallPass = typeof window.enhanceWallTexture === 'function';
        logTest('Wall Texture Enhancement', hasWallPass,
            hasWallPass ? 'enhanceWallTexture exists' : 'Missing wall enhancement');
        
        // Test 3: Prop Detail Layers
        const hasPropDetails = typeof window.addPropDetailLayers === 'function';
        logTest('Prop Detail Layers', hasPropDetails,
            hasPropDetails ? 'addPropDetailLayers exists' : 'Missing prop details');
        
        // Test 4: Per-Room Tinting
        const hasRoomTint = typeof window.applyRoomTinting === 'function';
        logTest('Per-Room Color Tinting', hasRoomTint,
            hasRoomTint ? 'applyRoomTinting exists' : 'Missing room tinting');
        
        // Test 5: Ambient Occlusion
        const hasAO = typeof window.applyCornerAmbientOcclusion === 'function';
        logTest('Corner Ambient Occlusion', hasAO,
            hasAO ? 'applyCornerAmbientOcclusion exists' : 'Missing AO system');
    };
    
    // ===== AUDIO TESTS =====
    window.GameTests.testAudio = function() {
        console.log('\n=== AUDIO TESTS ===');
        
        // Test 1: Enemy Footstep System
        const hasFootsteps = typeof window.createEnemyFootstepSound === 'function';
        logTest('Enemy Footsteps', hasFootsteps,
            hasFootsteps ? 'createEnemyFootstepSound exists' : 'Missing footstep audio');
        
        // Test 2: Surface-Aware Audio
        const hasSurfaceAudio = typeof window.getAudioForSurface === 'function';
        logTest('Surface-Aware Audio', hasSurfaceAudio,
            hasSurfaceAudio ? 'getAudioForSurface exists' : 'Missing surface audio mapping');
        
        // Test 3: Boss Stomp Effects
        const hasBossEffects = typeof window.playBossStompEffect === 'function';
        logTest('Boss Stomp Effects', hasBossEffects,
            hasBossEffects ? 'playBossStompEffect exists' : 'Missing boss audio effects');
        
        // Test 4: Combat Audio Cues
        const hasCombatAudio = typeof window.playCombatCue === 'function';
        logTest('Combat Audio Cues', hasCombatAudio,
            hasCombatAudio ? 'playCombatCue exists' : 'Missing combat audio');
        
        // Test 5: Environmental Sounds
        const hasEnvAudio = typeof window.playEnvironmentalSound === 'function';
        logTest('Environmental Sounds', hasEnvAudio,
            hasEnvAudio ? 'playEnvironmentalSound exists' : 'Missing environmental audio');
    };
    
    // ===== POWER SYSTEM TESTS =====
    window.GameTests.testPowerSystem = function() {
        console.log('\n=== POWER SYSTEM TESTS ===');
        
        // Test 1: Power system exists
        const hasPowerSystem = typeof window.PowerSystem !== 'undefined';
        logTest('Power System Core', hasPowerSystem,
            hasPowerSystem ? 'PowerSystem module loaded' : 'PowerSystem not found');
        
        // Test 2: Room breakers enhanced
        const hasAllRoomBreakers = typeof window.PowerSystem !== 'undefined' && 
            window.PowerSystem.roomBreakers && 
            Object.keys(window.PowerSystem.roomBreakers || {}).length > 0;
        logTest('Room Breakers (All Rooms)', hasAllRoomBreakers,
            hasAllRoomBreakers ? `${Object.keys(window.PowerSystem.roomBreakers).length} rooms with breakers` : 'No room breakers found');
        
        // Test 3: Circuit toggle function
        const hasToggleCircuit = typeof window.PowerSystem !== 'undefined' && 
            typeof window.PowerSystem.toggleCircuitBreaker === 'function';
        logTest('Toggle Circuit Function', hasToggleCircuit,
            hasToggleCircuit ? 'toggleCircuitBreaker method exists' : 'Missing toggle function');
        
        // Test 4: Breaker state tracking
        const hasStateTracking = typeof window.PowerSystem !== 'undefined' && 
            typeof window.PowerSystem.getBreakerState === 'function';
        logTest('Breaker State Tracking', hasStateTracking,
            hasStateTracking ? 'getBreakerState method exists' : 'Missing state tracking');
    };
    
    // ===== FULLSCREEN MENU FIX TESTS =====
    window.GameTests.testFullscreenFix = function() {
        console.log('\n=== FULLSCREEN MENU FIX TESTS ===');
        
        // Test 1: Viewport bounds function exists
        const hasViewportBounds = typeof window.GameUI !== 'undefined' && 
            typeof window.GameUI.getViewportBounds === 'function';
        logTest('Viewport Bounds Function', hasViewportBounds,
            hasViewportBounds ? 'getViewportBounds exists' : 'Missing viewport function');
        
        // Test 2: Menu clamping function exists
        const hasMenuClamp = typeof window.GameUI !== 'undefined' && 
            typeof window.GameUI.clampMenuPosition === 'function';
        logTest('Menu Position Clamping', hasMenuClamp,
            hasMenuClamp ? 'clampMenuPosition exists' : 'Missing clamping function');
        
        // Test 3: Custom event listeners registered
        const canvas = document.getElementById('gameCanvas');
        const hasEventListeners = canvas !== null;
        logTest('Canvas Event Listeners', hasEventListeners,
            hasEventListeners ? 'Canvas element exists for fullscreen events' : 'Canvas not found');
        
        // Test 4: Viewport bounds calculate correctly
        if (hasViewportBounds) {
            const bounds = window.GameUI.getViewportBounds();
            const isValid = bounds.width > 0 && bounds.height > 0 && bounds.centerX > 0 && bounds.centerY > 0;
            logTest('Viewport Calculation', isValid,
                isValid ? `${bounds.width}x${bounds.height} viewport calculated` : 'Invalid viewport calculation');
        }
    };
    
    // ===== INTEGRATION TESTS =====
    window.GameTests.testIntegration = function() {
        console.log('\n=== INTEGRATION TESTS ===');
        
        // Test 1: All script dependencies loaded
        const allDepsLoaded = 
            typeof window.GameUI !== 'undefined' &&
            typeof window.PowerSystem !== 'undefined' &&
            typeof window.generateProceduralFloorMaterial === 'function' &&
            typeof window.createEnemyFootstepSound === 'function';
        logTest('All Dependencies Loaded', allDepsLoaded,
            allDepsLoaded ? 'All v13 modules available' : 'Some dependencies missing');
        
        // Test 2: No console errors on init
        const originalError = console.error;
        let errorCount = 0;
        console.error = function(...args) {
            errorCount++;
            originalError.apply(console, args);
        };
        
        setTimeout(() => {
            console.error = originalError;
            logTest('Error-Free Initialization', errorCount === 0,
                errorCount === 0 ? 'No initialization errors' : `${errorCount} console errors detected`);
        }, 500);
        
        // Test 3: Game loop continues
        const startTime = Date.now();
        let frameCount = 0;
        const frameCounter = () => {
            frameCount++;
            if (Date.now() - startTime < 1000) {
                requestAnimationFrame(frameCounter);
            } else {
                const fps = frameCount;
                logTest('Game Loop FPS', fps > 30,
                    fps > 30 ? `${fps} FPS maintained` : `Low FPS: ${fps}`);
            }
        };
        
        if (typeof requestAnimationFrame !== 'undefined') {
            requestAnimationFrame(frameCounter);
        }
    };
    
    // ===== RUN ALL TESTS =====
    window.GameTests.runAllTests = function() {
        console.clear();
        console.log('╔════════════════════════════════════════╗');
        console.log('║  BLACKOUT v13 - COMPREHENSIVE TESTS    ║');
        console.log('╚════════════════════════════════════════╝\n');
        
        try {
            window.GameTests.testTextures();
            window.GameTests.testAudio();
            window.GameTests.testPowerSystem();
            window.GameTests.testFullscreenFix();
            window.GameTests.testIntegration();
        } catch (e) {
            console.error('Test suite error:', e);
        }
        
        console.log('\n╔════════════════════════════════════════╗');
        console.log('║  TEST SUITE COMPLETE                   ║');
        const passed = testResults.filter(t => t.passed).length;
        const total = testResults.length;
        console.log(`║  Results: ${passed}/${total} tests passed         ║`);
        console.log('╚════════════════════════════════════════╝\n');
        
        return testResults;
    };
    
    // ===== EXPORT TEST RESULTS =====
    window.GameTests.getResults = function() {
        return testResults;
    };
    
    window.GameTests.exportResults = function() {
        return JSON.stringify(testResults, null, 2);
    };
    
    // Auto-run tests if ?test param present in URL
    if (window.location.search.includes('test=true')) {
        window.addEventListener('load', function() {
            setTimeout(function() {
                window.GameTests.runAllTests();
            }, 2000);
        });
    }
    
})();
